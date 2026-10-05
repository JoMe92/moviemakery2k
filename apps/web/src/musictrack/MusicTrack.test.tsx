import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, MusicClip, Project, Slide } from "../lib/apiClient";
import { audioDurations } from "../store/musicOps";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";
import { musicSchedule } from "../timeline/music";
import { MUSIC_PX_PER_SECOND } from "./MusicClipBlock";
import { clearPeaksCache } from "./peaks";

const slide = (id: string, duration = 5): Slide => ({
  kind: "image",
  id,
  mediaId: "a",
  duration,
  effectId: null,
  title: null,
  transitionIn: null,
});

const clip = (id: string, mediaId: string, patch: Partial<MusicClip> = {}): MusicClip => ({
  id,
  mediaId,
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  fadeIn: false,
  fadeOut: false,
  ...patch,
});

const MEDIA: MediaItem[] = [
  mediaItem("a"),
  audioItem("song", 192.4, "song.mp3"),
  audioItem("short", 30, "short.mp3"),
  audioItem("other", 20, "other.mp3"),
];

function setup(project: Partial<Project> = {}, media: MediaItem[] = MEDIA) {
  const api = mockApi({
    listMedia: vi.fn(async () => media),
    getProject: vi.fn(async () => ({
      schemaVersion: 5 as const,
      slides: project.slides ?? [],
      music: project.music ?? [],
    })),
  });
  return { ...renderApp(api), api };
}

async function ready(project: Partial<Project> = {}, media: MediaItem[] = MEDIA) {
  const view = setup(project, media);
  await act(() => view.ready);
  return view;
}

const track = () => screen.getByRole("region", { name: "Audio/Musik" });
const musicList = () => within(track()).getByRole("list", { name: "Musikleiste" });
const blockLabels = () =>
  within(track())
    .queryAllByRole("button", { name: /^Musikstück \d+:/ })
    .map((b) => b.getAttribute("aria-label"));
const block = (n: number) =>
  within(musicList()).getByRole("button", { name: new RegExp(`^Musikstück ${n}:`) });
const collectionTile = (name: string) => screen.getByRole("button", { name });

/*
 * jsdom has no layout: collection tiles, the storyboard strip, the music
 * track and its blocks get fixed rectangles for the dnd-kit sensors.
 */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

let restoreRects: (() => void) | null = null;
beforeEach(() => {
  clearPeaksCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ rate: 50, peaks: [0.2, 0.9, 0.5, 0.1] }))),
  );
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const label = this.getAttribute("aria-label") ?? "";
    const testId = this.getAttribute("data-testid");
    const slideMatch = /^Bild (\d+):/.exec(label);
    if (slideMatch) return rect(20 + (Number(slideMatch[1]) - 1) * 160, 420, 104, 100);
    const clipMatch = /^Musikstück (\d+):/.exec(label);
    if (clipMatch) return rect(100 + (Number(clipMatch[1]) - 1) * 200, 565, 180, 38);
    if (testId === "storyboard-strip") return rect(0, 400, 1200, 150);
    if (testId === "music-strip") return rect(90, 560, 1100, 48);
    // DragOverlay: initially lies over the dragged (focused) tile.
    const isOverlay =
      testId === "drag-overlay" ||
      this.querySelector(":scope > [data-testid='drag-overlay']") !== null;
    const focused = document.activeElement;
    if (isOverlay && focused && focused !== this && focused !== document.body) {
      return focused.getBoundingClientRect();
    }
    const li = this.closest("ul[aria-label='Bilder'] > li, ul[aria-label='Musik'] > li");
    if (li && this.tagName === "BUTTON") {
      const index = Array.from(li.parentElement?.children ?? []).indexOf(li);
      return rect(20 + index * 100, 100, 96, 90);
    }
    return original.call(this);
  };
  restoreRects = () => {
    Element.prototype.getBoundingClientRect = original;
  };
});
afterEach(() => {
  restoreRects?.();
  vi.unstubAllGlobals();
});

/** Short pause so dnd-kit can measure and attach listeners. */
const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));

