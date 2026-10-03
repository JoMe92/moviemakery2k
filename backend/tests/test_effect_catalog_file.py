"""The effect catalog in packages/catalog is valid against its JSON Schema (TASK-FX-008).

Full validation of all 22 entries (count, cross-check against the research
notes) is TASK-CAT-006; this only covers the TASK-FX-008 subset introduced
here (stateless colour/geometry effects).
"""

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from mmy_backend.catalog import CatalogError, load_effect_catalog

CATALOG_DIR = Path(__file__).resolve().parents[2] / "packages" / "catalog"
SHADER_DIR = CATALOG_DIR.parent / "shaders" / "effects"
FX_008_IDS = {
    "sepia",
    "negative",
    "posterize",
    "threshold",
    "grayscale",
    "brightness-up",
    "brightness-down",
    "mirror-horizontal",
    "mirror-vertical",
    "rotate-90",
    "rotate-180",
    "rotate-270",
}


def _load(name: str) -> Any:
    return json.loads((CATALOG_DIR / name).read_text(encoding="utf-8"))


def test_catalog_matches_schema() -> None:
    schema = _load("effects.schema.json")
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(_load("effects.json")))
    assert errors == []


def test_catalog_contains_exactly_the_task_fx_008_effects() -> None:
    ids = [e["id"] for e in _load("effects.json")["effects"]]
    assert len(ids) == len(set(ids))
    assert set(ids) == FX_008_IDS


def test_every_effect_has_a_german_and_an_english_name() -> None:
    for entry in _load("effects.json")["effects"]:
        assert set(entry["names"]) == {"de", "en"}
        assert all(name.strip() for name in entry["names"].values())


def test_every_effect_names_its_own_shader_file() -> None:
    for entry in _load("effects.json")["effects"]:
        assert entry["shader"] == f"{entry['id']}.glsl"
        assert (SHADER_DIR / entry["shader"]).is_file()


# --- load_effect_catalog (catalog.py; full startup validation is TASK-CAT-006) -----


def test_load_effect_catalog_reads_the_real_file() -> None:
    catalog = load_effect_catalog(CATALOG_DIR / "effects.json")
    assert catalog.schema_version == 1
    assert {e.id for e in catalog.effects} == FX_008_IDS
    sepia = next(e for e in catalog.effects if e.id == "sepia")
    assert sepia.names.de == "Sepia"
    assert sepia.source.kind == "wmm2x-xml"


def test_load_effect_catalog_rejects_duplicate_ids(tmp_path: Path) -> None:
    raw = _load("effects.json")
    raw["effects"][1]["id"] = raw["effects"][0]["id"]
    path = tmp_path / "effects.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(CatalogError, match=r"entry #1 \(id 'sepia'\): id: duplicate"):
        load_effect_catalog(path)


def test_load_effect_catalog_names_the_faulty_entry(tmp_path: Path) -> None:
    raw = _load("effects.json")
    del raw["effects"][2]["names"]["en"]
    path = tmp_path / "effects.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(CatalogError, match=r"entry #2 \(id 'posterize'\): names\.en"):
        load_effect_catalog(path)
