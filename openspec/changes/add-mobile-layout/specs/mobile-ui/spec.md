## ADDED Requirements

### Requirement: Layout-Modi
Die Anwendung MUST je nach Fenstergröße einen von drei Layout-Modi verwenden:
*kompakt* bei einer Breite unter 600 px oder im Querformat mit einer Höhe
unter 500 px, *mittel* bei einer Breite von 600 bis 1279 px und *breit* ab
1280 px (Movie-Maker-Layout der Spec app-shell). Der Modus MUST beim Ändern
der Fenstergröße oder Ausrichtung ohne Neuladen wechseln, und der
Bearbeitungszustand (Projekt, Auswahl, Wiedergabeposition) MUST dabei
erhalten bleiben. In keinem Modus MUST die Seite horizontal scrollen.

#### Scenario: Handy im Hochformat
- **WHEN** ein Benutzer die Anwendung in einem Fenster von 390×844 px öffnet
- **THEN** erscheint das kompakte Layout, und die Seite hat keine horizontale
  Scrollleiste

#### Scenario: Drehen des Geräts
- **WHEN** ein Benutzer im kompakten Layout bei laufender Wiedergabe das
  Gerät ins Querformat (844×390 px) dreht
- **THEN** erscheint das kompakte Querformat-Layout, die Wiedergabe läuft an
  derselben Stelle weiter, und die Auswahl bleibt erhalten

#### Scenario: Tablet
- **WHEN** ein Benutzer die Anwendung in einem Fenster von 820×1180 px öffnet
- **THEN** erscheint das mittlere Layout mit Monitor und Sammlung
  nebeneinander und dem Bildstreifen darunter

#### Scenario: Desktop unverändert
- **WHEN** ein Benutzer die Anwendung mit Maus in einem Fenster von
  1280×720 px öffnet
- **THEN** erscheint das Movie-Maker-Layout der Spec app-shell ohne
  Taskleiste und ohne Bottom-Sheets

### Requirement: Kompaktes Layout
Das kompakte Layout MUST im Hochformat von oben nach unten bestehen aus:
Titelleiste im Luna-Stil mit Projektname und Menüschaltfläche,
Vorschaumonitor (4:3, höchstens 45 % der Fensterhöhe), Steuerleiste der
Wiedergabe, Bildstreifen mit horizontalem Scrollen, Musikleiste, einer
Aktionsleiste für das gewählte Element (nur bei Auswahl) und der Taskleiste.
Im Querformat MUST der Monitor mit Steuerleiste links und der
Bearbeitungsbereich mit Taskleiste rechts stehen. Der Speicherzustand MUST
weiterhin erkennbar sein: „Speichern fehlgeschlagen“ dauerhaft als Symbol mit
zugänglichem Namen in der Titelleiste, andere Zustandswechsel als kurzer
Hinweis.

#### Scenario: Leeres Projekt am Handy
- **WHEN** ein Benutzer ein leeres Projekt im kompakten Layout öffnet
- **THEN** zeigt der Bildstreifen einen Hinweis, dass man über „1. Aufnehmen“
  Bilder importieren und hinzufügen kann

#### Scenario: Speichern schlägt fehl
- **WHEN** im kompakten Layout ein Speichern fehlschlägt
- **THEN** zeigt die Titelleiste ein Warnsymbol mit dem zugänglichen Namen
  „Speichern fehlgeschlagen“, bis ein späteres Speichern gelingt

### Requirement: Taskleiste mit den drei Movie-Maker-Schritten
Im kompakten und im mittleren Layout MUST am unteren Rand eine Taskleiste im
Y2K-Stil mit den Schaltflächen „1. Aufnehmen“, „2. Bearbeiten“ und
„3. Fertig stellen“ stehen. Jede Schaltfläche MUST ein Sheet mit genau den
Einträgen der gleichnamigen Gruppe des Aufgabenbereichs (Spec app-shell)
öffnen, mit derselben Aktivierung; deaktivierte Einträge MUST sichtbar und als
deaktiviert ausgezeichnet sein. Die Taskleiste MUST den unteren Safe-Area-Rand
freilassen.

#### Scenario: Bilder importieren über die Taskleiste
- **WHEN** ein Benutzer auf „1. Aufnehmen“ und dann auf „Bilder importieren“
  tippt
