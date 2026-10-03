import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicClip, Slide } from "../lib/apiClient";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const slide = (id: string, mediaId: string): Slide => ({
  id,
  mediaId,
  duration: 3,
  transitionIn: null,
});
const clip = (id: string, mediaId: string): MusicClip => ({
  id,
  mediaId,
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  fadeIn: false,
  fadeOut: false,
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

// jsdom has no layout: storyboard tiles in a row at y 520, music clips at y 700.
let restoreRects: (() => void) | null = null;
beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const label = this.getAttribute("aria-label") ?? "";
    const slideMatch = /^Bild (\d+):/.exec(label);
    if (slideMatch) return rect(20 + (Number(slideMatch[1]) - 1) * 160, 520, 104, 100);
    const clipMatch = /^Musikstück (\d+):/.exec(label);
    if (clipMatch) return rect(20 + (Number(clipMatch[1]) - 1) * 160, 700, 150, 50);
    const testId = this.getAttribute("data-testid");
    if (testId === "storyboard-strip") return rect(0, 500, 380, 150);
    if (testId === "music-strip") return rect(0, 680, 380, 90);
    return original.call(this);
  };
  restoreRects = () => {
    Element.prototype.getBoundingClientRect = original;
  };
});
afterEach(() => restoreRects?.());

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const touches = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });
const end = (x: number, y: number) => ({ changedTouches: [{ clientX: x, clientY: y }], touches: [] });

async function setup() {
  mockLayout("compact", { coarse: true });
  const api = mockApi({
      listMedia: async () => [
        mediaItem("a"),
        mediaItem("b"),
        mediaItem("c"),
        audioItem("x", 50),
        audioItem("y", 50),
        audioItem("z", 50),
      ],
      getProject: vi.fn(async () => ({
        schemaVersion: 2 as const,
        slides: [slide("s1", "a"), slide("s2", "b"), slide("s3", "c")],
        music: [clip("m1", "x"), clip("m2", "y"), clip("m3", "z")],
      })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  return { ...view, api };
}

/** Long press (400 ms) on an element, then drag it to x and lift the finger. */
async function longPressDrag(el: HTMLElement, from: [number, number], toX: number) {
  const [x, y] = from;
  fireEvent.touchStart(el, touches(x, y));
  await wait(450);
  fireEvent.touchMove(el, touches(x - 10, y));
  await wait(20);
  fireEvent.touchMove(el, touches(toX, y));
  await wait(20);
  fireEvent.touchEnd(el, end(toX, y));
}

/** Finger moves at once (a swipe): the strip scrolls, nothing is dragged. */
async function swipe(el: HTMLElement, from: [number, number], toX: number) {
  const [x, y] = from;
  fireEvent.touchStart(el, touches(x, y));
  fireEvent.touchMove(el, touches(x - 30, y));
  await wait(450);
  fireEvent.touchMove(el, touches(toX, y));
  fireEvent.touchEnd(el, end(toX, y));
}

const tile = (n: number) => screen.getByRole("button", { name: new RegExp(`^Bild ${n}:`) });
const block = (n: number) => screen.getByRole("button", { name: new RegExp(`^Musikstück ${n}:`) });

describe("touch reordering (add-mobile-layout design.md D8)", () => {
  it("scrolls instead of dragging a picture when the finger moves at once", async () => {
    const { store } = await setup();
    await swipe(tile(3), [392, 570], 40);
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("moves the third picture to the front after a long press and saves", async () => {
    const { store, api } = await setup();
    await longPressDrag(tile(3), [392, 570], 40);
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    await act(() => store.getState().flushSave());
    expect(api.saved.at(-1)?.slides.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
  });

  it("scrolls instead of dragging a music clip when the finger moves at once", async () => {
    const { store } = await setup();
    await swipe(block(3), [395, 725], 40);
    expect(store.getState().music.map((c) => c.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("moves the third music clip to the front after a long press and saves", async () => {
    const { store, api } = await setup();
    await longPressDrag(block(3), [395, 725], 40);
    expect(store.getState().music.map((c) => c.id)).toEqual(["m3", "m1", "m2"]);
    await act(() => store.getState().flushSave());
    expect(api.saved.at(-1)?.music.map((c) => c.id)).toEqual(["m3", "m1", "m2"]);
  });

  it("leaves touch pointers to the touch sensor", async () => {
    const { store } = await setup();
    const pointer = { pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" };
    // A touch pointer is left to the touch sensor: pointer moves alone never drag.
    fireEvent.pointerDown(tile(3), { ...pointer, clientX: 392, clientY: 570 });
    fireEvent.pointerMove(document, { ...pointer, clientX: 300, clientY: 570 });
    await wait(20);
    fireEvent.pointerMove(document, { ...pointer, clientX: 40, clientY: 570 });
    fireEvent.pointerUp(document, { ...pointer, clientX: 40, clientY: 570 });
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
});
