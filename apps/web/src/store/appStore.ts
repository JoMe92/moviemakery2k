/**
 * Zentraler Zustand der Web-App (design.md D2): Projekt, Medien, Katalog, UI, Wiedergabe.
 * Projektänderungen werden entprellt gespeichert (Autosave, 500 ms).
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Api, Health, MediaItem, Project, Slide, Transition } from "../lib/apiClient";
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
  message?: string;
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
  /** Zähler: jede Erhöhung öffnet den Dateidialog „Bilder importieren“ (Aufgabe, Datei-Menü). */
  importRequest: number;

  init(): Promise<void>;
  setCollection(collection: CollectionId): void;
  select(selection: Selection): void;
  setPreviewTransition(id: string | null): void;

  /** Dateidialog „Bilder importieren“ anfordern (wird von der Sammlung geöffnet). */
  requestImport(): void;
  importFiles(files: readonly File[]): Promise<void>;
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

export function createAppStore(api: Api): AppStore {
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

    function commit(slides: Slide[]): void {
      const { selection } = get();
      const stillThere = selection && slides.some((s) => s.id === selection.slideId);
      set({ slides, selection: stillThere ? selection : null });
      scheduleSave();
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
      saveState: "idle",
      collection: "media",
      selection: null,
      previewTransitionId: null,
      uploads: [],
      importRequest: 0,

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
        set({ collection });
      },
      select(selection) {
        set({ selection });
      },
      setPreviewTransition(id) {
        set({ previewTransitionId: id });
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
              patch(entry.key, { status: "error", message: result.message });
            }
          } catch {
            patch(entry.key, { status: "error", message: "Backend nicht erreichbar." });
          }
        }
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
