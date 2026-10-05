"""E2E infrastructure: real backend + built web app, Chromium via Playwright.

Run through `pixi run test-e2e` (builds the web app first). Every test gets its
own data directory and its own port.
"""

import os
import socket
import subprocess
import sys
import time
import urllib.request
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from mmy_backend.ffmpeg import ffmpeg_binary
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WEB_DIST = ROOT / "apps" / "web" / "dist"


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


FAKE_MICROPHONE_HZ = 1500
"""Tone of the simulated microphone; far from the 440 Hz test melody, so a mix
of the two can be told apart by frequency."""
FAKE_MICROPHONE_SECONDS = 20.0
"""Chromium loops the file, but a long one keeps the recording a steady tone."""


@pytest.fixture(scope="session")
def fake_microphone(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A WAV that Chromium plays back as the microphone input.

    `--use-file-for-fake-audio-capture` needs 16-bit PCM; a steady sine makes a
    narration recording measurable in the exported file.
    """
    binary = ffmpeg_binary()
    if binary is None:
        pytest.fail("ffmpeg not found (Pixi environment or MMY_FFMPEG)")
    path = tmp_path_factory.mktemp("microphone") / "stimme.wav"
    subprocess.run(
        [
            binary,
            *("-v", "error", "-y", "-f", "lavfi"),
            "-i",
            f"aevalsrc=0.5*sin(2*PI*{FAKE_MICROPHONE_HZ}*t):s=48000:d={FAKE_MICROPHONE_SECONDS}",
            *("-ac", "1", "-c:a", "pcm_s16le"),
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


@pytest.fixture(scope="session")
def browser_type_launch_args(
    browser_type_launch_args: dict[str, Any], fake_microphone: Path
) -> dict[str, Any]:
    # WebGL2 without a GPU: SwiftShader (design.md, risks).
    # The fake microphone is always on: only the narration flow asks for one,
    # and a browser that never prompts is one less thing to time out on.
    return {
        **browser_type_launch_args,
        "args": [
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            f"--use-file-for-fake-audio-capture={fake_microphone}",
        ],
    }


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict[str, Any]) -> dict[str, Any]:
    # The UI follows the browser language; the flows assert the German UI.
    # `microphone`: granted up front, so the narration flow records without a
    # permission prompt (add-narration-and-audio-levels design.md D3).
    return {**browser_context_args, "locale": "de-DE", "permissions": ["microphone"]}


@pytest.fixture
def server(tmp_path: Path) -> Iterator[str]:
    if not (WEB_DIST / "index.html").is_file():
        pytest.fail("apps/web/dist is missing - run via `pixi run test-e2e` (builds it first).")
    port = _free_port()
    env = {
        **os.environ,
        "MMY_DATA_DIR": str(tmp_path / "data"),
        "MMY_WEB_DIST": str(WEB_DIST),
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "mmy_backend.main:app", "--port", str(port)],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        # 30 s, not 10: on a loaded machine (a parallel test run, a CI runner
        # sharing cores) uvicorn's import of the app plus the catalog
        # validation can take well over a second, and losing that race made
        # the whole test error at setup with "Backend did not start".
        for _ in range(300):
            try:
                with urllib.request.urlopen(f"{base}/api/health", timeout=1):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            pytest.fail("Backend did not start")
        yield base
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.fixture
def images(tmp_path: Path) -> dict[str, Path]:
    """Single-colour test images (one in portrait orientation)."""
    specs = {
        "rot.png": ((640, 480), (255, 0, 0)),
        "gruen.png": ((640, 480), (0, 255, 0)),
        "blau.png": ((640, 480), (0, 0, 255)),
        "hochkant.png": ((300, 600), (255, 255, 0)),
    }
    out: dict[str, Path] = {}
    folder = tmp_path / "bilder"
    folder.mkdir()
    for name, (size, color) in specs.items():
        path = folder / name
        Image.new("RGB", size, color).save(path)
        out[name] = path
    return out


@pytest.fixture
def many_images(tmp_path: Path) -> list[Path]:
    """Enough pictures for the collection grid to actually scroll (mmy-bmh):
    the gesture that loses a tap is a thumb drifting in the axis the grid
    scrolls in, so the regression test needs a grid with somewhere to scroll."""
    folder = tmp_path / "viele"
    folder.mkdir()
    out: list[Path] = []
    for i in range(24):
        path = folder / f"bild{i:02d}.png"
        Image.new("RGB", (640, 480), (11 * i % 256, 60, 180)).save(path)
        out.append(path)
    return out


VIDEO_SECONDS = 105.0
"""Matches the spec's own example (media-library "Video importieren"): 1:45."""


@pytest.fixture
def video(tmp_path: Path) -> Path:
    """A tiny but valid H.264/MP4 clip with a known duration (1:45, add-video-import)."""
    binary = ffmpeg_binary()
    if binary is None:
        pytest.fail("ffmpeg not found (Pixi environment or MMY_FFMPEG)")
    folder = tmp_path / "video"
    folder.mkdir()
    path = folder / "urlaub.mp4"
    subprocess.run(
        [
            binary,
            *("-v", "error", "-y", "-f", "lavfi"),
            "-i",
            f"color=c=orange:size=640x480:rate=1:duration={VIDEO_SECONDS}",
            *("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"),
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path
