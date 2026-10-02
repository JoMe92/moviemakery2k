import { describe, expect, it } from "vitest";
import type { Slide } from "../lib/apiClient";
import { formatDuration, insertionIndex, resolveDrop } from "./dropLogic";

const s = (id: string): Slide => ({ id, mediaId: `m${id}`, duration: 5, transitionIn: null });
const slides = [s("1"), s("2"), s("3")];
const media = { type: "media", mediaId: "x" } as const;

describe("dropLogic", () => {
  it("Spec: picture between first and second item → position 2", () => {
    expect(resolveDrop(media, { type: "slide", slideId: "1", after: true }, slides)).toEqual({
      kind: "insert",
      mediaId: "x",
      index: 1,
    });
    expect(resolveDrop(media, { type: "slide", slideId: "2", after: false }, slides)).toEqual({
      kind: "insert",
      mediaId: "x",
      index: 1,
    });
  });

  it("appends after the last tile and in the empty storyboard", () => {
    expect(insertionIndex({ type: "slide", slideId: "3", after: true }, slides)).toBe(3);
    expect(insertionIndex({ type: "strip" }, slides)).toBe(3);
    expect(insertionIndex({ type: "strip" }, [])).toBe(0);
    expect(insertionIndex(null, slides)).toBeNull();
    expect(insertionIndex({ type: "slide", slideId: "weg", after: false }, slides)).toBeNull();
  });

  it("Spec: third item to the first position", () => {
    expect(
      resolveDrop(
        { type: "slide", slideId: "3" },
        { type: "slide", slideId: "1", after: false },
        slides,
      ),
    ).toEqual({ kind: "move", from: 2, to: 0 });
  });

  it("reordering into the empty space after the tiles → to the end; no target/onto itself → nothing", () => {
    expect(resolveDrop({ type: "slide", slideId: "1" }, { type: "strip" }, slides)).toEqual({
      kind: "move",
      from: 0,
      to: 2,
    });
    expect(resolveDrop({ type: "slide", slideId: "1" }, null, slides)).toEqual({ kind: "none" });
    expect(
      resolveDrop(
        { type: "slide", slideId: "2" },
        { type: "slide", slideId: "2", after: true },
        slides,
      ),
    ).toEqual({ kind: "none" });
  });

  it("formats durations in German with two decimal places", () => {
    expect(formatDuration(5, "de")).toBe("5,00 s");
    expect(formatDuration(2.25, "de")).toBe("2,25 s");
    expect(formatDuration(2.5, "en")).toBe("2.50 s");
  });

  it("transition onto a slot → set (replaces); not on the first picture, not on tiles", () => {
    const t = { type: "transition", transitionId: "circle" } as const;
    expect(resolveDrop(t, { type: "transitionSlot", slideId: "2" }, slides)).toEqual({
      kind: "setTransition",
      slideId: "2",
      transitionId: "circle",
    });
    expect(resolveDrop(t, { type: "transitionSlot", slideId: "1" }, slides)).toEqual({
      kind: "none",
    });
    expect(resolveDrop(t, { type: "slide", slideId: "2", after: false }, slides)).toEqual({
      kind: "none",
    });
    expect(resolveDrop(t, { type: "strip" }, slides)).toEqual({ kind: "none" });
    expect(resolveDrop(media, { type: "transitionSlot", slideId: "2" }, slides)).toEqual({
      kind: "none",
    });
    expect(insertionIndex({ type: "transitionSlot", slideId: "2" }, slides)).toBeNull();
  });
});
