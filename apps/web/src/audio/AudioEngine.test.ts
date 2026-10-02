import { describe, expect, it, vi } from "vitest";
import type { MusicSegment } from "../timeline/music";
import {
  type AudioBufferLike,
  type AudioContextLike,
  AudioEngine,
  type MusicPlan,
  SCHEDULE_LEAD,
} from "./AudioEngine";

type Ramp = ["set" | "ramp", number, number];

class FakeGain {
  readonly events: Ramp[] = [];
  disconnected = false;
  readonly gain = {
    setValueAtTime: (value: number, time: number) => this.events.push(["set", value, time]),
    linearRampToValueAtTime: (value: number, time: number) =>
      this.events.push(["ramp", value, time]),
  };
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
}

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

class FakeContext implements AudioContextLike {
  currentTime = 0;
  state = "running";
  readonly destination = {};
  onstatechange: AudioContextLike["onstatechange"] = null;
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.setState("running");
  });
  close = vi.fn(async () => {});
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  setState(state: string) {
    this.state = state;
    this.onstatechange?.call(undefined as never, new Event("statechange"));
  }
  /** Sources currently playing (started, not stopped). */
  get live() {
    return this.sources.filter((s) => !s.stopped);
  }
}

function seg(partial: Partial<MusicSegment> & Pick<MusicSegment, "mediaId" | "at" | "length">) {
  return { sourceIn: 0, gain: 1, fadeIn: 0, fadeOut: 0, ...partial };
}

const SEGMENTS: MusicSegment[] = [
  seg({ mediaId: "m1", at: 0, sourceIn: 2, length: 10 }),
  seg({ mediaId: "m2", at: 10, length: 5 }),
];

function setup(options: { state?: string } = {}) {
  const ctx = new FakeContext();
  if (options.state) ctx.state = options.state;
  const createContext = vi.fn(() => ctx);
  let resolveDecode: Record<string, () => void> = {};
  const engine = new AudioEngine({
    createContext,
    fetchData: async (url) => new TextEncoder().encode(url).buffer as ArrayBuffer,
    decode: (data) =>
      new Promise((resolve) => {
        const url = new TextDecoder().decode(data);
        resolveDecode[url] = () => resolve({ duration: 60 });
        if (!url.startsWith("slow:")) resolve({ duration: 60 });
      }),
  });
  const plan = (p: Partial<MusicPlan>): MusicPlan => ({
    playing: true,
    time: 0,
    segments: SEGMENTS,
    muted: false,
    ...p,
  });
  return {
    ctx,
    engine,
    createContext,
    plan,
    finishSlow: async () => {
      // fetch resolves first; then the decode is pending.
      await vi.waitFor(() => expect(Object.keys(resolveDecode)).toHaveLength(1));
      for (const done of Object.values(resolveDecode)) done();
      resolveDecode = {};
    },
  };
}

async function loaded(engine: AudioEngine, ids = ["m1", "m2"]) {
  for (const id of ids) engine.preload(id, `/media/${id}/preview.m4a`);
  await engine.whenLoaded();
}

const close = (actual: number[] | null, expected: number[]) => {
  expect(actual).not.toBeNull();
  actual?.forEach((v, i) => {
    expect(v).toBeCloseTo(expected[i] ?? Number.NaN, 9);
  });
};

