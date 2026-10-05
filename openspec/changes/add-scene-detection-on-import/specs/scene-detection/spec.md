## ADDED Requirements

### Requirement: Ein Videoimport wird zu N Medien
Beim Import einer Videodatei MUST das System die Datei automatisch in ihre
Szenen zerlegen und je erkannter Szene **ein eigenes Video-Medium** in der
Sammlung „Meine Videos“ anlegen. Die Datei MUST dabei genau einmal gespeichert
werden; jedes entstehende Medium ist ein Fenster darauf und MUST `sourceIn`
(Sekunden ab Anfang der gespeicherten Quelle) sowie seine eigene `duration`
(Länge des Fensters) tragen. Ein Medium MUST sich in jeder Hinsicht wie ein
heute importiertes Video verhalten: in den Bildstreifen ziehen, kürzen,
teilen, löschen, exportieren und von AutoMovie verwenden. `trimIn` und
`trimOut` eines Videoclip-Elements MUST weiterhin relativ zum Medium gelten
(`0 ≤ trimIn < trimOut ≤` Dauer des Mediums); das Projektmodell MUST NOT ein
zweites Adressierungs-Niveau unterhalb der Medien-Kennung bekommen.

Die Medien eines Imports MUST in Szenenreihenfolge zusammenhängend an jener
Stelle der Importreihenfolge stehen, an der die Datei importiert wurde. Ihr
Anzeigename MUST der Dateiname mit der laufenden Nummer vor der Endung sein
(`Urlaub (1).mp4`, `Urlaub (2).mp4`, …), beginnend bei 1. Entsteht genau ein
Medium, MUST der Anzeigename der unveränderte Dateiname ohne Nummer sein.
Bestehende Video-Medien MUST als Fenster mit `sourceIn: 0` über ihre eigene
Quelle gelten.

#### Scenario: Video mit zwei Schnitten importieren
- **WHEN** ein Benutzer eine 30 s lange Videodatei „Urlaub.mp4“ mit zwei
  harten Szenenwechseln importiert
- **THEN** stehen in „Meine Videos“ drei Kacheln „Urlaub (1).mp4“,
  „Urlaub (2).mp4“ und „Urlaub (3).mp4“ in Szenenreihenfolge, jede mit eigener
  Dauer, und ihre Dauern ergeben zusammen 30 s

#### Scenario: Szene wie ein gewöhnliches Video benutzen
- **WHEN** ein Benutzer „Urlaub (2).mp4“ in den Bildstreifen zieht und auf
  einen Ausschnitt kürzt
- **THEN** verhält sich das Element wie jedes Videoclip-Element: `trimIn` und
  `trimOut` gelten innerhalb der Dauer dieser Szene, und die Kachel zeigt die
  gekürzte Dauer

#### Scenario: Video ohne erkennbaren Schnitt
- **WHEN** ein Benutzer eine Videodatei mit einer einzigen durchlaufenden
  Szene importiert
- **THEN** steht in „Meine Videos“ genau eine Kachel mit dem unveränderten
  Dateinamen und der vollen Dauer, wie vor der Einführung der Szenenerkennung

#### Scenario: Zwei Videos in einem Import
- **WHEN** ein Benutzer zwei Videodateien gleichzeitig importiert, die erste
  mit zwei, die zweite mit drei Szenen
- **THEN** stehen in „Meine Videos“ erst die zwei Szenen der ersten Datei,
  dann die drei der zweiten

### Requirement: Verfahren und Grenzen der Erkennung
Die Erkennung MUST FFmpeg als Subprozess mit dem Szenenfilter über die
gespeicherte Datei laufen lassen und aus den Fundstellen Szenengrenzen
ableiten. Sie MUST deterministisch sein: dieselbe Datei mit derselben
Einstellung MUST dieselben Fenster liefern.

