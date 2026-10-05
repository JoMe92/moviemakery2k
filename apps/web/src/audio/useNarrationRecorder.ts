/**
 * Narration recording (add-narration-and-audio-levels design.md D3, spec
 * narration-track "Erzählung aufnehmen").
 *
 * `start()` must be called **inside the user gesture** that also starts
 * playback: `getUserMedia` and `AudioEngine.unlock()` both need one, and a
 * recording that began a tick later would sit at the wrong place on the time
 * axis.
 *
 * The start time is `playback.time`, which is the audio clock: while anything
 * is scheduled the player feeds `AudioEngine.clockTime()` straight back into it
 * (`Player.tsx`), so reading the store here is reading that clock — and it
 * keeps this module free of the engine. `usePreviewAudio` unlocks the
 * `AudioContext` on any pointer or key event in the capture phase, so the
 * record click unlocks it before this handler runs (design.md D3).
 *
 * After `stop()` the recording is uploaded like any other audio import (spec
 * media-library, no new media kind) and a narration clip is created at the
 * remembered start time with the full recording as its range. Everything the
 * browser provides is injected (`RecorderDeps`), so the tests drive it without
 * a microphone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppStore } from "../store/appStore";

/** Why a recording could not be made; the UI translates it (design.md D5). */
export type RecorderError = "denied" | "unavailable" | "failed" | "upload";

export interface RecorderState {
  recording: boolean;
  /** Set until the next `start()`; the UI shows it as a readable message. */
  error: RecorderError | null;
}

/** The recorder's own view of a `MediaRecorder`. */
export interface RecorderLike {
  start(): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onstop: (() => void) | null;
}

export interface RecorderDeps {
  /** Microphone stream; rejects when access is denied or there is no device. */
  openMicrophone(): Promise<MediaStreamLike>;
  /** `MediaRecorder` over that stream; null = the browser cannot record. */
  createRecorder(stream: MediaStreamLike): RecorderLike | null;
  /** Wall clock, so a test can make a recording's length predictable. */
  now(): number;
}

export interface MediaStreamLike {
  getTracks(): { stop(): void }[];
}

const MIME_CANDIDATES = [
  // Opus in WebM is what Chromium and Firefox record; Safari gives MP4/AAC.
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];
const EXTENSION: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

/** File name of a recording: readable, unique, and with a matching extension. */
export function recordingFileName(mimeType: string, now: number): string {
  const base = mimeType.split(";", 1)[0] ?? "";
  const extension = EXTENSION[base] ?? "webm";
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-").replace("Z", "");
  return `Erzaehlung-${stamp}.${extension}`;
}

export function browserRecorderDeps(): RecorderDeps {
  return {
    openMicrophone: async () => {
      const devices = navigator.mediaDevices;
      if (!devices?.getUserMedia) throw new Error("no mediaDevices");
      return (await devices.getUserMedia({ audio: true })) as unknown as MediaStreamLike;
    },
    createRecorder: (stream) => {
      if (typeof MediaRecorder === "undefined") return null;
      const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(
        stream as unknown as MediaStream,
        mimeType ? { mimeType } : undefined,
      );
      // `onstop` is this module's name for the native `stop` event.
      const wrapper = recorder as unknown as RecorderLike & { onstop: (() => void) | null };
      recorder.addEventListener("stop", () => wrapper.onstop?.());
      return wrapper;
    },
    now: () => Date.now(),
  };
}

export interface NarrationRecorder extends RecorderState {
  /**
   * Opens the microphone and starts recording. Call inside the click that also
   * starts playback (design.md D3). Resolves once recording runs or failed.
   */
  start(): Promise<void>;
  /** Stops, uploads and creates the clip; resolves when the clip is there. */
  stop(): Promise<void>;
  /** Clears the error message. */
  clearError(): void;
}

/** Drives one recording at a time against `store`. */
export function useNarrationRecorder(
  store: AppStore,
  deps: RecorderDeps = browserRecorderDeps(),
): NarrationRecorder {
  const [state, setState] = useState<RecorderState>({ recording: false, error: null });
  const session = useRef<{
    recorder: RecorderLike;
    stream: MediaStreamLike;
    at: number;
    startedAt: number;
    chunks: Blob[];
    done: Promise<void>;
    finish: () => void;
  } | null>(null);

  const release = useCallback(() => {
    const current = session.current;
    session.current = null;
    if (!current) return;
    for (const track of current.stream.getTracks()) track.stop();
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    if (session.current) return;
    // The position the user is hearing right now, before anything can await.
    const at = store.getState().playback.time;
    let stream: MediaStreamLike;
    try {
      stream = await deps.openMicrophone();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setState({
        recording: false,
        error: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
      });
      return;
    }
    const recorder = deps.createRecorder(stream);
    if (!recorder) {
      for (const track of stream.getTracks()) track.stop();
      setState({ recording: false, error: "unavailable" });
      return;
    }
    let finish = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const current = {
      recorder,
      stream,
      at,
      startedAt: deps.now(),
      chunks: [] as Blob[],
      done,
      finish,
    };
    session.current = current;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) current.chunks.push(event.data);
    };
    recorder.onstop = () => current.finish();
    recorder.onerror = () => {
      setState({ recording: false, error: "failed" });
      current.finish();
    };
    try {
      recorder.start();
    } catch {
      release();
      setState({ recording: false, error: "failed" });
      return;
    }
    setState({ recording: true, error: null });
  }, [deps, release, store]);

  const stop = useCallback(async () => {
    const current = session.current;
    if (!current) return;
    setState({ recording: false, error: null });
    try {
      current.recorder.stop();
    } catch {
      current.finish();
    }
    await current.done;
    const { at, startedAt, chunks } = current;
    release();
    if (chunks.length === 0) {
      setState({ recording: false, error: "failed" });
      return;
    }
    const seconds = Math.max(0, (deps.now() - startedAt) / 1000);
    const type = chunks[0]?.type || "audio/webm";
    const file = new File(chunks, recordingFileName(type, startedAt), { type });
    const before = new Set(store.getState().media.map((m) => m.id));
    await store.getState().importFiles([file]);
    const imported = store.getState().media.find((m) => m.kind === "audio" && !before.has(m.id));
    if (!imported) {
      setState({ recording: false, error: "upload" });
      return;
    }
    // The medium's probed duration is authoritative; the measured length is the
    // fallback while it is still 0 (a container without a duration header).
    const length = imported.kind === "audio" && imported.duration > 0 ? null : seconds;
    const clipId = store.getState().addNarrationClip(imported.id, at, length ?? undefined);
    if (clipId === null) {
      setState({ recording: false, error: "failed" });
      return;
    }
    store.getState().selectNarrationClip(clipId);
    store.getState().reveal({ kind: "narrationClip", clipId });
  }, [deps, release, store]);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { ...state, start, stop, clearError };
}