- **THEN** öffnet sich die Dateiauswahl des Geräts für JPEG, PNG und WebP

#### Scenario: Film fertig stellen über die Taskleiste
- **WHEN** der Bildstreifen leer ist und ein Benutzer auf „3. Fertig stellen“
  tippt
- **THEN** ist „Auf dem Computer speichern“ sichtbar, aber deaktiviert

### Requirement: Bottom-Sheets im Y2K-Stil
Sammlungen, Übergangsauswahl, Aktionsmenüs, Menüs und alle Dialoge MUST im
kompakten Layout als Sheets von unten erscheinen, gestaltet als Y2K-Fenster
(Luna-Titelzeile, beige Fläche, plastische Schaltflächen). Ein Sheet MUST
modal sein, den Fokus festhalten und beim Schließen an das auslösende Element
zurückgeben. Es MUST sich per „Schließen“, Escape, Tippen auf den Hintergrund
und Herunterwischen am Griff schließen lassen. Bei
`prefers-reduced-motion: reduce` MUST es ohne Animation erscheinen.

#### Scenario: Sheet herunterwischen
- **WHEN** ein Benutzer das Sammlungs-Sheet am Griff um mehr als 80 px nach
  unten wischt
- **THEN** schließt sich das Sheet, und der Fokus liegt wieder auf der
  auslösenden Schaltfläche

#### Scenario: Dialog als Sheet
- **WHEN** ein Benutzer im kompakten Layout Hilfe → „Info“ wählt
- **THEN** erscheint der Info-Dialog als Sheet von unten mit derselben
  Information wie am Desktop

### Requirement: Touch-Bedienung mit Funktionsgleichheit
Bei grobem Zeiger oder im kompakten Layout MUST jede Funktion, die am Desktop
per Maus erreichbar ist, ohne Hover, Doppelklick, Rechtsklick und ohne
Ziehen erreichbar sein. Tippen MUST ein Element (Bild, Übergangsslot,
Musikstück) wählen; die Aktionsleiste MUST die Aktionen des gewählten
Elements anbieten (Bild: Dauer, Nach links, Nach rechts, Übergang davor,
Entfernen; Musikstück: Lautstärke, Kürzen, Einblenden, Ausblenden, Nach
links, Nach rechts, Entfernen). Langes Drücken (400 ms) und eine
„⋯“-Schaltfläche je Element MUST dasselbe Menü öffnen, das am Desktop der
Rechtsklick öffnet, als Aktions-Sheet. Alle Aktionen MUST dieselbe Wirkung
haben wie ihre Desktop-Entsprechung.

#### Scenario: Bild nach rechts verschieben
- **WHEN** ein Benutzer im kompakten Layout das erste von drei Bildern
  antippt und in der Aktionsleiste „Nach rechts“ wählt
- **THEN** steht das Bild an zweiter Stelle, die Übergänge bleiben ihren
  Bildern zugeordnet wie beim Umsortieren am Desktop, und der Zustand ist
  gespeichert

#### Scenario: Aktionsmenü per langem Drücken
- **WHEN** ein Benutzer ein Musikstück 400 ms lang drückt, ohne den Finger
  mehr als 8 px zu bewegen
- **THEN** öffnet sich ein Aktions-Sheet mit denselben Einträgen wie das
  Kontextmenü des Musikstücks am Desktop

#### Scenario: Film an Musik anpassen am Handy
- **WHEN** Bildstreifen und Musikleiste nicht leer sind und ein Benutzer im
  Sheet „Menü“ Clip → „Film an Musik anpassen“ wählt
- **THEN** verhält sich die Anwendung wie bei Clip → „Film an Musik anpassen“
  in der Spec music-track

### Requirement: Hinzufügen aus der Sammlung per Auswahl
Das Sammlungs-Sheet MUST die Reiter „Meine Bilder“, „Meine Musik“ und
„Videoübergänge“ sowie „Importieren“ anbieten. In „Meine Bilder“ und „Meine
Musik“ MUST Tippen eine Kachel zur Auswahl hinzufügen oder aus ihr entfernen
(sichtbares Häkchen, `aria-pressed`). Die Schaltfläche „Zum Bildstreifen
hinzufügen (n)“ bzw. „Zur Musikleiste hinzufügen (n)“ MUST die gewählten
Elemente in Auswahlreihenfolge einfügen, Bilder hinter dem gewählten Bild oder
am Ende, Musik am Ende, und danach das Sheet schließen. Langes Drücken auf eine
Kachel MUST „Eigenschaften“ und „Löschen“ anbieten.

