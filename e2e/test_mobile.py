"""End to end on phones and tablets (add-mobile-layout TASK-INFRA-014, design.md D15).

Device profiles from Playwright (`iPhone 13`, `Pixel 7`, `iPad (gen 7)`) run in
Chromium with touch (`has_touch`); every interaction is a tap. Checks:

- no horizontal page scroll bar in any layout and orientation;
- in the compact layout every visible interactive element is at least
  44 x 44 px (app-shell "Grundlegende Barrierefreiheit", "Zielgröße am Handy");
- the whole flow import → add to the storyboard → transition → music → export
  by tapping, on the phones in portrait and landscape.

The desktop tests in the other modules keep their 1280 px viewport unchanged.
"""

import math
import re
import struct
import time
import wave
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from playwright.sync_api import Browser, CDPSession, Locator, Page, Playwright, expect
from test_export_flow import EXPORT_TIMEOUT_MS

TOUCH_TARGET = 44
"""Minimum size of an interactive element in px (design.md D2)."""

PHONES = ("iPhone 13", "Pixel 7")
TABLET = "iPad (gen 7)"

INTERACTIVE = (
    "button, [role=button], [role=tab], [role=slider], [role=menuitem], "
    "[role=menuitemcheckbox], a[href], select, textarea, input:not([type=hidden])"
)

SMALL_TARGETS_JS = """
(selector) => {
  const small = [];
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('[aria-hidden="true"]') || el.getAttribute("aria-hidden") === "true") continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width < 43.5 || r.height < 43.5) {
      const name = el.getAttribute("aria-label") || el.textContent.trim().slice(0, 40);
      const size = `${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
      small.push(`${el.tagName.toLowerCase()} "${name}" ${size}`);
    }
  }
  return small;
}
"""


def device(playwright: Playwright, name: str, landscape: bool = False) -> dict[str, Any]:
    """Playwright device profile for Chromium (portrait or landscape)."""
    profile = {k: v for k, v in playwright.devices[name].items() if k != "default_browser_type"}
    if landscape:
        size = profile["viewport"]
        profile["viewport"] = {"width": size["height"], "height": size["width"]}
        if "screen" in profile:
            screen = profile["screen"]
            profile["screen"] = {"width": screen["height"], "height": screen["width"]}
    return {**profile, "has_touch": True, "locale": "de-DE"}


@pytest.fixture
def open_device(browser: Browser, playwright: Playwright, server: str) -> Iterator[Any]:
    pages: list[Page] = []

    def _open(name: str, landscape: bool = False) -> Page:
        context = browser.new_context(**device(playwright, name, landscape))
        page = context.new_page()
        pages.append(page)
        page.goto(server)
        # Loaded, and the short notice about the backend has faded again.
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("Backend bereit")).to_be_hidden()
        return page

    yield _open
    for page in pages:
        page.context.close()


@pytest.fixture
def tune(tmp_path: Path) -> Path:
    """Two seconds of a 440 Hz tone as a 16-bit stereo WAV (no FFmpeg needed)."""
    path = tmp_path / "musik" / "ton.wav"
    path.parent.mkdir()
    rate = 44100
    with wave.open(str(path), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(rate)
        frames = bytearray()
        for i in range(rate * 2):
            sample = int(12000 * math.sin(2 * math.pi * 440 * i / rate))
            frames += struct.pack("<hh", sample, sample)
        out.writeframes(bytes(frames))
    return path


def no_horizontal_scroll(page: Page) -> None:
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 0, f"page scrolls horizontally by {overflow} px"


def small_targets(page: Page) -> list[str]:
    return page.evaluate(SMALL_TARGETS_JS, INTERACTIVE)  # type: ignore[no-any-return]


def layout(page: Page) -> str:
    return page.evaluate("document.documentElement.dataset.layout")  # type: ignore[no-any-return]


def step(page: Page, name: str) -> Locator:
    """Taps a step of the taskbar and returns its sheet."""
    page.get_by_role("navigation", name="Filmschritte").get_by_role("button", name=name).tap()
    return page.get_by_role("dialog").last


def tap_import(page: Page, entry: str, files: list[Path]) -> None:
    """'1. Aufnehmen' → entry, answering the device file chooser."""
    sheet = step(page, "1. Aufnehmen")
    with page.expect_file_chooser() as chooser:
        sheet.get_by_role("button", name=entry).tap()
    chooser.value.set_files(files)


def realistic_tap(
    cdp: CDPSession, x: float, y: float, *, jitter: float = 4.0, hold_ms: float = 140.0
) -> None:
    """touchstart -> a few small-jitter touchmoves -> touchend, like a real
    finger (mmy-edq): unlike Playwright's `.tap()`/`.click()`, which dispatch
    an instantaneous, zero-movement touch, a real tap has nonzero duration and
    a few px of incidental movement, which used to be enough to drop the
    CollectionSheet's picking tap on real hardware."""
    point = {"x": x, "y": y, "radiusX": 12, "radiusY": 12, "force": 1}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point]})
    steps = 4
    for i in range(1, steps + 1):
        time.sleep(hold_ms / 1000 / steps)
        dx = jitter if i % 2 else -jitter * 0.6
        dy = -jitter * 0.5 if i % 2 else jitter
        moved = {**point, "x": x + dx, "y": y + dy}
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [moved]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


