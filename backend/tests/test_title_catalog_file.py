"""The title/credits catalog in packages/catalog is valid against its JSON
Schema and matches design.md D4 (TASK-CAT-007 of add-titles-and-credits)."""

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

CATALOG_DIR = Path(__file__).resolve().parents[2] / "packages" / "catalog"
MVP_IDS = {
    "basic-title",
    "fly-in",
    "zoom-in",
    "subtitle",
    "fade-in-and-out",
    "fly-in-fades",
    "scroll-up-stacked",
    "fade-in-and-out-credits",
}
ONE_LINE_IDS = {"basic-title", "fly-in", "zoom-in", "subtitle"}
TWO_LINE_IDS = {"fade-in-and-out", "fly-in-fades"}
CREDITS_IDS = {"scroll-up-stacked", "fade-in-and-out-credits"}


def _load(name: str) -> Any:
    return json.loads((CATALOG_DIR / name).read_text(encoding="utf-8"))


def _titles() -> list[dict[str, Any]]:
    titles: list[dict[str, Any]] = _load("titles.json")["titles"]
    return titles


def test_catalog_matches_schema() -> None:
    schema = _load("titles.schema.json")
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(_load("titles.json")))
    assert errors == []


def test_catalog_contains_exactly_the_mvp_titles() -> None:
    ids = [t["id"] for t in _titles()]
    assert len(ids) == len(set(ids))
    assert set(ids) == MVP_IDS


def test_every_title_has_a_german_and_an_english_name() -> None:
    for entry in _titles():
        assert set(entry["names"]) == {"de", "en"}
        assert all(name.strip() for name in entry["names"].values())


def test_layout_matches_the_4_one_line_2_two_line_2_credits_mvp_split() -> None:
    by_layout: dict[str, set[str]] = {"one-line": set(), "two-line": set(), "credits": set()}
    for entry in _titles():
        by_layout[entry["layout"]].add(entry["id"])
    assert by_layout["one-line"] == ONE_LINE_IDS
    assert by_layout["two-line"] == TWO_LINE_IDS
    assert by_layout["credits"] == CREDITS_IDS


def test_every_title_has_entrance_main_and_exit_phases() -> None:
    for entry in _titles():
        assert set(entry["phases"]) == {"entrance", "main", "exit"}
        for phase in entry["phases"].values():
            assert phase["effect"] in {"fade", "static", "position"}
            if phase["effect"] == "position":
                assert set(phase) == {"effect", "start", "end"}
                for keyframe in (phase["start"], phase["end"]):
                    assert set(keyframe) == {"x", "y", "scale"}
                    assert keyframe["scale"] > 0


def test_only_scroll_up_stacked_moves_during_main() -> None:
    movers = {entry["id"] for entry in _titles() if entry["phases"]["main"]["effect"] == "position"}
    assert movers == {"scroll-up-stacked"}


def test_subtitle_is_the_only_smaller_off_centre_style() -> None:
    for entry in _titles():
        is_subtitle = entry["id"] == "subtitle"
        assert (entry["fontScale"] < 1) == is_subtitle
        assert (entry["anchor"]["y"] != 0) == is_subtitle
