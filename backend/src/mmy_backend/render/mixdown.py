"""Music mixdown of the export (add-music-track design.md D6, TASK-RENDER-006).

Before the video is rendered, a separate FFmpeg run mixes the music track
from the original files according to the music schedule (`music_schedule`,
design.md D4) into `music.wav`, exactly as long as the video. The export then
passes this file as `audio_input`; without music the silent track remains.

Filter graph, one input per segment (`-i <original>`, first audio stream):

    [k:a:0] aresample=48000, aformat=fltp/stereo,
            atrim=start=<sourceIn>:duration=<length>, asetpts=PTS-STARTPTS,
            volume=<gain>, afade=in (if any), afade=out (if any),
            adelay=<at in samples>  → [m<k>]
    [m0]…[mN-1] amix=inputs=N:normalize=0:duration=longest,
            apad=whole_len=<samples>, atrim=end_sample=<samples>  → [out]

Resampling first lets `atrim`/`adelay` work on whole 48 kHz samples. `amix`
with `normalize=0` adds the segments without scaling (they do not overlap, so
each keeps its gain). `apad` + `atrim` make the result exactly `duration`
seconds long: silence after the music, cut at the end of the movie. Fades are
linear (`afade` curve `tri`), as in the preview. The WAV holds 32-bit float
samples, so a gain above 1 is only clipped once, by the AAC encoder.

Cancellation is checked while FFmpeg runs (FFmpeg is killed); errors raise
`ExportFailed("export.audioFailed")`. In both cases no output file is left.
"""

import contextlib
import logging
import subprocess
import threading
from collections.abc import Mapping, Sequence
from pathlib import Path

from mmy_backend.ffmpeg import ffmpeg_binary
from mmy_backend.render.encode import (
    AudioInput,
    ExportCancelled,
    ExportFailed,
    StderrTail,
    seconds_arg,
)
from mmy_backend.render.music import MusicSegment

logger = logging.getLogger(__name__)

SAMPLE_RATE = 48000
MIX_FILENAME = "music.wav"
_POLL_SECONDS = 0.1


def _samples(seconds: float) -> int:
    return max(0, round(seconds * SAMPLE_RATE))


def _num(value: float) -> str:
    """Compact decimal for filter arguments (no exponent notation)."""
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def segment_filter(index: int, segment: MusicSegment) -> str:
    """Filter chain of one segment: input `index` → label `m<index>`."""
    filters = [
        f"aresample={SAMPLE_RATE}",
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        f"atrim=start_sample={_samples(segment.source_in)}"
        f":end_sample={_samples(segment.source_in) + _samples(segment.length)}",
        "asetpts=PTS-STARTPTS",
        f"volume={_num(segment.gain)}",
    ]
    if segment.fade_in > 0:
        filters.append(f"afade=t=in:st=0:d={_num(segment.fade_in)}")
    if segment.fade_out > 0:
        start = max(segment.length - segment.fade_out, 0.0)
        filters.append(f"afade=t=out:st={_num(start)}:d={_num(segment.fade_out)}")
    filters.append(f"adelay=delays={_samples(segment.at)}S:all=1")
    return f"[{index}:a:0]{','.join(filters)}[m{index}]"


def music_filter_graph(segments: Sequence[MusicSegment], duration: float) -> str:
    """Complete `-filter_complex` graph; output label `[out]`, `duration` s long."""
    if not segments:
        raise ValueError("music_filter_graph needs at least one segment")
    total = _samples(duration)
    chains = [segment_filter(i, s) for i, s in enumerate(segments)]
    labels = "".join(f"[m{i}]" for i in range(len(segments)))
    chains.append(
        f"{labels}amix=inputs={len(segments)}:normalize=0:duration=longest,"
        f"apad=whole_len={total},atrim=end_sample={total}[out]"
    )
    return ";".join(chains)


def build_mix_command(
    binary: str,
    segments: Sequence[MusicSegment],
    sources: Mapping[str, Path],
    duration: float,
    output: Path,
) -> list[str]:
    """FFmpeg command line that mixes `segments` from `sources` (media ID → original)."""
    inputs: list[str] = []
    for segment in segments:
        inputs += ["-i", str(sources[segment.media_id])]
    return [
        binary,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        *inputs,
        "-filter_complex",
        music_filter_graph(segments, duration),
        "-map",
        "[out]",
        "-c:a",
        "pcm_f32le",
        "-ar",
        str(SAMPLE_RATE),
        "-ac",
        "2",
        "-f",
        "wav",
        str(output),
    ]


def mix_music(
    segments: Sequence[MusicSegment],
    sources: Mapping[str, Path],
    duration: float,
    output: Path,
    *,
    cancel: threading.Event | None = None,
) -> Path:
    """Mixes the music track to `output` (WAV, 48 kHz stereo, `duration` s); returns it.

    Blocking. Raises ExportCancelled when `cancel` is set while mixing and
    ExportFailed(`export.audioFailed`) on any error; in both cases `output`
    does not exist afterwards.
    """
    binary = ffmpeg_binary()
    if binary is None:
        raise ExportFailed("export.ffmpegMissing")
    missing = sorted({s.media_id for s in segments if not sources.get(s.media_id)})
    if missing:
        raise ExportFailed("export.audioFailed", reason=f"original missing: {', '.join(missing)}")
    for segment in segments:
        if not sources[segment.media_id].is_file():
            raise ExportFailed(
                "export.audioFailed", reason=f"original missing: {sources[segment.media_id]}"
            )
    output.parent.mkdir(parents=True, exist_ok=True)
    command = build_mix_command(binary, segments, sources, duration, output)
    try:
        proc = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )
    except OSError as exc:
        raise ExportFailed("export.audioFailed", reason=str(exc)) from exc
    assert proc.stderr is not None
    tail = StderrTail(proc.stderr)
    tail.start()
    try:
        while True:
            try:
                returncode = proc.wait(timeout=_POLL_SECONDS)
                break
            except subprocess.TimeoutExpired:
                if cancel is not None and cancel.is_set():
                    raise ExportCancelled() from None
        if returncode != 0:
            raise ExportFailed(
                "export.audioFailed",
                tail.text(),
                reason=f"FFmpeg exit code {returncode}",
            )
        if cancel is not None and cancel.is_set():
            raise ExportCancelled()
    except BaseException:
        if proc.poll() is None:
            proc.kill()
        with contextlib.suppress(OSError):
            proc.wait()
        output.unlink(missing_ok=True)
        raise
    logger.info(
        "Music mixed: %d segment(s), %s s → %s", len(segments), seconds_arg(duration), output
    )
    return output


def file_audio_input(path: Path) -> AudioInput:
    """`audio_input` for `export_movie` that reads a mixed WAV file."""

    def args(duration: float) -> list[str]:
        return ["-t", seconds_arg(duration), "-i", str(path)]

    return args
