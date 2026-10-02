## Purpose

Das Hauptfenster von moviemakerY2K: eine eigene Y2K-Interpretation des
Movie-Maker-2.x-Layouts mit Menüleiste, Aufgabenbereich, Sammlungen,
Vorschaumonitor und Storyboard sowie dem visuellen Theme.

## ADDED Requirements

### Requirement: Movie-Maker-Layout
Die Anwendung MUST in einem Fenster-Layout erscheinen, bestehend aus
Titelleiste, Menüleiste (Datei, Bearbeiten, Ansicht, Extras, Clip, Wiedergabe,
Hilfe), Symbolleiste mit Sammlungsauswahl, Aufgabenbereich links,
Sammlungsbereich in der Mitte, Vorschaumonitor rechts, darunter das Storyboard
über die volle Breite und eine Statusleiste. Bei einer Fenstergröße ab
1280×720 MUST das Layout ohne horizontales Scrollen der Seite auskommen.

#### Scenario: Start der Anwendung
- **WHEN** ein Benutzer die Anwendung im Browser öffnet
- **THEN** sieht er alle genannten Bereiche gleichzeitig, und das Storyboard
  zeigt bei leerem Projekt einen Hinweis, dass man Bilder hierher ziehen kann

### Requirement: Aufgabenbereich mit drei Schritten
Der Aufgabenbereich MUST die Gruppen „1. Aufnehmen“, „2. Film bearbeiten“ und
„3. Film fertig stellen“ zeigen, jeweils ein- und ausklappbar. Funktional MUST
sein: „Bilder importieren“, „Sammlungen anzeigen“ und „Videoübergänge
anzeigen“. Alle anderen Einträge (u. a. Video importieren, Audio oder Musik
importieren, Videoeffekte anzeigen, Titel oder Nachspann erstellen und alle
Einträge unter Schritt 3) MUST sichtbar, aber deaktiviert sein.

#### Scenario: Deaktivierter Eintrag
- **WHEN** ein Benutzer auf „Videoeffekte anzeigen“ klickt
- **THEN** passiert nichts, und der Eintrag ist als deaktiviert erkennbar und
  für Hilfstechnologien als deaktiviert ausgezeichnet

#### Scenario: Übergänge anzeigen
- **WHEN** ein Benutzer auf „Videoübergänge anzeigen“ klickt
- **THEN** zeigt der Sammlungsbereich den Übergangskatalog, und die
  Sammlungsauswahl in der Symbolleiste steht auf „Videoübergänge“

### Requirement: Menüs mit funktionalem Kern
Die Menüleiste MUST sich per Maus und Tastatur bedienen lassen. Funktional
MUST sein: Datei → „Neues Projekt“ (fragt nach, leert danach den
Bildstreifen; die Mediensammlung bleibt erhalten), Datei → „In Sammlungen
importieren…“, Bearbeiten → „Löschen“ (entfernt das gewählte
Storyboard-Element), Wiedergabe → „Wiedergabe/Pause“ und „Stopp“, Hilfe →
„Info“ (Dialog mit Name, Version und dem Hinweis, dass kein Bezug zu Microsoft
besteht). Alle anderen Menüeinträge MUST sichtbar und deaktiviert sein.

#### Scenario: Neues Projekt
- **WHEN** ein Benutzer Datei → „Neues Projekt“ wählt und die Rückfrage
  bestätigt
- **THEN** ist der Bildstreifen leer, die Mediensammlung ist unverändert, und
  der neue Zustand ist gespeichert

#### Scenario: Info-Dialog
- **WHEN** ein Benutzer Hilfe → „Info“ wählt
- **THEN** erscheint ein modaler Dialog mit dem Hinweis, dass moviemakerY2K
  vom klassischen Movie Maker inspiriert ist und kein Microsoft-Produkt ist

### Requirement: Y2K-Theme ohne Original-Assets
Das Erscheinungsbild MUST an den Stil von Windows XP/Luna erinnern
(blaue Titelleiste mit Verlauf, hellbeige Fensterflächen, plastische
Schaltflächen, blau hinterlegte Aufgabengruppen). Es MUST vollständig aus
eigenen CSS-Definitionen und eigenen Symbolen bestehen und MUST NOT Icons,
Bitmaps, Sounds, Schriften oder Texte von Microsoft enthalten. Alle Farben
MUST über zentrale Theme-Tokens definiert sein.

#### Scenario: Asset-Prüfung
- **WHEN** ein Reviewer die ausgelieferten Dateien der Web-App durchsieht
- **THEN** findet er nur eigene SVG-Symbole und CSS, keine aus Windows oder
  Movie Maker übernommenen Ressourcen

### Requirement: Statusleiste und Backend-Zustand
Die Statusleiste MUST anzeigen, ob das Backend erreichbar ist und ob das
Projekt gespeichert ist („Gespeichert“, „Wird gespeichert…“ oder
„Speichern fehlgeschlagen“). Ist das Backend nicht erreichbar, MUST die
Anwendung eine verständliche Meldung im Y2K-Dialogstil zeigen, statt
abzustürzen.

#### Scenario: Backend fällt aus
- **WHEN** das Backend während der Bearbeitung nicht mehr antwortet und ein
  Speichern fehlschlägt
- **THEN** zeigt die Statusleiste „Speichern fehlgeschlagen“, und die
  Anwendung versucht es bei der nächsten Änderung erneut

### Requirement: Grundlegende Barrierefreiheit
Alle interaktiven Elemente MUST echte Schaltflächen bzw. Menüelemente mit
zugänglichem Namen sein, einen sichtbaren Fokus haben und per Tastatur
erreichbar sein.

#### Scenario: Bedienung per Tastatur
- **WHEN** ein Benutzer nur mit der Tab-Taste durch die Oberfläche navigiert
- **THEN** erreicht er Menüleiste, Aufgabenbereich, Sammlung, Player-Steuerung
  und Storyboard, und der Fokus ist jederzeit sichtbar
