/**
 * Video-clip sound in the preview (add-narration-and-audio-levels design.md D1
 * and D4, spec preview-player "Clip-Ton und Erzählung in der Wiedergabe").
 *
 * The point of D1 is that a video element's sound goes through the very same
 * Web Audio clock as the music, so these tests check the store → hook → engine
 * path for a video project: that the sound is scheduled from the medium's
 * `videoUrl` rather than from the `<video>` element, that the audio clock
 * becomes the master clock (there is no second one), and that pause and seek
 * reach the clip sound exactly as they reach the music.
 */
import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { createAppStore } from "../store/appStore";
import { audioItem, mockApi, videoItem } from "../store/testApi";
import { type AudioBufferLike, AudioEngine, SCHEDULE_LEAD } from "./AudioEngine";
import { usePreviewAudio } from "./usePreviewAudio";

/** One 6 s video element (trim 4 to 10) and one music clip over the same span. */
const slides: Slide[] = [
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
const music = [
  {
    id: "m1",
    mediaId: "song",
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  },
];

class FakeSource {
  buffer: AudioBufferLike | null = null;
  started: [number, number, number] | null = null;
  stopped = false;
  connect() {}
  disconnect() {}
  start(when: number, offset: number, duration: number) {
    this.started = [when, offset, duration];
  }
  stop() {
    this.stopped = true;
  }
}

function fakeContext() {
  const sources: FakeSource[] = [];
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: {},
    onstatechange: null,
    resume: async () => {},
    close: async () => {},
    createGain: () => ({
      connect() {},
      disconnect() {},
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
    }),
    createBufferSource: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
  };
  return { ctx, sources, live: () => sources.filter((s) => !s.stopped) };
}

async function setup(clipAudioBalance = 50) {
  const fake = fakeContext();
  const fetchData = vi.fn(async () => new ArrayBuffer(0));
  const engine = new AudioEngine({
    createContext: () => fake.ctx,
    decode: async () => ({ duration: 20 }),
    fetchData,
  });
  const store = createAppStore(mockApi());
  store.setState({
    slides,
    music,
    narration: [],
    clipAudioBalance,
    media: [videoItem("clip", 20), audioItem("song", 30)],
  });
  const view = renderHook(() => usePreviewAudio(store, () => engine));
  await engine.whenLoaded();
  return { ...fake, engine, store, fetchData, view };
}

describe("video-clip sound in the preview", () => {
  it("decodes the video itself through Web Audio, not through the <video> element", async () => {
    const { engine, fetchData } = await setup();
    // The medium is fetched from its videoUrl and decoded like an audio file;
    // the <video> element stays muted picture scrubbing (design.md D1).
    expect(fetchData).toHaveBeenCalledWith("/api/media/clip/video");
    expect(engine.debugState().decoded).toContain("clip");
  });

  it("plays the trim range and makes the audio clock the master clock", async () => {
    const { engine, store, live } = await setup();
    fireEvent.pointerDown(document);
    act(() => store.getState().togglePlay());

    // Music and clip sound, both scheduled against the same context time.
    expect(live()).toHaveLength(2);
    // The clip starts at its `trimIn`, not at 0, and runs its 6 s.
    expect(live().map((s) => s.started)).toEqual(expect.arrayContaining([[SCHEDULE_LEAD, 4, 6]]));
    // One clock: the engine reports movie time, so the player stops using rAF.
    expect(engine.clockTime()).toBe(0);
  });

  it("is the master clock for a video project without any music", async () => {
    const fake = fakeContext();
    const engine = new AudioEngine({
      createContext: () => fake.ctx,
      decode: async () => ({ duration: 20 }),
      fetchData: async () => new ArrayBuffer(0),
    });
    const store = createAppStore(mockApi());
    store.setState({
      slides,
      music: [],
      narration: [],
      clipAudioBalance: 50,
      media: [videoItem("clip", 20)],
    });
    renderHook(() => usePreviewAudio(store, () => engine));
    await engine.whenLoaded();

    // A gesture unlocks even without music: a video element can sound too.
    fireEvent.pointerDown(document);
    act(() => store.getState().togglePlay());
    expect(fake.live()).toHaveLength(1);
    expect(engine.clockTime()).toBe(0);
  });

  it("Spec: pausing stops the clip sound and hands the clock back", async () => {
    const { engine, store, live } = await setup();
    fireEvent.pointerDown(document);
    act(() => store.getState().togglePlay());
    expect(live()).toHaveLength(2);

    act(() => store.getState().togglePlay());
    expect(live()).toHaveLength(0);
    expect(engine.clockTime()).toBeNull();
  });

  it("Spec: seeking continues the clip sound at the matching spot inside the clip", async () => {
    const { store, live, ctx } = await setup();
    fireEvent.pointerDown(document);
    act(() => store.getState().togglePlay());
    ctx.currentTime = 1;

    act(() => store.getState().seek(2.5));

    // Rescheduled from the new time: 2.5 s into the element is trimIn + 2.5,
    // and 3.5 s of the clip are left.
    expect(live().map((s) => s.started)).toEqual(
      expect.arrayContaining([[1 + SCHEDULE_LEAD, 6.5, 3.5]]),
    );
  });

  it("Spec: stopping ends every track", async () => {
    const { engine, store, live } = await setup();
    fireEvent.pointerDown(document);
    act(() => store.getState().togglePlay());
    act(() => store.getState().stop());
    expect(live()).toHaveLength(0);
    expect(engine.clockTime()).toBeNull();
  });

  it("Spec: at level 100 only the clip sound is scheduled, at 0 only the music", async () => {
    const onlyClip = await setup(100);
    fireEvent.pointerDown(document);
    act(() => onlyClip.store.getState().togglePlay());
    expect(onlyClip.live().map((s) => s.started)).toEqual([[SCHEDULE_LEAD, 4, 6]]);
    onlyClip.view.unmount();

    const onlyMusic = await setup(0);
    fireEvent.pointerDown(document);
    act(() => onlyMusic.store.getState().togglePlay());
    expect(onlyMusic.live().map((s) => s.started)).toEqual([[SCHEDULE_LEAD, 0, 6]]);
    onlyMusic.view.unmount();
  });

  it("reschedules at the current time when the level changes mid-playback", async () => {
    const { store, live, ctx } = await setup(0);
    fireEvent.pointerDown(document);
    act(() => store.getState().togglePlay());
    expect(live()).toHaveLength(1);
    ctx.currentTime = 2;

    act(() => {
      store.getState().setClipAudioBalance(100);
    });

    // Only the clip sound is left, and it starts where playback stands now.
    expect(live().map((s) => s.started)).toEqual([[2 + SCHEDULE_LEAD, 4, 6]]);
  });
});
