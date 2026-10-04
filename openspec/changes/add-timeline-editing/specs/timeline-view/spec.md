## ADDED Requirements

### Requirement: Zeitachsen-Ansicht aktivieren
Ansicht → „Zeitachse“ MUST zwischen der Storyboard-Kachelreihe und einer
Spuren-Darstellung desselben Bildstreifens umschalten (dasselbe
Datenmodell, Spec slideshow-project — keine zweite Bearbeitung). Die
Spuren-Darstellung MUST ein Zeitlineal, die Elemente in zur Dauer
proportionaler Breite und einen Zoom-Regler zeigen. Auswahl und
Wiedergabeposition MUST beim Wechsel zwischen den Ansichten erhalten
bleiben.

#### Scenario: In die Zeitachse wechseln
- **WHEN** ein Benutzer bei ausgewähltem drittem Element Ansicht →
  „Zeitachse“ wählt
- **THEN** zeigt sich die Spuren-Darstellung mit demselben Element
  weiterhin ausgewählt, und die Elemente erscheinen in zur Dauer
  proportionaler Breite

#### Scenario: Zoom
- **WHEN** ein Benutzer den Zoom-Regler erhöht
- **THEN** werden alle Elemente breiter dargestellt, ihre proportionalen
  Breiten zueinander bleiben gleich

#### Scenario: Zurück zum Storyboard
- **WHEN** ein Benutzer während der Wiedergabe in der Zeitachse Ansicht →
  „Zeitachse“ erneut wählt
- **THEN** zeigt sich wieder die Storyboard-Kachelreihe, die Wiedergabe
  läuft an derselben Stelle unverändert weiter

### Requirement: Übergänge und Kürzen in der Zeitachse
Zwischen zwei Elementen mit gesetztem Übergang MUST dieser als gemeinsamer
Keil zwischen ihnen erscheinen. Jedes Element MUST an seinen beiden Kanten
einen Zieh-Griff haben: Bei einem Videoclip passt Ziehen `trimIn` bzw.
`trimOut` live an, begrenzt auf die Videodauer; bei einem Bild passt Ziehen
die Anzeigedauer an, begrenzt auf ihren erlaubten Bereich (Spec
slideshow-project).

#### Scenario: Videoclip per Zieh-Griff kürzen
- **WHEN** ein Benutzer in der Zeitachse den rechten Zieh-Griff eines
  Videoclips nach links zieht
- **THEN** verkürzt sich `trimOut` entsprechend, und die Kachel in der
  Storyboard-Ansicht zeigt danach dieselbe kürzere Dauer

#### Scenario: Grenzen beim Ziehen
- **WHEN** ein Benutzer versucht, `trimOut` über die Videodauer hinaus zu
  ziehen
- **THEN** stoppt der Griff an der Videodauer
