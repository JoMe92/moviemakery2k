import { useDndMonitor } from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { useInstallAction } from "../pwa/install";
import { projectMusicDuration } from "../store/appStore";
import { useAppStore, useAppStoreApi } from "../store/useAppStore";
import { canFitToMusic } from "../timeline/fitToMusic";
import { AboutDialog, ConfirmDialog } from "./AppDialogs";
import { FitToMusicDialog, type FitToMusicNotice } from "./FitToMusicDialog";
import { matchShortcut } from "./globalShortcuts";
import { MenuBar } from "./MenuBar";
import { MenuSheet } from "./MenuSheet";
import { buildMenus, type MenuHandlers } from "./menus";
import { OptionsDialog } from "./OptionsDialog";

export interface AppMenusProps {
  extra?: MenuHandlers;
  /** `bar`: desktop menu bar; `sheet`: "☰" button with the menu sheet (compact layout). */
  variant?: "bar" | "sheet";
}

/** Menu bar (or menu sheet) together with the dialogs it opens (About, Options, New Project). */
export function AppMenus({ extra = {}, variant = "bar" }: AppMenusProps) {
  const [about, setAbout] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [options, setOptions] = useState(false);
  const newProject = useAppStore((s) => s.newProject);
  const removeSlide = useAppStore((s) => s.removeSlide);
  const selection = useAppStore((s) => s.selection);
  const musicSelection = useAppStore((s) => s.musicSelection);
  const removeMusicClip = useAppStore((s) => s.removeMusicClip);
  const requestImport = useAppStore((s) => s.requestImport);
  const hasSlides = useAppStore((s) => s.slides.length > 0);
  const openExportWizard = useAppStore((s) => s.openExportWizard);
  const [fitNotice, setFitNotice] = useState<FitToMusicNotice | null>(null);
  const fitToMusic = useAppStore((s) => s.fitToMusic);
  const musicLength = useAppStore((s) => projectMusicDuration(s.music, s.media));
  const canFit = useAppStore((s) => canFitToMusic(s.slides.length, musicLength));
  const canUndo = useAppStore((s) => s.undoStack.length > 0);
  const canRedo = useAppStore((s) => s.redoStack.length > 0);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canPaste = useAppStore((s) => s.clipboard !== null);
  const cut = useAppStore((s) => s.cut);
  const copy = useAppStore((s) => s.copy);
  const paste = useAppStore((s) => s.paste);
  const installApp = useInstallAction();
  const { t } = useT();

  const menus = useMemo(
    () =>
      buildMenus(
        {
          ...extra,
          newProject: () => setConfirmNew(true),
          about: () => setAbout(true),
          options: () => setOptions(true),
          install: installApp,
          importImages: () => requestImport("any"),
          saveMovie: hasSlides ? openExportWizard : undefined,
          // Picture or music clip, whichever is selected (the selections are exclusive).
          deleteSelection: selection
            ? () => removeSlide(selection.slideId)
            : musicSelection !== null
              ? () => removeMusicClip(musicSelection)
              : undefined,
          undo: canUndo ? undo : undefined,
          redo: canRedo ? redo : undefined,
          // Cut/copy the current selection, whichever row it is in (design.md D6).
          cut: selection || musicSelection !== null ? cut : undefined,
          copy: selection || musicSelection !== null ? copy : undefined,
          paste: canPaste ? paste : undefined,
          fitToMusic: canFit
            ? () => {
                const result = fitToMusic();
                if (result.kind === "tooLong" || result.kind === "tooShort") {
                  const { kind, reachable } = result;
                  setFitNotice({ kind, music: musicLength, reachable });
                }
              }
            : undefined,
        },
        t,
      ),
    [
      extra,
      selection,
      removeSlide,
      musicSelection,
      removeMusicClip,
      requestImport,
      hasSlides,
      openExportWizard,
      canFit,
      fitToMusic,
      musicLength,
      canUndo,
      canRedo,
      undo,
      redo,
      canPaste,
      cut,
      copy,
      paste,
      installApp,
      t,
    ],
  );

  // Global shortcuts (design.md D3): Strg+Z/Y/Umschalt+Z and Strg+X/C/V, not
  // while typing or dragging. Menu items stay the equally usable alternative.
  const storeApi = useAppStoreApi();
  const draggingRef = useRef(false);
  useDndMonitor({
    onDragStart: () => {
      draggingRef.current = true;
    },
    onDragEnd: () => {
      draggingRef.current = false;
    },
    onDragCancel: () => {
      draggingRef.current = false;
    },
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchShortcut(event, { dragging: draggingRef.current });
      if (!action) return;
      event.preventDefault();
      storeApi.getState()[action]();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [storeApi]);

  return (
    <>
      {variant === "sheet" ? <MenuSheet menus={menus} /> : <MenuBar menus={menus} />}
      <AboutDialog open={about} onClose={() => setAbout(false)} />
      <OptionsDialog open={options} onClose={() => setOptions(false)} />
      <FitToMusicDialog notice={fitNotice} onClose={() => setFitNotice(null)} />
      <ConfirmDialog
        open={confirmNew}
        title={t("newProject.title")}
        message={t("newProject.message")}
        onConfirm={() => {
          setConfirmNew(false);
          newProject();
        }}
        onCancel={() => setConfirmNew(false)}
      />
    </>
  );
}
