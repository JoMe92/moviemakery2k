"""Full effect-catalog validation (TASK-CAT-006): total count, absence of the
excluded time-dependent/speed effect groups, and startup validation via the
API - mirrors backend/tests/test_catalog_api.py for transitions.json.

Count note: design.md/proposal.md say "22 zustandslose Bild-Effekte", but
design.md's own D1 decision enumerates only 21 named effects, and the 21
entries below are exactly that enumeration. Independently, from
docs/research/movie-maker-reference.md §3's own "30 in the XML" total: 30
minus the 9 excluded time-dependent/speed effects (Hue Cycle 1, Fade
In/Out from/to Black/White 4, Ease In/Out 2, Speed Up Double/Slow Down Half
2) = 21. The "22" in the planning prose is very likely an off-by-one slip;
recorded as a non-blocking discovery on mmy-9p8 for a future planning
session to correct the wording - this test asserts the number the decision
record and the source arithmetic actually support.
"""

import json
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

from mmy_backend.catalog import CatalogError
from mmy_backend.config import REPO_ROOT, Settings
from mmy_backend.main import create_app

CATALOG_DIR = REPO_ROOT / "packages" / "catalog"

TOTAL_EFFECTS = 21

# Excluded groups (proposal.md "Nicht-Ziele"): time-dependent effects at the
# element edge, and the two video-clip speed effects - a different mechanism
# each, out of scope for this stateless, single-image effect catalog.
EXCLUDED_ID_FRAGMENTS = (
    "fade",  # Fade In/Out from/to Black/White
    "ease",  # Ease In/Out
    "hue-cycle",  # Hue Cycle
    "speed",  # Speed Up Double / Slow Down Half
    "slow-down",
)


def _load_effects() -> list[dict[str, Any]]:
    raw: dict[str, Any] = json.loads((CATALOG_DIR / "effects.json").read_text(encoding="utf-8"))
    return cast(list[dict[str, Any]], raw["effects"])


def _broken_effect_catalog(tmp_path: Path, mutate: Any) -> Settings:
    raw: dict[str, Any] = json.loads((CATALOG_DIR / "effects.json").read_text(encoding="utf-8"))
    mutate(raw)
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    (catalog_dir / "transitions.json").write_text(
        (CATALOG_DIR / "transitions.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (catalog_dir / "effects.json").write_text(json.dumps(raw), encoding="utf-8")
    return Settings(data_dir=tmp_path / "data", catalog_dir=catalog_dir, web_dist=tmp_path / "d")


def test_catalog_has_exactly_twenty_one_entries() -> None:
    effects = _load_effects()
    ids = [e["id"] for e in effects]
    assert len(ids) == len(set(ids))
    assert len(ids) == TOTAL_EFFECTS


def test_catalog_excludes_time_dependent_and_speed_effects() -> None:
    ids = [e["id"] for e in _load_effects()]
    for fragment in EXCLUDED_ID_FRAGMENTS:
        assert not any(fragment in effect_id for effect_id in ids), fragment


def test_every_entry_documents_a_source() -> None:
    for entry in _load_effects():
        assert entry["source"]["kind"] == "wmm2x-xml"
        assert entry["source"]["ref"].strip()


def test_catalog_endpoint_returns_twenty_one_entries_in_camel_case(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        res = client.get("/api/catalog/effects")
    assert res.status_code == 200
    body = res.json()
    assert body["schemaVersion"] == 1
    assert len(body["effects"]) == TOTAL_EFFECTS
    for entry in body["effects"]:
        assert set(entry) == {"id", "names", "shader", "params", "source"}
    sepia = next(e for e in body["effects"] if e["id"] == "sepia")
    assert sepia["names"] == {"de": "Sepia", "en": "Sepia"}


def test_startup_aborts_without_english_name(tmp_path: Path) -> None:
    settings = _broken_effect_catalog(tmp_path, lambda raw: raw["effects"][0]["names"].pop("en"))
    with pytest.raises(CatalogError) as exc_info:
        create_app(settings)
    message = str(exc_info.value)
    assert "entry #0 (id 'sepia')" in message
    assert "names.en" in message


def test_startup_aborts_on_duplicate_id(tmp_path: Path) -> None:
    settings = _broken_effect_catalog(tmp_path, lambda raw: raw["effects"][1].update(id="sepia"))
    with pytest.raises(CatalogError, match=r"entry #1 \(id 'sepia'\): id: duplicate"):
        create_app(settings)


def test_startup_aborts_on_unknown_source_kind(tmp_path: Path) -> None:
    settings = _broken_effect_catalog(
        tmp_path, lambda raw: raw["effects"][0]["source"].update(kind="smpte")
    )
    with pytest.raises(CatalogError, match=r"source\.kind"):
        create_app(settings)
