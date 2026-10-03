"""Media endpoints (TASK-API-002, TASK-API-003).

- POST   /api/media                 import pictures and audio, one result per file
- GET    /api/media                 collection in import order
- GET    /api/media/{id}/thumbnail  thumbnail (JPEG, immutable)
- GET    /api/media/{id}/preview    preview image (JPEG, immutable)
- GET    /api/media/{id}/audio      audio preview version (AAC in M4A, immutable)
- GET    /api/media/{id}/peaks      waveform data (JSON, immutable)
- DELETE /api/media/{id}            delete a medium, cascading into the project
"""

from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from mmy_backend.errors import api_exception, error_response
from mmy_backend.exports import ExportManager
from mmy_backend.media import (
    MAX_FILES_PER_REQUEST,
    AudioItem,
    AudioPeaks,
    MediaListResponse,
    MediaStore,
    MediaUploadResponse,
    MediaUploadResult,
    MediaUploadSuccess,
)
from mmy_backend.project import Project, ProjectStore

# Derived files never change (new file = new ID), design.md D7 / add-music-track D2.
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"

_IMAGE_FILES: dict[str, str] = {"thumbnail": "thumb.jpg", "preview": "preview.jpg"}

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: error_response("Unknown or invalid media id (`media.notFound`)")
}

router = APIRouter(prefix="/media", tags=["media"])


class MediaDeleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    project: Project


def get_media_store(request: Request) -> MediaStore:
    return cast(MediaStore, request.app.state.media)


def get_project_store(request: Request) -> ProjectStore:
    return cast(ProjectStore, request.app.state.project)


def get_export_manager(request: Request) -> ExportManager:
    return cast(ExportManager, request.app.state.exports)


@router.get("")
def list_media(store: Annotated[MediaStore, Depends(get_media_store)]) -> MediaListResponse:
    """All imported media in import order."""
    return MediaListResponse(items=store.list())


def _not_found(media_id: str) -> HTTPException:
    return api_exception(status.HTTP_404_NOT_FOUND, "media.notFound", mediaId=media_id)


def _image_response(store: MediaStore, media_id: str, kind: Literal["thumbnail", "preview"]) -> Any:
    # get() checks the ID format; only then is a path built.
    if store.get(media_id) is None:
        raise _not_found(media_id)
    path = store.item_dir(media_id) / _IMAGE_FILES[kind]
    if not path.is_file():
        raise _not_found(media_id)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": IMMUTABLE_CACHE})


_IMAGE_RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_200_OK: {"content": {"image/jpeg": {}}, "description": "JPEG image"},
    **_NOT_FOUND,
}


@router.get("/{media_id}/thumbnail", response_class=FileResponse, responses=_IMAGE_RESPONSES)
def get_thumbnail(media_id: str, store: Annotated[MediaStore, Depends(get_media_store)]) -> Any:
    """Thumbnail (JPEG, fits into 160x120) with `Cache-Control: immutable`."""
    return _image_response(store, media_id, "thumbnail")


@router.get("/{media_id}/preview", response_class=FileResponse, responses=_IMAGE_RESPONSES)
def get_preview(media_id: str, store: Annotated[MediaStore, Depends(get_media_store)]) -> Any:
    """Preview image (JPEG, longest edge <= 1920) with `Cache-Control: immutable`."""
    return _image_response(store, media_id, "preview")


def _audio_file_response(store: MediaStore, media_id: str, filename: str, media_type: str) -> Any:
    # Images and unknown or malformed IDs are 404; get() checks the ID format first.
    if not isinstance(store.get(media_id), AudioItem):
        raise _not_found(media_id)
    path = store.item_dir(media_id) / filename
    if not path.is_file():
        raise _not_found(media_id)
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": IMMUTABLE_CACHE})


