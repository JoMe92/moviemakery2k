/**
 * Pure control logic of the player (spec preview-player "Wiedergabesteuerung").
 * No clock, no DOM: the store calls these functions, the rAF clock supplies dt.
 */
import type { Slide } from "../lib/apiClient";
import { isStretchableSlide, slideDuration, slideMediaId } from "../store/projectOps";
import type { FitSlide } from "../timeline/fitToMusic";
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
  /** Pause here instead of at the end (one-off preview of a transition). */
  until?: number;
}

export const STOPPED: Playback = { playing: false, time: 0 };

/** Largest time step per frame (background tab, stutter): never skip whole images. */
export const MAX_STEP = 0.25;
/** "Previous image" within this time after an image start jumps back one more image. */
export const PREV_GRACE = 0.5;
const EPS = 1e-6;

/**
 * A project element as input to the time model; a video slide's duration is
 * always `trimOut - trimIn` (add-timeline-editing design.md D1), and a title
 * element refers to no medium at all (add-titles-and-credits D5).
 */
export function toTimelineSlide(slide: Slide): TimelineSlide {
  return {
    id: slide.id,
    mediaId: slideMediaId(slide),
    duration: slideDuration(slide),
    transitionIn: slide.transitionIn,
  };
}

export function toTimelineSlides(slides: readonly Slide[]): TimelineSlide[] {
  return slides.map(toTimelineSlide);
}

/**
 * A project element as input to "Fit movie to music": its length in the time
 * model plus whether the fit may change it - a picture or title element is
 * stretchable, a video clip is fixed (fit-to-music-with-video-clips D1).
 */
export function toFitSlide(slide: Slide): FitSlide {
  return { ...toTimelineSlide(slide), stretchable: isStretchableSlide(slide) };
}

export function toFitSlides(slides: readonly Slide[]): FitSlide[] {
  return slides.map(toFitSlide);
}

/**
 * `video.currentTime` for a video slide at the current playback `time`:
 * `trimIn + (time - segmentStart)`, clamped to `[trimIn, trimOut]` so a
 * moment just outside the slide's own segment (e.g. mid-transition, read
 * from the overall clock rather than the transition's local progress) still
 * shows a frame from within its trim (spec preview-player "Videoclips in der
 * Wiedergabe", design.md D5).
 */
export function videoScrubTime(
  trimIn: number,
  trimOut: number,
  segmentStart: number,
  time: number,
): number {
  return Math.min(Math.max(time - segmentStart + trimIn, trimIn), trimOut);
}

/** `HTMLMediaElement.HAVE_METADATA`: duration and size are known. */
export const HAVE_METADATA = 1;
/** `HTMLMediaElement.HAVE_CURRENT_DATA`: a frame exists that can be drawn. */
export const HAVE_CURRENT_DATA = 2;
/** Imperceptible for the viewer, but still a seek for the browser. */
const SEEK_NUDGE = 0.001;
/**
 * Position difference below which no seek is issued.
 *
 * A paused element reports the presentation time of the frame it is showing,
 * which can sit up to one frame (40 ms at 25 fps) away from the position that
 * was asked for. Seeking on that difference would start a new seek on every
 * redraw, and every seek takes the element back below HAVE_CURRENT_DATA - the
 * monitor would never get a drawable frame (design.md D5).
 */
const SEEK_EPSILON = 0.05;

/**
 * Position to request on the `<video>` element, or `null` to leave it alone.
 *
 * Two cases need care. Assigning the position an element already has is a
 * no-op, so nothing is decoded: a clip with `trimIn` 0 shown at playback time
 * 0 would stay black until some other position is asked for. And the opposite,
 * re-seeking over a sub-frame difference, keeps the element in `seeking` and
 * equally black.
 */
export function videoSeekTarget(
  video: { readyState: number; currentTime: number; seeking?: boolean },
  target: number,
  trimIn: number,
  trimOut: number,
): number | null {
  if (video.readyState < HAVE_CURRENT_DATA) {
    // Nothing drawable yet: make sure the request is an actual seek.
    if (Math.abs(video.currentTime - target) > SEEK_NUDGE) return target;
    if (video.seeking) return null;
    if (target + SEEK_NUDGE <= trimOut) return target + SEEK_NUDGE;
    return Math.max(target - SEEK_NUDGE, trimIn);
  }
  if (video.seeking) return null;
  return Math.abs(video.currentTime - target) < SEEK_EPSILON ? null : target;
}

const timelines = new WeakMap<readonly Slide[], Timeline>();

/** Timeline for the (immutable) slides array, computed only once per array. */
export function timelineOf(slides: readonly Slide[]): Timeline {
  let tl = timelines.get(slides);
  if (!tl) {
    tl = buildTimeline(toTimelineSlides(slides));
    timelines.set(slides, tl);
  }
  return tl;
}

/**
 * Trim-relative split point for Clip → "Teilen" (design.md D4): the selected
 * slide's source-video time at the playhead, or `null` when the slide isn't a
 * video clip, isn't found, or the playhead isn't strictly within its own trim
 * window (splitting exactly at an edge would leave an empty half).
 */
export function videoSplitPoint(
  slides: readonly Slide[],
  slideId: string,
  time: number,
): number | null {
  const index = slides.findIndex((s) => s.id === slideId);
  const slide = slides[index];
  if (slide?.kind !== "video") return null;
  const placed = timelineOf(slides).slides[index];
  if (!placed) return null;
  const point = videoScrubTime(slide.trimIn, slide.trimOut, placed.start, time);
  return point > slide.trimIn && point < slide.trimOut ? point : null;
}

export function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.min(Math.max(time, 0), Math.max(duration, 0));
}

/** Clock tick: stop at the end and hold the last frame. */
export function advance(p: Playback, dt: number, duration: number): Playback {
  if (!p.playing) return p;
  const time = p.time + Math.min(Math.max(dt, 0), MAX_STEP);
  if (p.until !== undefined && time >= p.until && p.until < duration) {
    return { playing: false, time: p.until };
  }
  if (time >= duration) return { playing: false, time: Math.max(duration, 0) };
  return { ...p, playing: true, time };
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
