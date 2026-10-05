import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem, MusicClip, NarrationClip, Slide } from "../lib/apiClient";
import { type AppState, createAppStore } from "../store/appStore";
import { audioItem, mockApi } from "../store/testApi";
import { AudioEngine } from "./AudioEngine";
import { audioPlanner, usePreviewAudio } from "./usePreviewAudio";

const slides: Slide[] = [
  {
    kind: "image",
    id: "s1",
    mediaId: "img",
    duration: 5,
    effectId: null,
    title: null,
    transitionIn: null,
  },
];
const music: MusicClip[] = [
  {
    id: "c1",
    mediaId: "song",
    trimStart: 1,
    trimEnd: null,
    volume: 0.8,
    fadeIn: false,
    fadeOut: false,
  },
];
const narration: NarrationClip[] = [];
const media = [
  { kind: "audio", id: "song", duration: 30, audioUrl: "/song.m4a" },
] as unknown as MediaItem[];

function state(partial: Partial<AppState>): AppState {
  return {
    slides,
    music,
    narration,
    clipAudioBalance: 50,
    media,
    playback: { playing: true, time: 2 },
    demo: null,
    ...partial,
  } as AppState;
}

describe("audioPlanner", () => {
  it("plans the music schedule of the project (cut at the movie end)", () => {
    const plan = audioPlanner()(state({}));
    expect(plan.playing).toBe(true);
    expect(plan.time).toBe(2);
    expect(plan.muted).toBe(false);
    expect(plan.segments).toEqual([
      { mediaId: "song", at: 0, sourceIn: 1, length: 5, gain: 0.8, fadeIn: 0, fadeOut: 1 },
    ]);
  });

  it("recomputes the schedules only when a track, media, slides or the level change", () => {
    const planner = audioPlanner();
    const a = planner(state({}));
    const b = planner(state({ playback: { playing: true, time: 3 } }));
    expect(b.segments).toBe(a.segments);
    expect(planner(state({ music: [...music] })).segments).not.toBe(a.segments);
    expect(planner(state({ narration: [] })).segments).not.toBe(a.segments);
    expect(planner(state({ clipAudioBalance: 70 })).segments).not.toBe(a.segments);
  });

  it("mutes the music during the transition demo", () => {
    const plan = audioPlanner()(state({ demo: { playing: true, time: 0 } }));
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

const videoSlides: Slide[] = [
  {
    kind: "video",
    id: "v1",
    mediaId: "clip",
    trimIn: 4,
    trimOut: 10,
    effectId: null,
    title: null,
    transitionIn: null,
  },
];
const narrationClips: NarrationClip[] = [
  {
    id: "n1",
    mediaId: "rec",
    at: 2,
    trimStart: 0,
    trimEnd: 3,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  },
];
const audioMedia = [
  { kind: "audio", id: "song", duration: 30, audioUrl: "/song.m4a" },
  { kind: "audio", id: "rec", duration: 10, audioUrl: "/rec.webm" },
  { kind: "video", id: "clip", duration: 20, videoUrl: "/clip.mp4" },
] as unknown as MediaItem[];

/** All three tracks at once; `clipAudioBalance` is the only thing that varies. */
function mixedState(clipAudioBalance: number, partial: Partial<AppState> = {}): AppState {
  return state({
    slides: videoSlides,
    music,
    narration: narrationClips,
    media: audioMedia,
    clipAudioBalance,
    ...partial,
  });
}

describe("the global audio level (design.md D4)", () => {
  const gainsByMedia = (clipAudioBalance: number) =>
    Object.fromEntries(
      audioPlanner()(mixedState(clipAudioBalance)).segments.map((s) => [s.mediaId, s.gain]),
    );

  it("Spec: at 100 only the clip sound is audible, music and narration are silent", () => {
    expect(gainsByMedia(100)).toEqual({ clip: 1 });
  });

  it("Spec: at 50 clip sound and music play together at full gain", () => {
    // The music clip's own volume is 0.8; the level does not change it.
    expect(gainsByMedia(50)).toEqual({ song: 0.8, rec: 1, clip: 1 });
  });

  it("at 0 the clip sound is silent and music and narration play at full gain", () => {
    expect(gainsByMedia(0)).toEqual({ song: 0.8, rec: 1 });
  });

  it("scales the quieter side between the ends", () => {
    expect(gainsByMedia(75)).toEqual({ song: 0.4, rec: 0.5, clip: 1 });
  });
});

describe("video-clip sound in the plan (design.md D1)", () => {
  it("schedules the element's trim range where the timeline put it", () => {
    const [segment] = audioPlanner()(
      state({ slides: videoSlides, music: [], media: audioMedia, clipAudioBalance: 100 }),
    ).segments;
    expect(segment).toEqual({
      mediaId: "clip",
      at: 0,
      sourceIn: 4,
      length: 6,
      gain: 1,
      fadeIn: 0,
      // The element reaches the movie end, so the end fade applies.
      fadeOut: 1,
    });
  });

  it("places the narration at its own `at`, not at a filmstrip element", () => {
    const segments = audioPlanner()(mixedState(0)).segments;
    expect(segments.find((s) => s.mediaId === "rec")).toMatchObject({ at: 2, length: 3 });
  });
});

describe("usePreviewAudio", () => {
  it.each([
    ["keydown", (el: Document) => fireEvent.keyDown(el, { key: "p" })],
    ["pointerdown", (el: Document) => fireEvent.pointerDown(el)],
  ])(
    "a document %s unlocks the engine, so playback started elsewhere is audible",
    async (_, gesture) => {
      const { ctx, started } = fakeContext();
      const createContext = vi.fn(() => ctx);
      const engine = new AudioEngine({
        createContext,
        decode: async () => ({ duration: 30 }),
        fetchData: async () => new ArrayBuffer(0),
      });
      const store = createAppStore(mockApi());
      store.setState({ slides, media: [audioItem("song", 30)], music });
      const { unmount } = renderHook(() => usePreviewAudio(store, () => engine));
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
    },
  );

  it("does not create an AudioContext on gestures without any sound", () => {
    const createContext = vi.fn(() => fakeContext().ctx);
    const engine = new AudioEngine({ createContext, decode: null, fetchData: vi.fn() });
    const store = createAppStore(mockApi());
    const { unmount } = renderHook(() => usePreviewAudio(store, () => engine));
    fireEvent.pointerDown(document);
    expect(createContext).not.toHaveBeenCalled();
    unmount();
  });
});
