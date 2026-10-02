"""Zeitmodell der Diashow als reine Funktionen (design.md D3 und D4).

Portierung von `apps/web/src/timeline/timeline.ts` (ohne `formatTime`), damit
Vorschau und Export identisch rechnen. Beide Implementierungen werden gegen
`packages/fixtures/timeline-vectors.json` geprüft.

Ein Übergang gehört zum Zielbild (`transition_in`) und überlappt das Ende des
Vorgängers mit dem Anfang des Zielbilds. Wirksame Dauer:
  t_i = min(T_i, d_{i-1} / 2, d_i / 2)
Start von Bild i = Start von Bild i-1 + d_{i-1} - t_i.

Segmente sind halboffen `[start, end)`; Zeiten werden auf `[0, Dauer]`
begrenzt, am exakten Ende zählt das letzte Segment.

Für den Export liegt Bild n bei `t = n / fps`; die Anzahl der Bilder ist
`ceil(Gesamtdauer · fps)` (`frame_count`).
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from mmy_backend.project import Project, Slide

# Relative Toleranz für `frame_count`: Ein Produkt, das bis auf Rundungsfehler
# ganzzahlig ist, zählt als ganzzahlig (sonst ergäbe ceil ein Bild zu viel).
_FRAME_COUNT_EPSILON = 1e-9


@dataclass(frozen=True, slots=True)
class TransitionIn:
    """Eingehender Übergang eines Bildes mit Solldauer in Sekunden."""

    transition_id: str
    duration: float


@dataclass(frozen=True, slots=True)
class TimelineSlide:
    id: str
    media_id: str
    duration: float
    """Sekunden"""
    transition_in: TransitionIn | None


@dataclass(frozen=True, slots=True)
class PlacedSlide:
    index: int
    slide: TimelineSlide
    start: float
    """Beginn des Bildes (inkl. eingehendem Übergang)"""
    end: float
    transition_in: float
    """Wirksame Dauer des eingehenden Übergangs (0 = harter Schnitt / erstes Bild)"""


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
    """Das Projekt hat keine Bilder."""


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
    """Wirksame Übergangsdauer zwischen zwei Bildern."""
    return max(0.0, min(requested, from_duration / 2, to_duration / 2))


def build_timeline(slides: Sequence[TimelineSlide]) -> Timeline:
    """Platziert die Bilder und zerlegt die Zeitachse lückenlos in Segmente."""
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
            # transition_in > 0 setzt Vorgänger und eingehenden Übergang voraus.
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
    """Was zum Zeitpunkt `time` (Sekunden) zu zeichnen ist; `time` wird auf [0, Dauer] begrenzt."""
    segments = timeline.segments
    if not segments:
        return EmptyFrame()
    t = min(max(time, 0.0), timeline.duration)
    # Am exakten Ende zählt das letzte Segment (letztes Bild bleibt stehen).
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
    """Index des Bildes, das zum Zeitpunkt `time` „aktiv“ ist (None bei leerem Projekt)."""
    frame = frame_at(timeline, time)
    if isinstance(frame, EmptyFrame):
        return None
    return frame.slide_index if isinstance(frame, StillFrame) else frame.to_index


def slide_start_time(timeline: Timeline, index: int) -> float:
    """Zeitpunkt, an dem Bild `index` voll sichtbar ist (Ende seines eingehenden Übergangs).

    Unbekannte Indizes (auch negative, anders als Pythons Listenindex) ergeben 0.
    """
    if not 0 <= index < len(timeline.slides):
        return 0.0
    p = timeline.slides[index]
    return p.start + p.transition_in


def frame_count(total_duration: float, fps: float) -> int:
    """Anzahl der Exportbilder: `ceil(Gesamtdauer · fps)`, mindestens 0.

    Liegt das Produkt bis auf eine relative Toleranz von 1e-9 auf einer ganzen
    Zahl, gilt diese Zahl; so ergibt etwa ein Rundungsfehler von 375.00000000001
    nicht 376 Bilder. Gewählt statt `fractions.Fraction`, weil Fraction die
    Rundungsfehler der Eingabe-Floats exakt übernähme (0.1 · 3 ≠ 0.3).
    """
    product = total_duration * fps
    if not math.isfinite(product) or product <= 0:
        return 0
    nearest = round(product)
    if abs(product - nearest) <= _FRAME_COUNT_EPSILON * max(1.0, abs(product)):
        return int(nearest)
    return math.ceil(product)


def frame_time(n: int, fps: float) -> float:
    """Zeitpunkt (Sekunden) von Exportbild `n`."""
    return n / fps


def timeline_slide_from_project(slide: Slide) -> TimelineSlide:
    """Ein Projektelement als Eingabe des Zeitmodells."""
    ref = slide.transition_in
    return TimelineSlide(
        id=slide.id,
        media_id=slide.media_id,
        duration=slide.duration,
        transition_in=(
            TransitionIn(transition_id=ref.transition_id, duration=ref.duration)
            if ref is not None
            else None
        ),
    )


def timeline_slides_from_project(project: Project) -> tuple[TimelineSlide, ...]:
    """Alle Elemente eines Projekts in Reihenfolge als Eingabe für `build_timeline`."""
    return tuple(timeline_slide_from_project(s) for s in project.slides)
