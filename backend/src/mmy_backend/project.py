"""Project model and project store (spec slideshow-project "Projektmodell", design.md D3 and D7).

`<data_dir>/project.json` contains a `Project` with `schemaVersion: 1`. Every
element (slide) refers to a medium and optionally carries its incoming
transition from the previous element; the first element has none.

Validation runs in two stages:

1. Structure (Pydantic): fields, types, ID format, duration ranges and 0.25 s grid.
2. References (`ProjectStore.save`): media and transition IDs exist, slide IDs
   are unique, the first element has no transition.

Errors of stage 1 are FastAPI's native 422 list; rule violations there carry an
error code as `type` (design.md D5). Errors of stage 2 are `ApiErrorIssue`s,
reported together as `project.invalid` (see `mmy_backend.errors`).

A corrupt `project.json` is not overwritten on load: the backend logs a
warning and returns the empty project. Only on the next successful save is the
old file renamed to `project.json.corrupt-<time>`, so that nothing is silently lost.
"""

import asyncio
import logging
import math
from collections.abc import Collection
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    Strict,
    ValidationError,
)
from pydantic.alias_generators import to_camel

from mmy_backend.errors import (
    ApiErrorIssue,
    ApiErrorWithIssues,
    ErrorCode,
    Params,
    ParamValue,
    error_message,
    validation_error,
)
from mmy_backend.storage import write_bytes_atomic

logger = logging.getLogger(__name__)

SCHEMA_VERSION: Literal[1] = 1
MAX_SLIDES = 1000
DURATION_STEP = 0.25
SLIDE_DURATION_MIN = 0.5
SLIDE_DURATION_MAX = 60.0
TRANSITION_DURATION_MIN = 0.25
TRANSITION_DURATION_MAX = 5.0
SLIDE_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"

_GRID_EPSILON = 1e-9


def on_grid(value: float, step: float = DURATION_STEP) -> bool:
    """Is `value` on the grid `step` (up to rounding errors)?"""
    steps = value / step
    return abs(steps - round(steps)) <= _GRID_EPSILON


def _duration_check(kind: str, low: float, high: float) -> AfterValidator:
    """Range and grid check; `kind` is the code prefix, e.g. `project.slideDuration`."""

    def check(value: float) -> float:
        if not math.isfinite(value) or not low <= value <= high:
            raise validation_error(f"{kind}.outOfRange", min=low, max=high, value=value)
        if not on_grid(value):
            raise validation_error(f"{kind}.offGrid", step=DURATION_STEP, value=value)
        return value

    return AfterValidator(check)


def _duration_schema(low: float, high: float) -> dict[str, Any]:
    return {"minimum": low, "maximum": high, "multipleOf": DURATION_STEP}


