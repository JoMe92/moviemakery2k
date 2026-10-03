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
import struct
import wave
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from playwright.sync_api import Browser, Locator, Page, Playwright, expect
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
