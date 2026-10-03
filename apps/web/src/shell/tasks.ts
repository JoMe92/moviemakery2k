import type { ComponentType } from "react";
import type { Translate } from "../i18n/t";
import { useT } from "../i18n/useT";
import type { CollectionId, ImportKind } from "../store/appStore";
import { useAppStore } from "../store/useAppStore";
import {
  AudioIcon,
  EffectsIcon,
  FilmIcon,
  FolderIcon,
  type IconProps,
  ImportImageIcon,
  TitleIcon,
  TransitionsIcon,
} from "../ui/icons";
import { useLayoutMode } from "./layoutMode";

/*
 * Task groups of the task pane as data (add-mobile-layout design.md D4).
 * The desktop task pane and the compact taskbar render the same entries with
 * the same activation, so both stay in step.
 */

export type TaskGroupId = "capture" | "edit" | "finish";

export interface TaskEntry {
  id: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** Visible but marked as disabled (aria-disabled); `run` is not called. */
  disabled: boolean;
  run?: () => void;
}

export interface TaskGroupData {
  id: TaskGroupId;
  title: string;
  /** Short label for the taskbar ("1. Capture"). */
  short: string;
  entries: TaskEntry[];
}

/** What the task entries read from and do with the app store. */
export interface TaskContext {
  collection: CollectionId;
  hasSlides: boolean;
  requestImport: (kind: ImportKind) => void;
  setCollection: (id: CollectionId) => void;
  openExportWizard: () => void;
  /**
   * Compact layout only: the collection sheet replaces the collection pane, so
   * importing and showing a collection also open it (design.md D7).
   */
  openCollectionSheet?: () => void;
}

export function buildTaskGroups(ctx: TaskContext, t: Translate): TaskGroupData[] {
  return [
    {
      id: "capture",
      title: t("tasks.capture.title"),
      short: t("tasks.capture.short"),
      entries: [
        {
          id: "importVideo",
          label: t("tasks.capture.importVideo"),
          icon: FilmIcon,
          disabled: false,
          run: () => ctx.requestImport("video"),
        },
        {
          id: "importPictures",
          label: t("tasks.capture.importPictures"),
          icon: ImportImageIcon,
          disabled: false,
          run: () => {
            ctx.requestImport("pictures");
            if (ctx.openCollectionSheet) {
              ctx.setCollection("media");
              ctx.openCollectionSheet();
            }
          },
        },
        {
          id: "importAudio",
          label: t("tasks.capture.importAudio"),
          icon: AudioIcon,
          disabled: false,
          run: () => {
            ctx.requestImport("audio");
            if (ctx.openCollectionSheet) {
              ctx.setCollection("music");
              ctx.openCollectionSheet();
            }
          },
        },
      ],
    },
    {
      id: "edit",
      title: t("tasks.edit.title"),
      short: t("tasks.edit.short"),
      entries: [
        {
          id: "showCollections",
          label: t("tasks.edit.showCollections"),
          icon: FolderIcon,
          disabled: false,
          run: () => {
            ctx.setCollection(
              ctx.collection === "music" || ctx.collection === "video" ? ctx.collection : "media",
            );
            ctx.openCollectionSheet?.();
          },
        },
        {
          id: "showEffects",
          label: t("tasks.edit.showEffects"),
          icon: EffectsIcon,
          disabled: true,
        },
        {
          id: "showTransitions",
          label: t("tasks.edit.showTransitions"),
          icon: TransitionsIcon,
          disabled: false,
          run: () => {
            ctx.setCollection("transitions");
            ctx.openCollectionSheet?.();
          },
        },
        {
          id: "makeTitles",
          label: t("tasks.edit.makeTitles"),
          icon: TitleIcon,
          disabled: true,
        },
      ],
    },
    {
      id: "finish",
      title: t("tasks.finish.title"),
      short: t("tasks.finish.short"),
      entries: [
        {
          id: "saveToComputer",
          label: t("tasks.finish.saveToComputer"),
          icon: FilmIcon,
          disabled: !ctx.hasSlides,
          run: ctx.openExportWizard,
        },
        {
          id: "publishWeb",
          label: t("tasks.finish.publishWeb"),
          icon: FilmIcon,
          disabled: true,
        },
      ],
    },
  ];
}

/** Task groups over the app store, in the current UI language. */
export function useTaskGroups(): TaskGroupData[] {
  const collection = useAppStore((s) => s.collection);
  const hasSlides = useAppStore((s) => s.slides.length > 0);
  const requestImport = useAppStore((s) => s.requestImport);
  const setCollection = useAppStore((s) => s.setCollection);
  const openExportWizard = useAppStore((s) => s.openExportWizard);
  const setSheetOpen = useAppStore((s) => s.setCollectionSheetOpen);
  const compact = useLayoutMode().mode === "compact";
  const { t } = useT();
  return buildTaskGroups(
    {
      collection,
      hasSlides,
      requestImport,
      setCollection,
      openExportWizard,
      openCollectionSheet: compact ? () => setSheetOpen(true) : undefined,
    },
    t,
  );
}
