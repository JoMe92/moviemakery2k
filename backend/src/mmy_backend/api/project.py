"""GET/PUT /api/project - load and save the one project (TASK-API-004)."""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Request, status

from mmy_backend.catalog import TransitionCatalog
from mmy_backend.errors import ProjectValidationResponse
from mmy_backend.media import MediaStore, VideoItem
from mmy_backend.project import Project, ProjectStore, ProjectValidationError

router = APIRouter(prefix="/project", tags=["project"])


def get_project_store(request: Request) -> ProjectStore:
    return cast(ProjectStore, request.app.state.project)


def get_media_store(request: Request) -> MediaStore:
    return cast(MediaStore, request.app.state.media)


def get_catalog(request: Request) -> TransitionCatalog:
    return cast(TransitionCatalog, request.app.state.catalog)


@router.get("")
def get_project(store: Annotated[ProjectStore, Depends(get_project_store)]) -> Project:
    """The saved project; without a file, the empty project."""
    return store.get()


@router.put(
    "",
    responses={
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "model": ProjectValidationResponse,
            "description": (
                "Invalid project: `project.invalid` with one issue per broken reference, "
                "or FastAPI's native list (rule violations carry an error code as `type`)"
            ),
        }
    },
)
async def put_project(
    project: Project,
    store: Annotated[ProjectStore, Depends(get_project_store)],
    media: Annotated[MediaStore, Depends(get_media_store)],
    catalog: Annotated[TransitionCatalog, Depends(get_catalog)],
) -> Project:
    """Replaces the project. On 422 the saved state stays unchanged."""
    try:
        return await store.save(
            project,
            # Video can never be a project element (add-video-import, non-goal).
            media=[item for item in media.list() if not isinstance(item, VideoItem)],
            transition_ids={t.id for t in catalog.transitions},
        )
    except ProjectValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.api_error().model_dump(),
        ) from exc
