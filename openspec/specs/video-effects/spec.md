# video-effects Specification

## Purpose
Der Katalog der Video-Effekte und ihr sichtbares Verhalten: höchstens ein
Effekt je Bild- oder Videoclip-Element, in Vorschau und Export aus demselben
Shader gerechnet, und die Sammlung „Videoeffekte“, aus der er auf den
Effekt-Platz einer Storyboard-Kachel gezogen wird.

## Requirements

### Requirement: Effekt-Katalog
Das System MUST einen Katalog von Video-Effekten bereitstellen, den
Frontend und Backend gemeinsam nutzen (analog dem Übergangskatalog der Spec
transitions). Jeder Eintrag MUST eine stabile ID, einen deutschen und einen
englischen Anzeigenamen, seine Parameter mit festen Werten und die Quelle
der Parameter enthalten. Die Oberfläche MUST den Namen in der gewählten
Sprache zeigen. Das Backend MUST den Katalog über die API ausliefern und
MUST beim Start abbrechen, wenn der Katalog ungültig ist. Der Katalog MUST
genau diese 21 Einträge enthalten: Sepia, Negative, Posterisieren,
Schwellenwert, Schwarzweiß, Helligkeit+, Helligkeit−, Unschärfe, Verpixeln,
Film-Alterung Alt, Film-Alterung Älter, Film-Alterung Am ältesten,
Filmkörnung, Kohlestift, Federzeichnung, Aquarell, Spiegeln horizontal,
Spiegeln vertikal, Rotieren 90°, Rotieren 180°, Rotieren 270°.

#### Scenario: Katalog abrufen
- **WHEN** ein Client den Effekt-Katalog abruft
- **THEN** erhält er 21 Einträge mit ID, deutschem und englischem Namen,
  Parametern und Quelle

#### Scenario: Ungültiger Katalog
- **WHEN** ein Katalogeintrag ohne englischen Namen ausgeliefert werden soll
- **THEN** startet das Backend nicht und nennt den fehlerhaften Eintrag

### Requirement: Effekt auf ein Element anwenden
Ein Bildstreifen-Element (Bild- oder Videoclip-Element) MAY genau einen
Effekt aus dem Katalog tragen. Vorschau und Export MUST den Effekt
identisch anwenden: ein zusätzlicher Rendering-Durchgang mit genau einer
Eingabetextur liefert das Ergebnis, bevor es wie bisher in den
Still-/Übergangs-Durchgang geht. Ohne gesetzten Effekt MUST sich an der
Darstellung nichts ändern.

#### Scenario: Effekt in der Vorschau
- **WHEN** ein Benutzer den Effekt „Schwarzweiß“ auf ein Bild-Element setzt
- **THEN** zeigt der Vorschaumonitor dieses Element entsättigt, auch während
  eines Übergangs davon oder dorthin

#### Scenario: Effekt im Export
- **WHEN** ein Projekt mit einem Element mit gesetztem Effekt „Sepia“
  exportiert wird
- **THEN** zeigt die exportierte Datei an dieser Stelle densel­ben
  sepiafarbenen Frame wie die Vorschau

#### Scenario: Effekt auf einen Videoclip
- **WHEN** ein Benutzer den Effekt „Unschärfe“ auf ein Videoclip-Element
  setzt
- **THEN** ist jeder Frame dieses Videoclips in Vorschau und Export
  unscharf, unabhängig vom aktuellen `trimIn`/`trimOut`

### Requirement: Sammlung „Videoeffekte“
Die Sammlung „Videoeffekte“ MUST alle Katalogeinträge als Kacheln mit Namen
und einem eigenen Vorschausymbol zeigen. Ein Doppelklick auf eine Kachel
MUST den Effekt am eingebauten Beispielbild demonstrieren, gekennzeichnet
mit dem Namen des Effekts; Wiedergabe, Suchen oder die Auswahl eines
Elements im Bildstreifen MUST den Monitor zum Projekt zurückbringen (wie bei
„Videoübergänge“).

#### Scenario: Effekt ansehen
- **WHEN** ein Benutzer in der Sammlung „Videoeffekte“ doppelt auf „Sepia“
  klickt
- **THEN** zeigt der Monitor das Beispielbild mit angewendetem
  Sepia-Effekt und dem Hinweis „Beispiel: Sepia“
