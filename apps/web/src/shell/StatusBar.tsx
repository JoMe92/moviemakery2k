import type { ReactNode } from "react";
import styles from "./StatusBar.module.css";

export interface StatusBarProps {
  /** Status bar fields from left to right. */
  items: readonly ReactNode[];
  /**
   * Temporary field for the notice about the last action (app-shell design.md
   * D4): the wide layout's presentation of the short notice. Absent while no
   * notice is standing; the fields before it never move.
   */
  notice?: string | null;
}

/** Status bar at the bottom of the window; changes are announced politely. */
export function StatusBar({ items, notice }: StatusBarProps) {
  return (
    <footer className={styles.statusbar}>
      {items.map((item, index) => (
        // Fields are bound to their position and never change order.
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed field positions
        <output key={index} className={styles.field} aria-live="polite">
          {item}
        </output>
      ))}
      {notice ? (
        // `output` already carries the role "status", which is what the
        // requirement asks for; naming it again would be redundant ARIA.
        <output className={`${styles.field} ${styles.notice}`} aria-live="polite">
          {notice}
        </output>
      ) : null}
    </footer>
  );
}
