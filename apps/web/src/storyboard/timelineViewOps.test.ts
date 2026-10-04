import { describe, expect, it } from "vitest";
import { SLIDE_DURATION } from "../store/projectOps";
import { dragImageDuration, dragVideoTrim, MIN_VIDEO_TRIM_GAP } from "./timelineViewOps";

describe("dragImageDuration", () => {
  it("extends the duration when dragging the end edge right", () => {
    expect(dragImageDuration("end", 5, 2)).toBe(7);
  });

  it("shrinks the duration when dragging the start edge right", () => {
    expect(dragImageDuration("start", 5, 2)).toBe(3);
  });

  it("extends the duration when dragging the start edge left (negative delta)", () => {
    expect(dragImageDuration("start", 5, -2)).toBe(7);
  });

  it("snaps to the 0.25 s grid", () => {
    expect(dragImageDuration("end", 5, 0.1)).toBe(5);
    expect(dragImageDuration("end", 5, 0.2)).toBe(5.25);
  });

  it("never drops below the minimum duration (Grenzen beim Ziehen)", () => {
    expect(dragImageDuration("start", 1, 100)).toBe(SLIDE_DURATION.min);
  });

  it("never exceeds the maximum duration (Grenzen beim Ziehen)", () => {
    expect(dragImageDuration("end", 1, 1000)).toBe(SLIDE_DURATION.max);
  });
});

describe("dragVideoTrim", () => {
  const trim = { trimIn: 2, trimOut: 8 };

  it("increases trimIn when dragging the start edge right", () => {
    expect(dragVideoTrim("start", trim, 10, 1)).toEqual({ trimIn: 3, trimOut: 8 });
  });

  it("decreases trimIn when dragging the start edge left", () => {
    expect(dragVideoTrim("start", trim, 10, -1)).toEqual({ trimIn: 1, trimOut: 8 });
  });

  it("increases trimOut when dragging the end edge right", () => {
    expect(dragVideoTrim("end", trim, 10, 1)).toEqual({ trimIn: 2, trimOut: 9 });
  });

  it("decreases trimOut when dragging the end edge left", () => {
    expect(dragVideoTrim("end", trim, 10, -1)).toEqual({ trimIn: 2, trimOut: 7 });
  });

  it("never drags trimIn below 0 (Grenzen beim Ziehen)", () => {
    expect(dragVideoTrim("start", trim, 10, -100)).toEqual({ trimIn: 0, trimOut: 8 });
  });

  it("never drags trimOut past the file's duration (Grenzen beim Ziehen)", () => {
    expect(dragVideoTrim("end", trim, 10, 100)).toEqual({ trimIn: 2, trimOut: 10 });
  });

  it("keeps trimIn at least MIN_VIDEO_TRIM_GAP below trimOut, even dragged past it", () => {
    const result = dragVideoTrim("start", trim, 10, 100);
    expect(result.trimIn).toBeCloseTo(trim.trimOut - MIN_VIDEO_TRIM_GAP, 5);
    expect(result.trimIn).toBeLessThan(result.trimOut);
  });

  it("keeps trimOut at least MIN_VIDEO_TRIM_GAP above trimIn, even dragged past it", () => {
    const result = dragVideoTrim("end", trim, 10, -100);
    expect(result.trimOut).toBeCloseTo(trim.trimIn + MIN_VIDEO_TRIM_GAP, 5);
    expect(result.trimOut).toBeGreaterThan(result.trimIn);
  });
});
