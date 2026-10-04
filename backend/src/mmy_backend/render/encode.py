"""Encoding of the export (design.md D4): frames piped to FFmpeg → MP4.

- Video: raw RGBA frames (top row first, hence no vflip) via stdin,
  `-f rawvideo -pix_fmt rgba -s WxH -r 30 -i -`; encoding `libx264 -preset
  medium -crf 20 -pix_fmt yuv420p -profile:v high -movflags +faststart`.
- Colour space (harden-export-and-ui design.md D2): RGB → YUV with the BT.709
  matrix in limited ("tv") range via `scale=out_color_matrix=bt709:out_range=tv`
  (swscale would otherwise use BT.601), and the stream is tagged as BT.709
  (`setparams` on the frames plus `-colorspace/-color_primaries/-color_trc
  bt709 -color_range tv`), the
  colour space browsers and players assume for HD material.
- Audio: a separate, replaceable input (`AudioInput`): the music mixed
  beforehand (`render.mixdown`, add-music-track D6) or, without music, silent
  via `-f lavfi -i anullsrc=r=48000:cl=stereo`; encoding `aac -b:a 128k`.
  The audio input is limited to the exact video duration (`frame_count / fps`)
  via the input option `-t`; `-shortest` stays as a safeguard. With `-shortest`
  alone the AAC track ends up to one AAC frame (≈ 21 ms) before the video;
  with `-t` both tracks are equally long and the video is never shortened.
- Output is written to `<target>.part` and, on success, renamed atomically via
  `os.replace`. On cancellation or error FFmpeg is stopped, the partial file
  deleted and ExportCancelled or ExportFailed raised.
- GL context, ShaderLibrary and FrameRenderer are created in the calling thread
  (EGL contexts are bound to a thread) and released on every path.
  Afterwards no context is current in this thread.
"""

import contextlib
import logging
import os
import subprocess
import threading
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import IO

from mmy_backend.catalog import EffectCatalog, TransitionCatalog
from mmy_backend.config import DEFAULT_SHADERS_DIR
from mmy_backend.errors import Params, ParamValue, error_message
from mmy_backend.ffmpeg import ffmpeg_binary
from mmy_backend.project import Slide
from mmy_backend.render.context import RenderContextError, create_render_context
from mmy_backend.render.effects import EffectLibrary, EffectSources
from mmy_backend.render.frames import FrameRenderer, ImageLoader, VideoLoader
from mmy_backend.render.shaders import ShaderError, ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import Timeline, frame_count

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[float], None]
AudioInput = Callable[[float], list[str]]
"""Returns the FFmpeg input arguments of the audio track for a duration in seconds."""

PART_SUFFIX = ".part"
PROGRESS_STEP = 0.01
"""Progress is reported in steps of at least 1 %."""
STDERR_TAIL_LINES = 40
_POLL_SECONDS = 0.1


class ExportProfile(StrEnum):
    """Output profile of the export; the value is the name in the API contract."""

    HIGH = "high"
    SMALL = "small"
    EMAIL_WEB = "email_web"

    @property
    def spec(self) -> "ProfileSpec":
        return PROFILES[self]


@dataclass(frozen=True, slots=True)
class ProfileSpec:
    width: int
    height: int
    fps: int


PROFILES: dict[ExportProfile, ProfileSpec] = {
    ExportProfile.HIGH: ProfileSpec(width=960, height=720, fps=30),
    ExportProfile.SMALL: ProfileSpec(width=640, height=480, fps=30),
    ExportProfile.EMAIL_WEB: ProfileSpec(width=320, height=240, fps=30),
}
DEFAULT_PROFILE = ExportProfile.HIGH


class ExportError(Exception):
    """Base class of the export errors."""


class ExportCancelled(ExportError):
    """The export was cancelled; no file is left behind."""

    def __init__(self) -> None:
        super().__init__("Export cancelled.")