@pytest.mark.parametrize(
    ("name", "landscape", "expected"),
    [
        ("iPhone 13", False, "compact"),
        ("iPhone 13", True, "compact"),
        ("Pixel 7", False, "compact"),
        ("Pixel 7", True, "compact"),
        (TABLET, False, "medium"),
        (TABLET, True, "medium"),
    ],
)
def test_layout_has_no_horizontal_scroll(
    open_device: Any, name: str, landscape: bool, expected: str
) -> None:
    page = open_device(name, landscape)
    assert layout(page) == expected
    expect(page.get_by_role("navigation", name="Filmschritte")).to_be_visible()
    # The monitor keeps a real picture area (4:3) in every layout.
    screen = page.locator("canvas").first.bounding_box()
    assert screen is not None and screen["height"] >= 100, screen
    no_horizontal_scroll(page)


@pytest.mark.parametrize("name", PHONES)
@pytest.mark.parametrize("landscape", [False, True], ids=["portrait", "landscape"])
def test_flow_by_tapping(
    open_device: Any, name: str, landscape: bool, images: dict[str, Path], tune: Path
) -> None:
    page = open_device(name, landscape)
    assert layout(page) == "compact"
    assert small_targets(page) == []

    # 1. Capture → import pictures; the collection sheet opens on "My Pictures".
    names = ("rot.png", "blau.png", "gruen.png")
    tap_import(page, "Bilder importieren", [images[n] for n in names])
    sheet = page.get_by_role("dialog", name="Sammlungen")
    pictures = sheet.get_by_role("list", name="Bilder")
    for n in names:
        expect(pictures.get_by_role("button", name=n)).to_be_visible()
    assert small_targets(page) == []
    no_horizontal_scroll(page)

    # Pick in the order blau, rot, gruen and add them.
    for n in ("blau.png", "rot.png", "gruen.png"):
        pictures.get_by_role("button", name=n).tap()
    sheet.get_by_role("button", name="Zum Bildstreifen hinzufügen (3)").tap()
    expect(sheet).to_be_hidden()
    strip = page.get_by_role("list", name="Bildstreifen")
    for number, n in enumerate(("blau.png", "rot.png", "gruen.png"), start=1):
        expect(strip.get_by_role("button", name=f"Bild {number}: {n}, 5,00 s")).to_be_visible()

    # Transition: tap the slot before picture 2, choose "Kreis", done.
    page.get_by_role("button", name="Übergang vor Bild 2: keiner (harter Schnitt)").tap()
    transition = page.get_by_role("dialog", name="Übergang")
    transition.get_by_role("button", name="Kreis", exact=True).tap()
    assert small_targets(page) == []
    transition.get_by_role("button", name="Fertig").tap()
    expect(transition).to_be_hidden()
    expect(page.get_by_role("button", name="Übergang vor Bild 2: Kreis, 1,25 s")).to_be_visible()

    # Music: import, pick, add to the music track.
    tap_import(page, "Audio oder Musik importieren", [tune])
    sheet = page.get_by_role("dialog", name="Sammlungen")
    music = sheet.get_by_role("list", name="Musik", exact=True)
    music.get_by_role("button", name="ton.wav, 0:02").tap()
    sheet.get_by_role("button", name="Zur Musikleiste hinzufügen (1)").tap()
    expect(sheet).to_be_hidden()
    track = page.get_by_role("list", name="Musikleiste")
    expect(track.get_by_role("button", name="Musikstück 1: ton.wav, 0:02")).to_be_visible()

    # Select a picture: the action bar appears and keeps the target size.
    strip.get_by_role("button", name="Bild 1: blau.png, 5,00 s").tap()
    expect(page.get_by_role("toolbar", name="Aktionen: Bild 1 des Storyboards")).to_be_visible()
    assert small_targets(page) == []
    no_horizontal_scroll(page)

    # 3. Finish → save to my computer: the wizard fills the screen.
    finish = step(page, "3. Fertig stellen")
    finish.get_by_role("button", name="Auf dem Computer speichern").tap()
    wizard = page.get_by_role("dialog", name="Film speichern")
    expect(wizard.get_by_role("heading", name="Dateiname")).to_be_visible()
    # Full screen: title at the top, Back/Next/Cancel at the bottom (after the slide-in).
    page.wait_for_function("document.getAnimations().every((a) => a.playState !== 'running')")
    title = wizard.get_by_role("heading", name="Film speichern").bounding_box()
    cancel = wizard.get_by_role("button", name="Abbrechen").bounding_box()
    viewport = page.viewport_size
    assert title is not None and cancel is not None and viewport is not None
    assert title["y"] < 80
    assert cancel["y"] + cancel["height"] > viewport["height"] - 80
    wizard.get_by_label("Dateiname:").fill("Handyfilm")
    wizard.get_by_role("button", name="Weiter").tap()
    wizard.get_by_role("radio", name="Kleine Datei (640×480)").check()  # noqa: RUF001
    wizard.get_by_role("button", name="Weiter").tap()
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)
    expect(wizard.get_by_text("Der Film „Handyfilm.mp4“ wurde gespeichert.")).to_be_visible()
    assert small_targets(page) == []
    wizard.get_by_role("button", name="Fertig stellen").tap()
    expect(wizard).to_be_hidden()


