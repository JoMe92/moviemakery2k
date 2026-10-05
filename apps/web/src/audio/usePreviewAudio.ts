/**
 * Connects the store to the `AudioEngine` (add-music-track design.md D5,
 * add-narration-and-audio-levels design.md D1 and D4): decodes every medium a
 * clip refers to as soon as it is there (clip added, project loaded) and hands
 * the engine the current audio plan on each change.
 *
 * Three tracks go into one plan. Music and narration are mixed together first
 * and the video-clip sound second, because the global level `clipAudioBalance`
 * sits exactly between those two sides (D4); the engine itself sees only the
 * resulting flat list of segments.
 *
 * A video element's sound is decoded from its `videoUrl` and scheduled like any
 * other segment, never played through the `<video>` element — that stays muted
 * and is scrubbed by `currentTime` alone, so the preview keeps the single
 * master clock of add-timeline-editing D5. A video without an audio track fails
 * to decode and is simply silent.
 */
import { useEffect, useState } from "react";
import type { MediaItem, MusicClip, NarrationClip, Slide } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
import type { AppState, AppStore } from "../store/appStore";
import {
  type AudioSegment,
  atGain,
  audioBalanceGains,
  narrationSchedule,
  type VideoClipAudioInput,
  videoClipAudioSchedule,
} from "../timeline/audio";
import { musicSchedule } from "../timeline/music";
import { type AudioDebugState, AudioEngine, type AudioPlan } from "./AudioEngine";

declare global {
  interface Window {
    /** Test hook for e2e: state of the preview audio. */
    __mmyAudio?: () => AudioDebugState;
  }
}

/** Durations of the audio media, for the trim arithmetic of both audio tracks. */
function audioDurations(media: readonly MediaItem[]): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const m of media) if (m.kind === "audio") durations[m.id] = m.duration;
  return durations;
}

/**
 * Where the timeline puts each video element, together with its trim — the
 * input of `videoClipAudioSchedule`. `start` includes the incoming transition,
 * so a clip's sound begins exactly when its picture does.
 */
export function videoClipAudioInputs(slides: readonly Slide[]): VideoClipAudioInput[] {
  const placed = timelineOf(slides).slides;
  const inputs: VideoClipAudioInput[] = [];
  slides.forEach((slide, index) => {
    const at = placed[index]?.start;
    if (slide.kind !== "video" || at === undefined) return;
    inputs.push({ mediaId: slide.mediaId, at, trimIn: slide.trimIn, trimOut: slide.trimOut });
  });
  return inputs;
}

/** Music schedule of a project (same placement as the export). */
export function projectSegments(
  music: readonly MusicClip[],
  media: readonly MediaItem[],
  slides: readonly Slide[],
): AudioSegment[] {
  return musicSchedule(music, audioDurations(media), timelineOf(slides).duration);
}

/**
 * Every segment the preview should play, with the global level already applied:
 * music and narration share one gain, the video-clip sound the other (D4).
 */
export function projectAudioSegments(
  state: Pick<AppState, "music" | "narration" | "media" | "slides" | "clipAudioBalance">,
): AudioSegment[] {
  const durations = audioDurations(state.media);
  const movieDuration = timelineOf(state.slides).duration;
  const gains = audioBalanceGains(state.clipAudioBalance);
  return [
    ...atGain(musicSchedule(state.music, durations, movieDuration), gains.musicAndNarration),
    ...atGain(
      narrationSchedule(state.narration, durations, movieDuration),
      gains.musicAndNarration,
    ),
    ...atGain(
      videoClipAudioSchedule(videoClipAudioInputs(state.slides), movieDuration),
      gains.clip,
    ),
  ];
}

type SegmentInputs = [
  readonly MusicClip[],
  readonly NarrationClip[],
  readonly MediaItem[],
  readonly Slide[],
  number,
];

/** Creates a plan builder that recomputes the schedules only when their inputs change. */
export function audioPlanner(): (state: AppState) => AudioPlan {
  let inputs: SegmentInputs | null = null;
  let segments: AudioSegment[] = [];
  return (state) => {
    const next: SegmentInputs = [
      state.music,
      state.narration,
      state.media,
      state.slides,
      state.clipAudioBalance,
    ];
    if (!inputs || next.some((value, i) => value !== inputs?.[i])) {
      inputs = next;
      segments = projectAudioSegments(state);
    }
    return {
      playing: state.playback.playing && state.demo === null,
      time: state.playback.time,
      segments,
      // The transition demo is silent.
      muted: state.demo !== null,
    };
  };
}

/** Decodes every medium the three tracks refer to (audio files and videos). */
function preloadAudio(engine: AudioEngine, state: AppState): void {
  for (const clip of [...state.music, ...state.narration]) {
    const item = state.media.find((m) => m.id === clip.mediaId);
    if (item?.kind === "audio") engine.preload(item.id, item.audioUrl);
  }
  for (const slide of state.slides) {
    if (slide.kind !== "video") continue;
    const item = state.media.find((m) => m.id === slide.mediaId);
    if (item?.kind === "video") engine.preload(item.id, item.videoUrl);
  }
}

/** True while any track has something that could sound (for the gesture unlock). */
function hasAudio(state: AppState): boolean {
  return (
    state.music.length > 0 ||
    state.narration.length > 0 ||
    state.slides.some((s) => s.kind === "video")
  );
}

export function usePreviewAudio(
  store: AppStore,
  createEngine: () => AudioEngine = () => new AudioEngine(),
): AudioEngine {
  const [engine] = useState(createEngine);

  useEffect(() => {
    const plan = audioPlanner();
    let preloaded:
      | [readonly MusicClip[], readonly NarrationClip[], readonly MediaItem[], readonly Slide[]]
      | null = null;
    const sync = (state: AppState) => {
      if (
        !preloaded ||
        preloaded[0] !== state.music ||
        preloaded[1] !== state.narration ||
        preloaded[2] !== state.media ||
        preloaded[3] !== state.slides
      ) {
        preloaded = [state.music, state.narration, state.media, state.slides];
        preloadAudio(engine, state);
      }
      engine.update(plan(state));
    };
    sync(store.getState());
    const unsubscribe = store.subscribe(sync);
    window.__mmyAudio = () => engine.debugState();
    // Any user gesture may create/resume the AudioContext, so playback started
    // elsewhere (menu "Wiedergabe/Pause") is audible too. Capture phase: runs
    // before handlers that start playback. Idempotent; only with sound.
    const onGesture = () => {
      if (hasAudio(store.getState())) engine.unlock();
    };
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    return () => {
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
      unsubscribe();
      engine.dispose();
      delete window.__mmyAudio;
    };
  }, [store, engine]);

  return engine;
}
