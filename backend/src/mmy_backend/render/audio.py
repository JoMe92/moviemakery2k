"""Audio schedules of the project, one per track (add-narration-and-audio-levels
design.md D1, D2, D4 and D5).

Port of `apps/web/src/timeline/audio.ts`, so the preview and the export put the
same sound at the same spot. The module comment there is the long version; the
short one:

- A **segment** is a stretch of one medium at a place on the movie time axis,
  with a gain and two fade lengths. Nothing about it says which track it came
  from, which is what lets one filter graph (`mixdown.py`) mix any list.
- **Music** (`music.py`) is sequential and stores no start time.
- **Narration** (`narration_schedule`) stores an absolute `at` per clip, takes
  it as it stands, and allows overlap — the overlap is mixed, neither clip
  replaces the other.
- **Video-clip sound** (`video_clip_audio_schedule`) is derived from the
  timeline placement plus `trim_in`/`trim_out`, at full gain and with no fades
  of its own: there is one global level for all of it (D4), not a field per
  clip.
- The movie end treats every track alike (`place_segment`): a clip starting at
  or after the end is dropped, one reaching past it is cut, and whatever
  reaches the end fades out over `min(1 s, movie_duration)`.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Protocol

FADE_SECONDS = 1.0
"""Fixed duration of the per-clip fades and of the end-of-movie fade-out."""


@dataclass(frozen=True, slots=True)
class AudioSegment:
    """A clip placed on the movie time axis; all times in seconds."""

    media_id: str
    at: float
    """Start on the movie time axis"""
    source_in: float
    """Start within the source medium"""
    length: float
    gain: float
    fade_in: float
    fade_out: float


class AudioTrim(Protocol):
    """A clip on an audio track; `trim_end` None = end of the file."""

    @property
    def media_id(self) -> str: ...
    @property
    def trim_start(self) -> float: ...
    @property
    def trim_end(self) -> float | None: ...


@dataclass(frozen=True, slots=True)
class AudioPlacement:
    """One clip ready to be placed: its own time range and its fade switches."""

    media_id: str
    at: float
    source_in: float
    length: float
    """Played length before the movie end cuts it"""
    gain: float
    fade_in: bool
    fade_out: bool


def played_length(clip: AudioTrim, media_durations: Mapping[str, float]) -> float:
    """`end - trim_start`, where `end` is `trim_end` clamped to the medium
    duration, or that duration when `trim_end` is None. A medium missing from
    `media_durations` counts as 0 s long."""
    duration = media_durations.get(clip.media_id, 0.0)
    if not math.isfinite(duration) or duration <= 0:
        return 0.0
    end = duration if clip.trim_end is None else min(clip.trim_end, duration)
    return end - max(clip.trim_start, 0.0)


def place_segment(clip: AudioPlacement, movie_duration: float) -> AudioSegment | None:
    """Places one clip on the movie time axis, the same way on every track.

    None means nothing is audible: the clip plays no time, or it starts at or
    after the movie end. A clip reaching past the end is cut there and loses its
    own fade-out (it would lie behind the end). Whatever reaches the movie end —
    cut or ending exactly there — fades out over `min(FADE_SECONDS,
    movie_duration)`, or over its own fade-out if that is longer. Both fades are
    clipped to the segment length, and where they overlap the factors multiply.
    """
    if not math.isfinite(movie_duration) or movie_duration <= 0:
        return None
    if clip.length <= 0 or clip.at >= movie_duration:
        return None
    cut = clip.at + clip.length > movie_duration
    length = movie_duration - clip.at if cut else clip.length
    fade_in = min(FADE_SECONDS, length) if clip.fade_in else 0.0
    fade_out = min(FADE_SECONDS, length) if clip.fade_out and not cut else 0.0
    if clip.at + length >= movie_duration:
        fade_out = max(fade_out, min(min(FADE_SECONDS, movie_duration), length))
    return AudioSegment(
        media_id=clip.media_id,
        at=clip.at,
        source_in=clip.source_in,
        length=length,
        gain=clip.gain,
        fade_in=fade_in,
        fade_out=fade_out,
    )


@dataclass(frozen=True, slots=True)
class NarrationClipInput:
    """A narration clip as stored in the project (design.md D2)."""

    id: str
    media_id: str
    at: float
    """Absolute start on the movie time axis"""
    trim_start: float
    trim_end: float | None
    volume: float
    fade_in: bool
    fade_out: bool


def narration_schedule(
    clips: Sequence[NarrationClipInput],
    media_durations: Mapping[str, float],
    movie_duration: float,
) -> tuple[AudioSegment, ...]:
    """Places the narration clips on the movie time axis (design.md D2): each at
    its own stored `at`, in input order, with no chaining. Overlap is kept as it
    is — two clips sounding at once are mixed, and dropping or shortening one
    would throw away a recording the user made on purpose."""
    segments: list[AudioSegment] = []
    for clip in clips:
        segment = place_segment(
            AudioPlacement(
                media_id=clip.media_id,
                at=max(clip.at, 0.0),
                source_in=max(clip.trim_start, 0.0),
                length=played_length(clip, media_durations),
                gain=clip.volume,
                fade_in=clip.fade_in,
                fade_out=clip.fade_out,
            ),
            movie_duration,
        )
        if segment is not None:
            segments.append(segment)
    return tuple(segments)


@dataclass(frozen=True, slots=True)
class VideoClipAudioInput:
    """A video element with an audio track, already placed by the timeline."""

    media_id: str
    at: float
    """Start of the element on the movie time axis"""
    trim_in: float
    trim_out: float


def video_clip_audio_schedule(
    clips: Sequence[VideoClipAudioInput], movie_duration: float
) -> tuple[AudioSegment, ...]:
    """Places the original sound of the video elements (design.md D1): where the
    timeline put the element, playing exactly its `trim_in`/`trim_out` range.

    Full gain and no fades of its own — the one global level
    (`audio_balance_gains`) is the only volume a video clip's sound has. Only
    elements whose video actually carries an audio stream belong in `clips`; the
    caller filters those out, because asking the file is its job, not this pure
    function's. Overlap during a transition is intended: the two elements are
    cross-fading on screen, and their sound mixes.
    """
    segments: list[AudioSegment] = []
    for clip in clips:
        segment = place_segment(
            AudioPlacement(
                media_id=clip.media_id,
                at=max(clip.at, 0.0),
                source_in=max(clip.trim_in, 0.0),
                length=clip.trim_out - clip.trim_in,
                gain=1.0,
                fade_in=False,
                fade_out=False,
            ),
            movie_duration,
        )
        if segment is not None:
            segments.append(segment)
    return tuple(segments)


@dataclass(frozen=True, slots=True)
class AudioBalanceGains:
    """The two gains of the one global level (design.md D4)."""

    clip: float
    """Gain of the video-clip sound."""
    music_and_narration: float
    """Gain of music and narration together."""


def audio_balance_gains(balance: float) -> AudioBalanceGains:
    """At 0 the clip sound is silent and music plus narration play at full gain,
    at 100 the other way round, at 50 both at full gain. Between those the
    quieter side ramps linearly, so moving the level never makes the movie as a
    whole louder."""
    value = min(max(balance, 0.0), 100.0) if math.isfinite(balance) else 50.0
    return AudioBalanceGains(
        clip=min(1.0, value / 50.0),
        music_and_narration=min(1.0, (100.0 - value) / 50.0),
    )


def at_gain(segments: Sequence[AudioSegment], factor: float) -> tuple[AudioSegment, ...]:
    """The same segments at `factor` times the gain; at 0 the track is silent."""
    if factor <= 0:
        return ()
    if factor == 1:
        return tuple(segments)
    return tuple(replace(s, gain=s.gain * factor) for s in segments)