describe("AudioEngine", () => {
  it("creates the AudioContext only in unlock() (user gesture)", async () => {
    const { engine, ctx, createContext, plan } = setup();
    await loaded(engine);
    engine.update(plan({}));
    expect(createContext).not.toHaveBeenCalled();
    expect(ctx.sources).toHaveLength(0);
    expect(engine.clockTime()).toBeNull();
    engine.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx.live).toHaveLength(2);
    engine.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("Spec: playback with music starts at 0:00 with the first image", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine);
    engine.unlock();
    ctx.currentTime = 3;
    engine.update(plan({ playing: false }));
    engine.update(plan({ time: 0 }));
    const start = 3 + SCHEDULE_LEAD;
    const [a, b] = ctx.live;
    close(a?.started ?? null, [start, 2, 10]);
    close(b?.started ?? null, [start + 10, 0, 5]);
    expect(a?.buffer).toEqual({ duration: 60 });
  });

  it("uses the audio clock as master clock and does not reschedule its own ticks", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine);
    engine.unlock();
    ctx.currentTime = 1;
    engine.update(plan({ playing: false }));
    engine.update(plan({ time: 0 }));
    // Before the scheduled start the image holds.
    expect(engine.clockTime()).toBe(0);
    ctx.currentTime = 1 + SCHEDULE_LEAD + 2.5;
    const t = engine.clockTime();
    expect(t).toBeCloseTo(2.5, 9);
    // The store applies the tick: same time, no new sources.
    engine.update(plan({ time: t ?? 0 }));
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.live).toHaveLength(2);
  });

  it("Spec: seeking restarts the music at the matching offset", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine);
    engine.unlock();
    engine.update(plan({ time: 0 }));
    const first = [...ctx.sources];
    ctx.currentTime = 7;
    engine.update(plan({ time: 4 }));
    expect(first.every((s) => s.stopped)).toBe(true);
    const start = 7 + SCHEDULE_LEAD;
    const [a, b] = ctx.live;
    close(a?.started ?? null, [start, 2 + 4, 6]);
    close(b?.started ?? null, [start + 6, 0, 5]);
    // Seek into the second segment: the first is no longer scheduled.
    engine.update(plan({ time: 12.5 }));
    expect(ctx.live).toHaveLength(1);
    close(ctx.live[0]?.started ?? null, [start, 2.5, 2.5]);
    expect(ctx.live[0]?.buffer).toBeTruthy();
  });

  it("Spec: pause silences immediately, play resumes at the same position", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine);
    engine.unlock();
    engine.update(plan({ time: 0 }));
    ctx.currentTime = SCHEDULE_LEAD + 3;
    const t = engine.clockTime() ?? 0;
    engine.update(plan({ time: t }));
    engine.update(plan({ playing: false, time: t }));
    expect(ctx.live).toHaveLength(0);
    expect(ctx.gains.every((g) => g.disconnected)).toBe(true);
    expect(engine.clockTime()).toBeNull();
    ctx.currentTime = 20;
    engine.update(plan({ playing: true, time: t }));
    close(ctx.live[0]?.started ?? null, [20 + SCHEDULE_LEAD, 2 + 3, 7]);
  });

  it("stop and the end of the movie stop all sources", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine);
    engine.unlock();
    engine.update(plan({ time: 2 }));
    engine.update(plan({ playing: false, time: 0 }));
    expect(ctx.live).toHaveLength(0);
  });

  it("Spec: the transition demo is silent", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine);
    engine.unlock();
    engine.update(plan({ time: 1 }));
    expect(ctx.live).toHaveLength(2);
    engine.update(plan({ playing: false, time: 1, muted: true }));
    expect(ctx.live).toHaveLength(0);
    // Even a playing plan stays silent while muted.
    engine.update(plan({ playing: true, time: 1, muted: true }));
    expect(ctx.live).toHaveLength(0);
    expect(engine.clockTime()).toBeNull();
  });

  it("reschedules when the music track changes during playback", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine);
    engine.unlock();
    engine.update(plan({ time: 1 }));
    const louder = SEGMENTS.map((s) => ({ ...s, gain: 1.5 }));
    engine.update(plan({ time: 1, segments: louder }));
    expect(ctx.sources).toHaveLength(4);
    expect(ctx.live).toHaveLength(2);
    expect(ctx.gains.at(-2)?.events[0]?.[1]).toBe(1.5);
    engine.update(plan({ time: 1, segments: [] }));
    expect(ctx.live).toHaveLength(0);
    expect(engine.clockTime()).toBeNull();
  });

  it("programs fades as linear gain ramps", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine, ["m1"]);
    engine.unlock();
    const faded = [seg({ mediaId: "m1", at: 0, length: 10, gain: 0.5, fadeIn: 1, fadeOut: 1 })];
    engine.update(plan({ time: 0, segments: faded }));
    const w = SCHEDULE_LEAD;
    expect(ctx.gains[0]?.events).toEqual([
      ["set", 0, w],
      ["ramp", 0.5, w + 1],
      ["ramp", 0.5, w + 9],
      ["ramp", 0, w + 10],
    ]);
    // Starting inside the fade-in: begins at the partial level.
    engine.update(plan({ time: 0.5, segments: faded }));
    const events = ctx.gains.at(-1)?.events ?? [];
    expect(events[0]).toEqual(["set", 0.25, w]);
    expect(events[1]?.[1]).toBeCloseTo(0.5, 9);
    expect(events[1]?.[2]).toBeCloseTo(w + 0.5, 9);
  });

  it("multiplies overlapping fades with intermediate ramp points", async () => {
    const { engine, ctx, plan } = setup();
    await loaded(engine, ["m1"]);
    engine.unlock();
    const short = [seg({ mediaId: "m1", at: 0, length: 1, fadeIn: 1, fadeOut: 1 })];
    engine.update(plan({ time: 0, segments: short }));
    const events = ctx.gains[0]?.events ?? [];
    expect(events.length).toBeGreaterThan(4);
    // Middle of the segment: 0.5 · 0.5.
    const mid = events.find(([, , time]) => Math.abs(time - (SCHEDULE_LEAD + 0.5)) < 1e-9);
    expect(mid?.[1]).toBeCloseTo(0.25, 9);
    expect(events.at(-1)?.[1]).toBe(0);
  });

  it("waits for a suspended context and schedules once it runs", async () => {
    const { engine, ctx, plan } = setup({ state: "suspended" });
    await loaded(engine);
    ctx.resume.mockImplementation(async () => {});
    engine.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    engine.update(plan({ time: 0 }));
    expect(ctx.sources).toHaveLength(0);
    expect(engine.clockTime()).toBeNull();
    ctx.currentTime = 4;
    engine.update(plan({ time: 0.5 }));
    ctx.setState("running");
    close(ctx.live[0]?.started ?? null, [4 + SCHEDULE_LEAD, 2.5, 9.5]);
    expect(engine.clockTime()).toBe(0.5);
  });

  it("adds a medium decoded during playback at the current time", async () => {
    const { engine, ctx, plan, finishSlow } = setup();
    engine.preload("m1", "slow:m1");
    engine.unlock();
    engine.update(plan({ time: 0, segments: [SEGMENTS[0] as MusicSegment] }));
    expect(ctx.sources).toHaveLength(0);
    // The audio clock is already the master clock.
    ctx.currentTime = SCHEDULE_LEAD + 1;
    const t = engine.clockTime() ?? 0;
    expect(t).toBeCloseTo(1, 9);
    engine.update(plan({ time: t, segments: [SEGMENTS[0] as MusicSegment] }));
    await finishSlow();
    await engine.whenLoaded();
    close(ctx.live[0]?.started ?? null, [ctx.currentTime + SCHEDULE_LEAD, 3, 9]);
  });

  it("dispose stops the sources and closes the context; unlock creates a new one", async () => {
    const { engine, ctx, createContext, plan } = setup();
    await loaded(engine);
    engine.unlock();
    engine.update(plan({ time: 0 }));
    engine.dispose();
    expect(ctx.live).toHaveLength(0);
    expect(ctx.close).toHaveBeenCalled();
    engine.unlock();
    expect(createContext).toHaveBeenCalledTimes(2);
    expect(engine.debugState().decoded).toEqual(["m1", "m2"]);
  });

  it("stays silent without Web Audio", () => {
    const fetchData = vi.fn(async () => new ArrayBuffer(0));
    const engine = new AudioEngine({ createContext: () => null, decode: null, fetchData });
    engine.preload("m1", "/x.m4a");
    engine.unlock();
    engine.update({ playing: true, time: 0, segments: SEGMENTS, muted: false });
    expect(fetchData).not.toHaveBeenCalled();
    expect(engine.clockTime()).toBeNull();
  });
});