class ExportFailed(ExportError):
    """The export failed; no file is left behind.

    `code` and `params` identify the error (design.md D5, `mmy_backend.errors`);
    the exception text is the English message plus the FFmpeg stderr tail.
    """

    def __init__(self, code: str, stderr_tail: str = "", **params: ParamValue) -> None:
        self.code = code
        self.params: Params = params
        self.stderr_tail = stderr_tail
        message = error_message(code, params)
        super().__init__(f"{message}\n{stderr_tail}".rstrip() if stderr_tail else message)


def part_path(out_path: Path) -> Path:
    return out_path.with_name(out_path.name + PART_SUFFIX)


def video_duration(timeline: Timeline, fps: int) -> float:
    """Exact duration of the video: number of frames / fps."""
    return frame_count(timeline.duration, fps) / fps


def silent_audio_input(duration: float) -> list[str]:
    """Silent stereo track, 48 kHz, exactly `duration` seconds long."""
    return ["-f", "lavfi", "-t", seconds_arg(duration), "-i", "anullsrc=r=48000:cl=stereo"]


def seconds_arg(value: float) -> str:
    return f"{value:.6f}"


COLOR_FILTER = (
    "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
    "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv"
)
"""RGB → YUV 4:2:0 conversion with the BT.709 matrix, limited range (design.md D2).

`setparams` marks the frames as BT.709: FFmpeg takes the colour properties of
the frames over the encoder options, and `scale` only sets matrix and range, so
without it primaries and transfer would end up `unknown` despite `-color_trc`.
"""
COLOR_TAGS: tuple[str, ...] = (
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_range",
    "tv",
)
"""Colour tags of the video stream (design.md D2)."""


def build_ffmpeg_command(
    binary: str, spec: ProfileSpec, output: Path, audio_args: Sequence[str]
) -> list[str]:
    """Complete FFmpeg command line (design.md D4); input 0 = video, 1 = audio."""
    return [
        binary,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        # Input 0: raw frames via stdin
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        f"{spec.width}x{spec.height}",
        "-r",
        str(spec.fps),
        "-i",
        "-",
        # Input 1: audio track
        *audio_args,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        COLOR_FILTER,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        *COLOR_TAGS,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        str(output),
    ]


class StderrTail(threading.Thread):
    """Reads FFmpeg's stderr in the background (otherwise the pipe can fill up)."""

    def __init__(self, stream: IO[bytes]) -> None:
        super().__init__(name="ffmpeg-stderr", daemon=True)
        self._stream = stream
        self._lines: deque[str] = deque(maxlen=STDERR_TAIL_LINES)

    def run(self) -> None:
        for raw in self._stream:
            self._lines.append(raw.decode("utf-8", errors="replace").rstrip())

    def text(self) -> str:
        self.join(timeout=5)
        return "\n".join(self._lines)


class _Progress:
    def __init__(self, callback: ProgressCallback | None) -> None:
        self._callback = callback
        self._last = 0.0

    def update(self, fraction: float) -> None:
        # 1.0 is reported only by `done()` after the rename.
        fraction = min(fraction, 1.0 - PROGRESS_STEP)
        if self._callback is not None and fraction - self._last >= PROGRESS_STEP:
            self._last = fraction
            self._callback(fraction)

    def done(self) -> None:
        if self._callback is not None:
            self._callback(1.0)


