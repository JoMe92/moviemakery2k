## MODIFIED Requirements

### Requirement: Aufgabenbereich mit drei Schritten
Der Aufgabenbereich MUST die Gruppen „1. Aufnehmen“, „2. Film bearbeiten“ und
„3. Film fertig stellen“ zeigen, jeweils ein- und ausklappbar. Funktional MUST
sein: „Bilder importieren“, „Video importieren“ (gefilterter
Dateiauswahldialog für die Videoformate der Spec media-library), „Audio oder
Musik importieren“ (Dateiauswahl für die Audioformate der Spec media-library),
„Sammlungen anzeigen“, „Videoübergänge anzeigen“, „Videoeffekte anzeigen“
(Spec video-effects), „Titel oder Nachspann erstellen“ (öffnet den
Titel-Assistenten, Spec titles-and-credits), „Filmformat festlegen…“ (in der
Gruppe „2. Film bearbeiten“; öffnet den Dialog „Filmformat“, Spec canvas),
„Auf dem Computer speichern“ (öffnet den Assistenten „Film speichern“, Spec
movie-export) und „Als App installieren…“ (Spec installable-app; nur im
sicheren Kontext und nicht im Standalone-Modus vorhanden). „Auf dem Computer
speichern“ MUST deaktiviert sein, solange der Bildstreifen leer ist.
„Filmformat festlegen…“ MUST auch bei leerem Bildstreifen verfügbar sein, weil
das Format vor dem Hinzufügen von Material gewählt werden kann. Alle anderen
Einträge (u. a. Im Web veröffentlichen) MUST sichtbar, aber deaktiviert sein.

#### Scenario: Deaktivierter Eintrag
- **WHEN** ein Benutzer auf „Im Web veröffentlichen“ klickt
- **THEN** passiert nichts, und der Eintrag ist als deaktiviert erkennbar und
  für Hilfstechnologien als deaktiviert ausgezeichnet

#### Scenario: Übergänge anzeigen
- **WHEN** ein Benutzer auf „Videoübergänge anzeigen“ klickt
- **THEN** zeigt der Sammlungsbereich den Übergangskatalog, und die
  Sammlungsauswahl in der Symbolleiste steht auf „Videoübergänge“

#### Scenario: Effekte anzeigen
- **WHEN** ein Benutzer auf „Videoeffekte anzeigen“ klickt
- **THEN** zeigt der Sammlungsbereich den Effekt-Katalog, und die
  Sammlungsauswahl in der Symbolleiste steht auf „Videoeffekte“

#### Scenario: Titel oder Nachspann erstellen
- **WHEN** ein Benutzer auf „Titel oder Nachspann erstellen“ klickt
- **THEN** öffnet sich der Titel-Assistent im Schritt „Platzierung“

#### Scenario: Audio importieren
- **WHEN** ein Benutzer auf „Audio oder Musik importieren“ klickt
- **THEN** öffnet sich eine Dateiauswahl für MP3, WAV, M4A, OGG und FLAC, und
  nach dem Import zeigt der Sammlungsbereich „Meine Musik“

#### Scenario: Video importieren
- **WHEN** ein Benutzer auf „Video importieren“ klickt
- **THEN** öffnet sich eine auf Videoformate gefilterte Dateiauswahl, und
  nach dem Import zeigt der Sammlungsbereich „Meine Videos“ mit dem
  Posterbild

#### Scenario: Filmformat festlegen
- **WHEN** ein Benutzer in „2. Film bearbeiten“ auf „Filmformat festlegen…“
  klickt
- **THEN** öffnet sich der modale Dialog „Filmformat“ mit der aktuellen
  Auswahl von Format und Hintergrund des Projekts

#### Scenario: Filmformat bei leerem Bildstreifen
- **WHEN** der Bildstreifen leer ist
- **THEN** ist „Filmformat festlegen…“ verfügbar und öffnet den Dialog

#### Scenario: Film fertig stellen
- **WHEN** der Bildstreifen mindestens ein Bild enthält und ein Benutzer auf
  „Auf dem Computer speichern“ klickt
- **THEN** öffnet sich der Assistent „Film speichern“ im Schritt „Dateiname“

#### Scenario: Leerer Bildstreifen
- **WHEN** der Bildstreifen leer ist
- **THEN** ist „Auf dem Computer speichern“ deaktiviert und für
  Hilfstechnologien als deaktiviert ausgezeichnet

#### Scenario: Installieren im Aufgabenbereich
- **WHEN** die Anwendung über HTTPS im Browser (nicht installiert) läuft
- **THEN** enthält „3. Film fertig stellen“ den Eintrag „Als App
  installieren…“
