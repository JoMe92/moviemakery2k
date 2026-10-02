/**
 * Zentraler Zustand der Web-App (design.md D2): Projekt, Medien, Katalog, UI, Wiedergabe.
 * Projektänderungen werden entprellt gespeichert (Autosave, 500 ms).
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import { uploadFailureInfo } from "../i18n/errors";
import { applyDocumentLocale, initialLocale, type Locale, writeStoredLocale } from "../i18n/locale";
import {
  ApiError,
  type ApiErrorInfo,
  type AppApi,
  type ExportApi,
  type Health,
  type MediaItem,
  type Project,
  type Slide,
  type Transition,
} from "../lib/apiClient";
import {
  advance,
  clampTime,
  demoDuration,
  nextSlideTime,
  type Playback,
  prevSlideTime,
  STOPPED,
  startPlayback,
  timelineOf,
} from "../player/controls";
import { slideStartTime } from "../timeline/timeline";
import {
  insertSlide,
  isValidSlideDuration,
  isValidTransitionDuration,
  moveSlide,
  newSlideId,
  removeSlide,
  SLIDE_DURATION,
  updateSlide,
} from "./projectOps";

export const AUTOSAVE_DELAY_MS = 500;

export type BackendState =
  | { kind: "unknown" }
  | { kind: "ok"; health: Health }
  | { kind: "offline" };
export type SaveState = "idle" | "saving" | "saved" | "error";
export type CollectionId = "media" | "transitions";
export type Selection = { kind: "slide"; slideId: string } | null;

export interface UploadEntry {
  key: string;
  filename: string;
  status: "pending" | "uploading" | "done" | "error";
  /** Why the upload failed; translated by the UI (localization design.md D5). */
  failure?: ApiErrorInfo;
  /** Upload failed because the backend was unreachable (text comes from the catalog). */
  offline?: boolean;
}

export interface AppState {
  backend: BackendState;
  loaded: boolean;
  media: MediaItem[];
  catalog: Transition[];
  slides: Slide[];
  saveState: SaveState;
  collection: CollectionId;
  selection: Selection;
  /** ausgewählter Übergang in der Sammlung (Demo im Monitor) */
  previewTransitionId: string | null;
  uploads: UploadEntry[];
  /** Wiedergabe der Diashow im Monitor. */
  playback: Playback;
  /** Übergangsdemo im Monitor (nur zusammen mit previewTransitionId). */
  demo: Playback | null;
  /** Zähler: jede Erhöhung öffnet den Dateidialog „Bilder importieren“ (Aufgabe, Datei-Menü). */
  importRequest: number;
  /** Assistent „Film speichern“ geöffnet (design.md D6). */
  exportWizardOpen: boolean;
  /** Export-Schnittstelle für den Assistenten (gleiche API wie der Store). */
  exportApi: ExportApi;
  /** UI language (localization design.md D2). */
  locale: Locale;

  init(): Promise<void>;
  /** Switches the UI language at once, persists it and updates `<html lang>`. */
  setLocale(locale: Locale): void;
  setCollection(collection: CollectionId): void;
  select(selection: Selection): void;
  /** Kachel im Katalog auswählen: startet die Übergangsdemo im Monitor (null beendet sie). */
  setPreviewTransition(id: string | null): void;

  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Anhalten und an den Anfang springen. */
  stop(): void;
  seek(time: number): void;
  nextSlide(): void;
  prevSlide(): void;
  /** Uhrschritt in Sekunden (rAF-Uhr). */
  tick(dt: number): void;

  /** Dateidialog „Bilder importieren“ anfordern (wird von der Sammlung geöffnet). */
  requestImport(): void;
  importFiles(files: readonly File[]): Promise<void>;
  /** Assistent „Film speichern“ öffnen; bei leerem Bildstreifen ohne Wirkung. */
  openExportWizard(): void;
  closeExportWizard(): void;
  clearUploads(): void;
  deleteMedia(id: string): Promise<void>;

  addSlide(mediaId: string, index?: number): void;
  moveSlide(from: number, to: number): void;
  removeSlide(slideId: string): void;
  setSlideDuration(slideId: string, duration: number): boolean;
  setTransition(slideId: string, transitionId: string): void;
  setTransitionDuration(slideId: string, duration: number): boolean;
  removeTransition(slideId: string): void;
  newProject(): void;

  /** Autosave sofort ausführen (Tests, Seitenwechsel). */
  flushSave(): Promise<void>;
}

export type AppStore = StoreApi<AppState>;

export interface AppStoreOptions {
  /** Initial UI language; defaults to stored setting → browser → `en`. */
  locale?: Locale;
}

