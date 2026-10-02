/**
 * Time model of the slideshow (design.md D3, spec preview-player "Zeitmodell").
 *
 * A transition belongs to the target image (`transitionIn`) and overlaps the end
 * of the predecessor with the start of the target image. Effective duration:
 *   t_i = min(T_i, d_{i-1} / 2, d_i / 2)
 * Start of image i = start of image i-1 + d_{i-1} − t_i.
 *
 * Pure functions without DOM/GL so the preview and the later export compute
 * identically.
 */
import { formatTime as formatLocalizedTime } from "../i18n/format";

export interface TimelineSlide {
  id: string;
  mediaId: string;
  /** Seconds */
  duration: number;
  transitionIn: { transitionId: string; duration: number } | null;
}

export interface PlacedSlide {
  index: number;
  slide: TimelineSlide;
  /** Start of the image (including the incoming transition) */
  start: number;
  end: number;
  /** effective duration of the incoming transition (0 = hard cut / first image) */
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

/** Effective transition duration between two images. */
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

/** What to draw at time `time` (seconds). Times are clamped to [0, duration]. */
export function frameAt(timeline: Timeline, time: number): Frame {
  const { segments, duration } = timeline;
  if (segments.length === 0) return { kind: "empty" };
  const t = Math.min(Math.max(time, 0), duration);
  // At the exact end the last segment counts (the last image is held).
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

/** Index of the image that is "active" at time `time` (for highlighting in the storyboard). */
export function slideIndexAt(timeline: Timeline, time: number): number | null {
  const frame = frameAt(timeline, time);
  if (frame.kind === "empty") return null;
  return frame.kind === "still" ? frame.slideIndex : frame.toIndex;
}

/**
 * Start time at which image `index` is fully visible (end of its incoming transition).
 * Target of "Next/Previous image" and of selection in the storyboard.
 */
export function slideStartTime(timeline: Timeline, index: number): number {
  const p = timeline.slides[index];
  return p ? p.start + p.transitionIn : 0;
}

/**
 * Time format of the monitor: h:mm:ss,cc (hundredths, rounded). German default;
 * localized display uses `formatTime(locale, seconds)` from `i18n/format`.
 */
export function formatTime(seconds: number): string {
  return formatLocalizedTime("de", seconds);
}
