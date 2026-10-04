## MODIFIED Requirements

### Requirement: Menüs mit funktionalem Kern
Die Menüleiste MUST sich per Maus und Tastatur bedienen lassen. Funktional
MUST sein: Datei → „Neues Projekt“ (fragt nach, leert danach den
Bildstreifen; die Mediensammlung bleibt erhalten), Datei → „In Sammlungen
importieren…“, Datei → „Film speichern…“ (öffnet den Assistenten „Film
speichern“; deaktiviert, solange der Bildstreifen leer ist), Bearbeiten →
„Rückgängig“ und „Wiederholen“, Bearbeiten → „Ausschneiden“, „Kopieren“ und
„Einfügen“ (Spec edit-commands), Bearbeiten → „Löschen“ (entfernt das
gewählte Storyboard-Element), Wiedergabe → „Wiedergabe/Pause“ und „Stopp“,
Extras → „Optionen…“ (Dialog mit der Spracheinstellung, Spec localization),
Hilfe → „Info“ (Dialog mit Name, Version und dem Hinweis, dass kein Bezug zu
Microsoft besteht). Datei → „Projekt öffnen…“ und „Projekt speichern“ sowie
Bearbeiten → „Alles auswählen“ MUST sichtbar, aber deaktiviert bleiben (keine
Mehrprojekt-Verwaltung, keine Mehrfachauswahl). Alle übrigen Menüeinträge
MUST sichtbar und deaktiviert sein.

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
  „English“

#### Scenario: Rückgängig über das Menü
- **WHEN** ein Benutzer eine Änderung vorgenommen hat und Bearbeiten →
  „Rückgängig“ wählt
- **THEN** wird die letzte Änderung zurückgenommen, und „Wiederholen“ ist
  jetzt aktiviert

#### Scenario: Deaktivierte Projektverwaltung
- **WHEN** ein Benutzer Datei → „Projekt öffnen…“ oder „Projekt speichern“
  betrachtet
- **THEN** ist der Eintrag sichtbar, aber deaktiviert und für
  Hilfstechnologien als deaktiviert ausgezeichnet
