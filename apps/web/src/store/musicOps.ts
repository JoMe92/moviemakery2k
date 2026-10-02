/**
 * Pure operations on the music track (spec music-track "Musikspur",
 * "Musikleiste"). Clips play in list order; there is no start time per clip.
 */
import type { MediaItem, MusicClip } from "../lib/apiClient";
import type { MediaDurations } from "../timeline/music";
import { newSlideId } from "./projectOps";

/** At most this many clips on the music track (spec music-track "Musikspur"). */
export const MUSIC_TRACK_MAX = 100;

/** New clip with the defaults of the API contract: whole file, 100 %, no fades. */
export function newMusicClip(mediaId: string): MusicClip {
  return {
    id: newSlideId(),
    mediaId,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  };
}

export function insertMusicClip(
  music: readonly MusicClip[],
  clip: MusicClip,
  index: number,
): MusicClip[] {
  const at = Math.max(0, Math.min(index, music.length));
  return [...music.slice(0, at), clip, ...music.slice(at)];
}

export function moveMusicClip(music: readonly MusicClip[], from: number, to: number): MusicClip[] {
  if (from === to || from < 0 || from >= music.length) return [...music];
  const next = [...music];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved as MusicClip);
  return next;
}

export function removeMusicClip(music: readonly MusicClip[], id: string): MusicClip[] {
  return music.filter((c) => c.id !== id);
}

/** Durations of the audio media, as input for the music schedule. */
export function audioDurations(media: readonly MediaItem[]): MediaDurations {
  const durations: Record<string, number> = {};
  for (const m of media) if (m.kind === "audio") durations[m.id] = m.duration;
  return durations;
}

/** Volume range of a music clip as linear gain (API contract: 0–2 = 0–200 %). */
export const MUSIC_VOLUME = { min: 0, max: 2 } as const;
/** Shortest played length of a trimmed clip in seconds (spec music-track "Musikstücke bearbeiten"). */
export const MUSIC_CLIP_MIN_LENGTH = 0.5;
/** Tolerance when comparing trim values with the media duration (as in the backend). */
export const TRIM_EPSILON = 1e-6;

/** Editable fields of a music clip. */
export type MusicClipPatch = Partial<Omit<MusicClip, "id" | "mediaId">>;

export function isValidMusicVolume(volume: number): boolean {
  return Number.isFinite(volume) && volume >= MUSIC_VOLUME.min && volume <= MUSIC_VOLUME.max;
}

/**
 * Trim check of the spec: `0 ≤ start < end ≤ file duration` and a played
 * length of at least 0.5 s. `trimEnd` null means the end of the file.
 */
export function isValidMusicTrim(
  trimStart: number,
  trimEnd: number | null,
  fileDuration: number,
): boolean {
  if (!Number.isFinite(trimStart) || trimStart < 0) return false;
  if (!Number.isFinite(fileDuration) || fileDuration <= 0) return false;
  const end = trimEnd ?? fileDuration;
  if (!Number.isFinite(end) || end > fileDuration + TRIM_EPSILON) return false;
  return trimStart < end && end - trimStart >= MUSIC_CLIP_MIN_LENGTH - TRIM_EPSILON;
}

export function updateMusicClip(
  music: readonly MusicClip[],
  id: string,
  patch: MusicClipPatch,
): MusicClip[] {
  return music.map((c) => (c.id === id ? { ...c, ...patch } : c));
}
