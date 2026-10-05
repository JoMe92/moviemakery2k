/**
 * Central state of the web app (design.md D2): project, media, catalog, UI, playback.
 * Project changes are saved debounced (autosave, 500 ms).
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import { buildAutoMovie, isStyleAvailable } from "../automovie/autoMovie";
import { uploadFailureInfo } from "../i18n/errors";
import { applyDocumentLocale, initialLocale, type Locale, writeStoredLocale } from "../i18n/locale";
import { translate } from "../i18n/t";
import {
  ApiError,
  type ApiErrorInfo,
  type AppApi,
  type AutoMovieStyle,
  type Effect,
  type ExportApi,
  type Health,
  type ImageSlide,
  isAuthRequired,
  type MediaItem,
  type MusicClip,
  type NarrationClip,
  type Project,
  type Slide,
  type TitleOverlay,
  type TitleSlide,
  type TitleStyle,
  type Transition,
  type VideoSlide,
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
  MAX_STEP as TICK_MAX_STEP,
  timelineOf,
  toTimelineSlides,
  videoSplitPoint,
} from "../player/controls";
import { type FitToMusicResult, fitToMusic } from "../timeline/fitToMusic";
import { musicDuration } from "../timeline/music";
import { slideStartTime } from "../timeline/timeline";
import {
  CREDITS_DURATION_DEFAULT,
  insertIndexFor,
  isCredits,
  isPlacementAvailable,
  newTitleOverlay,
  newTitleSlide,
  TITLE_DURATION_DEFAULT,
  type TitleDraft,
  type TitlePlacement,
  titleStyleById,
} from "../titles/titleStyle";
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
  insertNarrationClip,
  isValidNarrationAt,
  isValidNarrationTrim,
  isValidNarrationVolume,
  NARRATION_TRACK_MAX,
  type NarrationClipPatch,
  newNarrationClip,
  removeNarrationClip as removeNarrationClipOp,
  updateNarrationClip as updateNarrationClipOp,
} from "./narrationOps";
import {
  CLIP_AUDIO_BALANCE,
  insertSlide,
  isValidClipAudioBalance,
  isValidSlideDuration,
  isValidTransitionDuration,
  moveSlide,
  newSlideId,
  removeSlide,
  SLIDE_DURATION,
  splitSlide,
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
 * `video` is "My Videos" (video only, add-video-import D4), `effects` is
 * "Video Effects" (add-effects-catalog D4).
 */
export type CollectionId = "media" | "music" | "video" | "transitions" | "effects";
/**
 * File dialog requested: `any` (File menu: pictures, video and audio),
 * `pictures` ("Import pictures"), `audio` ("Import audio or music") or
 * `video` ("Import video", add-video-import D4).
 */
export type ImportKind = "any" | "pictures" | "audio" | "video";
export type Selection = { kind: "slide"; slideId: string } | null;

/**
 * Snapshot of the undoable project state (design.md D1): the storyboard, both
 * audio tracks and the one global audio level.
 */
