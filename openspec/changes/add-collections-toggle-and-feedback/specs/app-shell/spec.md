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

## ADDED Requirements

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
