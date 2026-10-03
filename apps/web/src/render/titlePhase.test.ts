import { describe, expect, it } from "vitest";
import { identityTransform, staticPhases, type TitlePhases, titleTransformAt } from "./titlePhase";

describe("titleTransformAt", () => {
  const durations = { entranceSeconds: 1, exitSeconds: 1, totalSeconds: 5 };

  it("holds the identity transform for a style with no animation", () => {
    const phases = staticPhases();
    expect(titleTransformAt(phases, durations, 0)).toEqual(identityTransform());
    expect(titleTransformAt(phases, durations, 2.5)).toEqual(identityTransform());
    expect(titleTransformAt(phases, durations, 5)).toEqual(identityTransform());
  });

  it("interpolates a Fly-In entrance (position) before Main starts", () => {
    const phases: TitlePhases = {
      entrance: {
        start: { translate: { x: -1, y: 0 }, scale: 1 },
        end: { translate: { x: 0, y: 0 }, scale: 1 },
      },
      main: {
        start: { translate: { x: 0, y: 0 }, scale: 1 },
        end: { translate: { x: 0, y: 0 }, scale: 1 },
      },
      exit: {
        start: { translate: { x: 0, y: 0 }, scale: 1 },
        end: { translate: { x: 0, y: 0 }, scale: 1 },
      },
    };
    expect(titleTransformAt(phases, durations, 0).translate.x).toBe(-1);
    expect(titleTransformAt(phases, durations, 0.5).translate.x).toBeCloseTo(-0.5);
    expect(titleTransformAt(phases, durations, 1).translate.x).toBeCloseTo(0);
    // Main holds position afterwards.
    expect(titleTransformAt(phases, durations, 3).translate.x).toBe(0);
  });

  it("interpolates a Zoom-In entrance (scale)", () => {
    const phases: TitlePhases = {
      entrance: {
        start: { translate: { x: 0, y: 0 }, scale: 0.3 },
        end: { translate: { x: 0, y: 0 }, scale: 1 },
      },
      main: staticPhases().main,
      exit: staticPhases().exit,
    };
    expect(titleTransformAt(phases, durations, 0).scale).toBeCloseTo(0.3);
    expect(titleTransformAt(phases, durations, 1).scale).toBeCloseTo(1);
  });

  it("interpolates Scroll-Up-Stacked: Main itself moves start ≠ end", () => {
    const phases: TitlePhases = {
      entrance: staticPhases().entrance,
      main: {
        start: { translate: { x: 0, y: -1 }, scale: 1 },
        end: { translate: { x: 0, y: 1 }, scale: 1 },
      },
      // Continuous with Main's end, like real catalog styles would author it.
      exit: { start: { translate: { x: 0, y: 1 }, scale: 1 }, end: staticPhases().exit.end },
    };
    // Main spans [entranceSeconds, totalSeconds - exitSeconds) = [1, 4).
    expect(titleTransformAt(phases, durations, 1).translate.y).toBeCloseTo(-1);
    expect(titleTransformAt(phases, durations, 2.5).translate.y).toBeCloseTo(0);
    expect(titleTransformAt(phases, durations, 3.999).translate.y).toBeCloseTo(1, 1);
    // At the boundary, `t < exitStart` is false, so Exit applies (continuous with Main's end).
    expect(titleTransformAt(phases, durations, 4).translate.y).toBeCloseTo(1);
  });

  it("interpolates the Exit phase and clamps outside [0, totalSeconds]", () => {
    const phases: TitlePhases = {
      entrance: staticPhases().entrance,
      main: staticPhases().main,
      exit: {
        start: { translate: { x: 0, y: 0 }, scale: 1 },
        end: { translate: { x: 0, y: 0 }, scale: 0 },
      },
    };
    expect(titleTransformAt(phases, durations, 4).scale).toBeCloseTo(1);
    expect(titleTransformAt(phases, durations, 4.5).scale).toBeCloseTo(0.5);
    expect(titleTransformAt(phases, durations, 5).scale).toBeCloseTo(0);
    expect(titleTransformAt(phases, durations, -3)).toEqual(titleTransformAt(phases, durations, 0));
    expect(titleTransformAt(phases, durations, 50)).toEqual(titleTransformAt(phases, durations, 5));
  });

  it("skips a zero-length Main phase cleanly", () => {
    const zeroMain = { entranceSeconds: 2, exitSeconds: 3, totalSeconds: 5 };
    const phases: TitlePhases = {
      entrance: {
        start: { translate: { x: 0, y: 0 }, scale: 0 },
        end: { translate: { x: 0, y: 0 }, scale: 1 },
      },
      main: staticPhases().main,
      exit: {
        start: { translate: { x: 0, y: 0 }, scale: 1 },
        end: { translate: { x: 0, y: 0 }, scale: 0 },
      },
    };
    expect(titleTransformAt(phases, zeroMain, 2).scale).toBeCloseTo(1);
  });
});