const pointer = { pointerId: 1, isPrimary: true, button: 0 };

/** Pointer drag from the centre of `source` to the point (x, y). */
async function drag(source: HTMLElement, x: number, y: number) {
  const r = source.getBoundingClientRect();
  const sx = r.left + r.width / 2;
  const sy = r.top + r.height / 2;
  fireEvent.pointerDown(source, { ...pointer, clientX: sx, clientY: sy });
  fireEvent.pointerMove(document, { ...pointer, clientX: sx + 10, clientY: sy + 10 });
  await tick();
  fireEvent.pointerMove(document, { ...pointer, clientX: x, clientY: y });
  await tick();
  fireEvent.pointerUp(document, { ...pointer, clientX: x, clientY: y });
  await tick();
}

describe("Music track", () => {
  it("shows the label and, while empty, a hint that music can be dragged here", async () => {
    await ready();
    expect(track()).toHaveTextContent("Audio/Musik");
    expect(within(track()).getByText("Ziehen Sie Musik aus „Meine Musik“ hierher.")).toBeVisible();
    expect(within(track()).queryByRole("list")).toBeNull();
  });

  it("Spec: Musik hinzufügen – an MP3 dragged onto the empty track shows name, length and waveform and survives a reload", async () => {
    const { store, api } = await ready();
    act(() => store.getState().setCollection("music"));
    await drag(collectionTile("song.mp3, 3:12"), 400, 584);

    expect(store.getState().music).toEqual([clip(expect.any(String), "song")]);
    expect(blockLabels()).toEqual(["Musikstück 1: song.mp3, 3:12"]);
    const first = block(1);
    expect(first).toHaveTextContent("song.mp3");
    expect(first).toHaveTextContent("3:12");
    const wave = within(first).getByTestId("waveform");
    await waitFor(() => expect(Number(wave.getAttribute("data-bars"))).toBeGreaterThan(0));
    expect(fetch).toHaveBeenCalledWith("/api/media/song/peaks");
    expect(within(track()).queryByText("Ziehen Sie Musik aus „Meine Musik“ hierher.")).toBeNull();

    // Autosaved with the project …
    await act(() => store.getState().flushSave());
    const saved = api.saved.at(-1);
    expect(saved?.music.map((c) => c.mediaId)).toEqual(["song"]);

    // … and still there after a reload.
    cleanup();
    await ready({ music: saved?.music ?? [] });
    expect(blockLabels()).toEqual(["Musikstück 1: song.mp3, 3:12"]);
  });

  it("inserts dragged audio at the insertion marker between two clips", async () => {
    const { store } = await ready({ music: [clip("c1", "short"), clip("c2", "other")] });
    act(() => store.getState().setCollection("music"));
    // Right half of block 1 → between clip 1 and clip 2.
    await drag(collectionTile("song.mp3, 3:12"), 250, 584);
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["short", "song", "other"]);
  });

  it("appends audio with a double-click in “My Music”", async () => {
    const user = userEvent.setup();
    const { store } = await ready({ music: [clip("c1", "short")] });
    act(() => store.getState().setCollection("music"));
    await user.dblClick(collectionTile("other.mp3, 0:20"));
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["short", "other"]);
    expect(blockLabels()).toEqual([
      "Musikstück 1: short.mp3, 0:30",
      "Musikstück 2: other.mp3, 0:20",
    ]);
  });

  it("adds audio by keyboard: arrow down to the end of the track, arrow left between clips", async () => {
    const user = userEvent.setup();
    const { store } = await ready({ music: [clip("c1", "short"), clip("c2", "other")] });
    act(() => store.getState().setCollection("music"));
    collectionTile("song.mp3, 3:12").focus();
    await user.keyboard("[Enter]");
    await tick();
    await user.keyboard("[ArrowDown]");
    await tick();
    expect(screen.getAllByTestId("music-insert-marker")).toHaveLength(1);
    await user.keyboard("[ArrowLeft]");
    await tick();
    await user.keyboard("[Space]");
    await tick();
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["short", "song", "other"]);
    expect(screen.queryByTestId("music-insert-marker")).toBeNull();
  });

  it("adds audio by keyboard to the empty track", async () => {
    const user = userEvent.setup();
    const { store } = await ready();
    act(() => store.getState().setCollection("music"));
    collectionTile("song.mp3, 3:12").focus();
    await user.keyboard("[Enter]");
    await tick();
    await user.keyboard("[ArrowDown]");
    await tick();
    await user.keyboard("[Space]");
    await tick();
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["song"]);
  });

  it("Spec: Bild auf die Musikleiste – the track stays unchanged and a hint says only audio fits", async () => {
    const { store, api } = await ready({ music: [clip("c1", "short")] });
    await drag(collectionTile("a.jpg"), 400, 584);
    expect(store.getState().music).toEqual([clip("c1", "short")]);
    expect(store.getState().slides).toEqual([]);
    expect(within(track()).getByRole("status")).toHaveTextContent(
      "Auf der Musikleiste kann nur Audio abgelegt werden.",
    );
    await act(() => store.getState().flushSave());
    expect(api.putProject).not.toHaveBeenCalled();
  });

  it("the storyboard strip refuses audio with a hint", async () => {
    const { store } = await ready({ slides: [slide("s1")] });
    act(() => store.getState().setCollection("music"));
    await drag(collectionTile("song.mp3, 3:12"), 300, 470);
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s1"]);
    expect(store.getState().music).toEqual([]);
    expect(within(track()).getByRole("status")).toHaveTextContent(
      "Audio kann nicht in den Bildstreifen gelegt werden. Ziehen Sie es auf die Musikleiste.",
    );
    // The next drag clears the hint.
    await drag(collectionTile("song.mp3, 3:12"), 400, 584);
    expect(within(track()).getByRole("status")).toBeEmptyDOMElement();
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["song"]);
  });

  it("Spec: Umsortieren – dragging the second clip before the first plays it first and shifts the start times", async () => {
    const slides = Array.from({ length: 20 }, (_, i) => slide(`s${i}`)); // 100 s movie
    const { store } = await ready({ slides, music: [clip("c1", "short"), clip("c2", "other")] });
    const starts = () =>
      musicSchedule(store.getState().music, audioDurations(store.getState().media), 100).map(
        (s) => [s.mediaId, s.at],
      );
    expect(starts()).toEqual([
      ["short", 0],
      ["other", 30],
    ]);

    await drag(block(2), 120, 584);
    expect(store.getState().music.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(blockLabels()).toEqual([
      "Musikstück 1: other.mp3, 0:20",
      "Musikstück 2: short.mp3, 0:30",
    ]);
    expect(starts()).toEqual([
      ["other", 0],
      ["short", 20],
    ]);
  });

  it("reorders by keyboard", async () => {
    const user = userEvent.setup();
    const { store } = await ready({
      music: [clip("c1", "short"), clip("c2", "other"), clip("c3", "song")],
    });
    block(3).focus();
    await user.keyboard("[Enter]");
    await tick();
    await user.keyboard("[ArrowLeft]");
    await tick();
    await user.keyboard("[Space]");
    await tick();
    expect(store.getState().music.map((c) => c.id)).toEqual(["c1", "c3", "c2"]);
  });

  it("block widths are proportional to the played length", async () => {
    await ready({
      music: [
        clip("c1", "short"),
        clip("c2", "other"),
        clip("c3", "song", { trimStart: 10, trimEnd: 70 }),
      ],
    });
    expect(block(1).style.width).toBe(`${30 * MUSIC_PX_PER_SECOND}px`);
    expect(block(2).style.width).toBe(`${20 * MUSIC_PX_PER_SECOND}px`);
    expect(block(3).style.width).toBe(`${60 * MUSIC_PX_PER_SECOND}px`);
    expect(block(3)).toHaveAccessibleName("Musikstück 3: song.mp3, 1:00");
  });

  it("selects by click and removes the selected clip with Delete; the neighbour gets the focus", async () => {
    const user = userEvent.setup();
    const { store } = await ready({
      slides: [slide("s1")],
      music: [clip("c1", "short"), clip("c2", "other")],
    });
    await user.click(block(1));
    expect(block(1)).toHaveAttribute("aria-pressed", "true");
    expect(store.getState().musicSelection).toBe("c1");

    // One selection at a time: a picture ends the music selection and vice versa.
    act(() => store.getState().select({ kind: "slide", slideId: "s1" }));
    expect(store.getState().musicSelection).toBeNull();
    await user.click(block(1));
    expect(store.getState().selection).toBeNull();

    await user.keyboard("{Delete}");
    expect(store.getState().music.map((c) => c.id)).toEqual(["c2"]);
    expect(store.getState().musicSelection).toBe("c2");
    await waitFor(() => expect(block(1)).toHaveFocus());
  });

  it("removes via the context menu (also opened with the keyboard)", async () => {
    const user = userEvent.setup();
    const { store } = await ready({ music: [clip("c1", "short"), clip("c2", "other")] });
    fireEvent.contextMenu(block(2), { clientX: 50, clientY: 50 });
    const menu = screen.getByRole("menu", { name: "Musikstück 2 der Musikleiste" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual(["Entfernen", "Lautstärke…", "Kürzen…"]);
    await user.click(within(menu).getByRole("menuitem", { name: "Entfernen" }));
    expect(store.getState().music.map((c) => c.id)).toEqual(["c1"]);

    block(1).focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    const again = screen.getByRole("menu", { name: "Musikstück 1 der Musikleiste" });
    await user.click(within(again).getByRole("menuitem", { name: "Entfernen" }));
    expect(store.getState().music).toEqual([]);
    expect(within(track()).getByText("Ziehen Sie Musik aus „Meine Musik“ hierher.")).toBeVisible();
  });

  it("Spec: Musik länger als der Film – the track says the music is cut at the end", async () => {
    // 32 pictures × 5 s = 2:40; the music is 3:12.
    const slides = Array.from({ length: 32 }, (_, i) => slide(`s${i}`));
    const { store } = await ready({ slides, music: [clip("c1", "song")] });
    expect(within(track()).getByTestId("music-cut-hint")).toHaveTextContent(
      "Musik 3:12 / Film 2:40 – wird am Ende gekürzt",
    );
    // Music shorter than the movie: no hint.
    act(() => store.getState().removeMusicClip("c1"));
    act(() => {
      store.getState().addMusicClip("short");
    });
    expect(within(track()).queryByTestId("music-cut-hint")).toBeNull();
  });

  it("shows no cut hint without pictures", async () => {
    await ready({ music: [clip("c1", "song")] });
    expect(within(track()).queryByTestId("music-cut-hint")).toBeNull();
  });

  it("English texts", async () => {
    localStorage.setItem("mmy.locale", "en");
    const slides = Array.from({ length: 32 }, (_, i) => slide(`s${i}`));
    await ready({ slides, music: [clip("c1", "song")] });
    const region = screen.getByRole("region", { name: "Audio/Music" });
    expect(within(region).getByRole("list", { name: "Music track" })).toBeInTheDocument();
    expect(
      within(region).getByRole("button", { name: "Music clip 1: song.mp3, 3:12" }),
    ).toBeInTheDocument();
    expect(within(region).getByTestId("music-cut-hint")).toHaveTextContent(
      "Music 3:12 / Movie 2:40 – will be cut at the end",
    );
  });

  it("store: refuses pictures and more than 100 clips", async () => {
    const { store } = await ready();
    let added = true;
    act(() => {
      added = store.getState().addMusicClip("a");
    });
    expect(added).toBe(false);
    act(() => {
      for (let i = 0; i < 100; i += 1) store.getState().addMusicClip("other");
    });
    expect(store.getState().music).toHaveLength(100);
    act(() => {
      added = store.getState().addMusicClip("other");
    });
    expect(added).toBe(false);
    expect(store.getState().music).toHaveLength(100);
  });
});
