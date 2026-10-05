"""End to end: record a narration → it is in the export at the right spot, and
the audio level changes the mix measurably (TASK-INFRA-024,
add-narration-and-audio-levels).

The microphone is Chromium's own fake device playing a 1500 Hz sine
(`fake_microphone` in `conftest.py`), so a real `getUserMedia` +
`MediaRecorder` run produces a measurable tone. The recording is started at the
start of the second picture, so the narration must be silent in the first half
of the exported sound track and audible in the second.

The level is then exported twice more: at 75 the narration side is at half
amplitude (-6 dB), at 100 it is gone. That is the ratio of the two-stage mix
(design.md D4 and D5) measured in the finished MP4.

Audio output in headless Chromium is not reliable, so nothing here listens to
the preview; what the file contains is what counts.
"""

import math
import re
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect
from test_export_flow import EXPORT_TIMEOUT_MS, FRAME, ffprobe, open_wizard, total_seconds
from test_music_flow import rms_db

RECORD_SECONDS = 2.5
"""How long the fake microphone is recorded; comfortably above the 0.5 s minimum."""
SILENT_DB = -45.0
"""Below this a stretch counts as silent for these measurements."""


def _export(page: Page, tmp_path: Path, name: str) -> Path:
    """Runs the wizard once and returns the downloaded MP4."""
    wizard = open_wizard(page, name, "Kleine Datei (640×480)")  # noqa: RUF001
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)
    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    target = tmp_path / "download" / f"{name}.mp4"
    download.save_as(target)
    wizard.get_by_role("button", name="Fertig stellen").click()
    expect(wizard).to_be_hidden()
    return target


def _set_audio_level(page: Page, value: int) -> None:
    """Clip → "Audio-Pegel…": the one global level (design.md D4)."""
    page.get_by_role("menuitem", name="Clip").click()
    page.get_by_role("menuitem", name="Audio-Pegel…").click()
    dialog = page.get_by_role("dialog", name="Audio-Pegel")
    dialog.get_by_role("slider", name="Pegel").fill(str(value))
    dialog.get_by_role("button", name="OK").click()
    expect(dialog).to_be_hidden()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()


def test_a_recorded_narration_lands_in_the_export_and_follows_the_level(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # Two pictures of 5 s each, hard cut → a 10 s movie.
    page.get_by_test_id("media-import-input").set_input_files(
        [images["rot.png"], images["blau.png"]]
    )
    pictures = page.get_by_role("list", name="Bilder")
    strip = page.get_by_role("list", name="Bildstreifen")
    for number, name in enumerate(("rot.png", "blau.png"), start=1):
        pictures.get_by_role("button", name=name).dblclick()
        expect(strip.get_by_role("button", name=f"Bild {number}: {name}, 5,00 s")).to_be_visible()
    movie = total_seconds(page.get_by_label("Zeit"))
    assert movie == pytest.approx(10.0)

    # Put the playhead on the start of the second picture: that is where the
    # recording must land (spec narration-track "Erzählung aufnehmen").
    expect(page.get_by_role("heading", name="Erzählung")).to_be_visible()
    page.get_by_role("button", name="Nächstes Bild").click()

    # Record: one click opens the microphone and starts playback (design.md D3).
    page.get_by_role("button", name="Aufnehmen", exact=True).click()
    stop = page.get_by_role("button", name="Aufnahme beenden")
    expect(stop).to_be_visible()
    page.wait_for_timeout(int(RECORD_SECONDS * 1000))
    stop.click()

    # The clip appears on the narration bar, and the recording in "Meine Musik".
    bar = page.get_by_role("list", name="Erzählungsleiste")
    clip = bar.get_by_role("button", name="Erzählungs-Clip 1")
    expect(clip).to_be_visible(timeout=30_000)
    expect(clip).to_have_attribute("aria-label", re.compile(r"ab 0:05"))
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # Spec: the recording is in the media collection like any other audio import.
    page.get_by_role("combobox", name="Sammlungen:").select_option("music")
    music_collection = page.get_by_role("region", name="Sammlung: Meine Musik")
    expect(music_collection.get_by_role("button", name=re.compile(r"^Erzaehlung"))).to_be_visible()

    # Default level 50: the narration plays at full gain.
    full = _export(page, tmp_path, "Erzaehlung-50")
    probe = ffprobe(full)
    [video] = [s for s in probe["streams"] if s["codec_type"] == "video"]
    [audio] = [s for s in probe["streams"] if s["codec_type"] == "audio"]
    assert audio["codec_name"] == "aac"
    assert audio["sample_rate"] == "48000"
    assert audio["channels"] == 2
    assert float(video["duration"]) == pytest.approx(movie, abs=FRAME + 0.005)
    assert float(audio["duration"]) == pytest.approx(float(video["duration"]), abs=FRAME)

    # At the right spot: silent over the first picture, audible over the second.
    assert rms_db(full, 0.5, 4.5) < SILENT_DB
    loud = rms_db(full, 5.3, 5.3 + min(RECORD_SECONDS, 1.5) - 0.3)
    assert loud > -25.0, loud

    # Level 75 halves the narration side (design.md D4: -6 dB).
    _set_audio_level(page, 75)
    half = _export(page, tmp_path, "Erzaehlung-75")
    quieter = rms_db(half, 5.3, 5.3 + min(RECORD_SECONDS, 1.5) - 0.3)
    assert quieter == pytest.approx(loud - 6.02, abs=1.5), (loud, quieter)

    # Level 100 silences music and narration; without clip sound nothing is left.
    _set_audio_level(page, 100)
    silent = _export(page, tmp_path, "Erzaehlung-100")
    assert rms_db(silent, 0.0, movie) == -math.inf