#### Scenario: Drei Bilder hinzufügen
- **WHEN** ein Benutzer bei leerem Bildstreifen im Sammlungs-Sheet drei
  Bilder in der Reihenfolge C, A, B antippt und „Zum Bildstreifen hinzufügen
  (3)“ wählt
- **THEN** enthält der Bildstreifen C, A, B mit Standarddauer, und das Sheet
  ist geschlossen

#### Scenario: Keine Auswahl
- **WHEN** im Sammlungs-Sheet kein Element gewählt ist
- **THEN** ist die Schaltfläche zum Hinzufügen deaktiviert

### Requirement: Umsortieren per Touch
Bei grobem Zeiger MUST man ein Bild oder Musikstück durch langes Drücken
(400 ms) und anschließendes Ziehen umsortieren können; eine kürzere Berührung
mit Bewegung MUST den Bildstreifen scrollen statt zu ziehen. Während des
Ziehens MUST der Bildstreifen am Rand automatisch scrollen, und die Seite MUST
weder scrollen noch neu laden. Im mittleren Layout MUST man zusätzlich Bilder
aus der Sammlung in den Bildstreifen ziehen können.

#### Scenario: Scrollen statt Ziehen
- **WHEN** ein Benutzer im Bildstreifen sofort nach dem Aufsetzen den Finger
  nach links bewegt
- **THEN** scrollt der Bildstreifen, und die Reihenfolge bleibt unverändert

#### Scenario: Ziehen nach langem Drücken
- **WHEN** ein Benutzer das dritte Bild 400 ms drückt und an die erste Stelle
  zieht
- **THEN** steht es an erster Stelle, und der Zustand ist gespeichert

### Requirement: Übergänge per Sheet setzen
Tippen auf einen Übergangsslot MUST das Sheet „Übergang“ öffnen mit „Kein
Übergang“, allen Übergängen des Katalogs in der Sprache der Oberfläche und der
Dauer als Stepper (0,25–5 s, Schritt 0,25 s). Wählen eines Übergangs MUST ihn
sofort setzen und ihn im Monitor einmal am Projekt abspielen; „Kein Übergang“
MUST ihn entfernen. Das Sheet MUST bis „Fertig“ offen bleiben.

#### Scenario: Übergang setzen am Handy
- **WHEN** ein Benutzer auf den Slot zwischen dem ersten und zweiten Bild
  tippt und „Kreis“ wählt
- **THEN** ist dort der Übergang „Kreis“ mit seiner Standarddauer gesetzt, der
  Monitor spielt ihn einmal ab, und der Zustand ist gespeichert

#### Scenario: Dauer per Stepper
- **WHEN** ein Benutzer im Sheet „Übergang“ bei 5 s auf „+“ tippt
- **THEN** bleibt die Dauer bei 5 s, und „+“ ist deaktiviert

### Requirement: Touch-taugliche Eingaben
Dialoge mit Zahlenwerten (Bilddauer, Übergangsdauer, Lautstärke, Kürzen)
MUST bei grobem Zeiger einen Stepper (−, Wert, +) mit festen Schrittweiten
(0,5 s; 0,25 s; 5 %; 0,1 s) und einen Schieberegler anbieten; das Zahlenfeld
MUST eine numerische Tastatur anfordern und mindestens 16 px Schrift haben.
Der Kürzen-Dialog MUST Anfang und Ende als ziehbare Griffe auf der Wellenform
anbieten. Der Assistent „Film speichern“ MUST im kompakten Layout den ganzen
Bildschirm einnehmen und „Zurück“, „Weiter“ und „Abbrechen“ am unteren Rand
zeigen. Die Gültigkeitsregeln der Spezifikationen slideshow-project,
transitions, music-track und movie-export MUST unverändert gelten.

#### Scenario: Bilddauer per Stepper
- **WHEN** ein Benutzer im Dialog „Dauer…“ eines Bildes mit 3 s zweimal auf
  „+“ tippt und bestätigt
- **THEN** hat das Bild eine Dauer von 4 s

