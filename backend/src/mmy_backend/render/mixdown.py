"""Audio mixdown of the export (add-music-track design.md D6, TASK-RENDER-006;
add-narration-and-audio-levels design.md D5, TASK-RENDER-009).

Before the video is rendered, a separate FFmpeg run mixes the project's sound
from the original files into `music.wav`, exactly as long as the video. The
export then passes this file as `audio_input`; with nothing audible the silent
track remains.

Three schedules feed it (`render/audio.py`): music (sequential), narration
(absolute `at`, overlap allowed) and the original sound of the video elements
(from the timeline placement and `trim_in`/`trim_out`). They go into the graph
as **two sides**, because the global level `clip_audio_balance` sits exactly
between them (D4): music plus narration on one, the clip sound on the other.

Filter graph, one input per segment (`-i <original>`, first audio stream), in
the order "music and narration, then clip sound":

    [k:a:0] aresample=48000, aformat=fltp/stereo,
            atrim=start_sample=…:end_sample=…, asetpts=PTS-STARTPTS,
            volume=<gain>, afade=in (if any), afade=out (if any),
            adelay=<at in samples>  → [m<k>]

    [m0]…[mi-1] amix=inputs=i:normalize=0:duration=longest,
            volume=<level gain>  → [voices]      (music and narration)
    [mi]…[mN-1] amix=inputs=N-i:normalize=0:duration=longest,
            volume=<level gain>  → [clips]       (video-clip sound)
    [voices][clips] amix=inputs=2:normalize=0:duration=longest,
            apad=whole_len=<samples>, atrim=end_sample=<samples>  → [out]

A side with one segment skips its `amix` (nothing to mix), and a side that is
empty or silenced by the level is left out entirely — with only one side left
the final `amix` is skipped too, so the common music-only project produces the
very same graph it did before narration existed.

Resampling first lets `atrim`/`adelay` work on whole 48 kHz samples. `amix`
with `normalize=0` adds its inputs without scaling, so every segment keeps its
own gain and overlapping narration or cross-fading clip sound simply sum.
`apad` + `atrim` make the result exactly `duration` seconds long: silence after
the sound, cut at the end of the movie. Fades are linear (`afade` curve `tri`),
as in the preview. The WAV holds 32-bit float samples, so a gain above 1 is
only clipped once, by the AAC encoder.

Cancellation is checked while FFmpeg runs (FFmpeg is killed); errors raise
`ExportFailed("export.audioFailed")`. In both cases no output file is left.
"""

import contextlib
import json
import logging
import subprocess
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from mmy_backend.ffmpeg import ffmpeg_binary, ffprobe_binary
from mmy_backend.render.audio import AudioSegment, at_gain, audio_balance_gains
from mmy_backend.render.encode import (
    AudioInput,
    ExportCancelled,
    ExportFailed,
    StderrTail,
    seconds_arg,
)

logger = logging.getLogger(__name__)

SAMPLE_RATE = 48000
MIX_FILENAME = "music.wav"
_POLL_SECONDS = 0.1
_PROBE_TIMEOUT_SECONDS = 20.0


def _samples(seconds: float) -> int:
    return max(0, round(seconds * SAMPLE_RATE))


def _num(value: float) -> str:
    """Compact decimal for filter arguments (no exponent notation)."""
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def segment_filter(index: int, segment: AudioSegment) -> str:
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


@dataclass(frozen=True, slots=True)
class AudioMix:
    """The two sides of the export mixdown (design.md D5), already placed.

    `music_and_narration` and `clip_audio` are the segment lists of the two
    sides of the global level; `balance` is the project's `clipAudioBalance`.
    The level is applied per side, not per segment, so the graph shows what it
    does. A side at gain 0 drops out, which is what makes level 0 and level 100
    exactly "no clip sound" and "no music or narration".
    """

    music_and_narration: tuple[AudioSegment, ...] = ()
    clip_audio: tuple[AudioSegment, ...] = ()
    balance: float = 50.0
    _sides: tuple[tuple[tuple[AudioSegment, ...], float], ...] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        gains = audio_balance_gains(self.balance)
        sides = (
            (self.music_and_narration, gains.music_and_narration),
            (self.clip_audio, gains.clip),
        )
        object.__setattr__(self, "_sides", tuple((s, g) for s, g in sides if s and at_gain(s, g)))

    @property
    def sides(self) -> tuple[tuple[tuple[AudioSegment, ...], float], ...]:
        """The sides that are actually audible, each with its level gain."""
        return self._sides

    @property
    def segments(self) -> tuple[AudioSegment, ...]:
        """Every segment in graph (and therefore FFmpeg input) order."""
        return tuple(s for side, _ in self._sides for s in side)

    def is_silent(self) -> bool:
        """Nothing is audible, so the export keeps its silent track."""
        return not self._sides