export function createAppStore(api: AppApi, options: AppStoreOptions = {}): AppStore {
  const locale = options.locale ?? initialLocale();
  applyDocumentLocale(locale);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> | null = null;
  let dirty = false;

  const store = createStore<AppState>()((set, get) => {
    const toProject = (): Project => ({ schemaVersion: 1, slides: get().slides });

    async function save(): Promise<void> {
      if (saving) {
        await saving;
      }
      if (!dirty) return;
      dirty = false;
      set({ saveState: "saving" });
      saving = api
        .putProject(toProject())
        .then(() => {
          set({ saveState: dirty ? "saving" : "saved" });
        })
        .catch(() => {
          // Bei der nächsten Änderung wird erneut gespeichert (Spec app-shell „Backend fällt aus“).
          dirty = true;
          set({ saveState: "error" });
        })
        .finally(() => {
          saving = null;
        });
      await saving;
    }

    function scheduleSave(): void {
      dirty = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void save().then(() => {
          // Änderungen während des Speicherns: erneut entprellt speichern.
          if (dirty && get().saveState !== "error") scheduleSave();
        });
      }, AUTOSAVE_DELAY_MS);
    }

    /** Wiedergabezeit an eine geänderte Diashow anpassen (Spec „Synchronität“). */
    function playbackFor(slides: readonly Slide[]): Playback {
      const { playback } = get();
      const duration = timelineOf(slides).duration;
      if (duration <= 0) return STOPPED;
      return { playing: playback.playing, time: clampTime(playback.time, duration) };
    }

    function commit(slides: Slide[]): void {
      const { selection } = get();
      const stillThere = selection && slides.some((s) => s.id === selection.slideId);
      set({ slides, selection: stillThere ? selection : null, playback: playbackFor(slides) });
      scheduleSave();
    }

    const duration = () => timelineOf(get().slides).duration;
    const noDemo = { previewTransitionId: null, demo: null } as const;

    function defaultTransitionDuration(transitionId: string): number {
      return get().catalog.find((t) => t.id === transitionId)?.defaultDuration ?? 1.25;
    }

    return {
      backend: { kind: "unknown" },
      loaded: false,
      media: [],
      catalog: [],
      slides: [],
      saveState: "idle",
      collection: "media",
      selection: null,
      previewTransitionId: null,
      playback: STOPPED,
      demo: null,
      uploads: [],
      importRequest: 0,
      exportWizardOpen: false,
      locale,
      setLocale(next) {
        writeStoredLocale(next);
        applyDocumentLocale(next);
        set({ locale: next });
      },
      exportApi: {
        startExport: (request) => api.startExport(request),
        getExport: (id) => api.getExport(id),
        cancelExport: (id) => api.cancelExport(id),
        exportFileUrl: (id) => api.exportFileUrl(id),
      },

      async init() {
        try {
          const [health, catalog, media, project] = await Promise.all([
            api.health(),
            api.catalog(),
            api.listMedia(),
            api.getProject(),
          ]);
          set({
            backend: { kind: "ok", health },
            catalog,
            media,
            slides: project.slides,
            saveState: "saved",
            loaded: true,
          });
        } catch {
          set({ backend: { kind: "offline" }, loaded: true });
        }
      },

      setCollection(collection) {
        set(collection === "media" ? { collection, ...noDemo } : { collection });
      },
      select(selection) {
        // Bei angehaltener Wiedergabe zeigt der Monitor das ausgewählte Bild.
        const { playback, slides } = get();
        const index = selection ? slides.findIndex((s) => s.id === selection.slideId) : -1;
        if (index >= 0 && !playback.playing) {
          set({
            selection,
            ...noDemo,
            playback: { playing: false, time: slideStartTime(timelineOf(slides), index) },
          });
        } else {
          set({ selection });
        }
      },
      setPreviewTransition(id) {
        if (id === null) {
          set(noDemo);
          return;
        }
        const { playback } = get();
        set({
          previewTransitionId: id,
          demo: { playing: true, time: 0 },
          playback: { ...playback, playing: false },
        });
      },

      play() {
        set({ ...noDemo, playback: startPlayback(get().playback, duration()) });
      },
      pause() {
        set({ playback: { ...get().playback, playing: false } });
      },
      togglePlay() {
        const { playback, demo } = get();
        if (playback.playing && !demo) get().pause();
        else get().play();
      },
      stop() {
        set({ ...noDemo, playback: STOPPED });
      },
      seek(time) {
        set({ ...noDemo, playback: { ...get().playback, time: clampTime(time, duration()) } });
      },
      nextSlide() {
        const { playback, slides } = get();
        const time = nextSlideTime(timelineOf(slides), playback.time);
        // Am Ende hält die Wiedergabe an (wie beim normalen Ablauf).
        const playing = playback.playing && time < duration();
        set({ ...noDemo, playback: { playing, time } });
      },
      prevSlide() {
        const { playback, slides } = get();
        set({
          ...noDemo,
          playback: { ...playback, time: prevSlideTime(timelineOf(slides), playback.time) },
        });
      },
      tick(dt) {
        const { demo, playback, previewTransitionId, catalog } = get();
        if (demo && previewTransitionId) {
          if (!demo.playing) return;
          const t = catalog.find((c) => c.id === previewTransitionId)?.defaultDuration ?? 1.25;
          set({ demo: advance(demo, dt, demoDuration(t)) });
          return;
        }
        if (playback.playing) set({ playback: advance(playback, dt, duration()) });
      },

      requestImport() {
        set({ importRequest: get().importRequest + 1 });
      },

      async importFiles(files) {
        const entries: UploadEntry[] = files.map((f, i) => ({
          key: `${Date.now()}-${i}-${f.name}`,
          filename: f.name,
          status: "pending",
        }));
        set({ uploads: [...get().uploads, ...entries] });
        const patch = (key: string, p: Partial<UploadEntry>) =>
          set({ uploads: get().uploads.map((u) => (u.key === key ? { ...u, ...p } : u)) });
        // Sequenziell: große Fotos blockieren sonst den Upload (design.md Risiken).
        for (const [i, file] of files.entries()) {
          const entry = entries[i] as UploadEntry;
          patch(entry.key, { status: "uploading" });
          try {
            const result = await api.uploadMedia(file);
            if (result.ok) {
              set({ media: [...get().media, result.item] });
              patch(entry.key, { status: "done" });
            } else {
              patch(entry.key, { status: "error", failure: uploadFailureInfo(result) });
            }
          } catch (error) {
            if (error instanceof ApiError) {
              const failure = error.info ?? { code: null, params: {}, message: error.message };
              patch(entry.key, { status: "error", failure });
            } else {
              patch(entry.key, { status: "error", offline: true });
            }
          }
        }
      },

      openExportWizard() {
        if (get().slides.length === 0) return;
        set({ exportWizardOpen: true });
      },
      closeExportWizard() {
        set({ exportWizardOpen: false });
      },

      clearUploads() {
        set({
          uploads: get().uploads.filter((u) => u.status === "pending" || u.status === "uploading"),
        });
      },

      async deleteMedia(id) {
        // Lokale Änderungen zuerst speichern, damit die Kaskade auf dem aktuellen Stand läuft.
        await get().flushSave();
        const project = await api.deleteMedia(id);
        const { selection } = get();
        const stillThere = selection && project.slides.some((s) => s.id === selection.slideId);
        set({
          media: get().media.filter((m) => m.id !== id),
          slides: project.slides,
          selection: stillThere ? selection : null,
          playback: playbackFor(project.slides),
        });
      },

      addSlide(mediaId, index) {
        const slide: Slide = {
          id: newSlideId(),
          mediaId,
          duration: SLIDE_DURATION.default,
          transitionIn: null,
        };
        const { slides } = get();
        commit(insertSlide(slides, slide, index ?? slides.length));
      },
      moveSlide(from, to) {
        commit(moveSlide(get().slides, from, to));
      },
      removeSlide(slideId) {
        commit(removeSlide(get().slides, slideId));
      },
      setSlideDuration(slideId, duration) {
        if (!isValidSlideDuration(duration)) return false;
        commit(updateSlide(get().slides, slideId, (s) => ({ ...s, duration })));
        return true;
      },
      setTransition(slideId, transitionId) {
        const { slides } = get();
        if (slides[0]?.id === slideId) return;
        commit(
          updateSlide(slides, slideId, (s) => ({
            ...s,
            transitionIn: { transitionId, duration: defaultTransitionDuration(transitionId) },
          })),
        );
      },
      setTransitionDuration(slideId, duration) {
        if (!isValidTransitionDuration(duration)) return false;
        commit(
          updateSlide(get().slides, slideId, (s) =>
            s.transitionIn ? { ...s, transitionIn: { ...s.transitionIn, duration } } : s,
          ),
        );
        return true;
      },
      removeTransition(slideId) {
        commit(updateSlide(get().slides, slideId, (s) => ({ ...s, transitionIn: null })));
      },
      newProject() {
        commit([]);
      },

      async flushSave() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        await save();
      },
    };
  });
  return store;
}