# Strict: JSON numbers (including integers) yes, booleans and strings no.
SlideDuration = Annotated[
    float,
    Strict(),
    _duration_check("project.slideDuration", SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    Field(
        description="Display duration in seconds",
        json_schema_extra=_duration_schema(SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    ),
]
TransitionDuration = Annotated[
    float,
    Strict(),
    _duration_check("project.transitionDuration", TRANSITION_DURATION_MIN, TRANSITION_DURATION_MAX),
    Field(
        description="Target duration of the transition in seconds",
        json_schema_extra=_duration_schema(TRANSITION_DURATION_MIN, TRANSITION_DURATION_MAX),
    ),
]


class _ProjectModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class TransitionRef(_ProjectModel):
    transition_id: str = Field(description="ID from the transition catalog")
    duration: TransitionDuration


class Slide(_ProjectModel):
    id: Annotated[
        str,
        Field(
            pattern=SLIDE_ID_PATTERN,
            description="Assigned by the client, unique within the project",
        ),
    ]
    media_id: str = Field(description="ID of a medium from /api/media")
    duration: SlideDuration
    transition_in: TransitionRef | None = Field(
        description="Incoming transition from the previous element; always null for the first"
    )


class Project(_ProjectModel):
    schema_version: Literal[1]
    slides: Annotated[list[Slide], Field(max_length=MAX_SLIDES)]


def empty_project() -> Project:
    return Project(schema_version=SCHEMA_VERSION, slides=[])


# --- Reference checks --------------------------------------------------------


class ProjectValidationError(Exception):
    """The project refers to something unknown or breaks a rule."""

    def __init__(self, issues: list[ApiErrorIssue]) -> None:
        super().__init__(" ".join(issue.message for issue in issues))
        self.issues = issues

    def api_error(self) -> ApiErrorWithIssues:
        """The `project.invalid` error collecting all issues."""
        params: Params = {"count": len(self.issues), "summary": str(self)}
        return ApiErrorWithIssues(
            code=ErrorCode.PROJECT_INVALID,
            params=params,
            message=error_message(ErrorCode.PROJECT_INVALID, params),
            issues=self.issues,
        )


def _issue(
    loc: tuple[str | int, ...], code: ErrorCode | str, **params: ParamValue
) -> ApiErrorIssue:
    return ApiErrorIssue(
        code=ErrorCode(code), params=params, message=error_message(code, params), loc=["body", *loc]
    )


def check_references(
    project: Project,
    media_ids: Collection[str],
    transition_ids: Collection[str],
) -> list[ApiErrorIssue]:
    """Checks the references of a structurally valid project; empty list = valid."""
    issues: list[ApiErrorIssue] = []
    seen: dict[str, int] = {}
    for index, slide in enumerate(project.slides):
        where: Params = {"slide": index + 1, "slideId": slide.id}
        if slide.id in seen:
            issues.append(
                _issue(
                    ("slides", index, "id"),
                    "project.slide.duplicateId",
                    **where,
                    firstSlide=seen[slide.id] + 1,
                )
            )
        else:
            seen[slide.id] = index
        if slide.media_id not in media_ids:
            issues.append(
                _issue(
                    ("slides", index, "mediaId"),
                    "project.slide.unknownMedia",
                    **where,
                    mediaId=slide.media_id,
                )
            )
        transition = slide.transition_in
        if transition is None:
            continue
        if index == 0:
            issues.append(
                _issue(
                    ("slides", index, "transitionIn"), "project.slide.firstHasTransition", **where
                )
            )
        if transition.transition_id not in transition_ids:
            issues.append(
                _issue(
                    ("slides", index, "transitionIn", "transitionId"),
                    "project.slide.unknownTransition",
                    **where,
                    transitionId=transition.transition_id,
                )
            )
    return issues


def remove_media_slides(project: Project, media_id: str) -> Project:
    """Removes all elements with `media_id` together with their incoming transitions.

    Afterwards the (new) first element no longer has a transition.
    """
    slides = [s for s in project.slides if s.media_id != media_id]
    if slides and slides[0].transition_in is not None:
        slides[0] = slides[0].model_copy(update={"transition_in": None})
    return project.model_copy(update={"slides": slides})


# --- Store -------------------------------------------------------------------


class ProjectStore:
    """The one project in the data directory; one instance per app (app.state.project)."""

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.project_file = data_dir / "project.json"
        self._lock = asyncio.Lock()
        self._corrupt = False
        self._project = self._read()

    def _read(self) -> Project:
        try:
            raw = self.project_file.read_bytes()
        except FileNotFoundError:
            return empty_project()
        try:
            return Project.model_validate_json(raw)
        except ValidationError as exc:
            logger.warning(
                "Project file %s is corrupt, starting with an empty project "
                "(the file is kept until the next save): %s",
                self.project_file,
                exc,
            )
            self._corrupt = True
            return empty_project()

    def get(self) -> Project:
        return self._project

    def _write(self, project: Project) -> None:
        if self._corrupt and self.project_file.exists():
            stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
            backup = self.project_file.with_name(f"{self.project_file.name}.corrupt-{stamp}")
            self.project_file.replace(backup)
            logger.warning("Corrupt project file backed up as %s", backup)
        write_bytes_atomic(self.project_file, project.model_dump_json(indent=2).encode())
        self._corrupt = False

    async def save(
        self,
        project: Project,
        *,
        media_ids: Collection[str],
        transition_ids: Collection[str],
    ) -> Project:
        """Checks the references and writes atomically; on errors everything stays unchanged."""
        async with self._lock:
            issues = check_references(project, media_ids, transition_ids)
            if issues:
                raise ProjectValidationError(issues)
            await asyncio.to_thread(self._write, project)
            self._project = project
            return project

    async def remove_media(self, media_id: str) -> Project:
        """Cascade when a medium is deleted (design.md D7); writes only on change."""
        async with self._lock:
            updated = remove_media_slides(self._project, media_id)
            if updated != self._project:
                await asyncio.to_thread(self._write, updated)
                self._project = updated
            return self._project