def test_menu_sheet_keeps_the_target_size(open_device: Any) -> None:
    page = open_device("Pixel 7")
    page.get_by_role("banner").get_by_role("button", name="Menü").tap()
    menu = page.get_by_role("dialog", name="Menü")
    menu.get_by_role("button", name="Datei").tap()
    expect(menu.get_by_role("button", name="Neues Projekt")).to_be_visible()
    assert small_targets(page) == []
    no_horizontal_scroll(page)


def test_pick_tap_registers_with_realistic_touch_timing(
    open_device: Any, images: dict[str, Path]
) -> None:
    """mmy-edq: tapping a CollectionSheet tile to pick it, then the footer's
    add button, must still work when the taps have a real finger's nonzero
    duration and a few px of jitter - Playwright's idealized .tap() (zero
    duration, zero movement) could not reproduce the reported failure."""
    page = open_device("Pixel 7")
    names = ("rot.png", "blau.png")
    tap_import(page, "Bilder importieren", [images[n] for n in names])
    sheet = page.get_by_role("dialog", name="Sammlungen")
    cdp = page.context.new_cdp_session(page)

    for name in names:
        tile = sheet.get_by_role("list", name="Bilder").get_by_role("button", name=name)
        expect(tile).to_be_visible()
        box = tile.bounding_box()
        assert box is not None
        realistic_tap(cdp, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        expect(tile).to_have_attribute("aria-pressed", "true")

    add = sheet.get_by_role("button", name="Zum Bildstreifen hinzufügen (2)")
    box = add.bounding_box()
    assert box is not None
    realistic_tap(cdp, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    expect(sheet).to_be_hidden()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name=f"Bild 1: {names[0]}, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name=f"Bild 2: {names[1]}, 5,00 s")).to_be_visible()


def pick_tile(page: Page, name: str) -> Locator:
    """The collection sheet's tile for picture `name`."""
    sheet = page.get_by_role("dialog", name="Sammlungen")
    return sheet.get_by_role("list", name="Bilder").get_by_role("button", name=name)


def tile_centre(tile: Locator) -> tuple[float, float]:
    expect(tile).to_be_visible()
    box = tile.bounding_box()
    assert box is not None
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


@pytest.mark.parametrize("hold_ms", [120, 300, 450, 700])
def test_pick_tap_survives_a_deliberate_hold(
    open_device: Any, images: dict[str, Path], hold_ms: int
) -> None:
    """mmy-43e: a deliberate finger tap on a phone routinely lasts 400-700 ms.
    Every one of those durations has to toggle the pick; none of them may be
    reclassified as a long press on release and open the tile's action sheet
    instead - that left the footer button at "(0)" and the storyboard empty.
    Measured with real dispatched touch events, because `.tap()`/`.click()`
    are instantaneous and pass even with the bug present."""
    page = open_device("Pixel 7")
    tap_import(page, "Bilder importieren", [images["rot.png"]])
    cdp = page.context.new_cdp_session(page)
    tile = pick_tile(page, "rot.png")
    x, y = tile_centre(tile)
    add = page.get_by_role("dialog", name="Sammlungen").get_by_role(
        "button", name="Zum Bildstreifen hinzufügen (1)"
    )

    realistic_tap(cdp, x, y, hold_ms=hold_ms)
    expect(tile).to_have_attribute("aria-pressed", "true")
    expect(add).to_be_enabled()
    expect(page.get_by_role("menuitem", name="Eigenschaften")).to_have_count(0)

    # The same hold is also the way back out of the selection.
    realistic_tap(cdp, x, y, hold_ms=hold_ms)
    expect(tile).to_have_attribute("aria-pressed", "false")
    expect(page.get_by_role("menuitem", name="Eigenschaften")).to_have_count(0)


def test_long_held_tap_still_adds_to_the_storyboard(
    open_device: Any, images: dict[str, Path]
) -> None:
    """mmy-43e, the user's report end to end ("Wenn ich da drauf klicke, bleibt
    der Bildstreifen leer"): picking with a slow 700 ms tap and then tapping
    the footer button puts the picture into the filmstrip."""
    page = open_device("Pixel 7")
    tap_import(page, "Bilder importieren", [images["blau.png"]])
    cdp = page.context.new_cdp_session(page)
    sheet = page.get_by_role("dialog", name="Sammlungen")
    realistic_tap(cdp, *tile_centre(pick_tile(page, "blau.png")), hold_ms=700)
    add = sheet.get_by_role("button", name="Zum Bildstreifen hinzufügen (1)")
    realistic_tap(cdp, *tile_centre(add), hold_ms=700)
    expect(sheet).to_be_hidden()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name="Bild 1: blau.png, 5,00 s")).to_be_visible()


