## MODIFIED Requirements

### Requirement: Menüs mit funktionalem Kern
Die Menüleiste MUST sich per Maus und Tastatur bedienen lassen. Funktional
MUST sein: Datei → „Neues Projekt“ (fragt nach, leert danach den
Bildstreifen; die Mediensammlung bleibt erhalten), Datei → „In Sammlungen
importieren…“, Datei → „Film speichern…“ (öffnet den Assistenten „Film
speichern“; deaktiviert, solange der Bildstreifen leer ist), Bearbeiten →
„Löschen“ (entfernt das gewählte Storyboard-Element), Wiedergabe →
„Wiedergabe/Pause“ und „Stopp“, Extras → „Optionen…“ (Dialog mit der
Spracheinstellung, Spec localization), Hilfe → „Info“ (Dialog mit Name,
Version und dem Hinweis, dass kein Bezug zu Microsoft besteht). Alle anderen
Menüeinträge MUST sichtbar und deaktiviert sein.

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
