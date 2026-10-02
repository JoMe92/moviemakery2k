/**
 * Zeitmodell der Diashow (design.md D3, Spec preview-player „Zeitmodell“).
 *
 * Ein Übergang gehört zum Zielbild (`transitionIn`) und überlappt das Ende des
 * Vorgängers mit dem Anfang des Zielbilds. Wirksame Dauer:
 *   t_i = min(T_i, d_{i-1} / 2, d_i / 2)
 * Start von Bild i = Start von Bild i-1 + d_{i-1} − t_i.
 *
 * Reine Funktionen ohne DOM/GL, damit Vorschau und späterer Export identisch
 * rechnen.
 */
import { formatTime as formatLocalizedTime } from "../i18n/format";

export interface TimelineSlide {
  id: string;
  mediaId: string;
  /** Sekunden */
  duration: number;
  transitionIn: { transitionId: string; duration: number } | null;
}

export interface PlacedSlide {
  index: number;
  slide: TimelineSlide;
  /** Beginn des Bildes (inkl. eingehendem Übergang) */
  start: number;
  end: number;
  /** wirksame Dauer des eingehenden Übergangs (0 = harter Schnitt / erstes Bild) */
  transitionIn: number;
}

export type Segment =
  | { kind: "still"; slideIndex: number; start: number; end: number }
  | {
      kind: "transition";
      fromIndex: number;
      toIndex: number;
      transitionId: string;
      start: number;
      end: number;
    };

export interface Timeline {
  slides: PlacedSlide[];
  segments: Segment[];
  duration: number;
}

export type Frame =
  | { kind: "empty" }
  | { kind: "still"; slideIndex: number }
  | {
      kind: "transition";
      fromIndex: number;
      toIndex: number;
      transitionId: string;
      /** 0 … 1 */
      progress: number;
    };

/** Wirksame Übergangsdauer zwischen zwei Bildern. */
export function effectiveTransition(
  requested: number,
  fromDuration: number,
  toDuration: number,
): number {
  return Math.max(0, Math.min(requested, fromDuration / 2, toDuration / 2));
}

export function buildTimeline(slides: readonly TimelineSlide[]): Timeline {
  const placed: PlacedSlide[] = [];
  let cursor = 0;
  slides.forEach((slide, index) => {
    const prev = placed[index - 1];
    const t =
      prev && slide.transitionIn
        ? effectiveTransition(slide.transitionIn.duration, prev.slide.duration, slide.duration)
        : 0;
    const start = prev ? prev.end - t : 0;
    const end = start + slide.duration;
    placed.push({ index, slide, start, end, transitionIn: t });
    cursor = end;
  });

  const segments: Segment[] = [];
  placed.forEach((p, i) => {
    const next = placed[i + 1];
    const stillStart = p.start + p.transitionIn;
    const stillEnd = next ? next.start : p.end;
    if (p.transitionIn > 0) {
      const prev = placed[i - 1] as PlacedSlide;
      segments.push({
        kind: "transition",
        fromIndex: prev.index,
        toIndex: p.index,
        transitionId: (p.slide.transitionIn as { transitionId: string }).transitionId,
        start: p.start,
        end: stillStart,
      });
    }
    if (stillEnd > stillStart) {
      segments.push({ kind: "still", slideIndex: p.index, start: stillStart, end: stillEnd });
    }
  });

  return { slides: placed, segments, duration: cursor };
}

/** Was zum Zeitpunkt `time` (Sekunden) zu zeichnen ist. Zeiten werden auf [0, Dauer] begrenzt. */
export function frameAt(timeline: Timeline, time: number): Frame {
  const { segments, duration } = timeline;
  if (segments.length === 0) return { kind: "empty" };
  const t = Math.min(Math.max(time, 0), duration);
  // Am exakten Ende zählt das letzte Segment (letztes Bild bleibt stehen).
  const seg =
    segments.find((s) => t >= s.start && t < s.end) ?? (segments[segments.length - 1] as Segment);
  if (seg.kind === "still") return { kind: "still", slideIndex: seg.slideIndex };
  const span = seg.end - seg.start;
  return {
    kind: "transition",
    fromIndex: seg.fromIndex,
    toIndex: seg.toIndex,
    transitionId: seg.transitionId,
    progress: span > 0 ? Math.min(Math.max((t - seg.start) / span, 0), 1) : 1,
  };
}

/** Index des Bildes, das zum Zeitpunkt `time` „aktiv“ ist (für Hervorhebung im Storyboard). */
export function slideIndexAt(timeline: Timeline, time: number): number | null {
  const frame = frameAt(timeline, time);
  if (frame.kind === "empty") return null;
  return frame.kind === "still" ? frame.slideIndex : frame.toIndex;
}

/**
 * Startzeit, an der Bild `index` voll sichtbar ist (Ende seines eingehenden Übergangs).
 * Ziel von „Nächstes/Vorheriges Bild“ und der Auswahl im Storyboard.
 */
export function slideStartTime(timeline: Timeline, index: number): number {
  const p = timeline.slides[index];
  return p ? p.start + p.transitionIn : 0;
}

/**
 * Zeitformat des Monitors: h:mm:ss,cc (Hundertstel, gerundet). German default;
 * localized display uses `formatTime(locale, seconds)` from `i18n/format`.
 */
export function formatTime(seconds: number): string {
  return formatLocalizedTime("de", seconds);
}
