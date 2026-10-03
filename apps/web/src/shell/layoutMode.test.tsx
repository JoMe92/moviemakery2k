import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/renderApp";
import { mockLayout, mockViewport } from "../test/mockLayout";
import { isTouchLayout, readLayout, useLayoutMode, WIDE_LAYOUT } from "./layoutMode";

function viewport(width: number, height: number, coarse = false) {
  return mockViewport({ width, height, coarse, reducedMotion: false });
}

describe("readLayout (design.md D1)", () => {
  it("is the wide desktop layout without matchMedia", () => {
    expect(readLayout()).toEqual(WIDE_LAYOUT);
  });

  it.each([
    [599, 900, "compact"],
    [600, 900, "medium"],
    [1279, 900, "medium"],
    [1280, 900, "wide"],
    [1280, 720, "wide"],
  ] as const)("width %i × %i is %s", (w, h, mode) => {
    viewport(w, h);
    expect(readLayout().mode).toBe(mode);
  });

  it("treats a landscape window below 500 px height as compact landscape", () => {
    viewport(844, 499);
    expect(readLayout()).toMatchObject({ mode: "compact", orientation: "landscape" });
    viewport(844, 500);
    expect(readLayout()).toMatchObject({ mode: "medium", orientation: "landscape" });
  });

  it("does not shrink a short portrait window to compact", () => {
    viewport(700, 750);
    expect(readLayout()).toMatchObject({ mode: "medium", orientation: "portrait" });
  });

  it("reports a coarse pointer independently of the mode", () => {
    viewport(1366, 1024, true);
    const layout = readLayout();
    expect(layout).toMatchObject({ mode: "wide", coarse: true });
    expect(isTouchLayout(layout)).toBe(true);
    viewport(1366, 1024, false);
    expect(isTouchLayout(readLayout())).toBe(false);
    viewport(390, 844, false);
    expect(isTouchLayout(readLayout())).toBe(true);
  });
});

describe("useLayoutMode", () => {
  it("switches at every boundary without remounting", () => {
    const vp = viewport(1280, 800);
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current.mode).toBe("wide");
    vp.resize(1279, 800);
    expect(result.current.mode).toBe("medium");
    vp.resize(600, 800);
    expect(result.current.mode).toBe("medium");
    vp.resize(599, 800);
    expect(result.current.mode).toBe("compact");
    vp.resize(844, 390);
    expect(result.current).toMatchObject({ mode: "compact", orientation: "landscape" });
    vp.resize(844, 500);
    expect(result.current).toMatchObject({ mode: "medium", orientation: "landscape" });
  });

  it("keeps the same object while nothing changes", () => {
    const vp = viewport(390, 844, true);
    const { result } = renderHook(() => useLayoutMode());
    const first = result.current;
    vp.resize(391, 844);
    expect(result.current).toBe(first);
  });
});

describe("root attributes", () => {
  it("marks the root element and keeps the store across a mode change", async () => {
    const vp = mockLayout("compact", { coarse: true });
    const { store, ready } = renderApp();
    await ready;
    const root = document.documentElement;
    expect(root.dataset).toMatchObject({
      layout: "compact",
      orientation: "portrait",
      pointer: "coarse",
    });
    const before = store.getState();
    vp.resize(844, 390);
    expect(root.dataset.orientation).toBe("landscape");
    expect(root.dataset.layout).toBe("compact");
    vp.set({ width: 1280, height: 720, coarse: false });
    expect(root.dataset).toMatchObject({ layout: "wide", pointer: "fine" });
    expect(store.getState().slides).toBe(before.slides);
  });

  it("leaves the wide layout unchanged without matchMedia", async () => {
    const { ready, container } = renderApp();
    await ready;
    expect(document.documentElement.dataset.layout).toBe("wide");
    expect(container.querySelector(".window")).not.toBeNull();
  });
});
