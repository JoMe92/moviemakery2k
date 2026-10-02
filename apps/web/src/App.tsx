import { useMemo } from "react";
import { LibraryPane } from "./media/LibraryPane";
import { MediaCollection } from "./media/MediaCollection";
import { Player } from "./player/Player";
import { AppMenus } from "./shell/AppMenus";
import { AppWindow } from "./shell/AppWindow";
import { StatusBar } from "./shell/StatusBar";
import { StoryboardPane } from "./shell/StoryboardPane";
import { TaskPane } from "./shell/TaskPane";
import { type CollectionOption, Toolbar } from "./shell/Toolbar";
import type { CollectionId } from "./store/appStore";
import { describeBackend, describeSave } from "./store/status";
import { useAppStore } from "./store/useAppStore";
import { StoryboardDnd } from "./storyboard/StoryboardDnd";
import { StoryboardStrip } from "./storyboard/StoryboardStrip";
import { TransitionCollection } from "./transitions/TransitionCollection";
import {
  EffectsIcon,
  FilmIcon,
  FolderIcon,
  ImportImageIcon,
  TitleIcon,
  TransitionsIcon,
} from "./ui/icons";
import { TaskGroup } from "./ui/TaskGroup";
import { TaskLink } from "./ui/TaskLink";

export const APP_TITLE = "moviemakerY2K – Unbenanntes Projekt";

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
  const requestImport = useAppStore((s) => s.requestImport);
  const backend = useAppStore((s) => s.backend);
  const saveState = useAppStore((s) => s.saveState);

  const togglePlay = useAppStore((s) => s.togglePlay);
  const stop = useAppStore((s) => s.stop);
  const playerMenu = useMemo(() => ({ togglePlay, stop }), [togglePlay, stop]);

  const collectionName = COLLECTIONS.find((c) => c.id === collection)?.label ?? "";

  return (
    <StoryboardDnd>
      <AppWindow
        title={APP_TITLE}
        menuBar={<AppMenus extra={playerMenu} />}
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
              <TaskLink icon={<ImportImageIcon />} onClick={requestImport}>
                Bilder importieren
              </TaskLink>
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
          <LibraryPane name={collectionName}>
            {collection === "media" ? <MediaCollection /> : <TransitionCollection />}
          </LibraryPane>
        }
        monitor={<Player />}
        storyboard={
          <StoryboardPane>
            <StoryboardStrip />
          </StoryboardPane>
        }
        statusBar={
          <StatusBar
            items={[describeBackend(backend), describeSave(saveState)].filter(
              (x): x is string => x !== null,
            )}
          />
        }
      />
    </StoryboardDnd>
  );
}
