"""End to end: build a whole movie with AutoMovie and export it unchanged
(TASK-INFRA-025, add-automovie design.md D2/D3).

Extras → "AutoMovie…" with the style "Klassisch" on a filled media collection:
a title element with the entered film title opens the filmstrip, every picture
follows in import order, an "Ende" title closes it, with "Überblenden" between
all of them; the "Film speichern" wizard exports that result like any
hand-built project - the red picture is still pure red in the downloaded MP4.
"""

import io
import re
import subprocess
from pathlib import Path

import pytest
from mmy_backend.ffmpeg import ffmpeg_binary
from PIL import Image, ImageStat
from playwright.sync_api import Locator, Page, expect

EXPORT_TIMEOUT_MS = 180_000
# Two titles and three pictures of 5 s with four 1.25 s transitions
# overlapping: 25 - 4 * 1.25.
MOVIE_SECONDS = "0:00:20,00"
# The red picture is the second element: it starts at 5 - 1.25 s, its still
# runs from 5,00 s to 7,50 s (where the transition into green begins).
RED_STILL_SECONDS = 6.0
CHANNEL_TOLERANCE = 24


def mean_rgb(source: Locator | Path) -> tuple[float, float, float]:
    """Mean colour of the picture centre, without the letterbox bars."""
    data = source.screenshot() if isinstance(source, Locator) else source.read_bytes()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    crop = img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))
    r, g, b = ImageStat.Stat(crop).mean
    return (r, g, b)


def frame(movie: Path, at: float, tmp_path: Path) -> Path:
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
    return out


def test_automovie_classic_builds_the_movie_and_exports_it(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # A filled collection; nothing is put on the filmstrip by hand.
    page.locator("input[type=file]").set_input_files(
        [images["rot.png"], images["gruen.png"], images["blau.png"]]
    )
    collection = page.get_by_role("list", name="Bilder")
    for name in ("rot.png", "gruen.png", "blau.png"):
        expect(collection.get_by_role("button", name=name)).to_be_visible()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name=re.compile(r"^Bild \d+: "))).to_have_count(0)

    # Extras → "AutoMovie…": film title, style "Klassisch", "Erstellen".
    page.get_by_role("menuitem", name="Extras", exact=True).click()
    page.get_by_role("menuitem", name="AutoMovie…", exact=True).click()
    dialog = page.get_by_role("dialog", name="AutoMovie")
    dialog.get_by_label("Filmtitel:").fill("Urlaub")
    # Without a music track "Musikvideo" cannot be chosen (spec automovie).
    expect(dialog.get_by_role("radio", name=re.compile("Musikvideo"))).to_be_disabled()
    dialog.get_by_role("radio", name=re.compile("Klassisch")).check()
    dialog.get_by_role("button", name="Erstellen").click()
    expect(dialog).to_be_hidden()

    # The film title opens the filmstrip, "Ende" closes it, and the whole
    # collection sits between them in import order (design.md D2 step 4).
    expect(strip.get_by_role("button", name="Titel 1: Urlaub, 5,00 s")).to_be_visible()
    for number, name in enumerate(("rot.png", "gruen.png", "blau.png"), start=2):
        expect(strip.get_by_role("button", name=f"Bild {number}: {name}, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Titel 5: Ende, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name=re.compile(r"^Bild \d+: "))).to_have_count(3)
    expect(strip.get_by_role("button", name=re.compile(r"^Titel \d+: "))).to_have_count(2)

    # "Überblenden" between all neighbours; the opening title has no slot at all.
    expect(strip.get_by_role("button", name=re.compile(r"^Übergang vor Bild "))).to_have_count(4)
    for number in (2, 3, 4, 5):
        expect(
            strip.get_by_role("button", name=f"Übergang vor Bild {number}: Überblenden, 1,25 s")
        ).to_be_visible()
    expect(page.get_by_label("Zeit")).to_have_text(f"0:00:00,00 / {MOVIE_SECONDS}")
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # The collection itself is untouched.
    for name in ("rot.png", "gruen.png", "blau.png"):
        expect(collection.get_by_role("button", name=name)).to_be_visible()

    # The result exports like any other project.
    page.get_by_text("Auf dem Computer speichern").click()
    wizard = page.get_by_role("dialog", name="Film speichern")
    wizard.get_by_label("Dateiname:").fill("AutoMovie")
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("radio", name="Kleine Datei (640×480)").check()  # noqa: RUF001
    wizard.get_by_role("button", name="Weiter").click()
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)

    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    movie = tmp_path / "download" / "AutoMovie.mp4"
    download.save_as(movie)
    assert movie.stat().st_size > 0

    # 6 s in: the red picture stands still, both transitions around it are over.
    red = mean_rgb(frame(movie, RED_STILL_SECONDS, tmp_path))
    assert red[0] > 255 - CHANNEL_TOLERANCE and red[1] < CHANNEL_TOLERANCE, (
        f"the exported AutoMovie should show the red picture after the title: {red}"
    )