export interface HistoryEntry {
  slides: Slide[];
  music: MusicClip[];
  narration: NarrationClip[];
  clipAudioBalance: number;
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
  | {
      kind: "slide";
      content:
        | Omit<ImageSlide, "id" | "transitionIn">
        | Omit<VideoSlide, "id" | "transitionIn">
        | Omit<TitleSlide, "id" | "transitionIn">;
    }
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

/**
 * Request to scroll an element into view (design.md D6): adding from the
 * collection asks, the filmstrip and the music track scroll - they own their
 * tiles and their scroll container. `seq` makes repeats distinct.
 */
export type RevealRequest =
  | { kind: "slide"; slideId: string; seq: number }
  | { kind: "musicClip"; clipId: string; seq: number }
  | { kind: "narrationClip"; clipId: string; seq: number };

/** A reveal request before the store numbers it. */
export type RevealRequestInput = RevealRequest extends infer R
  ? R extends RevealRequest
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

/** A short notice about an action; `seq` makes a repeat of the same text new. */
export interface ActionNotice {
  text: string;
  seq: number;
}

export interface AppState {
  backend: BackendState;
  loaded: boolean;
  media: MediaItem[];
  catalog: Transition[];
  /** Effect catalog (add-effects-catalog D1); like `catalog`, loaded once at start. */
  effects: Effect[];
  /** Title catalog (add-titles-and-credits D4); like `catalog`, loaded once at start. */
  titles: TitleStyle[];
  /** The AutoMovie styles (add-automovie design.md D1); empty while offline. */
  automovieStyles: AutoMovieStyle[];
  slides: Slide[];
  /** Music track (add-music-track D3); kept and saved with the project. */
  music: MusicClip[];
  /**
   * Narration track (add-narration-and-audio-levels D2); kept and saved with
   * the project. Unlike `music` the clips carry their own absolute `at`, so
   * their order in the list says nothing about when they play.
   */
  narration: NarrationClip[];
  /**
   * The one global level between video-clip sound (100) and music plus
   * narration (0), 0 to 100 (D4); 50 plays both at full gain.
   */
  clipAudioBalance: number;
  saveState: SaveState;
  collection: CollectionId;
  /**
   * Collection pane of the wide and medium layouts visible (design.md D3);
   * transient, never persisted - after a reload the pane is back. Without a
   * toolbar the compact layout ignores it.
   */
  collectionVisible: boolean;
  /** Storyboard pane shows the timeline view instead of the filmstrip (design.md
   * D7); tab-only, not persisted. Switching it never touches `selection` or
   * `playback` - both views read the same store fields. */
  timelineView: boolean;
  selection: Selection;
  /** Selected clip on the music track (exclusive with `selection`). */
  musicSelection: string | null;
  /** Selected clip on the narration track (exclusive with the other two). */
  narrationSelection: string | null;
  /** Undo history (design.md D1), most recent step last; tab-only, not persisted. */
  undoStack: HistoryEntry[];
  /** Redo history; cleared by any new change after an undo. */
  redoStack: HistoryEntry[];
  /** Internal single-element clipboard (design.md D4); replaced wholesale by cut/copy. */
  clipboard: ClipboardEntry;
  /** selected transition in the collection (demo in the monitor) */
  previewTransitionId: string | null;
  /**
   * Effect demonstrated in the collection (add-effects-catalog D4): the
   * monitor shows the sample image with this effect. A still image, so unlike
   * the transition demo it needs no `demo` clock.
   */
  previewEffectId: string | null;
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
  /**
   * Short notice about the last explicit action (design.md D4), or null.
   * `seq` counts up with every notice so the same text twice is shown twice.
   * One channel, two presentations: `StatusNotices` in the compact and medium
   * layouts, a temporary status-bar field in the wide one.
   */
  notice: ActionNotice | null;
  /** Last request to scroll an element into view, or null. */
  revealRequest: RevealRequest | null;
  /** "Save Movie" wizard open (design.md D6). */
  exportWizardOpen: boolean;
  /** Title wizard open (add-titles-and-credits design.md D6). */
  titleWizardOpen: boolean;
  /**
   * Live preview of the wizard's "Stil" step (add-titles-and-credits D6): the
   * monitor shows this draft title instead of the project, the same way
   * `previewEffectId` shows the sample image with one effect.
   */
  titlePreview: TitleDraft | null;
  /** Export interface for the wizard (same API as the store). */
  exportApi: ExportApi;
  /** UI language (localization design.md D2). */
  locale: Locale;

  init(): Promise<void>;
  /** Switches the UI language at once, persists it and updates `<html lang>`. */
  setLocale(locale: Locale): void;
  setCollection(collection: CollectionId): void;
  /** Toolbar toggle "Collections": shows or hides the collection pane (design.md D1). */
  toggleCollectionVisible(): void;
  /** View -> "Zeitachse" / the storyboard pane's toggle button (design.md D7). */
  toggleTimelineView(): void;
  select(selection: Selection): void;
  /** Select a tile in the catalog: starts the transition demo in the monitor (null ends it). */
  setPreviewTransition(id: string | null): void;
  /**
   * Double-click in "Video Effects": shows the sample image with this effect
   * in the monitor (null ends the demo).
   */
  setPreviewEffect(id: string | null): void;

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
  /**
   * Show a short notice about an action just carried out; the text is already
   * translated. It replaces a standing notice at once and outranks the state
   * messages ("Saved", backend changes) until it expires (design.md D4).
   */
  notify(text: string): void;
  /** Ask the filmstrip or the music track to scroll an element into view. */
  reveal(request: RevealRequestInput): void;
  importFiles(files: readonly File[]): Promise<void>;
  /** Open the "Save Movie" wizard; no effect with an empty storyboard. */
  openExportWizard(): void;
  closeExportWizard(): void;
  /** Task pane "Titel oder Nachspann erstellen" (add-titles-and-credits D6). */
  openTitleWizard(): void;
  closeTitleWizard(): void;
  /** Show a draft title in the monitor (null ends the preview). */
  setTitlePreview(draft: TitleDraft | null): void;
  /**
   * Finish the title wizard (add-titles-and-credits D6): inserts a title
   * element at the chosen placement, or sets the overlay `title` field of the
   * selected image/video element for "on the selected element". The result is
   * selected afterwards. `false` = refused (unknown style, or a placement the
   * current selection does not allow).
   */
  applyTitle(placement: TitlePlacement, draft: TitleDraft): boolean;
  /** Remove an element's overlay title (`null`), or replace it. */
  setTitleOverlay(slideId: string, overlay: TitleOverlay | null): boolean;
  clearUploads(): void;
  deleteMedia(id: string): Promise<void>;

