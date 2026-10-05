import { describe, expect, it } from "vitest";
import type { Slide } from "../lib/apiClient";
import { TITLE_CATALOG } from "../store/testApi";
import {
  availablePlacements,
  CREDITS_DURATION_DEFAULT,
  insertIndexFor,
  isPlacementAvailable,
  lineCount,
  newTitleOverlay,
  newTitleSlide,
  TITLE_COLOR_DEFAULT,
  TITLE_DURATION_DEFAULT,
  titleStyleName,
} from "./titleStyle";

const image = (id: string): Slide => ({
  kind: "image",
  id,
  mediaId: `m-${id}`,
  duration: 5,
  effectId: null,
  title: null,
  transitionIn: null,
});

const video = (id: string): Slide => ({
  kind: "video",
  id,
  mediaId: `v-${id}`,
  trimIn: 0,
  trimOut: 4,
  effectId: null,
  title: null,
  transitionIn: null,
});

const titleElement = (id: string): Slide => ({
  kind: "title",
  id,
  lines: ["Mein Film"],
  creditEntries: null,
  styleId: "basic-title",
  color: TITLE_COLOR_DEFAULT,
  duration: TITLE_DURATION_DEFAULT,
  transitionIn: null,
});

const draft = (lines: string[], styleId: string) => ({
  lines,
  styleId,
  color: TITLE_COLOR_DEFAULT,
});

describe("availablePlacements (design.md D6, spec titles-and-credits)", () => {
  it("offers only start and end without a selection", () => {
    expect(availablePlacements(null)).toEqual(["start", "end"]);
    expect(isPlacementAvailable("before", null)).toBe(false);
    expect(isPlacementAvailable("on", null)).toBe(false);
  });

  it("offers all four for a selected picture", () => {
    expect(availablePlacements(image("s1"))).toEqual(["start", "before", "on", "end"]);
  });

  it("offers all four for a selected video clip", () => {
    expect(availablePlacements(video("v1"))).toEqual(["start", "before", "on", "end"]);
  });

  it("refuses 'on' for a selected title element, which hosts no overlay", () => {
    expect(availablePlacements(titleElement("t1"))).toEqual(["start", "before", "end"]);
    expect(isPlacementAvailable("on", titleElement("t1"))).toBe(false);
  });
});

describe("insertIndexFor", () => {
  const slides = [image("a"), image("b"), image("c")];

  it("puts 'start' first and 'end' last", () => {
    expect(insertIndexFor("start", slides, "b")).toBe(0);
    expect(insertIndexFor("end", slides, "b")).toBe(3);
  });

  it("puts 'before' at the selected element's own index", () => {
    expect(insertIndexFor("before", slides, "b")).toBe(1);
  });

  it("falls back to the end when the selection is gone", () => {
    expect(insertIndexFor("before", slides, "gone")).toBe(3);
  });
});

describe("newTitleSlide / newTitleOverlay (design.md D5)", () => {
  it("builds a one-line title element with the default duration", () => {
    const slide = newTitleSlide(draft(["Mein Film"], "basic-title"), "one-line");
    expect(slide).toMatchObject({
      kind: "title",
      lines: ["Mein Film"],
      creditEntries: null,
      styleId: "basic-title",
      color: TITLE_COLOR_DEFAULT,
      duration: TITLE_DURATION_DEFAULT,
      transitionIn: null,
    });
    expect(slide.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("keeps both lines of a two-line style and trims them", () => {
    const slide = newTitleSlide(draft([" Oben ", " Unten "], "fade-in-and-out"), "two-line");
    expect(slide.lines).toEqual(["Oben", "Unten"]);
  });

  it("drops an untouched second line instead of storing an empty one", () => {
    const slide = newTitleSlide(draft(["Oben", "   "], "fade-in-and-out"), "two-line");
    expect(slide.lines).toEqual(["Oben"]);
  });

  it("stores a credits style's text as creditEntries with its own duration", () => {
    const slide = newTitleSlide(
      draft(["Regie: Ich", "Kamera: Auch ich"], "scroll-up-stacked"),
      "credits",
    );
    expect(slide.lines).toBeNull();
    expect(slide.creditEntries).toEqual(["Regie: Ich", "Kamera: Auch ich"]);
    expect(slide.duration).toBe(CREDITS_DURATION_DEFAULT);
  });

  it("builds an overlay with lines, style and colour only", () => {
    const overlay = newTitleOverlay(draft(["Untertitel"], "subtitle"), "one-line");
    expect(overlay).toEqual({
      lines: ["Untertitel"],
      styleId: "subtitle",
      color: TITLE_COLOR_DEFAULT,
    });
  });
});

describe("catalog helpers", () => {
  it("names a style in the UI language and falls back to the ID", () => {
    expect(titleStyleName(TITLE_CATALOG, "basic-title", "de")).toBe("Einfacher Titel");
    expect(titleStyleName(TITLE_CATALOG, "basic-title", "en")).toBe("Basic Title");
    expect(titleStyleName(TITLE_CATALOG, "gibt-es-nicht", "de")).toBe("gibt-es-nicht");
  });

  it("offers two text lines only for a two-line layout", () => {
    expect(lineCount("one-line")).toBe(1);
    expect(lineCount("two-line")).toBe(2);
    expect(lineCount("credits")).toBe(1);
  });
});
