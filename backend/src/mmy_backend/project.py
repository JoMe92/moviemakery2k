"""Projektmodell und Projektspeicher (Spec "Projektmodell", design.md D3 und D7).

`<data_dir>/project.json` enthält ein `Project` mit `schemaVersion: 1`. Jedes
Element (Slide) verweist auf ein Medium und trägt optional seinen eingehenden
Übergang vom vorherigen Element; das erste Element hat keinen.

Die Prüfung läuft in zwei Stufen:

1. Struktur (Pydantic): Felder, Typen, ID-Format, Dauerbereiche und 0,25-s-Raster.
2. Bezüge (`ProjectStore.save`): Medien- und Übergangs-IDs existieren, Slide-IDs
   sind eindeutig, das erste Element hat keinen Übergang.

Fehler beider Stufen haben dieselbe Form wie FastAPIs 422-Antwort
(`loc`, `msg`, `type`) und eine deutsche Meldung, die Element und Feld nennt.

Eine beschädigte `project.json` wird beim Laden nicht überschrieben: Das Backend
protokolliert eine Warnung und liefert das leere Projekt. Erst beim nächsten
erfolgreichen Speichern wird die alte Datei nach `project.json.corrupt-<Zeit>`
umbenannt, damit nichts stillschweigend verloren geht.
"""

import asyncio
import logging
import math
from collections.abc import Collection, Sequence
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


def _seconds(value: float) -> str:
    """0.5 -> "0,5"; 60.0 -> "60" (deutsche Schreibweise für Meldungen)."""
    return f"{value:g}".replace(".", ",")


def on_grid(value: float, step: float = DURATION_STEP) -> bool:
    """Liegt `value` (bis auf Rundungsfehler) auf dem Raster `step`?"""
    steps = value / step
    return abs(steps - round(steps)) <= _GRID_EPSILON


def _duration_check(label: str, low: float, high: float) -> AfterValidator:
    def check(value: float) -> float:
        if not math.isfinite(value) or not low <= value <= high:
            raise ValueError(
                f"{label} muss zwischen {_seconds(low)} und {_seconds(high)} s liegen "
                f"(ist {_seconds(value)} s)."
            )
        if not on_grid(value):
            raise ValueError(
                f"{label} muss ein Vielfaches von {_seconds(DURATION_STEP)} s sein "
                f"(ist {_seconds(value)} s)."
            )
        return value

    return AfterValidator(check)


def _duration_schema(low: float, high: float) -> dict[str, Any]:
    return {"minimum": low, "maximum": high, "multipleOf": DURATION_STEP}


