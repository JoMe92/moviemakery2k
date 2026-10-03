"""E2E golden frame: the player shows the correct, deterministic video frame at
a given playback position (add-timeline-editing design.md D5, spec
preview-player "Videoclips in der Wiedergabe", TASK-WEB-059).

The monitor is evaluated from an element screenshot, like the existing
slideshow flow test; a WebGL canvas without preserveDrawingBuffer cannot be
read back reliably with drawImage.
"""

import io
import subprocess
import time as time_module
from pathlib import Path

import pytest
from mmy_backend.ffmpeg import ffmpeg_binary
from PIL import Image, ImageStat
from playwright.sync_api import Locator, Page, expect


def mean_rgb(locator: Locator) -> tuple[float, float, float]:
    img = Image.open(io.BytesIO(locator.screenshot())).convert("RGB")
    # Only the centre of the picture; the letterbox bars are black.
    w, h = img.size
    crop = img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))
    r, g, b = ImageStat.Stat(crop).mean
    return (r, g, b)


def wait_for_color(
    page: Page,
    monitor: Locator,
    is_expected: "callable[[tuple[float, float, float]], bool]",
    timeout: float = 5.0,
) -> tuple[float, float, float]:
    """Polls the monitor's mean colour until `is_expected` holds or `timeout` (s)
    runs out; decoding a video frame (unlike an `<img>`) is not awaitable."""
    deadline = time_module.monotonic() + timeout
    rgb = mean_rgb(monitor)
    while not is_expected(rgb) and time_module.monotonic() < deadline:
        page.wait_for_timeout(100)
        rgb = mean_rgb(monitor)
    return rgb


@pytest.fixture
def two_color_video(tmp_path: Path) -> Path:
    """1 s plain red, then 1 s plain blue (concatenated): a deterministic
    position in the clip maps to a known, expected colour."""
    binary = ffmpeg_binary()
    if binary is None:
        pytest.fail("ffmpeg not found (Pixi environment or MMY_FFMPEG)")
    path = tmp_path / "rot-blau.mp4"
    subprocess.run(
        [
            binary,
            *("-v", "error", "-y", "-f", "lavfi"),
            "-i",
            "color=c=red:size=640x480:rate=10:duration=1",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:size=640x480:rate=10:duration=1",
            "-filter_complex",
            "[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]",
            *("-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"),
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


def test_player_shows_the_video_frame_at_a_deterministic_seek_position(
    page: Page, server: str, two_color_video: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # Import switches to "Meine Videos"; append by double-click (TASK-WEB-058).
    page.locator("input[type=file]").set_input_files(two_color_video)
    tile = page.get_by_role("list", name="Videos").get_by_role("button", name="rot-blau.mp4, 0:02")
    expect(tile).to_be_visible()
    tile.dblclick()
    expect(
        page.get_by_role("list", name="Bildstreifen").get_by_role(
            "button", name="Bild 1: rot-blau.mp4, 2,00 s"
        )
    ).to_be_visible()

    monitor = page.get_by_role("img", name="Vorschaubild")
    time = page.get_by_label("Zeit")

    # Stopped at the start (trimIn 0): the still frame is red. Decoding the
    # first frame of a video that was never played is itself asynchronous
    # (the browser only fetches past its metadata once something needs a
    # frame), so this settles a moment after the tile/storyboard state does.
    expect(time).to_contain_text("0:00:00,00")
    start = wait_for_color(page, monitor, lambda rgb: rgb[0] > 150 and rgb[2] < 80)
    assert start[0] > 150 and start[2] < 80, f"0 s should show red: {start}"

    # Seek to a deterministic position well inside the blue half; the video
    # scrubs to it (currentTime = trimIn + time, design.md D5), no own clock.
    page.evaluate(
        "(v) => {"
        "  const el = document.querySelector('input[type=range]');"
        "  el.value = v;"
        "  el.dispatchEvent(new Event('input', {bubbles: true}));"
        "}",
        "1.5",
    )
    expect(time).to_contain_text("0:00:01,50")
    later = wait_for_color(page, monitor, lambda rgb: rgb[2] > 150 and rgb[0] < 80)
    assert later[2] > 150 and later[0] < 80, f"1.5 s should show blue: {later}"
