## Why

`docs/research/movie-maker-reference.md` §2a hält als verifiziertes Verhalten
des Originals fest: „videos are automatically split into clips by scene on
import“. Ein importiertes Video wird dort zu **mehreren Kacheln**, und genau
das ist im Original der Moment, in dem aus einer Datei eine Sammlung wird.

Heute fehlt das vollständig: `backend/src/mmy_backend/media.py` leitet aus
einem Video genau ein Posterbild ab, und `apps/web/src/automovie/autoMovie.ts`
hält in einem Kommentar ausdrücklich „no scene detection, no clip selection“
fest. Ein zehnminütiges Video ist eine Kachel. Damit ist die
Sammlungs-Metapher schwach, das Kürzen fällt dem Benutzer allein zu, und
AutoMovie hat aus einem Videoimport genau ein Element zu verarbeiten.

Die Lücke ist zugleich die billigste der verbliebenen: Die Erkennung ist
reine Backend-Arbeit (FFmpeg-Szenenfilter, danach je Szene ein Posterbild und
eine Zeile im Medien-Index). Es braucht keinen Renderer-Eingriff, keinen neuen
Shader und keine neue Schema-Version des Projekts.

Die eine Entscheidung, die vor allem anderen fallen muss, ist das
**benutzersichtbare Modell**: Entsteht aus einem Import ein Medium mit
Unterclips oder entstehen N Medien? Diese Wahl bestimmt das Schema und die
Sammlungs-Oberfläche und ist die einzige, die später teuer zu ändern wäre.
Sie ist in design.md D1 entschieden und begründet: **N Medien**.

## What Changes

- **Ein Videoimport liefert N Medien statt einem.** Jede erkannte Szene wird
  eine eigene Kachel in „Meine Videos“, mit eigenem Posterbild, eigener Dauer
  und dem Anzeigenamen `<Name> (n)<Endung>`, in Szenenreihenfolge an der
  Stelle der Importreihenfolge, an der die Datei importiert wurde.
- **Kein zweites Adressierungs-Niveau.** Die Datei wird einmal gespeichert;
  jedes Medium ist ein **Fenster** darauf (`sourceIn` plus seine `duration`).
  Das Projektmodell verweist weiterhin nur auf eine Medien-Kennung, mit
  `trimIn`/`trimOut` innerhalb der Dauer dieses Mediums — unverändert.
- **Neue Capability `scene-detection`:** der Erkennungsauftrag, seine
  Garantien (deterministisch, Mindestlänge einer Szene, Obergrenze an Szenen,
  Verhalten bei null Fundstellen) und die Einstellungen dazu.
- **Die Erkennung ist ein nachgelagerter Auftrag, nicht Teil der
  Upload-Antwort.** Der Upload antwortet sofort mit einem Medium im Zustand
  `detecting`; die Sammlung zeigt dafür eine Platzhalter-Kachel mit
  Fortschritt, die noch nicht benutzbar ist. Ist die Erkennung fertig, tritt
  an ihre Stelle ohne Neuladen das Ergebnis — N Medien, oder bei null
  Fundstellen genau eines mit der vollen Datei.
- **Einstellungen in Extras → „Optionen…“:** eine Gruppe „Szenenerkennung“
  mit Aus, Wenige, Mittel (Standard), Viele. Der gewählte Wert geht mit dem
  Upload an das Backend; „Aus“ erzeugt sofort genau ein Medium wie bisher.
- **Die Position in einem Videoclip** ergibt sich in Vorschau und Export aus
  `sourceIn + trimIn + (Zeit − Segmentanfang)` statt aus
  `trimIn + (Zeit − Segmentanfang)`. Das ist der einzige Eingriff in den
  Render-Pfad, auf beiden Seiten derselbe zusätzliche Summand.

## Capabilities

### New Capabilities

- `scene-detection`: Erkennungsauftrag beim Videoimport, das Zerlegen einer
  Datei in N Medien als Fenster auf eine gespeicherte Quelle, die Garantien
  des Verfahrens und die Einstellungen in „Optionen“

### Modified Capabilities

- `media-library`: Ein Videoimport liefert N Medien; ein Video-Medium trägt
  `sourceIn` und `status`; das Posterbild wird je Fenster abgeleitet; die
  gespeicherte Quelldatei verschwindet erst mit dem letzten Medium, das sie
  benutzt
- `preview-player`: Die angezeigte Stelle eines Videoclips rechnet `sourceIn`
  mit
- `app-shell`: Extras → „Optionen…“ enthält zusätzlich die Gruppe
  „Szenenerkennung“
- `automovie`: Medien, deren Erkennung noch läuft, werden beim automatischen
  Zusammenbau übersprungen

## Nicht-Ziele

- **Ein Medium mit Unterclips** und damit ein zweites Adressierungs-Niveau im
  Projektmodell (`mediaId` plus `subClipId`). Verworfen in design.md D1.
- **Sammlungen je importierter Datei** („Collections“ wie im Original, mit
  einer benannten Sammlung pro Video). Die Sammlungsauswahl bleibt die feste
  Liste aus Spec app-shell; alle Szenen stehen in „Meine Videos“.
- **Die Datei beim Import zerschneiden.** Es entstehen keine N Dateien auf der
  Platte, weder per Stream-Copy noch per Neukodierung. Begründung in
  design.md D2.
- **Szenengrenzen nachträglich bearbeiten** (verschieben, Szenen
  zusammenfassen, erneut erkennen lassen). Wer eine andere Grenze will,
  benutzt Kürzen und Teilen im Bildstreifen wie bisher.
- **Erkennung für Bilder oder Audio**, Stilleerkennung in Tonspuren,
  Gesichts- oder Objekterkennung.
- **Ein frei einstellbarer Schwellenwert** als Zahl. Die Einstellung hat vier
  benannte Stufen; das Projekt arbeitet durchgehend mit festen
  Katalog-/Stufenwerten statt mit Reglern.
- **Ein eigener Erkennungsauftrag für schon importierte Videos.** Die
  Erkennung läuft nur beim Import; bestehende Medien bleiben, wie sie sind.
- **Richtungsübergänge über die Letterbox-Balken** (Bead mmy-5ul). Das ist
  bereits durch `add-canvas-format`s TASK-FX-011 abgedeckt und wird hier nicht
  erneut geplant.
