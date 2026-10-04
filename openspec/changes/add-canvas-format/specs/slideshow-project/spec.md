## MODIFIED Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen,
einer Musikspur (Spec music-track) und einer Erzählungsspur (Spec
narration-track) bestehen. Bildstreifen-Elemente sind Bild-, Videoclip-
oder Titel-Elemente wie bisher, je MAY mit Effekt und Overlay-Titel. Ein
Projekt MUST zusätzlich ein Feld `clipAudioBalance` (0–100, Standard 50)
tragen: den globalen Pegel zwischen dem Ton von Videoclips (100) und
Musik plus Erzählung zusammen (0). Ein Projekt MUST außerdem genau ein
Feld `canvas` mit dem Canvas-Format und der Hintergrundfarbe tragen
(Spec canvas, Requirement „Canvas eines Projekts“); es gilt für das ganze
Projekt, nicht je Element. Das gespeicherte Projekt MUST die
Schema-Version 7 tragen. Ein gespeichertes Projekt mit Schema-Version 6
MUST beim Laden übernommen werden, wobei es das Canvas Querformat 16:9 mit
schwarzem Hintergrund bekommt; Projekte mit früheren Versionen MUST wie
bisher stufenweise migriert werden und dasselbe Canvas bekommen.

#### Scenario: Ungültiges Projekt wird abgelehnt
- **WHEN** ein Client ein Projekt speichern will, das auf ein unbekanntes
  Medium, eine unbekannte Übergangs-, Effekt- oder Titel-Stil-ID verweist,
  ein Bild- oder Video-Medium in die Erzählungs- oder Musikspur setzt,
  eine Dauer, einen Trim oder eine Erzählungs-Startzeit außerhalb des
  Bereichs enthält, `clipAudioBalance` außerhalb von 0–100 setzt oder ein
  anderes Canvas-Format bzw. eine andere Hintergrundfarbe als die in Spec
  canvas erlaubten Werte setzt
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab,
  und das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Projekt aus Version 0.1
- **WHEN** das Backend ein mit Schema-Version 1 gespeichertes Projekt lädt
- **THEN** liefert es Bildstreifen, Dauern und Übergänge unverändert mit
  leerer Musik- und Erzählungsspur, `clipAudioBalance: 50` und dem Canvas
  Querformat 16:9 mit schwarzem Hintergrund und speichert es bei der
  nächsten Änderung als Schema-Version 7

#### Scenario: Projekt aus Version 6
- **WHEN** das Backend ein mit Schema-Version 6 gespeichertes Projekt lädt
- **THEN** bekommt es das Canvas Querformat 16:9 mit schwarzem Hintergrund,
  der Bildstreifen bleibt unverändert, und das Projekt wird bei der
  nächsten Änderung als Schema-Version 7 gespeichert

#### Scenario: Canvas ändern
- **WHEN** ein Benutzer in einem Projekt mit vier Bildern das Canvas auf
  Hochformat 9:16 mit weißem Hintergrund umstellt
- **THEN** bleiben Reihenfolge, Dauern, Übergänge und Spuren unverändert,
  nur das Canvas des Projekts ist geändert, und der neue Zustand ist nach
  dem automatischen Speichern auch nach einem Neuladen erhalten
