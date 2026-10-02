"""Export-Endpunkte (TASK-API-006, design.md D5).

- POST   /api/exports            Export starten (202), Schnappschuss des Projekts
- GET    /api/exports            alle bekannten Exporte
- GET    /api/exports/{id}       Status und Fortschritt (Frontend fragt alle 500 ms)
- GET    /api/exports/{id}/file  fertige MP4 als Download
- DELETE /api/exports/{id}       laufenden Export abbrechen bzw. beendeten löschen (204)
"""

import asyncio
import unicodedata
from typing import Annotated, Any, cast
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse

from mmy_backend.errors import ApiValidationResponse, api_exception, error_response
from mmy_backend.exports import (
    FILE_EXTENSION,
    ExportBusy,
    ExportJob,
    ExportListResponse,
    ExportManager,
    ExportRequest,
    is_export_id,
)
from mmy_backend.media import MediaStore
from mmy_backend.project import Project, ProjectStore

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: error_response("Unknown or deleted export (`export.notFound`)")
}

router = APIRouter(prefix="/exports", tags=["exports"])


def get_export_manager(request: Request) -> ExportManager:
    return cast(ExportManager, request.app.state.exports)


def get_project_store(request: Request) -> ProjectStore:
    return cast(ProjectStore, request.app.state.project)


def get_media_store(request: Request) -> MediaStore:
    return cast(MediaStore, request.app.state.media)


def _not_found(export_id: str) -> HTTPException:
    return api_exception(status.HTTP_404_NOT_FOUND, "export.notFound", exportId=export_id)


def _check_exportable(project: Project, media: MediaStore) -> None:
    """422 if the project is empty or refers to missing media."""
    if not project.slides:
        raise api_exception(status.HTTP_422_UNPROCESSABLE_CONTENT, "export.emptyProject")
    known = {item.id for item in media.list()}
    missing = [
        (index + 1, slide.media_id)
        for index, slide in enumerate(project.slides)
        if slide.media_id not in known
    ]
    if missing:
        raise api_exception(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "export.missingMedia",
            count=len(missing),
            slides=", ".join(str(position) for position, _ in missing),
            mediaIds=", ".join(dict.fromkeys(media_id for _, media_id in missing)),
        )


_TRANSLITERATION = str.maketrans(
    {"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"}
)


def ascii_file_name(name: str) -> str:
    """ASCII-Ersatz für `filename=`: Umlaute und ß umschreiben, Akzente weglassen,
    übrige Nicht-ASCII-Zeichen (und `"`/`\\`) durch `_` ersetzen."""
    composed = unicodedata.normalize("NFC", name)
    decomposed = unicodedata.normalize("NFKD", composed.translate(_TRANSLITERATION))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return "".join(ch if ch.isascii() and ch not in '"\\' else "_" for ch in stripped)


def content_disposition(file_name: str) -> str:
    """`attachment` mit ASCII-Ersatzname und exaktem RFC-5987-Namen (UTF-8)."""
    full = file_name + FILE_EXTENSION
    fallback = ascii_file_name(file_name).strip() or "Film"
    return (
        f'attachment; filename="{fallback}{FILE_EXTENSION}"; '
        f"filename*=UTF-8''{quote(full, safe='')}"
    )


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        status.HTTP_409_CONFLICT: error_response("An export is already running (`export.busy`)"),
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "model": ApiValidationResponse,
            "description": (
                "Empty project (`export.emptyProject`), missing media (`export.missingMedia`) "
                "or FastAPI's native list (file name rules carry `export.fileName.*` as `type`)"
            ),
        },
    },
)
async def start_export(
    body: ExportRequest,
    exports: Annotated[ExportManager, Depends(get_export_manager)],
    projects: Annotated[ProjectStore, Depends(get_project_store)],
    media: Annotated[MediaStore, Depends(get_media_store)],
) -> ExportJob:
    """Startet einen Export mit dem gespeicherten Projekt zum jetzigen Zeitpunkt.

    Spätere Änderungen am Projekt wirken sich nicht auf diesen Export aus.
    Höchstens ein Export läuft gleichzeitig; ein zweiter Start ergibt 409.
    """
    project = projects.get()
    _check_exportable(project, media)
    try:
        return exports.start(project, body.profile, body.file_name)
    except ExportBusy as exc:
        raise api_exception(status.HTTP_409_CONFLICT, "export.busy", exportId=exc.job.id) from exc


@router.get("")
def list_exports(
    exports: Annotated[ExportManager, Depends(get_export_manager)],
) -> ExportListResponse:
    """Alle bekannten Exporte (seit dem Start des Backends), älteste zuerst."""
    return ExportListResponse(items=exports.list())


@router.get("/{export_id}", responses=_NOT_FOUND)
def get_export(
    export_id: str, exports: Annotated[ExportManager, Depends(get_export_manager)]
) -> ExportJob:
    """Status (`queued`, `running`, `done`, `failed`, `cancelled`), Fortschritt und Fehler."""
    job = exports.get(export_id) if is_export_id(export_id) else None
    if job is None:
        raise _not_found(export_id)
    return job


@router.get(
    "/{export_id}/file",
    response_class=FileResponse,
    responses={
        status.HTTP_200_OK: {"content": {"video/mp4": {}}, "description": "Fertiger Film (MP4)"},
        status.HTTP_409_CONFLICT: error_response("The export is not done (`export.notReady`)"),
        **_NOT_FOUND,
    },
)
def get_export_file(
    export_id: str, exports: Annotated[ExportManager, Depends(get_export_manager)]
) -> Any:
    """Die fertige MP4 als Download mit dem gewünschten Dateinamen (`<fileName>.mp4`).

    Solange der Export nicht `done` ist, antwortet der Server mit 409 und dem
    Status; eine unvollständige Datei wird nie ausgeliefert.
    """
    job = exports.get(export_id) if is_export_id(export_id) else None
    if job is None:
        raise _not_found(export_id)
    path = exports.file_path(export_id)
    if path is None:
        raise api_exception(status.HTTP_409_CONFLICT, "export.notReady", status=job.status.value)
    if not path.is_file():
        raise _not_found(export_id)
    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Content-Disposition": content_disposition(job.file_name)},
    )


@router.delete("/{export_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND)
async def delete_export(
    export_id: str, exports: Annotated[ExportManager, Depends(get_export_manager)]
) -> Response:
    """Bricht einen laufenden Export ab bzw. löscht einen beendeten.

    - `queued`/`running`: Der Export wird abgebrochen (FFmpeg beendet, Teildatei
      gelöscht); die Antwort kommt erst danach. Der Job bleibt als `cancelled`
      abfragbar, ohne Datei.
    - `done`/`failed`/`cancelled`: Datei und Job werden gelöscht; danach 404.
    """
    if not is_export_id(export_id):
        raise _not_found(export_id)
    result = await asyncio.to_thread(exports.cancel, export_id)
    if result is None:
        raise _not_found(export_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
