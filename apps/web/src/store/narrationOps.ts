/**
 * Pure operations on the narration track (spec narration-track, add-narration-
 * and-audio-levels design.md D2).
 *
 * The one thing that makes this track different from the music track: a clip
 * stores its own absolute `at` on the movie time axis. So "move" means changing
 * that number, not changing a position in the list, and clips may overlap —
 * nothing here ever drops or shortens a neighbour.
 */
import type { NarrationClip } from "../lib/apiClient";
import { newSlideId } from "./projectOps";

/** At most this many clips on the narration track (spec narration-track). */
export const NARRATION_TRACK_MAX = 100;
/** Volume range as linear gain (API contract: 0–2 = 0–200 %), like music. */
export const NARRATION_VOLUME = { min: 0, max: 2 } as const;
/** Shortest played length of a trimmed clip in seconds, like music. */
export const NARRATION_CLIP_MIN_LENGTH = 0.5;
/** Largest start time the API accepts: the longest movie the slide limits allow. */
export const NARRATION_AT_MAX = 60000;
/** Tolerance when comparing trim values with the media duration (as in the backend). */
export const TRIM_EPSILON = 1e-6;

/** Editable fields of a narration clip (`at` included — moving is an edit here). */
export type NarrationClipPatch = Partial<Omit<NarrationClip, "id" | "mediaId">>;

/**
 * New clip with the defaults of the API contract: whole recording from `at`,
 * 100 %, no fades. A fresh recording passes its length as `trimEnd` so the clip
 * has a known length even before the media list has arrived.
 */
export function newNarrationClip(
  mediaId: string,
  at: number,
  trimEnd: number | null = null,
): NarrationClip {
  return {
    id: newSlideId(),
    mediaId,
    at: Math.max(0, at),
    trimStart: 0,
    trimEnd,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  };
}

/** Appends a clip; the list order carries no meaning, only `at` does. */
export function insertNarrationClip(
  narration: readonly NarrationClip[],
  clip: NarrationClip,
): NarrationClip[] {
  return [...narration, clip];
}

export function removeNarrationClip(
  narration: readonly NarrationClip[],
  id: string,
): NarrationClip[] {
  return narration.filter((c) => c.id !== id);
}

export function updateNarrationClip(
  narration: readonly NarrationClip[],
  id: string,
  patch: NarrationClipPatch,
): NarrationClip[] {
  return narration.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function isValidNarrationAt(at: number): boolean {
  return Number.isFinite(at) && at >= 0 && at <= NARRATION_AT_MAX;
}

export function isValidNarrationVolume(volume: number): boolean {
  return (
    Number.isFinite(volume) && volume >= NARRATION_VOLUME.min && volume <= NARRATION_VOLUME.max
  );
}

/**
 * Trim check of the spec: `0 ≤ start < end ≤ file duration` and a played
 * length of at least 0.5 s. `trimEnd` null means the end of the file.
 */
export function isValidNarrationTrim(
  trimStart: number,
  trimEnd: number | null,
  fileDuration: number,
): boolean {
  if (!Number.isFinite(trimStart) || trimStart < 0) return false;
  if (!Number.isFinite(fileDuration) || fileDuration <= 0) return false;
  const end = trimEnd ?? fileDuration;
  if (!Number.isFinite(end) || end > fileDuration + TRIM_EPSILON) return false;
  return trimStart < end && end - trimStart >= NARRATION_CLIP_MIN_LENGTH - TRIM_EPSILON;
}

/** Played length of a clip in seconds; 0 while its medium is unknown. */
export function narrationClipLength(clip: NarrationClip, fileDuration: number | undefined): number {
  if (fileDuration === undefined || !Number.isFinite(fileDuration) || fileDuration <= 0) {
    return clip.trimEnd !== null ? Math.max(0, clip.trimEnd - Math.max(clip.trimStart, 0)) : 0;
  }
  const end = clip.trimEnd === null ? fileDuration : Math.min(clip.trimEnd, fileDuration);
  return Math.max(0, end - Math.max(clip.trimStart, 0));
}
