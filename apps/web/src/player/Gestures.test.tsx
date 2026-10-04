import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { slideStartTime } from "../timeline/timeline";
import { timelineOf } from "./controls";
import { CONTROLS_HIDE_MS } from "./useFullscreen";

const slides: Slide[] = [
  { kind: "image", id: "s1", mediaId: "a", duration: 3, transitionIn: null },
  {
    kind: "image",
    id: "s2",
    mediaId: "b",
    duration: 4,
    transitionIn: { transitionId: "fade", duration: 1 },
  },
  { kind: "image", id: "s3", mediaId: "a", duration: 3, transitionIn: null },
];

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document, "exitFullscreen");
});

async function setup(layout: "compact" | "wide" = "compact") {
  if (layout === "compact") mockLayout("compact");
  const view = renderApp(
    mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 3 as const, slides, music: [] })) }),
  );
  await act(() => view.ready);
  return { ...view, user: userEvent.setup() };
}

const area = () => screen.getByTestId("monitor-gestures");
const root = () => area().closest("[data-fullscreen]") as HTMLElement;

function swipe(dx: number, dy = 0, pointerType = "touch") {
  const p = { pointerId: 4, pointerType };
  fireEvent.pointerDown(area(), { ...p, clientX: 200, clientY: 100 });
  fireEvent.pointerUp(area(), { ...p, clientX: 200 + dx, clientY: 100 + dy });
}

function tap() {
  const p = { pointerId: 5, pointerType: "touch", clientX: 100, clientY: 100 };
  fireEvent.pointerDown(area(), p);
  fireEvent.pointerUp(area(), p);
}

describe("monitor gestures (add-mobile-layout design.md D12)", () => {
  it("swipes to the next picture in the paused monitor", async () => {
    const { store } = await setup();
    swipe(-60);
    expect(store.getState().playback.time).toBeCloseTo(slideStartTime(timelineOf(slides), 1));
    swipe(60);
    expect(store.getState().playback.time).toBe(0);
  });

  it("ignores short, vertical and mouse swipes", async () => {
    const { store } = await setup();
    swipe(-40);
    swipe(-60, 80);
    swipe(-80, 0, "mouse");
    expect(store.getState().playback.time).toBe(0);
  });

  it("opens the full-screen preview with a double tap", async () => {
    await setup();
    tap();
    tap();
    expect(root()).toHaveAttribute("data-fullscreen", "overlay");
    tap();
    tap();
    expect(root()).toHaveAttribute("data-fullscreen", "off");
  });

  it("covers the viewport without the Fullscreen API and restores the compact layout", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Vollbild" }));
    expect(root()).toHaveAttribute("data-fullscreen", "overlay");
    await user.click(screen.getByRole("button", { name: "Vollbild beenden" }));
    expect(root()).toHaveAttribute("data-fullscreen", "off");
    expect(screen.getByTestId("compact-window")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Vollbild" }));
    await user.keyboard("{Escape}");
    expect(root()).toHaveAttribute("data-fullscreen", "off");
  });

  it("uses the Fullscreen API on the monitor container where it exists", async () => {
    const request = vi.fn(async function (this: HTMLElement) {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: this });
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Vollbild" }));
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.contexts[0]).toBe(root());
    expect(root()).toHaveAttribute("data-fullscreen", "native");
    // Leaving via the browser (Escape) ends the mode.
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(root()).toHaveAttribute("data-fullscreen", "off");
  });

  it("hides the controls after 3 s without touch in full screen", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Vollbild" }));
    vi.useFakeTimers();
    act(() => {
      fireEvent.pointerDown(root(), { pointerId: 9, pointerType: "touch" });
    });
    expect(root()).not.toHaveAttribute("data-controls");
    act(() => vi.advanceTimersByTime(CONTROLS_HIDE_MS));
    expect(root()).toHaveAttribute("data-controls", "hidden");
    act(() => {
      fireEvent.pointerDown(root(), { pointerId: 9, pointerType: "touch" });
    });
    expect(root()).not.toHaveAttribute("data-controls");
  });

  it("has no full-screen button with a mouse on the desktop", async () => {
    await setup("wide");
    expect(screen.queryByRole("button", { name: "Vollbild" })).toBeNull();
  });
});
