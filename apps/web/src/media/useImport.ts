import { useCallback } from "react";
import { useAppStoreApi } from "../store/useAppStore";

/** Dateiformate des Dateidialogs; das Backend prüft den Inhalt ohnehin selbst. */
export const IMPORT_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Startet einen Import: Sammlung „Meine Bilder“ zeigen, abgeschlossene
 * Einträge der letzten Runde verwerfen und die Dateien sequenziell hochladen.
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
