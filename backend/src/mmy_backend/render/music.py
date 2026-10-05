"""Music schedule as a pure function (design.md D4, spec music-track).

Port of `apps/web/src/timeline/music.ts` so that preview and export place the
music identically. Both implementations are checked against
`packages/fixtures/music-vectors.json`.

The music track is the sequential one of the project's audio tracks; what it
shares with the others (the segment shape, the trim arithmetic and how the movie
end cuts and fades a clip) lives in `audio.py`.

Semantics of `music_schedule(clips, media_durations, movie_duration)`:

- Clips play in list order, gapless from 0. There is no start time per clip.
- A clip plays the source range `[trim_start, end)` of its medium, where `end`
  is `trim_end`, or the medium duration if `trim_end` is `None`; `end` is
  clamped to the medium duration. The played length is `end - trim_start`.
  A medium missing from `media_durations` counts as 0 s long. A clip with a
  played length <= 0 yields no segment and takes no time.
- A clip starting at or after the end of the movie is dropped (so are all
  following clips). A clip extending beyond the end is cut at the movie end.
- `gain` is the clip volume (linear amplitude, 1 = 100 %).
- `fade_in` is 1 s if the clip has its fade-in switched on, clipped to the
  segment length; otherwise 0.
- `fade_out`: the clip's own fade-out (1 s, clipped to the length) applies at
  the end of the clip. The automatic end-of-movie fade-out lasts
  `min(1, movie_duration)` seconds and is applied to the segment that reaches
  the movie end (cut or ending exactly there), clipped to its length. A cut
  clip loses its own fade-out (that would lie behind the movie end); a clip
  ending exactly at the movie end gets the longer of both fades. If the last
  segment is shorter than the end fade, the fade covers only that segment.
- Fades are linear ramps over the first `fade_in` / last `fade_out` seconds of
  a segment; if they overlap, the factors multiply.
- After the last segment the movie is silent. `movie_duration <= 0` (or not
  finite) yields no segments.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from mmy_backend.render.audio import (
    AudioPlacement,
    AudioSegment,
    place_segment,
    played_length,
)


@dataclass(frozen=True, slots=True)
class MusicClipInput:
    """A music clip as stored in the project (design.md D3)."""

    id: str
    media_id: str
    trim_start: float
    trim_end: float | None
    volume: float
    fade_in: bool
    fade_out: bool


def music_duration(clips: Sequence[MusicClipInput], media_durations: Mapping[str, float]) -> float:
    """Total length of the music track, independent of the movie duration."""
    return sum(max(played_length(c, media_durations), 0.0) for c in clips)


def music_schedule(
    clips: Sequence[MusicClipInput],
    media_durations: Mapping[str, float],
    movie_duration: float,
) -> tuple[AudioSegment, ...]:
    """Places the music clips on the movie time axis (see module docstring)."""
    if not math.isfinite(movie_duration) or movie_duration <= 0:
        return ()
    segments: list[AudioSegment] = []
    at = 0.0
    for clip in clips:
        length = played_length(clip, media_durations)
        if length <= 0:
            continue
        # The chain stops at the movie end: a clip starting there takes no time,
        # and neither does any clip after it.
        if at >= movie_duration:
            break
        segment = place_segment(
            AudioPlacement(
                media_id=clip.media_id,
                at=at,
                source_in=max(clip.trim_start, 0.0),
                length=length,
                gain=clip.volume,
                fade_in=clip.fade_in,
                fade_out=clip.fade_out,
            ),
            movie_duration,
        )
        if segment is not None:
            segments.append(segment)
        at += length
    return tuple(segments)
