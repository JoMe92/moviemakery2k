"""Encoding of the export (TASK-RENDER-004, design.md D4).

Small projects so that the end-to-end tests (marked `slow`) take only a few
seconds. The runtime for 12 images of 5 s each is measured by
`scripts/bench_export.py` (`pixi run bench-export`).
"""

import json
import math
import subprocess
import threading
from collections.abc import Iterator
from itertools import pairwise
from pathlib import Path
from typing import Any

import pytest
from conftest import requires_gl
from PIL import Image, ImageDraw

from mmy_backend.catalog import TransitionCatalog, load_catalog
from mmy_backend.config import DEFAULT_SHADERS_DIR, REPO_ROOT
from mmy_backend.ffmpeg import ffmpeg_binary, ffprobe_binary
from mmy_backend.render import encode
from mmy_backend.render.context import create_render_context
from mmy_backend.render.encode import (
    ExportCancelled,
    ExportFailed,
    ExportProfile,
    ProfileSpec,
    build_ffmpeg_command,
    export_movie,
    part_path,
    silent_audio_input,
    video_duration,
)
from mmy_backend.render.frames import FrameRenderer
from mmy_backend.render.shaders import ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import (
    Timeline,
    TimelineSlide,
    TransitionFrame,
    TransitionIn,
    build_timeline,
    frame_at,
    frame_count,
    frame_time,
)

CATALOG: TransitionCatalog = load_catalog(REPO_ROOT / "packages" / "catalog" / "transitions.json")
slow = pytest.mark.slow


