/**
 * Audio schedules of the project, one per track (add-narration-and-audio-levels
 * design.md D1, D4 and D5; spec preview-player, spec narration-track).
 *
 * A **segment** is the smallest thing either the preview or the export has to
 * play: a stretch of one medium at a place on the movie time axis, with a gain
 * and two fade lengths. Nothing about a segment says which track it came from,
 * so the preview engine (`audio/AudioEngine.ts`) and the export's filter graph
 * (`backend/src/mmy_backend/render/mixdown.py`) handle any list of them.
 *
 * Three tracks produce segments, and they differ only in where a clip lands:
 *
 * - **Music** (`music.ts`, spec music-track) is sequential: clips play gapless
 *   from 0 in list order and store no start time.
 * - **Narration** (`narrationSchedule`) is the opposite: every clip carries its
 *   own absolute `at`, the list order means nothing, and two clips may overlap —
 *   the overlap is mixed, neither replaces the other.
 * - **Video-clip sound** (`videoClipAudioSchedule`) is derived, not stored: a
 *   video element's own audio sits where the timeline put the element and plays
 *   its `trimIn`/`trimOut` range. It has no volume or fades of its own — there
 *   is one global level for all of it (D4), not a field per clip.
 *
 * What every track shares is how the movie end treats a clip (`placeSegment`):
 * a clip starting at or after the end is dropped, one reaching past it is cut,
 * and whatever reaches the end fades out over `min(1 s, movieDuration)`.
 *
 * Pure functions without DOM or Web Audio, so the preview and the export place
 * the same sound at the same spot.
 */

/** Fixed duration of the per-clip fades and of the end-of-movie fade-out. */
export const FADE_SECONDS = 1;

