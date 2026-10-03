"""Title/credits catalog: loading and validating packages/catalog/titles.json
(TASK-CAT-007, design.md D4 of add-titles-and-credits).

The models mirror titles.schema.json. An invalid catalog leads to a
TitleCatalogError that names the faulty entry; the backend then does not start.
"""

import json
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

TitleId = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
Layout = Literal["one-line", "two-line", "credits"]


class _CatalogModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class Transform(_CatalogModel):
    """Position/zoom in title-vertex.glsl's clip-space convention (design.md D3)."""

    x: float
    y: float
    scale: Annotated[float, Field(gt=0)]


class FadePhase(_CatalogModel):
    effect: Literal["fade"]


class StaticPhase(_CatalogModel):
    effect: Literal["static"]


class PositionPhase(_CatalogModel):
    effect: Literal["position"]
    start: Transform
    end: Transform


Phase = Annotated[FadePhase | StaticPhase | PositionPhase, Field(discriminator="effect")]


class Phases(_CatalogModel):
    entrance: Phase
    main: Phase
    exit: Phase


class TitleNames(_CatalogModel):
    """Display name per UI language; both languages are required."""

    de: Annotated[str, Field(min_length=1)]
    en: Annotated[str, Field(min_length=1)]


class TitleSource(_CatalogModel):
    kind: Literal["wmm2x-xml"]
    ref: Annotated[str, Field(min_length=1)]
    estimated: list[str] | None = Field(
        default=None,
        description="Fields whose value is not documented but estimated [E]",
    )


class Title(_CatalogModel):
    id: TitleId
    names: TitleNames
    layout: Layout
    anchor: Transform
    font_scale: Annotated[float, Field(gt=0, le=1)]
    phases: Phases
    source: TitleSource


class TitleCatalog(_CatalogModel):
    schema_version: Literal[1]
    titles: Annotated[list[Title], Field(min_length=1)]


class _CatalogFile(TitleCatalog):
    """File form: additionally allows the `$schema` reference."""

    schema_ref: str | None = Field(default=None, alias="$schema")


class TitleCatalogError(Exception):
    """The title catalog is missing, is not JSON or violates the schema."""


def _entry_label(raw: Any, index: int) -> str:
    entry: Any = None
    if isinstance(raw, dict):
        titles = raw.get("titles")
        if isinstance(titles, list) and 0 <= index < len(titles):
            entry = titles[index]
    entry_id = entry.get("id") if isinstance(entry, dict) else None
    if isinstance(entry_id, str):
        return f"entry #{index} (id '{entry_id}')"
    return f"entry #{index}"


def _describe(error: ValidationError, raw: Any) -> list[str]:
    lines: list[str] = []
    for err in error.errors():
        loc = list(err["loc"])
        if len(loc) >= 2 and loc[0] == "titles" and isinstance(loc[1], int):
            where = _entry_label(raw, loc[1])
            field = ".".join(str(part) for part in loc[2:]) or "(entry)"
            lines.append(f"{where}: {field}: {err['msg']}")
        else:
            field = ".".join(str(part) for part in loc) or "(root)"
            lines.append(f"{field}: {err['msg']}")
    return lines


def load_title_catalog(path: Path) -> TitleCatalog:
    """Loads and validates the catalog; raises TitleCatalogError naming the faulty entry."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise TitleCatalogError(f"Title catalog {path} not readable: {exc}") from exc
    try:
        raw: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise TitleCatalogError(f"Title catalog {path} is not valid JSON: {exc}") from exc
    try:
        parsed = _CatalogFile.model_validate_json(text)
    except ValidationError as exc:
        details = "\n  ".join(_describe(exc, raw))
        raise TitleCatalogError(f"Title catalog {path} is invalid:\n  {details}") from exc

    seen: dict[str, int] = {}
    for index, title in enumerate(parsed.titles):
        if title.id in seen:
            raise TitleCatalogError(
                f"Title catalog {path} is invalid:\n  entry #{index} "
                f"(id '{title.id}'): id: duplicate, already in entry #{seen[title.id]}"
            )
        seen[title.id] = index

    return TitleCatalog(schema_version=parsed.schema_version, titles=parsed.titles)
