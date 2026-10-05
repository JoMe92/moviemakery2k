"""End to end: pictures + a video clip + music → „Film an Musik anpassen“ hits
the music exactly (TASK-INFRA-030, fit-to-music-with-video-clips design.md
D1-D3).

The point of the scenario is the mix: a video clip's length is its trim window
and MUST stay unchanged, so only the pictures may carry the adjustment. Before
this change the movie landed beside the music (measured 51.25 s against 60 s of
music); here three pictures and a fixed 7.5 s clip must land on the 12 s of the
test melody to the centisecond.

The total duration is read from the monitor time display („Zeit“, „current /
total“) — the status bar carries the backend and save state plus the temporary
notice, not the duration (see the discovery note on mmy-osu).
"""

import subprocess
from pathlib import Path

import pytest
from mmy_backend.ffmpeg import ffmpeg_binary
from playwright.sync_api import Page, expect
from test_export_flow import total_seconds
from test_music_flow import MELODY_SECONDS, melody  # noqa: F401  (fixture by import)

CLIP_SECONDS = 7.5
"""The fixed element: short enough to leave the pictures room inside the melody."""


@pytest.fixture
def short_clip(tmp_path: Path) -> Path:
    """A valid H.264/MP4 of exactly 7.5 s (30 fps, so the duration is on frame)."""
    binary = ffmpeg_binary()
    if binary is None:
        pytest.fail("ffmpeg not found (Pixi environment or MMY_FFMPEG)")
    folder = tmp_path / "clip"
    folder.mkdir()
    path = folder / "clip.mp4"
    subprocess.run(
        [
            binary,
            *("-v", "error", "-y", "-f", "lavfi"),
            "-i",
            f"color=c=teal:size=640x480:rate=30:duration={CLIP_SECONDS}",
            *("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"),
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


def test_fit_to_music_hits_the_music_with_a_fixed_video_clip(
    page: Page,
    server: str,
    images: dict[str, Path],
    short_clip: Path,
    melody: Path,  # noqa: F811
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()
    file_input = page.get_by_test_id("media-import-input")
    strip = page.get_by_role("list", name="Bildstreifen")

    # Three pictures of 5 s each.
    file_input.set_input_files([images["rot.png"], images["blau.png"], images["gruen.png"]])
    pictures = page.get_by_role("list", name="Bilder")
    for number, name in enumerate(("rot.png", "blau.png", "gruen.png"), start=1):
        pictures.get_by_role("button", name=name).dblclick()
        expect(strip.get_by_role("button", name=f"Bild {number}: {name}, 5,00 s")).to_be_visible()

    # The video clip: a video-only import switches to "Meine Videos"; its length
    # is its full trim window and the fit must leave it there.
    file_input.set_input_files(short_clip)
    videos = page.get_by_role("list", name="Videos")
    videos.get_by_role("button", name="clip.mp4").dblclick()
    expect(strip.get_by_role("button", name="Bild 4: clip.mp4, 7,50 s")).to_be_visible()
    # 3 x 5 s + 7.5 s, hard cuts throughout.
    assert total_seconds(page.get_by_label("Zeit")) == pytest.approx(22.5, abs=0.005)

    # The music: 12 s, so the movie has to shrink onto it.
    file_input.set_input_files(melody)
    music = page.get_by_role("list", name="Musik", exact=True)
    tile = music.get_by_role("button", name="melodie.mp3, 0:12")
    expect(tile).to_be_visible()
    tile.dblclick()
    track = page.get_by_role("list", name="Musikleiste")
    expect(track.get_by_role("button", name="Musikstück 1: melodie.mp3, 0:12")).to_be_visible()

    # Clip → "Film an Musik anpassen".
    page.get_by_role("menuitem", name="Clip", exact=True).click()
    entry = page.get_by_role("menuitem", name="Film an Musik anpassen", exact=True)
    expect(entry).not_to_have_attribute("aria-disabled", "true")
    entry.click()

    # No dialog: 12 s is reachable with three pictures beside the fixed clip.
    expect(page.get_by_role("dialog", name="Film an Musik anpassen")).to_be_hidden()
    # 12 s - 7.5 s of clip = 4.5 s over three pictures = 1.5 s each.
    for number, name in enumerate(("rot.png", "blau.png", "gruen.png"), start=1):
        expect(strip.get_by_role("button", name=f"Bild {number}: {name}, 1,50 s")).to_be_visible()
    # The clip keeps its trim window to the centisecond.
    expect(strip.get_by_role("button", name="Bild 4: clip.mp4, 7,50 s")).to_be_visible()
    # And the movie lasts exactly as long as the music, which is the promise.
    assert total_seconds(page.get_by_label("Zeit")) == pytest.approx(MELODY_SECONDS, abs=0.005)
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()
