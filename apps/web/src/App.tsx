import { useMemo } from "react";
import { SaveMovieWizardFromStore } from "./export/SaveMovieWizard";
import { useT } from "./i18n/useT";
import { ImportInput } from "./media/ImportInput";
import { LibraryPane } from "./media/LibraryPane";
import { MediaCollection } from "./media/MediaCollection";
import { UploadPanel } from "./media/UploadPanel";
import { MusicTrack } from "./musictrack/MusicTrack";
import { Player } from "./player/Player";
import { AppMenus } from "./shell/AppMenus";
import { AppWindow } from "./shell/AppWindow";
import { CompactWindow } from "./shell/CompactWindow";
import { useLayoutAttributes, useLayoutMode } from "./shell/layoutMode";
import { StatusBar } from "./shell/StatusBar";
import { SaveFailedIndicator, StatusNotices } from "./shell/StatusNotices";
import { StoryboardPane } from "./shell/StoryboardPane";
import { Taskbar } from "./shell/Taskbar";
import { TaskPane } from "./shell/TaskPane";
import { useTaskGroups } from "./shell/tasks";
import { Toolbar } from "./shell/Toolbar";
import type { CollectionId } from "./store/appStore";
import { describeBackend, describeSave } from "./store/status";
import { useAppStore } from "./store/useAppStore";
import { StoryboardDnd } from "./storyboard/StoryboardDnd";
import { StoryboardStrip } from "./storyboard/StoryboardStrip";
import { TransitionCollection } from "./transitions/TransitionCollection";

const COLLECTION_IDS: readonly CollectionId[] = ["media", "music", "video", "transitions"];

/*
 * Composes the main window. State lives in the app store (store/appStore.ts),
 * which is created and loaded in main.tsx.
 */
export function App() {
  const collection = useAppStore((s) => s.collection);
  const setCollection = useAppStore((s) => s.setCollection);
  const backend = useAppStore((s) => s.backend);
  const saveState = useAppStore((s) => s.saveState);

  const togglePlay = useAppStore((s) => s.togglePlay);
  const stop = useAppStore((s) => s.stop);
  const playerMenu = useMemo(() => ({ togglePlay, stop }), [togglePlay, stop]);

  const layout = useLayoutMode();
  useLayoutAttributes(layout);

  const taskGroups = useTaskGroups();
  const { t } = useT();
  const collections = useMemo(
    () => COLLECTION_IDS.map((id) => ({ id, label: t(`collections.${id}`) })),
    [t],
  );
  const collectionName = t(`collections.${collection}`);

  const title = t("shell.windowTitle", { app: t("app.name") });
  const storyboard = (
    <StoryboardPane musicTrack={<MusicTrack />}>
      <StoryboardStrip />
    </StoryboardPane>
  );

  if (layout.mode === "compact") {
    return (
      <StoryboardDnd>
        <CompactWindow
          title={title}
          orientation={layout.orientation}
          indicators={<SaveFailedIndicator />}
          monitor={<Player />}
          editing={
            <>
              {storyboard}
              <UploadPanel />
            </>
          }
          taskbar={<Taskbar />}
          notices={<StatusNotices />}
        />
        <ImportInput />
        <SaveMovieWizardFromStore />
      </StoryboardDnd>
    );
  }

  return (
    <StoryboardDnd>
      <AppWindow
        title={title}
        menuBar={<AppMenus extra={playerMenu} />}
        toolbar={
          <Toolbar
            collections={collections}
            collection={collection}
            onCollectionChange={(id) => setCollection(id as CollectionId)}
          />
        }
        taskPane={<TaskPane groups={taskGroups} />}
        collection={
          <LibraryPane name={collectionName}>
            {collection === "transitions" ? (
              <TransitionCollection />
            ) : (
              <MediaCollection
                key={collection}
                kind={collection === "music" ? "audio" : collection === "video" ? "video" : "image"}
              />
            )}
          </LibraryPane>
        }
        monitor={<Player />}
        storyboard={storyboard}
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
