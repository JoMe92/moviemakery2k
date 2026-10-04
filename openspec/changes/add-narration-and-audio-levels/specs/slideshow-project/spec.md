## MODIFIED Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen,
einer Musikspur (Spec music-track) und einer Erzählungsspur (Spec
narration-track) bestehen. Bildstreifen-Elemente sind Bild-, Videoclip-
oder Titel-Elemente wie bisher, je MAY mit Effekt und Overlay-Titel. Ein
Projekt MUST zusätzlich ein Feld `clipAudioBalance` (0–100, Standard 50)
tragen: den globalen Pegel zwischen dem Ton von Videoclips (100) und
Musik plus Erzählung zusammen (0). Das gespeicherte Projekt MUST die
Schema-Version 6 tragen. Ein gespeichertes Projekt mit Schema-Version 5
MUST beim Laden übernommen werden, wobei es eine leere Erzählungsspur und
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

#### Scenario: Projekt aus Version 5
- **WHEN** das Backend ein mit Schema-Version 5 gespeichertes Projekt lädt
- **THEN** bekommt es eine leere Erzählungsspur und `clipAudioBalance: 50`,
  und das Projekt wird bei der nächsten Änderung als Schema-Version 6
  gespeichert
