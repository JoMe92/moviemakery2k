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
  media: {
    emptyHint:
      "Diese Sammlung ist leer. Wählen Sie „Bilder importieren“ oder ziehen Sie Bilder hierher.",
    list: "Bilder",
    draggable: "ziehbares Bild",
    menu: "Bild „{name}“",
    addToStoryboard: "Zum Storyboard hinzufügen",
    delete: "Löschen",
    deleteTitle: "Bild löschen",
    deleteQuestion:
      "Möchten Sie „{name}“ wirklich löschen? Es wird auch aus dem Storyboard entfernt.",
    deleteFailed: "„{name}“ konnte nicht gelöscht werden.",
  },
  upload: {
    progress: "Importiere {current} von {total} …",
    progressLabel: "Importfortschritt",
    failed: {
      one: "{count} Datei wurde nicht importiert:",
      other: "{count} Dateien wurden nicht importiert:",
    },
    unknownError: "Fehler",
    offline: "Backend nicht erreichbar.",
  },
  storyboard: {
    list: "Bildstreifen",
    sortable: "verschiebbare Kachel",
    missingImage: "fehlendes Bild",
    slide: "Bild {number}: {name}, {duration}",
    slideMenu: "Bild {number} des Storyboards",
    effectSlot: "Effekt-Platz für Bild {number}",
    effectsLater: "Videoeffekte folgen später",
    transitionBefore: "Übergang vor Bild {number}",
    noTransition: "keiner (harter Schnitt)",
    remove: "Entfernen",
    properties: "Eigenschaften…",
    removeTransition: "Übergang entfernen",
    slideProperties: "Eigenschaften von Bild {number}",
    slideDuration: "Bilddauer (Sekunden):",
    transitionDuration: "Übergangsdauer (Sekunden):",
    transition: "Übergang:",
  },
  dnd: {
    element: "Element",
    transition: "Übergang „{name}“",
    picture: "Bild „{name}“",
    pickedUp:
      "{item} aufgenommen. Pfeiltasten bewegen, Eingabe- oder Leertaste legt ab, Escape bricht ab.",
    overSlot: "Über dem Übergangsplatz vor Bild {number}.",
    overStoryboard: "Über dem Storyboard.",
    outside: "Außerhalb des Storyboards.",
    dropped: "{item} abgelegt.",
    noTarget: "Ablegen abgebrochen: kein Ziel.",
    cancelled: "Ziehen abgebrochen.",
    instructions:
      "Eingabetaste nimmt das Element auf. Mit den Pfeiltasten verschieben (aus der Sammlung: Pfeil nach unten ins Storyboard), Eingabe- oder Leertaste legt ab, Escape bricht ab.",
  },
  transitions: {
    unavailable: "Der Übergangskatalog ist nicht verfügbar.",
    list: "Übergänge",
    draggable: "ziehbarer Übergang",
  },
  player: {
    seek: "Suchleiste",
    play: "Wiedergabe",
    pause: "Pause",
    stop: "Stopp",
    previous: "Vorheriges Bild",
    next: "Nächstes Bild",
    time: "Zeit",
    canvas: "Vorschaubild",
    webgl2Missing: "Die Vorschau benötigt WebGL2. Import und Storyboard funktionieren weiterhin.",
  },
  duration: {
    range: "Erlaubt sind {min} bis {max} Sekunden in Schritten von {step}.",
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
