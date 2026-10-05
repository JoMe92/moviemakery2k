"""AutoMovie catalog: loading and validating packages/catalog/automovie.json
(TASK-CAT-008, design.md D1 of add-automovie).

The models mirror automovie.schema.json. An AutoMovie style is purely
combinatorial: it names one transition, optionally one effect and one title
style, all by their ID in the respective catalog. Those references are checked
against the already loaded catalogs, so a typo stops the backend at startup
instead of producing a broken AutoMovie at runtime.
"""

import json
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, Strict, ValidationError
from pydantic.alias_generators import to_camel

from mmy_backend.catalog import EffectCatalog, TransitionCatalog
from mmy_backend.title_catalog import TitleCatalog

AutoMovieStyleId = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
CatalogRef = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]


class _CatalogModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class LocalizedText(_CatalogModel):
    """Text per UI language; both languages are required."""

    de: Annotated[str, Field(min_length=1)]
    en: Annotated[str, Field(min_length=1)]


class AutoMovieStyle(_CatalogModel):
    id: AutoMovieStyleId
    names: LocalizedText
    descriptions: LocalizedText = Field(
        description="One short sentence shown on the style tile in the AutoMovie dialog"
    )
    transition_id: CatalogRef = Field(
        description="ID from the transition catalog, used between all adjacent elements"
    )
    effect_id: CatalogRef | None = Field(
        description=(
            "ID from the effect catalog applied to every image and video clip "
            "element, or null for no effect"
        )
    )
    title_style_id: CatalogRef = Field(
        description="ID from the title catalog, used for the opening and the closing title"
    )
    requires_music: Annotated[bool, Strict()] = Field(
        description="The style is only selectable while the project has a music track"
    )


class AutoMovieCatalog(_CatalogModel):
    schema_version: Literal[1]
    styles: Annotated[list[AutoMovieStyle], Field(min_length=1)]


class _CatalogFile(AutoMovieCatalog):
    """File form: additionally allows the `$schema` reference."""

    schema_ref: str | None = Field(default=None, alias="$schema")


class AutoMovieCatalogError(Exception):
    """The AutoMovie catalog is missing, is not JSON, violates the schema or
    refers to a transition, effect or title style that does not exist."""


def _entry_label(raw: Any, index: int) -> str:
    entry: Any = None
    if isinstance(raw, dict):
        styles = raw.get("styles")
        if isinstance(styles, list) and 0 <= index < len(styles):
            entry = styles[index]
    entry_id = entry.get("id") if isinstance(entry, dict) else None
    if isinstance(entry_id, str):
        return f"entry #{index} (id '{entry_id}')"
    return f"entry #{index}"


def _describe(error: ValidationError, raw: Any) -> list[str]:
    lines: list[str] = []
    for err in error.errors():
        loc = list(err["loc"])
        if len(loc) >= 2 and loc[0] == "styles" and isinstance(loc[1], int):
            where = _entry_label(raw, loc[1])
            field = ".".join(str(part) for part in loc[2:]) or "(entry)"
            lines.append(f"{where}: {field}: {err['msg']}")
        else:
            field = ".".join(str(part) for part in loc) or "(root)"
            lines.append(f"{field}: {err['msg']}")
    return lines


def load_automovie_catalog(
    path: Path,
    transitions: TransitionCatalog,
    effects: EffectCatalog,
    titles: TitleCatalog,
) -> AutoMovieCatalog:
    """Loads and validates the catalog, including its references into the other
    three catalogs; raises AutoMovieCatalogError naming the faulty entry."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise AutoMovieCatalogError(f"AutoMovie catalog {path} not readable: {exc}") from exc
    try:
        raw: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AutoMovieCatalogError(f"AutoMovie catalog {path} is not valid JSON: {exc}") from exc
    try:
        parsed = _CatalogFile.model_validate_json(text)
    except ValidationError as exc:
        details = "\n  ".join(_describe(exc, raw))
        raise AutoMovieCatalogError(f"AutoMovie catalog {path} is invalid:\n  {details}") from exc

    def fail(index: int, field: str, message: str) -> None:
        raise AutoMovieCatalogError(
            f"AutoMovie catalog {path} is invalid:\n  "
            f"{_entry_label(raw, index)}: {field}: {message}"
        )

    transition_ids = {entry.id for entry in transitions.transitions}
    effect_ids = {entry.id for entry in effects.effects}
    title_ids = {entry.id for entry in titles.titles}

    seen: dict[str, int] = {}
    for index, style in enumerate(parsed.styles):
        if style.id in seen:
            fail(index, "id", f"duplicate, already in entry #{seen[style.id]}")
        seen[style.id] = index
        if style.transition_id not in transition_ids:
            fail(index, "transitionId", f"unknown transition '{style.transition_id}'")
        if style.effect_id is not None and style.effect_id not in effect_ids:
            fail(index, "effectId", f"unknown effect '{style.effect_id}'")
        if style.title_style_id not in title_ids:
            fail(index, "titleStyleId", f"unknown title style '{style.title_style_id}'")

    return AutoMovieCatalog(schema_version=parsed.schema_version, styles=parsed.styles)
