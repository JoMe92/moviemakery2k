/**
 * German message catalog (design.md D1). `satisfies Messages` makes a missing
 * or an extra key a type error.
 */
import type { Messages } from "./types";

export const de = {
  app: {
    name: "moviemakerY2K",
  },
  language: {
    de: "Deutsch",
    en: "English",
  },
  options: {
    title: "Optionen",
    language: "Sprache der Benutzeroberfläche:",
  },
  shell: {
    windowTitle: "{app} – Unbenanntes Projekt",
    taskPane: "Filmaufgaben",
    toolbar: "Symbolleiste",
    collections: "Sammlungen:",
    collection: "Sammlung: {name}",
    collectionPrefix: "Sammlung:",
    preview: "Vorschau",
    storyboard: "Storyboard",
    showTimeline: "Zeitachse anzeigen",
    storyboardHint: "Ziehen Sie Bilder hierher, um eine Diashow zu erstellen.",
  },
  collections: {
    media: "Meine Bilder",
    transitions: "Videoübergänge",
  },
  menu: {
    bar: "Menüleiste",
    file: {
      label: "Datei",
      newProject: "Neues Projekt",
      openProject: "Projekt öffnen…",
      saveProject: "Projekt speichern",
      import: "In Sammlungen importieren…",
      saveMovie: "Film speichern…",
      exit: "Beenden",
    },
    edit: {
      label: "Bearbeiten",
      undo: "Rückgängig",
      redo: "Wiederholen",
      cut: "Ausschneiden",
      copy: "Kopieren",
      paste: "Einfügen",
      delete: "Löschen",
      selectAll: "Alles auswählen",
    },
    view: {
      label: "Ansicht",
      timeline: "Zeitachse",
      fullScreen: "Vollbild",
    },
    tools: {
      label: "Extras",
      transitions: "Videoübergänge",
      effects: "Videoeffekte",
      autoMovie: "AutoMovie…",
      options: "Optionen…",
    },
    clip: {
      label: "Clip",
      addToStoryboard: "Zum Storyboard hinzufügen",
      split: "Teilen",
    },
    play: {
      label: "Wiedergabe",
      playPause: "Wiedergabe/Pause",
      stop: "Stopp",
    },
    help: {
      label: "Hilfe",
      about: "Info",
    },
    keys: {
      delete: "Entf",
      space: "Leertaste",
    },
  },
  tasks: {
    capture: {
      title: "1. Aufnehmen",
      importVideo: "Video importieren",
      importPictures: "Bilder importieren",
      importAudio: "Audio oder Musik importieren",
    },
    edit: {
      title: "2. Film bearbeiten",
      showCollections: "Sammlungen anzeigen",
      showEffects: "Videoeffekte anzeigen",
      showTransitions: "Videoübergänge anzeigen",
      makeTitles: "Titel oder Nachspann erstellen",
    },
    finish: {
      title: "3. Film fertig stellen",
      saveToComputer: "Auf dem Computer speichern",
      publishWeb: "Im Web veröffentlichen",
    },
  },
  status: {
    connecting: "Verbinde mit Backend…",
    offline: "Backend nicht erreichbar",
    ready: "Backend bereit · FFmpeg {version}",
    readyNoFfmpeg: "Backend bereit · FFmpeg fehlt",
    saving: "Wird gespeichert…",
    saved: "Gespeichert",
    saveFailed: "Speichern fehlgeschlagen",
  },
  about: {
    title: "Info über {app}",
    version: "Version {version}",
    text: "{app} ist vom klassischen Movie Maker inspiriert. Es ist kein Microsoft-Produkt und steht in keiner Verbindung zu Microsoft.",
    license: "Lizenz: {license}",
  },
  newProject: {
    title: "Neues Projekt",
    message:
      "Möchten Sie ein neues Projekt beginnen? Der Bildstreifen wird geleert; die Bilder in der Sammlung bleiben erhalten.",
  },
  common: {
    ok: "OK",
    cancel: "Abbrechen",
    close: "Schließen",
    yes: "Ja",
    no: "Nein",
    back: "< Zurück",
    next: "Weiter >",
  },
  units: {
    seconds: "{value} s",
    kilobytes: "ca. {value} KB",
    megabytes: "ca. {value} MB",
    secondsCount: { one: "{count} Sekunde", other: "{count} Sekunden" },
    minutesCount: { one: "{count} Minute", other: "{count} Minuten" },
  },
} satisfies Messages;
