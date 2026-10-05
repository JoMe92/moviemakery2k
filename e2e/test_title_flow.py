"""End to end: a title at the start of the movie, an overlay title on a
picture and a credits element with a scroll - visible in the monitor and at
the same places in the exported movie (TASK-INFRA-023,
add-titles-and-credits design.md D1-D6, spec titles-and-credits).

Every assertion is about brightness, not about reading text: the titles are
white on black (or over a saturated picture), so "the title is there" is
"the frame is no longer uniformly black / no longer the plain picture", and
"it animates" is "two moments of the same element differ".
"""

import io
import subprocess
from pathlib import Path

import pytest
from mmy_backend.ffmpeg import ffmpeg_binary
from PIL import Image, ImageStat
from playwright.sync_api import Locator, Page, expect

EXPORT_TIMEOUT_MS = 180_000


def centre(img: Image.Image) -> Image.Image:
    """Centre of the frame, without the letterbox bars."""
    w, h = img.size
    return img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))


def monitor_image(locator: Locator) -> Image.Image:
    return Image.open(io.BytesIO(locator.screenshot())).convert("RGB")


def brightness(img: Image.Image) -> float:
    r, g, b = ImageStat.Stat(centre(img)).mean
    return (r + g + b) / 3


def peak(img: Image.Image) -> int:
    """Brightest channel value anywhere in the centre - white text spikes it."""
    return max(centre(img).convert("L").getextrema())


def peak_anywhere(img: Image.Image) -> int:
    """Brightest value in the whole frame: "Subtitle" sits near the bottom
    edge, outside the centre crop, and the letterbox bars are black anyway."""
    return max(img.convert("L").getextrema())


def movie_frame(movie: Path, at: float, tmp_path: Path, tag: str) -> Image.Image:
    binary = ffmpeg_binary()
    if binary is None:
        pytest.fail("ffmpeg not found (Pixi environment or MMY_FFMPEG)")
    out = tmp_path / f"frame-{tag}.png"
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
    return Image.open(out).convert("RGB")


def run_wizard(
    page: Page,
    *,
    placement: str,
    lines: list[str],
    style: str,
    color: str = "Weiß",
) -> None:
    """Walks the title wizard from the task pane to "Fertig"."""
    page.get_by_role("button", name="Titel oder Nachspann erstellen").click()
    wizard = page.get_by_role("dialog", name="Titel oder Nachspann erstellen")
    expect(wizard.get_by_role("heading", name="Platzierung")).to_be_visible()
    wizard.get_by_role("radio", name=placement).check()
    wizard.get_by_role("button", name="Weiter").click()

    expect(wizard.get_by_role("heading", name="Text", exact=True)).to_be_visible()
    for i, line in enumerate(lines):
        wizard.get_by_label(f"Zeile {i + 1}:").fill(line)
    wizard.get_by_role("button", name="Weiter").click()

    expect(wizard.get_by_role("heading", name="Stil")).to_be_visible()
    wizard.get_by_role("radio", name=style, exact=True).check()
    wizard.get_by_role("button", name="Weiter").click()

    expect(wizard.get_by_role("heading", name="Farbe")).to_be_visible()
    wizard.get_by_role("radio", name=color, exact=True).check()
    wizard.get_by_role("button", name="Fertig").click()
    expect(wizard).to_be_hidden()


