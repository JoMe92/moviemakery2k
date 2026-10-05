## Context

Stand: `develop` nach dem Archivieren der 14 abgeschlossenen Changes
(2026-10-05); die Basis-Specs beschreiben wieder die Anwendung.
`add-canvas-format` ist offen und nicht integriert und ist hier nicht
Grundlage (siehe D10).

Was schon da ist:

- **Videoimport** (`add-video-import`): Der Upload prüft jede Datei anhand
  ihres Inhalts, speichert das Original unverändert und leitet **ein**
  Posterbild ab — ein Frame bei 1 s Laufzeit, bei Dateien unter 2 s bei der
  Hälfte (Spec media-library, „Abgeleitetes Video“). Ein `VideoItem` trägt
  Kennung, `kind: video`, Dateinamen, Dauer, Breite, Höhe, Codec und die URL
  des Posterbilds. Grenzen: 500 MB und 10 Minuten je Datei, 50 Dateien je
  Anfrage.
- **Videoclip-Elemente** verweisen auf eine Medien-Kennung und tragen
  `trimIn`/`trimOut` mit `0 ≤ trimIn < trimOut ≤` Dauer des Mediums (Spec
  slideshow-project). Die angezeigte Stelle ist
  `trimIn + (Wiedergabezeit − Segmentanfang)`, in der Vorschau wie im Export
  (Spec preview-player, „Videoclips in der Wiedergabe“;
  `FrameRenderer._open_video` im Backend).
- **Ein Auftragsmuster** für lange Arbeiten: Export-Jobs mit Status
  (`queued`, `running`, `done`, `failed`, `cancelled`), Fortschritt,
  höchstens einem laufenden Auftrag und einem Aufräumen beim Start des
  Backends (Spec movie-export, „Export-Schnittstelle im Backend“).
- **FFmpeg nur als Subprozess** (ADR 0001). Der Szenenfilter
  (`select='gt(scene,T)'` plus `metadata=print`) ist Teil von FFmpeg und
  braucht keine neue Abhängigkeit.

Was fehlt: jede Form von Szenenerkennung. `apps/web/src/automovie/autoMovie.ts`
hält das als Kommentar fest („no scene detection, no clip selection“).

Vorgabe des Product Owners (2026-10-05, Bead mmy-y9w): Das benutzersichtbare
Modell ist vor allem anderen festzulegen, weil es Schema und
Sammlungs-Oberfläche bestimmt und später teuer zu ändern wäre. Außerdem: Die
Erkennung ist heuristisch, also muss festgelegt sein, was bei null und was
bei sehr vielen Fundstellen passiert, und ein Schwellenwert, den der Benutzer
nicht beeinflussen kann, ist ein Support-Problem.

## Goals / Non-Goals

**Goals:** Ein importiertes Video wird ohne Zutun des Benutzers zu mehreren
Kacheln, vorhersagbar und reproduzierbar; alles, was heute mit einem
Video-Medium geht (Kürzen, Teilen, Löschen, AutoMovie, Export), geht mit jeder
Szene unverändert; die Erkennung blockiert den Import nicht und hinterlässt
bei jedem Abbruch einen benutzbaren Zustand.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Benutzersichtbares Modell: **N Medien**, nicht ein Medium mit Unterclips

Ein Import mit erkannten Szenen erzeugt **N eigenständige Medien** in „Meine
Videos“, eines je Szene. Die Alternative — ein Medium, das eine Liste von
Unterclips trägt — wird verworfen.

Begründung, in der Reihenfolge ihres Gewichts:

1. **Kein zweites Adressierungs-Niveau.** Mit N Medien bleibt eine Referenz
   auf Material genau das, was sie heute ist: eine Medien-Kennung. Das
   Projektmodell, die Validierung („verweist auf ein unbekanntes Medium“), das
   Kürzen (`0 ≤ trimIn < trimOut ≤` Dauer), Teilen, Löschen, AutoMovie, der
   Bildladepfad des Exports und der `_cache_key` des `FrameRenderer` bleiben
   unverändert. Mit Unterclips müsste jede dieser Stellen von `mediaId` auf
   `(mediaId, subClipId)` umgestellt werden, mit einer neuen Schema-Version
   und einer Migration — und es sind genau die Stellen, an denen Vorschau und
   Export sich einig sein müssen.
