/**
 * "Fit movie to music" (add-music-track design.md D8, spec music-track
 * "Film an Musik anpassen", fit-to-music-with-video-clips design.md D1–D3).
 *
 * Sets the display durations of the *stretchable* elements so the movie lasts
 * as long as the music:
 * - stretchable is every element with a display duration of its own (picture
 *   and title elements); a video clip is fixed, because its length is its trim
 *   window and stretching it would change the user's cut (non-goal of
 *   `add-timeline-editing`) — see `FitSlide.stretchable` (D1);
 * - evenly distributed over the stretchable elements, but *measured over the
 *   whole storyboard* with the fixed clips at their real length, taking the
 *   (unchanged) transitions into account with the overlapping time model of
 *   `timeline.ts` (total = Σ d_i − Σ min(T_i, d_{i-1}/2, d_i/2)). Measuring the
 *   whole storyboard is what makes a transition on the border between a fixed
 *   and a stretchable element come out right — its overlap depends on both
 *   neighbours, which is why "music length minus clip length" would not do (D2);
 * - rounded to 0.25 s and clamped to 0.5–60 s;
 * - the remaining deviation goes to the last stretchable element (itself on the
 *   0.25 s grid and within 0.5–60 s, so it gets as close to the target as
 *   possible).
 * If the music length cannot be reached with the existing elements, the result
 * names the reachable minimum or maximum and nothing is changed. That covers
 * the storyboard without any stretchable element — all video clips — on its
 * own: there `minTotal === maxTotal`, so every other music length falls into
 * exactly this message (D3).
 *
 * Pure function without DOM/store so it can be tested in isolation.
 */
import { buildTimeline, type TimelineSlide } from "./timeline";

export const FIT_DURATION = { min: 0.5, max: 60, step: 0.25 } as const;

/** Tolerance for floating point comparisons of durations (s). */
const EPSILON = 1e-6;

/**
 * A storyboard element as input to the fit: its length in the time model plus
 * whether the fit may change it (design.md D1).
 *
 * `stretchable` absent means stretchable — a bare `TimelineSlide` is a display
 * duration the fit owns, which is what every storyboard without a video clip
 * is made of.
 */
export interface FitSlide extends TimelineSlide {
  /**
   * `false` for a video clip, whose length is its trim window and MUST stay
   * unchanged. Absent or `true` for a picture or title element.
   */
  stretchable?: boolean;
}

/** Whether the fit may set this element's duration (design.md D1). */
export function isStretchable(slide: FitSlide): boolean {
  return slide.stretchable !== false;
}

export type FitToMusicResult =
  /**
   * New duration per element (same order as the input slides). A fixed element
   * keeps the duration it came in with, so the list can be applied as a whole.
   */
  | { kind: "ok"; durations: number[]; total: number }
  /** Music longer than the movie can get; `reachable` is the maximum (s). */
  | { kind: "tooLong"; reachable: number }
  /** Music shorter than the movie can get; `reachable` is the minimum (s). */
  | { kind: "tooShort"; reachable: number }
  /** No elements or no music: the menu item is disabled. */
  | { kind: "unavailable" };

/** Movie duration of `slides` with every element set to `durations`. */
export function movieDurationWith(
  slides: readonly TimelineSlide[],
  durations: readonly number[],
): number {
  return buildTimeline(slides.map((s, i) => ({ ...s, duration: durations[i] ?? s.duration })))
    .duration;
}

/** Durations with every stretchable element at `duration`, the fixed ones as they are. */
function stretchedTo(slides: readonly FitSlide[], duration: number): number[] {
  return slides.map((s) => (isStretchable(s) ? duration : s.duration));
}

/** Movie duration with every stretchable element at `duration` (design.md D2). */
function uniformTotal(slides: readonly FitSlide[], duration: number): number {
  return movieDurationWith(slides, stretchedTo(slides, duration));
}

function roundToStep(value: number): number {
  const rounded = Math.round(value / FIT_DURATION.step) * FIT_DURATION.step;
  return Math.min(FIT_DURATION.max, Math.max(FIT_DURATION.min, rounded));
}

/** Whether "Fit movie to music" is available (spec: disabled without elements or music). */
export function canFitToMusic(slideCount: number, musicDuration: number): boolean {
  return slideCount > 0 && Number.isFinite(musicDuration) && musicDuration > 0;
}

/**
 * All stretchable elements `even`, the last stretchable one the grid value that
 * brings the movie closest to `target` (ties go to the value closest to `even`).
 */
function withRemainderOnLast(
  slides: readonly FitSlide[],
  lastStretchable: number,
  even: number,
  target: number,
): { durations: number[]; error: number } {
  const durations = stretchedTo(slides, even);
  let best = { duration: even, error: Infinity };
  const steps = Math.round((FIT_DURATION.max - FIT_DURATION.min) / FIT_DURATION.step);
  for (let k = 0; k <= steps; k++) {
    const candidate = FIT_DURATION.min + k * FIT_DURATION.step;
    durations[lastStretchable] = candidate;
    const error = Math.abs(movieDurationWith(slides, durations) - target);
    const better =
      error < best.error - EPSILON ||
      (Math.abs(error - best.error) <= EPSILON &&
        Math.abs(candidate - even) < Math.abs(best.duration - even));
    if (better) best = { duration: candidate, error };
  }
  durations[lastStretchable] = best.duration;
  return { durations, error: best.error };
}

export function fitToMusic(slides: readonly FitSlide[], target: number): FitToMusicResult {
  if (!canFitToMusic(slides.length, target)) return { kind: "unavailable" };

  // The reachable range is measured with the stretchable elements at their
  // limits and the fixed clips at their real length (design.md D3).
  const minTotal = uniformTotal(slides, FIT_DURATION.min);
  const maxTotal = uniformTotal(slides, FIT_DURATION.max);
  if (target > maxTotal + EPSILON) return { kind: "tooLong", reachable: maxTotal };
  if (target < minTotal - EPSILON) return { kind: "tooShort", reachable: minTotal };

  // Nothing to stretch: minTotal === maxTotal === the movie's own duration, so
  // only that one music length gets here and the storyboard already fits (D3).
  let lastStretchable = -1;
  slides.forEach((slide, index) => {
    if (isStretchable(slide)) lastStretchable = index;
  });
  if (lastStretchable < 0) {
    const durations = slides.map((s) => s.duration);
    return { kind: "ok", durations, total: movieDurationWith(slides, durations) };
  }

  // The total is strictly increasing in the stretchable duration (each
  // stretchable element adds 1, each transition takes away at most 1/2), so
  // bisect for the exact even duration.
  let lo: number = FIT_DURATION.min;
  let hi: number = FIT_DURATION.max;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (uniformTotal(slides, mid) < target) lo = mid;
    else hi = mid;
  }
  const exact = (lo + hi) / 2;

  // Evenly rounded to 0.25 s; normally to the nearest grid value. With many
  // elements the rounding error adds up and may exceed what the last
  // stretchable element can absorb (0.5–60 s), so the other rounding direction
  // is tried as well and wins only if it gets strictly closer to the target.
  const nearest = roundToStep(exact);
  const other = roundToStep(
    nearest > exact ? nearest - FIT_DURATION.step : nearest + FIT_DURATION.step,
  );
  let best = withRemainderOnLast(slides, lastStretchable, nearest, target);
  if (other !== nearest) {
    const alternative = withRemainderOnLast(slides, lastStretchable, other, target);
    if (alternative.error < best.error - EPSILON) best = alternative;
  }
  const durations = best.durations;
  return { kind: "ok", durations, total: movieDurationWith(slides, durations) };
}
