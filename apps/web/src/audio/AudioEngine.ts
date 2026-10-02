/**
 * Music in the preview (add-music-track design.md D5, spec preview-player
 * "Musik in der Wiedergabe").
 *
 * Web Audio playback of the music schedule (`timeline/music.ts`): one
 * `AudioBufferSourceNode` → `GainNode` per segment, linear gain ramps for the
 * fades. Buffers are fetched and decoded per medium once and cached. Every
 * change of the plan (play, pause, stop, seek, project or music change, demo)
 * stops all sources and schedules again from the current time.
 *
 * While music is scheduled and the AudioContext runs, `clockTime()` returns
 * the movie time derived from `AudioContext.currentTime`; the player uses it
 * as the master clock so that image and sound cannot drift apart. Otherwise
 * it returns `null` and the player keeps its rAF clock.
 *
 * The AudioContext is only created/resumed in `unlock()`, which the player
 * calls inside the user gesture (play button, space bar). Everything Web Audio
 * is injected (`AudioEngineDeps`) so tests can use a fake context.
 */
import type { MusicSegment } from "../timeline/music";

export interface AudioBufferLike {
  readonly duration: number;
}

export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

export interface GainNodeLike {
  readonly gain: AudioParamLike;
  connect(destination: never): unknown;
  disconnect(): void;
}

export interface SourceNodeLike {
  buffer: AudioBufferLike | null;
  connect(destination: never): unknown;
  disconnect(): void;
  start(when: number, offset: number, duration: number): void;
  stop(): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  onstatechange: ((this: never, ev: Event) => unknown) | null;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createBufferSource(): SourceNodeLike;
}

export interface AudioEngineDeps {
  /** Creates the AudioContext; `null` = no Web Audio (the engine stays silent). */
  createContext(): AudioContextLike | null;
  /** Decodes a fetched file; `null` = no Web Audio (nothing is fetched). */
  decode: ((data: ArrayBuffer) => Promise<AudioBufferLike>) | null;
  fetchData(url: string): Promise<ArrayBuffer>;
}

/** What the engine should play, derived from the store. */
export interface MusicPlan {
  playing: boolean;
  /** Movie time (s) of the store playback. */
  time: number;
  segments: readonly MusicSegment[];
  /** Silent (transition demo). */
  muted: boolean;
}

export interface AudioDebugState {
  context: string | null;
  master: boolean;
  sources: number;
  decoded: string[];
}

/** Scheduling lead so the first samples are not started in the past. */
export const SCHEDULE_LEAD = 0.05;
/** A store time differing from the last reported clock time by more is a seek. */
const SEEK_TOLERANCE = 1e-6;
/** Extra ramp points where fade-in and fade-out overlap (their product is not linear). */
const OVERLAP_STEPS = 8;

const IDLE: MusicPlan = { playing: false, time: 0, segments: [], muted: false };

function browserDeps(): AudioEngineDeps {
  const hasContext = typeof AudioContext !== "undefined";
  const hasOffline = typeof OfflineAudioContext !== "undefined";
  return {
    createContext: () => (hasContext ? (new AudioContext() as unknown as AudioContextLike) : null),
    // Decoding in an OfflineAudioContext needs no user gesture, so buffers are
    // ready before the first play (preview.m4a is 48 kHz stereo).
    decode:
      hasContext && hasOffline
        ? (data) => new OfflineAudioContext(2, 1, 48000).decodeAudioData(data)
        : null,
    fetchData: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    },
  };
}

interface CacheEntry {
  url: string;
  promise: Promise<void>;
  buffer: AudioBufferLike | null;
}

interface Voice {
  source: SourceNodeLike;
  gain: GainNodeLike;
}

/** Gain of a segment at `x` seconds into the segment (fades multiply). */
export function segmentGain(seg: MusicSegment, x: number): number {
  const fadeIn = seg.fadeIn > 0 ? Math.min(1, Math.max(0, x / seg.fadeIn)) : 1;
  const fadeOut = seg.fadeOut > 0 ? Math.min(1, Math.max(0, (seg.length - x) / seg.fadeOut)) : 1;
  return seg.gain * fadeIn * fadeOut;
}

/** Envelope breakpoints (seconds into the segment) after `offset`. */
function rampPoints(seg: MusicSegment, offset: number): number[] {
  const points = new Set<number>();
  if (seg.fadeIn > 0) points.add(seg.fadeIn);
  if (seg.fadeOut > 0) {
    const from = seg.length - seg.fadeOut;
    points.add(from);
    points.add(seg.length);
    if (seg.fadeIn > from) {
      for (let i = 1; i < OVERLAP_STEPS; i++) {
        points.add(from + ((seg.fadeIn - from) * i) / OVERLAP_STEPS);
      }
    }
  }
  return [...points].filter((x) => x > offset && x <= seg.length).sort((a, b) => a - b);
}

