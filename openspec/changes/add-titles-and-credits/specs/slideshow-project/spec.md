## MODIFIED Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen und
einer Musikspur (Spec music-track) bestehen. Jedes Bildstreifen-Element ist
ein Bild-Element (Anzeigedauer 0,5–60 s in Schritten von 0,25 s, Standard
5,0 s), ein Videoclip-Element (`trimIn`/`trimOut`, Dauer daraus abgeleitet)
oder ein **Titel-Element** (Spec titles-and-credits: `lines` oder
`creditEntries`, `styleId`, Anzeigedauer wie ein Bild-Element). Jedes
Bild- oder Videoclip-Element MAY zusätzlich genau eine Effekt-Katalog-ID
(`effectId`) und genau einen Overlay-Titel (`title`: `lines`, `styleId`,
oder `null`) tragen; ein Titel-Element selbst MUST NOT zusätzlich einen
Overlay-Titel tragen. Jedes Element außer dem ersten MAY genau einen
eingehenden Übergang vom vorherigen Element haben, bestehend aus
Katalog-ID und Dauer; der Übergang gehört zu dem Element, in das er
überblendet, unabhängig von dessen Art. Ein Medium MAY mehrfach im
Bildstreifen vorkommen. Das gespeicherte Projekt MUST die Schema-Version 5
tragen. Ein gespeichertes Projekt mit Schema-Version 4 MUST beim Laden
übernommen werden, wobei jedes Element `title: null` bekommt; Projekte mit
früheren Versionen MUST wie bisher stufenweise migriert werden.

#### Scenario: Ungültiges Projekt wird abgelehnt
- **WHEN** ein Client ein Projekt speichern will, das auf ein unbekanntes
  Medium, eine unbekannte Übergangs-, Effekt- oder Titel-Stil-ID verweist,
  ein Audio-Medium in den Bildstreifen setzt, eine Dauer oder einen Trim
  außerhalb des Bereichs enthält oder einem Titel-Element einen
  Overlay-Titel zuweist
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab, und
  das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Projekt aus Version 0.1
- **WHEN** das Backend ein mit Schema-Version 1 gespeichertes Projekt lädt
- **THEN** liefert es Bildstreifen, Dauern und Übergänge unverändert mit
  leerer Musikspur und speichert es bei der nächsten Änderung als
  Schema-Version 5

#### Scenario: Projekt aus Version 4
- **WHEN** das Backend ein mit Schema-Version 4 gespeichertes Projekt lädt
- **THEN** bekommt jedes seiner Elemente `title: null`, und das Projekt
  wird bei der nächsten Änderung als Schema-Version 5 gespeichert

#### Scenario: Titel-Element im Bildstreifen
- **WHEN** ein Benutzer über den Titel-Assistenten ein Titel-Element vor
  dem zweiten bisherigen Element einfügt
- **THEN** steht es an Position 2 im Bildstreifen, hat eine eigene
  Anzeigedauer und verweist auf kein Medium
