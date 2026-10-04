/**
 * Music schedule (design.md D4, spec music-track "Musikspur", "Musik am Filmende").
 *
 * Pure function without DOM/Web Audio so that the preview and the export
 * (Python port `backend/src/mmy_backend/render/music.py`) place the music
 * identically. Both are checked against `packages/fixtures/music-vectors.json`.
 *
 * Semantics:
 * - Clips play in list order, gapless from 0; there is no start time per clip.
 * - A clip plays the source range `[trimStart, end)` of its medium, where `end`
 *   is `trimEnd`, or the medium duration if `trimEnd` is `null`; `end` is
 *   clamped to the medium duration. Played length = `end − trimStart`. A
 *   medium missing from `mediaDurations` counts as 0 s long. A clip with a
 *   played length ≤ 0 yields no segment and takes no time.
 * - A clip starting at or after the movie end is dropped (so are all following
 *   clips); a clip extending beyond the end is cut at the movie end.
 * - `gain` is the clip volume (linear amplitude, 1 = 100 %).
 * - `fadeIn` is 1 s if switched on, clipped to the segment length; else 0.
 * - `fadeOut`: the clip's own fade-out (1 s, clipped to the length) applies at
 *   the end of the clip. The automatic end-of-movie fade-out lasts
 *   `min(1, movieDuration)` s and is applied to the segment that reaches the
 *   movie end (cut or ending exactly there), clipped to its length. A cut clip
 *   loses its own fade-out (it would lie behind the movie end); a clip ending
 *   exactly at the movie end gets the longer of both fades. If the last
 *   segment is shorter than the end fade, the fade covers only that segment.
 * - Fades are linear ramps over the first `fadeIn` / last `fadeOut` seconds of
 *   a segment; if they overlap, the factors multiply.
 * - After the last segment the movie is silent. `movieDuration ≤ 0` (or not
 *   finite) yields no segments.
 */

/** Fixed duration of the per-clip fades and of the end-of-movie fade-out. */
export const FADE_SECONDS = 1;

export interface MusicClipInput {
  id: string;
  mediaId: string;
  /** Seconds */
  trimStart: number;
  /** Seconds, `null` = end of the file */
  trimEnd: number | null;
  /** Linear, 0–2 */
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

export interface MusicSegment {
  mediaId: string;
  /** Start on the movie time axis (s) */
  at: number;
  /** Start within the source medium (s) */
  sourceIn: number;
  length: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
}

export type MediaDurations = Readonly<Record<string, number>>;

function playedLength(clip: MusicClipInput, mediaDurations: MediaDurations): number {
  const duration = Object.hasOwn(mediaDurations, clip.mediaId) ? mediaDurations[clip.mediaId] : 0;
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) return 0;
  const end = clip.trimEnd === null ? duration : Math.min(clip.trimEnd, duration);
  return end - Math.max(clip.trimStart, 0);
}

/** Total length of the music track, independent of the movie duration. */
export function musicDuration(
  clips: readonly MusicClipInput[],
  mediaDurations: MediaDurations,
): number {
  return clips.reduce((sum, c) => sum + Math.max(playedLength(c, mediaDurations), 0), 0);
}

/** Places the music clips on the movie time axis (see module comment). */
export function musicSchedule(
  clips: readonly MusicClipInput[],
  mediaDurations: MediaDurations,
  movieDuration: number,
): MusicSegment[] {
  if (!Number.isFinite(movieDuration) || movieDuration <= 0) return [];
  const endFade = Math.min(FADE_SECONDS, movieDuration);
  const segments: MusicSegment[] = [];
  let at = 0;
  for (const clip of clips) {
    let length = playedLength(clip, mediaDurations);
    if (length <= 0) continue;
    if (at >= movieDuration) break;
    const cut = at + length > movieDuration;
    if (cut) length = movieDuration - at;
    const fadeIn = clip.fadeIn ? Math.min(FADE_SECONDS, length) : 0;
    let fadeOut = clip.fadeOut && !cut ? Math.min(FADE_SECONDS, length) : 0;
    if (at + length >= movieDuration) fadeOut = Math.max(fadeOut, Math.min(endFade, length));
    segments.push({
      mediaId: clip.mediaId,
      at,
      sourceIn: Math.max(clip.trimStart, 0),
      length,
      gain: clip.volume,
      fadeIn,
      fadeOut,
    });
    at += length;
  }
  return segments;
}
