import { describe, expect, it } from "vitest";
import { parseDebugProgress } from "./debugProgress";

describe("parseDebugProgress", () => {
  it("ist ohne Parameter aus", () => {
    expect(parseDebugProgress("")).toBeNull();
    expect(parseDebugProgress("?foo=1")).toBeNull();
  });

  it("liest Übergang und Fortschritt, Standard rot → blau", () => {
    expect(parseDebugProgress("?debug-progress=circle:0.5")).toEqual({
      transitionId: "circle",
      progress: 0.5,
      from: "#ff0000",
      to: "#0000ff",
      fromPortrait: false,
    });
  });

  it("begrenzt den Fortschritt und liest Zusatzoptionen", () => {
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
