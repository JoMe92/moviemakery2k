import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { CollectionPane } from "../shell/CollectionPane";
import { useAppStore } from "../store/useAppStore";
import styles from "./LibraryPane.module.css";
import { UploadPanel } from "./UploadPanel";
import { IMPORT_ACCEPT, useImport } from "./useImport";

export interface LibraryPaneProps {
  name: string;
  children: ReactNode;
}

/** Only file drags from the file manager, no drags within the app (dnd-kit). */
function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Collection area with import: hidden file dialog (opened via
 * `requestImport()` in the store), dropping files and progress/errors below.
 */
export function LibraryPane({ name, children }: LibraryPaneProps) {
  const importRequest = useAppStore((s) => s.importRequest);
  const startImport = useImport();
  const inputRef = useRef<HTMLInputElement>(null);
  const seenRequest = useRef(importRequest);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (importRequest === seenRequest.current) return;
    seenRequest.current = importRequest;
    inputRef.current?.click();
  }, [importRequest]);

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    startImport(Array.from(event.dataTransfer.files));
  };

  return (
    <CollectionPane
      name={name}
      className={dragging ? styles.dropping : undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      footer={<UploadPanel />}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        className={styles.input}
        tabIndex={-1}
        aria-hidden="true"
        data-testid="media-import-input"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          // Reset so the same files can be chosen again.
          event.currentTarget.value = "";
          startImport(files);
        }}
      />
    </CollectionPane>
  );
}
