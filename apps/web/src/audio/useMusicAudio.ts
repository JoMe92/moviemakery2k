/**
 * Connects the store to the `AudioEngine` (add-music-track design.md D5):
 * decodes every medium on the music track as soon as it is there (clip added,
 * project loaded) and hands the engine the current music plan on each change.
 */
import { useEffect, useState } from "react";
import type { MediaItem, MusicClip, Slide } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
import type { AppState, AppStore } from "../store/appStore";
import { type MusicSegment, musicSchedule } from "../timeline/music";
import { type AudioDebugState, AudioEngine, type MusicPlan } from "./AudioEngine";

declare global {
  interface Window {
    /** Test hook for e2e: state of the preview audio. */
    __mmyAudio?: () => AudioDebugState;
  }
}

/** Music schedule of a project (same placement as the export). */
export function projectSegments(
  music: readonly MusicClip[],
  media: readonly MediaItem[],
  slides: readonly Slide[],
): MusicSegment[] {
  const durations: Record<string, number> = {};
  for (const m of media) if (m.kind === "audio") durations[m.id] = m.duration;
  return musicSchedule(music, durations, timelineOf(slides).duration);
}

/** Creates a plan builder that recomputes the schedule only when its inputs change. */
export function musicPlanner(): (state: AppState) => MusicPlan {
  let inputs: [readonly MusicClip[], readonly MediaItem[], readonly Slide[]] | null = null;
  let segments: MusicSegment[] = [];
  return (state) => {
    if (
      !inputs ||
      inputs[0] !== state.music ||
      inputs[1] !== state.media ||
      inputs[2] !== state.slides
    ) {
      inputs = [state.music, state.media, state.slides];
      segments = projectSegments(state.music, state.media, state.slides);
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

function preloadMusic(engine: AudioEngine, state: AppState): void {
  for (const clip of state.music) {
    const item = state.media.find((m) => m.id === clip.mediaId);
    if (item?.kind === "audio") engine.preload(item.id, item.audioUrl);
  }
}

export function useMusicAudio(
  store: AppStore,
  createEngine: () => AudioEngine = () => new AudioEngine(),
): AudioEngine {
  const [engine] = useState(createEngine);

  useEffect(() => {
    const plan = musicPlanner();
    let preloaded: [readonly MusicClip[], readonly MediaItem[]] | null = null;
    const sync = (state: AppState) => {
      if (!preloaded || preloaded[0] !== state.music || preloaded[1] !== state.media) {
        preloaded = [state.music, state.media];
        preloadMusic(engine, state);
      }
      engine.update(plan(state));
    };
    sync(store.getState());
    const unsubscribe = store.subscribe(sync);
    window.__mmyAudio = () => engine.debugState();
    // Any user gesture may create/resume the AudioContext, so playback started
    // elsewhere (menu "Wiedergabe/Pause") is audible too. Capture phase: runs
    // before handlers that start playback. Idempotent; only with music.
    const onGesture = () => {
      if (store.getState().music.length > 0) engine.unlock();
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
