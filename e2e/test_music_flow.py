"""End to end: pictures + music → music strip → export with an audible soundtrack (TASK-INFRA-013).

A short test melody (MP3, generated with the FFmpeg of the Pixi environment) is
imported through the same file chooser as the pictures, lands in "Meine Musik"
(My Music) and is added to the music strip "Audio/Musik" by double-click. The
melody is longer than the movie, so it is cut at the end of the movie and
faded out (spec music-track "Musik am Filmende"). The exported movie must
carry an AAC 48 kHz stereo track exactly as long as the video (± 1 frame,
spec movie-export "Tonspur aus der Musikspur"), audible in the middle and
fading out in the last second (`astats`).

Audio output in headless Chromium is not reliable, so the preview part only
checks that pressing play creates an AudioContext (debug hook
`window.__mmyAudio`, add-music-track design.md "Risks"); the scheduling
itself is covered by the component tests with a fake AudioContext.
"""

import math
import re
import subprocess
from pathlib import Path

import pytest
from mmy_backend.ffmpeg import ffmpeg_binary
from playwright.sync_api import Page, expect
from test_export_flow import EXPORT_TIMEOUT_MS, FRAME, ffprobe, open_wizard, total_seconds

MELODY_SECONDS = 12.0
"""Longer than the movie (2 x 5 s), so the end-of-movie fade-out applies."""
NOTES_HZ = (440.0, 554.37, 659.25, 880.0)
"""A major arpeggio, one note per half second."""
_RMS_RE = re.compile(r"RMS level dB:\s*(\S+)")


def _ffmpeg() -> str:
    binary = ffmpeg_binary()
    if binary is None:
        pytest.fail("ffmpeg not found (Pixi environment or MMY_FFMPEG)")
    return binary


@pytest.fixture
def melody(tmp_path: Path) -> Path:
    """Stereo MP3 (44.1 kHz) with a simple sine arpeggio, amplitude 0.5 (≈ -9 dBFS RMS)."""
    path = tmp_path / "musik" / "melodie.mp3"
    path.parent.mkdir()
    # Frequency picked per half second: f0 + (f1-f0)*[n==1] + ... with n = floor(2t) mod 4.
    n = "mod(floor(2*t),4)"
    freq = "+".join(f"{hz}*eq({n},{i})" for i, hz in enumerate(NOTES_HZ))
    subprocess.run(
        [
            _ffmpeg(),
            *("-v", "error", "-y", "-f", "lavfi"),
            "-i",
            f"aevalsrc='0.5*sin(2*PI*({freq})*t)':s=44100:d={MELODY_SECONDS}",
            *("-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k"),
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


def rms_db(path: Path, start: float, end: float) -> float:
    """Overall RMS level (dBFS) of the first audio stream in [start, end); -inf if silent."""
    result = subprocess.run(
        [
            _ffmpeg(),
            *("-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0"),
            "-af",
            f"atrim=start={start}:end={end},"
            "astats=measure_perchannel=none:measure_overall=RMS_level",
            *("-f", "null", "-"),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    matches = _RMS_RE.findall(result.stderr)
    assert matches, result.stderr
    value = matches[-1]
    return -math.inf if value in ("-inf", "inf") else float(value)


def test_music_track_is_mixed_into_the_export(
    page: Page, server: str, images: dict[str, Path], melody: Path, tmp_path: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()
    file_input = page.get_by_test_id("media-import-input")

    # Pictures: two slides of 5 s each, hard cut → 10 s movie.
    file_input.set_input_files([images["rot.png"], images["blau.png"]])
    pictures = page.get_by_role("list", name="Bilder")
    strip = page.get_by_role("list", name="Bildstreifen")
    for number, name in enumerate(("rot.png", "blau.png"), start=1):
        pictures.get_by_role("button", name=name).dblclick()
        expect(strip.get_by_role("button", name=f"Bild {number}: {name}, 5,00 s")).to_be_visible()
    expected = total_seconds(page.get_by_label("Zeit"))
    assert expected == pytest.approx(10.0)

    # Music: an audio-only import switches to "Meine Musik".
    file_input.set_input_files(melody)
    music = page.get_by_role("list", name="Musik", exact=True)
    tile = music.get_by_role("button", name="melodie.mp3, 0:12")
    expect(tile).to_be_visible()

    # Double-click adds it to the music strip below the storyboard.
    expect(page.get_by_role("heading", name="Audio/Musik")).to_be_visible()
    tile.dblclick()
    track = page.get_by_role("list", name="Musikleiste")
    expect(track.get_by_role("button", name="Musikstück 1: melodie.mp3, 0:12")).to_be_visible()
    expect(page.get_by_test_id("music-cut-hint")).to_have_text(
        "Musik 0:12 / Film 0:10 – wird am Ende gekürzt"  # noqa: RUF001
    )
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # Preview: the AudioContext is created in the user gesture (play).
    assert page.evaluate("typeof window.__mmyAudio") == "function"
    page.get_by_role("button", name="Wiedergabe", exact=True).click()
    page.wait_for_function("window.__mmyAudio && window.__mmyAudio().context !== null")
    page.get_by_role("button", name="Stopp", exact=True).click()

    wizard = open_wizard(page, "Mit Musik", "Kleine Datei (640×480)")  # noqa: RUF001
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)
    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    target = tmp_path / "download" / download.suggested_filename
    download.save_as(target)

    probe = ffprobe(target)
    [video] = [s for s in probe["streams"] if s["codec_type"] == "video"]
    [audio] = [s for s in probe["streams"] if s["codec_type"] == "audio"]
    assert audio["codec_name"] == "aac"
    assert audio["sample_rate"] == "48000"
    assert audio["channels"] == 2
    audio_seconds = float(audio["duration"])
    assert float(video["duration"]) == pytest.approx(expected, abs=FRAME + 0.005)
    assert audio_seconds == pytest.approx(float(video["duration"]), abs=FRAME)

    # Audible: the sine at amplitude 0.5 is about -9 dBFS; silence would be -inf.
    body = rms_db(target, 1.0, 8.0)
    assert body > -20.0, body
    # The end-of-movie fade-out (1 s): about -6 dB in its middle, nearly silent at the end.
    end = audio_seconds
    assert rms_db(target, end - 0.55, end - 0.45) == pytest.approx(body - 6.0, abs=2.0)
    assert rms_db(target, end - 0.1, end) < body - 15.0

    wizard.get_by_role("button", name="Fertig stellen").click()
    expect(wizard).to_be_hidden()
