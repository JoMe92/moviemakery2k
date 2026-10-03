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
  isAuthRequired,
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
import { type FitToMusicResult, fitToMusic } from "../timeline/fitToMusic";
import { musicDuration } from "../timeline/music";
import { slideStartTime } from "../timeline/timeline";
import {
  insertMusicClip,
  isValidMusicTrim,
  isValidMusicVolume,
  MUSIC_TRACK_MAX,
  type MusicClipPatch,
  moveMusicClip as moveMusicClipOp,
  newMusicClip,
  removeMusicClip as removeMusicClipOp,
  updateMusicClip as updateMusicClipOp,
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
  | { kind: "offline" }
  /** LAN mode without a valid access token (add-mobile-delivery design.md D4). */
  | { kind: "unauthorized" };
export type SaveState = "idle" | "saving" | "saved" | "error";
/**
 * `media` is "My Pictures" (images only), `music` is "My Music" (audio only),
 * `video` is "My Videos" (video only, add-video-import D4).
 */
export type CollectionId = "media" | "music" | "video" | "transitions";
/**
 * File dialog requested: `any` (File menu: pictures, video and audio),
 * `pictures` ("Import pictures"), `audio` ("Import audio or music") or
 * `video` ("Import video", add-video-import D4).
 */
export type ImportKind = "any" | "pictures" | "audio" | "video";
export type Selection = { kind: "slide"; slideId: string } | null;

/** Snapshot of the undoable project state (design.md D1): `slides` and `music`. */
export interface HistoryEntry {
  slides: Slide[];
  music: MusicClip[];
}

/** Undo history keeps at most this many steps (spec edit-commands, design.md D1). */
export const UNDO_LIMIT = 50;

/**
 * Internal clipboard (spec edit-commands, design.md D4): at most one element,
 * holding only its content (never an incoming transition, which belongs to
 * the storyboard slot, not the picture). Copying or cutting either kind
 * replaces the previous content regardless of its kind.
 */
export type ClipboardEntry =
  | { kind: "slide"; mediaId: string; duration: number }
  | {
      kind: "musicClip";
      mediaId: string;
      trimStart: number;
      trimEnd: number | null;
      volume: number;
      fadeIn: boolean;
      fadeOut: boolean;
    }
  | null;

/**
 * Request to open an editing dialog or the action menu of an element
 * (add-mobile-layout design.md D6): the action bar and the "⋯" buttons ask,
 * the storyboard strip and the music track open their own dialogs, so both
 * operating models share one editing logic. `seq` makes repeats distinct.
 */
export type EditRequest =
  | { kind: "slideDuration" | "transition" | "slideMenu"; slideId: string; seq: number }
  | { kind: "volume" | "trim" | "musicMenu"; clipId: string; seq: number };

/** An edit request before the store numbers it. */
export type EditRequestInput = EditRequest extends infer R
  ? R extends EditRequest
    ? Omit<R, "seq">
    : never
  : never;

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
  /** Undo history (design.md D1), most recent step last; tab-only, not persisted. */
  undoStack: HistoryEntry[];
  /** Redo history; cleared by any new change after an undo. */
  redoStack: HistoryEntry[];
  /** Internal single-element clipboard (design.md D4); replaced wholesale by cut/copy. */
  clipboard: ClipboardEntry;
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
  /** Collection sheet of the compact layout open (add-mobile-layout design.md D7). */
  collectionSheetOpen: boolean;
  /** Last requested editing dialog or action menu (touch operation), or null. */
  editRequest: EditRequest | null;
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
  /** Open or close the collection sheet (compact layout). */
  setCollectionSheetOpen(open: boolean): void;
  /** Ask the storyboard or music track to open a dialog or action menu. */
  requestEdit(request: EditRequestInput): void;
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
  /**
   * Play the transition before this picture once in the monitor, with a
   * short lead-in and lead-out (transition sheet, add-mobile-layout D9).
   */
  playTransitionOnce(slideId: string): void;
  removeTransition(slideId: string): void;

  /**
   * Edit → Cut/Copy/Paste for the selected picture or music clip (spec
   * edit-commands, design.md D4/D5). No effect without a selection (cut,
   * copy) or an empty clipboard (paste). Paste inserts into the row
   * matching the clipboard's kind — after a selection of that same kind, or
   * at the end — and selects the new element; a pasted picture is a hard
   * cut (no incoming transition). Cut is one undo step for the whole
   * operation.
   */
  cut(): void;
  copy(): void;
  paste(): void;

  /** Select a clip on the music track (null clears); ends a picture selection. */
  selectMusicClip(clipId: string | null): void;
  /**
   * Add an audio medium to the music track at `index` (default: end).
   * Pictures and a full track (100 clips) are refused; returns whether it was added.
   */
  addMusicClip(mediaId: string, index?: number): boolean;
  moveMusicClip(from: number, to: number): void;
  removeMusicClip(clipId: string): void;
  /**
   * Change volume, trim or fades of a music clip (spec music-track
   * "Musikstücke bearbeiten"; autosaved). An invalid volume or trim range
   * (`0 ≤ start < end ≤ file duration`, length ≥ 0.5 s) changes nothing;
   * returns whether the change was applied.
   */
  updateMusicClip(clipId: string, patch: MusicClipPatch): boolean;
  /**
   * Clip → "Fit movie to music" (add-music-track D8): sets all picture
   * durations at once (one change, autosaved). Changes nothing if the music
   * length is unreachable or there are no pictures/music; the result says why.
   */
  fitToMusic(): FitToMusicResult;
  newProject(): void;

  /** Undo the last storyboard/music change (spec edit-commands); no effect if there is none. */
  undo(): void;
  /** Redo the last undone change; no effect if there is none. */
  redo(): void;

  /** Run the autosave immediately (tests, page change). */
  flushSave(): Promise<void>;
}

