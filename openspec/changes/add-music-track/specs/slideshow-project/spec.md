## MODIFIED Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen und
einer Musikspur (Spec music-track) bestehen. Jedes Bildstreifen-Element
verweist auf ein Bild und hat eine Anzeigedauer (0,5–60 s in Schritten von
0,25 s, Standard 5,0 s). Jedes Element außer dem ersten MAY genau einen
eingehenden Übergang vom vorherigen Element haben, bestehend aus Katalog-ID
und Dauer (0,25–5 s in Schritten von 0,25 s, Standard: Wert aus dem Katalog).
Der Übergang gehört zu dem Element, in das er überblendet (wie in Movie
Maker). Ein Medium MAY mehrfach im Bildstreifen vorkommen. Das gespeicherte
Projekt MUST die Schema-Version 2 tragen. Ein gespeichertes Projekt mit
Schema-Version 1 MUST beim Laden als Projekt mit leerer Musikspur übernommen
werden.

#### Scenario: Ungültiges Projekt wird abgelehnt
- **WHEN** ein Client ein Projekt speichern will, das auf ein unbekanntes
  Medium oder eine unbekannte Übergangs-ID verweist, ein Audio-Medium in den
  Bildstreifen oder ein Bild in die Musikspur setzt oder eine Dauer außerhalb
  des Bereichs enthält
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab, und
  das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Projekt aus Version 0.1
- **WHEN** das Backend ein mit Schema-Version 1 gespeichertes Projekt lädt
- **THEN** liefert es Bildstreifen, Dauern und Übergänge unverändert mit
  leerer Musikspur und speichert es bei der nächsten Änderung als Version 2
