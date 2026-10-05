## MODIFIED Requirements

### Requirement: Aufgabenbereich mit drei Schritten
Der Aufgabenbereich MUST die Gruppen „1. Aufnehmen“, „2. Film bearbeiten“ und
„3. Film fertig stellen“ zeigen, jeweils ein- und ausklappbar. Funktional
MUST sein: „Bilder importieren“, „Video importieren“ (gefilterter
Dateiauswahldialog für die Videoformate der Spec media-library), „Audio oder
Musik importieren“ (Dateiauswahl für die Audioformate der Spec
media-library), „Sammlungen anzeigen“, „Videoübergänge anzeigen“,
„Videoeffekte anzeigen“ (Spec video-effects), „Titel oder Nachspann
erstellen“ (öffnet den Titel-Assistenten, Spec titles-and-credits), „Auf
dem Computer speichern“ (öffnet den Assistenten „Film speichern“, Spec
movie-export) und „Als App installieren…“ (Spec installable-app; nur im
sicheren Kontext und nicht im Standalone-Modus vorhanden). „Auf dem
Computer speichern“ MUST deaktiviert sein, solange der Bildstreifen leer
ist. Alle anderen Einträge (u. a. Im Web
veröffentlichen) MUST sichtbar, aber deaktiviert sein.

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

### Requirement: Menüs mit funktionalem Kern
Die Menüleiste MUST sich per Maus und Tastatur bedienen lassen. Funktional
MUST sein: Datei → „Neues Projekt“ (fragt nach, leert danach den
Bildstreifen; die Mediensammlung bleibt erhalten), Datei → „In Sammlungen
importieren…“, Datei → „Film speichern…“ (öffnet den Assistenten „Film
speichern“; deaktiviert, solange der Bildstreifen leer ist), Bearbeiten →
„Löschen“ (entfernt das gewählte Storyboard-Element), Wiedergabe →
„Wiedergabe/Pause“ und „Stopp“, Extras → „Optionen…“ (Dialog mit der
Spracheinstellung, Spec localization), Extras → „AutoMovie…“ (öffnet den
AutoMovie-Dialog, Spec automovie), Extras → „Als App installieren…“ (Spec
installable-app; nur im sicheren Kontext und nicht im Standalone-Modus
vorhanden), Hilfe → „Info“ (Dialog mit Name, Version und dem Hinweis, dass
kein Bezug zu Microsoft besteht). Alle
anderen Menüeinträge MUST sichtbar und deaktiviert sein.

#### Scenario: Neues Projekt
- **WHEN** ein Benutzer Datei → „Neues Projekt“ wählt und die Rückfrage
  bestätigt
- **THEN** ist der Bildstreifen leer, die Mediensammlung ist unverändert, und
  der neue Zustand ist gespeichert

#### Scenario: Info-Dialog
- **WHEN** ein Benutzer Hilfe → „Info“ wählt
- **THEN** erscheint ein modaler Dialog mit dem Hinweis, dass moviemakerY2K
  vom klassischen Movie Maker inspiriert ist und kein Microsoft-Produkt ist

#### Scenario: Film speichern über das Menü
- **WHEN** der Bildstreifen mindestens ein Bild enthält und ein Benutzer
  Datei → „Film speichern…“ wählt
- **THEN** öffnet sich der Assistent „Film speichern“

#### Scenario: Optionen öffnen
- **WHEN** ein Benutzer Extras → „Optionen…“ wählt
- **THEN** erscheint ein modaler Y2K-Dialog mit der Auswahl „Deutsch“ und
  „English“, in dem die aktuelle Sprache ausgewählt ist, und „Abbrechen“
  schließt ihn ohne Änderung

#### Scenario: AutoMovie öffnen
- **WHEN** ein Benutzer Extras → „AutoMovie…“ wählt
- **THEN** öffnet sich der AutoMovie-Dialog mit dem Filmtitel-Feld und der
  Stil-Auswahl

#### Scenario: Installieren über das Menü
- **WHEN** die Anwendung über HTTPS im Browser (nicht installiert) läuft und
  ein Benutzer Extras öffnet
- **THEN** enthält das Menü den aktiven Eintrag „Als App installieren…“