export type AppStore = StoreApi<AppState>;

/** Lead-in and lead-out (s) around a transition played once. */
export const TRANSITION_LEAD = 0.5;

export interface AppStoreOptions {
  /** Initial UI language; defaults to stored setting → browser → `en`. */
  locale?: Locale;
}

/** Total length of the music track (s) from the clips and the audio durations. */
export function projectMusicDuration(
  music: readonly MusicClip[],
  media: readonly MediaItem[],
): number {
  const durations: Record<string, number> = {};
  for (const m of media) if (m.kind === "audio") durations[m.id] = m.duration;
  return musicDuration(music, durations);
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
        .catch((error: unknown) => {
          // The next change saves again (spec app-shell "Backend fällt aus").
          dirty = true;
          set({ saveState: "error" });
          if (isAuthRequired(error)) set({ backend: { kind: "unauthorized" } });
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

    /**
     * Snapshot the state before a project-changing action (design.md D1): push
     * it on the undo stack (dropping the oldest beyond UNDO_LIMIT) and discard
     * the redo stack.
     */
    function pushHistory(previous: HistoryEntry): void {
      const next = [...get().undoStack, previous];
      if (next.length > UNDO_LIMIT) next.shift();
      set({ undoStack: next, redoStack: [] });
    }

    function commit(slides: Slide[]): void {
      const { selection, music, slides: prevSlides } = get();
      pushHistory({ slides: prevSlides, music });
      const stillThere = selection && slides.some((s) => s.id === selection.slideId);
      set({ slides, selection: stillThere ? selection : null, playback: playbackFor(slides) });
      scheduleSave();
    }

    /** Store a changed music track; keeps the music selection if the clip is still there. */
    function commitMusic(music: MusicClip[]): void {
      const { musicSelection, slides, music: prevMusic } = get();
      pushHistory({ slides, music: prevMusic });
      const stillThere = musicSelection !== null && music.some((c) => c.id === musicSelection);
      set({ music, musicSelection: stillThere ? musicSelection : null });
      scheduleSave();
    }

    /** Jump to a history entry (undo/redo): restores selections if still valid. */
    function restore(entry: HistoryEntry): void {
      const { selection, musicSelection } = get();
      const stillSlide = selection && entry.slides.some((s) => s.id === selection.slideId);
      const stillMusic =
        musicSelection !== null && entry.music.some((c) => c.id === musicSelection);
      set({
        slides: entry.slides,
        music: entry.music,
        selection: stillSlide ? selection : null,
        musicSelection: stillMusic ? musicSelection : null,
        playback: playbackFor(entry.slides),
      });
      scheduleSave();
    }

    const duration = () => timelineOf(get().slides).duration;
    const noDemo = { previewTransitionId: null, demo: null } as const;

    /** Clipboard content copied from a music clip (design.md D4): never its id. */
    function clipboardOf(clip: MusicClip): ClipboardEntry {
      return {
        kind: "musicClip",
        mediaId: clip.mediaId,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        volume: clip.volume,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
      };
    }

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
      undoStack: [],
      redoStack: [],
      clipboard: null,
      previewTransitionId: null,
      playback: STOPPED,
      demo: null,
      uploads: [],
      importRequest: 0,
      importKind: "any",
      editRequest: null,
      collectionSheetOpen: false,
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
        } catch (error) {
          const backend: BackendState = isAuthRequired(error)
            ? { kind: "unauthorized" }
            : { kind: "offline" };
          set({ backend, loaded: true });
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
      setCollectionSheetOpen(open) {
        set({ collectionSheetOpen: open });
      },
      requestEdit(request) {
        const seq = (get().editRequest?.seq ?? 0) + 1;
        set({ editRequest: { ...request, seq } as EditRequest });
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
            if (isAuthRequired(error)) set({ backend: { kind: "unauthorized" } });
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
      playTransitionOnce(slideId) {
        const { slides } = get();
        const timeline = timelineOf(slides);
        const placed = timeline.slides.find((p) => p.slide.id === slideId);
        if (!placed || placed.transitionIn <= 0) return;
        const from = Math.max(0, placed.start - TRANSITION_LEAD);
        const until = Math.min(
          timeline.duration,
          placed.start + placed.transitionIn + TRANSITION_LEAD,
        );
        set({ ...noDemo, playback: { playing: true, time: from, until } });
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

      cut() {
        const { selection, musicSelection, slides, music } = get();
        if (selection) {
          const slide = slides.find((s) => s.id === selection.slideId);
          if (!slide) return;
          set({ clipboard: { kind: "slide", mediaId: slide.mediaId, duration: slide.duration } });
          commit(removeSlide(slides, slide.id));
        } else if (musicSelection !== null) {
          const clip = music.find((c) => c.id === musicSelection);
          if (!clip) return;
          set({ clipboard: clipboardOf(clip) });
          commitMusic(removeMusicClipOp(music, clip.id));
        }
      },
      copy() {
        const { selection, musicSelection, slides, music } = get();
        if (selection) {
          const slide = slides.find((s) => s.id === selection.slideId);
          if (!slide) return;
          set({ clipboard: { kind: "slide", mediaId: slide.mediaId, duration: slide.duration } });
        } else if (musicSelection !== null) {
          const clip = music.find((c) => c.id === musicSelection);
          if (!clip) return;
          set({ clipboard: clipboardOf(clip) });
        }
      },
      paste() {
        const { clipboard } = get();
        if (!clipboard) return;
        if (clipboard.kind === "slide") {
          const { selection, slides } = get();
          const newSlide: Slide = {
            id: newSlideId(),
            mediaId: clipboard.mediaId,
            duration: clipboard.duration,
            transitionIn: null,
          };
          const at = selection
            ? slides.findIndex((s) => s.id === selection.slideId) + 1
            : slides.length;
          commit(insertSlide(slides, newSlide, at));
          get().select({ kind: "slide", slideId: newSlide.id });
        } else {
          const { musicSelection, music } = get();
          if (music.length >= MUSIC_TRACK_MAX) return;
          const newClip: MusicClip = {
            id: newSlideId(),
            mediaId: clipboard.mediaId,
            trimStart: clipboard.trimStart,
            trimEnd: clipboard.trimEnd,
            volume: clipboard.volume,
            fadeIn: clipboard.fadeIn,
            fadeOut: clipboard.fadeOut,
          };
          const at =
            musicSelection !== null
              ? music.findIndex((c) => c.id === musicSelection) + 1
              : music.length;
          commitMusic(insertMusicClip(music, newClip, at));
          get().selectMusicClip(newClip.id);
        }
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
      updateMusicClip(clipId, patch) {
        const { music, media } = get();
        const clip = music.find((c) => c.id === clipId);
        if (!clip) return false;
        const next = { ...clip, ...patch };
        if (!isValidMusicVolume(next.volume)) return false;
        if (patch.trimStart !== undefined || patch.trimEnd !== undefined) {
          const item = media.find((m) => m.id === clip.mediaId);
          if (item?.kind !== "audio") return false;
          if (!isValidMusicTrim(next.trimStart, next.trimEnd, item.duration)) return false;
        }
        commitMusic(updateMusicClipOp(music, clipId, patch));
        return true;
      },

      fitToMusic() {
        const { slides, music, media } = get();
        const result = fitToMusic(slides, projectMusicDuration(music, media));
        if (result.kind === "ok") {
          commit(slides.map((s, i) => ({ ...s, duration: result.durations[i] ?? s.duration })));
        }
        return result;
      },
      newProject() {
        const { slides, music } = get();
        pushHistory({ slides, music });
        set({ music: [], musicSelection: null, slides: [], selection: null, playback: STOPPED });
        scheduleSave();
      },

      undo() {
        const { undoStack, slides, music } = get();
        const top = undoStack[undoStack.length - 1];
        if (!top) return;
        set({
          undoStack: undoStack.slice(0, -1),
          redoStack: [...get().redoStack, { slides, music }],
        });
        restore(top);
      },
      redo() {
        const { redoStack, slides, music } = get();
        const top = redoStack[redoStack.length - 1];
        if (!top) return;
        set({
          redoStack: redoStack.slice(0, -1),
          undoStack: [...get().undoStack, { slides, music }],
        });
        restore(top);
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
