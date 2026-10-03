import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { CollectionPane } from "../shell/CollectionPane";
import styles from "./LibraryPane.module.css";
import { UploadPanel } from "./UploadPanel";
import { ImportInput } from "./ImportInput";
import { useImport } from "./useImport";

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
 * `requestImport()` in the store, file types per `importKind`), dropping
 * files (pictures and audio) and progress/errors below.
 */
export function LibraryPane({ name, children }: LibraryPaneProps) {
  const startImport = useImport();
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

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
      <ImportInput />
    </CollectionPane>
  );
}
