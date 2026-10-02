"""Kodierung des Exports (design.md D4): Frames per Pipe an FFmpeg → MP4.

- Video: RGBA-Rohbilder (oberste Zeile zuerst, daher kein vflip) über stdin,
  `-f rawvideo -pix_fmt rgba -s WxH -r 30 -i -`; Kodierung `libx264 -preset
  medium -crf 20 -pix_fmt yuv420p -profile:v high -movflags +faststart`.
- Audio: eigener, austauschbarer Eingang (`AudioInput`); bis zur Musik-Änderung
  stumm über `-f lavfi -i anullsrc=r=48000:cl=stereo`, Kodierung `aac -b:a 128k`.
  Der Audioeingang wird per Eingangsoption `-t` auf die exakte Videodauer
  (`frame_count / fps`) begrenzt; `-shortest` bleibt als Absicherung. Nur mit
  `-shortest` endet die AAC-Spur bis zu einem AAC-Frame (≈ 21 ms) vor dem Video;
  mit `-t` sind beide Spuren gleich lang, das Video wird nie gekürzt.
- Geschrieben wird nach `<ziel>.part`, bei Erfolg atomar per `os.replace`
  umbenannt. Bei Abbruch oder Fehler wird FFmpeg beendet, die Teildatei
  gelöscht und ExportCancelled bzw. ExportFailed geworfen.
- GL-Kontext, ShaderLibrary und FrameRenderer entstehen im aufrufenden Thread
  (EGL-Kontexte sind threadgebunden) und werden auf jedem Weg freigegeben.
  Danach ist in diesem Thread kein Kontext mehr aktuell.
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

from mmy_backend.catalog import TransitionCatalog
from mmy_backend.config import DEFAULT_SHADERS_DIR
from mmy_backend.ffmpeg import ffmpeg_binary
from mmy_backend.render.context import RenderContextError, create_render_context
from mmy_backend.render.frames import FrameRenderer, ImageLoader
from mmy_backend.render.shaders import ShaderError, ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import Timeline, frame_count

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[float], None]
AudioInput = Callable[[float], list[str]]
"""Liefert die FFmpeg-Eingangsargumente der Tonspur für eine Dauer in Sekunden."""

PART_SUFFIX = ".part"
PROGRESS_STEP = 0.01
"""Fortschritt wird höchstens in Schritten von 1 % gemeldet."""
STDERR_TAIL_LINES = 40
_POLL_SECONDS = 0.1


class ExportProfile(StrEnum):
    """Ausgabeprofil des Exports; der Wert ist der Name im API-Vertrag."""

    HIGH = "high"
    SMALL = "small"

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
}
DEFAULT_PROFILE = ExportProfile.HIGH


class ExportError(Exception):
    """Basisklasse der Exportfehler."""


class ExportCancelled(ExportError):
    """Der Export wurde abgebrochen; es bleibt keine Datei zurück."""

    def __init__(self) -> None:
        super().__init__("Export abgebrochen.")


class ExportFailed(ExportError):
    """Der Export ist fehlgeschlagen; es bleibt keine Datei zurück."""

    def __init__(self, message: str, stderr_tail: str = "") -> None:
        self.stderr_tail = stderr_tail
        super().__init__(f"{message}\n{stderr_tail}".rstrip() if stderr_tail else message)


def part_path(out_path: Path) -> Path:
    return out_path.with_name(out_path.name + PART_SUFFIX)


def video_duration(timeline: Timeline, fps: int) -> float:
    """Exakte Dauer des Videos: Anzahl der Bilder / fps."""
    return frame_count(timeline.duration, fps) / fps


def silent_audio_input(duration: float) -> list[str]:
    """Stumme Stereo-Spur, 48 kHz, exakt `duration` Sekunden lang."""
    return ["-f", "lavfi", "-t", _seconds(duration), "-i", "anullsrc=r=48000:cl=stereo"]


def _seconds(value: float) -> str:
    return f"{value:.6f}"


def build_ffmpeg_command(
    binary: str, spec: ProfileSpec, output: Path, audio_args: Sequence[str]
) -> list[str]:
    """Vollständige FFmpeg-Kommandozeile (design.md D4); Eingang 0 = Video, 1 = Audio."""
    return [
        binary,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        # Eingang 0: Rohbilder über stdin
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
        # Eingang 1: Tonspur
        *audio_args,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
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


class _StderrTail(threading.Thread):
    """Liest stderr von FFmpeg nebenher (sonst kann die Pipe volllaufen)."""

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
        # 1.0 meldet erst `done()` nach dem Umbenennen.
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
) -> Path:
    """Rendert und kodiert die Diashow nach `out_path` (MP4); liefert `out_path`.

    Blockiert; gehört in einen eigenen Worker-Thread. `progress` erhält Werte in
    (0, 1], monoton steigend, 1.0 genau einmal nach Erfolg. Wirft ExportCancelled,
    wenn `cancel` gesetzt wird, sonst ExportFailed; in beiden Fällen existieren
    weder `out_path` (sofern nicht schon vorher vorhanden) noch `<out_path>.part`.
    """
    spec = profile.spec
    total = frame_count(timeline.duration, spec.fps)
    if total == 0:
        raise ExportFailed("Export nicht möglich: Das Projekt enthält keine Bilder.")
    binary = ffmpeg_binary()
    if binary is None:
        raise ExportFailed("Export nicht möglich: FFmpeg wurde nicht gefunden.")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    part = part_path(out_path)

    try:
        ctx = create_render_context()
    except RenderContextError as exc:
        raise ExportFailed(str(exc)) from exc

    proc: subprocess.Popen[bytes] | None = None
    tail: _StderrTail | None = None
    reporter = _Progress(progress)

    def failed(message: str) -> ExportFailed:
        if proc is not None:
            _stop(proc)
        return ExportFailed(message, tail.text() if tail is not None else "")

    try:
        with ctx:
            library = ShaderLibrary(ctx, ShaderSources(shaders_dir))
            try:
                with FrameRenderer(ctx, library, spec.width, spec.height, load_image) as renderer:
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
                        raise ExportFailed(f"FFmpeg ließ sich nicht starten: {exc}") from exc
                    assert proc.stdin is not None and proc.stderr is not None
                    tail = _StderrTail(proc.stderr)
                    tail.start()

                    for n, frame in renderer.iter_frames(timeline, spec.fps, catalog):
                        if cancel is not None and cancel.is_set():
                            raise ExportCancelled()
                        try:
                            proc.stdin.write(frame)
                        except (BrokenPipeError, ConnectionResetError) as exc:
                            raise failed(
                                f"FFmpeg hat die Eingabe bei Bild {n + 1}/{total} beendet."
                            ) from exc
                        reporter.update((n + 1) / total)

                    try:
                        proc.stdin.close()
                    except (BrokenPipeError, ConnectionResetError) as exc:
                        raise failed("FFmpeg hat die Eingabe vorzeitig beendet.") from exc
                    while True:
                        try:
                            returncode = proc.wait(timeout=_POLL_SECONDS)
                            break
                        except subprocess.TimeoutExpired:
                            if cancel is not None and cancel.is_set():
                                raise ExportCancelled() from None
                    if returncode != 0:
                        raise failed(f"FFmpeg ist mit Code {returncode} fehlgeschlagen.")
            finally:
                library.release()
    except BaseException as exc:
        if proc is not None:
            _stop(proc)
        part.unlink(missing_ok=True)
        if isinstance(exc, ExportError) or not isinstance(exc, Exception):
            raise
        detail = str(exc) if isinstance(exc, ShaderError) else repr(exc)
        raise ExportFailed(f"Export fehlgeschlagen: {detail}") from exc
    finally:
        ctx.release()

    try:
        os.replace(part, out_path)
    except OSError as exc:
        part.unlink(missing_ok=True)
        raise ExportFailed(f"Export konnte nicht gespeichert werden: {exc}") from exc
    logger.info("Export %s fertig: %d Bilder, %s", profile.value, total, out_path)
    reporter.done()
    return out_path


def _stop(proc: subprocess.Popen[bytes]) -> None:
    """FFmpeg beenden (falls es noch läuft) und einsammeln; Pipes schließen."""
    if proc.poll() is None:
        proc.kill()
    if proc.stdin is not None:
        with contextlib.suppress(OSError):
            proc.stdin.close()
    proc.wait()
