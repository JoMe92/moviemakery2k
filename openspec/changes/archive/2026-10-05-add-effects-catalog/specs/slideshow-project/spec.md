## MODIFIED Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen und
einer Musikspur (Spec music-track) bestehen. Jedes Bildstreifen-Element ist
ein Bild-Element mit einer Anzeigedauer (0,5–60 s in Schritten von 0,25 s,
Standard 5,0 s) oder ein Videoclip-Element mit `trimIn`/`trimOut`; dessen
Anzeigedauer folgt ausschließlich aus `trimOut − trimIn`. Jedes Element MAY
zusätzlich genau eine Effekt-Katalog-ID tragen (Spec video-effects, Feld
`effectId`, Standard `null`). Jedes Element außer dem ersten MAY genau
einen eingehenden Übergang vom vorherigen Element haben, bestehend aus
Katalog-ID und Dauer (0,25–5 s in Schritten von 0,25 s, Standard: Wert aus
dem Katalog). Der Übergang gehört zu dem Element, in das er überblendet
(wie in Movie Maker), unabhängig von dessen Art. Ein Medium MAY mehrfach im
Bildstreifen vorkommen. Das gespeicherte Projekt MUST die Schema-Version 4
tragen. Ein gespeichertes Projekt mit Schema-Version 3 MUST beim Laden
übernommen werden, wobei jedes Element `effectId: null` bekommt; Projekte
mit Schema-Version 2 bzw. 1 MUST wie bisher migriert werden.

#### Scenario: Ungültiges Projekt wird abgelehnt
- **WHEN** ein Client ein Projekt speichern will, das auf ein unbekanntes
  Medium, eine unbekannte Übergangs-ID oder eine unbekannte Effekt-ID
  verweist, ein Audio-Medium in den Bildstreifen oder ein Bild in die
  Musikspur setzt, eine Dauer außerhalb des Bereichs enthält oder bei einem
  Videoclip-Element `trimIn ≥ trimOut` bzw. `trimOut` größer als die
  Videodauer setzt
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab, und
  das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Projekt aus Version 0.1
- **WHEN** das Backend ein mit Schema-Version 1 gespeichertes Projekt lädt
- **THEN** liefert es Bildstreifen, Dauern und Übergänge unverändert mit
  leerer Musikspur und speichert es bei der nächsten Änderung als
  Schema-Version 4

#### Scenario: Projekt aus Version 2
- **WHEN** das Backend ein mit Schema-Version 2 gespeichertes Projekt lädt
- **THEN** gilt jedes seiner Bildstreifen-Elemente als Bild-Element mit
  seiner bisherigen Anzeigedauer, und das Projekt wird bei der nächsten
  Änderung als Schema-Version 4 gespeichert

#### Scenario: Projekt aus Version 3
- **WHEN** das Backend ein mit Schema-Version 3 gespeichertes Projekt lädt
- **THEN** bekommt jedes seiner Elemente `effectId: null`, und das Projekt
  wird bei der nächsten Änderung als Schema-Version 4 gespeichert

### Requirement: Bildstreifen bearbeiten
Benutzer MUST Elemente im Storyboard per Drag & Drop umsortieren, ein
Element auswählen und mit Entf, über das Kontextmenü oder über Bearbeiten →
Löschen entfernen können. Die Anzeigedauer eines Elements MUST über einen
Eigenschaftendialog (Doppelklick oder Kontextmenü) änderbar sein. Jede
Storyboard-Kachel MUST Thumbnail, laufende Nummer und Dauer zeigen sowie
einen Effekt-Platz (Spec video-effects): Ziehen eines Eintrags aus der
Sammlung „Videoeffekte“ auf diesen Platz setzt den Effekt, ein
Kontextmenü-Eintrag „Keinen Effekt“ entfernt ihn; ist ein Effekt gesetzt,
MUST die Kachel ein kleines Symbol darauf zeigen.

#### Scenario: Umsortieren
- **WHEN** ein Benutzer das dritte Element an die erste Position zieht
- **THEN** ist es das erste Element; sein eingehender Übergang entfällt, weil
  das erste Element keinen Vorgänger hat, alle anderen Elemente behalten ihren
  eingehenden Übergang

#### Scenario: Dauer ändern
- **WHEN** ein Benutzer für ein Element die Dauer 2,5 s einträgt und bestätigt
- **THEN** zeigt die Kachel 2,5 s, und die Gesamtdauer im Monitor
  aktualisiert sich

#### Scenario: Dauer außerhalb des Bereichs
- **WHEN** ein Benutzer 0,1 s einträgt
- **THEN** wird der Wert nicht übernommen, und der Dialog nennt den erlaubten
  Bereich

#### Scenario: Effekt setzen
- **WHEN** ein Benutzer „Sepia“ aus der Sammlung „Videoeffekte“ auf den
  Effekt-Platz eines Bild-Elements zieht
- **THEN** zeigt die Kachel das Effekt-Symbol, und der Monitor zeigt dieses
  Element künftig mit angewendetem Sepia-Effekt

#### Scenario: Effekt entfernen
- **WHEN** ein Benutzer bei einem Element mit gesetztem Effekt über das
  Kontextmenü „Keinen Effekt“ wählt
- **THEN** verschwindet das Effekt-Symbol von der Kachel, und das Element
  erscheint wieder unverändert
