import type { ReactNode } from "react";
import { useT } from "../i18n/useT";
import { FilmIcon } from "../ui/icons";
import styles from "./CompactWindow.module.css";
import type { Orientation } from "./layoutMode";

export interface CompactWindowProps {
  title: string;
  orientation: Orientation;
  /** Menu button ("☰") at the right end of the title bar. */
  menuButton?: ReactNode;
  /** Lasting state symbols in the title bar (e.g. "Saving failed"). */
  indicators?: ReactNode;
  monitor: ReactNode;
  /** Storyboard strip and music track. */
  editing: ReactNode;
  /** Actions of the selected element (only while something is selected). */
  actionBar?: ReactNode;
  taskbar?: ReactNode;
  /** Short notices instead of the status bar. */
  notices?: ReactNode;
}

/**
 * Compact layout for phones (add-mobile-layout design.md D3). Portrait: title
 * bar, monitor (at most 45 % of the height) with its control bar, editing
 * area, action bar and taskbar from top to bottom. Landscape: monitor left,
 * editing area and taskbar right.
 */
export function CompactWindow({
  title,
  orientation,
  menuButton,
  indicators,
  monitor,
  editing,
  actionBar,
  taskbar,
  notices,
}: CompactWindowProps) {
  const { t } = useT();
  return (
    <div className={styles.window} data-orientation={orientation} data-testid="compact-window">
      <header className={styles.titlebar}>
        <FilmIcon size={16} />
        <h1 className={styles.title}>{title}</h1>
        {indicators}
        {menuButton}
      </header>
      <div className={styles.monitor}>{monitor}</div>
      <section className={styles.editing} aria-label={t("shell.editing")}>
        {editing}
      </section>
      {actionBar ? <div className={styles.actions}>{actionBar}</div> : null}
      {taskbar ? <div className={styles.taskbar}>{taskbar}</div> : null}
      {notices}
    </div>
  );
}
