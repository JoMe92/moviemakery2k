# slideshow-project Specification

## Purpose
Das Filmprojekt: der geordnete Bildstreifen aus Bild-, Videoclip- und
Titel-Elementen mit ihren Dauern, Effekten und Übergängen, seine Bearbeitung
im Storyboard (Umsortieren, Kürzen, Teilen) sowie automatisches Speichern und
Wiederherstellen.

## Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen,
einer Musikspur (Spec music-track) und einer Erzählungsspur (Spec
narration-track) bestehen. Jedes Bildstreifen-Element ist ein Bild-Element
(Anzeigedauer 0,5–60 s in Schritten von 0,25 s, Standard 5,0 s), ein
Videoclip-Element (`trimIn` und `trimOut` in Sekunden,
`0 ≤ trimIn < trimOut ≤` Videodauer; dessen Anzeigedauer folgt
ausschließlich aus `trimOut − trimIn`) oder ein Titel-Element (Spec
titles-and-credits: `lines` oder `creditEntries`, `styleId`, Anzeigedauer
wie ein Bild-Element). Jedes Bild- oder Videoclip-Element MAY zusätzlich
genau eine Effekt-Katalog-ID (`effectId`, Spec video-effects) und genau
einen Overlay-Titel (`title`: `lines`, `styleId`, oder `null`) tragen; ein
Titel-Element selbst MUST NOT zusätzlich einen Overlay-Titel tragen. Jedes
Element außer dem ersten MAY genau einen eingehenden Übergang vom
vorherigen Element haben, bestehend aus Katalog-ID und Dauer (0,25–5 s in
Schritten von 0,25 s, Standard: Wert aus dem Katalog); der Übergang gehört
zu dem Element, in das er überblendet (wie in Movie Maker), unabhängig von
dessen Art. Ein Medium MAY mehrfach im Bildstreifen vorkommen. Ein Projekt
MUST zusätzlich ein Feld `clipAudioBalance` (0–100, Standard 50) tragen:
den globalen Pegel zwischen dem Ton von Videoclips (100) und Musik plus
Erzählung zusammen (0). Das gespeicherte Projekt MUST die Schema-Version 6
tragen. Ein gespeichertes Projekt mit Schema-Version 5 MUST beim Laden
übernommen werden, wobei es eine leere Erzählungsspur und
`clipAudioBalance: 50` bekommt; Projekte mit früheren Versionen MUST wie
bisher stufenweise migriert werden.

#### Scenario: Ungültiges Projekt wird abgelehnt
- **WHEN** ein Client ein Projekt speichern will, das auf ein unbekanntes
  Medium, eine unbekannte Übergangs-, Effekt- oder Titel-Stil-ID verweist,
  ein Bild- oder Video-Medium in die Erzählungs- oder Musikspur setzt,
  eine Dauer, einen Trim oder eine Erzählungs-Startzeit außerhalb des
  Bereichs enthält oder `clipAudioBalance` außerhalb von 0–100 setzt
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab,
  und das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Projekt aus Version 0.1
- **WHEN** das Backend ein mit Schema-Version 1 gespeichertes Projekt lädt
- **THEN** liefert es Bildstreifen, Dauern und Übergänge unverändert mit
  leerer Musik- und Erzählungsspur und `clipAudioBalance: 50` und speichert
  es bei der nächsten Änderung als Schema-Version 6

#### Scenario: Projekt aus Version 2
- **WHEN** das Backend ein mit Schema-Version 2 gespeichertes Projekt lädt
- **THEN** gilt jedes seiner Bildstreifen-Elemente als Bild-Element mit
  seiner bisherigen Anzeigedauer, und das Projekt wird bei der nächsten
  Änderung als Schema-Version 6 gespeichert

#### Scenario: Projekt aus Version 3
- **WHEN** das Backend ein mit Schema-Version 3 gespeichertes Projekt lädt
- **THEN** bekommt jedes seiner Elemente `effectId: null`, und das Projekt
  wird bei der nächsten Änderung als Schema-Version 6 gespeichert

#### Scenario: Projekt aus Version 4
- **WHEN** das Backend ein mit Schema-Version 4 gespeichertes Projekt lädt
- **THEN** bekommt jedes seiner Elemente `title: null`, und das Projekt
  wird bei der nächsten Änderung als Schema-Version 6 gespeichert

#### Scenario: Projekt aus Version 5
- **WHEN** das Backend ein mit Schema-Version 5 gespeichertes Projekt lädt
- **THEN** bekommt es eine leere Erzählungsspur und `clipAudioBalance: 50`,
  und das Projekt wird bei der nächsten Änderung als Schema-Version 6
  gespeichert

#### Scenario: Titel-Element im Bildstreifen
- **WHEN** ein Benutzer über den Titel-Assistenten ein Titel-Element vor
  dem zweiten bisherigen Element einfügt
- **THEN** steht es an Position 2 im Bildstreifen, hat eine eigene
  Anzeigedauer und verweist auf kein Medium

### Requirement: Bilder in den Bildstreifen ziehen
Benutzer MUST Bilder aus der Sammlung per Drag & Drop an eine beliebige
Position im Storyboard ziehen können. Eine Einfügemarke MUST die Zielposition
anzeigen. Ein Doppelklick auf eine Kachel in der Sammlung MUST das Bild ans
Ende anhängen. Dasselbe MUST per Tastatur möglich sein.

#### Scenario: Einfügen zwischen zwei Bildern
- **WHEN** ein Benutzer ein Bild aus der Sammlung zwischen das erste und das
  zweite Element des Bildstreifens zieht
- **THEN** steht das Bild an Position 2, und die übrigen Elemente rücken nach