2. **Die Sammlung bleibt ein flaches Kachelraster.** „Meine Videos“, der
   Sammlungsbereich, die Tastaturbedienung und das Sammlungs-Sheet der Spec
   mobile-ui zeigen weiter gleichartige Kacheln. Unterclips bräuchten eine
   aufklappbare Kachel oder eine zweite Ebene in der Sammlung — die größte
   Oberflächenänderung der ganzen Change, für keinen zusätzlichen Nutzen.
3. **Es ist das, wofür die Change gemacht ist.** Der Zweck ist, dass aus einer
   Datei mehrere Bausteine werden, mit denen AutoMovie arbeiten kann. AutoMovie
   nimmt „alle Bild- und Videoclip-Medien aus der Mediensammlung in
   Importreihenfolge“ — mit N Medien greift das sofort, ohne eine Zeile
   AutoMovie-Code.
4. **Die Metapher des Originals ist näher an N Kacheln.** Das Original legt je
   importierter Datei eine benannte Sammlung mit N Clip-Kacheln an. Benannte
   Sammlungen je Datei sind hier Nicht-Ziel (die Sammlungsauswahl ist eine
   feste Liste), aber „eine Datei wird zu N Kacheln“ ist der Kern davon, und
   genau der bleibt erhalten.

Was N Medien kostet und wie es getragen wird: Der Medien-Index wird länger
(bei 50 Szenen 50 Zeilen statt einer), und mehrere Medien teilen eine
Quelldatei — das regelt D2 und D7.

### D2 – Jedes Medium ist ein **Fenster** auf eine einmal gespeicherte Datei

Das Original wird wie heute genau einmal gespeichert. Jedes Medium einer Szene
trägt zusätzlich `sourceIn` (Sekunden ab Anfang der Quelldatei) und seine
`duration` (Länge des Fensters). `sourceOut` wird nicht eigens geführt; es ist
`sourceIn + duration`. Intern merkt der Medien-Index zu jedem Medium, welche
gespeicherte Quelle es benutzt; nach außen gibt die API nur `sourceIn` und
`duration`, denn das genügt der Oberfläche vollständig.

Die Alternative wäre, die Datei beim Import in N Dateien zu zerschneiden. Sie
wird verworfen:

- **Stream-Copy** kann nur an Keyframes schneiden. Die Szenengrenzen würden
  auf den nächsten Keyframe rutschen (typisch 2–10 s daneben), und zwar
  unsichtbar für den Benutzer, der die Grenze in der Vorschau an anderer
  Stelle sieht als im Export.
- **Neukodieren** ist auf der Zielhardware (Linux aarch64, u. a. Raspberry Pi,
  Spec movie-export „Plattformunterstützung des Exports“) für ein
  zehnminütiges Video nicht vertretbar und würde die Bildqualität vor jeder
  Bearbeitung einmal unnötig verlieren.
- Ein Fenster ist **frame-genau**, kostet keine zusätzlichen Bytes und keine
  zusätzliche Zeit.

Bestehende Video-Medien gelten als Fenster mit `sourceIn: 0` über ihre eigene
Quelle — dieselbe Form der Übernahme, die der Medien-Index schon kennt
(„Bestehende Medien ohne Art MUST als Bilder gelten“).

### D3 – Die Erkennung ist ein nachgelagerter Auftrag; der Upload wartet nicht

Die Erkennung muss die Datei dekodieren. Für ein zehnminütiges Video sind das
auf der Zielhardware Minuten — jenseits jeder vertretbaren Antwortzeit eines
Uploads. Sie läuft deshalb als eigener Auftrag, nach dem Muster der
Export-Jobs.

Ablauf:

1. Der Upload antwortet wie heute sofort, aber für eine Videodatei mit einem
   Medium im Zustand `status: detecting`: Kennung, Dateiname, Dauer, Maße und
   Codec sind schon bekannt, ein Posterbild noch nicht.
