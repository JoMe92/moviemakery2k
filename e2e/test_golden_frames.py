"""Randwert-Golden-Frames der Übergänge (Spec transitions „Gemeinsames Verhalten“).

Über den Testhook `?debug-progress=<id>:<p>` rendert die Web-App einen Übergang
von Rot nach Blau auf ein 640×480-Canvas.
"""

import json
from pathlib import Path

import pytest
from playwright.sync_api import Page

from canvas import canvas_stats, distinct_in_row, pixel

CATALOG = Path(__file__).resolve().parents[1] / "packages" / "catalog" / "transitions.json"
IDS = [t["id"] for t in json.loads(CATALOG.read_text(encoding="utf-8"))["transitions"]]
CANVAS = "#mmy-debug-canvas"


def render(page: Page, base: str, query: str) -> None:
    page.goto(f"{base}/?debug-progress={query}")
    page.wait_for_selector("body[data-debug-ready='1']", timeout=15_000)


@pytest.mark.parametrize("transition_id", IDS)
def test_progress_0_is_exactly_the_from_frame(page: Page, server: str, transition_id: str) -> None:
    render(page, server, f"{transition_id}:0")
    stats = canvas_stats(page, CANVAS)
    assert (stats["w"], stats["h"]) == (640, 480)
    assert stats["pure"]["red"] == stats["n"]


@pytest.mark.parametrize("transition_id", IDS)
def test_progress_1_is_exactly_the_to_frame(page: Page, server: str, transition_id: str) -> None:
    render(page, server, f"{transition_id}:1")
    stats = canvas_stats(page, CANVAS)
    assert stats["pure"]["blue"] == stats["n"]


@pytest.mark.parametrize("transition_id", [i for i in IDS if i != "pixelate"])
def test_midpoint_differs_from_both_ends(page: Page, server: str, transition_id: str) -> None:
    render(page, server, f"{transition_id}:0.4")
    stats = canvas_stats(page, CANVAS)
    assert stats["pure"]["red"] < stats["n"]
    assert stats["pure"]["blue"] < stats["n"]


def test_pixelate_builds_coarse_blocks(page: Page, server: str) -> None:
    # Einfarbige Bilder zeigen keine Blöcke; das Hochkant-Testmuster schon.
    render(page, server, "fade:0&fromPortrait=1")
    sharp = distinct_in_row(page, CANVAS, 0.5)
    render(page, server, "pixelate:0.45&fromPortrait=1")
    coarse = distinct_in_row(page, CANVAS, 0.5)
    assert coarse < sharp
    assert coarse <= 640 // 40 + 2


def test_dissolve_is_deterministic(page: Page, server: str) -> None:
    render(page, server, "dissolve:0.5")
    first = canvas_stats(page, CANVAS)
    render(page, server, "dissolve:0.5")
    second = canvas_stats(page, CANVAS)
    assert first["hash"] == second["hash"]
    # ungefähr die Hälfte der Pixel ist schon blau
    assert 0.4 < second["pure"]["blue"] / second["n"] < 0.6


def test_wipe_right_midpoint_has_blue_left_and_red_right(page: Page, server: str) -> None:
    render(page, server, "wipe-right:0.5")
    assert pixel(page, CANVAS, 0.02, 0.5) == [0, 0, 255]
    assert pixel(page, CANVAS, 0.98, 0.5) == [255, 0, 0]


def test_circle_grows_from_the_centre(page: Page, server: str) -> None:
    render(page, server, "circle:0.3")
    assert pixel(page, CANVAS, 0.5, 0.5) == [0, 0, 255]
    assert pixel(page, CANVAS, 0.01, 0.01) == [255, 0, 0]
