import { useMemo, useState } from "react";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import { AboutDialog, ConfirmDialog } from "./AppDialogs";
import { MenuBar } from "./MenuBar";
import { buildMenus, type MenuHandlers } from "./menus";
import { OptionsDialog } from "./OptionsDialog";

/** Menüleiste samt der Dialoge, die sie öffnet (Info, Optionen, Neues Projekt). */
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
  const { t } = useT();

  const menus = useMemo(
    () =>
      buildMenus(
        {
          ...extra,
          newProject: () => setConfirmNew(true),
          about: () => setAbout(true),
          options: () => setOptions(true),
          importImages: requestImport,
          saveMovie: hasSlides ? openExportWizard : undefined,
          deleteSelection: selection ? () => removeSlide(selection.slideId) : undefined,
        },
        t,
      ),
    [extra, selection, removeSlide, requestImport, hasSlides, openExportWizard, t],
  );

  return (
    <>
      <MenuBar menus={menus} />
      <AboutDialog open={about} onClose={() => setAbout(false)} />
      <OptionsDialog open={options} onClose={() => setOptions(false)} />
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