2. Die Sammlung „Meine Videos“ zeigt dafür eine **Platzhalter-Kachel** mit dem
   Dateinamen, dem Hinweis „Szenen werden erkannt…“ und dem Fortschritt in
   Prozent. Sie ist nicht ziehbar, der Doppelklick hängt nichts an, und
   AutoMovie überspringt sie. Das Backend lehnt ein Projekt ab, das auf ein
   Medium im Zustand `detecting` verweist.
3. Ist der Auftrag fertig, **tritt das Ergebnis an die Stelle des
   Platzhalters**, ohne Neuladen: N Medien im Zustand `ready` in
   Szenenreihenfolge, an genau der Position der Importreihenfolge, an der der
   Platzhalter stand. Bei null Fundstellen ist das genau ein Medium mit der
   vollen Datei (D5).

Warum der Platzhalter und nicht „das Medium erscheint erst, wenn es fertig
ist“: Nur so übersteht der Import ein Neuladen der Seite — die Medienliste
trägt den Zustand, der Benutzer sieht, dass seine Datei angekommen ist, und es
braucht keinen clientseitig gemerkten Auftrag. Und warum der Platzhalter nicht
schon benutzbar ist: Sonst müsste ein Medium, das der Benutzer bereits in den
Bildstreifen gezogen hat, nachträglich durch N andere ersetzt werden. Es gibt
keine richtige Antwort auf „wird dieses eine Element jetzt zu N Elementen oder
bleibt es?“ — also wird der Zustand vermieden, in dem die Frage entsteht.

Weitere Festlegungen des Auftrags:

- **Höchstens ein Erkennungsauftrag läuft**, die übrigen warten in
  Importreihenfolge (ein Import mit drei Videos erzeugt drei Aufträge). Das
  schützt die Zielhardware und macht die Reihenfolge der entstehenden Medien
  vorhersagbar.
- **Ein Neustart des Backends beendet die Erkennung nicht halb:** Beim Start
  wird jedes Medium im Zustand `detecting` zu genau einem Medium mit der
  vollen Datei und dem Zustand `ready`, und offene Aufträge und
  Zwischendateien werden entfernt — dasselbe Aufräumen, das der Export schon
  tut.
- **Abbrechen braucht es nicht.** Anders als beim Export gibt es kein
  Ergebnis, auf das der Benutzer wartet, und jeder Abbruch führt zum
  benutzbaren Zustand „ein Medium, ganze Datei“. Ein Abbrechen-Knopf wäre
  eine zusätzliche Bedienung ohne Gewinn.

### D4 – Das Verfahren, festgelegt und deterministisch

Für ein Video mit der Dauer `D` und der Schwelle `T` (aus der Einstellung,
D6):

1. FFmpeg läuft einmal über die Datei, mit dem Szenenfilter und ohne
   Ausgabedatei: `-filter:v "select='gt(scene,T)',metadata=print" -an -f null -`.
   Gelesen werden die Paare `pts_time` und `lavfi.scene_score` der
   ausgewählten Frames. Der Fortschritt des Auftrags ergibt sich aus
   `out_time` im Verhältnis zu `D`.
2. Die Fundstellen werden zu **Grenzen** gefiltert, in zeitlicher Reihenfolge:
   - Fundstellen in der ersten und in der letzten Sekunde entfallen (sie
     erzeugten nur eine Splittersszene am Rand).
   - Eine Fundstelle weniger als **1 s** nach der letzten übernommenen Grenze
     entfällt. Das erledigt den Normalfall „sehr viele Fundstellen“
     (Flackern, Blitzlicht, harte Schnittfolgen) und sichert zugleich, dass
     jede Szene lang genug ist, um als Element eine sinnvolle Dauer zu haben.
   - Bleiben danach mehr als **49** Grenzen, werden die 49 mit dem höchsten
     `lavfi.scene_score` übernommen und wieder nach Zeit sortiert. Es
     entstehen damit höchstens **50 Szenen** je Datei — dieselbe Obergrenze,
     die der Upload schon für Dateien je Anfrage hat.
