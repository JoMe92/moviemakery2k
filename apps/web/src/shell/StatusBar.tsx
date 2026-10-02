import type { ReactNode } from "react";
import styles from "./StatusBar.module.css";

export interface StatusBarProps {
  /** Felder der Statusleiste von links nach rechts. */
  items: readonly ReactNode[];
}

/** Statusleiste am unteren Fensterrand; Änderungen werden höflich angesagt. */
export function StatusBar({ items }: StatusBarProps) {
  return (
    <footer className={styles.statusbar}>
      {items.map((item, index) => (
        // Felder sind positionsgebunden und ändern ihre Reihenfolge nicht.
        // biome-ignore lint/suspicious/noArrayIndexKey: feste Feldpositionen
        <output key={index} className={styles.field} aria-live="polite">
          {item}
        </output>
      ))}
    </footer>
  );
}