def export_movie(
    timeline: Timeline,
    catalog: TransitionCatalog,
    profile: ExportProfile,
    out_path: Path,
    load_image: ImageLoader,
    *,
    progress: ProgressCallback | None = None,
    cancel: threading.Event | None = None,
    audio_input: AudioInput = silent_audio_input,
    shaders_dir: Path = DEFAULT_SHADERS_DIR,
    load_video: VideoLoader | None = None,
    project_slides: Sequence[Slide] = (),
    effects: EffectCatalog | None = None,
) -> Path:
    """Renders and encodes the slideshow to `out_path` (MP4); returns `out_path`.

    Blocking; belongs in a dedicated worker thread. `progress` receives values in
    (0, 1], monotonically increasing, 1.0 exactly once after success. Raises
    ExportCancelled when `cancel` is set, otherwise ExportFailed; in both cases
    neither `out_path` (unless it already existed before) nor `<out_path>.part` exists.
    """
    spec = profile.spec
    total = frame_count(timeline.duration, spec.fps)
    if total == 0:
        raise ExportFailed("export.noImages")
    binary = ffmpeg_binary()
    if binary is None:
        raise ExportFailed("export.ffmpegMissing")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    part = part_path(out_path)

    try:
        ctx = create_render_context()
    except RenderContextError as exc:
        raise ExportFailed("export.glUnavailable", reason=str(exc)) from exc

    proc: subprocess.Popen[bytes] | None = None
    tail: StderrTail | None = None
    reporter = _Progress(progress)

    def failed(code: str, **params: ParamValue) -> ExportFailed:
        if proc is not None:
            _stop(proc)
        return ExportFailed(code, tail.text() if tail is not None else "", **params)

    try:
        with ctx:
            library = ShaderLibrary(ctx, ShaderSources(shaders_dir))
            # Effect programs (add-effects-catalog design.md D2): the same GLSL
            # files as the preview, compiled lazily per effect that occurs.
            effect_library = (
                EffectLibrary(ctx, EffectSources(shaders_dir)) if effects is not None else None
            )
            try:
                with FrameRenderer(
                    ctx,
                    library,
                    spec.width,
                    spec.height,
                    load_image,
                    load_video=load_video,
                    project_slides=project_slides,
                    effect_library=effect_library,
                    effects=effects,
                ) as renderer:
                    command = build_ffmpeg_command(
                        binary, spec, part, audio_input(total / spec.fps)
                    )
                    try:
                        proc = subprocess.Popen(
                            command,
                            stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE,
                        )
                    except OSError as exc:
                        raise ExportFailed("export.ffmpegStartFailed", reason=str(exc)) from exc
                    assert proc.stdin is not None and proc.stderr is not None
                    tail = StderrTail(proc.stderr)
                    tail.start()

                    for n, frame in renderer.iter_frames(timeline, spec.fps, catalog):
                        if cancel is not None and cancel.is_set():
                            raise ExportCancelled()
                        try:
                            proc.stdin.write(frame)
                        except (BrokenPipeError, ConnectionResetError) as exc:
                            raise failed(
                                "export.ffmpegInputClosed", frame=n + 1, total=total
                            ) from exc
                        reporter.update((n + 1) / total)

                    try:
                        proc.stdin.close()
                    except (BrokenPipeError, ConnectionResetError) as exc:
                        raise failed("export.ffmpegInputClosedEarly") from exc
                    while True:
                        try:
                            returncode = proc.wait(timeout=_POLL_SECONDS)
                            break
                        except subprocess.TimeoutExpired:
                            if cancel is not None and cancel.is_set():
                                raise ExportCancelled() from None
                    if returncode != 0:
                        raise failed("export.ffmpegFailed", returnCode=returncode)
            finally:
                library.release()
                if effect_library is not None:
                    effect_library.release()
    except BaseException as exc:
        if proc is not None:
            _stop(proc)
        part.unlink(missing_ok=True)
        if isinstance(exc, ExportError) or not isinstance(exc, Exception):
            raise
        detail = str(exc) if isinstance(exc, ShaderError) else repr(exc)
        raise ExportFailed("export.renderFailed", reason=detail) from exc
    finally:
        ctx.release()

    try:
        os.replace(part, out_path)
    except OSError as exc:
        part.unlink(missing_ok=True)
        raise ExportFailed("export.saveFailed", reason=str(exc)) from exc
    logger.info("Export %s done: %d frames, %s", profile.value, total, out_path)
    reporter.done()
    return out_path


def _stop(proc: subprocess.Popen[bytes]) -> None:
    """Stop FFmpeg (if still running) and reap it; close the pipes."""
    if proc.poll() is None:
        proc.kill()
    if proc.stdin is not None:
        with contextlib.suppress(OSError):
            proc.stdin.close()
    proc.wait()
