import { describe, expect, it } from "vitest";
import type { AutoMovieStyle, ImageSlide, Slide, TitleSlide, VideoSlide } from "../lib/apiClient";
import { SLIDE_DURATION } from "../store/projectOps";
import { AUTOMOVIE_CATALOG, audioItem, mediaItem, videoItem } from "../store/testApi";
import { TITLE_COLOR_DEFAULT, TITLE_DURATION_DEFAULT } from "../titles/titleStyle";
import {
  type AutoMovieTitles,
  autoMovieMedia,
  buildAutoMovie,
  canAutoMovie,
  isStyleAvailable,
} from "./autoMovie";

const style = (id: string): AutoMovieStyle => {
  const found = AUTOMOVIE_CATALOG.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown test style ${id}`);
  return found;
};

const CLASSIC = style("classic");
const OLD_MOVIE = style("old-movie");
const MUSIC_VIDEO = style("music-video");

/** What the store passes in: the dialog's film title and the UI language's "Ende". */
const TITLES: AutoMovieTitles = { filmTitle: "Urlaub", endTitle: "Ende", layout: "one-line" };

/** The filmstrip narrowed to the picture and video clip elements. */
function mediaSlides(slides: readonly Slide[]): (ImageSlide | VideoSlide)[] {
  return slides.filter((slide): slide is ImageSlide | VideoSlide => slide.kind !== "title");
}

function titles(slides: readonly Slide[]): TitleSlide[] {
  return slides.filter((slide): slide is TitleSlide => slide.kind === "title");
}

describe("autoMovieMedia", () => {
  it("keeps pictures and video clips in import order and drops audio", () => {
    const media = [mediaItem("a"), audioItem("song"), videoItem("v"), mediaItem("b")];
    expect(autoMovieMedia(media).map((item) => item.id)).toEqual(["a", "v", "b"]);
  });

  it("reports whether there is anything to build a movie from", () => {
    expect(canAutoMovie([])).toBe(false);
    expect(canAutoMovie([audioItem("song")])).toBe(false);
    expect(canAutoMovie([mediaItem("a")])).toBe(true);
    expect(canAutoMovie([videoItem("v")])).toBe(true);
  });
});

describe("isStyleAvailable", () => {
  it("offers a style that needs no music either way", () => {
    expect(isStyleAvailable(CLASSIC, false)).toBe(true);
    expect(isStyleAvailable(CLASSIC, true)).toBe(true);
  });

  it("offers a style that needs music only with a music track", () => {
    expect(isStyleAvailable(MUSIC_VIDEO, false)).toBe(false);
    expect(isStyleAvailable(MUSIC_VIDEO, true)).toBe(true);
  });
});

describe("buildAutoMovie", () => {
  const media = [mediaItem("a"), audioItem("song"), videoItem("v", 7.5), mediaItem("b")];

  it("puts every picture and video clip on the filmstrip in import order", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25, TITLES);
    expect(mediaSlides(slides).map((slide) => slide.mediaId)).toEqual(["a", "v", "b"]);
    expect(slides.map((slide) => slide.kind)).toEqual([
      "title",
      "image",
      "video",
      "image",
      "title",
    ]);
  });

  it("frames the movie with the film title and the closing title", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25, TITLES);
    expect(titles(slides).map((slide) => slide.lines)).toEqual([["Urlaub"], ["Ende"]]);
    const [first] = slides;
    const last = slides[slides.length - 1];
    expect(first?.kind).toBe("title");
    expect(last?.kind).toBe("title");
  });

  it("builds both titles in the style's own title style", () => {
    expect(titles(buildAutoMovie(media, CLASSIC, 1.25, TITLES)).map((s) => s.styleId)).toEqual([
      "basic-title",
      "basic-title",
    ]);
    const musicVideo = buildAutoMovie(media, MUSIC_VIDEO, 1.5, TITLES);
    expect(titles(musicVideo).map((slide) => slide.styleId)).toEqual(["zoom-in", "zoom-in"]);
  });

  it("gives a title element the title defaults and no overlay of its own", () => {
    const [title] = titles(buildAutoMovie(media, CLASSIC, 1.25, TITLES));
    expect(title?.duration).toBe(TITLE_DURATION_DEFAULT);
    expect(title?.color).toBe(TITLE_COLOR_DEFAULT);
    expect(title?.creditEntries).toBeNull();
    expect(title).not.toHaveProperty("title");
  });

  it("uses the closing title in the language it is given", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25, { ...TITLES, endTitle: "The End" });
    expect(titles(slides).map((slide) => slide.lines)).toEqual([["Urlaub"], ["The End"]]);
  });

  it("writes a credits layout's text into creditEntries, as the model demands", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25, { ...TITLES, layout: "credits" });
    expect(titles(slides).map((slide) => slide.creditEntries)).toEqual([["Urlaub"], ["Ende"]]);
    expect(titles(slides).every((slide) => slide.lines === null)).toBe(true);
  });

  it("opens straight on the first picture when no film title was entered", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25, { ...TITLES, filmTitle: "   " });
    expect(slides.map((slide) => slide.kind)).toEqual(["image", "video", "image", "title"]);
    expect(titles(slides).map((slide) => slide.lines)).toEqual([["Ende"]]);
    // The first picture is now the first element, so it has no incoming transition.
    expect(slides[0]?.transitionIn).toBeNull();
    expect(slides[1]?.transitionIn).toEqual({ transitionId: "fade", duration: 1.25 });
  });

  it("gives every element but the first the style's transition at its catalog duration", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25, TITLES);
    expect(slides[0]?.transitionIn).toBeNull();
    expect(slides.slice(1).map((slide) => slide.transitionIn)).toEqual([
      { transitionId: "fade", duration: 1.25 },
      { transitionId: "fade", duration: 1.25 },
      { transitionId: "fade", duration: 1.25 },
      { transitionId: "fade", duration: 1.25 },
    ]);
  });

  it("uses the style's own transition", () => {
    const slides = buildAutoMovie(media, MUSIC_VIDEO, 1.5, TITLES);
    expect(slides[1]?.transitionIn).toEqual({ transitionId: "circle", duration: 1.5 });
  });

  it("leaves every element without an effect for a style that has none", () => {
    expect(
      mediaSlides(buildAutoMovie(media, CLASSIC, 1.25, TITLES)).map((slide) => slide.effectId),
    ).toEqual([null, null, null]);
  });

  it("puts the style's effect on every picture and video clip, but not on a title", () => {
    const slides = buildAutoMovie(media, OLD_MOVIE, 1.25, TITLES);
    expect(mediaSlides(slides).map((slide) => slide.effectId)).toEqual([
      "film-age-older",
      "film-age-older",
      "film-age-older",
    ]);
    for (const title of titles(slides)) expect(title).not.toHaveProperty("effectId");
  });

  it("gives a picture the default display duration and a video clip its full trim", () => {
    const slides = mediaSlides(buildAutoMovie(media, CLASSIC, 1.25, TITLES));
    const picture = slides[0];
    const video = slides[1];
    expect(picture?.kind === "image" && picture.duration).toBe(SLIDE_DURATION.default);
    expect(video?.kind === "video" && video.trimIn).toBe(0);
    expect(video?.kind === "video" && video.trimOut).toBe(7.5);
  });

  it("gives every element its own id", () => {
    const ids = buildAutoMovie(media, CLASSIC, 1.25, TITLES).map((slide) => slide.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds nothing from an audio-only collection, not even the titles", () => {
    expect(buildAutoMovie([audioItem("song")], CLASSIC, 1.25, TITLES)).toEqual([]);
  });
});
