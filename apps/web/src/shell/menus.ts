/**
 * Menu bar content (spec app-shell "Menüs mit funktionalem Kern").
 * Items without a handler are visible but disabled. Labels come from the
 * message catalogs via the passed `t`.
 */
import type { Translate } from "../i18n/t";

export type MenuEntry =
  | { kind: "separator" }
  | { kind: "item"; id: string; label: string; shortcut?: string; onSelect?: () => void };

export interface MenuDef {
  id: string;
  label: string;
  entries: MenuEntry[];
}

export interface MenuHandlers {
  newProject?: () => void;
  importImages?: () => void;
  /** "Save Movie" wizard; absent when the storyboard is empty (item disabled). */
  saveMovie?: () => void;
  deleteSelection?: () => void;
  /** Bearbeiten → "Rückgängig"; absent while the undo history is empty. */
  undo?: () => void;
  /** Bearbeiten → "Wiederholen"; absent while the redo history is empty. */
  redo?: () => void;
  /** Bearbeiten → "Ausschneiden"/"Kopieren"; absent without a selection. */
  cut?: () => void;
  copy?: () => void;
  /** Bearbeiten → "Einfügen"; absent while the clipboard is empty. */
  paste?: () => void;
  togglePlay?: () => void;
  stop?: () => void;
  about?: () => void;
  /** Tools → Options (language setting). */
  options?: () => void;
  /**
   * Tools → "Install as app…"; absent outside a secure context or when running
   * installed — then the item is absent, not disabled (add-mobile-delivery D7).
   */
  install?: () => void;
  /** Clip → "Fit movie to music"; absent without pictures or music (item disabled). */
  fitToMusic?: () => void;
  /** Clip → "Split"; absent unless a video clip is selected within its own span. */
  split?: () => void;
}

const item = (id: string, label: string, onSelect?: () => void, shortcut?: string): MenuEntry => ({
  kind: "item",
  id,
  label,
  onSelect,
  shortcut,
});
const separator: MenuEntry = { kind: "separator" };

export function buildMenus(h: MenuHandlers, t: Translate): MenuDef[] {
  return [
    {
      id: "file",
      label: t("menu.file.label"),
      entries: [
        item("new-project", t("menu.file.newProject"), h.newProject),
        item("open-project", t("menu.file.openProject")),
        item("save-project", t("menu.file.saveProject")),
        separator,
        item("import", t("menu.file.import"), h.importImages),
        separator,
        item("save-movie", t("menu.file.saveMovie"), h.saveMovie),
        separator,
        item("exit", t("menu.file.exit")),
      ],
    },
    {
      id: "edit",
      label: t("menu.edit.label"),
      entries: [
        item("undo", t("menu.edit.undo"), h.undo, t("menu.keys.undo")),
        item("redo", t("menu.edit.redo"), h.redo, t("menu.keys.redo")),
        separator,
        item("cut", t("menu.edit.cut"), h.cut, t("menu.keys.cut")),
        item("copy", t("menu.edit.copy"), h.copy, t("menu.keys.copy")),
        item("paste", t("menu.edit.paste"), h.paste, t("menu.keys.paste")),
        item("delete", t("menu.edit.delete"), h.deleteSelection, t("menu.keys.delete")),
        separator,
        item("select-all", t("menu.edit.selectAll")),
      ],
    },
    {
      id: "view",
      label: t("menu.view.label"),
      entries: [
        item("timeline", t("menu.view.timeline")),
        item("fullscreen", t("menu.view.fullScreen")),
      ],
    },
    {
      id: "tools",
      label: t("menu.tools.label"),
      entries: [
        item("transitions", t("menu.tools.transitions")),
        item("effects", t("menu.tools.effects")),
        separator,
        item("automovie", t("menu.tools.autoMovie")),
        item("options", t("menu.tools.options"), h.options),
        ...(h.install ? [item("install", t("menu.tools.install"), h.install)] : []),
      ],
    },
    {
      id: "clip",
      label: t("menu.clip.label"),
      entries: [
        item("add-to-storyboard", t("menu.clip.addToStoryboard")),
        item("split", t("menu.clip.split"), h.split),
        separator,
        item("fit-to-music", t("menu.clip.fitToMusic"), h.fitToMusic),
      ],
    },
    {
      id: "play",
      label: t("menu.play.label"),
      entries: [
        item("play-pause", t("menu.play.playPause"), h.togglePlay, t("menu.keys.space")),
        item("stop", t("menu.play.stop"), h.stop),
      ],
    },
    {
      id: "help",
      label: t("menu.help.label"),
      entries: [item("about", t("menu.help.about"), h.about)],
    },
  ];
}
