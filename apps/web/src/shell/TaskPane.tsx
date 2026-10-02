import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import styles from "./TaskPane.module.css";

export interface TaskPaneProps {
  children: ReactNode;
}

/** Aufgabenbereich links („Filmaufgaben“) mit blau hinterlegten Gruppen. */
export function TaskPane({ children }: TaskPaneProps) {
  const { t } = useT();
  const headingId = useId();
  return (
    <aside className={styles.pane} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {t("shell.taskPane")}
      </h2>
      <div className={styles.groups}>{children}</div>
    </aside>
  );
}
