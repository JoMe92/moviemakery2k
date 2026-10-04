import type { ReactNode } from "react";
import styles from "./StatusBar.module.css";

export interface StatusBarProps {
  /** Status bar fields from left to right. */
  items: readonly ReactNode[];
}

/** Status bar at the bottom of the window; changes are announced politely. */
export function StatusBar({ items }: StatusBarProps) {
  return (
    <footer className={styles.statusbar}>
      {items.map((item, index) => (
        // Fields are bound to their position and never change order.
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed field positions
        <output key={index} className={styles.field} aria-live="polite">
          {item}
        </output>
      ))}
    </footer>
  );
}
