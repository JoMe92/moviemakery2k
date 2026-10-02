/**
 * Reine Drop-Logik des Storyboards (Spec slideshow-project „Bilder in den
 * Bildstreifen ziehen“, „Bildstreifen bearbeiten“). Unabhängig von dnd-kit testbar.
 */
import type { Slide } from "../lib/apiClient";

/** Daten der ziehbaren Elemente (dnd-kit `data`). */
export type DragItem =
  | { type: "media"; mediaId: string }
  | { type: "slide"; slideId: string }
  | { type: "transition"; transitionId: string };

/** Ziel unter dem Zeiger: eine Kachel (mit Seite) oder der leere Bildstreifen. */
export type DropTarget =
  | { type: "slide"; slideId: string; after: boolean }
  | { type: "strip" }
  /** Übergangsplatz vor dem Element `slideId` (nur für Übergänge aus dem Katalog). */
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

/** Einfügeposition (0…n) für ein Bild aus der Sammlung; null, wenn kein gültiges Ziel. */
export function insertionIndex(target: DropTarget | null, slides: readonly Slide[]): number | null {
  if (!target || target.type === "transitionSlot") return null;
  if (target.type === "strip") return slides.length;
  const index = slides.findIndex((s) => s.id === target.slideId);
  if (index < 0) return null;
  return target.after ? index + 1 : index;
}

/**
 * Bild aus der Sammlung → Einfügen an der Einfügemarke.
 * Kachel aus dem Bildstreifen → Umsortieren (Semantik wie arrayMove: Ziel ist
 * der Index der Kachel, über der losgelassen wird; leerer Bereich → ans Ende).
 * Übergang aus dem Katalog → auf einen Übergangsplatz setzen (ersetzt einen
 * vorhandenen); das erste Element hat keinen Platz.
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

/** Bilddauer in der Kachel, z. B. „5,00 s“. */
export function formatDuration(seconds: number): string {
  return `${seconds.toFixed(2).replace(".", ",")} s`;
}
