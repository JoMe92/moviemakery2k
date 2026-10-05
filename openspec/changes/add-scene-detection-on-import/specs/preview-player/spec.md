## MODIFIED Requirements

### Requirement: Videoclips in der Wiedergabe
Ein Videoclip-Element MUST im Monitor sein Frame an der Stelle `sourceIn +
trimIn + (Wiedergabezeit − Segmentanfang)` der gespeicherten Datei zeigen,
wobei `sourceIn` der Anfang des Fensters ist, das sein Medium auf dieser Datei
bezeichnet (Spec scene-detection; für jedes Medium über eine ganze Datei ist
`sourceIn` 0). `trimIn` und `trimOut` MUST dabei relativ zum Medium gelten.
Die Einpassung MUST seitenverhältnistreu wie bei einem Bild erfolgen
(Requirement „Darstellung im Monitor“). Die Wiedergabe eines Videoclips MUST
stumm sein; er hat keinen eigenen Wiedergabe-Takt — die bestehende Zeitachse
bleibt maßgebend. Bei gestoppter Wiedergabe und Auswahl eines
Videoclip-Elements MUST der Monitor dessen Frame an der aktuellen
Suchleisten-Position zeigen. Der Export MUST dieselbe Stelle auf dieselbe
Weise bestimmen (Spec movie-export, „Export entspricht der Vorschau“).

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
- **THEN** zeigt der Monitor sofort das passende Frame aus dem Fenster seines
  Mediums zwischen `trimIn` und `trimOut`

#### Scenario: Videoclip aus einer erkannten Szene
- **WHEN** ein Videoclip-Element auf ein Medium verweist, dessen Fenster bei
  12 s der Datei beginnt, und die Wiedergabe 2 s nach dem Anfang dieses
  Elements steht (`trimIn` 0)
- **THEN** zeigt der Monitor das Frame bei 14 s der gespeicherten Datei, und
  der Export zeigt an diesem Zeitpunkt dasselbe Frame
