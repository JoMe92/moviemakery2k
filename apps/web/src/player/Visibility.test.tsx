import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const slides: Slide[] = [
  { id: "s1", mediaId: "a", duration: 3, transitionIn: null },
  { id: "s2", mediaId: "b", duration: 3, transitionIn: null },
];

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

afterEach(() => {
  Reflect.deleteProperty(document, "visibilityState");
});

describe("tab in the background (add-mobile-layout design.md D14)", () => {
  it("pauses playback, stops the clock and keeps the position", async () => {
    mockLayout("compact");
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const { store, ready } = renderApp(
      mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 2 as const, slides, music: [] })) }),
    );
    await act(() => ready);
    act(() => {
      store.getState().seek(1.25);
      store.getState().play();
    });
    expect(store.getState().playback.playing).toBe(true);
    cancel.mockClear();
    setVisibility("hidden");
    expect(store.getState().playback).toMatchObject({ playing: false, time: 1.25 });
    expect(cancel).toHaveBeenCalled();
    setVisibility("visible");
    expect(store.getState().playback).toMatchObject({ playing: false, time: 1.25 });
  });
});
