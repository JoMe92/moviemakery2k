import { useEffect, useState } from "react";
import styles from "./App.module.css";
import { describeHealth, fetchHealth, type Health } from "./api";
import { AppWindow } from "./shell/AppWindow";
import { CollectionPane } from "./shell/CollectionPane";
import { MenuBar } from "./shell/MenuBar";
import { MonitorPane } from "./shell/MonitorPane";
import { StatusBar } from "./shell/StatusBar";
import { StoryboardPane } from "./shell/StoryboardPane";
import { TaskPane } from "./shell/TaskPane";
import { type CollectionOption, Toolbar } from "./shell/Toolbar";
import { Button } from "./ui/Button";
import {
  EffectsIcon,
  FilmIcon,
  FolderIcon,
  ImportImageIcon,
  NextIcon,
  PlayIcon,
  PrevIcon,
  StopIcon,
  TitleIcon,
  TransitionsIcon,
} from "./ui/icons";
import { TaskGroup } from "./ui/TaskGroup";
import { TaskLink } from "./ui/TaskLink";

export const APP_TITLE = "moviemakerY2K – Unbenanntes Projekt";

const COLLECTIONS: readonly CollectionOption[] = [
  { id: "media", label: "Meine Bilder" },
  { id: "transitions", label: "Videoübergänge" },
];

/*
 * Komponiert das Hauptfenster mit Platzhalterinhalten. Verhalten (Import,
 * Menüs, Wiedergabe, Storyboard) folgt in späteren Tasks; bis dahin hält App
 * nur lokalen Zustand für die Sammlungsauswahl und den Backend-Status.
 */
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [collection, setCollection] = useState("media");

  useEffect(() => {
    const ctrl = new AbortController();
    fetchHealth(ctrl.signal)
      .then(setHealth)
      .catch(() => setHealth(null));
    return () => ctrl.abort();
  }, []);

  const collectionName = COLLECTIONS.find((c) => c.id === collection)?.label ?? "";

  return (
    <AppWindow
      title={APP_TITLE}
      menuBar={<MenuBar />}
      toolbar={
        <Toolbar
          collections={COLLECTIONS}
          collection={collection}
          onCollectionChange={setCollection}
        />
      }
      taskPane={
        <TaskPane>
          <TaskGroup title="1. Aufnehmen">
            <TaskLink icon={<FilmIcon />} disabled>
              Video importieren
            </TaskLink>
            <TaskLink icon={<ImportImageIcon />}>Bilder importieren</TaskLink>
            <TaskLink icon={<FolderIcon />} disabled>
              Audio oder Musik importieren
            </TaskLink>
          </TaskGroup>
          <TaskGroup title="2. Film bearbeiten">
            <TaskLink icon={<FolderIcon />} onClick={() => setCollection("media")}>
              Sammlungen anzeigen
            </TaskLink>
            <TaskLink icon={<EffectsIcon />} disabled>
              Videoeffekte anzeigen
            </TaskLink>
            <TaskLink icon={<TransitionsIcon />} onClick={() => setCollection("transitions")}>
              Videoübergänge anzeigen
            </TaskLink>
            <TaskLink icon={<TitleIcon />} disabled>
              Titel oder Nachspann erstellen
            </TaskLink>
          </TaskGroup>
          <TaskGroup title="3. Film fertig stellen">
            <TaskLink icon={<FilmIcon />} disabled>
              Auf dem Computer speichern
            </TaskLink>
            <TaskLink icon={<FilmIcon />} disabled>
              Im Web veröffentlichen
            </TaskLink>
          </TaskGroup>
        </TaskPane>
      }
      collection={
        <CollectionPane name={collectionName}>
          <p className={styles.hint}>
            {collection === "media"
              ? "Diese Sammlung ist leer. Wählen Sie „Bilder importieren“, um Bilder hinzuzufügen."
              : "Der Übergangskatalog wird hier angezeigt."}
          </p>
        </CollectionPane>
      }
      monitor={
        <MonitorPane
          controls={
            <>
              <Button variant="toolbar" icon={<PlayIcon />} label="Wiedergabe" disabled />
              <Button variant="toolbar" icon={<StopIcon />} label="Stopp" disabled />
              <Button variant="toolbar" icon={<PrevIcon />} label="Zurück" disabled />
              <Button variant="toolbar" icon={<NextIcon />} label="Weiter" disabled />
              <span className={styles.time}>0:00:00,00 / 0:00:00,00</span>
            </>
          }
        />
      }
      storyboard={<StoryboardPane />}
      statusBar={<StatusBar items={[describeHealth(health)]} />}
    />
  );
}
