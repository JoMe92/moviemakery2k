## ADDED Requirements

### Requirement: Zeitabhängige Effekte
Der Katalog MUST sieben zeitabhängige Effekte enthalten: Einblenden aus
Schwarz, Einblenden aus Weiß, Ausblenden zu Schwarz, Ausblenden zu Weiß,
Langsam vergrößern, Langsam verkleinern, Farbton-Zyklus. Sie MUST über
dasselbe Feld `effectId` und denselben Effekt-Platz gesetzt werden wie jeder
andere Effekt.

Ein zeitabhängiger Effekt MUST sich aus genau einem zusätzlichen Wert
ergeben, dem **Fortschritt des Elements über seine eigene Spanne**: 0,0 am
Anfang des Elements, 1,0 an seinem Ende, dazwischen linear, außerhalb
geklemmt. Maßgeblich ist die ganze Anzeigedauer des Elements
**einschließlich** seines eingehenden Übergangs; das Setzen, Ändern oder
Entfernen eines Übergangs MUST den Verlauf des Effekts NOT ändern. Der Wert
MUST ausschließlich von Element und Zeitpunkt abhängen: Zwei Berechnungen zum
selben Zeitpunkt MUST denselben Wert liefern, unabhängig von Reihenfolge,
Bildwiederholrate, Frame-Zähler oder vorher gezeichneten Frames. Steht ein
Element mitten in einem Übergang, MUST jedes der beiden beteiligten Elemente
seinen eigenen Wert erhalten.

Vorschau und Export MUST diesen Wert aus derselben Definition ableiten und
MUST zu einem gemeinsamen Zeitpunkt dasselbe Bild liefern, innerhalb der
Toleranz der Spec movie-export, Requirement „Export entspricht der Vorschau“
(Abweichung je Farbkanal höchstens 2 bei mindestens 99,5 % der Pixel). Der
Export MUST dafür den Zeitpunkt des Frames verwenden, aus dem er ohnehin
Segment, Übergangs-Fortschritt und die Position in einem Videoclip ableitet
(Frame `n` bei `t = n / fps`), und MUST den Wert NOT aus dem Frame-Index
bilden. Die Vorschau MUST ihn aus der Position ihres Wiedergabe-Zeitgebers
bilden, also aus demselben Zeitpunkt, mit dem sie das anzuzeigende Segment
bestimmt. Das Ergebnis des Effekt-Durchgangs MUST NOT über Frames hinweg
wiederverwendet werden; der Durchgang MUST in jedem gezeichneten Frame neu
laufen.

Die 21 zustandslosen Effekte MUST von diesem Wert unberührt bleiben und Bild
für Bild dasselbe Ergebnis liefern wie bisher.

#### Scenario: Einblenden aus Schwarz in der Vorschau
- **WHEN** ein Benutzer den Effekt „Einblenden aus Schwarz“ auf ein
  Bild-Element von 4 s ohne eingehenden Übergang setzt und die Wiedergabe von
  dessen Anfang an verfolgt
- **THEN** ist das Element am Anfang vollständig schwarz, nach 2 s zur Hälfte
  aufgehellt und am Ende unverändert sichtbar

#### Scenario: Derselbe Zeitpunkt in Vorschau und Export
- **WHEN** für ein Element mit „Einblenden aus Schwarz“ das Bild bei einem
  Zeitpunkt, der ein Vielfaches von 1/30 s ist, aus der Vorschau und aus dem
  exportierten Film verglichen wird
- **THEN** liegen die Abweichungen innerhalb der Toleranz der Spec
  movie-export

#### Scenario: Rampe unabhängig vom eingehenden Übergang
- **WHEN** ein Benutzer vor ein Element von 4 s mit „Einblenden aus Schwarz“
  einen Übergang von 1 s setzt
- **THEN** bleibt der Verlauf der Einblendung derselbe wie ohne Übergang: das
  Element ist zu Beginn des Übergangs vollständig schwarz und 2 s nach
  seinem Anfang zur Hälfte aufgehellt

#### Scenario: Beide Elemente eines Übergangs mit eigener Rampe
- **WHEN** die Wiedergabe mitten in einem Übergang von einem Element mit
  „Ausblenden zu Schwarz“ auf ein Element mit „Einblenden aus Schwarz“ steht
- **THEN** zeigt der Monitor die Überblendung zwischen dem schon weitgehend
  abgedunkelten Ausgangselement und dem noch weitgehend abgedunkelten
  Zielelement, jedes mit dem Fortschritt seiner eigenen Spanne

#### Scenario: Farbton-Zyklus über das Element
- **WHEN** ein Benutzer den Effekt „Farbton-Zyklus“ auf ein Bild-Element
  setzt
- **THEN** ist das Bild am Anfang und am Ende des Elements unverändert und in
  der Mitte um 180° im Farbton gedreht

