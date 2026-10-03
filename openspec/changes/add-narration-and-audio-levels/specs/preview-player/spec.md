## ADDED Requirements

### Requirement: Clip-Ton und Erzählung in der Wiedergabe
Hat ein Videoclip-Element eine Tonspur im Original, MUST diese während
seiner Anzeigedauer über dieselbe Audiouhr wie die Musik hörbar sein
(nicht über das `<video>`-Element selbst, das reines Bild-Scrubbing
bleibt). Erzählungs-Clips MUST an ihrer absoluten Startzeit hörbar sein,
unabhängig vom aktuellen Bildstreifen-Element. Der globale Pegel
`clipAudioBalance` MUST das Lautstärkeverhältnis zwischen Videoclip-Ton
und der Summe aus Musik und Erzählung bestimmen. Pause, Stopp, Suchen und
Projektänderungen MUST Clip-Ton und Erzählung wie Musik sofort an der
aktuellen Zeit fortsetzen bzw. anhalten.

#### Scenario: Clip-Ton bei vollem Pegel
- **WHEN** `clipAudioBalance` auf 100 steht und ein Videoclip mit Tonspur
  abgespielt wird
- **THEN** ist nur der Videoclip-Ton hörbar, Musik und Erzählung bleiben
  stumm

#### Scenario: Gemischter Pegel
- **WHEN** `clipAudioBalance` auf 50 steht und sowohl ein Videoclip mit
  Tonspur als auch Musik gleichzeitig laufen
- **THEN** sind beide gleichzeitig und etwa gleich laut hörbar

#### Scenario: Suchen in einen Bereich mit Erzählung
- **WHEN** ein Benutzer die Suchleiste auf eine Stelle mit einem
  Erzählungs-Clip zieht
- **THEN** setzt die Erzählung an der passenden Stelle innerhalb des Clips
  fort
