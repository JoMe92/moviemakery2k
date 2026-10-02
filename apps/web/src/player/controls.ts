/**
 * Pure control logic of the player (spec preview-player "Wiedergabesteuerung").
 * No clock, no DOM: the store calls these functions, the rAF clock supplies dt.
 */
import {
  buildTimeline,
  type Frame,
  slideStartTime,
  type Timeline,
  type TimelineSlide,
} from "../timeline/timeline";

export interface Playback {
  playing: boolean;
  /** Seconds from the start of the slideshow (or the transition demo). */
  time: number;
}

export const STOPPED: Playback = { playing: false, time: 0 };

/** Largest time step per frame (background tab, stutter): never skip whole images. */
export const MAX_STEP = 0.25;
/** "Previous image" within this time after an image start jumps back one more image. */
export const PREV_GRACE = 0.5;
const EPS = 1e-6;

const timelines = new WeakMap<readonly TimelineSlide[], Timeline>();

/** Timeline for the (immutable) slides array, computed only once per array. */
export function timelineOf(slides: readonly TimelineSlide[]): Timeline {
  let tl = timelines.get(slides);
  if (!tl) {
    tl = buildTimeline(slides);
    timelines.set(slides, tl);
  }
  return tl;
}

export function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.min(Math.max(time, 0), Math.max(duration, 0));
}

/** Clock tick: stop at the end and hold the last frame. */
export function advance(p: Playback, dt: number, duration: number): Playback {
  if (!p.playing) return p;
  const time = p.time + Math.min(Math.max(dt, 0), MAX_STEP);
  if (time >= duration) return { playing: false, time: Math.max(duration, 0) };
  return { playing: true, time };
}

/** Start playback; at the end it restarts from the beginning. Does nothing without content. */
export function startPlayback(p: Playback, duration: number): Playback {
  if (duration <= 0) return STOPPED;
  return { playing: true, time: p.time >= duration - EPS ? 0 : clampTime(p.time, duration) };
}

/** Next image: start of the next image (end of its transition); past the last one → end. */
export function nextSlideTime(tl: Timeline, time: number): number {
  for (let i = 0; i < tl.slides.length; i++) {
    const start = slideStartTime(tl, i);
    if (start > time + EPS) return start;
  }
  return tl.duration;
}

/** Previous image: start of the current image; shortly after its start, that of the previous one. */
export function prevSlideTime(tl: Timeline, time: number): number {
  let target = 0;
  for (let i = 0; i < tl.slides.length; i++) {
    const start = slideStartTime(tl, i);
    if (start < time - PREV_GRACE) target = start;
  }
  return target;
}

/* ---------- Transition demo in the catalog (spec transitions "Übergänge in der Sammlung") ---------- */

/** Still image before and after the transition in the demo. */
export const DEMO_HOLD = 0.5;

export function demoDuration(transitionDuration: number): number {
  return DEMO_HOLD * 2 + transitionDuration;
}

/** Demo frame: index 0 = sample image A, index 1 = sample image B. */
export function demoFrame(time: number, transitionId: string, transitionDuration: number): Frame {
  if (time < DEMO_HOLD) return { kind: "still", slideIndex: 0 };
  if (time >= DEMO_HOLD + transitionDuration) return { kind: "still", slideIndex: 1 };
  return {
    kind: "transition",
    fromIndex: 0,
    toIndex: 1,
    transitionId,
    progress: transitionDuration > 0 ? (time - DEMO_HOLD) / transitionDuration : 1,
  };
}

/* ---------- Space bar ---------- */

export interface SpaceKeyEvent {
  key: string;
  code?: string;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target: EventTarget | null;
}

/** Input fields (text, select, editable content) keep the space bar. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const field = el.closest(
    "input, textarea, select, [contenteditable=''], [contenteditable='true']",
  );
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    // Only text inputs count as "input fields"; sliders (seek bar) and the like toggle.
    return !["button", "submit", "reset", "range", "checkbox", "radio"].includes(field.type);
  }
  return true;
}

/**
 * Should the space bar toggle play/pause? Not in input fields, not in
 * dialogs and menus, and not during a keyboard drag.
 */
export function shouldToggleOnSpace(
  event: SpaceKeyEvent,
  context: { dialogOpen: boolean; dragging: boolean },
): boolean {
  if (event.key !== " " && event.code !== "Space") return false;
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return false;
  if (context.dialogOpen || context.dragging) return false;
  if (isTypingTarget(event.target)) return false;
  const el = event.target as Element | null;
  if (el && typeof el.closest === "function" && el.closest("[role=menu], [role=menubar], dialog")) {
    return false;
  }
  return true;
}
