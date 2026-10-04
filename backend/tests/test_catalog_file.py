"""The catalog in packages/catalog is valid against its JSON Schema (TASK-CAT-001)."""

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

CATALOG_DIR = Path(__file__).resolve().parents[2] / "packages" / "catalog"
SHADER_DIR = CATALOG_DIR.parent / "shaders" / "transitions"
MVP_IDS = {"fade", "dissolve", "wipe-right", "circle", "pixelate", "checkerboard"}

# movie-maker-reference.md §3's 13 WMTFX 3D/particle transitions - out of
# scope for add-transition-catalog (proposal.md "Nicht-Ziele").
WMTFX_NAMES = [
    "flip",
    "slide up",
    "slide up center",
    "roll",
    "spin out",
    "page curl",
    "shatter",
    "whirlwind",
    "shrink",
]


def _load(name: str) -> Any:
    return json.loads((CATALOG_DIR / name).read_text(encoding="utf-8"))


def test_catalog_matches_schema() -> None:
    schema = _load("transitions.schema.json")
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(_load("transitions.json")))
    assert errors == []


def test_catalog_still_contains_the_mvp_transitions() -> None:
    # add-transition-catalog grows the catalog well past the six MVP entries
    # (TASK-CAT-005 checks the final count); this only guards the MVP's own
    # requirement that they stay, unchanged and without duplicates.
    ids = [t["id"] for t in _load("transitions.json")["transitions"]]
    assert len(ids) == len(set(ids))
    assert set(ids) >= MVP_IDS


def test_every_transition_has_a_german_and_an_english_name() -> None:
    for entry in _load("transitions.json")["transitions"]:
        assert set(entry["names"]) == {"de", "en"}
        assert all(name.strip() for name in entry["names"].values())


def test_catalog_grew_past_forty_without_any_wmtfx_3d_or_particle_transition() -> None:
    """TASK-CAT-005 (design.md D2): scope is a rule, not a repeated name list -
    this is the test the rule asks for (spec transitions "Kein 3D- oder
    Partikel-Übergang")."""
    transitions = _load("transitions.json")["transitions"]
    assert len(transitions) > 40
    for entry in transitions:
        haystack = f"{entry['id']} {entry['names']['en']}".lower()
        for wmtfx_name in WMTFX_NAMES:
            assert wmtfx_name not in haystack, f"{entry['id']!r} looks like WMTFX {wmtfx_name!r}"
