/**
 * Pure operations on the narration track (add-narration-and-audio-levels
 * design.md D2). The one thing worth proving here: nothing in this module
 * cares about the order of the list, only about each clip's own `at`.
 */
import { describe, expect, it } from "vitest";
import type { NarrationClip } from "../lib/apiClient";
import {
  insertNarrationClip,
  isValidNarrationAt,
  isValidNarrationTrim,
  isValidNarrationVolume,
  NARRATION_AT_MAX,
  narrationClipLength,
  newNarrationClip,
  removeNarrationClip,
  updateNarrationClip,
} from "./narrationOps";

function clip(id: string, at: number, extra: Partial<NarrationClip> = {}): NarrationClip {
  return {
    id,
    mediaId: "rec",
    at,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
    ...extra,
  };
}

describe("newNarrationClip", () => {
  it("plays the whole recording from `at`, at 100 %, without fades", () => {
    expect(newNarrationClip("rec", 4.25)).toMatchObject({
      mediaId: "rec",
      at: 4.25,
      trimStart: 0,
      trimEnd: null,
      volume: 1,
      fadeIn: false,
      fadeOut: false,
    });
  });

  it("takes a measured length when the file carries no duration yet", () => {
    expect(newNarrationClip("rec", 0, 3.5).trimEnd).toBe(3.5);
  });

  it("never starts before the movie", () => {
    expect(newNarrationClip("rec", -5).at).toBe(0);
  });

  it("gives every clip its own id", () => {
    expect(newNarrationClip("rec", 0).id).not.toBe(newNarrationClip("rec", 0).id);
  });
});

describe("insert, remove and update", () => {
  it("appends, because the list order carries no meaning", () => {
    const first = clip("n1", 10);
    const second = clip("n2", 2);
    expect(insertNarrationClip([first], second).map((c) => c.id)).toEqual(["n1", "n2"]);
  });

  it("removes only the named clip and leaves the others where they are", () => {
    const list = [clip("n1", 1), clip("n2", 2), clip("n3", 3)];
    const rest = removeNarrationClip(list, "n2");
    expect(rest.map((c) => [c.id, c.at])).toEqual([
      ["n1", 1],
      ["n3", 3],
    ]);
  });

  it("patches one clip, `at` included — moving is an edit like any other", () => {
    const list = [clip("n1", 1), clip("n2", 2)];
    const moved = updateNarrationClip(list, "n1", { at: 9 });
    expect(moved[0]?.at).toBe(9);
    expect(moved[1]).toBe(list[1]);
  });
});

describe("validation (mirrors the backend)", () => {
  it.each([
    [0, true],
    [0.123_456, true],
    [NARRATION_AT_MAX, true],
    [-0.1, false],
    [NARRATION_AT_MAX + 1, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])("start time %s valid: %s", (at, ok) => {
    expect(isValidNarrationAt(at)).toBe(ok);
  });

  it.each([
    [0, true],
    [2, true],
    [-0.1, false],
    [2.01, false],
  ])("volume %s valid: %s", (volume, ok) => {
    expect(isValidNarrationVolume(volume)).toBe(ok);
  });

  it("accepts a range inside the file that plays at least half a second", () => {
    expect(isValidNarrationTrim(0, null, 4)).toBe(true);
    expect(isValidNarrationTrim(1, 4, 4)).toBe(true);
    expect(isValidNarrationTrim(3.5, 4, 4)).toBe(true);
  });

  it("rejects a range outside the file, inverted or too short", () => {
    expect(isValidNarrationTrim(0, 5, 4)).toBe(false);
    expect(isValidNarrationTrim(3, 2, 4)).toBe(false);
    expect(isValidNarrationTrim(3.75, 4, 4)).toBe(false);
    expect(isValidNarrationTrim(-1, null, 4)).toBe(false);
    expect(isValidNarrationTrim(0, null, 0)).toBe(false);
  });
});

describe("narrationClipLength", () => {
  it("is the trimmed range, clamped to the file", () => {
    expect(narrationClipLength(clip("n1", 0), 10)).toBe(10);
    expect(narrationClipLength(clip("n1", 0, { trimStart: 2, trimEnd: 6 }), 10)).toBe(4);
    expect(narrationClipLength(clip("n1", 0, { trimEnd: 20 }), 10)).toBe(10);
  });

  it("falls back to the stored range while the medium is unknown", () => {
    expect(narrationClipLength(clip("n1", 0, { trimEnd: 3 }), undefined)).toBe(3);
    expect(narrationClipLength(clip("n1", 0), undefined)).toBe(0);
  });
});
