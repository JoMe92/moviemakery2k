import styles from "./App.module.css";
import { PreviewCanvas } from "./render/PreviewCanvas";
import { AppWindow } from "./shell/AppWindow";
import { CollectionPane } from "./shell/CollectionPane";
import { MenuBar } from "./shell/MenuBar";
import { MonitorPane } from "./shell/MonitorPane";
import { StatusBar } from "./shell/StatusBar";
import { StoryboardPane } from "./shell/StoryboardPane";
import { TaskPane } from "./shell/TaskPane";
import { type CollectionOption, Toolbar } from "./shell/Toolbar";
import type { CollectionId } from "./store/appStore";
import { describeBackend, describeSave } from "./store/status";
import { useAppStore } from "./store/useAppStore";
import type { Frame } from "./timeline/timeline";
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

// Bis die Wiedergabe angebunden ist (TASK-WEB-010), zeigt der Monitor ein leeres Bild.
const EMPTY_FRAME: Frame = { kind: "empty" };
const noImage = () => undefined;
const noParams = () => ({});

const COLLECTIONS: readonly (CollectionOption & { id: CollectionId })[] = [
  { id: "media", label: "Meine Bilder" },
  { id: "transitions", label: "Videoübergänge" },
];

/*
 * Komponiert das Hauptfenster. Der Zustand liegt im App-Store (store/appStore.ts),
 * der in main.tsx erzeugt und geladen wird.
 */
export function App() {
  const collection = useAppStore((s) => s.collection);
  const setCollection = useAppStore((s) => s.setCollection);
  const backend = useAppStore((s) => s.backend);
  const saveState = useAppStore((s) => s.saveState);

  const collectionName = COLLECTIONS.find((c) => c.id === collection)?.label ?? "";

  return (
    <AppWindow
      title={APP_TITLE}
      menuBar={<MenuBar />}
      toolbar={
        <Toolbar
          collections={COLLECTIONS}
          collection={collection}
          onCollectionChange={(id) => setCollection(id as CollectionId)}
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
        >
          <PreviewCanvas frame={EMPTY_FRAME} images={noImage} params={noParams} />
        </MonitorPane>
      }
      storyboard={<StoryboardPane />}
      statusBar={
        <StatusBar
          items={[describeBackend(backend), describeSave(saveState)].filter(
            (x): x is string => x !== null,
          )}
        />
      }
    />
  );
}
