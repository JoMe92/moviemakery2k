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