#### Scenario: Anhängen per Doppelklick
- **WHEN** ein Benutzer in der Sammlung doppelt auf ein Bild klickt
- **THEN** wird es als letztes Element mit der Standarddauer angehängt

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

### Requirement: Übergänge setzen und entfernen
Zwischen zwei Storyboard-Kacheln MUST ein Übergangsplatz sichtbar sein. Ein
Benutzer MUST einen Übergang aus dem Übergangskatalog per Drag & Drop auf
diesen Platz setzen können; ein vorhandener Übergang wird dabei ersetzt. Über
den Übergangsplatz (Doppelklick oder Kontextmenü) MUST sich die
Übergangsdauer ändern und der Übergang entfernen lassen. Ein leerer Platz
bedeutet harter Schnitt.

#### Scenario: Übergang setzen
- **WHEN** ein Benutzer „Kreis“ aus dem Katalog auf den Platz zwischen Bild 1
  und Bild 2 zieht
- **THEN** zeigt der Platz das Symbol und den Namen von „Kreis“ mit seiner
  Standarddauer, und bei der Wiedergabe läuft dort dieser Übergang

#### Scenario: Übergang entfernen
- **WHEN** ein Benutzer am Übergangsplatz „Übergang entfernen“ wählt
- **THEN** ist der Platz wieder leer, und die Bilder folgen mit hartem Schnitt
  aufeinander

### Requirement: Automatisches Speichern und Wiederherstellen
Jede Änderung am Projekt MUST ohne Benutzeraktion im Backend gespeichert
werden, spätestens etwa eine Sekunde nach der letzten Änderung. Beim Öffnen der
Anwendung MUST das zuletzt gespeicherte Projekt geladen werden.

#### Scenario: Neuladen nach Bearbeitung
- **WHEN** ein Benutzer vier Bilder in den Bildstreifen zieht, zwei Übergänge
  setzt, zwei Sekunden wartet und die Seite neu lädt
- **THEN** sind Reihenfolge, Dauern und Übergänge unverändert wiederhergestellt

### Requirement: Videoclip in den Bildstreifen einfügen
Benutzer MUST ein Video aus der Sammlung „Meine Videos“ per Drag & Drop an
eine beliebige Position im Storyboard ziehen oder per Doppelklick ans Ende
anhängen können — wie bei Bildern. Ein neu eingefügter Videoclip MUST mit
`trimIn = 0` und `trimOut` gleich der vollen Videodauer sowie ohne
eingehenden Übergang (harter Schnitt) eingefügt werden. Die
Storyboard-Kachel MUST das Posterbild des Videos zeigen.

#### Scenario: Video per Doppelklick anhängen
- **WHEN** ein Benutzer in der Sammlung „Meine Videos“ doppelt auf ein
  Video mit 8 s Länge klickt
- **THEN** wird es als letztes Element mit vollem Trim (0–8 s) und ohne
  eingehenden Übergang angehängt, die Kachel zeigt das Posterbild

#### Scenario: Video zwischen zwei Bildern einfügen
- **WHEN** ein Benutzer ein Video aus der Sammlung zwischen das erste und
  das zweite Element des Bildstreifens zieht
- **THEN** steht der Videoclip an Position 2, und die übrigen Elemente
  rücken nach

### Requirement: Videoclip kürzen
Ein Videoclip-Element im Bildstreifen MUST sich über einen
Eigenschaftendialog (Doppelklick oder Kontextmenü) kürzen lassen: `trimIn`
und `trimOut` in Sekunden, mit der Grenze `0 ≤ trimIn < trimOut ≤`
Videodauer. Werte außerhalb der Grenze MUST abgelehnt werden; der Dialog
nennt den erlaubten Bereich.

#### Scenario: Kürzen auf einen Ausschnitt
- **WHEN** ein Benutzer für einen 10 s langen Videoclip `trimIn` auf 2 s und
  `trimOut` auf 7 s setzt und bestätigt
- **THEN** zeigt die Kachel eine Dauer von 5 s, und die Wiedergabe dieses
  Elements beginnt bei Sekunde 2 des Originals

#### Scenario: Ungültiger Trim
- **WHEN** ein Benutzer `trimOut` kleiner als `trimIn` einträgt
- **THEN** wird der Wert nicht übernommen, und der Dialog nennt den
  erlaubten Bereich

### Requirement: Videoclip teilen
Clip → „Teilen“ MUST aktiviert sein, wenn das ausgewählte
Storyboard-Element ein Videoclip ist und die aktuelle Wiedergabeposition
innerhalb seiner Spanne liegt, und MUST es dann an dieser Stelle in zwei
Elemente teilen: Das erste behält `trimIn` und bekommt `trimOut` an der
Schnittstelle sowie den eingehenden Übergang des Originals; das zweite
bekommt `trimIn` an der Schnittstelle und das bisherige `trimOut`, ohne
eingehenden Übergang. Beide Elemente bleiben danach eigenständig wählbar
und kürzbar. Bei jeder anderen Elementart oder außerhalb seiner Spanne MUST
„Teilen“ deaktiviert sein.

#### Scenario: Videoclip am Abspielkopf teilen
- **WHEN** ein Benutzer einen 10 s-Videoclip (`trimIn` 0, `trimOut` 10)
  wählt, die Wiedergabeposition auf Sekunde 4 dieses Elements stellt und
  Clip → „Teilen“ wählt
- **THEN** entstehen zwei Elemente: das erste mit `trimOut` 4 und dem
  ursprünglichen eingehenden Übergang, das zweite mit `trimIn` 4 und
  `trimOut` 10 ohne eingehenden Übergang

#### Scenario: Teilen bei einem Bild deaktiviert
- **WHEN** ein Benutzer ein Bild-Element auswählt
- **THEN** ist Clip → „Teilen“ deaktiviert
