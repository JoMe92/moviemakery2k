# app-shell Specification

## Purpose
Das Hauptfenster von moviemakerY2K: eine eigene Y2K-Interpretation des
Movie-Maker-2.x-Layouts mit Menüleiste, Aufgabenbereich, Sammlungen,
Vorschaumonitor und Storyboard sowie dem visuellen Theme.

## Requirements

### Requirement: Movie-Maker-Layout
Im breiten Layout-Modus (ab 1280 px Breite, Spec mobile-ui) MUST die
Anwendung in einem Fenster-Layout erscheinen, bestehend aus Titelleiste,
Menüleiste (Datei, Bearbeiten, Ansicht, Extras, Clip, Wiedergabe, Hilfe),
Symbolleiste mit Sammlungsauswahl, Aufgabenbereich links, Sammlungsbereich in
der Mitte, Vorschaumonitor rechts, darunter das Storyboard über die volle
Breite und eine Statusleiste. Bei einer Fenstergröße ab 1280×720 MUST das
Layout ohne horizontales Scrollen der Seite auskommen. Für kleinere Fenster
MUST das kompakte bzw. mittlere Layout der Spec mobile-ui gelten.

Im breiten und im mittleren Layout MUST die Symbolleiste links neben der
Sammlungsauswahl eine Umschaltfläche „Sammlungen“ tragen, die den
Sammlungsbereich ein- und ausblendet. Ihr zugänglicher Name MUST in beiden
Zuständen gleich bleiben, und ihr Zustand MUST über `aria-pressed`
ausgezeichnet sein (gedrückt, solange der Bereich sichtbar ist). Ist der
Bereich ausgeblendet, MUST der frei werdende Platz an den Vorschaumonitor
gehen; Aufgabenbereich, Storyboard, Musikleiste und Statusleiste MUST
unverändert bleiben. Die Sammlungsauswahl MUST auch dann bedienbar bleiben.
Jede Aktion, die eine Sammlung wählt — die Sammlungsauswahl, „Sammlungen
anzeigen“, „Videoübergänge anzeigen“ und der Import —, MUST den
Sammlungsbereich wieder einblenden. Der Zustand MUST NOT über ein Neuladen
hinaus gemerkt werden: Nach dem Laden ist der Sammlungsbereich sichtbar. Das
kompakte Layout hat keine Symbolleiste; dort MUST es die Umschaltfläche nicht
geben, und das Sammlungs-Sheet der Spec mobile-ui MUST ihre Rolle
unverändert weiter übernehmen.

#### Scenario: Start der Anwendung
- **WHEN** ein Benutzer die Anwendung im Browser in einem Fenster ab
  1280×720 px öffnet
- **THEN** sieht er alle genannten Bereiche gleichzeitig, der
  Sammlungsbereich ist sichtbar, die Umschaltfläche „Sammlungen“ ist als
  gedrückt ausgezeichnet, und das Storyboard zeigt bei leerem Projekt einen
  Hinweis, dass man Bilder hierher ziehen kann

#### Scenario: Kleines Fenster
- **WHEN** ein Benutzer die Anwendung in einem Fenster von 390×844 px öffnet
- **THEN** erscheint statt des Movie-Maker-Layouts das kompakte Layout der
  Spec mobile-ui, und es gibt keine Symbolleiste und keine Umschaltfläche
  „Sammlungen“

#### Scenario: Sammlungsbereich ausblenden
- **WHEN** ein Benutzer im breiten Layout auf die Umschaltfläche
  „Sammlungen“ klickt
- **THEN** ist der Sammlungsbereich nicht mehr sichtbar, der Vorschaumonitor
  nimmt den frei gewordenen Platz ein, der Aufgabenbereich steht unverändert
  links, und die Schaltfläche ist als nicht gedrückt ausgezeichnet

#### Scenario: Sammlungsbereich zurückholen
- **WHEN** ein Benutzer bei ausgeblendetem Sammlungsbereich erneut auf die
  Umschaltfläche „Sammlungen“ klickt
- **THEN** steht der Sammlungsbereich wieder an seiner Stelle mit derselben
  Sammlung wie vorher

#### Scenario: Aktion holt den Bereich zurück
- **WHEN** ein Benutzer bei ausgeblendetem Sammlungsbereich im
  Aufgabenbereich auf „Videoübergänge anzeigen“ klickt
- **THEN** ist der Sammlungsbereich wieder sichtbar und zeigt den
  Übergangskatalog, und die Sammlungsauswahl steht auf „Videoübergänge“

#### Scenario: Ausgeblendet im mittleren Layout
- **WHEN** ein Benutzer die Anwendung in einem Fenster von 820×1180 px öffnet
  und auf die Umschaltfläche „Sammlungen“ tippt
- **THEN** füllt der Vorschaumonitor die Arbeitsfläche, und Taskleiste,
  Bildstreifen und Musikleiste bleiben unverändert

#### Scenario: Nach dem Neuladen wieder sichtbar
- **WHEN** ein Benutzer den Sammlungsbereich ausblendet und die Seite neu
  lädt
