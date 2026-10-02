# preview-player Specification

## Purpose
Wiedergabe der Diashow im Vorschaumonitor in Echtzeit: Bilder mit ihren
Dauern und Übergängen, mit Steuerung, Suchleiste und Zeitanzeige.

## Requirements

### Requirement: Zeitmodell der Diashow
Die Wiedergabe MUST dem überlappenden Zeitmodell folgen: Ein Übergang
überlappt das Ende des Ausgangsbilds mit dem Anfang des Zielbilds. Die
wirksame Dauer eines Übergangs ist höchstens die Hälfte der Dauer jedes der
beiden beteiligten Bilder. Die Gesamtdauer ist die Summe der Bilddauern minus
der Summe der wirksamen Übergangsdauern.

#### Scenario: Gesamtdauer
- **WHEN** ein Projekt drei Bilder zu je 5 s und zwei Übergänge zu je 1,25 s
  enthält
- **THEN** zeigt der Monitor eine Gesamtdauer von 0:00:12,50

#### Scenario: Übergang länger als erlaubt
- **WHEN** ein Übergang mit 4 s zwischen zwei Bildern zu je 2 s liegt
- **THEN** dauert er bei der Wiedergabe 1 s

### Requirement: Wiedergabesteuerung
Der Monitor MUST die Schaltflächen Wiedergabe/Pause, Stopp, „Vorheriges
Bild“ und „Nächstes Bild“ bieten, dazu eine Suchleiste und eine Zeitanzeige
im Format `h:mm:ss,cc / h:mm:ss,cc` (Deutsch) bzw. `h:mm:ss.cc / h:mm:ss.cc`
(Englisch). Die Leertaste MUST Wiedergabe/Pause umschalten, solange der Fokus
nicht in einem Eingabefeld liegt. Stopp MUST an den Anfang springen. Am Ende
MUST die Wiedergabe anhalten und das letzte Bild stehen lassen. Ist der
Bildstreifen leer, MUST die Steuerung deaktiviert sein.

#### Scenario: Diashow abspielen
- **WHEN** ein Benutzer vier Bilder mit Übergängen im Bildstreifen hat und
  Wiedergabe drückt
- **THEN** zeigt der Monitor die Bilder nacheinander mit ihren Dauern und
  Übergängen, die Zeitanzeige läuft mit, und am Ende hält die Wiedergabe
  beim letzten Bild an

#### Scenario: Suchen während eines Übergangs
- **WHEN** ein Benutzer die Suchleiste auf einen Zeitpunkt mitten in einem
  Übergang zieht
- **THEN** zeigt der Monitor sofort den passenden Zwischenzustand dieses
  Übergangs

#### Scenario: Nächstes Bild
- **WHEN** ein Benutzer während der Wiedergabe von Bild 2 auf „Nächstes Bild“
  klickt
- **THEN** springt die Wiedergabe an den Anfang von Bild 3, also an das Ende
  des Übergangs dorthin

#### Scenario: Zeitanzeige auf Englisch
- **WHEN** die Sprache Englisch ist und die Wiedergabe bei 12,5 s steht
- **THEN** zeigt die Zeitanzeige „0:00:12.50“

### Requirement: Darstellung im Monitor
Der Monitor MUST ein Bild im Format 4:3 mit schwarzem Hintergrund zeigen.
Bilder MUST vollständig sichtbar und seitenverhältnistreu eingepasst werden,
freie Flächen bleiben schwarz. Die Wiedergabe MUST flüssig mit der
Bildwiederholrate des Browsers laufen; bei vier Bildern mit 1920 Pixeln Kante
darf es auf einem üblichen Laptop keine sichtbaren Ruckler bei Übergängen
geben.

#### Scenario: Hochkant-Bild
- **WHEN** ein Hochkant-Foto wiedergegeben wird
- **THEN** ist es vollständig sichtbar, mittig, mit schwarzen Balken links und
  rechts

### Requirement: Synchronität mit der Bearbeitung
Ändert sich das Projekt während der Pause, MUST der Monitor den Frame zum
aktuellen Zeitpunkt sofort neu zeichnen. Ist ein Element im Storyboard
ausgewählt und die Wiedergabe gestoppt, MUST der Monitor dieses Bild zeigen.
Während der Wiedergabe MUST das gerade sichtbare Element im Storyboard
hervorgehoben sein.

#### Scenario: Auswahl im Storyboard
- **WHEN** ein Benutzer bei gestoppter Wiedergabe das dritte Element im
  Storyboard anklickt
- **THEN** zeigt der Monitor das dritte Bild, und die Suchleiste steht an
  dessen Startzeit

### Requirement: Fehlende WebGL2-Unterstützung
Unterstützt der Browser kein WebGL2, MUST der Monitor statt eines leeren
Bildes eine verständliche Meldung zeigen. Der Rest der Anwendung MUST
benutzbar bleiben.

#### Scenario: Browser ohne WebGL2
- **WHEN** die Anwendung in einem Browser ohne WebGL2 geöffnet wird
- **THEN** zeigt der Monitor die Meldung, dass die Vorschau WebGL2 benötigt,
  und Import und Storyboard funktionieren weiter

### Requirement: Musik in der Wiedergabe
Der Vorschaumonitor MUST die Musikspur zur Wiedergabe der Bilder abspielen,
mit derselben Planung wie der Export (Spec music-track „Musik am Filmende“).
Solange Musik geplant ist, MUST die Audiouhr des Browsers die Wiedergabezeit
vorgeben, sodass Bild und Ton auch nach mehreren Minuten nicht
auseinanderlaufen. Pause, Stopp, Suchen und Änderungen an Projekt oder
Musikspur MUST die Musik sofort an der aktuellen Zeit fortsetzen bzw.
anhalten. Der Ton MUST erst nach einer Benutzeraktion starten. Während der
Demo eines Übergangs MUST die Musik stumm sein.

#### Scenario: Wiedergabe mit Musik
- **WHEN** ein Benutzer ein Projekt mit Bildern und einem Musikstück abspielt
- **THEN** beginnt die Musik bei 0:00 zusammen mit dem ersten Bild, und bei
  jedem Zeitpunkt entspricht die Stelle in der Musik der Zeitanzeige

#### Scenario: Suchen
- **WHEN** ein Benutzer während der Wiedergabe die Suchleiste auf 0:01:30
  zieht
- **THEN** spielt die Musik ab der Stelle, die nach der Musikspur zu 0:01:30
  gehört

#### Scenario: Pause
- **WHEN** ein Benutzer während der Wiedergabe Pause drückt
- **THEN** verstummt die Musik sofort, und Wiedergabe setzt sie an derselben
  Stelle fort
