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


def wait_for_decoded_frame(page: Page, timeout: float = 15.0) -> None:
    """Waits until the hidden `<video>` holds a drawable frame.

    The browser decides when to decode; `readyState >= HAVE_CURRENT_DATA` (2) is
    the point from which `drawImage` has pixels at all, so the colour assertions
    below describe the app's rendering instead of racing the decoder.
    """
    page.wait_for_function(
        "() => { const v = document.querySelector('video'); return !!v && v.readyState >= 2; }",
        timeout=timeout * 1000,
    )


_SCRUBBED_FRAME = """() => {
  const v = document.querySelector('video');
  const canvas = new OffscreenCanvas(32, 24);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const n = data.length / 4;
  return { currentTime: v.currentTime, rgb: [r / n, g / n, b / n] };
}"""


def scrubbed_frame(page: Page) -> dict[str, object]:
    """The frame the player scrubbed the hidden `<video>` to, read with a plain
    Canvas2D `drawImage` - the step before the WebGL upload. Asserting this
    separately says whether a black monitor comes from the player's scrubbing
    (`currentTime`, design.md D5) or from the GL path."""
    return page.evaluate(_SCRUBBED_FRAME)  # type: ignore[no-any-return]


def wait_for_color(
    page: Page,
    monitor: Locator,
    is_expected: "callable[[tuple[float, float, float]], bool]",
    timeout: float = 5.0,
) -> tuple[float, float, float]:
    """Polls the monitor's mean colour until `is_expected` holds or `timeout` (s)
    runs out: the canvas is painted by the player's own redraw pump, one tick
    (~66 ms) after the frame the assertion is about became available."""
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

    # Stopped at the start (trimIn 0): the still frame is red. Wait for the
    # element to actually hold a frame first - the browser schedules that
    # decode itself, and only the player's seek (design.md D5) asks for it.
    expect(time).to_contain_text("0:00:00,00")
    wait_for_decoded_frame(page)
    scrubbed = scrubbed_frame(page)
    assert scrubbed["currentTime"] == pytest.approx(0, abs=0.01), scrubbed
    first = scrubbed["rgb"]
    assert isinstance(first, list) and first[0] > 150 and first[2] < 80, (
        f"the clip is scrubbed to 0 s, so its frame should be red: {scrubbed}"
    )
    start = wait_for_color(page, monitor, lambda rgb: rgb[0] > 150 and rgb[2] < 80)
    assert start[0] > 150 and start[2] < 80, f"0 s should show red in the monitor: {start}"

    # Seek to a deterministic position well inside the blue half; the video
    # scrubs to it (currentTime = trimIn + time, design.md D5), no own clock.
    # React tracks the last value it wrote, so a plain `el.value = …` is
    # ignored; go through the native setter (as test_video_timeline_flow does).
    page.evaluate(
        "(v) => {"
        "  const el = document.querySelector('input[type=range]');"
        "  const setter = Object.getOwnPropertyDescriptor("
        "    window.HTMLInputElement.prototype, 'value').set;"
        "  setter.call(el, v);"
        "  el.dispatchEvent(new Event('input', {bubbles: true}));"
        "}",
        "1.5",
    )
    expect(time).to_contain_text("0:00:01,50")
    page.wait_for_function(
        "() => { const v = document.querySelector('video');"
        " return Math.abs(v.currentTime - 1.5) < 0.05 && v.readyState >= 2; }",
        timeout=15_000,
    )
    scrubbed = scrubbed_frame(page)
    second = scrubbed["rgb"]
    assert isinstance(second, list) and second[2] > 150 and second[0] < 80, (
        f"the clip is scrubbed to 1.5 s, so its frame should be blue: {scrubbed}"
    )
    later = wait_for_color(page, monitor, lambda rgb: rgb[2] > 150 and rgb[0] < 80)
    assert later[2] > 150 and later[0] < 80, f"1.5 s should show blue in the monitor: {later}"
