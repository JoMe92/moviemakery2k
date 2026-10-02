import { type ReactNode, useId } from "react";
import styles from "./TaskPane.module.css";

export interface TaskPaneProps {
  children: ReactNode;
}

/** Aufgabenbereich links („Filmaufgaben“) mit blau hinterlegten Gruppen. */
export function TaskPane({ children }: TaskPaneProps) {
  const headingId = useId();
  return (
    <aside className={styles.pane} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        Filmaufgaben
      </h2>
      <div className={styles.groups}>{children}</div>
    </aside>
  );
}
