## MODIFIED Requirements

### Requirement: Aufgabenbereich mit drei Schritten
Der Aufgabenbereich MUST die Gruppen „1. Aufnehmen“, „2. Film bearbeiten“ und
„3. Film fertig stellen“ zeigen, jeweils ein- und ausklappbar. Funktional MUST
sein: „Bilder importieren“, „Audio oder Musik importieren“ (Dateiauswahl für
die Audioformate der Spec media-library), „Sammlungen anzeigen“,
„Videoübergänge anzeigen“, „Titel oder Nachspann erstellen“ (öffnet den
Titel-Assistenten, Spec titles-and-credits) und „Auf dem Computer
speichern“ (öffnet den Assistenten „Film speichern“, Spec movie-export).
„Auf dem Computer speichern“ MUST deaktiviert sein, solange der
Bildstreifen leer ist. Alle anderen Einträge (u. a. Video importieren,
Videoeffekte anzeigen, Im Web veröffentlichen) MUST sichtbar, aber
deaktiviert sein.

#### Scenario: Deaktivierter Eintrag
- **WHEN** ein Benutzer auf „Im Web veröffentlichen“ klickt
- **THEN** passiert nichts, und der Eintrag ist als deaktiviert erkennbar und
  für Hilfstechnologien als deaktiviert ausgezeichnet

#### Scenario: Übergänge anzeigen
- **WHEN** ein Benutzer auf „Videoübergänge anzeigen“ klickt
- **THEN** zeigt der Sammlungsbereich den Übergangskatalog, und die
  Sammlungsauswahl in der Symbolleiste steht auf „Videoübergänge“

#### Scenario: Titel oder Nachspann erstellen
- **WHEN** ein Benutzer auf „Titel oder Nachspann erstellen“ klickt
- **THEN** öffnet sich der Titel-Assistent im Schritt „Platzierung“

#### Scenario: Audio importieren
- **WHEN** ein Benutzer auf „Audio oder Musik importieren“ klickt
- **THEN** öffnet sich eine Dateiauswahl für MP3, WAV, M4A, OGG und FLAC, und
  nach dem Import zeigt der Sammlungsbereich „Meine Musik“

#### Scenario: Film fertig stellen
- **WHEN** der Bildstreifen mindestens ein Bild enthält und ein Benutzer auf
  „Auf dem Computer speichern“ klickt
- **THEN** öffnet sich der Assistent „Film speichern“ im Schritt „Dateiname“

#### Scenario: Leerer Bildstreifen
- **WHEN** der Bildstreifen leer ist
- **THEN** ist „Auf dem Computer speichern“ deaktiviert und für
  Hilfstechnologien als deaktiviert ausgezeichnet
