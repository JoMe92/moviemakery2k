## ADDED Requirements

### Requirement: Videoclips in der Wiedergabe
Ein Videoclip-Element MUST im Monitor sein Frame an der Stelle `trimIn +
(Wiedergabezeit − Segmentanfang)` zeigen, mit derselben
seitenverhältnistreuen Einpassung wie ein Bild (Requirement „Darstellung im
Monitor“). Die Wiedergabe eines Videoclips MUST stumm sein; er hat keinen
eigenen Wiedergabe-Takt — die bestehende Zeitachse bleibt maßgebend. Bei
gestoppter Wiedergabe und Auswahl eines Videoclip-Elements MUST der Monitor
dessen Frame an der aktuellen Suchleisten-Position zeigen.

#### Scenario: Videoclip in der Übergangs-Mitte
- **WHEN** die Wiedergabe mitten in einem Übergang von einem Bild zu einem
  Videoclip steht
- **THEN** zeigt der Monitor die Überblendung zwischen dem Bild und dem
  Video-Frame an der passenden Stelle des Videoclips, genauso wie zwischen
  zwei Bildern

#### Scenario: Stummer Videoclip
- **WHEN** ein Projekt mit einem Videoclip und Musik abgespielt wird
- **THEN** ist nur die Musik hörbar, der Ton des Videoclips bleibt stumm

#### Scenario: Suchen in einen Videoclip
- **WHEN** ein Benutzer die Suchleiste auf eine Stelle innerhalb eines
  gekürzten Videoclips zieht
- **THEN** zeigt der Monitor sofort das passende Frame aus dem Original
  zwischen `trimIn` und `trimOut`
