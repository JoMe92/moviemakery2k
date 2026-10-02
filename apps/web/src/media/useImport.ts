import { useCallback } from "react";
import { useAppStoreApi } from "../store/useAppStore";

/** File formats of the file dialog; the backend checks the content itself anyway. */
export const IMPORT_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Starts an import: show the "My Pictures" collection, discard finished
 * entries of the last round and upload the files sequentially.
 */
export function useImport(): (files: readonly File[]) => void {
  const store = useAppStoreApi();
  return useCallback(
    (files) => {
      if (files.length === 0) return;
      const state = store.getState();
      const busy = state.uploads.some((u) => u.status === "pending" || u.status === "uploading");
      if (!busy) state.clearUploads();
      state.setCollection("media");
      void state.importFiles(files);
    },
    [store],
  );
}
