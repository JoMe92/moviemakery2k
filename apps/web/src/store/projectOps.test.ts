import { describe, expect, it } from "vitest";
import type { Slide } from "../lib/apiClient";
import {
  insertSlide,
  isValidSlideDuration,
  isValidTransitionDuration,
  moveSlide,
  removeSlide,
} from "./projectOps";

const s = (id: string, t: string | null = null): Slide => ({
  kind: "image",
  id,
  mediaId: `m${id}`,
  duration: 5,
  transitionIn: t ? { transitionId: t, duration: 1.25 } : null,
});
const ids = (slides: Slide[]) => slides.map((x) => x.id);

describe("projectOps", () => {
  it("Spec: inserting between two pictures lands at position 2", () => {
    expect(ids(insertSlide([s("1"), s("2")], s("x"), 1))).toEqual(["1", "x", "2"]);
  });

  it("Spec: reordering – the incoming transition moves along and is dropped at position 1", () => {
    const moved = moveSlide([s("1"), s("2", "fade"), s("3", "circle")], 2, 0);
    expect(ids(moved)).toEqual(["3", "1", "2"]);
    expect(moved[0]?.transitionIn).toBeNull();
    expect(moved[2]?.transitionIn?.transitionId).toBe("fade");
  });

  it("removing the first item leaves its successor without a transition", () => {
    const rest = removeSlide([s("1"), s("2", "fade")], "1");
    expect(rest).toEqual([s("2")]);
  });

  it.each([
    [0.5, true],
    [60, true],
    [2.5, true],
    [0.1, false],
    [60.25, false],
    [2.3, false],
    [Number.NaN, false],
  ])("picture duration %s valid: %s", (d, ok) => {
    expect(isValidSlideDuration(d)).toBe(ok);
  });

  it.each([
    [0.25, true],
    [5, true],
    [0, false],
    [5.25, false],
    [1.1, false],
  ])("transition duration %s valid: %s", (d, ok) => {
    expect(isValidTransitionDuration(d)).toBe(ok);
  });
});
