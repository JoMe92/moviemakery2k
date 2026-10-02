import { describe, expect, it } from "vitest";
import { bufferSize, containRect } from "./geometry";

describe("containRect", () => {
  it("fits a portrait image with bars left and right", () => {
    expect(containRect(300, 600, 640, 480)).toEqual({ x: 200, y: 0, width: 240, height: 480 });
  });

  it("fits a widescreen image with bars top and bottom", () => {
    expect(containRect(1920, 1080, 640, 480)).toEqual({ x: 0, y: 60, width: 640, height: 360 });
  });

  it("fills the whole area for the same aspect ratio", () => {
    expect(containRect(1600, 1200, 640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  it("upscales small images and stays integer-valued and centred", () => {
    const r = containRect(3, 7, 1280, 960);
    expect(r.height).toBe(960);
    expect(r.width).toBe(411);
    expect(Number.isInteger(r.x)).toBe(true);
    expect(r.x).toBe(Math.floor((1280 - 411) / 2));
  });

  it("returns an empty rectangle for empty sizes", () => {
    expect(containRect(0, 10, 640, 480)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("bufferSize", () => {
  it("multiplies the CSS size by DPR and stays exactly 4:3", () => {
    expect(bufferSize(640, 480, 1)).toEqual({ width: 640, height: 480 });
    expect(bufferSize(640, 480, 2)).toEqual({ width: 1280, height: 960 });
    const odd = bufferSize(401.5, 301.1, 1.25);
    expect(odd.width * 3).toBe(odd.height * 4);
    expect(odd.width).toBeLessThanOrEqual(401.5 * 1.25);
  });

  it("takes the largest 4:3 area for a mismatched aspect ratio", () => {
    expect(bufferSize(1000, 300, 1)).toEqual({ width: 400, height: 300 });
  });

  it("caps at the maximum texture size and never below 4×3", () => {
    expect(bufferSize(10000, 7500, 2, 4096)).toEqual({ width: 4096, height: 3072 });
    expect(bufferSize(0, 0, 1)).toEqual({ width: 4, height: 3 });
  });
});
