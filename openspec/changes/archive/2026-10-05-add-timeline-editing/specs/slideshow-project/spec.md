## MODIFIED Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen und
einer Musikspur (Spec music-track) bestehen. Jedes Bildstreifen-Element ist
entweder ein **Bild-Element** mit einer Anzeigedauer (0,5–60 s in Schritten
von 0,25 s, Standard 5,0 s) oder ein **Videoclip-Element** mit `trimIn` und
`trimOut` in Sekunden (`0 ≤ trimIn < trimOut ≤` Videodauer); dessen
Anzeigedauer folgt ausschließlich aus `trimOut − trimIn`, kein zusätzliches
Dauerfeld. Jedes Element außer dem ersten MAY genau einen eingehenden
Übergang vom vorherigen Element haben, bestehend aus Katalog-ID und Dauer
(0,25–5 s in Schritten von 0,25 s, Standard: Wert aus dem Katalog). Der
Übergang gehört zu dem Element, in das er überblendet (wie in Movie Maker),
unabhängig von dessen Art. Ein Medium MAY mehrfach im Bildstreifen
vorkommen. Das gespeicherte Projekt MUST die Schema-Version 3 tragen. Ein
gespeichertes Projekt mit Schema-Version 2 MUST beim Laden übernommen
werden, wobei jedes seiner Elemente als Bild-Element mit seiner bisherigen
Anzeigedauer gilt; ein gespeichertes Projekt mit Schema-Version 1 MUST wie
bisher als Projekt mit leerer Musikspur übernommen werden.

#### Scenario: Ungültiges Projekt wird abgelehnt
- **WHEN** ein Client ein Projekt speichern will, das auf ein unbekanntes
  Medium oder eine unbekannte Übergangs-ID verweist, ein Audio-Medium in den
  Bildstreifen oder ein Bild in die Musikspur setzt, eine Dauer außerhalb
  des Bereichs enthält oder bei einem Videoclip-Element `trimIn ≥ trimOut`
  bzw. `trimOut` größer als die Videodauer setzt
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab, und
  das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Projekt aus Version 0.1
- **WHEN** das Backend ein mit Schema-Version 1 gespeichertes Projekt lädt
- **THEN** liefert es Bildstreifen, Dauern und Übergänge unverändert mit
  leerer Musikspur und speichert es bei der nächsten Änderung als
  Schema-Version 3

#### Scenario: Projekt aus Version 2
- **WHEN** das Backend ein mit Schema-Version 2 gespeichertes Projekt lädt
- **THEN** gilt jedes seiner Bildstreifen-Elemente als Bild-Element mit
  seiner bisherigen Anzeigedauer, und das Projekt wird bei der nächsten
  Änderung als Schema-Version 3 gespeichert

## ADDED Requirements

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