# mmy-bmh: the slop that separates a tap from a pan. Mirrors TAP_SLOP in
# apps/web/src/ui/useLongPress.ts - a drift up to it picks, a pan past it does
# not. Kept as a literal on purpose: the e2e test is the outside view and must
# notice if the source ever moves the threshold.
TAP_SLOP = 32


def drift_tap(
    cdp: CDPSession,
    x: float,
    y: float,
    *,
    dx: float = 0.0,
    dy: float = 0.0,
    hold_ms: float = 150.0,
    steps: int = 4,
) -> None:
    """A tap whose finger travels `dx`/`dy` from touchdown to lift (mmy-bmh).

    Unlike `realistic_tap` above, which only jitters a few px around one point,
    this walks the finger in one direction - the thumb roll the Product Owner's
    device produced. Past about 16 px Chrome revokes the pointer and fires no
    click at all, so only a gesture that keeps reading the touch stream can
    still pick the tile."""
    point = {"x": x, "y": y, "radiusX": 14, "radiusY": 14, "force": 1}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point]})
    for i in range(1, steps + 1):
        time.sleep(hold_ms / 1000 / steps)
        moved = {**point, "x": x + dx * i / steps, "y": y + dy * i / steps}
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [moved]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


@pytest.mark.parametrize(
    ("axis", "vector"),
    [("horizontal", (1.0, 0.0)), ("vertical", (0.0, 1.0))],
)
def test_pick_tap_survives_a_drifting_finger(
    open_device: Any, images: dict[str, Path], axis: str, vector: tuple[float, float]
) -> None:
    """mmy-bmh, the third axis of this gesture: a thumb does not land and lift
    on one pixel. The Product Owner's device lost the pick at 16 px of vertical
    drift - no selection, no menu, no PUT /api/project - while the two earlier
    fixes (mmy-edq, mmy-43e) shipped tests that tap without moving at all.

    Every drift up to the tap slop has to toggle the pick, in both axes."""
    page = open_device("Pixel 7")
    tap_import(page, "Bilder importieren", [images["rot.png"]])
    cdp = page.context.new_cdp_session(page)
    tile = pick_tile(page, "rot.png")
    add = page.get_by_role("dialog", name="Sammlungen").get_by_role(
        "button", name="Zum Bildstreifen hinzufügen (1)"
    )
    ux, uy = vector

    for drift in (0, 8, 10, 12, 16, 20, 25, TAP_SLOP):
        x, y = tile_centre(tile)
        drift_tap(cdp, x, y, dx=drift * ux, dy=drift * uy)
        # Playwright names the failing locator; the drift is in the message.
        expect(tile, f"{drift} px of {axis} drift must pick").to_have_attribute(
            "aria-pressed", "true", timeout=2000
        )
        expect(add).to_be_enabled()
        expect(page.get_by_role("menuitem", name="Eigenschaften")).to_have_count(0)
        # The same drifting tap is also the way back out of the selection.
        x, y = tile_centre(tile)
        drift_tap(cdp, x, y, dx=drift * ux, dy=drift * uy)
        expect(tile).to_have_attribute("aria-pressed", "false", timeout=2000)