3. Aus den Grenzen `b_1 … b_k` entstehen die Fenster `[0, b_1)`,
   `[b_1, b_2)` … `[b_k, D)`.

Das Verfahren MUSS deterministisch sein: Dieselbe Datei mit derselben
Einstellung liefert dieselben Fenster. Die Sortierung nach `scene_score` wird
dafür bei Gleichstand nach Zeitpunkt aufgelöst. Nur so ist das Verfahren
testbar und ein erneuter Import desselben Materials nachvollziehbar.

### D5 – Null Fundstellen, eine Fundstelle, sehr viele

- **Null oder nur verworfene Fundstellen:** genau **ein** Medium mit der
  ganzen Datei, Zustand `ready`, Anzeigename der unveränderte Dateiname ohne
  Nummer. Das ist exakt das heutige Verhalten; ein Video mit einer einzigen
  durchlaufenden Szene darf nicht anders aussehen als vor dieser Change.
- **Eine Grenze:** zwei Medien, `(1)` und `(2)`.
- **Sehr viele Fundstellen:** von der Mindestlänge 1 s und der Obergrenze von
  50 Szenen aufgefangen (D4). Der Benutzer bekommt nie 400 Kacheln aus einer
  Datei.
- **Der Auftrag schlägt fehl** (FFmpeg fehlt, bricht ab oder liefert
  unlesbare Metadaten): genau **ein** Medium mit der ganzen Datei, Zustand
  `ready`, wie bei null Fundstellen. Es erscheint **kein** Fehlerdialog — der
  Import ist gelungen, nur das Zerlegen nicht, und ein Video in „Meine Videos“
  ist das, was der Benutzer wollte. Der Fehler wird protokolliert.

### D6 – Einstellungen in „Optionen“, gewählt im Client, mitgeschickt beim Upload

Extras → „Optionen…“ bekommt neben der Spracheinstellung die Gruppe
**Szenenerkennung** mit vier Werten: **Aus**, **Wenige Szenen**, **Mittel**
(Standard), **Viele Szenen**. Die Stufen bedeuten feste Schwellen — Wenige
0,5, Mittel 0,3, Viele 0,15 — und nicht eine frei einstellbare Zahl; das
Projekt arbeitet durchgehend mit festen Stufen statt mit Reglern. Die genauen
Werte sind geschätzt und als solche zu dokumentieren: Das Original gibt dazu
nichts her.

Der Wert wird wie die Sprache **im Client** gespeichert und überlebt ein
Neuladen. Das Backend hält keine Benutzereinstellungen; es bekommt die Stufe
stattdessen als Feld der Upload-Anfrage. Begründung: Die Sprache ist schon
heute clientseitig (Spec localization), das Backend bleibt ohne
Benutzerzustand, und die Einstellung gehört ohnehin zum Zeitpunkt des
Imports — eine spätere Änderung soll vergangene Importe nicht rückwirkend
anders erklären. Fehlt das Feld, gilt **Mittel**.

**Aus** erzeugt sofort genau ein Medium mit der ganzen Datei, ohne Auftrag und
ohne Platzhalter — also wortwörtlich das heutige Verhalten, als Rückfallebene
für jeden, dem die Erkennung im Weg ist.

### D7 – Löschen bei geteilter Quelldatei

Löschen bleibt eine Aktion auf einem Medium, mit derselben Rückfrage und
derselben Wirkung wie heute (ein Video kommt in keinem Projektbestandteil
außerhalb des Bildstreifens vor und wird daher immer sofort gelöscht, die
`media.inUseByExport`-Prüfung läuft für Video nicht). Neu ist nur:

- Das Medium verschwindet aus „Meine Videos“ und aus dem Bildstreifen, seine
  Geschwister bleiben unberührt.
- Die **gespeicherte Quelldatei** wird erst entfernt, wenn kein Medium mehr
  auf sie verweist. Das ist eine einfache Zählung über den Medien-Index, keine
  eigene Buchhaltung.