- **THEN** ist der Sammlungsbereich wieder sichtbar

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
ist. Alle anderen Einträge (u. a. Im Web veröffentlichen) MUST sichtbar,
aber deaktiviert sein.

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
„Rückgängig“ und „Wiederholen“, Bearbeiten → „Ausschneiden“, „Kopieren“ und
„Einfügen“ (Spec edit-commands), Bearbeiten → „Löschen“ (entfernt das
gewählte Storyboard-Element), Wiedergabe → „Wiedergabe/Pause“ und „Stopp“,
Extras → „Optionen…“ (Dialog mit der Spracheinstellung, Spec localization),
Extras → „AutoMovie…“ (öffnet den AutoMovie-Dialog, Spec automovie),
Extras → „Als App installieren…“ (Spec installable-app; nur im sicheren
Kontext und nicht im Standalone-Modus vorhanden), Hilfe → „Info“ (Dialog mit
Name, Version und dem Hinweis, dass kein Bezug zu Microsoft besteht).
Datei → „Projekt öffnen…“ und „Projekt speichern“ sowie Bearbeiten → „Alles
auswählen“ MUST sichtbar, aber deaktiviert bleiben (keine
Mehrprojekt-Verwaltung, keine Mehrfachauswahl). Weitere Einträge belegen
andere Specs: Ansicht → „Zeitachse“ (Spec timeline-view), Clip → „Teilen“
(Spec slideshow-project) und Clip → „Film an Musik anpassen“ (Spec
music-track). Alle übrigen Menüeinträge MUST sichtbar und deaktiviert sein.

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

### Requirement: Kurzhinweis und Bestätigung beim Hinzufügen
Die Anwendung MUST einen Kurzhinweis für die zuletzt ausgeführte Aktion
kennen, der in jedem Layout-Modus erscheint und nach etwa 2,5 Sekunden von
selbst verschwindet. Im breiten Layout MUST er als vorübergehende Angabe in
der Statusleiste erscheinen, im mittleren und kompakten Layout als kurz
eingeblendeter Hinweis. Er MUST für Hilfstechnologien höflich angekündigt
werden (`role="status"`, `aria-live="polite"`). Solange ein Kurzhinweis zu
einer Aktion steht, MUST ihn keine Zustandsmeldung („Gespeichert“,
Backend-Wechsel) ersetzen; ein neuer Aktionshinweis MUST den vorherigen
sofort ersetzen. Das dauerhafte Warnsymbol „Speichern fehlgeschlagen“ MUST
davon unberührt bleiben.

Wird aus der Sammlung etwas zum Bildstreifen oder zur Musikleiste
hinzugefügt — über die Schaltfläche des Sammlungs-Sheets, per Doppelklick auf
eine Kachel oder über deren Kontextmenü —, MUST die Anwendung einen
Kurzhinweis mit Anzahl und Art zeigen („3 Bilder hinzugefügt“, „1 Musikstück
hinzugefügt“), in der Sprache der Oberfläche und mit deren Pluralformen, und
das zuletzt hinzugefügte Element MUST im Bildstreifen bzw. in der Musikleiste
sichtbar gescrollt werden. Die Auswahl MUST dabei unverändert bleiben.
Unterstützt das Gerät Vibration und ist der Schalter „Vibration“ an, MUST es
zusätzlich kurz mit dem Muster für „abgelegt“ vibrieren; ohne Vibration MUST
die Rückmeldung allein aus Kurzhinweis und sichtbarem Scrollen bestehen.

#### Scenario: Bild per Doppelklick hinzufügen
- **WHEN** ein Benutzer im breiten Layout in der Sammlung „Meine Bilder“ auf
  eine Kachel doppelklickt
- **THEN** steht das Bild am Ende des Bildstreifens, es ist sichtbar
  gescrollt, und die Statusleiste zeigt vorübergehend „1 Bild hinzugefügt“

#### Scenario: Bestätigung überlebt das Speichern
- **WHEN** ein Benutzer etwas hinzufügt und das dadurch ausgelöste Speichern
  unmittelbar danach gelingt
- **THEN** bleibt der Kurzhinweis zum Hinzufügen bis zu seinem Ablauf stehen,
  und „Gespeichert“ verdrängt ihn nicht

#### Scenario: Musik über das Kontextmenü
- **WHEN** ein Benutzer in der Sammlung „Meine Musik“ im Kontextmenü einer
  Kachel „Zur Musikleiste hinzufügen“ wählt
- **THEN** steht das Musikstück am Ende der Musikleiste, es ist sichtbar
  gescrollt, und der Kurzhinweis meldet „1 Musikstück hinzugefügt“

#### Scenario: Ohne Vibration
- **WHEN** ein Benutzer auf einem Gerät ohne Vibrations-API aus der Sammlung
  hinzufügt
- **THEN** erscheint der Kurzhinweis trotzdem, und die neuen Elemente sind
  sichtbar gescrollt
