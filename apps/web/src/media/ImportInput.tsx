import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import styles from "./LibraryPane.module.css";
import { IMPORT_ACCEPT, useImport } from "./useImport";

/**
 * Hidden file dialog of the import: opens on every `requestImport()` in the
 * store with the file types of `importKind`. Mounted once per layout (in the
 * collection pane on the desktop, in the shell on phones).
 */
export function ImportInput() {
  const importRequest = useAppStore((s) => s.importRequest);
  const importKind = useAppStore((s) => s.importKind);
  const startImport = useImport();
  const inputRef = useRef<HTMLInputElement>(null);
  const seenRequest = useRef(importRequest);

  useEffect(() => {
    if (importRequest === seenRequest.current) return;
    seenRequest.current = importRequest;
    inputRef.current?.click();
  }, [importRequest]);

  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={IMPORT_ACCEPT[importKind]}
      className={styles.input}
      tabIndex={-1}
      aria-hidden="true"
      data-testid="media-import-input"
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        // Reset so the same files can be chosen again.
        event.currentTarget.value = "";
        startImport(files, importKind);
      }}
    />
  );
}