def grid_scroller(page: Page) -> Any:
    """The collection sheet's scroll container, found the way the gesture code
    finds it (nearest really scrolling ancestor), not by CSS module class."""
    return page.evaluate_handle(
        """() => {
            const panel = document.querySelector('dialog [role=tabpanel]');
            for (let n = panel; n; n = n.parentElement) {
                const s = getComputedStyle(n);
                const scrolls = s.overflowY === 'auto' || s.overflowY === 'scroll';
                if (scrolls && n.scrollHeight > n.clientHeight) return n;
            }
            return null;
        }"""
    )


def pan(cdp: CDPSession, x: float, y: float, dy: float, steps: int = 10) -> None:
    """A deliberate scroll of the grid, started on a tile."""
    point = {"x": x, "y": y, "radiusX": 14, "radiusY": 14, "force": 1}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point]})
    for i in range(1, steps + 1):
        time.sleep(0.016)
        cdp.send(
            "Input.dispatchTouchEvent",
            {"type": "touchMove", "touchPoints": [{**point, "y": y + dy * i / steps}]},
        )
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def test_drift_and_pan_are_told_apart_on_a_scrolling_grid(
    open_device: Any, many_images: list[Path]
) -> None:
    """mmy-bmh, the two halves of the same threshold on the grid where it
    matters - the one that scrolls, in the axis it scrolls in.

    A drifting tap picks, before and after the grid has been scrolled; a
    deliberate pan started on a tile scrolls the grid and leaves the selection
    exactly as it was. 32 px of finger travel separates them: an incidental
    thumb roll stays well under it (25 px measured at worst), a pan covers
    several times it."""
    page = open_device("Pixel 7")
    tap_import(page, "Bilder importieren", many_images)
    sheet = page.get_by_role("dialog", name="Sammlungen")
    grid = sheet.get_by_role("list", name="Bilder")
    expect(grid.get_by_role("button")).to_have_count(len(many_images), timeout=60_000)
    cdp = page.context.new_cdp_session(page)

    scroller = grid_scroller(page)
    assert scroller.as_element() is not None, "the collection grid has to scroll for this test"
    assert scroller.evaluate("el => el.scrollHeight - el.clientHeight") > 100

    tile = grid.get_by_role("button").first
    name = tile.get_attribute("aria-label")
    assert name is not None

    # A pan started on the tile scrolls and picks nothing.
    expect(tile).to_have_attribute("aria-pressed", "false")
    x, y = tile_centre(tile)
    pan(cdp, x, y, -140)
    page.wait_for_timeout(700)
    assert scroller.evaluate("el => el.scrollTop") > 50, "the pan did not scroll the grid"
    expect(tile).to_have_attribute("aria-pressed", "false")
    expect(page.get_by_role("menuitem", name="Eigenschaften")).to_have_count(0)

    # On the scrolled grid, a drifting tap still picks - in both axes, and
    # including the 16 px of vertical drift that was reported lost.
    for dx, dy in ((0, 12), (0, 16), (0, 25), (12, 0), (16, 0), (25, 0)):
        x, y = tile_centre(tile)
        drift_tap(cdp, x, y, dx=dx, dy=dy)
        expect(tile).to_have_attribute("aria-pressed", "true", timeout=2000)
        x, y = tile_centre(tile)
        drift_tap(cdp, x, y, dx=dx, dy=dy)
        expect(tile).to_have_attribute("aria-pressed", "false", timeout=2000)

    # And the picked tile really reaches the backend: pick, add, filmstrip.
    x, y = tile_centre(tile)
    drift_tap(cdp, x, y, dy=16)
    expect(tile).to_have_attribute("aria-pressed", "true", timeout=2000)
    add = sheet.get_by_role("button", name="Zum Bildstreifen hinzufügen (1)")
    realistic_tap(cdp, *tile_centre(add))
    expect(sheet).to_be_hidden()
    expect(
        page.get_by_role("list", name="Bildstreifen").get_by_role("button", name=f"Bild 1: {name}")
    ).to_be_visible()


