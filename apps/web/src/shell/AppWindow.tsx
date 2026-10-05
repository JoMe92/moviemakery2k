import type { ReactNode } from "react";
import { FilmIcon } from "../ui/icons";
import styles from "./AppWindow.module.css";

export interface AppWindowProps {
  title: string;
  menuBar: ReactNode;
  toolbar: ReactNode;
  /** Task pane on the left (wide layout only). */
  taskPane?: ReactNode;
  /** Collection pane; absent while the toolbar toggle hides it (design.md D3). */
  collection?: ReactNode;
  monitor: ReactNode;
  storyboard: ReactNode;
  /** Status bar (wide layout) … */
  statusBar?: ReactNode;
  /** … or the taskbar with the three steps (medium layout). */
  taskbar?: ReactNode;
  /** Actions of the selected element (touch operation). */
  actionBar?: ReactNode;
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
 * puts the taskbar at the bottom instead of the status bar. Without a
 * collection pane the monitor takes its place; everything else stays put.
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
  actionBar,
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
      <div className={styles.workspace} data-collection={collection ? "shown" : "hidden"}>
        {taskPane}
        {collection}
        {monitor}
      </div>
      {storyboard}
      <div className={styles.bottom}>
        {actionBar}
        {statusBar}
        {taskbar}
      </div>
      {notices}
    </div>
  );
}
