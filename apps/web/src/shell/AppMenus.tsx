import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { AboutDialog, ConfirmDialog } from "./AppDialogs";
import { MenuBar } from "./MenuBar";
import { buildMenus, type MenuHandlers } from "./menus";

/** Menüleiste samt der Dialoge, die sie öffnet (Info, Neues Projekt). */
export function AppMenus({ extra = {} }: { extra?: MenuHandlers }) {
  const [about, setAbout] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const newProject = useAppStore((s) => s.newProject);
  const removeSlide = useAppStore((s) => s.removeSlide);
  const selection = useAppStore((s) => s.selection);
  const requestImport = useAppStore((s) => s.requestImport);

  const menus = useMemo(
    () =>
      buildMenus({
        ...extra,
        newProject: () => setConfirmNew(true),
        about: () => setAbout(true),
        importImages: requestImport,
        deleteSelection: selection ? () => removeSlide(selection.slideId) : undefined,
      }),
    [extra, selection, removeSlide, requestImport],
  );

  return (
    <>
      <MenuBar menus={menus} />
      <AboutDialog open={about} onClose={() => setAbout(false)} />
      <ConfirmDialog
        open={confirmNew}
        title="Neues Projekt"
        message="Möchten Sie ein neues Projekt beginnen? Der Bildstreifen wird geleert; die Bilder in der Sammlung bleiben erhalten."
        onConfirm={() => {
          setConfirmNew(false);
          newProject();
        }}
        onCancel={() => setConfirmNew(false)}
      />
    </>
  );
}
