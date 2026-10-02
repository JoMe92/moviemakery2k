import { describe, expect, it } from "vitest";
import { isValidMusicTrim, isValidMusicVolume, newMusicClip, updateMusicClip } from "./musicOps";

describe("music clip checks", () => {
  it("volume 0–200 %", () => {
    expect(isValidMusicVolume(0)).toBe(true);
    expect(isValidMusicVolume(2)).toBe(true);
    expect(isValidMusicVolume(2.01)).toBe(false);
    expect(isValidMusicVolume(-0.01)).toBe(false);
    expect(isValidMusicVolume(Number.NaN)).toBe(false);
  });

  it("trim: 0 ≤ start < end ≤ file duration, length ≥ 0.5 s; null end = file end", () => {
    expect(isValidMusicTrim(0, null, 30)).toBe(true);
    expect(isValidMusicTrim(10, 10.5, 30)).toBe(true);
    expect(isValidMusicTrim(0, 30, 30)).toBe(true);
    expect(isValidMusicTrim(29.5, null, 30)).toBe(true);
    expect(isValidMusicTrim(29.6, null, 30)).toBe(false);
    expect(isValidMusicTrim(10, 10.4, 30)).toBe(false);
    expect(isValidMusicTrim(10, 5, 30)).toBe(false);
    expect(isValidMusicTrim(0, 30.1, 30)).toBe(false);
    expect(isValidMusicTrim(-1, 5, 30)).toBe(false);
  });

  it("updateMusicClip changes only the named clip", () => {
    const a = newMusicClip("x");
    const b = newMusicClip("y");
    const next = updateMusicClip([a, b], b.id, { volume: 0.5, fadeIn: true });
    expect(next[0]).toBe(a);
    expect(next[1]).toEqual({ ...b, volume: 0.5, fadeIn: true });
  });
});
