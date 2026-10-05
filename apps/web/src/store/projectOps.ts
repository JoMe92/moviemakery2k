/**
 * Pure operations on the storyboard (spec slideshow-project).
 * A transition belongs to the target picture (`transitionIn`) and moves with it
 * when reordering; the first item never has an incoming transition.
 */
import type { Slide } from "../lib/apiClient";

export const SLIDE_DURATION = { min: 0.5, max: 60, step: 0.25, default: 5 } as const;
export const TRANSITION_DURATION = { min: 0.25, max: 5, step: 0.25 } as const;
/**
 * The one global audio level of the project (add-narration-and-audio-levels
 * D4): `max` plays only the sound of video clips, `min` only music and
 * narration, `default` both at full gain. Whole steps only - the backend takes
 * an integer.
 */
export const CLIP_AUDIO_BALANCE = { min: 0, max: 100, default: 50 } as const;

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

export function isValidClipAudioBalance(value: number): boolean {
  return (
    Number.isInteger(value) && value >= CLIP_AUDIO_BALANCE.min && value <= CLIP_AUDIO_BALANCE.max
  );
}

export function newSlideId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

/**
 * A slide's length in the time model: a video clip's trim window
 * (`trimOut - trimIn`), a picture's or title's display duration
 * (add-timeline-editing design.md D1, add-titles-and-credits D5).
 */
export function slideDuration(slide: Slide): number {
  return slide.kind === "video" ? slide.trimOut - slide.trimIn : slide.duration;
}

/**
 * The medium an element refers to, or null for a title element - which has
 * none of its own (add-titles-and-credits design.md D5). Mirrors the
 * backend's `slide_media_id`.
 */
export function slideMediaId(slide: Slide): string | null {
  return slide.kind === "title" ? null : slide.mediaId;
}

/**
 * The effect of an element, or null for a title element - which carries no
 * `effectId` (add-titles-and-credits design.md D5).
 */
export function slideEffectId(slide: Slide): string | null {
  return slide.kind === "title" ? null : slide.effectId;
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

/**
 * Splits a video slide in two at `splitPoint` (a trim-relative time, strictly
 * inside its own trim window; add-timeline-editing design.md D4): the first
 * keeps the id and the incoming transition and gets `trimOut = splitPoint`;
 * the second is a new slide with `trimIn = splitPoint`, the same effect and no
 * incoming transition (hard cut at the new inner edge). The transition to the
 * following element is unaffected. A non-video slide, or one not found, is
 * returned unchanged — callers validate with `videoSplitPoint` first.
 */
export function splitSlide(slides: readonly Slide[], id: string, splitPoint: number): Slide[] {
  const index = slides.findIndex((s) => s.id === id);
  const slide = slides[index];
  if (slide?.kind !== "video") return [...slides];
  const first: Slide = { ...slide, trimOut: splitPoint };
  const second: Slide = {
    kind: "video",
    id: newSlideId(),
    mediaId: slide.mediaId,
    trimIn: splitPoint,
    trimOut: slide.trimOut,
    effectId: slide.effectId,
    title: slide.title,
    transitionIn: null,
  };
  return normalize([...slides.slice(0, index), first, second, ...slides.slice(index + 1)]);
}