#### Scenario: Zeitabhängiger Effekt auf einem Videoclip
- **WHEN** ein Benutzer „Ausblenden zu Schwarz“ auf ein
  Videoclip-Element setzt, dessen `trimIn` bei 10 s liegt
- **THEN** beginnt die Ausblendung am Anfang des Elements im Bildstreifen und
  endet an seinem Ende, unabhängig von `trimIn` und `trimOut`

#### Scenario: Zustandsloser Effekt unverändert
- **WHEN** ein Projekt mit einem Element mit dem Effekt „Sepia“ exportiert
  wird
- **THEN** zeigt jedes Frame dieses Elements dasselbe sepiafarbene Bild wie
  vor der Einführung der zeitabhängigen Effekte

## MODIFIED Requirements

### Requirement: Effekt-Katalog
Das System MUST einen Katalog von Video-Effekten bereitstellen, den
Frontend und Backend gemeinsam nutzen (analog dem Übergangskatalog der Spec
transitions). Jeder Eintrag MUST eine stabile ID, einen deutschen und einen
englischen Anzeigenamen, seine Parameter mit festen Werten und die Quelle
der Parameter enthalten. Die Oberfläche MUST den Namen in der gewählten
Sprache zeigen. Das Backend MUST den Katalog über die API ausliefern und
MUST beim Start abbrechen, wenn der Katalog ungültig ist. Der Katalog MUST
genau diese 28 Einträge enthalten: Sepia, Negative, Posterisieren,
Schwellenwert, Schwarzweiß, Helligkeit+, Helligkeit−, Unschärfe, Verpixeln,
Film-Alterung Alt, Film-Alterung Älter, Film-Alterung Am ältesten,
Filmkörnung, Kohlestift, Federzeichnung, Aquarell, Spiegeln horizontal,
Spiegeln vertikal, Rotieren 90°, Rotieren 180°, Rotieren 270°, Einblenden
aus Schwarz, Einblenden aus Weiß, Ausblenden zu Schwarz, Ausblenden zu Weiß,
Langsam vergrößern, Langsam verkleinern, Farbton-Zyklus. Die beiden
Geschwindigkeits-Effekte des Originals (Speed Up Double, Slow Down Half)
MUST NOT im Katalog stehen; sie ändern die Zeitabbildung eines Videoclips
und sind keine Pixel-Operation.

#### Scenario: Katalog abrufen
- **WHEN** ein Client den Effekt-Katalog abruft
- **THEN** erhält er 28 Einträge mit ID, deutschem und englischem Namen,
  Parametern und Quelle

#### Scenario: Ungültiger Katalog
- **WHEN** ein Katalogeintrag ohne englischen Namen ausgeliefert werden soll
- **THEN** startet das Backend nicht und nennt den fehlerhaften Eintrag

#### Scenario: Geschwindigkeits-Effekte nicht enthalten
- **WHEN** der Katalog nach einem Eintrag für Speed Up Double oder Slow Down
  Half durchsucht wird
- **THEN** enthält er keinen solchen Eintrag

### Requirement: Sammlung „Videoeffekte“
Die Sammlung „Videoeffekte“ MUST alle Katalogeinträge als Kacheln mit Namen
und einem eigenen Vorschausymbol zeigen. Ein Doppelklick auf eine Kachel
MUST den Effekt am eingebauten Beispielbild demonstrieren, gekennzeichnet
mit dem Namen des Effekts; Wiedergabe, Suchen oder die Auswahl eines
Elements im Bildstreifen MUST den Monitor zum Projekt zurückbringen (wie bei
„Videoübergänge“). Die Demo MUST dabei den Fortschritt des Elements von 0,0
auf 1,0 über 2 Sekunden führen und danach von vorn beginnen, solange sie
sichtbar ist — bei jedem Eintrag, auch bei den zustandslosen, die diesen Wert
ignorieren und dadurch unverändert statisch aussehen.

#### Scenario: Effekt ansehen
- **WHEN** ein Benutzer in der Sammlung „Videoeffekte“ doppelt auf „Sepia“
  klickt
- **THEN** zeigt der Monitor das Beispielbild mit angewendetem
  Sepia-Effekt und dem Hinweis „Beispiel: Sepia“

#### Scenario: Zeitabhängigen Effekt ansehen
- **WHEN** ein Benutzer in der Sammlung „Videoeffekte“ doppelt auf
  „Einblenden aus Schwarz“ klickt
- **THEN** blendet das Beispielbild aus Schwarz auf, in einer Schleife von
  2 Sekunden, mit dem Hinweis „Beispiel: Einblenden aus Schwarz“

#### Scenario: Demo endet bei der Wiedergabe
- **WHEN** ein Benutzer während der laufenden Demo eines zeitabhängigen
  Effekts Wiedergabe drückt
- **THEN** zeigt der Monitor wieder das Projekt, und die Demo läuft nicht
  weiter
