import { useCallback } from "react";
import type { CollectionId, ImportKind } from "../store/appStore";
import { useAppStoreApi } from "../store/useAppStore";

/** Picture formats of the file dialog; the backend checks the content itself anyway. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

/** Audio formats of the file dialog (spec media-library "Audio importieren"). */
export const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".oga",
  ".opus",
  ".flac",
] as const;
export const AUDIO_ACCEPT = ["audio/*", ...AUDIO_EXTENSIONS].join(",");

/** Video formats of the file dialog (spec media-library, add-video-import D1). */
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".mkv", ".webm"] as const;
export const VIDEO_ACCEPT = ["video/*", ...VIDEO_EXTENSIONS].join(",");

/** File types offered by the file dialog per requested kind. */
export const IMPORT_ACCEPT: Readonly<Record<ImportKind, string>> = {
  any: `${IMAGE_ACCEPT},${VIDEO_ACCEPT},${AUDIO_ACCEPT}`,
  pictures: IMAGE_ACCEPT,
  audio: AUDIO_ACCEPT,
  video: VIDEO_ACCEPT,
};

/**
 * Whether a file looks like audio (MIME type or extension). Only used to pick
 * the collection to show; the backend decides the actual kind by content.
 */
export function looksLikeAudio(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Whether a file looks like video (MIME type or extension). Only used to pick
 * the collection to show; the backend decides the actual kind by content.
 */
export function looksLikeVideo(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const name = file.name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Collection to show for an import: "My Music" when it was started from
 * "Import audio or music" or contains only audio, "My Videos" when started
 * from "Import video" or contains only video, otherwise "My Pictures" (also
 * the fallback for a mixed import of several kinds).
 */
export function importCollection(files: readonly File[], kind?: ImportKind): CollectionId {
  if (kind === "audio") return "music";
  if (kind === "video") return "video";
  if (files.length > 0 && files.every(looksLikeAudio)) return "music";
  if (files.length > 0 && files.every(looksLikeVideo)) return "video";
  return "media";
}

/**
 * Starts an import: show the matching collection, discard finished entries of
 * the last round and upload the files sequentially. Each file lands in the
 * collection of its kind ("My Pictures" or "My Music").
 */
export function useImport(): (files: readonly File[], kind?: ImportKind) => void {
  const store = useAppStoreApi();
  return useCallback(
    (files, kind) => {
      if (files.length === 0) return;
      const state = store.getState();
      const busy = state.uploads.some((u) => u.status === "pending" || u.status === "uploading");
      if (!busy) state.clearUploads();
      state.setCollection(importCollection(files, kind));
      void state.importFiles(files);
    },
    [store],
  );
}