- Ein Medium im Zustand `detecting` lässt sich löschen; der zugehörige Auftrag
  entfällt dann.

### D8 – Der Render-Pfad: ein zusätzlicher Summand, auf beiden Seiten derselbe

Die angezeigte Stelle eines Videoclip-Elements wird von
`trimIn + (Zeit − Segmentanfang)` zu
`sourceIn + trimIn + (Zeit − Segmentanfang)`.

Das ist der einzige Eingriff in den Render-Pfad, und er fällt an genau zwei
Stellen an: in der Vorschau beim Suchen im `<video>`-Element und im Backend in
`FrameRenderer._open_video`, das den FFmpeg-Dekodierlauf an dieser Stelle
startet. `trimIn`/`trimOut` bleiben relativ zum **Medium** definiert
(`0 ≤ trimIn < trimOut ≤` Dauer des Mediums), also ändert sich an der
Validierung, am Kürzen-Dialog und am Teilen nichts. Für `sourceIn: 0` — jedes
heute vorhandene Medium — ist die Formel wortgleich die alte.

Weil beide Seiten denselben Summanden auf dieselbe Weise anwenden, bleibt die
Gleichheit von Vorschau und Export (Spec movie-export, „Export entspricht der
Vorschau“) erhalten; sie wird mit einem Golden Frame aus einem Medium mit
`sourceIn > 0` nachgewiesen, zusätzlich zum bestehenden
`e2e/test_video_golden_frame.py`.

Das Posterbild eines Mediums entsteht nach derselben Regel wie heute, nur
relativ zum Fenster: ein Frame bei `sourceIn + 1 s`, oder bei
`sourceIn + duration / 2`, wenn das Fenster kürzer als 2 s ist. Damit zeigt
jede Kachel ein Bild aus ihrer eigenen Szene.

### D9 – Anzeigename und Importreihenfolge

Der Anzeigename eines Mediums aus einem zerlegten Import ist der Dateiname mit
der Nummer vor der Endung: `Urlaub (1).mp4`, `Urlaub (2).mp4`, …, in
Szenenreihenfolge ab 1. Bei genau einem Medium bleibt der Dateiname unverändert
ohne Nummer (D5). Das Feld ist ausdrücklich ein Anzeigename („for display
only“) und muss keiner Datei auf der Platte entsprechen; die Nummer in Klammern
ist in beiden Sprachen gleich und braucht keinen Katalogeintrag.

Die N Medien stehen in der Importreihenfolge zusammenhängend an der Stelle, an
der der Platzhalter stand. Ein Import aus zwei Videos liefert also erst alle
Szenen des ersten, dann alle des zweiten — unabhängig davon, welcher Auftrag
zuerst fertig wird, weil die Aufträge in Importreihenfolge laufen (D3).

### D10 – Verhältnis zu den anderen offenen Changes

- **Keine neue Schema-Version des Projekts.** Diese Change ändert nur den
  Medien-Index und die Medien-API, nicht das Projektmodell. Sie hat damit
  keine Berührung mit `add-canvas-format`s Schema-Version 7 und keine
  Reihenfolge-Abhängigkeit dazu.
- **Keine gemeinsam geänderte Anforderung.** Diese Change ändert
  `media-library`, `preview-player` („Videoclips in der Wiedergabe“),
  `app-shell` („Menüs mit funktionalem Kern“) und `automovie`.
  `add-canvas-format` ändert `preview-player` „Darstellung im Monitor“ und
  `app-shell` „Aufgabenbereich mit drei Schritten“ — jeweils andere
  Anforderungen. Die beiden Changes lassen sich in beliebiger Reihenfolge
  umsetzen und archivieren; wer zuletzt archiviert, stellt nur sicher, dass
  sein `MODIFIED`-Block den dann geltenden Text der eigenen Anforderung
  wiedergibt.
- **Unabhängig von `add-time-ramp-effects`**, der zweiten Change dieser
  Tranche: Diese hier rührt keinen Shader an, jene keinen Medien-Index. Sie
  können parallel laufen.