Aus den Fundstellen MUST das System Grenzen in zeitlicher Reihenfolge
übernehmen und dabei verwerfen: Fundstellen in der ersten und in der letzten
Sekunde der Datei, sowie jede Fundstelle, die weniger als **1 Sekunde** nach
der zuletzt übernommenen Grenze liegt. Bleiben danach mehr als **49**
Grenzen, MUST das System die 49 mit dem höchsten Szenen-Wert übernehmen und
sie wieder nach Zeit sortieren; ein Gleichstand MUST nach Zeitpunkt
aufgelöst werden. Es MUST daher höchstens **50** Medien je importierter Datei
entstehen. Jede Szene MUST mindestens 1 Sekunde lang sein.

Findet die Erkennung keine übernehmbare Grenze, MUST genau ein Medium mit der
ganzen Datei entstehen. Schlägt die Erkennung fehl, MUST ebenfalls genau ein
Medium mit der ganzen Datei entstehen; die Oberfläche MUST dafür **keine**
Fehlermeldung zeigen, und der Fehler MUST protokolliert werden.

#### Scenario: Sehr unruhiges Material
- **WHEN** ein Benutzer ein Video importiert, in dem der Szenenfilter 400
  Fundstellen meldet, viele davon im Abstand von Bruchteilen einer Sekunde
- **THEN** entstehen höchstens 50 Medien, jedes mindestens 1 s lang

#### Scenario: Fundstelle am Dateianfang
- **WHEN** der Szenenfilter eine Fundstelle 0,4 s nach Dateianfang meldet
- **THEN** entsteht daraus keine Grenze, und die erste Szene beginnt bei 0 s

#### Scenario: Erkennung schlägt fehl
- **WHEN** der FFmpeg-Lauf der Erkennung mit einem Fehler endet
- **THEN** steht in „Meine Videos“ genau eine Kachel mit der ganzen Datei, es
  erscheint keine Fehlermeldung, und der Fehler steht im Protokoll des
  Backends

#### Scenario: Zweimal dasselbe Material
- **WHEN** ein Benutzer dieselbe Datei zweimal mit derselben Einstellung
  importiert
- **THEN** entstehen beide Male gleich viele Medien mit denselben Fenstern

### Requirement: Medium im Zustand „Erkennung läuft“
Die Erkennung MUST als eigener Auftrag nach dem Import laufen und MUST die
Antwort des Uploads NOT verzögern. Jedes Video-Medium MUST einen Zustand
tragen: `detecting`, solange seine Erkennung aussteht oder läuft, sonst
`ready`. Der Upload einer Videodatei MUST sofort mit einem Medium im Zustand
`detecting` antworten.

Die Sammlung „Meine Videos“ MUST für ein solches Medium eine Platzhalter-Kachel
mit Dateinamen, dem Hinweis „Szenen werden erkannt…“ (bzw. der englischen
Fassung) und dem Fortschritt in Prozent zeigen. Die Kachel MUST NOT ziehbar
sein, ein Doppelklick MUST nichts an den Bildstreifen anhängen, und das
Backend MUST ein Projekt ablehnen, das auf ein Medium im Zustand `detecting`
verweist. Ist die Erkennung fertig, MUST das Ergebnis ohne Neuladen der Seite
an die Stelle der Platzhalter-Kachel treten.

Es MUST höchstens ein Erkennungsauftrag gleichzeitig laufen; die übrigen MUST
in Importreihenfolge warten. Ein Medium im Zustand `detecting` MUST löschbar
sein; sein Auftrag entfällt dann. Beim Start des Backends MUST jedes Medium im
Zustand `detecting` zu genau einem Medium mit der ganzen Datei im Zustand
`ready` werden, und Reste unvollständiger Aufträge MUST entfernt werden.

#### Scenario: Platzhalter während der Erkennung
- **WHEN** ein Benutzer eine 10 Minuten lange Videodatei importiert
- **THEN** erscheint in „Meine Videos“ sofort eine Kachel mit dem Dateinamen,
  dem Hinweis „Szenen werden erkannt…“ und einem steigenden Fortschritt, und
  sie lässt sich nicht in den Bildstreifen ziehen

