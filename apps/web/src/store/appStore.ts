/**
 * Central state of the web app (design.md D2): project, media, catalog, UI, playback.
 * Project changes are saved debounced (autosave, 500 ms).
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
  type MusicClip,
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
  insertMusicClip,
  MUSIC_TRACK_MAX,
  moveMusicClip as moveMusicClipOp,
  newMusicClip,
  removeMusicClip as removeMusicClipOp,
} from "./musicOps";
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
/** `media` is "My Pictures" (images only), `music` is "My Music" (audio only). */
export type CollectionId = "media" | "music" | "transitions";
/**
 * File dialog requested: `any` (File menu: pictures and audio), `pictures`
 * ("Import pictures") or `audio` ("Import audio or music").
 */
export type ImportKind = "any" | "pictures" | "audio";
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
  /** Music track (add-music-track D3); kept and saved with the project. */
  music: MusicClip[];
  saveState: SaveState;
  collection: CollectionId;
  selection: Selection;
  /** Selected clip on the music track (exclusive with `selection`). */
  musicSelection: string | null;
  /** selected transition in the collection (demo in the monitor) */
  previewTransitionId: string | null;
  uploads: UploadEntry[];
  /** Playback of the slideshow in the monitor. */
  playback: Playback;
  /** Transition demo in the monitor (only together with previewTransitionId). */
  demo: Playback | null;
  /** Counter: every increment opens the import file dialog (tasks, File menu). */
  importRequest: number;
  /** Kind of the last requested file dialog (file types it offers). */
  importKind: ImportKind;
  /** "Save Movie" wizard open (design.md D6). */
  exportWizardOpen: boolean;
  /** Export interface for the wizard (same API as the store). */
  exportApi: ExportApi;
  /** UI language (localization design.md D2). */
  locale: Locale;

  init(): Promise<void>;
  /** Switches the UI language at once, persists it and updates `<html lang>`. */
  setLocale(locale: Locale): void;
  setCollection(collection: CollectionId): void;
  select(selection: Selection): void;
  /** Select a tile in the catalog: starts the transition demo in the monitor (null ends it). */
  setPreviewTransition(id: string | null): void;

  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Stop and jump to the start. */
  stop(): void;
  seek(time: number): void;
  nextSlide(): void;
  prevSlide(): void;
  /** Clock step in seconds (rAF clock). */
  tick(dt: number): void;

  /** Request the import file dialog (opened by the collection); default `any`. */
  requestImport(kind?: ImportKind): void;
  importFiles(files: readonly File[]): Promise<void>;
  /** Open the "Save Movie" wizard; no effect with an empty storyboard. */
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

  /** Select a clip on the music track (null clears); ends a picture selection. */
  selectMusicClip(clipId: string | null): void;
  /**
   * Add an audio medium to the music track at `index` (default: end).
   * Pictures and a full track (100 clips) are refused; returns whether it was added.
   */
  addMusicClip(mediaId: string, index?: number): boolean;
  moveMusicClip(from: number, to: number): void;
  removeMusicClip(clipId: string): void;
  newProject(): void;

  /** Run the autosave immediately (tests, page change). */
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
    const toProject = (): Project => ({
      schemaVersion: 2,
      slides: get().slides,
      music: get().music,
    });

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
          // The next change saves again (spec app-shell "Backend fällt aus").
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
          // Changes while saving: save again, debounced.
          if (dirty && get().saveState !== "error") scheduleSave();
        });
      }, AUTOSAVE_DELAY_MS);
    }

    /** Adjust the playback time to a changed slideshow (spec preview-player "Synchronität mit der Bearbeitung"). */
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

    /** Store a changed music track; keeps the music selection if the clip is still there. */
    function commitMusic(music: MusicClip[]): void {
      const { musicSelection } = get();
      const stillThere = musicSelection !== null && music.some((c) => c.id === musicSelection);
      set({ music, musicSelection: stillThere ? musicSelection : null });
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
      music: [],
      saveState: "idle",
      collection: "media",
      selection: null,
      musicSelection: null,
      previewTransitionId: null,
      playback: STOPPED,
      demo: null,
      uploads: [],
      importRequest: 0,
      importKind: "any",
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
            music: project.music,
            saveState: "saved",
            loaded: true,
          });
        } catch {
          set({ backend: { kind: "offline" }, loaded: true });
        }
      },

      setCollection(collection) {
        // Opening (or leaving) a collection never preselects a tile: the
        // monitor keeps showing the project (spec transitions "Übergänge in der Sammlung", design.md D7).
        set({ collection, ...noDemo });
      },
      select(selection) {
        // While playback is stopped, the monitor shows the selected picture.
        // Selecting in the filmstrip always ends a transition demo (design.md D7).
        const { playback, slides } = get();
        const index = selection ? slides.findIndex((s) => s.id === selection.slideId) : -1;
        // One selection at a time: a picture ends the music selection.
        if (selection) set({ musicSelection: null });
        if (index >= 0 && !playback.playing) {
          set({
            selection,
            ...noDemo,
            playback: { playing: false, time: slideStartTime(timelineOf(slides), index) },
          });
        } else {
          set(selection ? { selection, ...noDemo } : { selection });
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
        // At the end, playback stops (as in normal playback).
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

      requestImport(kind = "any") {
        set({ importRequest: get().importRequest + 1, importKind: kind });
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
        // Sequential: large photos would otherwise block the upload (design.md risks).
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
        // Save local changes first so the cascade runs on the current state.
        await get().flushSave();
        const project = await api.deleteMedia(id);
        const { selection } = get();
        const stillThere = selection && project.slides.some((s) => s.id === selection.slideId);
        const { musicSelection } = get();
        const musicStillThere = project.music.some((c) => c.id === musicSelection);
        set({
          media: get().media.filter((m) => m.id !== id),
          slides: project.slides,
          music: project.music,
          selection: stillThere ? selection : null,
          musicSelection: musicStillThere ? musicSelection : null,
          playback: playbackFor(project.slides),
        });
      },

      addSlide(mediaId, index) {
        // Only pictures belong in the filmstrip; audio goes to the music track.
        if (get().media.find((m) => m.id === mediaId)?.kind === "audio") return;
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

      selectMusicClip(clipId) {
        set(
          clipId === null ? { musicSelection: null } : { musicSelection: clipId, selection: null },
        );
      },
      addMusicClip(mediaId, index) {
        // Only audio belongs on the music track (spec music-track "Musikleiste").
        const { media, music } = get();
        if (media.find((m) => m.id === mediaId)?.kind !== "audio") return false;
        if (music.length >= MUSIC_TRACK_MAX) return false;
        commitMusic(insertMusicClip(music, newMusicClip(mediaId), index ?? music.length));
        return true;
      },
      moveMusicClip(from, to) {
        commitMusic(moveMusicClipOp(get().music, from, to));
      },
      removeMusicClip(clipId) {
        commitMusic(removeMusicClipOp(get().music, clipId));
      },

      newProject() {
        set({ music: [], musicSelection: null });
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