def test_title_overlay_and_credits_reach_preview_and_export(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()
    monitor = page.get_by_role("img", name="Vorschaubild")
    strip = page.get_by_role("list", name="Bildstreifen")

    # One pure red picture in the storyboard.
    page.locator("input[type=file]").set_input_files([images["rot.png"]])
    collection = page.get_by_role("list", name="Bilder")
    expect(collection.get_by_role("button", name="rot.png")).to_be_visible()
    collection.get_by_role("button", name="rot.png").dblclick()
    expect(strip.get_by_role("button", name="Bild 1: rot.png, 5,00 s")).to_be_visible()

    # --- A title at the start of the movie (spec "Titel am Filmanfang") ------
    run_wizard(page, placement="Am Filmanfang", lines=["MEIN FILM"], style="Einfacher Titel")
    expect(strip.get_by_role("button", name="Titel 1: MEIN FILM, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Bild 2: rot.png, 5,00 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # The monitor shows the title element: white text on black, and it is
    # animated - mid-Main is brighter than a quarter into the fade-in.
    page.get_by_role("button", name="Stopp").click()
    page.get_by_role("slider", name="Suchleiste").fill("2.5")
    mid = monitor_image(monitor)
    page.get_by_role("slider", name="Suchleiste").fill("0.2")
    early = monitor_image(monitor)
    assert peak(mid) > 150, f"the title text should be bright white: peak {peak(mid)}"
    assert brightness(early) < brightness(mid), (
        f"the fade-in should still be dark at 0.2 s: {brightness(early)} vs {brightness(mid)}"
    )

    # --- An overlay title on the picture (spec "Titel auf einem Clip") -------
    strip.get_by_role("button", name="Bild 2: rot.png, 5,00 s").click()
    page.get_by_role("slider", name="Suchleiste").fill("7.5")
    plain = monitor_image(monitor)
    assert brightness(plain) > 50, "the red picture should be visible"

    run_wizard(
        page,
        placement="Auf dem gewählten Element",
        lines=["UNTERTITEL"],
        style="Untertitel",
    )
    # The element list and the durations are unchanged (spec).
    expect(strip.get_by_role("button", name="Bild 2: rot.png, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Titel 1: MEIN FILM, 5,00 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    page.get_by_role("slider", name="Suchleiste").fill("7.5")
    with_overlay = monitor_image(monitor)
    assert peak_anywhere(with_overlay) > peak_anywhere(plain), (
        "the overlay text should brighten the picture: "
        f"{peak_anywhere(with_overlay)} vs {peak_anywhere(plain)}"
    )

    # --- Credits with a scroll at the end (spec "Lange Nachspann-Liste") -----
    run_wizard(
        page,
        placement="Am Filmende",
        lines=["REGIE: ICH"],
        style="Nach oben rollen, gestapelt",
    )
    expect(strip.get_by_role("button", name="Titel 3: REGIE: ICH, 10,00 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # It moves: two moments inside the scroll differ.
    page.get_by_role("slider", name="Suchleiste").fill("12")
    scroll_early = monitor_image(monitor)
    page.get_by_role("slider", name="Suchleiste").fill("17")
    scroll_late = monitor_image(monitor)
    assert scroll_early.tobytes() != scroll_late.tobytes(), (
        "the credits scroll should move the list between 12 s and 17 s"
    )

    # --- The export shows the same thing at the same places -----------------
    page.get_by_text("Auf dem Computer speichern").click()
    wizard = page.get_by_role("dialog", name="Film speichern")
    wizard.get_by_label("Dateiname:").fill("Titel")
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("radio", name="Kleine Datei (640×480)").check()  # noqa: RUF001
    wizard.get_by_role("button", name="Weiter").click()
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)

    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    movie = tmp_path / "download" / "Titel.mp4"
    download.save_as(movie)

    # 0-5 s: the title element - white text on black, animated like the preview.
    exported_mid = movie_frame(movie, 2.5, tmp_path, "title-mid")
    exported_early = movie_frame(movie, 0.2, tmp_path, "title-early")
    assert peak(exported_mid) > 150, "the exported title should show its text"
    assert brightness(exported_early) < brightness(exported_mid), (
        "the exported title should fade in like the preview"
    )

    # 5-10 s: the picture with its overlay title.
    exported_overlay = movie_frame(movie, 7.5, tmp_path, "overlay")
    r, g, b = ImageStat.Stat(centre(exported_overlay)).mean
    assert r > 120 and r > g, f"the red picture should still be there: {(r, g, b)}"
    assert peak_anywhere(exported_overlay) > 150, "the overlay text should be in the exported frame"

    # 10-20 s: the credits, moving.
    exported_scroll_early = movie_frame(movie, 12.0, tmp_path, "credits-early")
    exported_scroll_late = movie_frame(movie, 17.0, tmp_path, "credits-late")
    assert exported_scroll_early.tobytes() != exported_scroll_late.tobytes(), (
        "the exported credits should scroll like the preview"
    )

    wizard.get_by_role("button", name="Fertig stellen", exact=True).click()
    expect(wizard).to_be_hidden()