export interface AudioSegment {
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

/** One clip ready to be placed: its own time range and its fade switches. */
export interface AudioPlacement {
  mediaId: string;
  /** Start on the movie time axis (s) */
  at: number;
  /** Start within the source medium (s) */
  sourceIn: number;
  /** Played length (s) before the movie end cuts it */
  length: number;
  /** Linear gain, 1 = 100 % */
  gain: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

/** Trim range of a clip on an audio track; `trimEnd: null` = end of the file. */
export interface AudioTrim {
  mediaId: string;
  trimStart: number;
  trimEnd: number | null;
}

/**
 * Played length of an audio clip: `end − trimStart`, where `end` is `trimEnd`
 * clamped to the medium duration, or that duration when `trimEnd` is null. A
 * medium missing from `mediaDurations` counts as 0 s long.
 */
export function playedLength(clip: AudioTrim, mediaDurations: MediaDurations): number {
  const duration = Object.hasOwn(mediaDurations, clip.mediaId) ? mediaDurations[clip.mediaId] : 0;
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) return 0;
  const end = clip.trimEnd === null ? duration : Math.min(clip.trimEnd, duration);
  return end - Math.max(clip.trimStart, 0);
}

/**
 * Places one clip on the movie time axis, the same way on every track.
 *
 * `null` means nothing is audible: the clip plays no time, or it starts at or
 * after the movie end. A clip reaching past the end is cut there and loses its
 * own fade-out (it would lie behind the end). Whatever reaches the movie end —
 * cut or ending exactly there — fades out over `min(FADE_SECONDS,
 * movieDuration)`, or over its own fade-out if that is longer. Both fades are
 * clipped to the segment length, and where they overlap the factors multiply.
 */
export function placeSegment(clip: AudioPlacement, movieDuration: number): AudioSegment | null {
  if (!Number.isFinite(movieDuration) || movieDuration <= 0) return null;
  if (clip.length <= 0 || clip.at >= movieDuration) return null;
  const cut = clip.at + clip.length > movieDuration;
  const length = cut ? movieDuration - clip.at : clip.length;
  const fadeIn = clip.fadeIn ? Math.min(FADE_SECONDS, length) : 0;
  let fadeOut = clip.fadeOut && !cut ? Math.min(FADE_SECONDS, length) : 0;
  if (clip.at + length >= movieDuration) {
    fadeOut = Math.max(fadeOut, Math.min(Math.min(FADE_SECONDS, movieDuration), length));
  }
  return {
    mediaId: clip.mediaId,
    at: clip.at,
    sourceIn: clip.sourceIn,
    length,
    gain: clip.gain,
    fadeIn,
    fadeOut,
  };
}

export interface NarrationClipInput extends AudioTrim {
  id: string;
  /** Absolute start on the movie time axis (s) */
  at: number;
  /** Linear, 0–2 */
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

/**
 * Places the narration clips on the movie time axis (design.md D2): each at its
 * own stored `at`, in input order, with no chaining. Overlap is kept as it is —
 * two clips sounding at once are mixed, and dropping or shortening one would
 * throw away a recording the user made on purpose.
 */
export function narrationSchedule(
  clips: readonly NarrationClipInput[],
  mediaDurations: MediaDurations,
  movieDuration: number,
): AudioSegment[] {
  const segments: AudioSegment[] = [];
  for (const clip of clips) {
    const segment = placeSegment(
      {
        mediaId: clip.mediaId,
        at: Math.max(clip.at, 0),
        sourceIn: Math.max(clip.trimStart, 0),
        length: playedLength(clip, mediaDurations),
        gain: clip.volume,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
      },
      movieDuration,
    );
    if (segment) segments.push(segment);
  }
  return segments;
}

export interface VideoClipAudioInput {
  mediaId: string;
  /** Start of the element on the movie time axis (s), from the timeline placement */
  at: number;
  /** Start within the video (s) */
  trimIn: number;
  /** End within the video (s) */
  trimOut: number;
}

/**
 * Places the original sound of the video elements (design.md D1): where the
 * timeline put the element, playing exactly its `trimIn`/`trimOut` range. Full
 * gain and no fades of its own — the one global level (`audioBalanceGains`)
 * is the only volume a video clip's sound has.
 *
 * Elements whose video has no audio track are not filtered here: the preview
 * finds that out when decoding fails, the export when ffprobe reports no audio
 * stream. Overlap during a transition is intended — the two elements are
 * cross-fading on screen, and their sound mixes just as it does on the
 * narration track.
 */
export function videoClipAudioSchedule(
  clips: readonly VideoClipAudioInput[],
  movieDuration: number,
): AudioSegment[] {
  const segments: AudioSegment[] = [];
  for (const clip of clips) {
    const segment = placeSegment(
      {
        mediaId: clip.mediaId,
        at: Math.max(clip.at, 0),
        sourceIn: Math.max(clip.trimIn, 0),
        length: clip.trimOut - clip.trimIn,
        gain: 1,
        fadeIn: false,
        fadeOut: false,
      },
      movieDuration,
    );
    if (segment) segments.push(segment);
  }
  return segments;
}

export interface AudioBalanceGains {
  /** Gain of the video-clip sound. */
  clip: number;
  /** Gain of music and narration together. */
  musicAndNarration: number;
}

/**
 * The two gains the one global level produces (design.md D4): at 0 the clip
 * sound is silent and music plus narration play at full gain, at 100 the other
 * way round, at 50 both at full gain. Between those the quieter side ramps
 * linearly, so moving the slider never makes the movie as a whole louder.
 */
export function audioBalanceGains(balance: number): AudioBalanceGains {
  const value = Number.isFinite(balance) ? Math.min(Math.max(balance, 0), 100) : 50;
  return {
    clip: Math.min(1, value / 50),
    musicAndNarration: Math.min(1, (100 - value) / 50),
  };
}

/** The same segments at `factor` times the gain; at 0 the track is silent. */
export function atGain(segments: readonly AudioSegment[], factor: number): AudioSegment[] {
  if (factor <= 0) return [];
  if (factor === 1) return [...segments];
  return segments.map((segment) => ({ ...segment, gain: segment.gain * factor }));
}
