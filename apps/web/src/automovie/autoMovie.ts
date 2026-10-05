/**
 * AutoMovie: builds a whole filmstrip from the media collection in one go
 * (add-automovie design.md D2, spec automovie "Automatische Erstellung").
 *
 * Purely combinatorial — it introduces no render technique of its own and only
 * reuses the storyboard's existing building blocks: the style's transition
 * between all adjacent elements, the style's effect on every element, and
 * (with music) "Fit movie to music" afterwards. Pure functions without DOM or
 * store, so they can be tested in isolation.
 *
 * Deferred: the opening title with the entered film title and the closing
 * "Ende"/"The End", both in the style's `titleStyleId`, are missing — the
 * slide model has no title element yet (Bead mmy-0pz, waiting on the `title`
 * slide kind of add-titles-and-credits). `filmTitle` is already carried
 * through so only the two insertions have to be added.
 */
import type { AutoMovieStyle, ImageItem, MediaItem, Slide, VideoItem } from "../lib/apiClient";
import { newSlideId, SLIDE_DURATION } from "../store/projectOps";

/** What AutoMovie puts on the filmstrip: pictures and video clips, never audio. */
export type AutoMovieItem = ImageItem | VideoItem;

/**
 * The media AutoMovie uses, in import order — that is the order the collection
 * itself is in (design.md D2: no scene detection, no clip selection). Audio is
 * left out: it belongs on the music track, not in the filmstrip.
 */
export function autoMovieMedia(media: readonly MediaItem[]): AutoMovieItem[] {
  return media.filter((item): item is AutoMovieItem => item.kind !== "audio");
}

/** Whether "AutoMovie…" can run at all: the collection holds at least one picture or video. */
export function canAutoMovie(media: readonly MediaItem[]): boolean {
  return autoMovieMedia(media).length > 0;
}

/**
 * Whether a style can be chosen right now. A style with `requiresMusic` stays
 * disabled while the project has no music track (spec automovie "Stil ohne
 * Musik nicht wählbar"), because its whole point is the fit to the music.
 */
export function isStyleAvailable(style: AutoMovieStyle, hasMusic: boolean): boolean {
  return !style.requiresMusic || hasMusic;
}

/**
 * The filmstrip for `style`: every picture and video clip of the collection in
 * import order, each with the style's effect, and the style's transition
 * before every element but the first (the first never has an incoming
 * transition). `transitionDuration` is the transition's catalog default.
 *
 * Pictures get the normal default display duration; a video clip's length is
 * its full trim window, exactly as a manually added one (add-timeline-editing
 * design.md D2). With music the caller runs "Fit movie to music" afterwards,
 * which is what adjusts the picture durations.
 */
export function buildAutoMovie(
  media: readonly MediaItem[],
  style: AutoMovieStyle,
  transitionDuration: number,
): Slide[] {
  return autoMovieMedia(media).map((item, index) => {
    const transitionIn =
      index === 0 ? null : { transitionId: style.transitionId, duration: transitionDuration };
    return item.kind === "video"
      ? {
          kind: "video",
          id: newSlideId(),
          mediaId: item.id,
          trimIn: 0,
          trimOut: item.duration,
          effectId: style.effectId,
          transitionIn,
        }
      : {
          kind: "image",
          id: newSlideId(),
          mediaId: item.id,
          duration: SLIDE_DURATION.default,
          effectId: style.effectId,
          transitionIn,
        };
  });
}