# Strict: JSON-Zahlen (auch Ganzzahlen) ja, Booleans und Strings nein.
SlideDuration = Annotated[
    float,
    Strict(),
    _duration_check("Die Anzeigedauer", SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    Field(
        description="Anzeigedauer in Sekunden",
        json_schema_extra=_duration_schema(SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    ),
]
TransitionDuration = Annotated[
    float,
    Strict(),
    _duration_check("Die Übergangsdauer", TRANSITION_DURATION_MIN, TRANSITION_DURATION_MAX),
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


# --- Fehlermeldungen --------------------------------------------------------

Loc = tuple[str | int, ...]


def describe_location(loc: Sequence[str | int], body: Any) -> str:
    """Beschreibt eine Fehlerstelle, z. B. 'Element 3 (ID „b“), Feld transitionIn.duration'.

    `loc` ist relativ zum Projekt (ohne führendes "body"). `body` ist das
    eingegangene JSON, aus dem die Slide-ID gelesen wird, soweit vorhanden.
    """
    parts = list(loc)
    if len(parts) >= 2 and parts[0] == "slides" and isinstance(parts[1], int):
        index = parts[1]
        label = f"Element {index + 1}"
        slide_id = _slide_id_from_body(body, index)
        if slide_id is not None:
            label += f" (ID „{slide_id}“)"
        rest = ".".join(str(p) for p in parts[2:])
        return f"{label}, Feld {rest}" if rest else label
    if not parts:
        return "Projekt"
    return "Feld " + ".".join(str(p) for p in parts)


def _slide_id_from_body(body: Any, index: int) -> str | None:
    if isinstance(body, Project):
        return body.slides[index].id if 0 <= index < len(body.slides) else None
    if isinstance(body, dict):
        slides = body.get("slides")
        if isinstance(slides, list) and 0 <= index < len(slides):
            slide = slides[index]
            if isinstance(slide, dict) and isinstance(slide.get("id"), str):
                return str(slide["id"])
    return None


def project_issue(loc: Loc, error_type: str, text: str, body: Any) -> dict[str, Any]:
    """Ein Fehlereintrag im Format von FastAPIs 422-Antwort (loc beginnt mit "body")."""
    return {
        "type": error_type,
        "loc": ["body", *loc],
        "msg": f"{describe_location(loc, body)}: {text}",
    }


def _german_text(error: dict[str, Any]) -> str:
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    match kind:
        case "value_error":
            return str(ctx.get("error", error.get("msg", "")))
        case "missing":
            return "Pflichtfeld fehlt."
        case "extra_forbidden":
            return "Unbekanntes Feld."
        case "string_pattern_mismatch":
            return "Ungültiges Format (1 bis 64 Zeichen aus A-Z, a-z, 0-9, _ und -)."
        case "literal_error":
            return f"Wert muss {ctx.get('expected', '')} sein."
        case "float_type" | "float_parsing" | "finite_number":
            return "Muss eine Zahl sein."
        case "string_type":
            return "Muss ein Text sein."
        case "list_type":
            return "Muss eine Liste sein."
        case "model_type" | "model_attributes_type" | "dict_type":
            return "Muss ein Objekt sein."
        case "too_long":
            return f"Höchstens {MAX_SLIDES} Elemente erlaubt."
        case "json_invalid":
            return "Kein gültiges JSON."
        case _:
            return str(error.get("msg", "Ungültiger Wert."))


def translate_validation_errors(errors: Sequence[Any], body: Any) -> list[dict[str, Any]]:
    """Übersetzt Pydantic/FastAPI-Fehler eines Projekt-Requests ins Deutsche."""
    issues: list[dict[str, Any]] = []
    for error in errors:
        loc: Loc = tuple(error.get("loc", ()))
        if loc[:1] == ("body",):
            loc = loc[1:]
        issues.append(project_issue(loc, str(error.get("type", "")), _german_text(error), body))
    return issues


class ProjectValidationError(Exception):
    """Das Projekt verweist auf Unbekanntes oder verletzt eine Regel."""

    def __init__(self, issues: list[dict[str, Any]]) -> None:
        super().__init__("; ".join(str(i["msg"]) for i in issues))
        self.issues = issues


def check_references(
    project: Project,
    media_ids: Collection[str],
    transition_ids: Collection[str],
) -> list[dict[str, Any]]:
    """Prüft die Bezüge eines strukturell gültigen Projekts; leere Liste = gültig."""
    issues: list[dict[str, Any]] = []
    seen: dict[str, int] = {}
    for index, slide in enumerate(project.slides):
        if slide.id in seen:
            issues.append(
                project_issue(
                    ("slides", index, "id"),
                    "duplicate_slide_id",
                    f"Die ID ist schon an Element {seen[slide.id] + 1} vergeben.",
                    project,
                )
            )
        else:
            seen[slide.id] = index
        if slide.media_id not in media_ids:
            issues.append(
                project_issue(
                    ("slides", index, "mediaId"),
                    "unknown_media",
                    f"Unbekanntes Medium „{slide.media_id}“.",
                    project,
                )
            )
        transition = slide.transition_in
        if transition is None:
            continue
        if index == 0:
            issues.append(
                project_issue(
                    ("slides", index, "transitionIn"),
                    "first_slide_transition",
                    "Das erste Element kann keinen eingehenden Übergang haben.",
                    project,
                )
            )
        if transition.transition_id not in transition_ids:
            issues.append(
                project_issue(
                    ("slides", index, "transitionIn", "transitionId"),
                    "unknown_transition",
                    f"Unbekannter Übergang „{transition.transition_id}“.",
                    project,
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
