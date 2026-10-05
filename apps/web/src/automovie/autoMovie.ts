/**
 * AutoMovie: builds a whole filmstrip from the media collection in one go
 * (add-automovie design.md D2, spec automovie "Automatische Erstellung").
 *
 * Purely combinatorial — it introduces no render technique of its own and only
 * reuses the storyboard's existing building blocks: a title element with the
 * entered film title at the start and one with "Ende"/"The End" at the end
 * (both in the style's `titleStyleId`), the style's transition between all
 * adjacent elements, the style's effect on every picture and video clip, and
 * (with music) "Fit movie to music" afterwards. Pure functions without DOM or
 * store, so they can be tested in isolation.
 *
 * AutoMovie sets no overlay `title` on the pictures and clips it builds — the
 * style's title belongs on its own element.
 */
import type {
  AutoMovieStyle,
  ImageItem,
  ImageSlide,
  MediaItem,
  Slide,
  TitleLayout,
  TitleSlide,
  TransitionRef,
  VideoItem,
  VideoSlide,
} from "../lib/apiClient";
import { newSlideId, SLIDE_DURATION } from "../store/projectOps";
import { newTitleSlide, TITLE_COLOR_DEFAULT } from "../titles/titleStyle";

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

/** The two title elements AutoMovie frames the movie with (design.md D2 step 4). */
export interface AutoMovieTitles {
  /** The film title from the dialog; a blank one gets no opening title at all. */
  filmTitle: string;
  /** The closing title in the UI language: "Ende" (de) / "The End" (en). */
  endTitle: string;
  /**
   * Layout of the style's `titleStyleId`, looked up in the title catalog by
   * the caller — a title element's text field depends on it (design.md D5 of
   * add-titles-and-credits).
   */
  layout: TitleLayout;
}

/** One of AutoMovie's two title elements, in the style's own title style. */
function autoMovieTitle(
  text: string,
  style: AutoMovieStyle,
  layout: TitleLayout,
  transitionIn: TransitionRef | null,
): TitleSlide {
  return {
    ...newTitleSlide(
      { lines: [text], styleId: style.titleStyleId, color: TITLE_COLOR_DEFAULT },
      layout,
    ),
    transitionIn,
  };
}

/**
 * The filmstrip for `style`: a title element with the film title, then every
 * picture and video clip of the collection in import order, each with the
 * style's effect, then the closing title — with the style's transition between
 * all adjacent elements (the very first element never has an incoming one).
 * `transitionDuration` is the transition's catalog default.
 *
 * Pictures get the normal default display duration, the titles the title
 * default; a video clip's length is its full trim window, exactly as a manually
 * added one (add-timeline-editing design.md D2). With music the caller runs
 * "Fit movie to music" afterwards, which is what adjusts those durations.
 *
 * An empty film title adds no opening title: the dialog does not insist on one,
 * and a blank title element would open every such movie with a silent, empty
 * five seconds. The closing title has a text of its own and is always there.
 */
export function buildAutoMovie(
  media: readonly MediaItem[],
  style: AutoMovieStyle,
  transitionDuration: number,
  titles: AutoMovieTitles,
): Slide[] {
  const items = autoMovieMedia(media);
  // No picture and no video clip is no movie — not even a pair of titles.
  if (items.length === 0) return [];
  // One transition object per element, as a hand-built filmstrip has.
  const transition = (): TransitionRef => ({
    transitionId: style.transitionId,
    duration: transitionDuration,
  });
  const filmTitle = titles.filmTitle.trim();
  const slides: Slide[] = [];
  if (filmTitle !== "") slides.push(autoMovieTitle(filmTitle, style, titles.layout, null));
  for (const item of items) {
    // The first element of the finished filmstrip has no incoming transition —
    // that is the opening title, or the first picture when there is none.
    slides.push(mediaSlide(item, style, slides.length === 0 ? null : transition()));
  }
  slides.push(autoMovieTitle(titles.endTitle, style, titles.layout, transition()));
  return slides;
}

function mediaSlide(
  item: AutoMovieItem,
  style: AutoMovieStyle,
  transitionIn: TransitionRef | null,
): ImageSlide | VideoSlide {
  return item.kind === "video"
    ? {
        kind: "video",
        id: newSlideId(),
        mediaId: item.id,
        trimIn: 0,
        trimOut: item.duration,
        effectId: style.effectId,
        title: null,
        transitionIn,
      }
    : {
        kind: "image",
        id: newSlideId(),
        mediaId: item.id,
        duration: SLIDE_DURATION.default,
        effectId: style.effectId,
        title: null,
        transitionIn,
      };
}
