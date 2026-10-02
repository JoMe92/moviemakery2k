/**
 * Pure drop logic of the storyboard (spec slideshow-project "Bilder in den
 * Bildstreifen ziehen", spec slideshow-project "Bildstreifen bearbeiten").
 * Testable independently of dnd-kit.
 */
import { formatNumber } from "../i18n/format";
import type { Locale } from "../i18n/locale";
import { translate } from "../i18n/t";
import type { Slide } from "../lib/apiClient";

/** Data of the draggable items (dnd-kit `data`). */
export type DragItem =
  | { type: "media"; mediaId: string }
  | { type: "slide"; slideId: string }
  | { type: "transition"; transitionId: string };

/** Target under the pointer: a tile (with side) or the empty storyboard. */
export type DropTarget =
  | { type: "slide"; slideId: string; after: boolean }
  | { type: "strip" }
  /** Transition slot before the item `slideId` (only for transitions from the catalog). */
  | { type: "transitionSlot"; slideId: string };

export type DropAction =
  | { kind: "insert"; mediaId: string; index: number }
  | { kind: "move"; from: number; to: number }
  | { kind: "setTransition"; slideId: string; transitionId: string }
  | { kind: "none" };

export const STRIP_DROPPABLE_ID = "storyboard-strip";
export const mediaDraggableId = (mediaId: string) => `media:${mediaId}`;
export const transitionDraggableId = (transitionId: string) => `transition:${transitionId}`;
export const transitionSlotId = (slideId: string) => `slot:${slideId}`;

/** Insertion position (0…n) for a picture from the collection; null if there is no valid target. */
export function insertionIndex(target: DropTarget | null, slides: readonly Slide[]): number | null {
  if (!target || target.type === "transitionSlot") return null;
  if (target.type === "strip") return slides.length;
  const index = slides.findIndex((s) => s.id === target.slideId);
  if (index < 0) return null;
  return target.after ? index + 1 : index;
}

/**
 * Picture from the collection → insert at the insertion marker.
 * Tile from the storyboard → reorder (semantics like arrayMove: the target is
 * the index of the tile it is dropped on; empty area → to the end).
 * Transition from the catalog → set on a transition slot (replaces an
 * existing one); the first item has no slot.
 */
export function resolveDrop(
  item: DragItem | null,
  target: DropTarget | null,
  slides: readonly Slide[],
): DropAction {
  if (!item || !target) return { kind: "none" };
  if (item.type === "transition") {
    if (target.type !== "transitionSlot") return { kind: "none" };
    const index = slides.findIndex((s) => s.id === target.slideId);
    return index > 0
      ? { kind: "setTransition", slideId: target.slideId, transitionId: item.transitionId }
      : { kind: "none" };
  }
  if (target.type === "transitionSlot") return { kind: "none" };
  if (item.type === "media") {
    const index = insertionIndex(target, slides);
    return index === null ? { kind: "none" } : { kind: "insert", mediaId: item.mediaId, index };
  }
  const from = slides.findIndex((s) => s.id === item.slideId);
  if (from < 0) return { kind: "none" };
  const to =
    target.type === "strip" ? slides.length - 1 : slides.findIndex((s) => s.id === target.slideId);
  if (to < 0 || to === from) return { kind: "none" };
  return { kind: "move", from, to };
}

/** Duration on a tile, e.g. "5,00 s" (de) / "5.00 s" (en). */
export function formatDuration(seconds: number, locale: Locale): string {
  return translate(locale, "units.seconds", { value: formatNumber(locale, seconds, 2) });
}
