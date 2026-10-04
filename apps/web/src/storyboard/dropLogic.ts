/**
 * Pure drop logic of the storyboard (spec slideshow-project "Bilder in den
 * Bildstreifen ziehen", spec slideshow-project "Bildstreifen bearbeiten").
 * Testable independently of dnd-kit.
 */
import { formatNumber } from "../i18n/format";
import type { Locale } from "../i18n/locale";
import { translate } from "../i18n/t";
import type { MusicClip, Slide } from "../lib/apiClient";

/** Data of the draggable items (dnd-kit `data`). */
export type DragItem =
  /** Picture from "My Pictures". */
  | { type: "media"; mediaId: string }
  /** Audio from "My Music" (add-music-track D7). */
  | { type: "audio"; mediaId: string }
  /** Video from "My Videos" (add-timeline-editing D2). */
  | { type: "video"; mediaId: string }
  | { type: "slide"; slideId: string }
  /** Clip on the music track. */
  | { type: "music"; clipId: string }
  | { type: "transition"; transitionId: string }
  /** Effect from "Video Effects" (add-effects-catalog D4). */
  | { type: "effect"; effectId: string };

/** Target under the pointer: a tile (with side) or the empty storyboard. */
export type DropTarget =
  | { type: "slide"; slideId: string; after: boolean }
  | { type: "strip" }
  /** Transition slot before the item `slideId` (only for transitions from the catalog). */
  | { type: "transitionSlot"; slideId: string }
  /** Effect slot of the item `slideId` (only for effects from the catalog). */
  | { type: "effectSlot"; slideId: string }
  /** A clip on the music track (with side) or the music track itself. */
  | { type: "musicClip"; clipId: string; after: boolean }
  | { type: "musicStrip" };

/** Why a drop was refused; the UI shows a hint (spec music-track "Musikleiste"). */
export type DropRejection = "audioOnStoryboard" | "pictureOnMusic";

export type DropAction =
  | { kind: "insert"; mediaId: string; index: number }
  | { kind: "move"; from: number; to: number }
  | { kind: "setTransition"; slideId: string; transitionId: string }
  | { kind: "setEffect"; slideId: string; effectId: string }
  | { kind: "insertMusic"; mediaId: string; index: number }
  | { kind: "moveMusic"; from: number; to: number }
  | { kind: "reject"; reason: DropRejection }
  | { kind: "none" };

export const STRIP_DROPPABLE_ID = "storyboard-strip";
export const mediaDraggableId = (mediaId: string) => `media:${mediaId}`;
export const videoDraggableId = (mediaId: string) => `video:${mediaId}`;
export const transitionDraggableId = (transitionId: string) => `transition:${transitionId}`;
export const transitionSlotId = (slideId: string) => `slot:${slideId}`;
export const effectDraggableId = (effectId: string) => `effect:${effectId}`;
export const effectSlotId = (slideId: string) => `effect-slot:${slideId}`;
export const MUSIC_DROPPABLE_ID = "music-strip";
export const audioDraggableId = (mediaId: string) => `audio:${mediaId}`;
export const musicClipSortableId = (clipId: string) => `music:${clipId}`;

const isStoryboardTarget = (target: DropTarget) =>
  target.type === "slide" ||
  target.type === "strip" ||
  target.type === "transitionSlot" ||
  target.type === "effectSlot";
const isMusicTarget = (
  target: DropTarget,
): target is Extract<DropTarget, { type: "musicClip" | "musicStrip" }> =>
  target.type === "musicClip" || target.type === "musicStrip";

/** Insertion position (0…n) on the music track for audio; null without a valid target. */
export function musicInsertionIndex(
  target: DropTarget | null,
  music: readonly MusicClip[],
): number | null {
  if (!target) return null;
  if (target.type === "musicStrip") return music.length;
  if (target.type !== "musicClip") return null;
  const index = music.findIndex((c) => c.id === target.clipId);
  if (index < 0) return null;
  return target.after ? index + 1 : index;
}

/** Insertion position (0…n) for a picture from the collection; null if there is no valid target. */
export function insertionIndex(target: DropTarget | null, slides: readonly Slide[]): number | null {
  if (!target || (target.type !== "slide" && target.type !== "strip")) return null;
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
 * Effect from the catalog → set on an effect slot (replaces an existing one);
 * every item has one (add-effects-catalog D4).
 * Audio from the collection → insert on the music track; a clip on the music
 * track → reorder there (same semantics as tiles). Audio on the storyboard and
 * pictures on the music track are refused with a reason for the hint.
 */
export function resolveDrop(
  item: DragItem | null,
  target: DropTarget | null,
  slides: readonly Slide[],
  music: readonly MusicClip[] = [],
): DropAction {
  if (!item || !target) return { kind: "none" };
  if (item.type === "audio") {
    if (isStoryboardTarget(target)) return { kind: "reject", reason: "audioOnStoryboard" };
    const index = musicInsertionIndex(target, music);
    return index === null
      ? { kind: "none" }
      : { kind: "insertMusic", mediaId: item.mediaId, index };
  }
  if (item.type === "music") {
    const from = music.findIndex((c) => c.id === item.clipId);
    if (from < 0 || !isMusicTarget(target)) return { kind: "none" };
    const to =
      target.type === "musicClip"
        ? music.findIndex((c) => c.id === target.clipId)
        : music.length - 1;
    if (to < 0 || to === from) return { kind: "none" };
    return { kind: "moveMusic", from, to };
  }
  if (isMusicTarget(target)) {
    return item.type === "media" || item.type === "video"
      ? { kind: "reject", reason: "pictureOnMusic" }
      : { kind: "none" };
  }
  if (item.type === "transition") {
    if (target.type !== "transitionSlot") return { kind: "none" };
    const index = slides.findIndex((s) => s.id === target.slideId);
    return index > 0
      ? { kind: "setTransition", slideId: target.slideId, transitionId: item.transitionId }
      : { kind: "none" };
  }
  if (item.type === "effect") {
    if (target.type !== "effectSlot") return { kind: "none" };
    return slides.some((s) => s.id === target.slideId)
      ? { kind: "setEffect", slideId: target.slideId, effectId: item.effectId }
      : { kind: "none" };
  }
  if (target.type === "transitionSlot" || target.type === "effectSlot") return { kind: "none" };
  if (item.type === "media" || item.type === "video") {
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
