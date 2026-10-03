import { act } from "@testing-library/react";
import { type LayoutMode, type Orientation, resetLayoutSnapshot } from "../shell/layoutMode";

/*
 * Fake viewport for jsdom (add-mobile-layout design.md D15). Installs a
 * window.matchMedia that evaluates the simple queries the app uses
 * (width/height ranges, orientation, pointer, prefers-reduced-motion) against
 * a mutable viewport and fires "change" events when it changes.
 */

export interface Viewport {
  width: number;
  height: number;
  coarse: boolean;
  reducedMotion: boolean;
}

export interface LayoutOptions {
  coarse?: boolean;
  orientation?: Orientation;
  reducedMotion?: boolean;
}

export interface LayoutController {
  readonly viewport: Viewport;
  /** Changes the viewport and notifies every listener (inside act()). */
  resize(width: number, height: number): void;
  set(patch: Partial<Viewport>): void;
}

/** Representative window sizes per mode (the spec scenarios). */
const SIZES: Record<LayoutMode, Record<Orientation, [number, number]>> = {
  compact: { portrait: [390, 844], landscape: [844, 390] },
  medium: { portrait: [820, 1180], landscape: [1180, 820] },
  wide: { portrait: [1280, 1400], landscape: [1280, 720] },
};

function evaluateFeature(feature: string, vp: Viewport): boolean {
  const m = /^\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)$/.exec(feature.trim());
  if (!m) return false;
  const [, name, raw] = m;
  const px = Number.parseFloat(raw ?? "");
  switch (name) {
    case "max-width":
      return vp.width <= px;
    case "min-width":
      return vp.width >= px;
    case "max-height":
      return vp.height <= px;
    case "min-height":
      return vp.height >= px;
    case "orientation":
      return raw === (vp.width > vp.height ? "landscape" : "portrait");
    case "pointer":
      return raw === (vp.coarse ? "coarse" : "fine");
    case "hover":
      return raw === (vp.coarse ? "none" : "hover");
    case "prefers-reduced-motion":
      return raw === (vp.reducedMotion ? "reduce" : "no-preference");
    default:
      return false;
  }
}

export function evaluateQuery(query: string, vp: Viewport): boolean {
  return query
    .split(",")
    .some((part) => part.split(/\s+and\s+/).every((f) => evaluateFeature(f, vp)));
}

/**
 * Puts the fake viewport into the given mode. Tests restore the real (absent)
 * matchMedia via setup.ts after each case.
 */
export function mockLayout(mode: LayoutMode, options: LayoutOptions = {}): LayoutController {
  const [width, height] = SIZES[mode][options.orientation ?? "portrait"];
  return mockViewport({
    width,
    height,
    coarse: options.coarse ?? mode !== "wide",
    reducedMotion: options.reducedMotion ?? false,
  });
}

export function mockViewport(initial: Viewport): LayoutController {
  const viewport: Viewport = { ...initial };
  const lists = new Set<{ list: MediaQueryList; listeners: Set<EventListener>; last: boolean }>();

  const matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<EventListener>();
    const list = {
      media: query,
      get matches() {
        return evaluateQuery(query, viewport);
      },
      onchange: null,
      addEventListener: (_type: string, l: EventListener) => listeners.add(l),
      removeEventListener: (_type: string, l: EventListener) => listeners.delete(l),
      addListener: (l: EventListener) => listeners.add(l),
      removeListener: (l: EventListener) => listeners.delete(l),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
    lists.add({ list, listeners, last: list.matches });
    return list;
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  resetLayoutSnapshot();

  const notify = () => {
    act(() => {
      for (const entry of lists) {
        const now = entry.list.matches;
        if (now === entry.last) continue;
        entry.last = now;
        const event = { matches: now, media: entry.list.media } as unknown as Event;
        for (const l of [...entry.listeners]) l(event);
      }
    });
  };

  return {
    viewport,
    resize(width, height) {
      viewport.width = width;
      viewport.height = height;
      notify();
    },
    set(patch) {
      Object.assign(viewport, patch);
      notify();
    },
  };
}

/** Removes the fake matchMedia again (jsdom has none). */
export function restoreLayout(): void {
  Reflect.deleteProperty(window, "matchMedia");
  resetLayoutSnapshot();
  const root = document.documentElement;
  delete root.dataset.layout;
  delete root.dataset.orientation;
  delete root.dataset.pointer;
}
