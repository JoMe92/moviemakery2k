import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const slide = (id: string, mediaId: string): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration: 5,
  effectId: null,
  transitionIn: null,
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

// jsdom has no layout: fixed rectangles for collection tiles, storyboard tiles and strip.
let restoreRects: (() => void) | null = null;
beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const label = this.getAttribute("aria-label") ?? "";
    const slideMatch = /^Bild (\d+):/.exec(label);
    if (slideMatch) return rect(20 + (Number(slideMatch[1]) - 1) * 160, 820, 104, 100);
    if (this.getAttribute("data-testid") === "storyboard-strip") return rect(0, 800, 820, 150);
    const li = this.closest("ul[aria-label='Bilder'] > li");
    if (li && this.tagName === "BUTTON") {
      const index = Array.from(li.parentElement?.children ?? []).indexOf(li);
      return rect(20 + index * 100, 100, 96, 90);
    }
    return original.call(this);
  };
  restoreRects = () => {
    Element.prototype.getBoundingClientRect = original;
  };
});
afterEach(() => restoreRects?.());

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

async function setup(slides: Slide[] = []) {
  mockLayout("medium");
  const view = renderApp(
    mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 4 as const, slides, music: [] })) }),
  );
  await act(() => view.ready);
  return view;
}

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

describe("medium layout (add-mobile-layout design.md D3)", () => {
  it("shows monitor and collection side by side, the storyboard below and the taskbar", async () => {
    await setup();
    const collection = screen.getByRole("region", { name: "Sammlung: Meine Bilder" });
    const monitor = screen.getByRole("region", { name: "Vorschau" });
    // Same workspace row (the monitor sits in a layout-neutral full-screen container).
    expect(collection.closest(".workspace")).not.toBeNull();
    expect(monitor.closest(".workspace")).toBe(collection.closest(".workspace"));
    expect(screen.getByRole("region", { name: "Storyboard" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Filmschritte" })).toBeInTheDocument();
    expect(screen.getByRole("menubar", { name: "Menüleiste" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Filmaufgaben" })).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(document.documentElement.dataset.layout).toBe("medium");
  });

  it("drags a picture from the collection into the storyboard by touch after a long press", async () => {
    const { store } = await setup([slide("s1", "a")]);
    const tile = within(screen.getByRole("list", { name: "Bilder" })).getAllByRole("button")[1];
    if (!tile) throw new Error("tile missing");
    fireEvent.touchStart(tile, touch(170, 140));
    await wait(450);
    fireEvent.touchMove(tile, touch(160, 860));
    await wait(20);
    fireEvent.touchMove(tile, touch(150, 870));
    await wait(20);
    fireEvent.touchEnd(tile, { changedTouches: [{ clientX: 150, clientY: 870 }], touches: [] });
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["a", "b"]);
  });

  it("does not drag when the finger moves right away (the collection scrolls)", async () => {
    const { store } = await setup([slide("s1", "a")]);
    const tile = within(screen.getByRole("list", { name: "Bilder" })).getAllByRole("button")[1];
    if (!tile) throw new Error("tile missing");
    fireEvent.touchStart(tile, touch(170, 140));
    fireEvent.touchMove(tile, touch(170, 180));
    await wait(450);
    fireEvent.touchMove(tile, touch(150, 870));
    fireEvent.touchEnd(tile, { changedTouches: [{ clientX: 150, clientY: 870 }], touches: [] });
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["a"]);
  });
});