#### Scenario: Kein Zoom beim Eingeben
- **WHEN** ein Benutzer auf iOS Safari in das Zahlenfeld der Bilddauer tippt
- **THEN** erscheint eine numerische Tastatur, und die Seite zoomt nicht

### Requirement: Menü im kompakten Layout
Im kompakten Layout MUST die Menüschaltfläche der Titelleiste ein Sheet
„Menü“ öffnen, das alle Menüs der Menüleiste (Spec app-shell) als
aufklappbare Gruppen mit denselben Einträgen und derselben Aktivierung
enthält.

#### Scenario: Neues Projekt am Handy
- **WHEN** ein Benutzer im Sheet „Menü“ Datei → „Neues Projekt“ wählt und die
  Rückfrage bestätigt
- **THEN** ist der Bildstreifen leer, und die Mediensammlung ist unverändert

### Requirement: Gesten mit Alternativen
Bei grobem Zeiger MUST gelten: horizontales Wischen im Monitor um mindestens
48 px springt zum vorherigen bzw. nächsten Bild; Doppeltippen im Monitor
öffnet die Vollbildvorschau; Zwei-Finger-Zoom im Bildstreifen ändert die
Kachelgröße in den Stufen klein, mittel und groß. Jede Geste MUST eine
gleichwertige Schaltfläche haben (Vorheriges/Nächstes, „Vollbild“,
„Kleiner“/„Größer“). Die Vollbildvorschau MUST die Fullscreen-API nutzen und,
wo sie fehlt, den Monitor über den ganzen Viewport legen; „Vollbild beenden“
und Escape MUST sie schließen. Die Kachelgröße MUST lokal gespeichert werden.

#### Scenario: Wischen zum nächsten Bild
- **WHEN** ein Benutzer im pausierten Monitor beim ersten Bild nach links
  wischt
- **THEN** steht die Wiedergabeposition am Anfang des zweiten Bildes

#### Scenario: Vollbild ohne Fullscreen-API
- **WHEN** ein Benutzer in einem Browser ohne Fullscreen-API für Elemente auf
  „Vollbild“ tippt
- **THEN** liegt der Monitor über dem ganzen Viewport, und „Vollbild beenden“
  stellt das kompakte Layout wieder her

### Requirement: Haptische Rückmeldung
Wenn das Gerät Vibration unterstützt, MUST die Anwendung kurz vibrieren, wenn
ein langes Drücken auslöst, ein Element abgelegt wird und ein Ablegen
abgelehnt wird. „Extras → Optionen…“ MUST dann einen Schalter „Vibration“
(Standard an) enthalten, der lokal gespeichert wird. Ohne Vibrations-API MUST
der Schalter fehlen und nichts vibrieren.

#### Scenario: Vibration ausschalten
- **WHEN** ein Benutzer in „Optionen…“ „Vibration“ ausschaltet und danach ein
  Bild per langem Drücken zieht
- **THEN** vibriert das Gerät nicht, und die Einstellung gilt auch nach dem
  Neuladen

### Requirement: Mobile Darstellung und Leistung
Die Anwendung MUST die Safe Areas des Geräts berücksichtigen (keine
Bedienelemente unter Notch, Kamera-Ausschnitt oder Home-Indikator) und die
dynamische Viewport-Höhe verwenden, sodass die Taskleiste bei ein- und
ausgeblendeter Browserleiste sichtbar bleibt. Ziehen und Wischen MUST kein
Pull-to-Refresh auslösen. Der Zeichenpuffer der Vorschau MUST höchstens das
Zweifache der CSS-Größe und höchstens 1920 px Breite haben. Wird der Tab
verdeckt, MUST die Wiedergabe pausieren und die Render-Schleife stoppen.
Hinweise und Animationen im Y2K-Stil MUST bei `prefers-reduced-motion`
ohne Bewegung erscheinen.

#### Scenario: Tab im Hintergrund
- **WHEN** während der Wiedergabe der Browser in den Hintergrund wechselt
- **THEN** ist die Wiedergabe pausiert, und beim Zurückkehren steht der
  Monitor an der pausierten Stelle

#### Scenario: Gerät mit Notch
- **WHEN** die Anwendung im Querformat auf einem Gerät mit seitlichem
  Kamera-Ausschnitt läuft
- **THEN** liegt kein Bedienelement im Bereich der Safe-Area-Ränder
