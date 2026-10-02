"""GET/PUT /api/project - das eine Projekt laden und speichern (TASK-API-004)."""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute

from mmy_backend.catalog import TransitionCatalog
from mmy_backend.media import MediaStore
from mmy_backend.project import (
    Project,
    ProjectStore,
    ProjectValidationError,
    translate_validation_errors,
)


class _GermanValidationRoute(APIRoute):
    """Liefert Strukturfehler des Projekts als 422 mit deutschen Meldungen."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def route_handler(request: Request) -> Response:
            try:
                return await handler(request)
            except RequestValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=translate_validation_errors(exc.errors(), exc.body),
                ) from exc

        return route_handler


router = APIRouter(prefix="/project", tags=["project"], route_class=_GermanValidationRoute)


def get_project_store(request: Request) -> ProjectStore:
    return cast(ProjectStore, request.app.state.project)


def get_media_store(request: Request) -> MediaStore:
    return cast(MediaStore, request.app.state.media)


def get_catalog(request: Request) -> TransitionCatalog:
    return cast(TransitionCatalog, request.app.state.catalog)


@router.get("")
def get_project(store: Annotated[ProjectStore, Depends(get_project_store)]) -> Project:
    """Das gespeicherte Projekt; ohne Datei das leere Projekt."""
    return store.get()


@router.put("")
async def put_project(
    project: Project,
    store: Annotated[ProjectStore, Depends(get_project_store)],
    media: Annotated[MediaStore, Depends(get_media_store)],
    catalog: Annotated[TransitionCatalog, Depends(get_catalog)],
) -> Project:
    """Ersetzt das Projekt. Bei 422 bleibt der gespeicherte Stand unverändert."""
    try:
        return await store.save(
            project,
            media_ids={m.id for m in media.list()},
            transition_ids={t.id for t in catalog.transitions},
        )
    except ProjectValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.issues
        ) from exc
