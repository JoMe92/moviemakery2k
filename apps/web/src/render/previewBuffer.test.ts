import { describe, expect, it } from "vitest";
import { PREVIEW_MAX_WIDTH, previewBufferSize } from "./geometry";

describe("preview drawing buffer (add-mobile-layout design.md D14)", () => {
  it("uses the CSS size at devicePixelRatio 1", () => {
    expect(previewBufferSize(600, 450, 1)).toEqual({ width: 600, height: 450 });
  });

  it("caps devicePixelRatio 3 at 2", () => {
    expect(previewBufferSize(390, 292.5, 3)).toEqual({ width: 780, height: 585 });
  });

  it("stays at most 1920 px wide on a very wide monitor", () => {
    const size = previewBufferSize(1600, 1200, 2);
    expect(size).toEqual({ width: PREVIEW_MAX_WIDTH, height: 1440 });
    expect(previewBufferSize(5000, 3750, 1).width).toBe(1920);
  });

  it("still respects a smaller GPU limit", () => {
    expect(previewBufferSize(1600, 1200, 2, 1024)).toEqual({ width: 1024, height: 768 });
  });
});
