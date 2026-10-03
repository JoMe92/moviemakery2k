import { describe, expect, it } from "vitest";
import { wrapLine } from "./titleText";

/** 10px per character, so wrapping math is exact and easy to reason about. */
function fixedWidthMeasurer(charWidth = 10) {
  return { measureText: (text: string) => ({ width: text.length * charWidth }) };
}

describe("wrapLine", () => {
  it("keeps a short line on one row", () => {
    expect(wrapLine(fixedWidthMeasurer(), "Hallo Welt", 1000)).toEqual(["Hallo Welt"]);
  });

  it("breaks between words once the max width is exceeded", () => {
    // "Hallo Welt" = 100px, "Hallo Welt schön" = 160px.
    expect(wrapLine(fixedWidthMeasurer(), "Hallo Welt schön", 120)).toEqual([
      "Hallo Welt",
      "schön",
    ]);
  });

  it("never splits inside a single word, even if it alone exceeds max width", () => {
    expect(wrapLine(fixedWidthMeasurer(), "Donaudampfschifffahrt kurz", 50)).toEqual([
      "Donaudampfschifffahrt",
      "kurz",
    ]);
  });

  it("collapses repeated whitespace and trims", () => {
    expect(wrapLine(fixedWidthMeasurer(), "  Hallo   Welt  ", 1000)).toEqual(["Hallo Welt"]);
  });

  it("returns one empty row for an empty line (keeps a credits blank line)", () => {
    expect(wrapLine(fixedWidthMeasurer(), "", 1000)).toEqual([""]);
  });
});
