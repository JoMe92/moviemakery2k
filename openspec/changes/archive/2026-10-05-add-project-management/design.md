## Context

Stand: `develop` nach `add-slideshow-mvp`, `add-movie-export`,
`add-ui-localisation`, `harden-export-and-ui` und `add-music-track`
(archiviert). `add-mobile-layout` und `add-mobile-delivery` laufen noch auf
eigenen, unintegrierten Branches und sind hier nicht Grundlage — diese Change
betrifft Store und Menüs unabhängig vom Layout-Modus.

Das Projekt ist ein einziges Dokument (`schemaVersion: 2`, `slides` und
`music`), das `PUT /api/project` jeweils vollständig ersetzt und das Backend
etwa eine Sekunde nach jeder Änderung automatisch speichert
(`slideshow-project`, `music-track`). Der Zustand-Store (`appStore.ts`) hält
`slides`, `music`, `selection` und `musicSelection` exklusiv (genau ein Bild
*oder* ein Musikstück ausgewählt, nie beides). Verliert ein ausgewähltes
Element seinen Platz, räumt der Store die Auswahl bereits heute automatisch
auf (siehe `set({ selection: stillThere ? selection : null, ... })`).
Bearbeiten → „Rückgängig/Wiederholen/Ausschneiden/Kopieren/Einfügen“ und
Datei → „Projekt öffnen…/Projekt speichern“ sind laut `app-shell`-Spec
sichtbar, aber ohne `onSelect` verdrahtete Platzhalter. Tastenkürzel sind
bisher rein kosmetisch (`shortcut`-Text im Menü, z. B. „Entf“ bei Löschen);
ein anwendungsweiter `keydown`-Dispatcher existiert noch nicht, nur
lokale Handler in einzelnen Komponenten.

Vorgaben des Product Owners (2026-10-03):

- Erste von neun geplanten Changes aus der WMM-2.x-Lückenanalyse; Reihenfolge:
  Projektverwaltung → Videoclip-Import → Timeline → Übergänge → Effekte →
  Titel/Nachspann → Audio/Narration → AutoMovie → Veröffentlichung.
- Nur Rückgängig/Wiederholen und Ausschneiden/Kopieren/Einfügen; Mehrprojekt
  (Datei öffnen/speichern) bleibt draußen.

Standardwerte, vom Planning Agent festgelegt (im PR änderbar): Verlaufstiefe
50 Schritte; Wiederholen über Strg+Y *und* Strg+Umschalt+Z (beide gängig);
der Verlauf lebt nur im Arbeitsspeicher des Tabs.

## Goals / Non-Goals

**Goals:** Jede heute mögliche Änderung an Bildstreifen und Musikspur ist
rückgängig machbar und wiederholbar; ein Bildstreifen-Element oder
Musikstück lässt sich ausschneiden, kopieren und einfügen; Automatik
(Autosave, Validierung, Export) bleibt unverändert; keine Backend- oder
Schema-Änderung.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Verlaufsmodell
Ein Snapshot-Stack statt Command-Pattern: Vor jeder projektverändernden
Store-Aktion legt der Store den *vorherigen* Zustand von `{slides, music}`
auf den Undo-Stack (höchstens 50 Einträge, der älteste fällt beim
Überlauf heraus) und leert den Redo-Stack. `undo()` schiebt den aktuellen
Zustand auf den Redo-Stack und stellt den obersten Undo-Eintrag wieder her;
`redo()` arbeitet spiegelbildlich. Gesnapshotet wird nur das, was auch
`PUT /api/project` sendet (`slides`, `music`) — nicht `selection` und
`musicSelection`; diese werden wie bei jeder anderen Projektänderung über die
bereits vorhandene „existiert das ausgewählte Element noch?“-Prüfung neu
bestimmt. Der Verlauf ist reiner Tab-Zustand: Er übersteht weder ein
Neuladen noch wird er zum Backend übertragen.

### D2 – Granularität
Ein Undo-Schritt entspricht genau einer bereits heute „bestätigten“
Mutation — derselben Grenze, an der auch automatisch gespeichert wird (z. B.
Dauer-Dialog mit „OK“ bestätigt, ein abgeschlossenes Umsortieren, Übergang
gesetzt oder entfernt, Musikstück hinzugefügt/entfernt/gekürzt, Lautstärke
oder Blende geändert). Zwischenstände während eines Zieh-Vorgangs oder eines
noch offenen Dialogfelds erzeugen keinen eigenen Schritt — erst der
Store-Aufruf beim Abschluss tut das.

### D3 – Globale Tastenkürzel
Ein einzelner `keydown`-Listener auf Anwendungsebene (`App.tsx`) behandelt
Strg+Z (Rückgängig), Strg+Y sowie Strg+Umschalt+Z (Wiederholen) und
Strg+X/C/V (Ausschneiden/Kopieren/Einfügen). Er greift nicht, wenn
`event.target` ein `<input>`, `<textarea>` oder ein editierbares Element ist
(dort bleibt das native Zwischenablage- und Eingabeverhalten des Browsers
unverändert) und nicht während eines laufenden Drags. Die Menüeinträge bleiben
gleichwertig bedienbar; die Tastenkürzel-Texte im Menü (`menu.keys.*`) werden
entsprechend ergänzt (`de`: „Strg+Z“ usw., `en`: „Ctrl+Z“ usw.).

### D4 – Zwischenablage-Modell
Ein interner Zustand (kein System-Clipboard) hält höchstens **ein** Element
mit seiner Art (`slide` oder `musicClip`); jedes Kopieren oder Ausschneiden
ersetzt den bisherigen Inhalt unabhängig von dessen Art — wie bei der
Betriebssystem-Zwischenablage. Kopiert wird nur der Elementinhalt
(Medienverweis und Anzeigedauer bzw. Kürzung, Lautstärke, Blenden), nie ein
eingehender Übergang, da der zum Platz gehört, nicht zum Bild (siehe
`slideshow-project`: „Der Übergang gehört zu dem Element, in das er
überblendet“). Ausschneiden ist Kopieren gefolgt vom bestehenden Entfernen
und erzeugt dafür genau einen Undo-Schritt, nicht zwei.

### D5 – Einfügeposition
Einfügen legt immer in der zur Art der Zwischenablage passenden Reihe ab
(ein kopiertes Bild in den Bildstreifen, ein kopiertes Musikstück in die
Musikspur) — unabhängig davon, was aktuell ausgewählt ist. Ist ein Element
derselben Art ausgewählt, fügt Einfügen direkt danach ein; sonst an das Ende
der jeweiligen Reihe. Das neu eingefügte Element wird automatisch
ausgewählt, wie beim Hinzufügen aus der Sammlung.

### D6 – Menü- und Aktivierungszustand
Rückgängig ist aktiviert, solange der Undo-Stack nicht leer ist; Wiederholen
entsprechend für den Redo-Stack. Ausschneiden und Kopieren sind aktiviert,
solange eine Auswahl besteht (Bild oder Musikstück); Einfügen ist aktiviert,
solange die Zwischenablage gefüllt ist. „Projekt öffnen…“, „Projekt
speichern“ und „Alles auswählen“ bleiben wie bisher sichtbar und deaktiviert
(Nicht-Ziele).