function segmentsKey(segments: readonly MusicSegment[]): string {
  return JSON.stringify(segments);
}

export class AudioEngine {
  private readonly deps: AudioEngineDeps;
  private ctx: AudioContextLike | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private voices: Voice[] = [];
  private plan: MusicPlan = IDLE;
  private planKey = segmentsKey([]);
  private anchor: { ctxTime: number; movieTime: number } | null = null;
  private lastReported: number | null = null;

  constructor(deps: AudioEngineDeps = browserDeps()) {
    this.deps = deps;
  }

  /** Create or resume the AudioContext. Call only inside a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const ctx = this.deps.createContext();
      if (!ctx) return;
      this.ctx = ctx;
      ctx.onstatechange = () => this.reschedule();
      // A context created in the gesture may already run.
      this.reschedule();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {
        // Not allowed (no gesture): the player keeps its own clock.
      });
    }
  }

  /** Fetch and decode a medium once (when added to the music track or on load). */
  preload(mediaId: string, url: string): void {
    const decode = this.deps.decode;
    if (!decode) return;
    if (this.cache.get(mediaId)?.url === url) return;
    const entry: CacheEntry = {
      url,
      buffer: null,
      promise: Promise.resolve(),
    };
    entry.promise = this.deps
      .fetchData(url)
      .then(decode)
      .then(
        (buffer) => {
          if (this.cache.get(mediaId) !== entry) return;
          entry.buffer = buffer;
          if (this.anchor && this.plan.segments.some((s) => s.mediaId === mediaId)) {
            this.reschedule();
          }
        },
        () => {
          // Not decodable: this medium stays silent in the preview.
        },
      );
    this.cache.set(mediaId, entry);
  }

  /** Resolves once all started decodes have finished (tests, e2e). */
  async whenLoaded(): Promise<void> {
    await Promise.all([...this.cache.values()].map((e) => e.promise));
  }

  /** Apply the current store state; reschedules only on a relevant change. */
  update(plan: MusicPlan): void {
    const key = segmentsKey(plan.segments);
    const seeked =
      plan.playing &&
      this.anchor !== null &&
      (this.lastReported === null || Math.abs(plan.time - this.lastReported) > SEEK_TOLERANCE);
    const changed =
      plan.playing !== this.plan.playing ||
      plan.muted !== this.plan.muted ||
      key !== this.planKey ||
      seeked;
    this.plan = plan;
    this.planKey = key;
    if (changed) this.reschedule();
  }

  /**
   * Movie time from the audio clock while music is scheduled and the context
   * runs (master clock); otherwise `null`.
   */
  clockTime(): number | null {
    const ctx = this.ctx;
    if (!this.anchor || !ctx || ctx.state !== "running") return null;
    const time = this.anchor.movieTime + Math.max(0, ctx.currentTime - this.anchor.ctxTime);
    this.lastReported = time;
    return time;
  }

  debugState(): AudioDebugState {
    return {
      context: this.ctx?.state ?? null,
      master: this.anchor !== null,
      sources: this.voices.length,
      decoded: [...this.cache].filter(([, e]) => e.buffer !== null).map(([id]) => id),
    };
  }

  /** Stop everything and close the context; the decoded buffers stay cached. */
  dispose(): void {
    this.plan = IDLE;
    this.planKey = segmentsKey([]);
    this.stopAll();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      ctx.onstatechange = null;
      ctx.close().catch(() => {});
    }
  }

  private stopAll(): void {
    for (const { source, gain } of this.voices) {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
      source.disconnect();
      gain.disconnect();
    }
    this.voices = [];
    this.anchor = null;
    this.lastReported = null;
  }

  private reschedule(): void {
    this.stopAll();
    const ctx = this.ctx;
    const { playing, muted, segments, time } = this.plan;
    if (!ctx || ctx.state !== "running" || !playing || muted || segments.length === 0) return;
    const start = ctx.currentTime + SCHEDULE_LEAD;
    this.anchor = { ctxTime: start, movieTime: time };
    this.lastReported = time;
    for (const seg of segments) {
      if (seg.at + seg.length <= time) continue;
      const buffer = this.cache.get(seg.mediaId)?.buffer;
      if (!buffer) continue;
      const offset = Math.max(0, time - seg.at);
      const when = start + Math.max(0, seg.at - time);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(segmentGain(seg, offset), when);
      for (const x of rampPoints(seg, offset)) {
        gain.gain.linearRampToValueAtTime(segmentGain(seg, x), when + (x - offset));
      }
      gain.connect(ctx.destination as never);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain as never);
      source.start(when, seg.sourceIn + offset, seg.length - offset);
      this.voices.push({ source, gain });
    }
  }
}
