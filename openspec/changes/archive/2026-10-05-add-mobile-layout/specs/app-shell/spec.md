## MODIFIED Requirements

### Requirement: Movie-Maker-Layout
Im breiten Layout-Modus (ab 1280 px Breite, Spec mobile-ui) MUST die
Anwendung in einem Fenster-Layout erscheinen, bestehend aus Titelleiste,
Menüleiste (Datei, Bearbeiten, Ansicht, Extras, Clip, Wiedergabe, Hilfe),
Symbolleiste mit Sammlungsauswahl, Aufgabenbereich links, Sammlungsbereich in
der Mitte, Vorschaumonitor rechts, darunter das Storyboard über die volle
Breite und eine Statusleiste. Bei einer Fenstergröße ab 1280×720 MUST das
Layout ohne horizontales Scrollen der Seite auskommen. Für kleinere Fenster
MUST das kompakte bzw. mittlere Layout der Spec mobile-ui gelten.

#### Scenario: Start der Anwendung
- **WHEN** ein Benutzer die Anwendung im Browser in einem Fenster ab
  1280×720 px öffnet
- **THEN** sieht er alle genannten Bereiche gleichzeitig, und das Storyboard
  zeigt bei leerem Projekt einen Hinweis, dass man Bilder hierher ziehen kann

#### Scenario: Kleines Fenster
- **WHEN** ein Benutzer die Anwendung in einem Fenster von 390×844 px öffnet
- **THEN** erscheint statt des Movie-Maker-Layouts das kompakte Layout der
  Spec mobile-ui

### Requirement: Grundlegende Barrierefreiheit
Alle interaktiven Elemente MUST echte Schaltflächen bzw. Menüelemente mit
zugänglichem Namen sein, einen sichtbaren Fokus haben und per Tastatur
erreichbar sein. Innerhalb eines Dialogs MUST jeder zugängliche Name einer
Schaltfläche eindeutig sein. Bei grobem Zeiger (`pointer: coarse`) und im
kompakten Layout MUST jedes interaktive Element eine Zielfläche von
mindestens 44×44 px haben. Jede Funktion, die per Ziehen oder per Geste
erreichbar ist, MUST auch über eine einzelne Schaltfläche erreichbar sein.

#### Scenario: Bedienung per Tastatur
- **WHEN** ein Benutzer nur mit der Tab-Taste durch die Oberfläche navigiert
- **THEN** erreicht er Menüleiste, Aufgabenbereich, Sammlung, Player-Steuerung
  und Storyboard, und der Fokus ist jederzeit sichtbar

#### Scenario: Eindeutige Namen im Fehlerdialog
- **WHEN** ein Fehlerdialog mit der Schaltfläche „Schließen“ geöffnet ist
- **THEN** heißt die Schaltfläche in der Titelleiste „Dialog schließen“, und
  kein zweites Element im Dialog trägt den Namen „Schließen“

#### Scenario: Zielgröße am Handy
- **WHEN** ein Prüfer im kompakten Layout die Maße aller sichtbaren
  interaktiven Elemente misst
- **THEN** ist jedes mindestens 44 px breit und 44 px hoch

#### Scenario: Alternative zum Ziehen
- **WHEN** ein Benutzer ein Bild umsortieren will, ohne zu ziehen
- **THEN** kann er es wählen und mit „Nach links“ bzw. „Nach rechts“
  verschieben
