/**
 * Narration bar and recording (TASK-WEB-068, add-narration-and-audio-levels
 * design.md D2 and D3, spec narration-track).
 *
 * The microphone is injected (`RecorderDeps`), so a "recording" here is a fake
 * `MediaRecorder` handing over one blob. What the tests check is the path from
 * the record button to a narration clip at the right start time, the readable
 * message when access is denied, moving a clip, and that two overlapping clips
 * both stay in the bar.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaStreamLike, RecorderDeps, RecorderLike } from "../audio/useNarrationRecorder";
import type { AudioItem, MediaItem, NarrationClip, Slide } from "../lib/apiClient";
import { createAppStore } from "../store/appStore";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";
import { NarrationTrack } from "./NarrationTrack";

const slides: Slide[] = [
  {
    kind: "image",
    id: "s1",
    mediaId: "a",
    duration: 20,
    effectId: null,
    title: null,
    transitionIn: null,
  },
];

function clip(id: string, at: number, extra: Partial<NarrationClip> = {}): NarrationClip {
  return {
    id,
    mediaId: "rec",
    at,
    trimStart: 0,
    trimEnd: 3,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
    ...extra,
  };
}

/** A `MediaRecorder` that hands over one blob when stopped. */
class FakeRecorder implements RecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onstop: (() => void) | null = null;
  started = false;
  constructor(private readonly blob: Blob) {}
  start() {
    this.started = true;
  }
  stop() {
    this.ondataavailable?.({ data: this.blob });
    this.onstop?.();
  }
}

interface FakeMic {
  deps: RecorderDeps;
  /** Tracks stopped when the session is released. */
  stopped: () => number;
  recorder: () => FakeRecorder | null;
}

function fakeMic(
  options: { deny?: boolean; noRecorder?: boolean; empty?: boolean; name?: string } = {},
): FakeMic {
  let stopped = 0;
  let recorder: FakeRecorder | null = null;
  const stream: MediaStreamLike = {
    getTracks: () => [
      {
        stop() {
          stopped += 1;
        },
      },
    ],
  };
  let now = 1_700_000_000_000;
  const deps: RecorderDeps = {
    openMicrophone: async () => {
      if (options.deny) {
        const error = new Error("denied");
        error.name = options.name ?? "NotAllowedError";
        throw error;
      }
      return stream;
    },
    createRecorder: () => {
      if (options.noRecorder) return null;
      const blob = options.empty
        ? new Blob([], { type: "audio/webm" })
        : new Blob(["x"], { type: "audio/webm" });
      recorder = new FakeRecorder(blob);
      return recorder;
    },
    // Each call moves the clock on by 4 s, so a recording "lasts" 4 s.
    now: () => {
      const value = now;
      now += 4000;
      return value;
    },
  };
  return { deps, stopped: () => stopped, recorder: () => recorder };
}

const RECORDING: AudioItem = audioItem("new-rec", 4.0, "Erzaehlung.webm");

function setup(
  options: { narration?: NarrationClip[]; media?: MediaItem[]; time?: number; mic?: FakeMic } = {},
) {
  const api = mockApi({
    uploadMedia: vi.fn(async () => ({
      ok: true as const,
      filename: RECORDING.filename,
      item: RECORDING,
    })),
  });
  const store = createAppStore(api);
  store.setState({
    slides,
    media: options.media ?? [mediaItem("a"), audioItem("rec", 10)],
    music: [],
    narration: options.narration ?? [],
    clipAudioBalance: 50,
    playback: { playing: false, time: options.time ?? 0 },
  });
  const mic = options.mic ?? fakeMic();
  render(
    <AppStoreContext.Provider value={store}>
      <NarrationTrack recorderDeps={mic.deps} />
    </AppStoreContext.Provider>,
  );
  return { store, api, mic };
}

