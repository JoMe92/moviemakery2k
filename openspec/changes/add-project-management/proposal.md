## Why

moviemakerY2K hat im Bearbeiten-Menü bereits die Einträge „Rückgängig“,
„Wiederholen“, „Ausschneiden“, „Kopieren“ und „Einfügen“ sowie im Datei-Menü
„Projekt öffnen…“ und „Projekt speichern“ — alle sichtbar, aber ohne Funktion
(`openspec/specs/app-shell/spec.md`: „Alle anderen Menüeinträge MUST sichtbar
und deaktiviert sein“). Die Feature-Lückenanalyse gegen Windows Movie Maker
2.x (Orchestrator, 2026-10-03) hat diese Projektverwaltung als eigenständigen
Bereich mit drei fehlenden Originalfunktionen identifiziert. Der Product
Owner hat entschieden, sie als erste von neun geplanten Nachzieh-Changes
umzusetzen — vor den im README bereits priorisierten Bereichen (Übergänge,
Effekte, Titel, Videoclips, Timeline) —, damit spätere Bearbeitungsfunktionen
von Anfang an rückgängig machbar sind, statt nachträglich dafür nachgerüstet
zu werden.

Der Product Owner hat den Umfang zugleich bewusst eingeschränkt: Mehrere
benannte Projekte („Projekt öffnen…“/„Projekt speichern“) bleiben draußen,
weil das Backend heute genau ein implizites Projekt pro Datenverzeichnis
automatisch speichert und ein Projekt-Picker ein deutlich größerer Eingriff
wäre, dessen Nutzen für ein lokales Einzelplatz-Werkzeug zweifelhaft ist.
Dieser Change liefert nur Rückgängig/Wiederholen und
Ausschneiden/Kopieren/Einfügen.

## What Changes

- **Rückgängig/Wiederholen:** Jede Änderung am Bildstreifen oder an der
  Musikspur lässt sich über Bearbeiten → „Rückgängig“/„Wiederholen“ oder
  Strg+Z / Strg+Y (bzw. Strg+Umschalt+Z) zurücknehmen und wiederherstellen,
  mindestens 50 Schritte weit. Eine neue Änderung nach einem Rückgängig
  verwirft den Wiederholen-Verlauf. Der Verlauf lebt nur im Browser-Tab und
  beginnt nach einem Neuladen wieder leer.
- **Ausschneiden/Kopieren/Einfügen:** Ein ausgewähltes Bildstreifen-Element
  oder Musikstück lässt sich ausschneiden oder kopieren und an anderer
  Stelle wieder einfügen — über das Bearbeiten-Menü oder Strg+X/C/V. Ein
  eingefügtes Bild hat zunächst keinen eingehenden Übergang (harter Schnitt,
  wie beim Hinzufügen aus der Sammlung).
- **Globale Tastenkürzel:** Ein anwendungsweiter Tastatur-Handler setzt die
  obigen Kürzel um und greift nicht, während der Fokus in einem Eingabefeld
  liegt (dort gilt weiter das native Zwischenablage-Verhalten des Browsers).
- **Menüzustand:** Die neu funktionalen Einträge werden je nach Verlauf,
  Auswahl bzw. Zwischenablage-Inhalt aktiviert/deaktiviert; „Projekt
  öffnen…“, „Projekt speichern“ und „Alles auswählen“ bleiben wie bisher
  sichtbar, aber deaktiviert.

## Capabilities

### New Capabilities

- `edit-commands`: Rückgängig/Wiederholen-Verlauf für Bildstreifen und
  Musikspur, interne Zwischenablage für Ausschneiden/Kopieren/Einfügen eines
  Elements, globale Tastenkürzel

### Modified Capabilities

- `app-shell`: Bearbeiten → „Rückgängig“, „Wiederholen“, „Ausschneiden“,
  „Kopieren“, „Einfügen“ werden funktional; „Projekt öffnen…“, „Projekt
  speichern“ und „Alles auswählen“ bleiben explizit deaktiviert

## Nicht-Ziele

- Mehrere benannte Projekte, Datei öffnen/speichern, ein Projekt-Picker
  (PO-Entscheidung 2026-10-03; eigene, spätere Change, falls gewünscht).
- Bearbeiten → „Alles auswählen“ und Mehrfachauswahl beim
  Ausschneiden/Kopieren (das bestehende Auswahlmodell ist exklusiv: genau ein
  Bild oder ein Musikstück).
- Ein Verlauf, der über ein Neuladen der Seite hinaus erhalten bleibt, oder
  serverseitiges Undo.
- Rückgängig machen von Medienimport oder -löschung (Sammlung) — nur
  Änderungen am Bildstreifen und an der Musikspur sind betroffen.
- Ein System-Zwischenablage (OS-Clipboard) oder Austausch der Zwischenablage
  zwischen Browser-Tabs; die Zwischenablage ist interner Anwendungszustand.
- Änderungen am Projekt-Schema, an der API oder am Export (dieser Change ist
  rein clientseitig im Web).
