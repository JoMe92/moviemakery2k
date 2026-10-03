"""Transition catalog: loading and validating packages/catalog/transitions.json.

The models mirror transitions.schema.json. An invalid catalog leads to a
CatalogError that names the faulty entry; the backend then does not start.
"""

import json
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, Strict, ValidationError
from pydantic.alias_generators import to_camel

TransitionId = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
ParamName = Annotated[str, Field(pattern=r"^[a-z][A-Za-z0-9]*$")]
# Strict: JSON numbers (including integers) yes, booleans no - like "type": "number".
ParamValue = Annotated[float, Strict()]


class _CatalogModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class TransitionSource(_CatalogModel):
    kind: Literal["wmm2x-xml", "smpte"]
    ref: Annotated[str, Field(min_length=1)]
    estimated: list[str] | None = Field(
        default=None,
        description="Parameters whose value is not documented but estimated [E]",
    )


class TransitionNames(_CatalogModel):
    """Display name per UI language; both languages are required."""

    de: Annotated[str, Field(min_length=1)]
    en: Annotated[str, Field(min_length=1)]


class Transition(_CatalogModel):
    id: TransitionId
    names: TransitionNames
    shader: Annotated[
        str,
        Field(
            pattern=r"^[a-z0-9-]+\.glsl$",
            description="File name in packages/shaders/transitions/",
        ),
    ]
    default_duration: Annotated[
        float,
        Field(ge=0.25, le=5, multiple_of=0.25, description="Seconds"),
    ]
    params: dict[ParamName, ParamValue] = Field(
        description="Becomes `uniform float <name>` in the shader, 1:1"
    )
    source: TransitionSource


class TransitionCatalog(_CatalogModel):
    schema_version: Literal[1]
    transitions: Annotated[list[Transition], Field(min_length=1)]


class _CatalogFile(TransitionCatalog):
    """File form: additionally allows the `$schema` reference."""

    schema_ref: str | None = Field(default=None, alias="$schema")


class CatalogError(Exception):
    """The transition catalog is missing, is not JSON or violates the schema."""


def _entry_label(raw: Any, index: int, list_key: str) -> str:
    entry: Any = None
    if isinstance(raw, dict):
        entries = raw.get(list_key)
        if isinstance(entries, list) and 0 <= index < len(entries):
            entry = entries[index]
    entry_id = entry.get("id") if isinstance(entry, dict) else None
    if isinstance(entry_id, str):
        return f"entry #{index} (id '{entry_id}')"
    return f"entry #{index}"


def _describe(error: ValidationError, raw: Any, list_key: str) -> list[str]:
    lines: list[str] = []
    for err in error.errors():
        loc = list(err["loc"])
        if len(loc) >= 2 and loc[0] == list_key and isinstance(loc[1], int):
            where = _entry_label(raw, loc[1], list_key)
            field = ".".join(str(part) for part in loc[2:]) or "(entry)"
            lines.append(f"{where}: {field}: {err['msg']}")
        else:
            field = ".".join(str(part) for part in loc) or "(root)"
            lines.append(f"{field}: {err['msg']}")
    return lines


def load_catalog(path: Path) -> TransitionCatalog:
    """Loads and validates the catalog; raises CatalogError naming the faulty entry."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise CatalogError(f"Transition catalog {path} not readable: {exc}") from exc
    try:
        raw: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise CatalogError(f"Transition catalog {path} is not valid JSON: {exc}") from exc
    try:
        parsed = _CatalogFile.model_validate_json(text)
    except ValidationError as exc:
        details = "\n  ".join(_describe(exc, raw, "transitions"))
        raise CatalogError(f"Transition catalog {path} is invalid:\n  {details}") from exc

    seen: dict[str, int] = {}
    for index, transition in enumerate(parsed.transitions):
        if transition.id in seen:
            raise CatalogError(
                f"Transition catalog {path} is invalid:\n  entry #{index} "
                f"(id '{transition.id}'): id: duplicate, already in entry #{seen[transition.id]}"
            )
        seen[transition.id] = index

    return TransitionCatalog(schema_version=parsed.schema_version, transitions=parsed.transitions)


# --- Effect catalog (add-effects-catalog, design.md D1) -----------------------
# Stateless, single-image effects: no `defaultDuration`, no SMPTE source kind.

EffectId = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]


class EffectSource(_CatalogModel):
    kind: Literal["wmm2x-xml"]
    ref: Annotated[str, Field(min_length=1)]
    estimated: list[str] | None = Field(
        default=None,
        description="Parameters whose value is not documented but estimated [E]",
    )


class Effect(_CatalogModel):
    id: EffectId
    names: TransitionNames
    shader: Annotated[
        str,
        Field(
            pattern=r"^[a-z0-9-]+\.glsl$",
            description="File name in packages/shaders/effects/",
        ),
    ]
    params: dict[ParamName, ParamValue] = Field(
        description="Becomes `uniform float <name>` in the shader, 1:1"
    )
    source: EffectSource


class EffectCatalog(_CatalogModel):
    schema_version: Literal[1]
    effects: Annotated[list[Effect], Field(min_length=1)]


class _EffectCatalogFile(EffectCatalog):
    """File form: additionally allows the `$schema` reference."""

    schema_ref: str | None = Field(default=None, alias="$schema")


def load_effect_catalog(path: Path) -> EffectCatalog:
    """Loads and validates the effect catalog; raises CatalogError naming the faulty entry."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise CatalogError(f"Effect catalog {path} not readable: {exc}") from exc
    try:
        raw: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise CatalogError(f"Effect catalog {path} is not valid JSON: {exc}") from exc
    try:
        parsed = _EffectCatalogFile.model_validate_json(text)
    except ValidationError as exc:
        details = "\n  ".join(_describe(exc, raw, "effects"))
        raise CatalogError(f"Effect catalog {path} is invalid:\n  {details}") from exc

    seen: dict[str, int] = {}
    for index, effect in enumerate(parsed.effects):
        if effect.id in seen:
            raise CatalogError(
                f"Effect catalog {path} is invalid:\n  entry #{index} "
                f"(id '{effect.id}'): id: duplicate, already in entry #{seen[effect.id]}"
            )
        seen[effect.id] = index

    return EffectCatalog(schema_version=parsed.schema_version, effects=parsed.effects)
