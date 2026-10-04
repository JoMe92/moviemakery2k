import { describe, expect, it } from "vitest";
import { PATTERN_HEIGHT, PATTERN_WIDTH, patternPixel, patternRgba } from "./testPattern";

describe("test pattern", () => {
  it("is exactly 640×480 and opaque", () => {
    const data = patternRgba("from");
    expect(data.length).toBe(PATTERN_WIDTH * PATTERN_HEIGHT * 4);
    expect(data[3]).toBe(255);
    expect(data[data.length - 1]).toBe(255);
  });

  it("uses the full 0 … 255 ramps", () => {
    expect(patternPixel("from", 0, 0)).toEqual([0, 0, 0]);
    expect(patternPixel("from", 639, 479)).toEqual([255, 255, 0]);
    expect(patternPixel("from", 40, 0)).toEqual([16, 0, 255]);
    expect(patternPixel("to", 0, 0)).toEqual([32, 255, 0]);
    expect(patternPixel("to", 32, 0)).toEqual([224, 243, 0]);
    expect(patternPixel("to", 639, 479)).toEqual([224, 0, 255]);
  });

  it("differs between the two variants", () => {
    expect(patternRgba("from")).not.toEqual(patternRgba("to"));
  });
});
