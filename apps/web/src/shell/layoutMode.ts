import { useLayoutEffect, useSyncExternalStore } from "react";

/*
 * Layout modes (add-mobile-layout design.md D1). The breakpoints live only
 * here; theme.css repeats them as a custom-media comment for the CSS side.
 *
 *   compact  width < 600 px, or a phone in landscape with height < 500 px
 *   medium   width 600–1279 px
 *   wide     width ≥ 1280 px (the Movie Maker layout of the app-shell spec)
 */

export type LayoutMode = "compact" | "medium" | "wide";
export type Orientation = "portrait" | "landscape";

export interface Layout {
  mode: LayoutMode;
  orientation: Orientation;
  /** Coarse primary pointer (touch): every target grows to 44×44 px. */
  coarse: boolean;
}

/** Largest width (px) of the compact mode. */
export const COMPACT_MAX_WIDTH = 599;
/** Largest width (px) of the medium mode. */
export const MEDIUM_MAX_WIDTH = 1279;
/** Largest height (px) at which a landscape window still counts as compact. */
export const LANDSCAPE_COMPACT_MAX_HEIGHT = 499;

export const LAYOUT_QUERIES = {
  compact: `(max-width: ${COMPACT_MAX_WIDTH}px)`,
  compactLandscape: `(orientation: landscape) and (max-height: ${LANDSCAPE_COMPACT_MAX_HEIGHT}px)`,
  medium: `(max-width: ${MEDIUM_MAX_WIDTH}px)`,
  landscape: "(orientation: landscape)",
  coarse: "(pointer: coarse)",
} as const;

/** Layout without matchMedia (e.g. jsdom): the unchanged desktop layout. */
export const WIDE_LAYOUT: Layout = { mode: "wide", orientation: "landscape", coarse: false };

function matches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/** Computes the current layout from the media queries. */
export function readLayout(): Layout {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return WIDE_LAYOUT;
  const mode: LayoutMode =
    matches(LAYOUT_QUERIES.compact) || matches(LAYOUT_QUERIES.compactLandscape)
      ? "compact"
      : matches(LAYOUT_QUERIES.medium)
        ? "medium"
        : "wide";
  return {
    mode,
    orientation: matches(LAYOUT_QUERIES.landscape) ? "landscape" : "portrait",
    coarse: matches(LAYOUT_QUERIES.coarse),
  };
}

// One snapshot shared by all subscribers; recomputed on every media change so
// useSyncExternalStore sees a stable object between changes.
let snapshot: Layout | null = null;

function getSnapshot(): Layout {
  if (snapshot === null) snapshot = readLayout();
  return snapshot;
}

/** Replaces the shared snapshot only when the layout really changed. */
function refreshSnapshot(): void {
  const next = readLayout();
  const prev = snapshot;
  if (
    !prev ||
    prev.mode !== next.mode ||
    prev.orientation !== next.orientation ||
    prev.coarse !== next.coarse
  ) {
    snapshot = next;
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const lists = Object.values(LAYOUT_QUERIES).map((q) => window.matchMedia(q));
  // Every subscriber is notified; React skips the render when the snapshot
  // object stayed the same.
  const handler = () => {
    refreshSnapshot();
    onChange();
  };
  for (const list of lists) list.addEventListener("change", handler);
  // A matchMedia replaced since the last snapshot (tests) must not leave a stale one.
  handler();
  return () => {
    for (const list of lists) list.removeEventListener("change", handler);
  };
}

/** Forgets the cached layout (tests replace matchMedia between cases). */
export function resetLayoutSnapshot(): void {
  snapshot = null;
}

/**
 * Current layout mode, orientation and pointer kind. Changes with the window
 * size or orientation without a reload; the store state is untouched.
 */
export function useLayoutMode(): Layout {
  return useSyncExternalStore(subscribe, getSnapshot, () => WIDE_LAYOUT);
}

/** Touch operation (design.md D6): coarse pointer or compact layout. */
export function isTouchLayout(layout: Layout): boolean {
  return layout.coarse || layout.mode === "compact";
}

/**
 * Mirrors the layout on the root element as data-layout, data-orientation and
 * data-pointer, for CSS and for components that behave differently.
 */
export function useLayoutAttributes(layout: Layout): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.layout = layout.mode;
    root.dataset.orientation = layout.orientation;
    root.dataset.pointer = layout.coarse ? "coarse" : "fine";
  }, [layout]);
}
