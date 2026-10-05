/**
 * Title catalog helpers and the pure part of the title wizard
 * (add-titles-and-credits design.md D4-D6): display names, how many text
 * lines a layout takes, which placements the current selection allows, and
 * turning a wizard draft into a project element or an overlay field.
 *
 * Everything here is pure so the wizard's rules are testable without a DOM.
 */
import type { Locale } from "../i18n/locale";
import type { Slide, TitleLayout, TitleOverlay, TitleSlide, TitleStyle } from "../lib/apiClient";
import { newSlideId } from "../store/projectOps";

/** Display duration of a new title element in seconds (design.md "Standardwerte"). */
export const TITLE_DURATION_DEFAULT = 5;
/** Display duration of a new credits element: long enough for the scroll. */
export const CREDITS_DURATION_DEFAULT = 10;
/** Fixed text-colour palette of the wizard's "Farbe" step (design.md D6). */
export const TITLE_COLORS = ["#ffffff", "#ffff00", "#00ffff", "#ff80c0", "#80ff80"] as const;
export const TITLE_COLOR_DEFAULT = TITLE_COLORS[0];
/** Entries a credits list may hold (the backend's `MAX_CREDIT_ENTRIES`). */
export const CREDIT_ENTRIES_MAX = 50;

/** Name of a catalog entry in the UI language - same shape as `effectName.ts`. */
export function entryName(entry: Pick<TitleStyle, "names">, locale: Locale): string {
  return entry.names[locale];
}

/** Name of the style `id` in `catalog`; falls back to the ID for unknown entries. */
export function titleStyleName(catalog: readonly TitleStyle[], id: string, locale: Locale): string {
  const entry = catalog.find((s) => s.id === id);
  return entry ? entryName(entry, locale) : id;
}

export function titleStyleById(catalog: readonly TitleStyle[], id: string): TitleStyle | undefined {
  return catalog.find((s) => s.id === id);
}

/** How many text lines the "Text" step offers: a credits list is open-ended. */
export function lineCount(layout: TitleLayout): number {
  return layout === "two-line" ? 2 : 1;
}

export function isCredits(layout: TitleLayout): boolean {
  return layout === "credits";
}

/** Where the wizard can put the title (design.md D6, spec titles-and-credits). */
export type TitlePlacement = "start" | "before" | "on" | "end";

export const TITLE_PLACEMENTS: readonly TitlePlacement[] = ["start", "before", "on", "end"];

/**
 * Which placements are available for the current selection: "start" and "end"
 * always, "before" only with a selected element, "on" only with a selected
 * image or video element - a title element cannot host an overlay title
 * (spec slideshow-project).
 */
export function availablePlacements(selected: Slide | null | undefined): TitlePlacement[] {
  const available: TitlePlacement[] = ["start"];
  if (selected) available.push("before");
  if (selected && selected.kind !== "title") available.push("on");
  available.push("end");
  return available;
}

export function isPlacementAvailable(
  placement: TitlePlacement,
  selected: Slide | null | undefined,
): boolean {
  return availablePlacements(selected).includes(placement);
}

/** What the wizard has collected; the style's layout decides how it is stored. */
export interface TitleDraft {
  /** One or two lines for a title, the entries for a credits list. */
  lines: string[];
  styleId: string;
  color: string;
}

function cleanLines(lines: readonly string[]): string[] {
  const trimmed = lines.map((line) => line.trim());
  // Drop trailing empties (an untouched second line, a blank credits row) but
  // never end up with nothing: the backend requires at least one line.
  while (trimmed.length > 1 && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return trimmed.length > 0 ? trimmed : [""];
}

/** The draft as a freestanding title element (design.md D5). */
export function newTitleSlide(draft: TitleDraft, layout: TitleLayout): TitleSlide {
  const lines = cleanLines(draft.lines);
  const credits = isCredits(layout);
  return {
    kind: "title",
    id: newSlideId(),
    lines: credits ? null : lines.slice(0, lineCount(layout)),
    creditEntries: credits ? lines.slice(0, CREDIT_ENTRIES_MAX) : null,
    styleId: draft.styleId,
    color: draft.color,
    duration: credits ? CREDITS_DURATION_DEFAULT : TITLE_DURATION_DEFAULT,
    transitionIn: null,
  };
}

/**
 * The draft as an overlay title on an image or video element (design.md D5).
 * An overlay carries `lines` only, so a credits style's list is capped at the
 * layout's line count - the wizard offers credits styles for "on the clip"
 * only in that reduced form.
 */
export function newTitleOverlay(draft: TitleDraft, layout: TitleLayout): TitleOverlay {
  return {
    lines: cleanLines(draft.lines).slice(0, Math.max(1, lineCount(layout))),
    styleId: draft.styleId,
    color: draft.color,
  };
}

/** Index a "start"/"before"/"end" placement inserts at. */
export function insertIndexFor(
  placement: TitlePlacement,
  slides: readonly Slide[],
  selectedId: string | null,
): number {
  if (placement === "start") return 0;
  if (placement === "end") return slides.length;
  const index = slides.findIndex((s) => s.id === selectedId);
  return index >= 0 ? index : slides.length;
}