def photo(seed: int, size: tuple[int, int] = (480, 360)) -> Image.Image:
    """Photo-like test image: soft gradients plus a few shapes."""
    w, h = size
    image = Image.merge(
        "RGB",
        (
            Image.linear_gradient("L").resize(size),
            Image.radial_gradient("L").resize(size),
            Image.linear_gradient("L").rotate(90 + seed * 30).resize(size),
        ),
    )
    draw = ImageDraw.Draw(image)
    for i in range(6):
        x, y = (seed * 53 + i * 71) % w, (seed * 37 + i * 43) % h
        draw.ellipse((x, y, x + w // 5, y + h // 5), fill=((i * 40) % 256, 200 - i * 20, 90))
    return image


IMAGES = {"a": photo(1), "b": photo(2, (300, 400)), "c": photo(3)}


def load(media_id: str) -> Image.Image | None:
    return IMAGES.get(media_id)


def small_timeline() -> Timeline:
    # 3 x 1 s, transitions 0.5 s → 2.0 s, 60 frames at 30 fps
    return build_timeline(
        [
            TimelineSlide("s0", "a", 1.0, None),
            TimelineSlide("s1", "b", 1.0, TransitionIn("wipe-right", 0.5)),
            TimelineSlide("s2", "c", 1.0, TransitionIn("circle", 0.5)),
        ]
    )


def ffprobe(path: Path) -> dict[str, Any]:
    binary = ffprobe_binary()
    assert binary is not None
    out = subprocess.run(
        [binary, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True,
        check=True,
    ).stdout
    result: dict[str, Any] = json.loads(out)
    return result


def decode_frame(path: Path, n: int, width: int, height: int) -> bytes:
    binary = ffmpeg_binary()
    assert binary is not None
    data = subprocess.run(
        [
            binary,
            *("-v", "error", "-i", str(path)),
            *("-vf", f"select=eq(n\\,{n})", "-fps_mode", "passthrough", "-frames:v", "1"),
            *("-f", "rawvideo", "-pix_fmt", "rgba", "-"),
        ],
        capture_output=True,
        check=True,
    ).stdout
    assert len(data) == width * height * 4
    return data


def psnr_rgb(a: bytes, b: bytes) -> float:
    total = 0
    count = 0
    for i in range(0, len(a), 4):
        for c in range(3):
            d = a[i + c] - b[i + c]
            total += d * d
        count += 3
    mse = total / count
    return math.inf if mse == 0 else 10 * math.log10(255 * 255 / mse)


@pytest.fixture
def popen_spy(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[subprocess.Popen[bytes]]]:
    started: list[subprocess.Popen[bytes]] = []
    real = subprocess.Popen

    def spy(*args: Any, **kwargs: Any) -> subprocess.Popen[bytes]:
        proc: subprocess.Popen[bytes] = real(*args, **kwargs)
        started.append(proc)
        return proc

    monkeypatch.setattr(subprocess, "Popen", spy)
    yield started


# --- without FFmpeg/GL ----------------------------------------------------------


def test_profiles() -> None:
    assert [p.value for p in ExportProfile] == ["high", "small"]
    assert ExportProfile("high").spec == ProfileSpec(960, 720, 30)
    assert ExportProfile.SMALL.spec == ProfileSpec(640, 480, 30)
    assert encode.DEFAULT_PROFILE is ExportProfile.HIGH


def test_ffmpeg_command_matches_design_d4(tmp_path: Path) -> None:
    out = tmp_path / "x.mp4.part"
    cmd = build_ffmpeg_command("ffmpeg", ExportProfile.HIGH.spec, out, silent_audio_input(2.5))
    line = " ".join(cmd)
    assert "-f rawvideo -pix_fmt rgba -s 960x720 -r 30 -i - " in line
    assert "-f lavfi -t 2.500000 -i anullsrc=r=48000:cl=stereo " in line
    assert "-map 0:v:0 -map 1:a:0 " in line
    assert (
        "-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -profile:v high "
        "-c:a aac -b:a 128k -shortest -movflags +faststart -f mp4 " in line
    )
    assert cmd[-1] == str(out)
    assert "vflip" not in line


def test_part_path_and_duration() -> None:
    assert part_path(Path("/x/film.mp4")) == Path("/x/film.mp4.part")
    timeline = small_timeline()
    assert frame_count(timeline.duration, 30) == 60
    assert video_duration(timeline, 30) == pytest.approx(2.0)


def test_empty_project_fails_without_files(tmp_path: Path) -> None:
    out = tmp_path / "film.mp4"
    with pytest.raises(ExportFailed, match="the project contains no images") as info:
        export_movie(build_timeline([]), CATALOG, ExportProfile.SMALL, out, load)
    assert info.value.code == "export.noImages" and info.value.params == {}
    assert list(tmp_path.iterdir()) == []


# --- End to end -----------------------------------------------------------------


@requires_gl
@slow
def test_small_export_streams_progress_and_psnr(tmp_path: Path) -> None:
    out = tmp_path / "out" / "film.mp4"
    timeline = small_timeline()
    reported: list[float] = []

    result = export_movie(
        timeline, CATALOG, ExportProfile.SMALL, out, load, progress=reported.append
    )

    assert result == out and out.is_file()
    assert not part_path(out).exists()
    assert reported and reported[-1] == 1.0 and reported.count(1.0) == 1
    assert all(0 < a < b for a, b in pairwise(reported))

    info = ffprobe(out)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
    assert (video["codec_name"], video["profile"], video["pix_fmt"]) == ("h264", "High", "yuv420p")
    assert (video["width"], video["height"]) == (640, 480)
    assert video["r_frame_rate"] == "30/1"
    assert int(video["nb_frames"]) == 60
    assert (audio["codec_name"], audio["sample_rate"], audio["channels"]) == ("aac", "48000", 2)
    expected = video_duration(timeline, 30)
    for duration in (video["duration"], audio["duration"], info["format"]["duration"]):
        assert abs(float(duration) - expected) <= 1 / 30

    # Middle frame of a transition against the renderer's raw frame.
    n = 22
    frame = frame_at(timeline, frame_time(n, 30))
    assert isinstance(frame, TransitionFrame) and 0.3 < frame.progress < 0.7
    decoded = decode_frame(out, n, 640, 480)
    ctx = create_render_context()
    try:
        with ctx:
            library = ShaderLibrary(ctx, ShaderSources(DEFAULT_SHADERS_DIR))
            with FrameRenderer(ctx, library, 640, 480, load) as renderer:
                raw = renderer.render(frame, timeline, CATALOG)
            library.release()
    finally:
        ctx.release()
    psnr = psnr_rgb(decoded, raw)
    print(f"PSNR frame {n}: {psnr:.2f} dB")
    assert psnr > 35


@requires_gl
@slow
def test_high_profile_resolution(tmp_path: Path) -> None:
    out = tmp_path / "film.mp4"
    timeline = build_timeline([TimelineSlide("s0", "b", 0.5, None)])
    export_movie(timeline, CATALOG, ExportProfile.HIGH, out, load)
    info = ffprobe(out)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"], video["r_frame_rate"]) == (960, 720, "30/1")
    assert (video["codec_name"], video["profile"]) == ("h264", "High")
    assert abs(float(info["format"]["duration"]) - 0.5) <= 1 / 30


@requires_gl
@slow
def test_cancel_leaves_no_file_and_stops_ffmpeg(
    tmp_path: Path, popen_spy: list[subprocess.Popen[bytes]]
) -> None:
    out = tmp_path / "film.mp4"
    cancel = threading.Event()

    def on_progress(fraction: float) -> None:
        if fraction >= 0.3:
            cancel.set()

    with pytest.raises(ExportCancelled):
        export_movie(
            small_timeline(),
            CATALOG,
            ExportProfile.SMALL,
            out,
            load,
            progress=on_progress,
            cancel=cancel,
        )
    assert list(tmp_path.iterdir()) == []
    # glcontext itself starts ldconfig/gcc; only FFmpeg counts here.
    ffmpeg = [p for p in popen_spy if isinstance(p.args, list) and p.args[0] == ffmpeg_binary()]
    assert len(ffmpeg) == 1
    assert ffmpeg[0].poll() is not None


@requires_gl
def test_ffmpeg_exit_raises_with_stderr_tail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = tmp_path / "fake-ffmpeg"
    fake.write_text("#!/bin/sh\necho 'broken: boom' >&2\nexit 3\n", encoding="utf-8")
    fake.chmod(0o755)
    monkeypatch.setenv("MMY_FFMPEG", str(fake))
    out = tmp_path / "out" / "film.mp4"
    with pytest.raises(ExportFailed) as info:
        export_movie(small_timeline(), CATALOG, ExportProfile.SMALL, out, load)
    assert "broken: boom" in info.value.stderr_tail
    # FFmpeg exits at once: depending on timing the pipe breaks first or the exit is seen.
    assert info.value.code in {
        "export.ffmpegFailed",
        "export.ffmpegInputClosed",
        "export.ffmpegInputClosedEarly",
    }
    if info.value.code == "export.ffmpegFailed":
        assert info.value.params == {"returnCode": 3}
    assert str(info.value).startswith("FFmpeg ")
    assert list(out.parent.iterdir()) == []


@requires_gl
def test_invalid_audio_input_fails_without_part(tmp_path: Path) -> None:
    def broken_audio(duration: float) -> list[str]:
        return ["-f", "lavfi", "-t", str(duration), "-i", "no_such_source_mmy"]

    out = tmp_path / "film.mp4"
    with pytest.raises(ExportFailed) as info:
        export_movie(
            small_timeline(), CATALOG, ExportProfile.SMALL, out, load, audio_input=broken_audio
        )
    assert info.value.stderr_tail
    assert list(tmp_path.iterdir()) == []


@requires_gl
def test_missing_ffmpeg_binary(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MMY_FFMPEG", str(tmp_path / "nope" / "ffmpeg"))
    out = tmp_path / "film.mp4"
    with pytest.raises(ExportFailed, match="FFmpeg could not be started") as info:
        export_movie(small_timeline(), CATALOG, ExportProfile.SMALL, out, load)
    assert info.value.code == "export.ffmpegStartFailed"
    assert set(info.value.params) == {"reason"}
    assert list(tmp_path.iterdir()) == []
