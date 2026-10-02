"""Projektmodell und Projektspeicher (Spec "Projektmodell", design.md D3 und D7).

`<data_dir>/project.json` enthält ein `Project` mit `schemaVersion: 1`. Jedes
Element (Slide) verweist auf ein Medium und trägt optional seinen eingehenden
Übergang vom vorherigen Element; das erste Element hat keinen.

Die Prüfung läuft in zwei Stufen:

1. Struktur (Pydantic): Felder, Typen, ID-Format, Dauerbereiche und 0,25-s-Raster.
2. Bezüge (`ProjectStore.save`): Medien- und Übergangs-IDs existieren, Slide-IDs
   sind eindeutig, das erste Element hat keinen Übergang.

Errors of stage 1 are FastAPI's native 422 list; rule violations there carry an
error code as `type` (design.md D5). Errors of stage 2 are `ApiErrorIssue`s,
reported together as `project.invalid` (see `mmy_backend.errors`).

Eine beschädigte `project.json` wird beim Laden nicht überschrieben: Das Backend
protokolliert eine Warnung und liefert das leere Projekt. Erst beim nächsten
erfolgreichen Speichern wird die alte Datei nach `project.json.corrupt-<Zeit>`
umbenannt, damit nichts stillschweigend verloren geht.
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
    """Liegt `value` (bis auf Rundungsfehler) auf dem Raster `step`?"""
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


# Strict: JSON-Zahlen (auch Ganzzahlen) ja, Booleans und Strings nein.
SlideDuration = Annotated[
    float,
    Strict(),
    _duration_check("project.slideDuration", SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    Field(
        description="Anzeigedauer in Sekunden",
        json_schema_extra=_duration_schema(SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    ),
]
TransitionDuration = Annotated[
    float,
    Strict(),
    _duration_check("project.transitionDuration", TRANSITION_DURATION_MIN, TRANSITION_DURATION_MAX),
    Field(
        description="Solldauer des Übergangs in Sekunden",
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
    transition_id: str = Field(description="ID aus dem Übergangskatalog")
    duration: TransitionDuration


class Slide(_ProjectModel):
    id: Annotated[
        str,
        Field(
            pattern=SLIDE_ID_PATTERN,
            description="Vom Client vergeben, eindeutig im Projekt",
        ),
    ]
    media_id: str = Field(description="ID eines Mediums aus /api/media")
    duration: SlideDuration
    transition_in: TransitionRef | None = Field(
        description="Eingehender Übergang vom vorherigen Element; beim ersten immer null"
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
            code="project.invalid",
            params=params,
            message=error_message("project.invalid", params),
            issues=self.issues,
        )


def _issue(loc: tuple[str | int, ...], code: str, **params: ParamValue) -> ApiErrorIssue:
    return ApiErrorIssue(
        code=code, params=params, message=error_message(code, params), loc=["body", *loc]
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
    """Entfernt alle Elemente mit `media_id` samt eingehender Übergänge.

    Danach hat das (neue) erste Element keinen Übergang mehr.
    """
    slides = [s for s in project.slides if s.media_id != media_id]
    if slides and slides[0].transition_in is not None:
        slides[0] = slides[0].model_copy(update={"transition_in": None})
    return project.model_copy(update={"slides": slides})


# --- Speicher ----------------------------------------------------------------


class ProjectStore:
    """Das eine Projekt im Datenverzeichnis; eine Instanz pro App (app.state.project)."""

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
                "Projektdatei %s ist beschädigt, starte mit leerem Projekt "
                "(die Datei bleibt bis zum nächsten Speichern liegen): %s",
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
            logger.warning("Beschädigte Projektdatei gesichert als %s", backup)
        write_bytes_atomic(self.project_file, project.model_dump_json(indent=2).encode())
        self._corrupt = False

    async def save(
        self,
        project: Project,
        *,
        media_ids: Collection[str],
        transition_ids: Collection[str],
    ) -> Project:
        """Prüft die Bezüge und schreibt atomar; bei Fehlern bleibt alles unverändert."""
        async with self._lock:
            issues = check_references(project, media_ids, transition_ids)
            if issues:
                raise ProjectValidationError(issues)
            await asyncio.to_thread(self._write, project)
            self._project = project
            return project

    async def remove_media(self, media_id: str) -> Project:
        """Kaskade beim Löschen eines Mediums (design.md D7); schreibt nur bei Änderung."""
        async with self._lock:
            updated = remove_media_slides(self._project, media_id)
            if updated != self._project:
                await asyncio.to_thread(self._write, updated)
                self._project = updated
            return self._project
