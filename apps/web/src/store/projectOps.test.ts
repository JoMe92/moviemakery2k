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
  id,
  mediaId: `m${id}`,
  duration: 5,
  transitionIn: t ? { transitionId: t, duration: 1.25 } : null,
});
const ids = (slides: Slide[]) => slides.map((x) => x.id);

describe("projectOps", () => {
  it("Spec: Einfügen zwischen zwei Bildern landet an Position 2", () => {
    expect(ids(insertSlide([s("1"), s("2")], s("x"), 1))).toEqual(["1", "x", "2"]);
  });

  it("Spec: Umsortieren – der eingehende Übergang wandert mit, an Position 1 entfällt er", () => {
    const moved = moveSlide([s("1"), s("2", "fade"), s("3", "circle")], 2, 0);
    expect(ids(moved)).toEqual(["3", "1", "2"]);
    expect(moved[0]?.transitionIn).toBeNull();
    expect(moved[2]?.transitionIn?.transitionId).toBe("fade");
  });

  it("Entfernen des ersten Elements macht den Nachfolger zum Übergangslosen", () => {
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
  ])("Bilddauer %s gültig: %s", (d, ok) => {
    expect(isValidSlideDuration(d)).toBe(ok);
  });

  it.each([
    [0.25, true],
    [5, true],
    [0, false],
    [5.25, false],
    [1.1, false],
  ])("Übergangsdauer %s gültig: %s", (d, ok) => {
    expect(isValidTransitionDuration(d)).toBe(ok);
  });
});
