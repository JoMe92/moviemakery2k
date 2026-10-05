# titles-and-credits Specification

## Purpose
Titel und Nachspann: der Katalog der benannten Stile, der Titel-Assistent,
das Rendering in den drei Phasen (Entrance → Main → Exit) und der
Nachspann-Scroll. Ein Titel steht als eigenes Element im Bildstreifen oder
als Overlay auf einem Bild- oder Videoclip-Element.

## Requirements

### Requirement: Titel-Katalog
Das System MUST einen Katalog von Titel-/Nachspann-Stilen bereitstellen,
den Frontend und Backend gemeinsam nutzen (analog den Katalogen der Specs
transitions und video-effects). Jeder Eintrag MUST eine stabile ID, einen
deutschen und einen englischen Anzeigenamen, ein Layout
(`one-line`/`two-line`/`credits`) und je Phase (Entrance, Main, Exit) einen
Effekt mit Parametern enthalten. Das Backend MUST den Katalog über die API
ausliefern und MUST beim Start abbrechen, wenn der Katalog ungültig ist.
Der Katalog MUST genau diese acht Einträge enthalten: Basic Title, Fly In,
Zoom In, Subtitle (alle `one-line`), Fade In and Out, Fly In Fades (beide
`two-line`), Scroll Up Stacked, Fade In and Out (Nachspann) (beide
`credits`).

#### Scenario: Katalog abrufen
- **WHEN** ein Client den Titel-Katalog abruft
- **THEN** erhält er acht Einträge mit ID, deutschem und englischem Namen,
  Layout und den Phasen-Effekten

#### Scenario: Ungültiger Katalog
- **WHEN** ein Katalogeintrag ohne englischen Namen ausgeliefert werden
  soll
- **THEN** startet das Backend nicht und nennt den fehlerhaften Eintrag

### Requirement: Titel-Assistent
Der Aufgabenbereich-Eintrag „Titel oder Nachspann erstellen“ MUST einen
modalen Y2K-Assistenten mit den Schritten „Platzierung“, „Text“, „Stil“ und
„Farbe“ öffnen, bedienbar mit „Zurück“, „Weiter“ und „Abbrechen“ sowie
vollständig per Tastatur. Die Platzierung MUST unter „Am Filmanfang“, „Vor
dem gewählten Element“ (nur verfügbar, wenn ein Element ausgewählt ist),
„Auf dem gewählten Element“ (nur verfügbar, wenn ein Bild- oder
Videoclip-Element ausgewählt ist) und „Am Filmende“ wählen lassen. Der
Schritt „Stil“ MUST eine Live-Vorschau im Monitor zeigen. Nach „Fertig“
MUST der Titel an der gewählten Stelle erscheinen und automatisch
ausgewählt sein.

#### Scenario: Titel am Filmanfang
- **WHEN** ein Benutzer den Assistenten öffnet, „Am Filmanfang“, einen
  einzeiligen Text, den Stil „Basic Title“ und eine Farbe wählt und
  „Fertig“ bestätigt
- **THEN** erscheint ein neues Titel-Element vor dem ersten bisherigen
  Element, mit 5 s Dauer und dem gewählten Text, Stil und Farbe

#### Scenario: Titel auf einem Clip
- **WHEN** ein Benutzer ein Bild-Element auswählt, den Assistenten öffnet,
  „Auf dem gewählten Element“ wählt, Text und Stil „Subtitle“ eingibt und
  „Fertig“ bestätigt
- **THEN** zeigt dieses Element den Titel als Überlagerung, ohne die
  Elementliste zu verändern oder die Dauer des Elements zu ändern

#### Scenario: Platzierung „Auf dem Clip“ nicht verfügbar
- **WHEN** ein Benutzer ohne Auswahl den Assistenten öffnet
- **THEN** ist „Vor dem gewählten Element“ und „Auf dem gewählten Element“
  nicht verfügbar; nur „Am Filmanfang“ und „Am Filmende“ lassen sich wählen