def test_a_real_hold_announces_itself_and_opens_the_tile_actions(
    open_device: Any, images: dict[str, Path]
) -> None:
    """mmy-43e/design.md D7: the tile actions ("Eigenschaften", "Löschen") stay
    reachable by holding the tile, but only for a hold no deliberate tap
    reaches, and the tile marks itself armed while the finger is still down, so
    the release is no longer ambiguous. Such a hold does not pick the tile."""
    page = open_device("Pixel 7")
    tap_import(page, "Bilder importieren", [images["gruen.png"]])
    cdp = page.context.new_cdp_session(page)
    tile = pick_tile(page, "gruen.png")
    x, y = tile_centre(tile)

    point = {"x": x, "y": y, "radiusX": 12, "radiusY": 12, "force": 1}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point]})
    try:
        # Armed while the finger is down - no menu yet, nothing picked yet.
        expect(tile).to_have_attribute("data-armed", "true")
        expect(page.get_by_role("menuitem", name="Eigenschaften")).to_have_count(0)
        expect(tile).to_have_attribute("aria-pressed", "false")
    finally:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

    menu = page.get_by_role("menu", name="Bild „gruen.png“")
    expect(menu.get_by_role("menuitem", name="Eigenschaften")).to_be_visible()
    expect(menu.get_by_role("menuitem", name="Löschen")).to_be_visible()
    expect(tile).to_have_attribute("aria-pressed", "false")
    menu.get_by_role("menuitem", name="Eigenschaften").tap()
    expect(page.get_by_role("dialog", name="Eigenschaften von „gruen.png“")).to_be_visible()


def test_tablet_shows_monitor_and_collection_side_by_side(open_device: Any) -> None:
    page = open_device(TABLET)
    collection = page.get_by_role("region", name="Sammlung: Meine Bilder").bounding_box()
    monitor = page.get_by_role("region", name="Vorschau").bounding_box()
    storyboard = page.get_by_role("region", name="Storyboard").bounding_box()
    assert collection and monitor and storyboard
    assert collection["x"] + collection["width"] <= monitor["x"] + 1
    assert abs(collection["y"] - monitor["y"]) < 2
    assert storyboard["y"] >= monitor["y"] + monitor["height"] - 1
    assert small_targets(page) == []


# mmy-c4r: the same gesture outside picking mode - a picture in the filmstrip
# and a clip in the music bar. Both kept the 400 ms default, so a deliberate
# tap opened the element's action sheet instead of selecting it; and because
# that sheet's first entries are useful ones, nothing looked broken and the
# user blamed themselves.
STRIP_TARGETS = [
    ("Bildstreifen", "Bild {n}: rot.png, 5,00 s", "Bild {n} des Storyboards"),
    ("Musikleiste", "Musikstück {n}: ton.wav, 0:02", "Musikstück {n} der Musikleiste"),
]
STRIP_IDS = ["picture", "clip"]


HIT_JS = """
(node) => {
  const r = node.getBoundingClientRect();
  // The centre first - that is where a finger aims - then inwards, so a box
  // whose middle is clipped away still yields a point the element really owns.
  const fractions = [0.5, 0.35, 0.65, 0.2, 0.8];
  for (const fy of fractions) {
    for (const fx of fractions) {
      const x = r.x + r.width * fx;
      const y = r.y + r.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit !== null && node.contains(hit)) return [x, y];
    }
  }
  return null;
}
"""

NAME_JS = """
(node) => {
  const r = node.getBoundingClientRect();
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const owner = el === null ? null : (el.closest("[aria-label]") ?? el);
  const over = owner === null
    ? "nothing"
    : `${el.tagName} in ${owner.getAttribute("aria-label") ?? owner.className}`;
  return `box ${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`
    + ` has ${over} at its centre`;
}
"""


def hit_report(el: Locator) -> str:
    """Where `el` claims to be and what is painted there - for an assertion."""
    return str(el.evaluate(NAME_JS))


