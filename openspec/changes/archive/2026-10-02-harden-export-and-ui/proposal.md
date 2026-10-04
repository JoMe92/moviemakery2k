## Why

Bei Umsetzung, Review und einem Rundgang durch `develop` nach `add-movie-export`
und `add-ui-localisation` sind Funde aufgetaucht: als Discoveries auf den Beads,
aus Code-Reviews und aus der Bedienung. Einige verletzen die Spec (Export auf
Linux aarch64 ist versprochen, aber nicht lauffähig), andere führen zu
falschen Ergebnissen (Medium während des Exports gelöscht → schwarzes Bild,
Farbraum des MP4 nicht gekennzeichnet) oder zu Verwirrung (Demo-Animation statt
Projekt in der Vorschau). Dazu kommen Lücken in Qualitätsprüfung und Wartung.
Dieser Change sammelt alle Funde (design.md, Context) und behebt sie.

## What Changes

- **Export auf Linux aarch64** (z. B. Raspberry Pi): Pixi-Plattform
  `linux-aarch64`, Mesa/llvmpipe dort, CI-Prüfung auf einem ARM-Runner.
- **Farbraum des Exports:** Umrechnung nach BT.709 und Kennzeichnung im MP4,
  damit Player die Farben wie in der Vorschau zeigen.
- **Löschen von Medien während eines Exports wird blockiert** (Code
  `media.inUseByExport`), statt dass das Bild schwarz im Film landet.
- **Fertige Exporte überstehen einen Neustart** des Backends (kleiner
  Job-Index); Aufräumen und Aufbewahrung werden atomar.
- **Einheitliche Fehlerfelder** in Upload-Ergebnis und Export-Job
  (`errorCode`, `errorParams`, `message`). **BREAKING (API).**
- **Fehlercodes als Teil des API-Vertrags** (Aufzählung in OpenAPI); die
  Oberfläche prüft die Vollständigkeit ihrer Übersetzungen beim Typecheck statt
  über das Einlesen von Python-Quelltext.
- **422-Meldungen nennen wieder das betroffene Bild** („Bild 2: …“).
- **Vorschau in der Übergangssammlung:** Die Demo-Animation läuft nur nach
  ausdrücklicher Auswahl einer Kachel und ist als Demo gekennzeichnet; sonst
  zeigt der Monitor das Projekt.
- **Barrierefreiheit und Sprache:** eindeutige Namen der Schaltflächen in
  Dialogen; `<html lang>` stimmt schon vor dem Laden der App.
- **Wartung:** Lint auch für `e2e/` und `scripts/`, englische Kommentare in
  `e2e/`, Pillow-Deprecation, dnd-kit-Version gepinnt, `glcontext`-Start ohne
  Compiler-Aufruf, Golden-Frame-Kreuzvergleich mit Muster für Pixelate, Doku.

## Capabilities

### New Capabilities

(keine)

### Modified Capabilities

- `movie-export`: Farbraum BT.709, Plattform aarch64, Exporte über Neustart,
  atomare Aufbewahrung
- `media-library`: Löschen blockiert, solange ein Export das Medium nutzt
- `localization`: einheitliche Fehlerfelder, Fehlercodes im Vertrag,
  Bildnummer in 422-Meldungen, `<html lang>` vor dem Laden
- `transitions`: Demo-Animation nur nach Auswahl, gekennzeichnet
- `app-shell`: eindeutige zugängliche Namen in Dialogen

## Nicht-Ziele

- Neue Funktionen (Musik, Videoclips, Effekte, Titel); Musik folgt als eigener
  Change.
- Export unter macOS oder Windows offiziell unterstützen.
- Weitere Sprachen.
- Die Prozess-Themen außerhalb dieses Repos: Bead-Token-Groß-/Kleinschreibung
  (`mmy-6p8`) und Beads-Sync aus der Cloud (`mmy-3sw`, Nogging #25/#26)
  gehören nach Nogging; das Bereinigen der Git-Historie (`mmy-80g`) führt der
  PO mit dem vorhandenen Skript aus.
- Ein Release; 0.2.0 wird nach diesem Change separat vorbereitet.
