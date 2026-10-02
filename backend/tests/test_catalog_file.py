"""Der Katalog in packages/catalog ist gegen sein JSON Schema gültig (TASK-CAT-001)."""

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

CATALOG_DIR = Path(__file__).resolve().parents[2] / "packages" / "catalog"
SHADER_DIR = CATALOG_DIR.parent / "shaders" / "transitions"
MVP_IDS = {"fade", "dissolve", "wipe-right", "circle", "pixelate", "checkerboard"}


def _load(name: str) -> Any:
    return json.loads((CATALOG_DIR / name).read_text(encoding="utf-8"))


def test_catalog_matches_schema() -> None:
    schema = _load("transitions.schema.json")
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(_load("transitions.json")))
    assert errors == []


def test_catalog_contains_exactly_the_mvp_transitions() -> None:
    ids = [t["id"] for t in _load("transitions.json")["transitions"]]
    assert len(ids) == len(set(ids))
    assert set(ids) == MVP_IDS
