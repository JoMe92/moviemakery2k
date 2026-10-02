import { useMemo, useState } from "react";
import { useT } from "../i18n/useT";
import { projectMusicDuration } from "../store/appStore";
import { useAppStore } from "../store/useAppStore";
import { canFitToMusic } from "../timeline/fitToMusic";
import { AboutDialog, ConfirmDialog } from "./AppDialogs";
import { FitToMusicDialog, type FitToMusicNotice } from "./FitToMusicDialog";
import { MenuBar } from "./MenuBar";
import { buildMenus, type MenuHandlers } from "./menus";
import { OptionsDialog } from "./OptionsDialog";

/** Menu bar together with the dialogs it opens (About, Options, New Project). */
export function AppMenus({ extra = {} }: { extra?: MenuHandlers }) {
  const [about, setAbout] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [options, setOptions] = useState(false);
  const newProject = useAppStore((s) => s.newProject);
  const removeSlide = useAppStore((s) => s.removeSlide);
  const selection = useAppStore((s) => s.selection);
  const requestImport = useAppStore((s) => s.requestImport);
  const hasSlides = useAppStore((s) => s.slides.length > 0);
  const openExportWizard = useAppStore((s) => s.openExportWizard);
  const [fitNotice, setFitNotice] = useState<FitToMusicNotice | null>(null);
  const fitToMusic = useAppStore((s) => s.fitToMusic);
  const musicLength = useAppStore((s) => projectMusicDuration(s.music, s.media));
  const canFit = useAppStore((s) => canFitToMusic(s.slides.length, musicLength));
  const { t } = useT();

  const menus = useMemo(
    () =>
      buildMenus(
        {
          ...extra,
          newProject: () => setConfirmNew(true),
          about: () => setAbout(true),
          options: () => setOptions(true),
          importImages: () => requestImport("any"),
          saveMovie: hasSlides ? openExportWizard : undefined,
          deleteSelection: selection ? () => removeSlide(selection.slideId) : undefined,
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
      requestImport,
      hasSlides,
      openExportWizard,
      canFit,
      fitToMusic,
      musicLength,
      t,
    ],
  );

  return (
    <>
      <MenuBar menus={menus} />
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
