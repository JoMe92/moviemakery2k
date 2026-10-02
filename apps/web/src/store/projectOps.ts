/**
 * Pure operations on the storyboard (spec slideshow-project).
 * A transition belongs to the target picture (`transitionIn`) and moves with it
 * when reordering; the first item never has an incoming transition.
 */
import type { Slide } from "../lib/apiClient";

export const SLIDE_DURATION = { min: 0.5, max: 60, step: 0.25, default: 5 } as const;
export const TRANSITION_DURATION = { min: 0.25, max: 5, step: 0.25 } as const;

function onGrid(value: number, step: number): boolean {
  const n = value / step;
  return Math.abs(n - Math.round(n)) < 1e-9;
}

export function isValidSlideDuration(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= SLIDE_DURATION.min &&
    value <= SLIDE_DURATION.max &&
    onGrid(value, SLIDE_DURATION.step)
  );
}

export function isValidTransitionDuration(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= TRANSITION_DURATION.min &&
    value <= TRANSITION_DURATION.max &&
    onGrid(value, TRANSITION_DURATION.step)
  );
}

export function newSlideId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

/** First item without an incoming transition. */
export function normalize(slides: readonly Slide[]): Slide[] {
  return slides.map((s, i) => (i === 0 && s.transitionIn ? { ...s, transitionIn: null } : s));
}

export function insertSlide(slides: readonly Slide[], slide: Slide, index: number): Slide[] {
  const at = Math.max(0, Math.min(index, slides.length));
  return normalize([...slides.slice(0, at), slide, ...slides.slice(at)]);
}

export function moveSlide(slides: readonly Slide[], from: number, to: number): Slide[] {
  if (from === to || from < 0 || from >= slides.length) return [...slides];
  const next = [...slides];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved as Slide);
  return normalize(next);
}

export function removeSlide(slides: readonly Slide[], id: string): Slide[] {
  return normalize(slides.filter((s) => s.id !== id));
}

export function updateSlide(
  slides: readonly Slide[],
  id: string,
  patch: (s: Slide) => Slide,
): Slide[] {
  return normalize(slides.map((s) => (s.id === id ? patch(s) : s)));
}
