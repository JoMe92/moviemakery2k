import type { ReactNode } from "react";
import { FilmIcon } from "../ui/icons";
import styles from "./AppWindow.module.css";

export interface AppWindowProps {
  title: string;
  menuBar: ReactNode;
  toolbar: ReactNode;
  taskPane: ReactNode;
  collection: ReactNode;
  monitor: ReactNode;
  storyboard: ReactNode;
  statusBar: ReactNode;
}

/**
 * Main window in the Movie Maker layout: title bar, menu bar and toolbar on
 * top, below them task pane | collection | monitor, then the full-width
 * storyboard and the status bar.
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
}: AppWindowProps) {
  return (
    <div className={styles.window}>
      <header className={styles.titlebar}>
        <FilmIcon size={16} />
        <h1 className={styles.title}>{title}</h1>
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
    </div>
  );
}
