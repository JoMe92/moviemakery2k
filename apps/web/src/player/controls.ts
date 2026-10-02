/**
 * Reine Steuerlogik des Players (Spec preview-player „Wiedergabesteuerung“).
 * Keine Uhr, kein DOM: der Store ruft diese Funktionen, die rAF-Uhr liefert dt.
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
  /** Sekunden ab Beginn der Diashow (bzw. der Übergangsdemo). */
  time: number;
}

export const STOPPED: Playback = { playing: false, time: 0 };

/** Größter Zeitschritt pro Frame (Tab im Hintergrund, Ruckler): kein Sprung über ganze Bilder. */
export const MAX_STEP = 0.25;
/** „Vorheriges Bild“ innerhalb dieser Zeit nach einem Bildanfang springt ein Bild weiter zurück. */
export const PREV_GRACE = 0.5;
const EPS = 1e-6;

const timelines = new WeakMap<readonly TimelineSlide[], Timeline>();

/** Zeitachse zum (unveränderlichen) Slides-Array, je Array nur einmal berechnet. */
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

/** Uhrschritt: am Ende anhalten und den letzten Frame stehen lassen. */
export function advance(p: Playback, dt: number, duration: number): Playback {
  if (!p.playing) return p;
  const time = p.time + Math.min(Math.max(dt, 0), MAX_STEP);
  if (time >= duration) return { playing: false, time: Math.max(duration, 0) };
  return { playing: true, time };
}

/** Wiedergabe starten; am Ende beginnt sie von vorn. Ohne Inhalt passiert nichts. */
export function startPlayback(p: Playback, duration: number): Playback {
  if (duration <= 0) return STOPPED;
  return { playing: true, time: p.time >= duration - EPS ? 0 : clampTime(p.time, duration) };
}

/** Nächstes Bild: Anfang des nächsten Bildes (Ende seines Übergangs); hinter dem letzten → Ende. */
export function nextSlideTime(tl: Timeline, time: number): number {
  for (let i = 0; i < tl.slides.length; i++) {
    const start = slideStartTime(tl, i);
    if (start > time + EPS) return start;
  }
  return tl.duration;
}

/** Vorheriges Bild: Anfang des aktuellen Bildes, kurz nach dessen Anfang der des vorherigen. */
export function prevSlideTime(tl: Timeline, time: number): number {
  let target = 0;
  for (let i = 0; i < tl.slides.length; i++) {
    const start = slideStartTime(tl, i);
    if (start < time - PREV_GRACE) target = start;
  }
  return target;
}

/* ---------- Übergangsdemo im Katalog (Spec transitions „Übergänge in der Sammlung“) ---------- */

/** Standbild vor und nach dem Übergang in der Demo. */
export const DEMO_HOLD = 0.5;

export function demoDuration(transitionDuration: number): number {
  return DEMO_HOLD * 2 + transitionDuration;
}

/** Demo-Frame: Index 0 = Beispielbild A, Index 1 = Beispielbild B. */
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

/* ---------- Leertaste ---------- */

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

/** Eingabefelder (Text, Auswahl, editierbarer Inhalt) behalten die Leertaste. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const field = el.closest(
    "input, textarea, select, [contenteditable=''], [contenteditable='true']",
  );
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    // Nur Texteingaben sind „Eingabefelder“; Schieberegler (Suchleiste) & Co. schalten.
    return !["button", "submit", "reset", "range", "checkbox", "radio"].includes(field.type);
  }
  return true;
}

/**
 * Soll die Leertaste Wiedergabe/Pause umschalten? Nicht in Eingabefeldern,
 * nicht in Dialogen und Menüs und nicht während eines Tastatur-Drags.
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
