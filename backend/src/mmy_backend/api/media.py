"""POST /api/media - Bilder importieren, Ergebnis je Datei (TASK-API-002)."""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from starlette.concurrency import run_in_threadpool

from mmy_backend.media import (
    MAX_FILES_PER_REQUEST,
    MediaStore,
    MediaUploadResponse,
    MediaUploadResult,
    MediaUploadSuccess,
)

router = APIRouter(prefix="/media", tags=["media"])


def get_media_store(request: Request) -> MediaStore:
    return cast(MediaStore, request.app.state.media)


@router.post(
    "",
    responses={
        status.HTTP_413_CONTENT_TOO_LARGE: {
            "description": f"Mehr als {MAX_FILES_PER_REQUEST} Dateien in einer Anfrage"
        }
    },
)
async def upload_media(
    store: Annotated[MediaStore, Depends(get_media_store)],
    files: Annotated[list[UploadFile], File(description="Bilddateien (JPEG, PNG, WebP)")],
) -> MediaUploadResponse:
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=(
                f"Zu viele Dateien: höchstens {MAX_FILES_PER_REQUEST} pro Import "
                f"({len(files)} gesendet)."
            ),
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