describe("NarrationTrack: recording (spec narration-track “Erzählung aufnehmen”)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Spec: a recording becomes a clip at the position it started, and a medium", async () => {
    const user = userEvent.setup();
    const { store, api, mic } = setup({ time: 10 });

    await user.click(screen.getByRole("button", { name: "Aufnehmen" }));
    // Playback runs during a recording (design.md D3).
    expect(store.getState().playback.playing).toBe(true);
    const stop = await screen.findByRole("button", { name: "Aufnahme beenden" });
    expect(mic.recorder()?.started).toBe(true);

    await user.click(stop);
    await waitFor(() => expect(store.getState().narration).toHaveLength(1));
    const [created] = store.getState().narration;
    expect(created?.at).toBe(10);
    expect(created?.mediaId).toBe("new-rec");
    // The recording is a normal audio import, so it is in the collection too.
    expect(api.uploadMedia).toHaveBeenCalledTimes(1);
    expect(store.getState().media.some((m) => m.id === "new-rec")).toBe(true);
    // Its length is the whole recording: trimEnd null = end of the file.
    expect(created?.trimStart).toBe(0);
    expect(created?.trimEnd).toBeNull();
    // The new clip is selected and the microphone released.
    expect(store.getState().narrationSelection).toBe(created?.id);
    expect(mic.stopped()).toBe(1);
  });

  it("uses the playback position at the click, not the one when it stops", async () => {
    const user = userEvent.setup();
    const { store } = setup({ time: 6.5 });
    await user.click(screen.getByRole("button", { name: "Aufnehmen" }));
    // Playback moves on while recording.
    act(() => store.getState().seek(12));
    await user.click(await screen.findByRole("button", { name: "Aufnahme beenden" }));
    await waitFor(() => expect(store.getState().narration).toHaveLength(1));
    expect(store.getState().narration[0]?.at).toBe(6.5);
  });

  it("Spec: a denied microphone says so and creates no clip", async () => {
    const user = userEvent.setup();
    const { store } = setup({ mic: fakeMic({ deny: true }) });

    await user.click(screen.getByRole("button", { name: "Aufnehmen" }));

    expect(
      await screen.findByText(
        "Kein Zugriff auf das Mikrofon. Erlauben Sie den Zugriff im Browser und versuchen Sie es erneut.",
      ),
    ).toBeInTheDocument();
    expect(store.getState().narration).toEqual([]);
    // The button is back to "Record", not stuck in "Stop".
    expect(screen.getByRole("button", { name: "Aufnehmen" })).toBeInTheDocument();
  });

  it("says so when no microphone exists at all", async () => {
    const user = userEvent.setup();
    const { store } = setup({ mic: fakeMic({ deny: true, name: "NotFoundError" }) });
    await user.click(screen.getByRole("button", { name: "Aufnehmen" }));
    expect(
      await screen.findByText(
        "Es wurde kein Mikrofon gefunden, das dieser Browser aufnehmen kann.",
      ),
    ).toBeInTheDocument();
    expect(store.getState().narration).toEqual([]);
  });

  it("says so when the browser cannot record and releases the microphone", async () => {
    const user = userEvent.setup();
    const mic = fakeMic({ noRecorder: true });
    const { store } = setup({ mic });
    await user.click(screen.getByRole("button", { name: "Aufnehmen" }));
    expect(
      await screen.findByText(
        "Es wurde kein Mikrofon gefunden, das dieser Browser aufnehmen kann.",
      ),
    ).toBeInTheDocument();
    expect(mic.stopped()).toBe(1);
    expect(store.getState().narration).toEqual([]);
  });

  it("says so when the recording came back empty", async () => {
    const user = userEvent.setup();
    const { store } = setup({ mic: fakeMic({ empty: true }) });
    await user.click(screen.getByRole("button", { name: "Aufnehmen" }));
    await user.click(await screen.findByRole("button", { name: "Aufnahme beenden" }));
    expect(
      await screen.findByText("Die Aufnahme ist fehlgeschlagen. Bitte versuchen Sie es erneut."),
    ).toBeInTheDocument();
    expect(store.getState().narration).toEqual([]);
  });
});

