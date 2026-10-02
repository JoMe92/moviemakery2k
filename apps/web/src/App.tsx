import { useMemo } from "react";
import { SaveMovieWizardFromStore } from "./export/SaveMovieWizard";
import { useT } from "./i18n/useT";
import { LibraryPane } from "./media/LibraryPane";
import { MediaCollection } from "./media/MediaCollection";
import { MusicTrack } from "./musictrack/MusicTrack";
import { Player } from "./player/Player";
import { AppMenus } from "./shell/AppMenus";
import { AppWindow } from "./shell/AppWindow";
import { StatusBar } from "./shell/StatusBar";
import { StoryboardPane } from "./shell/StoryboardPane";
import { TaskPane } from "./shell/TaskPane";
import { Toolbar } from "./shell/Toolbar";
import type { CollectionId } from "./store/appStore";
import { describeBackend, describeSave } from "./store/status";
import { useAppStore } from "./store/useAppStore";
import { StoryboardDnd } from "./storyboard/StoryboardDnd";
import { StoryboardStrip } from "./storyboard/StoryboardStrip";
import { TransitionCollection } from "./transitions/TransitionCollection";
import {
  AudioIcon,
  EffectsIcon,
  FilmIcon,
  FolderIcon,
  ImportImageIcon,
  TitleIcon,
  TransitionsIcon,
} from "./ui/icons";
import { TaskGroup } from "./ui/TaskGroup";
import { TaskLink } from "./ui/TaskLink";

const COLLECTION_IDS: readonly CollectionId[] = ["media", "music", "transitions"];

/*
 * Composes the main window. State lives in the app store (store/appStore.ts),
 * which is created and loaded in main.tsx.
 */
export function App() {
  const collection = useAppStore((s) => s.collection);
  const setCollection = useAppStore((s) => s.setCollection);
  const requestImport = useAppStore((s) => s.requestImport);
  const backend = useAppStore((s) => s.backend);
  const saveState = useAppStore((s) => s.saveState);
  const hasSlides = useAppStore((s) => s.slides.length > 0);
  const openExportWizard = useAppStore((s) => s.openExportWizard);

  const togglePlay = useAppStore((s) => s.togglePlay);
  const stop = useAppStore((s) => s.stop);
  const playerMenu = useMemo(() => ({ togglePlay, stop }), [togglePlay, stop]);

  const { t } = useT();
  const collections = useMemo(
    () => COLLECTION_IDS.map((id) => ({ id, label: t(`collections.${id}`) })),
    [t],
  );
  const collectionName = t(`collections.${collection}`);

  return (
    <StoryboardDnd>
      <AppWindow
        title={t("shell.windowTitle", { app: t("app.name") })}
        menuBar={<AppMenus extra={playerMenu} />}
        toolbar={
          <Toolbar
            collections={collections}
            collection={collection}
            onCollectionChange={(id) => setCollection(id as CollectionId)}
          />
        }
        taskPane={
          <TaskPane>
            <TaskGroup title={t("tasks.capture.title")}>
              <TaskLink icon={<FilmIcon />} disabled>
                {t("tasks.capture.importVideo")}
              </TaskLink>
              <TaskLink icon={<ImportImageIcon />} onClick={() => requestImport("pictures")}>
                {t("tasks.capture.importPictures")}
              </TaskLink>
              <TaskLink icon={<AudioIcon />} onClick={() => requestImport("audio")}>
                {t("tasks.capture.importAudio")}
              </TaskLink>
            </TaskGroup>
            <TaskGroup title={t("tasks.edit.title")}>
              <TaskLink
                icon={<FolderIcon />}
                onClick={() => setCollection(collection === "music" ? "music" : "media")}
              >
                {t("tasks.edit.showCollections")}
              </TaskLink>
              <TaskLink icon={<EffectsIcon />} disabled>
                {t("tasks.edit.showEffects")}
              </TaskLink>
              <TaskLink icon={<TransitionsIcon />} onClick={() => setCollection("transitions")}>
                {t("tasks.edit.showTransitions")}
              </TaskLink>
              <TaskLink icon={<TitleIcon />} disabled>
                {t("tasks.edit.makeTitles")}
              </TaskLink>
            </TaskGroup>
            <TaskGroup title={t("tasks.finish.title")}>
              <TaskLink icon={<FilmIcon />} disabled={!hasSlides} onClick={openExportWizard}>
                {t("tasks.finish.saveToComputer")}
              </TaskLink>
              <TaskLink icon={<FilmIcon />} disabled>
                {t("tasks.finish.publishWeb")}
              </TaskLink>
            </TaskGroup>
          </TaskPane>
        }
        collection={
          <LibraryPane name={collectionName}>
            {collection === "transitions" ? (
              <TransitionCollection />
            ) : (
              <MediaCollection key={collection} kind={collection === "music" ? "audio" : "image"} />
            )}
          </LibraryPane>
        }
        monitor={<Player />}
        storyboard={
          <StoryboardPane musicTrack={<MusicTrack />}>
            <StoryboardStrip />
          </StoryboardPane>
        }
        statusBar={
          <StatusBar
            items={[describeBackend(backend, t), describeSave(saveState, t)].filter(
              (x): x is string => x !== null,
            )}
          />
        }
      />
      <SaveMovieWizardFromStore />
    </StoryboardDnd>
  );
}
