import { describe, expect, it } from "vitest";
import type { Slide } from "../lib/apiClient";
import { formatDuration, insertionIndex, resolveDrop } from "./dropLogic";

const s = (id: string): Slide => ({ id, mediaId: `m${id}`, duration: 5, transitionIn: null });
const slides = [s("1"), s("2"), s("3")];
const media = { type: "media", mediaId: "x" } as const;

describe("dropLogic", () => {
  it("Spec: Bild zwischen erstes und zweites Element → Position 2", () => {
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

  it("hängt hinter der letzten Kachel und im leeren Bildstreifen an", () => {
    expect(insertionIndex({ type: "slide", slideId: "3", after: true }, slides)).toBe(3);
    expect(insertionIndex({ type: "strip" }, slides)).toBe(3);
    expect(insertionIndex({ type: "strip" }, [])).toBe(0);
    expect(insertionIndex(null, slides)).toBeNull();
    expect(insertionIndex({ type: "slide", slideId: "weg", after: false }, slides)).toBeNull();
  });

  it("Spec: drittes Element an die erste Position", () => {
    expect(
      resolveDrop(
        { type: "slide", slideId: "3" },
        { type: "slide", slideId: "1", after: false },
        slides,
      ),
    ).toEqual({ kind: "move", from: 2, to: 0 });
  });

  it("Umsortieren ins Leere hinter den Kacheln → ans Ende; ohne Ziel/auf sich selbst → nichts", () => {
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

  it("formatiert Dauern deutsch mit zwei Nachkommastellen", () => {
    expect(formatDuration(5)).toBe("5,00 s");
    expect(formatDuration(2.25)).toBe("2,25 s");
  });
});