describe("NarrationTrack: the bar (spec narration-track “Erzählungsleiste”)", () => {
  it("shows a clip at its absolute start time", () => {
    setup({ narration: [clip("n1", 5)] });
    const block = screen.getByRole("button", { name: /Erzählungs-Clip 1/ });
    expect(block).toHaveAccessibleName(/ab 0:05/);
    expect(block.closest("li")).toHaveStyle({ left: "15px" });
  });

  it("Spec: overlapping clips both stay in the bar, each at its own place", () => {
    setup({ narration: [clip("n1", 4), clip("n2", 5)] });
    const list = screen.getByRole("list", { name: "Erzählungsleiste" });
    const blocks = within(list).getAllByRole("button", { name: /Erzählungs-Clip/ });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.closest("li")).toHaveStyle({ left: "12px" });
    expect(blocks[1]?.closest("li")).toHaveStyle({ left: "15px" });
    // The second one is not shortened to fit before the first.
    expect(blocks[0]).toHaveStyle({ width: "9px" });
    expect(blocks[1]).toHaveStyle({ width: "9px" });
  });

  it("Spec: moving a clip changes only its own start time", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 10), clip("n2", 2)] });
    const block = screen.getByRole("button", { name: /Erzählungs-Clip 1/ });
    block.focus();

    // Arrow keys move in 0.25 s steps, Shift in 1 s steps.
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(store.getState().narration[0]?.at).toBe(10.5);
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(store.getState().narration[0]?.at).toBe(11.5);
    await user.keyboard("{ArrowLeft}");
    expect(store.getState().narration[0]?.at).toBe(11.25);
    // The other clip has not budged: every clip owns its own `at`.
    expect(store.getState().narration[1]?.at).toBe(2);
  });

  it("Spec: dragging a clip sideways sets a new start time", async () => {
    const { store } = setup({ narration: [clip("n1", 4)] });
    const block = screen.getByRole("button", { name: /Erzählungs-Clip 1/ });
    // jsdom has no layout, so the pointer events carry the coordinates.
    block.setPointerCapture = () => {};
    block.releasePointerCapture = () => {};

    fireEvent.pointerDown(block, { button: 0, pointerId: 1, clientX: 100 });
    // Within the drift tolerance: still a tap, nothing moves.
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 101 });
    expect(store.getState().narration[0]?.at).toBe(4);
    // 30 px at 3 px per second is 10 s later.
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 130 });
    expect(store.getState().narration[0]?.at).toBe(14);
    fireEvent.pointerUp(block, { pointerId: 1 });

    // A drag does not also select on the trailing click.
    fireEvent.pointerDown(block, { button: 0, pointerId: 2, clientX: 130 });
    fireEvent.pointerMove(block, { pointerId: 2, clientX: 70 });
    fireEvent.pointerUp(block, { pointerId: 2 });
    expect(store.getState().narration[0]?.at).toBe(0);
  });

  it("never moves a clip before the start of the movie", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 0.25)] });
    screen.getByRole("button", { name: /Erzählungs-Clip 1/ }).focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(store.getState().narration[0]?.at).toBe(0);
  });

  it("moves a clip to the playback position from the context menu", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 1)], time: 7.5 });
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /Erzählungs-Clip 1/ }),
    });
    await user.click(
      await screen.findByRole("menuitem", { name: "An die Abspielposition verschieben" }),
    );
    expect(store.getState().narration[0]?.at).toBe(7.5);
  });

  it("Spec: removing a clip asks first and keeps the medium in the collection", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 3)] });
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /Erzählungs-Clip 1/ }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Entfernen" }));

    // The clip is still there until the question is answered.
    expect(store.getState().narration).toHaveLength(1);
    expect(screen.getByText(/Die Aufnahme bleibt in der Mediensammlung/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ja" }));

    expect(store.getState().narration).toEqual([]);
    expect(store.getState().media.some((m) => m.id === "rec")).toBe(true);
  });

  it("cancelling the question keeps the clip", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 3)] });
    screen.getByRole("button", { name: /Erzählungs-Clip 1/ }).focus();
    await user.keyboard("{Delete}");
    await user.click(await screen.findByRole("button", { name: "Nein" }));
    expect(store.getState().narration).toHaveLength(1);
  });

  it("changes the volume of a clip through its dialog", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 3)] });
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /Erzählungs-Clip 1/ }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Lautstärke…" }));
    expect(
      screen.getByRole("heading", { name: "Lautstärke von Erzählungs-Clip 1" }),
    ).toBeInTheDocument();
    const field = screen.getByLabelText("Lautstärke (%)");
    await user.clear(field);
    await user.type(field, "150");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(store.getState().narration[0]?.volume).toBe(1.5);
  });

  it("toggles the fades of a clip", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 3)] });
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /Erzählungs-Clip 1/ }),
    });
    const fadeIn = await screen.findByRole("menuitemcheckbox", { name: "Einblenden" });
    expect(fadeIn).toHaveAttribute("aria-checked", "false");
    await user.click(fadeIn);
    expect(store.getState().narration[0]?.fadeIn).toBe(true);
  });

  it("trims a clip within its recording", async () => {
    const user = userEvent.setup();
    const { store } = setup({ narration: [clip("n1", 3, { trimEnd: null })] });
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /Erzählungs-Clip 1/ }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Kürzen…" }));
    expect(screen.getByRole("heading", { name: "Erzählungs-Clip 1 kürzen" })).toBeInTheDocument();
    const start = screen.getByLabelText("Anfang");
    await user.clear(start);
    await user.type(start, "2");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(store.getState().narration[0]?.trimStart).toBe(2);
  });

  it("says what to do while the bar is empty", () => {
    setup();
    expect(
      screen.getByText("Nehmen Sie mit „Aufnehmen“ während der Wiedergabe eine Erzählung auf."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Erzählungsleiste" })).not.toBeInTheDocument();
  });

  it("names a clip whose recording is gone instead of hiding it", () => {
    setup({ narration: [clip("n1", 1)], media: [mediaItem("a")] });
    expect(screen.getByRole("button", { name: /fehlende Audiodatei/ })).toBeInTheDocument();
    // Without a duration there is nothing to trim against.
    expect(screen.getByRole("button", { name: /Erzählungs-Clip 1/ })).toBeInTheDocument();
  });
});
