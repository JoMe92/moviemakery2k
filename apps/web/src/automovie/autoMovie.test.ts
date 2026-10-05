import { describe, expect, it } from "vitest";
import type { AutoMovieStyle } from "../lib/apiClient";
import { SLIDE_DURATION } from "../store/projectOps";
import { AUTOMOVIE_CATALOG, audioItem, mediaItem, videoItem } from "../store/testApi";
import { autoMovieMedia, buildAutoMovie, canAutoMovie, isStyleAvailable } from "./autoMovie";

const style = (id: string): AutoMovieStyle => {
  const found = AUTOMOVIE_CATALOG.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown test style ${id}`);
  return found;
};

const CLASSIC = style("classic");
const OLD_MOVIE = style("old-movie");
const MUSIC_VIDEO = style("music-video");

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
    const slides = buildAutoMovie(media, CLASSIC, 1.25);
    expect(slides.map((slide) => slide.mediaId)).toEqual(["a", "v", "b"]);
    expect(slides.map((slide) => slide.kind)).toEqual(["image", "video", "image"]);
  });

  it("gives every element but the first the style's transition at its catalog duration", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25);
    expect(slides[0]?.transitionIn).toBeNull();
    expect(slides[1]?.transitionIn).toEqual({ transitionId: "fade", duration: 1.25 });
    expect(slides[2]?.transitionIn).toEqual({ transitionId: "fade", duration: 1.25 });
  });

  it("uses the style's own transition", () => {
    const slides = buildAutoMovie(media, MUSIC_VIDEO, 1.5);
    expect(slides[1]?.transitionIn).toEqual({ transitionId: "circle", duration: 1.5 });
  });

  it("leaves every element without an effect for a style that has none", () => {
    expect(buildAutoMovie(media, CLASSIC, 1.25).map((slide) => slide.effectId)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("puts the style's effect on every picture and video clip", () => {
    expect(buildAutoMovie(media, OLD_MOVIE, 1.25).map((slide) => slide.effectId)).toEqual([
      "film-age-older",
      "film-age-older",
      "film-age-older",
    ]);
  });

  it("gives a picture the default display duration and a video clip its full trim", () => {
    const slides = buildAutoMovie(media, CLASSIC, 1.25);
    const picture = slides[0];
    const video = slides[1];
    expect(picture?.kind === "image" && picture.duration).toBe(SLIDE_DURATION.default);
    expect(video?.kind === "video" && video.trimIn).toBe(0);
    expect(video?.kind === "video" && video.trimOut).toBe(7.5);
  });

  it("gives every element its own id", () => {
    const ids = buildAutoMovie(media, CLASSIC, 1.25).map((slide) => slide.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds nothing from an audio-only collection", () => {
    expect(buildAutoMovie([audioItem("song")], CLASSIC, 1.25)).toEqual([]);
  });
});
