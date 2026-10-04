"""End to end: video import -> storyboard -> trim -> split -> play -> export
(TASK-INFRA-020, add-timeline-editing design.md D2-D6).

Mirrors the existing picture (`test_slideshow_flow.py`) and music
(`test_music_flow.py`) smoke scenarios, which stay unchanged and green.
"""

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from mmy_backend.ffmpeg import ffprobe_binary
from playwright.sync_api import Page, expect

EXPORT_TIMEOUT_MS = 180_000
FRAME = 1 / 30


def ffprobe(path: Path) -> dict[str, Any]:
    binary = ffprobe_binary()
    assert binary is not None, "ffprobe is part of the pixi environment"
    out = subprocess.run(
        [binary, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return json.loads(out)  # type: ignore[no-any-return]


def test_video_import_trim_split_play_export(
    page: Page, server: str, video: Path, tmp_path: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # Video-only import switches to "Meine Videos" (add-video-import D4);
    # double-click appends it to the storyboard like a picture (TASK-WEB-058).
    page.locator("input[type=file]").set_input_files(video)
    tile = page.get_by_role("list", name="Videos").get_by_role("button", name="urlaub.mp4, 1:45")
    expect(tile).to_be_visible()
    tile.dblclick()
    strip = page.get_by_role("list", name="Bildstreifen")
    clip = strip.get_by_role("button", name="Bild 1: urlaub.mp4, 105,00 s")
    expect(clip).to_be_visible()

    # Kuerzen (TASK-WEB-060): double-click opens the trim dialog; 10 s-40 s.
    clip.dblclick()
    dialog = page.get_by_role("dialog", name="Videoclip 1 kürzen")
    expect(dialog).to_be_visible()
    dialog.get_by_label("Anfang", exact=True).fill("10")
    dialog.get_by_label("Ende", exact=True).fill("40")
    dialog.get_by_role("button", name="OK").click()
    expect(dialog).to_be_hidden()
    clip = strip.get_by_role("button", name="Bild 1: urlaub.mp4, 30,00 s")
    expect(clip).to_be_visible()

    # Teilen (TASK-WEB-061): only enabled with the clip selected and the
    # playhead inside its own span; seek to the middle of the trimmed range.
    box = clip.bounding_box()
    assert box
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    expect(clip).to_have_attribute("aria-pressed", "true")
    time = page.get_by_label("Zeit")
    page.evaluate(
        "(v) => {"
        "  const el = document.querySelector('input[type=range]');"
        "  const setter = Object.getOwnPropertyDescriptor("
        "    window.HTMLInputElement.prototype, 'value').set;"
        "  setter.call(el, v);"
        "  el.dispatchEvent(new Event('input', {bubbles: true}));"
        "}",
        "15",
    )
    expect(time).to_have_text("0:00:15,00 / 0:00:30,00")
    page.get_by_role("menuitem", name="Clip").click()
    split = page.get_by_role("menuitem", name="Teilen")
    expect(split).not_to_have_attribute("aria-disabled", "true")
    split.click()
    expect(strip.get_by_role("button", name="Bild 1: urlaub.mp4, 15,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Bild 2: urlaub.mp4, 15,00 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()
    # Splitting keeps the total duration (hence the playhead position) unchanged.
    expect(time).to_have_text("0:00:15,00 / 0:00:30,00")

    # Abspielen (design.md D5): plays back muted, no own clock.
    page.get_by_role("button", name="Stopp").click()
    expect(time).to_have_text("0:00:00,00 / 0:00:30,00")
    page.get_by_role("button", name="Wiedergabe").click()
    expect(page.get_by_role("button", name="Pause")).to_be_visible()
    expect(time).not_to_have_text("0:00:00,00 / 0:00:30,00")
    page.get_by_role("button", name="Stopp").click()
    expect(time).to_have_text("0:00:00,00 / 0:00:30,00")

    # Export (TASK-RENDER-007): the two video clips decode through FFmpeg.
    page.get_by_text("Auf dem Computer speichern").click()
    wizard = page.get_by_role("dialog", name="Film speichern")
    expect(wizard.get_by_role("heading", name="Dateiname")).to_be_visible()
    wizard.get_by_label("Dateiname:").fill("Videoclip-Film")
    wizard.get_by_role("button", name="Weiter").click()
    expect(wizard.get_by_role("heading", name="Qualität")).to_be_visible()
    wizard.get_by_role("radio", name="Kleine Datei (640×480)").check()  # noqa: RUF001
    wizard.get_by_role("button", name="Weiter").click()
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)

    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    target = tmp_path / "download" / download.suggested_filename
    download.save_as(target)
    assert target.stat().st_size > 0

    probe = ffprobe(target)
    streams = probe["streams"]
    video_streams = [s for s in streams if s["codec_type"] == "video"]
    audio_streams = [s for s in streams if s["codec_type"] == "audio"]
    assert len(video_streams) == 1 and len(audio_streams) == 1, streams
    assert video_streams[0]["codec_name"] == "h264"
    assert (video_streams[0]["width"], video_streams[0]["height"]) == (640, 480)
    tolerance = FRAME + 0.005
    assert float(probe["format"]["duration"]) == pytest.approx(30.0, abs=tolerance)

    wizard.get_by_role("button", name="Fertig stellen").click()
    expect(wizard).to_be_hidden()
