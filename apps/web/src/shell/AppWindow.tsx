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
 * Hauptfenster im Movie-Maker-Layout: Titel-, Menü- und Symbolleiste oben,
 * darunter Aufgabenbereich | Sammlung | Monitor, dann Storyboard über die
 * volle Breite und die Statusleiste.
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
