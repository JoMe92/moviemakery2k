import { describe, expect, it } from "vitest";
import type { TitleSlide, TitleStyle } from "../lib/apiClient";
import { TITLE_CATALOG } from "../store/testApi";
import { durationsOf, phasesOf, titleAlphaAt, titleDrawAt, titleLines } from "./titleRender";
import { TITLE_COLOR_DEFAULT } from "./titleStyle";

const style = (id: string): TitleStyle => {
  const found = TITLE_CATALOG.find((s) => s.id === id);
  if (!found) throw new Error(`no such test style: ${id}`);
  return found;
};

const titleSlide = (fields: Partial<TitleSlide> = {}): TitleSlide => ({
  kind: "title",
  id: "t1",
  lines: ["Mein Film"],
  creditEntries: null,
  styleId: "basic-title",
  color: TITLE_COLOR_DEFAULT,
  duration: 5,
  transitionIn: null,
  ...fields,
});

describe("durationsOf (design.md 'Standardwerte')", () => {
  it("gives Entrance and Exit one second each and the rest to Main", () => {
    expect(durationsOf(5)).toEqual({ entranceSeconds: 1, exitSeconds: 1, totalSeconds: 5 });
  });

  it("splits a title shorter than two seconds evenly, so Main is never negative", () => {
    expect(durationsOf(1)).toEqual({ entranceSeconds: 0.5, exitSeconds: 0.5, totalSeconds: 1 });
  });
});

describe("phasesOf (design.md D3/D4)", () => {
  it("holds the style's anchor for fade and static phases", () => {
    const phases = phasesOf(style("subtitle"));
    // Subtitle sits at the bottom; nothing moves it, so every phase holds it.
    expect(phases.entrance.start).toEqual({ translate: { x: 0, y: -0.7 }, scale: 1 });
    expect(phases.main.end).toEqual({ translate: { x: 0, y: -0.7 }, scale: 1 });
    expect(phases.exit.end).toEqual({ translate: { x: 0, y: -0.7 }, scale: 1 });
  });

  it("takes a position phase's own start and end", () => {
    const phases = phasesOf(style("fly-in"));
    expect(phases.entrance.start).toEqual({ translate: { x: -1, y: 0 }, scale: 1 });
    expect(phases.entrance.end).toEqual({ translate: { x: 0, y: 0 }, scale: 1 });
  });
});

describe("titleAlphaAt (the catalog's `fade` phase effect)", () => {
  const durations = durationsOf(5);

  it("ramps a fade entrance up and a fade exit down", () => {
    const basic = style("basic-title");
    expect(titleAlphaAt(basic, durations, 0)).toBe(0);
    expect(titleAlphaAt(basic, durations, 0.5)).toBeCloseTo(0.5);
    expect(titleAlphaAt(basic, durations, 1)).toBe(1);
    expect(titleAlphaAt(basic, durations, 2.5)).toBe(1);
    expect(titleAlphaAt(basic, durations, 4.5)).toBeCloseTo(0.5);
    expect(titleAlphaAt(basic, durations, 5)).toBe(0);
  });

  it("stays fully visible through a position entrance", () => {
    const flyIn = style("fly-in");
    expect(titleAlphaAt(flyIn, durations, 0)).toBe(1);
    expect(titleAlphaAt(flyIn, durations, 0.5)).toBe(1);
    // Its exit is a fade.
    expect(titleAlphaAt(flyIn, durations, 4.5)).toBeCloseTo(0.5);
  });
});

describe("titleDrawAt", () => {
  it("moves a Fly-In entrance from outside the frame to the centre", () => {
    const start = titleDrawAt(style("fly-in"), 5, 0, false);
    const mid = titleDrawAt(style("fly-in"), 5, 0.5, false);
    const held = titleDrawAt(style("fly-in"), 5, 2.5, false);
    expect(start.transform.translate.x).toBe(-1);
    expect(mid.transform.translate.x).toBeCloseTo(-0.5);
    expect(held.transform.translate.x).toBe(0);
  });

  it("scrolls a credits list from below to above during Main (design.md D3)", () => {
    const scroll = style("scroll-up-stacked");
    expect(titleDrawAt(scroll, 10, 1, false).transform.translate.y).toBeCloseTo(-1);
    expect(titleDrawAt(scroll, 10, 5, false).transform.translate.y).toBeCloseTo(0);
    // Main ends at 9 s (Exit takes the last second and holds the anchor).
    expect(titleDrawAt(scroll, 10, 8.9, false).transform.translate.y).toBeCloseTo(0.975);
  });

  it("blends a freestanding title only while it fades, an overlay always", () => {
    expect(titleDrawAt(style("basic-title"), 5, 2.5, false).blend).toBe(false);
    expect(titleDrawAt(style("basic-title"), 5, 0.5, false).blend).toBe(true);
    expect(titleDrawAt(style("basic-title"), 5, 2.5, true).blend).toBe(true);
  });
});

describe("titleLines", () => {
  it("reads whichever field carries the text", () => {
    expect(titleLines(titleSlide())).toEqual(["Mein Film"]);
    expect(titleLines(titleSlide({ lines: null, creditEntries: ["A", "B"] }))).toEqual(["A", "B"]);
    expect(titleLines({ lines: ["Overlay"], styleId: "subtitle", color: "#ffffff" })).toEqual([
      "Overlay",
    ]);
  });
});
