/**
 * Shared test vectors of the music schedule (design.md D4).
 * The same file checks the Python port; format: packages/fixtures/README.md.
 */
import { describe, expect, it } from "vitest";
import vectors from "../../../../packages/fixtures/music-vectors.json";
import type { AudioSegment, MediaDurations } from "./audio";
import { type MusicClipInput, musicDuration, musicSchedule } from "./music";

interface VectorCase {
  name: string;
  clips: MusicClipInput[];
  mediaDurations: MediaDurations;
  movieDuration: number;
  expected: { musicDuration: number; segments: AudioSegment[] };
}

const TOLERANCE: number = vectors.tolerance;
const cases = vectors.cases as unknown as VectorCase[];

/** Recursive comparison as in timelineVectors.test.ts (empty = equal). */
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

describe("music-vectors.json", () => {
  it("has version 1, unique names and covers the required cases", () => {
    expect(vectors.version).toBe(1);
    const names = cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const required of [
      "spec-two-clips-sequential",
      "spec-trimmed-clip",
      "spec-cut-at-movie-end-with-fade",
      "movie-shorter-than-1s",
      "spec-silence-after-music",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("the comparison detects differences above the tolerance", () => {
    expect(diff({ a: [1, "x"] }, { a: [1 + TOLERANCE / 2, "x"] })).toEqual([]);
    expect(diff({ a: [1.001, "x"] }, { a: [1, "x"] })).toHaveLength(1);
    expect(diff({ a: 1, b: 2 }, { a: 1 })).toHaveLength(1);
  });

  describe.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    it("music duration", () => {
      expect(diff(musicDuration(c.clips, c.mediaDurations), c.expected.musicDuration)).toEqual([]);
    });

    it("segments", () => {
      const segments = musicSchedule(c.clips, c.mediaDurations, c.movieDuration);
      expect(diff(segments, c.expected.segments)).toEqual([]);
    });
  });
});

describe("musicSchedule", () => {
  const clip: MusicClipInput = {
    id: "a",
    mediaId: "m",
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  };

  it("returns no segments for a non-finite movie duration", () => {
    expect(musicSchedule([clip], { m: 5 }, Number.NaN)).toEqual([]);
    expect(musicSchedule([clip], { m: 5 }, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("ignores inherited keys of the duration map", () => {
    expect(musicSchedule([{ ...clip, mediaId: "constructor" }], {}, 10)).toEqual([]);
  });
});
