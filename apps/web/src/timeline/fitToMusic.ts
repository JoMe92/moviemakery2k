/**
 * "Fit movie to music" (add-music-track design.md D8, spec music-track
 * "Film an Musik anpassen").
 *
 * Sets the picture durations so the movie lasts as long as the music:
 * - evenly distributed, taking the (unchanged) transitions into account with
 *   the overlapping time model of `timeline.ts`
 *   (total = Σ d_i − Σ min(T_i, d_{i-1}/2, d_i/2));
 * - rounded to 0.25 s and clamped to 0.5–60 s;
 * - the remaining deviation goes to the last picture (itself on the 0.25 s
 *   grid and within 0.5–60 s, so it gets as close to the target as possible).
 * If the music length cannot be reached with the existing pictures (every
 * picture would need less than 0.5 s or more than 60 s), the result names the
 * reachable minimum or maximum and nothing is changed.
 *
 * Pure function without DOM/store so it can be tested in isolation.
 */
import { buildTimeline, type TimelineSlide } from "./timeline";

export const FIT_DURATION = { min: 0.5, max: 60, step: 0.25 } as const;

/** Tolerance for floating point comparisons of durations (s). */
const EPSILON = 1e-6;

export type FitToMusicResult =
  /** New duration per picture (same order as the input slides). */
  | { kind: "ok"; durations: number[]; total: number }
  /** Music longer than the movie can get; `reachable` is the maximum (s). */
  | { kind: "tooLong"; reachable: number }
  /** Music shorter than the movie can get; `reachable` is the minimum (s). */
  | { kind: "tooShort"; reachable: number }
  /** No pictures or no music: the menu item is disabled. */
  | { kind: "unavailable" };

/** Movie duration of `slides` with all pictures set to `durations`. */
export function movieDurationWith(
  slides: readonly TimelineSlide[],
  durations: readonly number[],
): number {
  return buildTimeline(slides.map((s, i) => ({ ...s, duration: durations[i] ?? s.duration })))
    .duration;
}

function uniformTotal(slides: readonly TimelineSlide[], duration: number): number {
  return movieDurationWith(
    slides,
    slides.map(() => duration),
  );
}

function roundToStep(value: number): number {
  const rounded = Math.round(value / FIT_DURATION.step) * FIT_DURATION.step;
  return Math.min(FIT_DURATION.max, Math.max(FIT_DURATION.min, rounded));
}

/** Whether "Fit movie to music" is available (spec: disabled without pictures or music). */
export function canFitToMusic(slideCount: number, musicDuration: number): boolean {
  return slideCount > 0 && Number.isFinite(musicDuration) && musicDuration > 0;
}

/**
 * All pictures `even`, the last one the grid value that brings the movie
 * closest to `target` (ties go to the value closest to `even`).
 */
function withRemainderOnLast(
  slides: readonly TimelineSlide[],
  even: number,
  target: number,
): { durations: number[]; error: number } {
  const durations = slides.map(() => even);
  const last = slides.length - 1;
  let best = { duration: even, error: Infinity };
  const steps = Math.round((FIT_DURATION.max - FIT_DURATION.min) / FIT_DURATION.step);
  for (let k = 0; k <= steps; k++) {
    const candidate = FIT_DURATION.min + k * FIT_DURATION.step;
    durations[last] = candidate;
    const error = Math.abs(movieDurationWith(slides, durations) - target);
    const better =
      error < best.error - EPSILON ||
      (Math.abs(error - best.error) <= EPSILON &&
        Math.abs(candidate - even) < Math.abs(best.duration - even));
    if (better) best = { duration: candidate, error };
  }
  durations[last] = best.duration;
  return { durations, error: best.error };
}

export function fitToMusic(slides: readonly TimelineSlide[], target: number): FitToMusicResult {
  if (!canFitToMusic(slides.length, target)) return { kind: "unavailable" };

  const minTotal = uniformTotal(slides, FIT_DURATION.min);
  const maxTotal = uniformTotal(slides, FIT_DURATION.max);
  if (target > maxTotal + EPSILON) return { kind: "tooLong", reachable: maxTotal };
  if (target < minTotal - EPSILON) return { kind: "tooShort", reachable: minTotal };

  // The uniform total is strictly increasing in the duration (each picture
  // adds 1, each transition takes away at most 1/2), so bisect for the exact
  // even duration.
  let lo: number = FIT_DURATION.min;
  let hi: number = FIT_DURATION.max;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (uniformTotal(slides, mid) < target) lo = mid;
    else hi = mid;
  }
  const exact = (lo + hi) / 2;

  // Evenly rounded to 0.25 s; normally to the nearest grid value. With many
  // pictures the rounding error adds up and may exceed what the last picture
  // can absorb (0.5–60 s), so the other rounding direction is tried as well
  // and wins only if it gets strictly closer to the target.
  const nearest = roundToStep(exact);
  const other = roundToStep(
    nearest > exact ? nearest - FIT_DURATION.step : nearest + FIT_DURATION.step,
  );
  let best = withRemainderOnLast(slides, nearest, target);
  if (other !== nearest) {
    const alternative = withRemainderOnLast(slides, other, target);
    if (alternative.error < best.error - EPSILON) best = alternative;
  }
  const durations = best.durations;
  return { kind: "ok", durations, total: movieDurationWith(slides, durations) };
}
