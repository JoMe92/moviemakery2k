import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Slide } from "../lib/apiClient";
import { AUTOSAVE_DELAY_MS, createAppStore } from "./appStore";
import { slideDuration } from "./projectOps";
import { audioItem, mediaItem, mockApi } from "./testApi";

describe("appStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads health, catalog, media and project on startup", async () => {
    const api = mockApi();
    const store = createAppStore(api);
    await store.getState().init();
    const st = store.getState();
    expect(st.backend.kind).toBe("ok");
    expect(st.media.map((m) => m.id)).toEqual(["a", "b"]);
    expect(st.catalog).toHaveLength(2);
    expect(st.saveState).toBe("saved");
  });

  it("reports an unreachable backend", async () => {
    const store = createAppStore(
      mockApi({
        health: vi.fn(async () => {
          throw new TypeError("offline");
        }),
      }),
    );
    await store.getState().init();
    expect(store.getState().backend.kind).toBe("offline");
  });

  it("saves debounced: several changes → one PUT after 500 ms", async () => {
    const api = mockApi();
    const store = createAppStore(api);
    await store.getState().init();
    store.getState().addSlide("a");
    store.getState().addSlide("b");
    store.getState().setTransition(store.getState().slides[1]?.id ?? "", "circle");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(api.putProject).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.putProject).toHaveBeenCalledTimes(1);
    const saved = api.saved[0];
    expect(saved?.slides.map((s) => s.mediaId)).toEqual(["a", "b"]);
    expect(saved?.slides[1]?.transitionIn).toEqual({ transitionId: "circle", duration: 1.5 });
    expect(store.getState().saveState).toBe("saved");
  });

  it("shows “Saving failed” and retries on the next change", async () => {
    let fail = true;
    const api = mockApi();
    const put = vi.fn(async (p: Parameters<typeof api.putProject>[0]) => {
      if (fail) throw new TypeError("offline");
      return p;
    });
    api.putProject = put;
    const store = createAppStore(api);
    await store.getState().init();
    store.getState().addSlide("a");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.getState().saveState).toBe("error");
    fail = false;
    store.getState().addSlide("b");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1]?.[0].slides).toHaveLength(2);
    expect(store.getState().saveState).toBe("saved");
  });

  it("no transition on the first picture; invalid durations are rejected", async () => {
    const store = createAppStore(mockApi());
    await store.getState().init();
    store.getState().addSlide("a");
    const first = store.getState().slides[0]?.id ?? "";
    store.getState().setTransition(first, "fade");
    expect(store.getState().slides[0]?.transitionIn).toBeNull();
    expect(store.getState().setSlideDuration(first, 0.1)).toBe(false);
    expect(store.getState().setSlideDuration(first, 2.5)).toBe(true);
    expect(slideDuration(store.getState().slides[0] as Slide)).toBe(2.5);
  });

  it("import: partial success is reported per file", async () => {
    const api = mockApi({
      uploadMedia: vi.fn(async (file: File) =>
        file.name === "bad.jpg"
          ? {
              ok: false as const,
              filename: file.name,
              errorCode: "media.unsupportedType" as const,
              errorParams: {},
              message: "Kein unterstütztes Bild.",
            }
          : {
              ok: true as const,
              filename: file.name,
              item: mediaItem(file.name),
            },
      ),
    });
    const store = createAppStore(api);
    await store.getState().init();
    await store.getState().importFiles([new File(["x"], "ok.jpg"), new File(["x"], "bad.jpg")]);
    const st = store.getState();
    expect(st.media.map((m) => m.id)).toContain("ok.jpg");
    expect(st.uploads.map((u) => [u.filename, u.status])).toEqual([
      ["ok.jpg", "done"],
      ["bad.jpg", "error"],
    ]);
  });

  it("delete adopts the cascaded project from the backend", async () => {
    const api = mockApi();
    const store = createAppStore(api);
    await store.getState().init();
    store.getState().addSlide("a");
    await store.getState().deleteMedia("a");
    expect(api.putProject).toHaveBeenCalledTimes(1);
    expect(api.deleteMedia).toHaveBeenCalledWith("a");
    expect(store.getState().media.map((m) => m.id)).toEqual(["b"]);
    expect(store.getState().slides).toEqual([]);
  });

  it("keeps the music track: loads, saves and adopts the delete cascade (add-music-track D3)", async () => {
    const clip = (id: string, mediaId: string) => ({
      id,
      mediaId,
      trimStart: 0,
      trimEnd: null,
      volume: 1,
      fadeIn: false,
      fadeOut: false,
    });
    const api = mockApi({
      getProject: vi.fn(async () => ({
        schemaVersion: 4 as const,
        slides: [],
        music: [clip("m1", "x"), clip("m2", "y")],
      })),
      deleteMedia: vi.fn(async () => ({
        schemaVersion: 4 as const,
        slides: [],
        music: [clip("m2", "y")],
      })),
    });
    const store = createAppStore(api);
    await store.getState().init();
    expect(store.getState().music.map((c) => c.id)).toEqual(["m1", "m2"]);

    store.getState().addSlide("a");
    await store.getState().flushSave();
    expect(api.saved.at(-1)?.music).toEqual([clip("m1", "x"), clip("m2", "y")]);

    await store.getState().deleteMedia("x");
    expect(store.getState().music.map((c) => c.id)).toEqual(["m2"]);

    store.getState().newProject();
    await store.getState().flushSave();
    expect(store.getState().music).toEqual([]);
    expect(api.saved.at(-1)).toEqual({ schemaVersion: 4, slides: [], music: [] });
  });

  it("a rejected delete (409 media.inUseByExport) keeps media and storyboard", async () => {
    const error = new ApiError("Medium is used by a running export", 409, {
      code: "media.inUseByExport",
      params: { mediaId: "a", exportId: "job-1" },
      message: "Medium is used by a running export",
    });
    const api = mockApi({
      deleteMedia: vi.fn(async () => {
        throw error;
      }),
    });
    const store = createAppStore(api);
    await store.getState().init();
    store.getState().addSlide("a");
    store.getState().addSlide("b");
    const slides = store.getState().slides;
    await expect(store.getState().deleteMedia("a")).rejects.toBe(error);
    expect(store.getState().media.map((m) => m.id)).toEqual(["a", "b"]);
    expect(store.getState().slides).toEqual(slides);
  });

  it("new project only clears the storyboard", async () => {
    const store = createAppStore(mockApi());
    await store.getState().init();
    store.getState().addSlide("a");
    store.getState().newProject();
    expect(store.getState().slides).toEqual([]);
    expect(store.getState().media).toHaveLength(2);
  });
  it("storyboard: insert, reorder and remove (spec slideshow-project) with autosave", async () => {
    const api = mockApi();
    const store = createAppStore(api);
    await store.getState().init();
    const st = () => store.getState();
    const media = () => st().slides.map((x) => x.mediaId);

    // Append by double-click: to the end with the default duration.
    st().addSlide("a");
    st().addSlide("b");
    expect(st().slides.every((x) => slideDuration(x) === 5)).toBe(true);
    // Insert between the first and second item → position 2.
    st().addSlide("b", 1);
    expect(media()).toEqual(["a", "b", "b"]);

    const [s1, s2, s3] = st().slides.map((x) => x.id) as [string, string, string];
    st().setTransition(s2, "fade");
    st().setTransition(s3, "circle");
    // Third item to position 1: its transition is dropped, the others keep theirs.
    st().moveSlide(2, 0);
    expect(st().slides.map((x) => x.id)).toEqual([s3, s1, s2]);
    expect(st().slides[0]?.transitionIn).toBeNull();
    expect(st().slides[1]?.transitionIn).toBeNull();
    expect(st().slides[2]?.transitionIn?.transitionId).toBe("fade");

    // Removing the selected item clears the selection.
    st().select({ kind: "slide", slideId: s1 });
    st().removeSlide(s1);
    expect(st().slides.map((x) => x.id)).toEqual([s3, s2]);
    expect(st().selection).toBeNull();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(api.putProject).toHaveBeenCalledTimes(1);
    expect(api.saved.at(-1)?.slides.map((x) => x.id)).toEqual([s3, s2]);
  });

  it("transitions: set, replace, change duration, reject invalid durations, remove", async () => {
    const store = createAppStore(mockApi());
    await store.getState().init();
    const st = () => store.getState();
    st().addSlide("a");
    st().addSlide("b");
    const second = st().slides[1]?.id ?? "";
    const tIn = () => st().slides[1]?.transitionIn;

    st().setTransition(second, "fade");
    expect(tIn()).toEqual({ transitionId: "fade", duration: 1.25 });
    // Replacing adopts the default duration of the new transition.
    st().setTransition(second, "circle");
    expect(tIn()).toEqual({ transitionId: "circle", duration: 1.5 });

    expect(st().setTransitionDuration(second, 9)).toBe(false);
    expect(st().setTransitionDuration(second, 0.1)).toBe(false);
    expect(tIn()?.duration).toBe(1.5);
    expect(st().setTransitionDuration(second, 2.25)).toBe(true);
    expect(tIn()?.duration).toBe(2.25);

    expect(st().setSlideDuration(second, 0.1)).toBe(false);
    expect(st().setSlideDuration(second, 61)).toBe(false);
    const secondSlide = st().slides[1];
    expect(secondSlide && slideDuration(secondSlide)).toBe(5);

    st().removeTransition(second);
    expect(tIn()).toBeNull();
  });

  describe("history (undo/redo, spec edit-commands)", () => {
    it("undoes and redoes add, reorder, duration and transition changes", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      const st = () => store.getState();

      st().addSlide("a");
      st().addSlide("b");
      const [first, second] = st().slides.map((s) => s.id) as [string, string];
      st().moveSlide(0, 1);
      expect(st().slides.map((s) => s.id)).toEqual([second, first]);
      st().setSlideDuration(first, 2.5);
      st().setTransition(first, "fade");
      st().removeTransition(first);

      // Six steps: add, add, move, duration, set transition, remove transition.
      expect(st().undoStack).toHaveLength(6);
      expect(st().redoStack).toEqual([]);

      st().undo(); // undoes removeTransition
      expect(st().slides.find((s) => s.id === first)?.transitionIn).toEqual({
        transitionId: "fade",
        duration: 1.25,
      });
      st().undo(); // undoes setTransition
      expect(st().slides.find((s) => s.id === first)?.transitionIn).toBeNull();
      st().undo(); // undoes setSlideDuration
      const firstAfterUndo = st().slides.find((s) => s.id === first);
      expect(firstAfterUndo && slideDuration(firstAfterUndo)).toBe(5);
      st().undo(); // undoes moveSlide
      expect(st().slides.map((s) => s.id)).toEqual([first, second]);
      st().undo(); // undoes addSlide("b")
      expect(st().slides.map((s) => s.id)).toEqual([first]);
      st().undo(); // undoes addSlide("a")
      expect(st().slides).toEqual([]);
      expect(st().undoStack).toEqual([]);

      st().redo();
      expect(st().slides.map((s) => s.id)).toEqual([first]);
      for (let i = 0; i < 5; i++) st().redo();
      expect(st().slides.map((s) => s.id)).toEqual([second, first]);
      const firstAfterRedo = st().slides.find((s) => s.id === first);
      expect(firstAfterRedo && slideDuration(firstAfterRedo)).toBe(2.5);
      expect(st().slides.find((s) => s.id === first)?.transitionIn).toBeNull();
      expect(st().redoStack).toEqual([]);
    });

    it("keeps at most 50 undo steps", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      for (let i = 0; i < 55; i++) store.getState().addSlide("a");
      expect(store.getState().undoStack).toHaveLength(50);
      expect(store.getState().slides).toHaveLength(55);
      for (let i = 0; i < 50; i++) store.getState().undo();
      expect(store.getState().slides).toHaveLength(5);
      expect(store.getState().undoStack).toEqual([]);
    });

    it("a new change after undo discards the redo history", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      const st = () => store.getState();
      st().addSlide("a");
      st().addSlide("b");
      st().undo();
      expect(st().redoStack).toHaveLength(1);
      st().addSlide("b", 0);
      expect(st().redoStack).toEqual([]);
      expect(st().slides.map((s) => s.mediaId)).toEqual(["b", "a"]);
    });

    it("Rückgängig/Wiederholen are disabled (empty stacks) until there is history", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      expect(store.getState().undoStack).toEqual([]);
      expect(store.getState().redoStack).toEqual([]);
      store.getState().addSlide("a");
      expect(store.getState().undoStack).toHaveLength(1);
      store.getState().undo();
      expect(store.getState().undoStack).toEqual([]);
      expect(store.getState().redoStack).toHaveLength(1);
      store.getState().redo();
      expect(store.getState().redoStack).toEqual([]);
    });

    it("undo/redo beyond the history does nothing", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      store.getState().undo();
      store.getState().redo();
      expect(store.getState().slides).toEqual([]);
    });

    it("music track changes are undoable and redoable (spec edit-commands)", async () => {
      const api = mockApi({
        listMedia: vi.fn(async () => [mediaItem("a"), audioItem("song", 10)]),
      });
      const store = createAppStore(api);
      await store.getState().init();
      const st = () => store.getState();
      st().addMusicClip("song");
      const clipId = st().music[0]?.id ?? "";
      st().updateMusicClip(clipId, { volume: 0.5 });
      expect(st().music[0]?.volume).toBe(0.5);
      st().undo();
      expect(st().music[0]?.volume).toBe(1);
      st().undo();
      expect(st().music).toEqual([]);
      st().redo();
      expect(st().music).toHaveLength(1);
      st().redo();
      expect(st().music[0]?.volume).toBe(0.5);
    });
  });

  describe("clipboard (cut/copy/paste a picture or a music clip, spec edit-commands)", () => {
    it("copies, then pastes a duplicate right after the original without a transition, selected", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      const st = () => store.getState();
      st().addSlide("a");
      st().addSlide("b");
      const [first, second] = st().slides.map((s) => s.id) as [string, string];
      st().setTransition(second, "fade");
      st().select({ kind: "slide", slideId: first });

      st().copy();
      expect(st().clipboard).toEqual({
        kind: "slide",
        content: { kind: "image", mediaId: "a", duration: 5, effectId: null },
      });
      // The original is still there and still selected.
      expect(st().slides.map((s) => s.id)).toEqual([first, second]);
      expect(st().selection).toEqual({ kind: "slide", slideId: first });

      st().paste();
      const ids = st().slides.map((s) => s.id);
      expect(ids).toHaveLength(3);
      expect(ids[0]).toBe(first);
      expect(ids[2]).toBe(second);
      const pastedId = ids[1] as string;
      expect(st().slides[1]).toMatchObject({ mediaId: "a", duration: 5, transitionIn: null });
      expect(st().selection).toEqual({ kind: "slide", slideId: pastedId });
      // Copy itself did not touch the project; paste is its own, single undo step.
      st().undo();
      expect(st().slides.map((s) => s.id)).toEqual([first, second]);
    });

    it("cuts and pastes a picture: removal and insertion are separate undo steps, cut is one step", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      const st = () => store.getState();
      st().addSlide("a");
      st().addSlide("b");
      const [first, second] = st().slides.map((s) => s.id) as [string, string];
      const stepsBeforeCut = st().undoStack.length;

      st().select({ kind: "slide", slideId: first });
      st().cut();
      expect(st().slides.map((s) => s.id)).toEqual([second]);
      expect(st().selection).toBeNull();
      expect(st().clipboard).toEqual({
        kind: "slide",
        content: { kind: "image", mediaId: "a", duration: 5, effectId: null },
      });
      // Exactly one more undo step for the whole cut (not two for copy+remove).
      expect(st().undoStack.length).toBe(stepsBeforeCut + 1);

      st().select({ kind: "slide", slideId: second });
      st().paste();
      expect(st().slides.map((s) => s.mediaId)).toEqual(["b", "a"]);

      st().undo(); // undoes the paste only
      expect(st().slides.map((s) => s.id)).toEqual([second]);
      st().undo(); // undoes the cut's removal; the original is back
      expect(st().slides.map((s) => s.id)).toEqual([first, second]);
    });

    it("pastes at the end when nothing is selected", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      const st = () => store.getState();
      st().addSlide("a");
      st().select({ kind: "slide", slideId: st().slides[0]?.id ?? "" });
      st().copy();
      st().select(null);
      st().addSlide("b");
      st().paste();
      expect(st().slides.map((s) => s.mediaId)).toEqual(["a", "b", "a"]);
    });

    it("copies, then pastes a music clip, keeping trim, volume and fades, selected", async () => {
      const api = mockApi({
        listMedia: vi.fn(async () => [mediaItem("a"), audioItem("song", 10)]),
      });
      const store = createAppStore(api);
      await store.getState().init();
      const st = () => store.getState();
      st().addMusicClip("song");
      const first = st().music[0]?.id ?? "";
      st().updateMusicClip(first, { volume: 0.5, fadeIn: true, trimStart: 1, trimEnd: 8 });
      st().selectMusicClip(first);

      st().copy();
      expect(st().clipboard).toEqual({
        kind: "musicClip",
        mediaId: "song",
        trimStart: 1,
        trimEnd: 8,
        volume: 0.5,
        fadeIn: true,
        fadeOut: false,
      });
      expect(st().music).toHaveLength(1);

      st().paste();
      expect(st().music).toHaveLength(2);
      expect(st().music[1]).toMatchObject({
        mediaId: "song",
        trimStart: 1,
        trimEnd: 8,
        volume: 0.5,
        fadeIn: true,
        fadeOut: false,
      });
      expect(st().musicSelection).toBe(st().music[1]?.id);
    });

    it("cuts a music clip: one undo step for the whole operation, then pastes it back", async () => {
      const api = mockApi({
        listMedia: vi.fn(async () => [mediaItem("a"), audioItem("song", 10)]),
      });
      const store = createAppStore(api);
      await store.getState().init();
      const st = () => store.getState();
      st().addMusicClip("song");
      const clipId = st().music[0]?.id ?? "";
      const stepsBeforeCut = st().undoStack.length;

      st().selectMusicClip(clipId);
      st().cut();
      expect(st().music).toEqual([]);
      expect(st().musicSelection).toBeNull();
      expect(st().undoStack.length).toBe(stepsBeforeCut + 1);

      st().paste();
      expect(st().music).toHaveLength(1);
      st().undo();
      expect(st().music).toEqual([]);
      st().undo();
      expect(st().music).toHaveLength(1);
    });

    it("copying a music clip after copying a picture replaces the clipboard and retargets paste", async () => {
      const api = mockApi({
        listMedia: vi.fn(async () => [mediaItem("a"), audioItem("song", 10)]),
      });
      const store = createAppStore(api);
      await store.getState().init();
      const st = () => store.getState();
      st().addSlide("a");
      st().addMusicClip("song");
      st().select({ kind: "slide", slideId: st().slides[0]?.id ?? "" });
      st().copy();
      expect(st().clipboard?.kind).toBe("slide");

      st().selectMusicClip(st().music[0]?.id ?? "");
      st().copy();
      expect(st().clipboard?.kind).toBe("musicClip");

      st().paste();
      expect(st().slides).toHaveLength(1); // unchanged: paste targeted the music track
      expect(st().music).toHaveLength(2);
    });

    it("paste does nothing while the clipboard is empty; cut/copy do nothing without a selection", async () => {
      const store = createAppStore(mockApi());
      await store.getState().init();
      const st = () => store.getState();
      st().addSlide("a");
      const before = st().slides;
      st().paste();
      expect(st().slides).toBe(before);
      st().cut();
      st().copy();
      expect(st().slides).toBe(before);
      expect(st().clipboard).toBeNull();
    });
  });

  describe("playback", () => {
    async function threeSlides() {
      const store = createAppStore(
        mockApi({
          getProject: vi.fn(async () => ({
            schemaVersion: 4 as const,
            music: [],
            slides: [
              {
                kind: "image" as const,
                id: "s1",
                mediaId: "a",
                duration: 5,
                effectId: null,
                transitionIn: null,
              },
              {
                kind: "image" as const,
                id: "s2",
                mediaId: "b",
                duration: 5,
                effectId: null,
                transitionIn: { transitionId: "fade", duration: 1.25 },
              },
              {
                kind: "image" as const,
                id: "s3",
                mediaId: "a",
                duration: 5,
                effectId: null,
                transitionIn: { transitionId: "fade", duration: 1.25 },
              },
            ],
          })),
        }),
      );
      await store.getState().init();
      return store;
    }

    it("plays, pauses, stops at the end, and Stop jumps to the start", async () => {
      const store = await threeSlides();
      const st = () => store.getState();
      st().togglePlay();
      expect(st().playback).toEqual({ playing: true, time: 0 });
      st().tick(0.2);
      st().togglePlay();
      expect(st().playback).toEqual({ playing: false, time: 0.2 });
      st().tick(0.2);
      expect(st().playback.time).toBe(0.2);
      st().play();
      for (let i = 0; i < 1000 && st().playback.playing; i++) st().tick(1 / 30);
      expect(st().playback).toEqual({ playing: false, time: 12.5 });
      st().stop();
      expect(st().playback).toEqual({ playing: false, time: 0 });
    });

    it("next/previous picture and seeking with clamping", async () => {
      const store = await threeSlides();
      const st = () => store.getState();
      st().seek(6);
      st().nextSlide();
      expect(st().playback.time).toBe(8.75);
      st().prevSlide();
      expect(st().playback.time).toBe(5);
      st().seek(99);
      expect(st().playback.time).toBe(12.5);
      st().seek(-1);
      expect(st().playback.time).toBe(0);
    });

    it("Spec: selecting while playback is stopped jumps to the start time of the picture", async () => {
      const store = await threeSlides();
      const st = () => store.getState();
      st().select({ kind: "slide", slideId: "s3" });
      expect(st().playback).toEqual({ playing: false, time: 8.75 });
      // During playback, the selection does not change the time.
      st().seek(1);
      st().play();
      st().select({ kind: "slide", slideId: "s2" });
      expect(st().playback.time).toBe(1);
      expect(st().playback.playing).toBe(true);
    });

    it("a project change clamps the time; an empty storyboard stops", async () => {
      const store = await threeSlides();
      const st = () => store.getState();
      st().seek(12);
      st().removeSlide("s3");
      expect(st().playback.time).toBe(8.75);
      st().play();
      st().newProject();
      expect(st().playback).toEqual({ playing: false, time: 0 });
      st().play();
      expect(st().playback.playing).toBe(false);
    });

    it("transition demo: starts on selection, runs once, ends with playback or a collection change", async () => {
      const store = await threeSlides();
      const st = () => store.getState();
      st().play();
      st().setPreviewTransition("circle");
      expect(st().playback.playing).toBe(false);
      expect(st().demo).toEqual({ playing: true, time: 0 });
      for (let i = 0; i < 200 && st().demo?.playing; i++) st().tick(0.05);
      expect(st().demo).toEqual({ playing: false, time: 2.5 }); // 0.5 + 1.5 (circle) + 0.5
      st().play();
      expect(st().demo).toBeNull();
      expect(st().previewTransitionId).toBeNull();
      expect(st().playback.playing).toBe(true);

      st().setPreviewTransition("fade");
      st().setCollection("media");
      expect(st().demo).toBeNull();
    });
  });
});