def touch_point(el: Locator) -> tuple[float, float]:
    """A viewport coordinate that provably belongs to `el`.

    Unlike `tile_centre` above, which reads a tile of a sheet that always fits,
    this cannot just halve a bounding box. CDP dispatches touch events at
    absolute viewport coordinates, and in the compact layout the filmstrip and
    the music bar are the lowest things on the screen, inside strips that clip
    their overflow - so once the action bar of the first selection appears above
    the taskbar, an element's layout box can reach outside the band its strip
    actually paints. Its geometric centre is then a point the element does not
    own: the touch lands on the container instead, and the sweep reports a lost
    tap or a menu that opened by itself - a failure that looks exactly like the
    bug under test.

    So the point is not merely computed, it is verified against
    `elementFromPoint` and moved inwards until it really hits (`HIT_JS`). The
    message names what was painted there if no point ever does."""
    expect(el).to_be_visible()
    el.scroll_into_view_if_needed()
    el.page.wait_for_function("document.getAnimations().every((a) => a.playState !== 'running')")
    for _ in range(100):
        point = el.evaluate(HIT_JS)
        if point is not None:
            return (point[0], point[1])
        time.sleep(0.05)
    raise AssertionError(f"no point of {el} is touchable: {hit_report(el)}")


def fill_storyboard(page: Page, images: dict[str, Path], tune: Path) -> None:
    """The same picture twice in the filmstrip and the same tune twice in the
    music bar.

    Two of each on purpose: selecting is not a toggle here, so one element
    cannot tell a second successful tap from a tap that did nothing. Alternating
    between two identical elements makes every tap of a sweep visible on its
    own, and keeps one label per list."""
    for _ in range(2):
        tap_import(page, "Bilder importieren", [images["rot.png"]])
        sheet = page.get_by_role("dialog", name="Sammlungen")
        sheet.get_by_role("list", name="Bilder").get_by_role("button", name="rot.png").tap()
        sheet.get_by_role("button", name="Zum Bildstreifen hinzufügen (1)").tap()
        expect(sheet).to_be_hidden()
    for _ in range(2):
        tap_import(page, "Audio oder Musik importieren", [tune])
        sheet = page.get_by_role("dialog", name="Sammlungen")
        music = sheet.get_by_role("list", name="Musik", exact=True)
        music.get_by_role("button", name="ton.wav, 0:02").tap()
        sheet.get_by_role("button", name="Zur Musikleiste hinzufügen (1)").tap()
        expect(sheet).to_be_hidden()
    # Each add leaves a short notice above the taskbar, over the two bars a
    # sweep is about to touch. It goes away by itself (NOTICE_DURATION); wait
    # for that here rather than letting the first tap of every sweep race it.
    expect(page.get_by_text(re.compile(r"hinzugefügt"))).to_have_count(0, timeout=10_000)


def strip_element(page: Page, list_name: str, label: str, n: int) -> Locator:
    """Element `n` of the filmstrip or of the music bar."""
    return page.get_by_role("list", name=list_name).get_by_role("button", name=label.format(n=n))


def no_action_sheet(page: Page) -> None:
    """No element's action sheet is open (its entries are menu items; the
    action bar's are plain buttons, so this does not see those)."""
    expect(page.get_by_role("menuitem", name="Entfernen")).to_have_count(0)


@pytest.mark.parametrize(("list_name", "label", "_sheet"), STRIP_TARGETS, ids=STRIP_IDS)
def test_tap_selects_despite_a_deliberate_hold(
    open_device: Any,
    images: dict[str, Path],
    tune: Path,
    list_name: str,
    label: str,
    _sheet: str,
) -> None:
    """mmy-c4r, the duration axis: a deliberate finger tap on a phone routinely
    lasts 400 to 700 ms (measured on the Product Owner's device under mmy-43e).
    Every one of those durations has to select the element; none of them may be
    reclassified as a hold on release and open the action sheet instead.

    Measured with real dispatched touch events, because `.tap()`/`.click()` are
    instantaneous and pass even with the bug present - which is exactly what let
    this survive the two earlier fixes of the same gesture."""
    page = open_device("Pixel 7")
    fill_storyboard(page, images, tune)
    cdp = page.context.new_cdp_session(page)

    for hold_ms in (120, 300, 450, 700):
        for n in (1, 2):
            element = strip_element(page, list_name, label, n)
            other = strip_element(page, list_name, label, 2 if n == 1 else 1)
            where = touch_point(element)
            realistic_tap(cdp, *where, hold_ms=hold_ms)
            # Playwright names the failing locator; the duration is in the message.
            expect(
                element, f"a {hold_ms} ms tap at {where} must select it ({hit_report(element)})"
            ).to_have_attribute("aria-pressed", "true", timeout=2000)
            expect(other).to_have_attribute("aria-pressed", "false")
            no_action_sheet(page)


