import { describe, expect, it } from "vitest";
import { parseDebugProgress } from "./debugProgress";

describe("parseDebugProgress", () => {
  it("is off without the parameter", () => {
    expect(parseDebugProgress("")).toBeNull();
    expect(parseDebugProgress("?foo=1")).toBeNull();
  });

  it("reads transition and progress, default red → blue", () => {
    expect(parseDebugProgress("?debug-progress=circle:0.5")).toEqual({
      transitionId: "circle",
      progress: 0.5,
      from: "#ff0000",
      to: "#0000ff",
      fromPortrait: false,
    });
  });

  it("clamps the progress and reads extra options", () => {
    const spec = parseDebugProgress(
      "?debug-progress=wipe-right:7&from=%2300ff00&to=white&fromPortrait=1",
    );
    expect(spec).toMatchObject({
      transitionId: "wipe-right",
      progress: 1,
      from: "#00ff00",
      to: "white",
      fromPortrait: true,
    });
    expect(parseDebugProgress("?debug-progress=fade:abc")?.progress).toBe(0);
  });
});