#### Scenario: Ergebnis ohne Neuladen
- **WHEN** die Erkennung zu dieser Datei fertig wird, während der Benutzer die
  Sammlung offen hat
- **THEN** ersetzen die erkannten Szenen die Platzhalter-Kachel an derselben
  Stelle, ohne dass der Benutzer die Seite neu lädt

#### Scenario: Neuladen während der Erkennung
- **WHEN** ein Benutzer die Seite neu lädt, während eine Erkennung läuft
- **THEN** zeigt „Meine Videos“ die Platzhalter-Kachel weiter mit ihrem
  Fortschritt

#### Scenario: Projekt verweist auf ein Medium in der Erkennung
- **WHEN** ein Client ein Projekt speichern will, das auf ein Medium im
  Zustand `detecting` verweist
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab, und
  das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Neustart während der Erkennung
- **WHEN** das Backend neu startet, während eine Erkennung läuft
- **THEN** steht das betroffene Video danach als genau ein benutzbares Medium
  mit der ganzen Datei in „Meine Videos“, und es bleibt kein Auftrag und keine
  Zwischendatei zurück

#### Scenario: Drei Videos auf einmal
- **WHEN** ein Benutzer drei Videodateien gleichzeitig importiert
- **THEN** läuft immer nur eine Erkennung, die beiden anderen warten in
  Importreihenfolge, und alle drei Platzhalter-Kacheln sind sichtbar

### Requirement: Einstellungen zur Szenenerkennung
Der Dialog Extras → „Optionen…“ MUST eine Gruppe „Szenenerkennung“ mit genau
vier Werten anbieten: „Aus“, „Wenige Szenen“, „Mittel“ und „Viele Szenen“, mit
„Mittel“ als Standard. Die Stufen MUST festen Schwellen entsprechen; ein frei
einstellbarer Zahlenwert MUST NOT angeboten werden. Die Beschriftungen MUST in
Deutsch und Englisch vorliegen.

Der gewählte Wert MUST im Client gespeichert werden, ein Neuladen überleben und
mit jedem Upload an das Backend gehen; das Backend MUST keine
Benutzereinstellung vorhalten und MUST ohne das Feld „Mittel“ annehmen. Steht
die Einstellung auf „Aus“, MUST der Import sofort genau ein Medium mit der
ganzen Datei im Zustand `ready` erzeugen, ohne Auftrag und ohne
Platzhalter-Kachel. Eine Änderung der Einstellung MUST schon importierte
Medien NOT verändern.

#### Scenario: Erkennung abschalten
- **WHEN** ein Benutzer in Extras → „Optionen…“ die Szenenerkennung auf „Aus“
  stellt und danach ein Video mit mehreren Szenen importiert
- **THEN** steht in „Meine Videos“ genau eine Kachel mit der ganzen Datei, und
  es erscheint keine Platzhalter-Kachel

#### Scenario: Mehr Szenen
- **WHEN** ein Benutzer die Einstellung von „Mittel“ auf „Viele Szenen“ stellt
  und dieselbe Datei erneut importiert
- **THEN** entstehen mindestens so viele Medien wie beim Import mit „Mittel“

#### Scenario: Einstellung überlebt das Neuladen
- **WHEN** ein Benutzer „Wenige Szenen“ wählt, bestätigt und die Seite neu
  lädt
- **THEN** steht die Gruppe „Szenenerkennung“ im Dialog „Optionen“ weiterhin
  auf „Wenige Szenen“

#### Scenario: Einstellung wirkt nicht rückwirkend
- **WHEN** ein Benutzer nach einem Import mit „Mittel“ die Einstellung auf
  „Viele Szenen“ stellt
- **THEN** bleiben die bereits importierten Medien unverändert in „Meine
  Videos“
