## Why

Extras → „AutoMovie…“ ist sichtbar, aber ohne Funktion. Movie Maker 2.x
konnte aus der Mediensammlung automatisch einen fertigen Film mit einem
gewählten Stil bauen. Diese Change ist rein kombinatorisch: Sie führt keine
neue Render-Technik ein, sondern reiht vorhandene Bausteine automatisch
aneinander — Übergänge (`add-transition-catalog`), Effekte
(`add-effects-catalog`), Titel (`add-titles-and-credits`) und die bereits
bestehende „Film an Musik anpassen“-Logik (`fitToMusic.ts`). Der Product
Owner hat ein MVP von drei Stilen festgelegt, statt die vollständige
Stil-Bibliothek des Originals nachzubilden.

## What Changes

- **AutoMovie-Dialog:** Filmtitel eingeben, einen von drei Stilen wählen
  (mit kurzer Beschreibung), „Erstellen“ — fragt nach, wenn der
  Bildstreifen nicht leer ist (wie „Neues Projekt“), da AutoMovie ihn
  ersetzt.
- **Drei Stile**, jeweils mit festem Übergang, optionalem Effekt und
  Titel-Stil für Anfang/Ende:
  - **Klassisch:** Überblenden zwischen allen Elementen, kein Effekt,
    Titel „Basic Title“ am Anfang mit dem eingegebenen Filmtitel, „Basic
    Title“ mit „Ende“/„The End“ am Schluss.
  - **Alter Film:** Auflösen zwischen allen Elementen, Effekt
    „Film-Alterung Älter“ auf jedem Bild- und Videoclip-Element, sonst wie
    Klassisch.
  - **Musikvideo:** Kreis zwischen allen Elementen, kein Effekt, Titel
    „Zoom In“ am Anfang; setzt Musik voraus (deaktiviert ohne Musikspur)
    und passt die Gesamtlänge an die Musik an.
- **Algorithmus:** Alle Bilder und Videoclips aus der Mediensammlung in
  Importreihenfolge in den Bildstreifen, stilabhängiger Übergang zwischen
  allen benachbarten Elementen, stilabhängiger Effekt auf jedem Bild-/
  Videoclip-Element, Start- und Endtitel, bei Musik: „Film an Musik
  anpassen“ auf das Ergebnis angewendet.

## Capabilities

### New Capabilities

- `automovie`: AutoMovie-Katalog (3 Stile), AutoMovie-Dialog, automatische
  Erstellung aus der Mediensammlung

### Modified Capabilities

- `app-shell`: Extras → „AutoMovie…“ wird funktional

## Nicht-Ziele

- Weitere Original-Stile über die drei MVP-Stile hinaus (spätere Erweiterung
  mit denselben Bausteinen, kein neuer Mechanismus nötig).
- Eine eigene Medien-Auswahl für AutoMovie (es nutzt immer die gesamte
  Sammlung); kein Ausschließen einzelner Medien in dieser Change.
- Automatische Szenenerkennung oder intelligente Clip-Auswahl — die
  Reihenfolge ist schlicht die Importreihenfolge.
- Nachträgliches Bearbeiten als „AutoMovie-Projekt“ mit besonderem Status —
  das Ergebnis ist ein gewöhnliches Projekt, das sich wie jedes andere
  weiterbearbeiten lässt.