### Requirement: Phasen-Rendering
Ein Titel-Element oder ein Overlay-Titel MUST in drei Phasen gerendert
werden: Entrance, Main und Exit, jede mit eigener Position, Zoom und
optionalem Effekt gemäß ihrem Katalogeintrag. Bei einem Overlay-Titel MUST
der Text alpha-erhaltend über das bereits gerenderte Bild gezeichnet werden
(Still-, Übergangs- und Effekt-Durchgänge bleiben unverändert); bei einem
freistehenden Titel-Element MUST der Hintergrund (schwarz) Teil der
gerenderten Bildquelle sein. Vorschau und Export MUST dasselbe Ergebnis
zeigen (dieselbe gebündelte Schriftart, derselbe Katalog).

#### Scenario: Fly-In-Entrance
- **WHEN** ein Titel-Element mit Stil „Fly In“ zu Beginn seiner Anzeigedauer
  steht
- **THEN** bewegt sich der Text während der Entrance-Phase von außerhalb
  des Bildes an seine Endposition in der Bildmitte

#### Scenario: Overlay über einem Übergang
- **WHEN** ein Overlay-Titel auf einem Element liegt, das gerade in einem
  Übergang zum nächsten Element steht
- **THEN** bleibt der Titeltext über der gesamten Übergangsdauer sichtbar
  und bewegt sich unabhängig vom Übergang gemäß seinen eigenen Phasen

#### Scenario: Export entspricht der Vorschau
- **WHEN** ein Projekt mit einem Titel-Element exportiert wird
- **THEN** zeigt die exportierte Datei an dieser Stelle denselben Text,
  dieselbe Schrift und dieselbe Animation wie die Vorschau

### Requirement: Nachspann-Scroll
Ein Nachspann-Element mit Stil „Scroll Up Stacked“ MUST seine Einträge
während der Main-Phase kontinuierlich von unten nach oben durch das Bild
bewegen, mit Fade-Rändern an Entrance und Exit. Die Rasterung der
Nachspann-Liste MUST auf ihre tatsächliche Inhaltshöhe skalieren, auch wenn
diese die Bildhöhe übersteigt.

#### Scenario: Lange Nachspann-Liste
- **WHEN** eine Nachspann-Liste mit 20 Einträgen und dem Stil „Scroll Up
  Stacked“ über 10 s Dauer abgespielt wird
- **THEN** sind zu Beginn die ersten Einträge und am Ende die letzten
  Einträge sichtbar, mit einer gleichmäßigen Bewegung dazwischen

#### Scenario: Statischer Nachspann
- **WHEN** ein Nachspann-Element mit Stil „Fade In and Out (Nachspann)“
  angezeigt wird
- **THEN** steht die gesamte Liste unbewegt im Bild und blendet nur am
  Anfang und Ende ein bzw. aus

### Requirement: Begrenzter Titeltext
Jedes Eingabefeld für Titeltext MUST die Eingabe auf dieselbe Länge je
Zeile begrenzen, die das Backend für eine Titelzeile erzwingt (200
Zeichen). Das MUST für die Zeilenfelder und die Nachspann-Einträge des
Titel-Assistenten ebenso gelten wie für das Filmtitel-Feld des
AutoMovie-Dialogs (Spec automovie). Am Limit MUST das Feld weitere
Zeichen ablehnen und vorhandenen Text unverändert lassen; eingefügter
längerer Text MUST auf die Grenze beschnitten werden. Die Anwendung MUST
kein Titel-Element und kein Overlay erzeugen können, dessen Zeile länger
als die Grenze ist.

#### Scenario: Zeile am Limit
- **WHEN** ein Benutzer im Schritt „Text“ des Titel-Assistenten 200
  Zeichen eingegeben hat und weitertippt
- **THEN** bleibt der Text bei 200 Zeichen, und „Fertig“ erzeugt ein
  Titel-Element, das das Backend annimmt

#### Scenario: Zu langer Filmtitel
- **WHEN** ein Benutzer einen 500 Zeichen langen Text in das
  Filmtitel-Feld des AutoMovie-Dialogs einfügt und einen Stil erstellt
- **THEN** trägt das Titel-Element am Anfang die ersten 200 Zeichen, und
  das Projekt wird ohne Fehler gespeichert

#### Scenario: Nachspann-Eintrag am Limit
- **WHEN** ein Benutzer einen Nachspann-Eintrag über 200 Zeichen hinaus
  verlängern will
- **THEN** nimmt das Feld keine weiteren Zeichen an, und die übrigen
  Einträge bleiben unverändert