  addSlide(mediaId: string, index?: number): void;
  moveSlide(from: number, to: number): void;
  removeSlide(slideId: string): void;
  setSlideDuration(slideId: string, duration: number): boolean;
  /**
   * Trims a video slide (spec slideshow-project "Videoclip kürzen"):
   * `0 <= trimIn < trimOut <= ` the video's decoded duration. `false` =
   * refused (not a video slide, unknown media or out of range).
   */
  setVideoTrim(slideId: string, trimIn: number, trimOut: number): boolean;
  /**
   * Clip → "Teilen" (design.md D4): splits the selected video slide in two at
   * the playhead. `false` = refused (no selection, not a video, or the
   * playhead isn't strictly within the clip's own trim window).
   */
  splitSlide(): boolean;
  setTransition(slideId: string, transitionId: string): void;
  /**
   * Effect slot of one element (add-effects-catalog D3/D4): a catalog ID sets
   * the effect, `null` ("Keinen Effekt") removes it. One effect per element.
   */
  setEffect(slideId: string, effectId: string | null): void;
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
   * Clip → "Audio levels…" (add-narration-and-audio-levels D4): the one global
   * level between video-clip sound and music plus narration; autosaved and
   * undoable. A value outside 0–100 or not a whole number changes nothing;
   * returns whether the change was applied.
   */
  setClipAudioBalance(balance: number): boolean;
  /** Select a clip on the narration track (null clears); ends the other selections. */
  selectNarrationClip(clipId: string | null): void;
  /**
   * Put a recording on the narration track at `at` seconds (spec
   * narration-track "Erzählung aufnehmen"); autosaved. Refuses a non-audio
   * medium, a full track and an `at` outside 0–60000 s, and returns the new
   * clip's id or null.
   */
  addNarrationClip(mediaId: string, at: number, length?: number): string | null;
  /**
   * Move a clip to a new start time (spec narration-track "Clip verschieben");
   * an `at` outside the range changes nothing. Unlike the music track no other
   * clip moves — every clip owns its own `at`.
   */
  moveNarrationClip(clipId: string, at: number): boolean;
  removeNarrationClip(clipId: string): void;
  /**
   * Change the start time, trim, volume or fades of a narration clip
   * (autosaved). An invalid value changes nothing; returns whether the change
   * was applied.
   */
  updateNarrationClip(clipId: string, patch: NarrationClipPatch): boolean;
  /**
   * Clip → "Fit movie to music" (add-music-track D8): sets all picture
   * durations at once (one change, autosaved). Changes nothing if the music
   * length is unreachable or there are no pictures/music; the result says why.
   */
  fitToMusic(): FitToMusicResult;
  /**
   * Extras → "AutoMovie…" (add-automovie design.md D2): replaces the whole
   * filmstrip with the media collection in import order in the chosen style —
   * the style's transition between all adjacent elements, its effect on every
   * picture and video clip, a title element with `filmTitle` at the start and
   * one with "Ende"/"The End" at the end, both in the style's `titleStyleId`
   * — and, if the project has music, runs "Fit movie to music" on the result.
   * The collection itself stays untouched. One undo step for the whole operation.
   * `false` = nothing done (unknown style, a style whose title style is not in
   * the title catalog, a style that needs music without a music track, or no
   * pictures and videos at all). A blank `filmTitle` gets no opening title.
   */
  autoMovie(styleId: string, filmTitle: string): boolean;
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
      schemaVersion: 6,
      slides: get().slides,
      music: get().music,
      narration: get().narration,
      clipAudioBalance: get().clipAudioBalance,
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