@router.get(
    "/{media_id}/audio",
    response_class=FileResponse,
    responses={
        status.HTTP_200_OK: {
            "content": {"audio/mp4": {}},
            "description": "AAC in M4A, 48 kHz, stereo",
        },
        **_NOT_FOUND,
    },
)
def get_audio(media_id: str, store: Annotated[MediaStore, Depends(get_media_store)]) -> Any:
    """Audio preview version (AAC in M4A, 48 kHz, stereo) with `Cache-Control: immutable`.

    404 for images as well as unknown IDs. Range requests are supported.
    """
    return _audio_file_response(store, media_id, "preview.m4a", "audio/mp4")


@router.get("/{media_id}/peaks", response_model=AudioPeaks, responses=_NOT_FOUND)
def get_peaks(media_id: str, store: Annotated[MediaStore, Depends(get_media_store)]) -> Any:
    """Waveform data (50 peaks per second, mono, 0..1) with `Cache-Control: immutable`.

    404 for images as well as unknown IDs.
    """
    return _audio_file_response(store, media_id, "peaks.json", "application/json")


@router.delete(
    "/{media_id}",
    responses={
        **_NOT_FOUND,
        status.HTTP_409_CONFLICT: error_response(
            "A queued or running export uses the medium (`media.inUseByExport`)"
        ),
    },
)
async def delete_media(
    media_id: str,
    store: Annotated[MediaStore, Depends(get_media_store)],
    projects: Annotated[ProjectStore, Depends(get_project_store)],
    exports: Annotated[ExportManager, Depends(get_export_manager)],
) -> MediaDeleteResponse:
    """Deletes a medium with its files and removes it from the project (cascade).

    All storyboard elements using this medium are dropped together with their
    incoming transitions; the new first element has no transition. All music
    clips using it are dropped as well (the following clips move up).

    The response is 200 with the updated project (instead of 204) so that the
    client can adopt its state without another GET /api/project.

    Order: first from the media store, then from the project. A concurrent
    PUT /api/project validates against the media store and therefore cannot
    re-insert the ID afterwards.

    While a `queued` or `running` export has the medium in its snapshot, the
    response is 409 (`media.inUseByExport`); medium, project and export stay
    unchanged (design.md D5).
    """

    def reject_if_exported() -> None:
        # Runs inside MediaStore.remove, atomically with the in-memory removal:
        # an export start (synchronous check + snapshot) cannot slip in between.
        export_id = exports.export_using_media(media_id)
        if export_id is not None:
            raise api_exception(
                status.HTTP_409_CONFLICT,
                "media.inUseByExport",
                mediaId=media_id,
                exportId=export_id,
            )

    if not await store.remove(media_id, guard=reject_if_exported):
        raise _not_found(media_id)
    project = await projects.remove_media(media_id)
    return MediaDeleteResponse(project=project)


@router.post(
    "",
    responses={
        status.HTTP_413_CONTENT_TOO_LARGE: error_response(
            f"More than {MAX_FILES_PER_REQUEST} files in one request (`media.tooManyFiles`)"
        )
    },
)
async def upload_media(
    store: Annotated[MediaStore, Depends(get_media_store)],
    files: Annotated[
        list[UploadFile],
        File(
            description="Images (JPEG, PNG, WebP), video (MP4/MOV, MKV/WebM; H.264, HEVC, "
            "VP9, AV1) and audio (MP3, WAV, M4A/AAC, OGG, FLAC)"
        ),
    ],
) -> MediaUploadResponse:
    if len(files) > MAX_FILES_PER_REQUEST:
        raise api_exception(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "media.tooManyFiles",
            max=MAX_FILES_PER_REQUEST,
            count=len(files),
        )
    results: list[MediaUploadResult] = []
    for upload in files:
        try:
            result = await run_in_threadpool(store.import_file, upload.file, upload.filename)
        finally:
            await upload.close()
        results.append(result)
    await store.add([r.item for r in results if isinstance(r, MediaUploadSuccess)])
    return MediaUploadResponse(items=results)
