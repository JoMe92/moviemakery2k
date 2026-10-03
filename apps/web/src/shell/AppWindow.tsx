import type { ReactNode } from "react";
import { FilmIcon } from "../ui/icons";
import styles from "./AppWindow.module.css";

export interface AppWindowProps {
  title: string;
  menuBar: ReactNode;
  toolbar: ReactNode;
  /** Task pane on the left (wide layout only). */
  taskPane?: ReactNode;
  collection: ReactNode;
  monitor: ReactNode;
  storyboard: ReactNode;
  /** Status bar (wide layout) … */
  statusBar?: ReactNode;
  /** … or the taskbar with the three steps (medium layout). */
  taskbar?: ReactNode;
  /** Lasting state symbols in the title bar. */
  indicators?: ReactNode;
  /** Short notices (medium layout, instead of the status bar). */
  notices?: ReactNode;
  /** `medium`: tablet layout without task pane (add-mobile-layout design.md D3). */
  variant?: "wide" | "medium";
}

/**
 * Main window in the Movie Maker layout: title bar, menu bar and toolbar on
 * top, below them task pane | collection | monitor, then the full-width
 * storyboard and the status bar. The medium variant drops the task pane and
 * puts the taskbar at the bottom instead of the status bar.
 */
export function AppWindow({
  title,
  menuBar,
  toolbar,
  taskPane,
  collection,
  monitor,
  storyboard,
  statusBar,
  taskbar,
  indicators,
  notices,
  variant = "wide",
}: AppWindowProps) {
  return (
    <div className={styles.window} data-variant={variant}>
      <header className={styles.titlebar}>
        <FilmIcon size={16} />
        <h1 className={styles.title}>{title}</h1>
        {indicators}
      </header>
      {menuBar}
      {toolbar}
      <div className={styles.workspace}>
        {taskPane}
        {collection}
        {monitor}
      </div>
      {storyboard}
      {statusBar}
      {taskbar}
      {notices}
    </div>
  );
}