    /** The undoable project state as it is right now (design.md D1). */
    function snapshot(): HistoryEntry {
      const { slides, music, narration, clipAudioBalance } = get();
      return { slides, music, narration, clipAudioBalance };
    }

    function commit(slides: Slide[]): void {
      const { selection } = get();
      pushHistory(snapshot());
      const stillThere = selection && slides.some((s) => s.id === selection.slideId);
      set({ slides, selection: stillThere ? selection : null, playback: playbackFor(slides) });
      scheduleSave();
    }

    /** Store a changed music track; keeps the music selection if the clip is still there. */
    function commitMusic(music: MusicClip[]): void {
      const { musicSelection } = get();
      pushHistory(snapshot());
      const stillThere = musicSelection !== null && music.some((c) => c.id === musicSelection);
      set({ music, musicSelection: stillThere ? musicSelection : null });
      scheduleSave();
    }

    /** Store a changed narration track; keeps the selection if the clip is still there. */
    function commitNarration(narration: NarrationClip[]): void {
      const { narrationSelection } = get();
      pushHistory(snapshot());
      const stillThere =
        narrationSelection !== null && narration.some((c) => c.id === narrationSelection);
      set({ narration, narrationSelection: stillThere ? narrationSelection : null });
      scheduleSave();
    }

    /** Jump to a history entry (undo/redo): restores selections if still valid. */
    function restore(entry: HistoryEntry): void {
      const { selection, musicSelection, narrationSelection } = get();
      const stillSlide = selection && entry.slides.some((s) => s.id === selection.slideId);
      const stillMusic =
        musicSelection !== null && entry.music.some((c) => c.id === musicSelection);
      const stillNarration =
        narrationSelection !== null && entry.narration.some((c) => c.id === narrationSelection);
      set({
        slides: entry.slides,
        music: entry.music,
        narration: entry.narration,
        clipAudioBalance: entry.clipAudioBalance,
        selection: stillSlide ? selection : null,
        musicSelection: stillMusic ? musicSelection : null,
        narrationSelection: stillNarration ? narrationSelection : null,
        playback: playbackFor(entry.slides),
      });
      scheduleSave();
    }

    const duration = () => timelineOf(get().slides).duration;
    const noDemo = {
      previewTransitionId: null,
      previewEffectId: null,
      titlePreview: null,
      demo: null,
    } as const;

