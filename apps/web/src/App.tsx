import { useMemo } from "react";
import { SaveMovieWizardFromStore } from "./export/SaveMovieWizard";
import { useT } from "./i18n/useT";
import { CollectionSheet } from "./media/CollectionSheet";
import { ImportInput } from "./media/ImportInput";
import { LibraryPane } from "./media/LibraryPane";
import { MediaCollection } from "./media/MediaCollection";
import { UploadPanel } from "./media/UploadPanel";
import { MusicTrack } from "./musictrack/MusicTrack";
import { Player } from "./player/Player";
import { InstallInstructionsDialog } from "./pwa/InstallInstructionsDialog";
import { AccessDialog } from "./shell/AccessDialog";
import { ActionBar } from "./shell/ActionBar";
import { AppMenus } from "./shell/AppMenus";
import { AppWindow } from "./shell/AppWindow";
import { CompactWindow } from "./shell/CompactWindow";
import { useLayoutAttributes, useLayoutMode } from "./shell/layoutMode";
import { StatusBar } from "./shell/StatusBar";
import { NoAccessIndicator, SaveFailedIndicator, StatusNotices } from "./shell/StatusNotices";
import { StoryboardPane } from "./shell/StoryboardPane";
import { Taskbar } from "./shell/Taskbar";
import { TaskPane } from "./shell/TaskPane";
import { Toolbar } from "./shell/Toolbar";
import { useTaskGroups } from "./shell/tasks";
import type { CollectionId } from "./store/appStore";
import { describeBackend, describeSave } from "./store/status";
import { useAppStore } from "./store/useAppStore";
import { StoryboardDnd } from "./storyboard/StoryboardDnd";
import { StoryboardStrip } from "./storyboard/StoryboardStrip";
import { TimelineView } from "./storyboard/TimelineView";
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
  const timelineView = useAppStore((s) => s.timelineView);

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
      {timelineView ? <TimelineView /> : <StoryboardStrip />}
    </StoryboardPane>
  );

  if (layout.mode === "compact") {
    return (
      <StoryboardDnd>
        <CompactWindow
          title={title}
          orientation={layout.orientation}
          indicators={
            <>
              <NoAccessIndicator />
              <SaveFailedIndicator />
            </>
          }
          menuButton={<AppMenus variant="sheet" extra={playerMenu} />}
          monitor={<Player />}
          editing={
            <>
              {storyboard}
              <UploadPanel />
            </>
          }
          actionBar={<ActionBar />}
          taskbar={<Taskbar />}
          notices={<StatusNotices />}
        />
        <ImportInput />
        <CollectionSheet />
        <SaveMovieWizardFromStore />
        <AccessDialog />
        <InstallInstructionsDialog />
      </StoryboardDnd>
    );
  }

  const medium = layout.mode === "medium";
  return (
    <StoryboardDnd>
      <AppWindow
        variant={medium ? "medium" : "wide"}
        title={title}
        menuBar={<AppMenus extra={playerMenu} />}
        toolbar={
          <Toolbar
            collections={collections}
            collection={collection}
            onCollectionChange={(id) => setCollection(id as CollectionId)}
          />
        }
        taskPane={medium ? undefined : <TaskPane groups={taskGroups} />}
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
          medium ? undefined : (
            <StatusBar
              items={[describeBackend(backend, t), describeSave(saveState, t)].filter(
                (x): x is string => x !== null,
              )}
            />
          )
        }
        indicators={
          medium ? (
            <>
              <NoAccessIndicator />
              <SaveFailedIndicator />
            </>
          ) : undefined
        }
        taskbar={medium ? <Taskbar /> : undefined}
        actionBar={<ActionBar />}
        notices={medium ? <StatusNotices /> : undefined}
      />
      <SaveMovieWizardFromStore />
      <AccessDialog />
      <InstallInstructionsDialog />
    </StoryboardDnd>
  );
}