def _side_chain(labels: Sequence[str], gain: float, out: str) -> str:
    """One side: mix its segments (if more than one) and apply the level gain."""
    joined = "".join(f"[{label}]" for label in labels)
    mix = f"amix=inputs={len(labels)}:normalize=0:duration=longest," if len(labels) > 1 else ""
    return f"{joined}{mix}volume={_num(gain)}[{out}]"


def audio_filter_graph(mix: AudioMix, duration: float) -> str:
    """Complete `-filter_complex` graph; output label `[out]`, `duration` s long.

    Two-stage as in design.md D5: each side mixes to an intermediate signal and
    gets the level's `volume`, then both run into a last `amix`. With only one
    audible side that last `amix` is skipped — mixing one signal with nothing is
    not a mix.
    """
    if mix.is_silent():
        raise ValueError("audio_filter_graph needs at least one audible segment")
    total = _samples(duration)
    segments = mix.segments
    chains = [segment_filter(i, s) for i, s in enumerate(segments)]
    index = 0
    side_labels: list[str] = []
    for position, (side, gain) in enumerate(mix.sides):
        labels = [f"m{index + i}" for i in range(len(side))]
        index += len(side)
        out = f"t{position}"
        chains.append(_side_chain(labels, gain, out))
        side_labels.append(out)
    joined = "".join(f"[{label}]" for label in side_labels)
    final = (
        f"amix=inputs={len(side_labels)}:normalize=0:duration=longest,"
        if len(side_labels) > 1
        else ""
    )
    chains.append(f"{joined}{final}apad=whole_len={total},atrim=end_sample={total}[out]")
    return ";".join(chains)


def has_audio_stream(path: Path) -> bool:
    """Does `path` carry at least one audio stream (design.md D1)?

    A video element whose original has no sound yields no clip-sound source, and
    asking for `[k:a:0]` of such a file would fail the whole mix. Anything that
    goes wrong here (no ffprobe, unreadable file, timeout) counts as "no audio":
    the element is then simply silent, which is better than failing an export
    over a question that only affects one track.
    """
    binary = ffprobe_binary()
    if binary is None:
        return False
    command = [
        binary,
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=_PROBE_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("Cannot probe %s for audio streams: %s", path, exc)
        return False
    if result.returncode != 0:
        logger.warning("ffprobe failed on %s (exit code %d)", path, result.returncode)
        return False
    try:
        report = json.loads(result.stdout or b"{}")
    except ValueError as exc:
        logger.warning("Cannot parse the ffprobe report of %s: %s", path, exc)
        return False
    streams = report.get("streams") if isinstance(report, dict) else None
    return bool(streams)


def build_mix_command(
    binary: str,
    mix: AudioMix,
    sources: Mapping[str, Path],
    duration: float,
    output: Path,
) -> list[str]:
    """FFmpeg command line that mixes `mix` from `sources` (media ID → original)."""
    inputs: list[str] = []
    for segment in mix.segments:
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
        audio_filter_graph(mix, duration),
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


def mix_audio(
    mix: AudioMix,
    sources: Mapping[str, Path],
    duration: float,
    output: Path,
    *,
    cancel: threading.Event | None = None,
) -> Path:
    """Mixes the project's sound to `output` (WAV, 48 kHz stereo, `duration` s); returns it.

    Blocking. Raises ExportCancelled when `cancel` is set while mixing and
    ExportFailed(`export.audioFailed`) on any error; in both cases `output`
    does not exist afterwards.
    """
    binary = ffmpeg_binary()
    if binary is None:
        raise ExportFailed("export.ffmpegMissing")
    segments = mix.segments
    missing = sorted({s.media_id for s in segments if not sources.get(s.media_id)})
    if missing:
        raise ExportFailed("export.audioFailed", reason=f"original missing: {', '.join(missing)}")
    for segment in segments:
        if not sources[segment.media_id].is_file():
            raise ExportFailed(
                "export.audioFailed", reason=f"original missing: {sources[segment.media_id]}"
            )
    output.parent.mkdir(parents=True, exist_ok=True)
    command = build_mix_command(binary, mix, sources, duration, output)
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
        "Audio mixed: %d music/narration + %d clip-sound segment(s) at level %s, %s s → %s",
        len(mix.music_and_narration),
        len(mix.clip_audio),
        _num(mix.balance),
        seconds_arg(duration),
        output,
    )
    return output


def file_audio_input(path: Path) -> AudioInput:
    """`audio_input` for `export_movie` that reads a mixed WAV file."""

    def args(duration: float) -> list[str]:
        return ["-t", seconds_arg(duration), "-i", str(path)]

    return args