    /** Clipboard content copied from a slide (design.md D4): never its id or transition. */
    function clipboardOfSlide(slide: Slide): ClipboardEntry {
      const { id: _id, transitionIn: _transitionIn, ...content } = slide;
      return { kind: "slide", content };
    }

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
      effects: [],
      titles: [],
      automovieStyles: [],
      slides: [],
      music: [],
      narration: [],
      clipAudioBalance: CLIP_AUDIO_BALANCE.default,
      saveState: "idle",
      collection: "media",
      collectionVisible: true,
      timelineView: false,
      selection: null,
      musicSelection: null,
      narrationSelection: null,
      undoStack: [],
      redoStack: [],
      clipboard: null,
      previewTransitionId: null,
      previewEffectId: null,
      playback: STOPPED,
      demo: null,
      uploads: [],
      importRequest: 0,
      importKind: "any",
      editRequest: null,
      notice: null,
      revealRequest: null,
      collectionSheetOpen: false,
      exportWizardOpen: false,
      titleWizardOpen: false,
      titlePreview: null,
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
          const [health, catalog, effects, titles, automovieStyles, media, project] =
            await Promise.all([
              api.health(),
              api.catalog(),
              api.effectCatalog(),
              api.titleCatalog(),
              api.automovieCatalog(),
              api.listMedia(),
              api.getProject(),
            ]);
          set({
            backend: { kind: "ok", health },
            catalog,
            effects,
            titles,
            automovieStyles,
            media,
            slides: project.slides,
            music: project.music,
            narration: project.narration,
            clipAudioBalance: project.clipAudioBalance,
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
        // Every way into a collection goes through here, so bringing the pane
        // back lives here too - nothing can run into a hidden pane (design.md D5).
        set({ collection, collectionVisible: true, ...noDemo });
      },
      toggleCollectionVisible() {
        set({ collectionVisible: !get().collectionVisible });
      },
      toggleTimelineView() {
        set({ timelineView: !get().timelineView });
      },
      select(selection) {
        // While playback is stopped, the monitor shows the selected picture.
        // Selecting in the filmstrip always ends a transition demo (design.md D7).
        const { playback, slides } = get();
        const index = selection ? slides.findIndex((s) => s.id === selection.slideId) : -1;
        // One selection at a time: a picture ends both clip selections.
        if (selection) set({ musicSelection: null, narrationSelection: null });
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
          previewEffectId: null,
          demo: { playing: true, time: 0 },
          playback: { ...playback, playing: false },
        });
      },
      setPreviewEffect(id) {
        if (id === null) {
          set(noDemo);
          return;
        }
        const { playback } = get();
        set({
          previewEffectId: id,
          previewTransitionId: null,
          // A single image: no demo clock, so the monitor simply holds it.
          demo: null,
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
        const { demo, playback, previewTransitionId, catalog, titlePreview, titles } = get();
        if (demo && titlePreview) {
          // The title preview loops over the duration its style would get.
          if (!demo.playing) return;
          const style = titleStyleById(titles, titlePreview.styleId);
          const total =
            style && isCredits(style.layout) ? CREDITS_DURATION_DEFAULT : TITLE_DURATION_DEFAULT;
          const next = demo.time + Math.min(Math.max(dt, 0), TICK_MAX_STEP);
          set({ demo: { playing: true, time: next % total } });
          return;
        }
        if (demo && previewTransitionId) {
          if (!demo.playing) return;
          const t = catalog.find((c) => c.id === previewTransitionId)?.defaultDuration ?? 1.25;
          set({ demo: advance(demo, dt, demoDuration(t)) });
          return;
        }
        if (playback.playing) set({ playback: advance(playback, dt, duration()) });
      },

      requestImport(kind = "any") {
        // The imported files land in the collection, so the import brings the
        // pane back as well (design.md D5).
        set({ importRequest: get().importRequest + 1, importKind: kind, collectionVisible: true });
      },
      setCollectionSheetOpen(open) {
        set({ collectionSheetOpen: open });
      },
      requestEdit(request) {
        const seq = (get().editRequest?.seq ?? 0) + 1;
        set({ editRequest: { ...request, seq } as EditRequest });
      },
      notify(text) {
        set({ notice: { text, seq: (get().notice?.seq ?? 0) + 1 } });
      },
      reveal(request) {
        const seq = (get().revealRequest?.seq ?? 0) + 1;
        set({ revealRequest: { ...request, seq } as RevealRequest });
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
      openTitleWizard() {
        set({ titleWizardOpen: true });
      },
      closeTitleWizard() {
        // Leaving the wizard always ends its live preview.
        set({ titleWizardOpen: false, titlePreview: null });
      },
      setTitlePreview(draft) {
        if (draft === null) {
          set({ titlePreview: null });
          return;
        }
        // A draft style outside the catalog has nothing to preview.
        const style = titleStyleById(get().titles, draft.styleId);
        if (!style) return;
        // The preview animates on the demo clock (as the transition demo does);
        // an already-running preview keeps its position while the draft changes.
        const demo = get().titlePreview ? get().demo : null;
        set({
          titlePreview: draft,
          previewTransitionId: null,
          previewEffectId: null,
          demo: demo ?? { playing: true, time: 0 },
        });
      },
      applyTitle(placement, draft) {
        const { slides, selection, titles } = get();
        const style = titleStyleById(titles, draft.styleId);
        if (!style) return false;
        const selected = selection ? slides.find((sl) => sl.id === selection.slideId) : null;
        if (!isPlacementAvailable(placement, selected)) return false;
        if (placement === "on") {
          // An overlay title never changes the element list or its duration.
          if (!selected || selected.kind === "title") return false;
          commit(
            updateSlide(slides, selected.id, (sl) =>
              sl.kind === "title" ? sl : { ...sl, title: newTitleOverlay(draft, style.layout) },
            ),
          );
          set({ titlePreview: null });
          get().select({ kind: "slide", slideId: selected.id });
          return true;
        }
        const slide = newTitleSlide(draft, style.layout);
        commit(insertSlide(slides, slide, insertIndexFor(placement, slides, selected?.id ?? null)));
        set({ titlePreview: null });
        // The new title is selected afterwards (spec titles-and-credits).
        get().select({ kind: "slide", slideId: slide.id });
        return true;
      },
      setTitleOverlay(slideId, overlay) {
        const { slides, titles } = get();
        const slide = slides.find((sl) => sl.id === slideId);
        // A title element cannot host an overlay title (spec slideshow-project),
        // and a style outside the catalog would be refused by the backend.
        if (!slide || slide.kind === "title") return false;
        if (overlay && !titleStyleById(titles, overlay.styleId)) return false;
        commit(
          updateSlide(slides, slideId, (sl) =>
            sl.kind === "title" ? sl : { ...sl, title: overlay },
          ),
        );
        return true;
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
        const { musicSelection, narrationSelection } = get();
        const musicStillThere = project.music.some((c) => c.id === musicSelection);
        const narrationStillThere = project.narration.some((c) => c.id === narrationSelection);
        set({
          media: get().media.filter((m) => m.id !== id),
          slides: project.slides,
          music: project.music,
          narration: project.narration,
          selection: stillThere ? selection : null,
          musicSelection: musicStillThere ? musicSelection : null,
          narrationSelection: narrationStillThere ? narrationSelection : null,
          playback: playbackFor(project.slides),
        });
      },

      addSlide(mediaId, index) {
        // Pictures and videos belong in the filmstrip; audio goes to the music track.
        const item = get().media.find((m) => m.id === mediaId);
        if (item?.kind === "audio") return;
        // New video clip: full trim, no incoming transition (hard cut), like a
        // newly inserted picture (add-timeline-editing design.md D2).
        const slide: Slide =
          item?.kind === "video"
            ? {
                kind: "video",
                id: newSlideId(),
                mediaId,
                trimIn: 0,
                trimOut: item.duration,
                effectId: null,
                title: null,
                transitionIn: null,
              }
            : {
                kind: "image",
                id: newSlideId(),
                mediaId,
                duration: SLIDE_DURATION.default,
                effectId: null,
                title: null,
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
        // Only a picture has a display duration; a video clip's length is its trim.
        if (!isValidSlideDuration(duration)) return false;
        commit(
          updateSlide(get().slides, slideId, (s) => (s.kind === "video" ? s : { ...s, duration })),
        );
        return true;
      },
      setVideoTrim(slideId, trimIn, trimOut) {
        const { slides, media } = get();
        const slide = slides.find((s) => s.id === slideId);
        if (slide?.kind !== "video") return false;
        const item = media.find((m) => m.id === slide.mediaId);
        if (item?.kind !== "video") return false;
        if (!(trimIn >= 0 && trimIn < trimOut && trimOut <= item.duration)) return false;
        commit(
          updateSlide(slides, slideId, (s) => (s.kind === "video" ? { ...s, trimIn, trimOut } : s)),
        );
        return true;
      },
      splitSlide() {
        const { selection, slides, playback } = get();
        if (!selection) return false;
        const point = videoSplitPoint(slides, selection.slideId, playback.time);
        if (point === null) return false;
        commit(splitSlide(slides, selection.slideId, point));
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
      setEffect(slideId, effectId) {
        const { slides, effects } = get();
        // An ID outside the catalog would be refused by the backend; ignore it
        // here so the project never carries one. `null` always removes.
        if (effectId !== null && !effects.some((e) => e.id === effectId)) return;
        commit(updateSlide(slides, slideId, (s) => ({ ...s, effectId })));
      },

      cut() {
        const { selection, musicSelection, slides, music } = get();
        if (selection) {
          const slide = slides.find((s) => s.id === selection.slideId);
          if (!slide) return;
          set({ clipboard: clipboardOfSlide(slide) });
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
          set({ clipboard: clipboardOfSlide(slide) });
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
          const newSlide: Slide = { ...clipboard.content, id: newSlideId(), transitionIn: null };
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
          clipId === null
            ? { musicSelection: null }
            : { musicSelection: clipId, selection: null, narrationSelection: null },
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
      selectNarrationClip(clipId) {
        set(
          clipId === null
            ? { narrationSelection: null }
            : { narrationSelection: clipId, selection: null, musicSelection: null },
        );
      },
      addNarrationClip(mediaId, at, length) {
        // Only audio belongs on the narration track (spec narration-track).
        const { media, narration } = get();
        if (media.find((m) => m.id === mediaId)?.kind !== "audio") return null;
        if (narration.length >= NARRATION_TRACK_MAX) return null;
        if (!isValidNarrationAt(at)) return null;
        const clip = newNarrationClip(mediaId, at, length ?? null);
        commitNarration(insertNarrationClip(narration, clip));
        return clip.id;
      },
      moveNarrationClip(clipId, at) {
        return get().updateNarrationClip(clipId, { at });
      },
      removeNarrationClip(clipId) {
        commitNarration(removeNarrationClipOp(get().narration, clipId));
      },
      updateNarrationClip(clipId, patch) {
        const { narration, media } = get();
        const clip = narration.find((c) => c.id === clipId);
        if (!clip) return false;
        const next = { ...clip, ...patch };
        if (!isValidNarrationAt(next.at)) return false;
        if (!isValidNarrationVolume(next.volume)) return false;
        if (patch.trimStart !== undefined || patch.trimEnd !== undefined) {
          const item = media.find((m) => m.id === clip.mediaId);
          if (item?.kind !== "audio") return false;
          if (!isValidNarrationTrim(next.trimStart, next.trimEnd, item.duration)) return false;
        }
        commitNarration(updateNarrationClipOp(narration, clipId, patch));
        return true;
      },
      setClipAudioBalance(balance) {
        if (!isValidClipAudioBalance(balance)) return false;
        if (balance === get().clipAudioBalance) return true;
        pushHistory(snapshot());
        set({ clipAudioBalance: balance });
        scheduleSave();
        return true;
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
        const result = fitToMusic(toTimelineSlides(slides), projectMusicDuration(music, media));
        if (result.kind === "ok") {
          // A video clip's length is its trim, not a display duration to stretch
          // (add-timeline-editing non-goal); only pictures are resized here.
          commit(
            slides.map((s, i) =>
              s.kind === "video" ? s : { ...s, duration: result.durations[i] ?? s.duration },
            ),
          );
        }
        return result;
      },
      autoMovie(styleId, filmTitle) {
        const { automovieStyles, media, music, titles, locale } = get();
        const style = automovieStyles.find((entry) => entry.id === styleId);
        if (!style) return false;
        // The backend validates every `titleStyleId` against the title catalog
        // at startup (TASK-CAT-008), so an unknown one means a broken catalog
        // pair — and a title element the backend would refuse.
        const titleStyle = titleStyleById(titles, style.titleStyleId);
        if (!titleStyle) return false;
        const musicLength = projectMusicDuration(music, media);
        if (!isStyleAvailable(style, musicLength > 0)) return false;
        const built = buildAutoMovie(media, style, defaultTransitionDuration(style.transitionId), {
          filmTitle,
          endTitle: translate(locale, "autoMovie.endTitle"),
          layout: titleStyle.layout,
        });
        if (built.length === 0) return false;
        // "Fit movie to music" is applied here rather than through the store
        // action, so the whole AutoMovie is a single undo step (design.md D2:
        // the result is an ordinary project and stays editable like any other).
        const fit = fitToMusic(toTimelineSlides(built), musicLength);
        const slides =
          fit.kind === "ok"
            ? built.map((slide, index) =>
                // A video clip's length is its trim, not a duration to stretch.
                slide.kind === "video"
                  ? slide
                  : { ...slide, duration: fit.durations[index] ?? slide.duration },
              )
            : built;
        commit(slides);
        return true;
      },
      newProject() {
        pushHistory(snapshot());
        set({
          music: [],
          narration: [],
          clipAudioBalance: CLIP_AUDIO_BALANCE.default,
          musicSelection: null,
          narrationSelection: null,
          slides: [],
          selection: null,
          playback: STOPPED,
        });
        scheduleSave();
      },

      undo() {
        const { undoStack } = get();
        const top = undoStack[undoStack.length - 1];
        if (!top) return;
        set({
          undoStack: undoStack.slice(0, -1),
          redoStack: [...get().redoStack, snapshot()],
        });
        restore(top);
      },
      redo() {
        const { redoStack } = get();
        const top = redoStack[redoStack.length - 1];
        if (!top) return;
        set({
          redoStack: redoStack.slice(0, -1),
          undoStack: [...get().undoStack, snapshot()],
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
