## Why

moviemakerY2K kann bisher nur Bilder und Audio importieren; „Video
importieren“ im Aufgabenbereich ist sichtbar, aber deaktiviert. Die
Feature-Lückenanalyse gegen Windows Movie Maker 2.x (Orchestrator,
2026-10-03) hat Videoclip-Import als nächsten Schritt nach der
Projektverwaltung priorisiert, weil die spätere Timeline-Change (echte
Spuren-Ansicht, Clip-Split) ohnehin auf importierten Videodateien aufbaut.

Der Vorschau-Player und der Export sind heute strukturell auf zwei
Standbild-Texturen ausgelegt (siehe `docs/architecture.md`): Der Renderer
lädt pro Storyboard-Element genau ein Vorschaubild, und die
Übergangs-Engine überblendet zwei Bild-Texturen; `buildTimeline`/`frameAt`
kennen nur die Segmenttypen `still` und `transition` mit fester, aus der
Anzeigedauer abgeleiteter Länge; der Export rendert pro Still-Segment ein
JPEG. Ein zu diesem Zeitpunkt bereits spielbares Video wäre Wegwerfcode, den
die Timeline-Change sofort wieder umbauen müsste (Architektur-Beratung,
2026-10-03). Der Product Owner hat deshalb entschieden, diese Change auf den
**Import** zu begrenzen: Videodateien landen in der Mediensammlung mit
Posterbild und Dauer, können aber noch nicht in den Bildstreifen gezogen,
abgespielt oder exportiert werden — das liefert vollständig die
Timeline-Change.

## What Changes

- **Videodateien importieren:** über denselben Dateiauswahldialog und
  dasselbe Drag & Drop wie Bilder und Audio, zusätzlich über den eigenen
  Aufgabenbereich-Eintrag „Video importieren“ (gefilterter Dialog). Ein
  Import MAY alle drei Medienarten mischen.
- **Erkennung und Grenzen im Backend:** Inhaltsprüfung per ffprobe (wie bei
  Audio), MUST mindestens einen dekodierbaren Videostream in einem vom
  FFmpeg-Build unterstützten Codec haben. Dateigröße und Laufzeit sind
  begrenzt; zu lange oder nicht unterstützte Dateien werden mit Fehlercode
  abgelehnt.
- **Posterbild:** Ein einzelnes extrahiertes Frame (JPEG) dient als
  Vorschaubild in der Sammlung; Breite, Höhe und Dauer werden gemeldet,
  Dreh-Metadaten (Rotation) berücksichtigt. Das Original bleibt unverändert
  erhalten.
- **Sammlung „Meine Videos“:** dritte Kachel-Gruppe neben „Meine Bilder“ und
  „Meine Musik“, mit Posterbild, Dateiname und Dauer. Löschen funktioniert
  wie bei den anderen Medienarten (Rückfrage), ohne
  „in Verwendung durch Export“-Prüfung, da ein Video in dieser Change
  nirgends im Projekt verwendet werden kann.

## Capabilities

### Modified Capabilities

- `media-library`: Video als dritte Medienart (Import, Validierung,
  Posterbild, Sammlungsanzeige, Löschen)
- `app-shell`: Aufgabenbereich-Eintrag „Video importieren“ wird funktional

## Nicht-Ziele

- Ein Video in den Bildstreifen ziehen, im Player abspielen oder
  exportieren, Clip-Ton, Trimmen oder Teilen — vollständig die
  Timeline-Change (nächste in der Reihenfolge).
- Eine normalisierte Vorschau-/Zwischenfassung des Videos (anders als bei
  Audio); nur ein einzelnes Posterbild wird abgeleitet.
- Kamera-Aufnahme direkt aus der App (der Import nutzt die Dateiauswahl des
  Geräts, wie bei Bildern und Audio).
- Eine Megapixel-Grenze wie bei Bildern (die Verarbeitung in dieser Change
  dekodiert nur ein einzelnes Frame, nicht den ganzen Videostream).
- Änderungen am Projekt-Schema (`slideshow-project`); ein Video ist in
  dieser Change reines Sammlungs-Medium, kein Projekt-Bestandteil.
