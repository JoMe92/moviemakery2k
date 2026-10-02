import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem, MusicClip, Slide } from "../lib/apiClient";
import { type AppState, createAppStore } from "../store/appStore";
import { audioItem, mockApi } from "../store/testApi";
import { AudioEngine } from "./AudioEngine";
import { musicPlanner, useMusicAudio } from "./useMusicAudio";

const slides: Slide[] = [{ id: "s1", mediaId: "img", duration: 5, transitionIn: null }];
const music: MusicClip[] = [
  { id: "c1", mediaId: "song", trimStart: 1, trimEnd: null, volume: 0.8, fadeIn: false, fadeOut: false },
];
const media = [
  { kind: "audio", id: "song", duration: 30, audioUrl: "/song.m4a" },
] as unknown as MediaItem[];

function state(partial: Partial<AppState>): AppState {
  return {
    slides,
    music,
    media,
    playback: { playing: true, time: 2 },
    demo: null,
    ...partial,
  } as AppState;
}

describe("musicPlanner", () => {
  it("plans the music schedule of the project (cut at the movie end)", () => {
    const plan = musicPlanner()(state({}));
    expect(plan.playing).toBe(true);
    expect(plan.time).toBe(2);
    expect(plan.muted).toBe(false);
    expect(plan.segments).toEqual([
      { mediaId: "song", at: 0, sourceIn: 1, length: 5, gain: 0.8, fadeIn: 0, fadeOut: 1 },
    ]);
  });

  it("recomputes the schedule only when music, media or slides change", () => {
    const planner = musicPlanner();
    const a = planner(state({}));
    const b = planner(state({ playback: { playing: true, time: 3 } }));
    expect(b.segments).toBe(a.segments);
    const c = planner(state({ music: [...music] }));
    expect(c.segments).not.toBe(a.segments);
  });

  it("mutes the music during the transition demo", () => {
    const plan = musicPlanner()(state({ demo: { playing: true, time: 0 } }));
    expect(plan.muted).toBe(true);
    expect(plan.playing).toBe(false);
  });
});

function fakeContext() {
  const started: number[][] = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: {},
    onstatechange: null,
    resume: async () => {},
    close: async () => {},
    createGain: () => ({ ...node(), gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start: (...args: number[]) => started.push(args),
      stop() {},
    }),
  };
  return { ctx, started };
}

describe("useMusicAudio", () => {
  it.each([
    ["keydown", (el: Document) => fireEvent.keyDown(el, { key: "p" })],
    ["pointerdown", (el: Document) => fireEvent.pointerDown(el)],
  ])("a document %s unlocks the engine, so playback started elsewhere is audible", async (_, gesture) => {
    const { ctx, started } = fakeContext();
    const createContext = vi.fn(() => ctx);
    const engine = new AudioEngine({
      createContext,
      decode: async () => ({ duration: 30 }),
      fetchData: async () => new ArrayBuffer(0),
    });
    const store = createAppStore(mockApi());
    store.setState({ slides, media: [audioItem("song", 30)], music });
    const { unmount } = renderHook(() => useMusicAudio(store, () => engine));
    await engine.whenLoaded();

    gesture(document);
    expect(createContext).toHaveBeenCalledTimes(1);
    // Playback started via the store (e.g. the menu), not the play button.
    act(() => store.getState().togglePlay());
    expect(started).toEqual([[0.05, 1, 5]]);
    expect(window.__mmyAudio?.().sources).toBe(1);

    unmount();
    expect(window.__mmyAudio).toBeUndefined();
    gesture(document);
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("does not create an AudioContext on gestures without music", () => {
    const createContext = vi.fn(() => fakeContext().ctx);
    const engine = new AudioEngine({ createContext, decode: null, fetchData: vi.fn() });
    const store = createAppStore(mockApi());
    const { unmount } = renderHook(() => useMusicAudio(store, () => engine));
    fireEvent.pointerDown(document);
    expect(createContext).not.toHaveBeenCalled();
    unmount();
  });
});
