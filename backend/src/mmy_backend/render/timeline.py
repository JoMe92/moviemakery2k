"""Time model of the slideshow as pure functions (design.md D3 and D4).

Port of `apps/web/src/timeline/timeline.ts` (without `formatTime`) so that
preview and export compute identically. Both implementations are checked
against `packages/fixtures/timeline-vectors.json`.

A transition belongs to the target slide (`transition_in`) and overlaps the end
of the predecessor with the start of the target slide. Effective duration:
  t_i = min(T_i, d_{i-1} / 2, d_i / 2)
Start of slide i = start of slide i-1 + d_{i-1} - t_i.

Segments are half-open `[start, end)`; times are clamped to `[0, duration]`,
at the exact end the last segment counts.

For the export, frame n lies at `t = n / fps`; the number of frames is
`ceil(total duration · fps)` (`frame_count`).
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from mmy_backend.project import Project, Slide

# Relative tolerance for `frame_count`: a product that is integral up to rounding
# errors counts as integral (otherwise ceil would yield one frame too many).
_FRAME_COUNT_EPSILON = 1e-9


@dataclass(frozen=True, slots=True)
class TransitionIn:
    """Incoming transition of a slide with its target duration in seconds."""

    transition_id: str
    duration: float


@dataclass(frozen=True, slots=True)
class TimelineSlide:
    id: str
    media_id: str
    duration: float
    """Seconds"""
    transition_in: TransitionIn | None


@dataclass(frozen=True, slots=True)
class PlacedSlide:
    index: int
    slide: TimelineSlide
    start: float
    """Start of the slide (including the incoming transition)"""
    end: float
    transition_in: float
    """Effective duration of the incoming transition (0 = hard cut / first slide)"""


@dataclass(frozen=True, slots=True)
class StillSegment:
    slide_index: int
    start: float
    end: float


@dataclass(frozen=True, slots=True)
class TransitionSegment:
    from_index: int
    to_index: int
    transition_id: str
    start: float
    end: float


Segment = StillSegment | TransitionSegment


@dataclass(frozen=True, slots=True)
class Timeline:
    slides: tuple[PlacedSlide, ...]
    segments: tuple[Segment, ...]
    duration: float


@dataclass(frozen=True, slots=True)
class EmptyFrame:
    """The project has no slides."""


@dataclass(frozen=True, slots=True)
class StillFrame:
    slide_index: int


@dataclass(frozen=True, slots=True)
class TransitionFrame:
    from_index: int
    to_index: int
    transition_id: str
    progress: float
    """0 … 1"""


Frame = EmptyFrame | StillFrame | TransitionFrame


def effective_transition(requested: float, from_duration: float, to_duration: float) -> float:
    """Effective transition duration between two slides."""
    return max(0.0, min(requested, from_duration / 2, to_duration / 2))


def build_timeline(slides: Sequence[TimelineSlide]) -> Timeline:
    """Places the slides and splits the timeline into contiguous segments."""
    placed: list[PlacedSlide] = []
    cursor = 0.0
    for index, slide in enumerate(slides):
        prev = placed[index - 1] if index > 0 else None
        t = (
            effective_transition(slide.transition_in.duration, prev.slide.duration, slide.duration)
            if prev is not None and slide.transition_in is not None
            else 0.0
        )
        start = prev.end - t if prev is not None else 0.0
        end = start + slide.duration
        placed.append(PlacedSlide(index=index, slide=slide, start=start, end=end, transition_in=t))
        cursor = end

    segments: list[Segment] = []
    for i, p in enumerate(placed):
        nxt = placed[i + 1] if i + 1 < len(placed) else None
        still_start = p.start + p.transition_in
        still_end = nxt.start if nxt is not None else p.end
        if p.transition_in > 0:
            # transition_in > 0 implies a predecessor and an incoming transition.
            prev = placed[i - 1]
            assert p.slide.transition_in is not None
            segments.append(
                TransitionSegment(
                    from_index=prev.index,
                    to_index=p.index,
                    transition_id=p.slide.transition_in.transition_id,
                    start=p.start,
                    end=still_start,
                )
            )
        if still_end > still_start:
            segments.append(StillSegment(slide_index=p.index, start=still_start, end=still_end))

    return Timeline(slides=tuple(placed), segments=tuple(segments), duration=cursor)


def frame_at(timeline: Timeline, time: float) -> Frame:
    """What to draw at time `time` (seconds); `time` is clamped to [0, duration]."""
    segments = timeline.segments
    if not segments:
        return EmptyFrame()
    t = min(max(time, 0.0), timeline.duration)
    # At the exact end the last segment counts (the last slide stays visible).
    seg = next((s for s in segments if s.start <= t < s.end), segments[-1])
    if isinstance(seg, StillSegment):
        return StillFrame(slide_index=seg.slide_index)
    span = seg.end - seg.start
    return TransitionFrame(
        from_index=seg.from_index,
        to_index=seg.to_index,
        transition_id=seg.transition_id,
        progress=min(max((t - seg.start) / span, 0.0), 1.0) if span > 0 else 1.0,
    )


def slide_index_at(timeline: Timeline, time: float) -> int | None:
    """Index of the slide that is "active" at time `time` (None for an empty project)."""
    frame = frame_at(timeline, time)
    if isinstance(frame, EmptyFrame):
        return None
    return frame.slide_index if isinstance(frame, StillFrame) else frame.to_index


def slide_start_time(timeline: Timeline, index: int) -> float:
    """Time at which slide `index` is fully visible (end of its incoming transition).

    Unknown indices (including negative ones, unlike Python list indexing) yield 0.
    """
    if not 0 <= index < len(timeline.slides):
        return 0.0
    p = timeline.slides[index]
    return p.start + p.transition_in


def frame_count(total_duration: float, fps: float) -> int:
    """Number of export frames: `ceil(total duration · fps)`, at least 0.

    If the product lies on an integer up to a relative tolerance of 1e-9, that
    integer applies; so a rounding error such as 375.00000000001 does not yield
    376 frames. Chosen instead of `fractions.Fraction` because Fraction would
    carry over the rounding errors of the input floats exactly (0.1 · 3 ≠ 0.3).
    """
    product = total_duration * fps
    if not math.isfinite(product) or product <= 0:
        return 0
    nearest = round(product)
    if abs(product - nearest) <= _FRAME_COUNT_EPSILON * max(1.0, abs(product)):
        return int(nearest)
    return math.ceil(product)


def frame_time(n: int, fps: float) -> float:
    """Time (seconds) of export frame `n`."""
    return n / fps


def timeline_slide_from_project(slide: Slide) -> TimelineSlide:
    """A project element as input to the time model; a video slide's duration is
    always `trimOut - trimIn` (add-timeline-editing design.md D1)."""
    ref = slide.transition_in
    duration = slide.duration if slide.kind == "image" else slide.trim_out - slide.trim_in
    return TimelineSlide(
        id=slide.id,
        media_id=slide.media_id,
        duration=duration,
        transition_in=(
            TransitionIn(transition_id=ref.transition_id, duration=ref.duration)
            if ref is not None
            else None
        ),
    )


def timeline_slides_from_project(project: Project) -> tuple[TimelineSlide, ...]:
    """All elements of a project, in order, as input for `build_timeline`."""
    return tuple(timeline_slide_from_project(s) for s in project.slides)
