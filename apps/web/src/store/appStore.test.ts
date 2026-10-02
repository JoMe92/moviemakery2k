import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, createAppStore } from "./appStore";
import { mediaItem, mockApi } from "./testApi";

describe("appStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lädt Health, Katalog, Medien und Projekt beim Start", async () => {
    const api = mockApi();
    const store = createAppStore(api);
    await store.getState().init();
    const st = store.getState();
    expect(st.backend.kind).toBe("ok");
    expect(st.media.map((m) => m.id)).toEqual(["a", "b"]);
    expect(st.catalog).toHaveLength(2);
    expect(st.saveState).toBe("saved");
  });

  it("meldet ein nicht erreichbares Backend", async () => {
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

  it("speichert entprellt: mehrere Änderungen → ein PUT nach 500 ms", async () => {
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

  it("zeigt „Speichern fehlgeschlagen“ und versucht es bei der nächsten Änderung erneut", async () => {
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

  it("kein Übergang am ersten Bild; ungültige Dauern werden abgelehnt", async () => {
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

  it("Import: Teilerfolg wird je Datei gemeldet", async () => {
    const api = mockApi({
      uploadMedia: vi.fn(async (file: File) =>
        file.name === "bad.jpg"
          ? {
              ok: false as const,
              filename: file.name,
              error: "unsupported" as const,
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

  it("Löschen übernimmt das kaskadierte Projekt vom Backend", async () => {
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

  it("Neues Projekt leert nur den Bildstreifen", async () => {
    const store = createAppStore(mockApi());
    await store.getState().init();
    store.getState().addSlide("a");
    store.getState().newProject();
    expect(store.getState().slides).toEqual([]);
    expect(store.getState().media).toHaveLength(2);
  });
  it("Storyboard: Einfügen, Umsortieren und Entfernen (Spec slideshow-project) mit Autosave", async () => {
    const api = mockApi();
    const store = createAppStore(api);
    await store.getState().init();
    const st = () => store.getState();
    const media = () => st().slides.map((x) => x.mediaId);

    // Anhängen per Doppelklick: ans Ende mit Standarddauer.
    st().addSlide("a");
    st().addSlide("b");
    expect(st().slides.every((x) => x.duration === 5)).toBe(true);
    // Einfügen zwischen erstem und zweitem Element → Position 2.
    st().addSlide("b", 1);
    expect(media()).toEqual(["a", "b", "b"]);

    const [s1, s2, s3] = st().slides.map((x) => x.id) as [string, string, string];
    st().setTransition(s2, "fade");
    st().setTransition(s3, "circle");
    // Drittes Element an Position 1: sein Übergang entfällt, die anderen behalten ihren.
    st().moveSlide(2, 0);
    expect(st().slides.map((x) => x.id)).toEqual([s3, s1, s2]);
    expect(st().slides[0]?.transitionIn).toBeNull();
    expect(st().slides[1]?.transitionIn).toBeNull();
    expect(st().slides[2]?.transitionIn?.transitionId).toBe("fade");

    // Entfernen des ausgewählten Elements hebt die Auswahl auf.
    st().select({ kind: "slide", slideId: s1 });
    st().removeSlide(s1);
    expect(st().slides.map((x) => x.id)).toEqual([s3, s2]);
    expect(st().selection).toBeNull();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(api.putProject).toHaveBeenCalledTimes(1);
    expect(api.saved.at(-1)?.slides.map((x) => x.id)).toEqual([s3, s2]);
  });

  it("Übergänge: setzen, ersetzen, Dauer ändern, ungültige Dauern ablehnen, entfernen", async () => {
    const store = createAppStore(mockApi());
    await store.getState().init();
    const st = () => store.getState();
    st().addSlide("a");
    st().addSlide("b");
    const second = st().slides[1]?.id ?? "";
    const tIn = () => st().slides[1]?.transitionIn;

    st().setTransition(second, "fade");
    expect(tIn()).toEqual({ transitionId: "fade", duration: 1.25 });
    // Ersetzen übernimmt die Standarddauer des neuen Übergangs.
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

  describe("Wiedergabe", () => {
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

    it("spielt ab, pausiert, hält am Ende an und Stopp springt an den Anfang", async () => {
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

    it("Nächstes/Vorheriges Bild und Suchen mit Begrenzung", async () => {
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

    it("Spec: Auswahl bei gestoppter Wiedergabe springt an die Startzeit des Bildes", async () => {
      const store = await threeSlides();
      const st = () => store.getState();
      st().select({ kind: "slide", slideId: "s3" });
      expect(st().playback).toEqual({ playing: false, time: 8.75 });
      // Während der Wiedergabe ändert die Auswahl die Zeit nicht.
      st().seek(1);
      st().play();
      st().select({ kind: "slide", slideId: "s2" });
      expect(st().playback.time).toBe(1);
      expect(st().playback.playing).toBe(true);
    });

    it("Projektänderung begrenzt die Zeit; leerer Bildstreifen stoppt", async () => {
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

    it("Übergangsdemo: startet beim Auswählen, läuft einmal, endet mit Wiedergabe oder Sammlungswechsel", async () => {
      const store = await threeSlides();
      const st = () => store.getState();
      st().play();
      st().setPreviewTransition("circle");
      expect(st().playback.playing).toBe(false);
      expect(st().demo).toEqual({ playing: true, time: 0 });
      for (let i = 0; i < 200 && st().demo?.playing; i++) st().tick(0.05);
      expect(st().demo).toEqual({ playing: false, time: 2.5 }); // 0,5 + 1,5 (Kreis) + 0,5
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
