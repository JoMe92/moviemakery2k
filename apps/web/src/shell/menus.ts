/**
 * Inhalt der Menüleiste (Spec app-shell „Menüs mit funktionalem Kern“).
 * Einträge ohne Handler sind sichtbar, aber deaktiviert.
 */
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
  /** Assistent „Film speichern“; fehlt bei leerem Bildstreifen (Eintrag deaktiviert). */
  saveMovie?: () => void;
  deleteSelection?: () => void;
  togglePlay?: () => void;
  stop?: () => void;
  about?: () => void;
}

const item = (id: string, label: string, onSelect?: () => void, shortcut?: string): MenuEntry => ({
  kind: "item",
  id,
  label,
  onSelect,
  shortcut,
});
const separator: MenuEntry = { kind: "separator" };

export function buildMenus(h: MenuHandlers): MenuDef[] {
  return [
    {
      id: "file",
      label: "Datei",
      entries: [
        item("new-project", "Neues Projekt", h.newProject),
        item("open-project", "Projekt öffnen…"),
        item("save-project", "Projekt speichern"),
        separator,
        item("import", "In Sammlungen importieren…", h.importImages),
        separator,
        item("save-movie", "Film speichern…", h.saveMovie),
        separator,
        item("exit", "Beenden"),
      ],
    },
    {
      id: "edit",
      label: "Bearbeiten",
      entries: [
        item("undo", "Rückgängig"),
        item("redo", "Wiederholen"),
        separator,
        item("cut", "Ausschneiden"),
        item("copy", "Kopieren"),
        item("paste", "Einfügen"),
        item("delete", "Löschen", h.deleteSelection, "Entf"),
        separator,
        item("select-all", "Alles auswählen"),
      ],
    },
    {
      id: "view",
      label: "Ansicht",
      entries: [item("timeline", "Zeitachse"), item("fullscreen", "Vollbild")],
    },
    {
      id: "tools",
      label: "Extras",
      entries: [
        item("transitions", "Videoübergänge"),
        item("effects", "Videoeffekte"),
        separator,
        item("automovie", "AutoMovie…"),
        item("options", "Optionen…"),
      ],
    },
    {
      id: "clip",
      label: "Clip",
      entries: [item("add-to-storyboard", "Zum Storyboard hinzufügen"), item("split", "Teilen")],
    },
    {
      id: "play",
      label: "Wiedergabe",
      entries: [
        item("play-pause", "Wiedergabe/Pause", h.togglePlay, "Leertaste"),
        item("stop", "Stopp", h.stop),
      ],
    },
    {
      id: "help",
      label: "Hilfe",
      entries: [item("about", "Info", h.about)],
    },
  ];
}