@pytest.mark.parametrize(
    ("axis", "vector"),
    [("horizontal", (1.0, 0.0)), ("vertical", (0.0, 1.0))],
)
@pytest.mark.parametrize(("list_name", "label", "_sheet"), STRIP_TARGETS, ids=STRIP_IDS)
def test_tap_selects_with_a_drifting_finger(
    open_device: Any,
    images: dict[str, Path],
    tune: Path,
    list_name: str,
    label: str,
    _sheet: str,
    axis: str,
    vector: tuple[float, float],
) -> None:
    """mmy-c4r, the drift axis (mmy-bmh's half of the same gesture): a thumb
    does not land and lift on one pixel, and past about 16 px Chrome revokes the
    pointer and fires no click at all. Every drift up to the tap slop has to
    select the element, in both axes."""
    page = open_device("Pixel 7")
    fill_storyboard(page, images, tune)
    cdp = page.context.new_cdp_session(page)
    ux, uy = vector

    for drift in (0, 8, 10, 12, 16, 20, 25, TAP_SLOP):
        for n in (1, 2):
            element = strip_element(page, list_name, label, n)
            other = strip_element(page, list_name, label, 2 if n == 1 else 1)
            where = touch_point(element)
            drift_tap(cdp, *where, dx=drift * ux, dy=drift * uy)
            expect(
                element,
                f"{drift} px of {axis} drift at {where} must select it ({hit_report(element)})",
            ).to_have_attribute("aria-pressed", "true", timeout=2000)
            expect(other).to_have_attribute("aria-pressed", "false")
            no_action_sheet(page)


def hold(cdp: CDPSession, element: Locator, sheet: Locator) -> None:
    """Presses `element` until it says it is armed, then lifts the finger."""
    x, y = touch_point(element)
    point = {"x": x, "y": y, "radiusX": 12, "radiusY": 12, "force": 1}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point]})
    try:
        # Armed while the finger is down, and nothing decided yet.
        expect(element).to_have_attribute("data-armed", "true")
        expect(sheet).to_have_count(0)
    finally:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


@pytest.mark.parametrize(
    ("list_name", "label", "sheet", "entry", "dialog"),
    [
        (*STRIP_TARGETS[0], "Eigenschaften…", "Eigenschaften von Bild 1"),
        (*STRIP_TARGETS[1], "Lautstärke…", "Lautstärke von Musikstück 1"),
    ],
    ids=STRIP_IDS,
)
def test_a_real_hold_announces_itself_and_opens_the_action_sheet(
    open_device: Any,
    images: dict[str, Path],
    tune: Path,
    list_name: str,
    label: str,
    sheet: str,
    entry: str,
    dialog: str,
) -> None:
    """mmy-c4r/design.md D6: the element's actions stay reachable by holding it,
    but only for a hold no deliberate tap reaches, and the element marks itself
    armed while the finger is still down - the same announcement the collection
    sheet makes (mmy-43e), and the moment the reorder drag arms too (D13), so
    one press announces one armed gesture at one moment."""
    page = open_device("Pixel 7")
    fill_storyboard(page, images, tune)
    cdp = page.context.new_cdp_session(page)
    element = strip_element(page, list_name, label, 1)
    opened = page.get_by_role("dialog", name=sheet.format(n=1))

    hold(cdp, element, opened)
    expect(opened).to_be_visible()
    expect(element).not_to_have_attribute("data-armed", "true")
    opened.get_by_role("menuitem", name=entry).tap()
    expect(page.get_by_role("dialog", name=dialog)).to_be_visible()
    page.get_by_role("dialog", name=dialog).get_by_role("button", name="Dialog schließen").tap()

    # ... and the sheet's Remove really removes the element.
    hold(cdp, element, page.get_by_role("dialog", name=sheet.format(n=1)))
    page.get_by_role("dialog", name=sheet.format(n=1)).get_by_role(
        "menuitem", name="Entfernen"
    ).tap()
    expect(strip_element(page, list_name, label, 2)).to_have_count(0)
