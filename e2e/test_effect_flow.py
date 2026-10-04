"""End to end: set an effect on an element, see it in the preview, find it in
the exported movie (TASK-INFRA-022, add-effects-catalog design.md D2/D4).

The element carries "Negativ", so the pure red picture has to show up cyan in
both places: in the monitor (read from an element screenshot, like
test_slideshow_flow.py) and in a frame extracted from the downloaded MP4.
"""

import io
import subprocess
from pathlib import Path

import pytest
from mmy_backend.ffmpeg import ffmpeg_binary
from PIL import Image, ImageStat
from playwright.sync_api import Locator, Page, expect

EXPORT_TIMEOUT_MS = 180_000
# Red through "Negativ"; H.264 at 4:2:0 shifts saturated colours by a few units.
CYAN = (0, 255, 255)
CHANNEL_TOLERANCE = 24


def mean_rgb(locator: Locator) -> tuple[float, float, float]:
    img = Image.open(io.BytesIO(locator.screenshot())).convert("RGB")
    # Only the centre of the picture; the letterbox bars are black.
    w, h = img.size
    crop = img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))
    r, g, b = ImageStat.Stat(crop).mean
    return (r, g, b)


def frame_mean_rgb(movie: Path, at: float, tmp_path: Path) -> tuple[float, float, float]:
    """Mean colour of the movie frame at `at` seconds (centre, without the bars)."""
    binary = ffmpeg_binary()
    if binary is None:
        pytest.fail("ffmpeg not found (Pixi environment or MMY_FFMPEG)")
    out = tmp_path / f"frame-{at}.png"
    subprocess.run(
        [
            binary,
            *("-v", "error", "-y", "-ss", str(at), "-i", str(movie)),
            *("-frames:v", "1"),
            str(out),
        ],
        check=True,
        capture_output=True,
    )
    img = Image.open(out).convert("RGB")
    w, h = img.size
    crop = img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))
    r, g, b = ImageStat.Stat(crop).mean
    return (r, g, b)


def drag_onto(page: Page, source: Locator, target: Locator) -> None:
    """Real pointer drag onto the centre of `target` (dnd-kit needs > 5 px)."""
    s = source.bounding_box()
    t = target.bounding_box()
    assert s and t
    page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2)
    page.mouse.down()
    page.mouse.move(s["x"] + s["width"] / 2 + 10, s["y"] + s["height"] / 2 + 10, steps=5)
    page.mouse.move(t["x"] + t["width"] / 2, t["y"] + t["height"] / 2, steps=20)
    page.mouse.up()


def test_effect_from_the_collection_reaches_preview_and_export(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # One pure red picture in the storyboard.
    page.locator("input[type=file]").set_input_files([images["rot.png"], images["blau.png"]])
    collection = page.get_by_role("list", name="Bilder")
    expect(collection.get_by_role("button", name="rot.png")).to_be_visible()
    collection.get_by_role("button", name="rot.png").dblclick()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name="Bild 1: rot.png, 5,00 s")).to_be_visible()

    monitor = page.get_by_role("img", name="Vorschaubild")
    before = mean_rgb(monitor)
    assert before[0] > 150 and before[2] < 80, f"the picture should be red: {before}"

    # "Videoeffekte": drag "Negativ" onto the effect slot of picture 1.
    page.get_by_role("button", name="Videoeffekte anzeigen").click()
    effects = page.get_by_role("list", name="Effekte")
    slot = page.get_by_role("button", name="Effekt-Platz für Bild 1: kein Effekt")
    expect(slot).to_be_visible()
    drag_onto(page, effects.get_by_role("button", name="Negativ", exact=True), slot)

    expect(page.get_by_role("button", name="Effekt-Platz für Bild 1: Negativ")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # The preview shows the effect: red through "Negativ" is cyan.
    page.get_by_role("button", name="Stopp").click()
    preview = mean_rgb(monitor)
    assert preview[0] < 80 and preview[1] > 150 and preview[2] > 150, (
        f"the preview should be cyan: {preview}"
    )

    # Export: the same effect at the same spot in the movie.
    page.get_by_text("Auf dem Computer speichern").click()
    wizard = page.get_by_role("dialog", name="Film speichern")
    wizard.get_by_label("Dateiname:").fill("Effekt")
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("radio", name="Kleine Datei (640×480)").check()  # noqa: RUF001
    wizard.get_by_role("button", name="Weiter").click()
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)

    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    movie = tmp_path / "download" / "Effekt.mp4"
    download.save_as(movie)

    exported = frame_mean_rgb(movie, 2.0, tmp_path)
    for channel, (value, expected_value) in enumerate(zip(exported, CYAN, strict=True)):
        assert abs(value - expected_value) <= CHANNEL_TOLERANCE, (
            f"channel {channel} of the exported frame is {value}, expected ~{expected_value} "
            f"(frame mean {exported})"
        )

    # Removing it again ("Keinen Effekt") returns the preview to the plain picture.
    # Scoped to the wizard: the task pane has a "Film fertig stellen" section too.
    wizard.get_by_role("button", name="Fertig stellen", exact=True).click()
    expect(wizard).to_be_hidden()
    page.get_by_role("button", name="Effekt-Platz für Bild 1: Negativ").click(button="right")
    menu = page.get_by_role("menu", name="Effekt-Platz für Bild 1")
    menu.get_by_role("menuitem", name="Keinen Effekt").click()
    expect(page.get_by_role("button", name="Effekt-Platz für Bild 1: kein Effekt")).to_be_visible()
    after = mean_rgb(monitor)
    assert after[0] > 150 and after[2] < 80, f"the picture should be red again: {after}"
