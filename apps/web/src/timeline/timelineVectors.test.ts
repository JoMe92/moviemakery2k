/**
 * Shared test vectors of the time model (design.md D3).
 * The same file later also checks the Python port; format:
 * packages/fixtures/README.md.
 */
import { describe, expect, it } from "vitest";
import vectors from "../../../../packages/fixtures/timeline-vectors.json";
import { buildTimeline, type Frame, frameAt, type Segment, type TimelineSlide } from "./timeline";

interface VectorCase {
  name: string;
  slides: TimelineSlide[];
  expected: {
    totalDuration: number;
    placed: { index: number; start: number; end: number; transitionIn: number }[];
    segments: Segment[];
    samples: { t: number; frame: Frame }[];
  };
}

const TOLERANCE: number = vectors.tolerance;
const cases = vectors.cases as VectorCase[];

/**
 * Compares recursively; numbers with absolute tolerance, everything else exactly.
 * Returns the differences as readable paths (empty = equal).
 */
function diff(actual: unknown, expected: unknown, path = "$"): string[] {
  if (typeof expected === "number") {
    return typeof actual === "number" && Math.abs(actual - expected) <= TOLERANCE
      ? []
      : [`${path}: expected ${expected}, got ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected array, got ${JSON.stringify(actual)}`];
    const out =
      actual.length === expected.length
        ? []
        : [`${path}: expected length ${expected.length}, got ${actual.length}`];
    expected.forEach((e, i) => {
      out.push(...diff(actual[i], e, `${path}[${i}]`));
    });
    return out;
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") {
      return [`${path}: expected object, got ${JSON.stringify(actual)}`];
    }
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(e)]);
    return [...keys].flatMap((k) =>
      k in e ? diff(a[k], e[k], `${path}.${k}`) : [`${path}.${k}: unexpected key`],
    );
  }
  return Object.is(actual, expected)
    ? []
    : [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
}

describe("timeline-vectors.json", () => {
  it("has version 1, unique names and covers the required cases", () => {
    expect(vectors.version).toBe(1);
    const names = cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it("the comparison detects differences above the tolerance", () => {
    expect(diff({ a: [1, "x"] }, { a: [1 + TOLERANCE / 2, "x"] })).toEqual([]);
    expect(diff({ a: [1.001, "x"] }, { a: [1, "x"] })).toHaveLength(1);
    expect(diff({ kind: "still" }, { kind: "transition" })).toHaveLength(1);
    expect(diff({ a: 1, b: 2 }, { a: 1 })).toHaveLength(1);
  });

  describe.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const tl = buildTimeline(c.slides);

    it("total duration", () => {
      expect(diff(tl.duration, c.expected.totalDuration)).toEqual([]);
    });

    it("placed images", () => {
      const placed = tl.slides.map(({ index, start, end, transitionIn }) => ({
        index,
        start,
        end,
        transitionIn,
      }));
      expect(diff(placed, c.expected.placed)).toEqual([]);
    });

    it("segments", () => {
      expect(diff(tl.segments, c.expected.segments)).toEqual([]);
    });

    it.each(c.expected.samples.map((s) => [s.t, s] as const))("frameAt(%s)", (_t, s) => {
      expect(diff(frameAt(tl, s.t), s.frame)).toEqual([]);
    });
  });
});
