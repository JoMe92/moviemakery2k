import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/apiClient";
import { AUTOSAVE_DELAY_MS, createAppStore } from "./appStore";
import { mediaItem, mockApi } from "./testApi";

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
    expect(store.getState().slides[0]?.duration).toBe(2.5);
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
    expect(st().slides.every((x) => x.duration === 5)).toBe(true);
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
    expect(st().slides[1]?.duration).toBe(5);

    st().removeTransition(second);
    expect(tIn()).toBeNull();
  });

  describe("playback", () => {
    async function threeSlides() {
      const store = createAppStore(
        mockApi({
          getProject: vi.fn(async () => ({
            schemaVersion: 1 as const,
            slides: [
              { id: "s1", mediaId: "a", duration: 5, transitionIn: null },
              {
                id: "s2",
                mediaId: "b",
                duration: 5,
                transitionIn: { transitionId: "fade", duration: 1.25 },
              },
              {
                id: "s3",
                mediaId: "a",
                duration: 5,
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
