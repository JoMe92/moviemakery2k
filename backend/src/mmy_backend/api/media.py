"""Medien-Endpunkte (TASK-API-002, TASK-API-003).

- POST   /api/media                 Bilder importieren, Ergebnis je Datei
- GET    /api/media                 Sammlung in Importreihenfolge
- GET    /api/media/{id}/thumbnail  Thumbnail (JPEG, immutable)
- GET    /api/media/{id}/preview    Vorschaubild (JPEG, immutable)
- DELETE /api/media/{id}            Medium löschen, Kaskade ins Projekt
"""

from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from mmy_backend.errors import api_exception, error_response
from mmy_backend.media import (
    MAX_FILES_PER_REQUEST,
    MediaListResponse,
    MediaStore,
    MediaUploadResponse,
    MediaUploadResult,
    MediaUploadSuccess,
)
from mmy_backend.project import Project, ProjectStore

# Abgeleitete Bilder ändern sich nie (neue Datei = neue ID), design.md D7.
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


@router.get("")
def list_media(store: Annotated[MediaStore, Depends(get_media_store)]) -> MediaListResponse:
    """Alle importierten Medien in Importreihenfolge."""
    return MediaListResponse(items=store.list())


def _not_found(media_id: str) -> HTTPException:
    return api_exception(status.HTTP_404_NOT_FOUND, "media.notFound", mediaId=media_id)


def _image_response(store: MediaStore, media_id: str, kind: Literal["thumbnail", "preview"]) -> Any:
    # get() prüft das ID-Format; erst danach wird ein Pfad gebaut.
    if store.get(media_id) is None:
        raise _not_found(media_id)
    path = store.item_dir(media_id) / _IMAGE_FILES[kind]
    if not path.is_file():
        raise _not_found(media_id)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": IMMUTABLE_CACHE})


_IMAGE_RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_200_OK: {"content": {"image/jpeg": {}}, "description": "JPEG-Bild"},
    **_NOT_FOUND,
}


@router.get("/{media_id}/thumbnail", response_class=FileResponse, responses=_IMAGE_RESPONSES)
def get_thumbnail(media_id: str, store: Annotated[MediaStore, Depends(get_media_store)]) -> Any:
    """Thumbnail (JPEG, passt in 160x120) mit `Cache-Control: immutable`."""
    return _image_response(store, media_id, "thumbnail")


@router.get("/{media_id}/preview", response_class=FileResponse, responses=_IMAGE_RESPONSES)
def get_preview(media_id: str, store: Annotated[MediaStore, Depends(get_media_store)]) -> Any:
    """Vorschaubild (JPEG, längste Kante <= 1920) mit `Cache-Control: immutable`."""
    return _image_response(store, media_id, "preview")


@router.delete("/{media_id}", responses=_NOT_FOUND)
async def delete_media(
    media_id: str,
    store: Annotated[MediaStore, Depends(get_media_store)],
    projects: Annotated[ProjectStore, Depends(get_project_store)],
) -> MediaDeleteResponse:
    """Löscht ein Medium samt Dateien und entfernt es aus dem Projekt (Kaskade).

    Alle Elemente des Bildstreifens mit diesem Medium entfallen samt ihrer
    eingehenden Übergänge; das neue erste Element hat keinen Übergang.

    Antwort ist 200 mit dem aktualisierten Projekt (statt 204), damit der
    Client seinen Stand ohne erneutes GET /api/project übernehmen kann.

    Reihenfolge: erst aus dem Medienspeicher, dann aus dem Projekt. Ein
    gleichzeitiges PUT /api/project prüft gegen den Medienspeicher und kann
    die ID danach nicht wieder einfügen.
    """
    if not await store.remove(media_id):
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
    files: Annotated[list[UploadFile], File(description="Bilddateien (JPEG, PNG, WebP)")],
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
