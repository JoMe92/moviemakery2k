## MODIFIED Requirements

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
