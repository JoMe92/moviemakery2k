/**
 * Music schedule (design.md D4, spec music-track "Musikspur", "Musik am Filmende").
 *
 * Pure function without DOM/Web Audio so that the preview and the export
 * (Python port `backend/src/mmy_backend/render/music.py`) place the music
 * identically. Both are checked against `packages/fixtures/music-vectors.json`.
 *
 * The music track is the sequential one of the project's audio tracks; what it
 * shares with the others (the segment shape, the trim arithmetic and how the
 * movie end cuts and fades a clip) lives in `audio.ts`.
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
import {
  type AudioSegment,
  type AudioTrim,
  type MediaDurations,
  placeSegment,
  playedLength,
} from "./audio";

export interface MusicClipInput extends AudioTrim {
  id: string;
  /** Linear, 0–2 */
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
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
): AudioSegment[] {
  if (!Number.isFinite(movieDuration) || movieDuration <= 0) return [];
  const segments: AudioSegment[] = [];
  let at = 0;
  for (const clip of clips) {
    const length = playedLength(clip, mediaDurations);
    if (length <= 0) continue;
    // The chain stops at the movie end: a clip starting there takes no time,
    // and neither does any clip after it.
    if (at >= movieDuration) break;
    const segment = placeSegment(
      {
        mediaId: clip.mediaId,
        at,
        sourceIn: Math.max(clip.trimStart, 0),
        length,
        gain: clip.volume,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
      },
      movieDuration,
    );
    if (segment) segments.push(segment);
    at += length;
  }
  return segments;
}
