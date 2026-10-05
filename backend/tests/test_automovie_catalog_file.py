"""The AutoMovie catalog in packages/catalog is valid against its JSON Schema,
holds exactly the three MVP styles and only refers to entries that really exist
in the transition, effect and title catalogs (TASK-CAT-008, design.md D1)."""

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

CATALOG_DIR = Path(__file__).resolve().parents[2] / "packages" / "catalog"
# The Product Owner scoped AutoMovie to three styles (design.md, Context).
MVP_IDS = {"classic", "old-movie", "music-video"}


def _load(name: str) -> Any:
    return json.loads((CATALOG_DIR / name).read_text(encoding="utf-8"))


def _styles() -> list[dict[str, Any]]:
    styles: list[dict[str, Any]] = _load("automovie.json")["styles"]
    return styles


def _ids(name: str, list_key: str) -> set[str]:
    return {entry["id"] for entry in _load(name)[list_key]}


def test_catalog_matches_schema() -> None:
    schema = _load("automovie.schema.json")
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(_load("automovie.json")))
    assert errors == []


def test_catalog_contains_exactly_the_three_mvp_styles() -> None:
    ids = [style["id"] for style in _styles()]
    assert len(ids) == len(set(ids))
    assert set(ids) == MVP_IDS


def test_every_style_has_a_german_and_an_english_name_and_description() -> None:
    for style in _styles():
        for field in ("names", "descriptions"):
            assert set(style[field]) == {"de", "en"}
            assert all(text.strip() for text in style[field].values())


def test_every_transition_reference_exists_in_the_transition_catalog() -> None:
    known = _ids("transitions.json", "transitions")
    assert {style["transitionId"] for style in _styles()} <= known


def test_every_effect_reference_exists_in_the_effect_catalog_or_is_null() -> None:
    known = _ids("effects.json", "effects")
    for style in _styles():
        effect_id = style["effectId"]
        assert effect_id is None or effect_id in known


def test_every_title_style_reference_exists_in_the_title_catalog() -> None:
    known = _ids("titles.json", "titles")
    assert {style["titleStyleId"] for style in _styles()} <= known


def test_only_music_video_requires_a_music_track() -> None:
    requiring = {style["id"] for style in _styles() if style["requiresMusic"]}
    assert requiring == {"music-video"}


def test_the_three_styles_carry_the_combination_from_design_d1() -> None:
    by_id = {style["id"]: style for style in _styles()}
    assert by_id["classic"]["transitionId"] == "fade"
    assert by_id["classic"]["effectId"] is None
    assert by_id["classic"]["titleStyleId"] == "basic-title"
    assert by_id["old-movie"]["transitionId"] == "dissolve"
    assert by_id["old-movie"]["effectId"] == "film-age-older"
    assert by_id["old-movie"]["titleStyleId"] == "basic-title"
    assert by_id["music-video"]["transitionId"] == "circle"
    assert by_id["music-video"]["effectId"] is None
    assert by_id["music-video"]["titleStyleId"] == "zoom-in"
