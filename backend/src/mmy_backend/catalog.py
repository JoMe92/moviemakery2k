"""Übergangskatalog: Laden und Validieren von packages/catalog/transitions.json.

Die Modelle spiegeln transitions.schema.json. Ein ungültiger Katalog führt zu
einem CatalogError, der den fehlerhaften Eintrag benennt; das Backend startet
dann nicht.
"""

import json
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, Strict, ValidationError
from pydantic.alias_generators import to_camel

TransitionId = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
ParamName = Annotated[str, Field(pattern=r"^[a-z][A-Za-z0-9]*$")]
# Strict: JSON-Zahlen (auch Ganzzahlen) ja, Booleans nein - wie "type": "number".
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
        description="Parameter, deren Wert nicht belegt, sondern geschätzt ist [E]",
    )


class Transition(_CatalogModel):
    id: TransitionId
    name: Annotated[str, Field(min_length=1)]
    shader: Annotated[
        str,
        Field(
            pattern=r"^[a-z0-9-]+\.glsl$",
            description="Dateiname in packages/shaders/transitions/",
        ),
    ]
    default_duration: Annotated[
        float,
        Field(ge=0.25, le=5, multiple_of=0.25, description="Sekunden"),
    ]
    params: dict[ParamName, ParamValue] = Field(
        description="Wird 1:1 zu `uniform float <name>` im Shader"
    )
    source: TransitionSource


class TransitionCatalog(_CatalogModel):
    schema_version: Literal[1]
    transitions: Annotated[list[Transition], Field(min_length=1)]


class _CatalogFile(TransitionCatalog):
    """Dateiform: erlaubt zusätzlich den `$schema`-Verweis."""

    schema_ref: str | None = Field(default=None, alias="$schema")


class CatalogError(Exception):
    """Der Übergangskatalog fehlt, ist kein JSON oder verletzt das Schema."""


def _entry_label(raw: Any, index: int) -> str:
    entry: Any = None
    if isinstance(raw, dict):
        transitions = raw.get("transitions")
        if isinstance(transitions, list) and 0 <= index < len(transitions):
            entry = transitions[index]
    entry_id = entry.get("id") if isinstance(entry, dict) else None
    if isinstance(entry_id, str):
        return f"Eintrag #{index} (id '{entry_id}')"
    return f"Eintrag #{index}"


def _describe(error: ValidationError, raw: Any) -> list[str]:
    lines: list[str] = []
    for err in error.errors():
        loc = list(err["loc"])
        if len(loc) >= 2 and loc[0] == "transitions" and isinstance(loc[1], int):
            where = _entry_label(raw, loc[1])
            field = ".".join(str(part) for part in loc[2:]) or "(Eintrag)"
            lines.append(f"{where}: {field}: {err['msg']}")
        else:
            field = ".".join(str(part) for part in loc) or "(Wurzel)"
            lines.append(f"{field}: {err['msg']}")
    return lines


def load_catalog(path: Path) -> TransitionCatalog:
    """Lädt und validiert den Katalog; wirft CatalogError mit dem fehlerhaften Eintrag."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise CatalogError(f"Übergangskatalog {path} nicht lesbar: {exc}") from exc
    try:
        raw: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise CatalogError(f"Übergangskatalog {path} ist kein gültiges JSON: {exc}") from exc
    try:
        parsed = _CatalogFile.model_validate_json(text)
    except ValidationError as exc:
        details = "\n  ".join(_describe(exc, raw))
        raise CatalogError(f"Übergangskatalog {path} ist ungültig:\n  {details}") from exc

    seen: dict[str, int] = {}
    for index, transition in enumerate(parsed.transitions):
        if transition.id in seen:
            raise CatalogError(
                f"Übergangskatalog {path} ist ungültig:\n  Eintrag #{index} "
                f"(id '{transition.id}'): id: doppelt, bereits in Eintrag #{seen[transition.id]}"
            )
        seen[transition.id] = index

    return TransitionCatalog(schema_version=parsed.schema_version, transitions=parsed.transitions)
