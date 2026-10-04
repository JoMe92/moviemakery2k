## Context

Heute ist 4:3 an vier Stellen fest verdrahtet: `FRAME_ASPECT = 4 / 3` und
`bufferSize()` in `apps/web/src/render/geometry.ts`, die Einpassung in
`Renderer.letterbox()` (`apps/web/src/render/Renderer.ts`), ihr 1:1-Gegenstück
`letterbox()`/`contain_rect` in `backend/src/mmy_backend/render/frames.py` bzw.
`render/geometry.py`, und die drei Profilmaße in
`backend/src/mmy_backend/render/encode.py`. Dazu kommen zwei
CSS-Seitenverhältnisse (`apps/web/src/shell/MonitorPane.module.css`,
`apps/web/src/shell/CompactWindow.module.css`) und zwei Zeilen im
Shader-Vertrag (`packages/shaders/README.md`: „already letterboxed to 4:3“;
`packages/shaders/prelude.glsl`: `resolution` als „frame space, 4:3“).

Vorgaben des Product Owners (2026-10-04, Bead mmy-ua7): Format wählbar,
Querformat **und** Hochformat, für Bilder **und** Videoclips, erste Fassung
nur 16:9 bzw. 9:16; Hintergrundfarbe nur weiß und schwarz; andere
Seitenverhältnisse, beliebige Farben, abgeleitete Hintergründe und
Überschreiben je Element ausdrücklich draußen.

Diese Change ist die **zehnte** geplante Change und die erste gewollte
Abweichung von der Movie-Maker-2.x-Parität. Architektur-Beratung 2026-10-04
(Fragen: gemeinsame Canvas-Definition, Übergangsgeometrie und mmy-5ul,
Export-Profile) — ihre Empfehlungen stehen in D1, D2, D5 und D6.

## Goals / Non-Goals

**Goals:** Ein Projekt hat ein wählbares Format und einen wählbaren
Hintergrund; Vorschau und Export zeigen dasselbe; Hochformat ist nicht nur
darstellbar, sondern mit Übergängen auch benutzbar; die Canvas-Geometrie liegt
an einer Stelle je Sprache, nicht verstreut über Renderer, CSS und Profile.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Canvas ist Projektzustand, kein Katalog-Artefakt
Das Projekt bekommt ein verschachteltes Feld:

```json
"canvas": { "format": "16:9", "background": "black" }
```

Als Pydantic-`Literal` in `backend/src/mmy_backend/project.py`
(`format: Literal["16:9", "9:16"]`, `background: Literal["black", "white"]`),
also über `pixi run gen-api` automatisch in `apps/web/src/generated/schema.d.ts`
— derselbe Weg, den `ExportProfile` schon geht. Serverseitige Validierung und
der Migrationshaken (`project.py`) sind damit vorhanden.

**Kein Eintrag in `packages/catalog`.** Der Katalog ist im Projekt für
offene, autorenseitig gepflegte Daten reserviert (Übergänge, Effekte, Titel
— Parameter, die zu Shader-Uniforms werden). Eine geschlossene Aufzählung von
zwei Formaten und zwei Farben bringt dort nur Schema, Loader, Validator und
Endpunkt, aber keine zusätzliche Garantie: Was zwischen Vorschau und Export
wirklich auseinanderlaufen kann, ist die Rundung in
`containRect`/`contain_rect` und das Resampling (Canvas2D gegen PIL) — beides
nicht als JSON ausdrückbar und beides schon durch Testwerte und
Golden-Frames gesichert (D2). Außerdem braucht CSS das Seitenverhältnis
statisch (siehe D7), also ohnehin nicht über einen Katalog-Abruf.

Verworfen: zwei flache Felder `canvasFormat`/`canvasBackground`. Das
verschachtelte Feld hält die beiden zusammen, die immer gemeinsam gelesen
werden, und liest sich im gespeicherten Projekt besser. Verworfen auch die
Werte `"landscape"`/`"portrait"`: sie sind nicht eindeutig, sobald je ein
zweites Hochformat dazukommt (etwa 4:5). `"16:9"`/`"9:16"` nennt das
Seitenverhältnis selbst, ist die Sprache des Product Owners und erweitert sich
ohne Umdeutung.

### D2 – Geometrie: das bestehende Funktionspaar wird verallgemeinert
`geometry.ts` verliert die Konstante `FRAME_ASPECT` und bekommt
`canvasAspect(format)`; `bufferSize()` richtet sich nach dem Format
(`unit*16 × unit*9`, im Hochformat transponiert) statt nach `unit*4 × unit*3`.
`backend/src/mmy_backend/render/geometry.py` bleibt die 1:1-Spiegelung — die
Konvention, die diese Datei selbst in ihrem Kopfkommentar festschreibt.
Die Tabelle gespiegelter Testwerte (`apps/web/src/render/geometry.test.ts` und
`backend/tests/test_render_frames.py`) wird um Fälle je Canvas-Format
erweitert, darunter immer ein Inhalt mit nicht passendem Seitenverhältnis.

Durchgesetzt wird die Gleichheit weiterhin von den Golden-Frame-Suiten
(`e2e/test_export_golden.py`, `e2e/test_export_golden_pattern.py`). Sie laufen
heute ausschließlich mit Inhalten, die den Rahmen füllen — genau deshalb ist
der Defekt mmy-5ul nie aufgefallen. Sie bekommen je Canvas-Format mindestens
einen Fall mit nicht passendem Seitenverhältnis.

### D3 – Schema-Version 7, und wie sie sich einordnet
`origin/develop` steht auf `schema_version: Literal[2]`. Belegt sind
darüber: **3** von `add-timeline-editing` (PR #28), **4** von
`add-effects-catalog`, **5** von `add-titles-and-credits`, **6** von
`add-narration-and-audio-levels`. Diese Change ist die zehnte und nimmt
deshalb **7**; der Text in `specs/slideshow-project/spec.md` baut auf dem
Version-6-Text von `add-narration-and-audio-levels` auf.

Daraus folgt eine Reihenfolge: Diese Change wird **nach**
`add-narration-and-audio-levels` umgesetzt. Entscheidet der Product Owner, sie
vorzuziehen, senkt eine Planungssitzung die Nummer auf die dann nächste freie
— die Migrationsregel selbst hängt nicht an der Nummer, denn sie lautet „ein
gespeichertes Projekt ohne Canvas-Angabe bekommt Querformat 16:9 mit schwarzem
Hintergrund“. Der Hintergrund dieser Vorsicht ist die offene Discovery zu
Bead mmy-d8k: dort war eine Change auf eine Schema-Version aufgesetzt, die in
`develop` noch nicht existierte, und die Umsetzung blockierte.

### D4 – 4:3 verschwindet als Format; Migration auf Querformat 16:9
Weil die erste Fassung nur 16:9 und 9:16 kennt (PO), ist 4:3 kein wählbares
Format mehr, und der Standard eines neuen Projekts ist Querformat 16:9.
Bestehende Projekte werden auf Querformat 16:9 migriert; ihr Material bleibt
vollständig sichtbar („contain“, nichts wird beschnitten), aber die freien
Flächen ändern ihre Größe — ein 4:3-Foto hat künftig schmale Balken links und
rechts statt keiner. Das ist eine sichtbare Folge und ausdrücklich gewollt:
Der Product Owner hat 16:9 als das Format genannt. Kein Datenverlust, kein
Eingriff in den Bildstreifen.

### D5 – Inhaltsrechteck als Uniform, und das Verhältnis zu mmy-5ul
Heute ist die Füllfarbe **vor** dem Shader in die Textur gebacken
(`Renderer.letterbox()` bzw. `frames.letterbox()` malen auf eine Fläche in
Ausgabegröße, die dann als Textur hochgeladen wird), und der Shader bekommt
`vUv` über die ganze Fläche. Der Shader ist also strukturell blind dafür, wo
das Bild liegt — das ist die Ursache von mmy-5ul und nicht ein Rechenfehler in
`prelude.glsl`.

Gewählt: **Inhaltsrechteck als Uniform.** Der Renderer, der das Rechteck
ohnehin schon berechnet, übergibt es zusätzlich (normalisierte
Canvas-Koordinaten, dazu seine Pixelgröße für die in Pixeln angegebenen
Parameter). `prelude.glsl` leitet daraus eine Inhalts-UV ab und begrenzt sie
auf das Rechteck (`clamp`); die Formfunktionen rechnen darin, während
`getFromColor`/`getToColor` weiter die rohe UV abtasten — das Bild wandert
also nicht. Das `clamp` ist tragend, nicht kosmetisch: ohne es liefert
`barWipeT` außerhalb des Rechtecks Werte über 1, und `wipeReveal` gäbe dort
selbst bei Fortschritt 1 noch 0 zurück — der harte Randwert-Vertrag wäre
verletzt.

Dass die rohe UV weiter abgetastet werden darf, hängt direkt daran, dass die
Hintergrundfarbe **projektweit** ist (PO: kein Überschreiben je Element): In
der Hintergrundfläche sind Ausgangs- und Zielbild identisch, also ist jede
Mischung dort unsichtbar. Diese Begründung fällt, sobald ein Hintergrund aus
dem Material abgeleitet wird — ein weiterer Grund, „blurred background“ als
Nicht-Ziel festzuhalten.

Verworfen: die Texturen vorab so einpassen, dass der Inhalt die Textur füllt,
und den Shader über `viewport`/`scissor` in das Rechteck rendern (keine
Shader-Änderung nötig). Das scheitert am entscheidenden Fall **zwei
verschiedene Inhaltsrechtecke** (Querformat-Foto nach Hochkant-Foto auf
demselben Canvas): ein Viewport, zwei verschieden geformte Texturen. Der
Ausweg wäre, beide Seiten auf ein gemeinsames Rechteck zu füllen — also
dasselbe Rechteck wie beim Uniform-Weg, nur in die Textur gebacken, womit die
Texturgröße vom Bildpaar abhängt und die Textur-Caches (`frames.py` nach
Medien-ID, `Renderer.ensureLetterboxed` nach Canvas-Größe) bei jedem Übergang
neu hochladen müssten — bei Videoclips pro Frame.

Bei zwei verschiedenen Inhaltsrechtecken gilt deshalb: **das kleinste
Rechteck, das beide enthält.** Im Normalfall (gleiche Ausrichtung, oder eine
Seite füllt das Canvas) ist das genau das eine Rechteck; im Mischfall bleibt
es eine echte Teilmenge des Canvas und damit besser als heute.

**Verhältnis zu Bead mmy-5ul (P1, offen).** Diese Change schreibt den Vertrag
fest (Spec canvas „Inhalt in das Canvas einpassen“, Spec transitions
„Gemeinsames Verhalten aller Übergänge“) und enthält mit TASK-FX-011 die
Umsetzung in `prelude.glsl`. Beide Reihenfolgen funktionieren, und das ist
Absicht: Das Inhaltsrechteck existiert heute schon, es ist nur immer
`containRect(Medium, 4:3-Canvas)`. mmy-5ul kann also **vorher** gegen das
heutige 4:3-Canvas behoben werden, gegen genau diesen Vertrag; diese Change
ändert dann nur noch, *was* das Rechteck ist, nie, *wie* die Shader es
verwenden. Landet mmy-5ul zuerst, schrumpft TASK-FX-011 auf das
Verallgemeinern auf das gewählte Canvas. Ein P1 wartet damit nicht auf diese
Change. Bead mmy-5ul bleibt unangetastet; ob er als von TASK-FX-011
abgedeckt geschlossen wird, entscheidet der Orchestrator bzw. der Product
Owner.

Mitbetroffen und im gleichen Zug richtig: `circle.glsl` rechnet
`resolution`-basiert selbst und ist heute im selben Sinn defekt (auf einem
9:16-Canvas müsste ein Kreis aus der Mitte die Canvas-Ecken erreichen, womit
ein Querformat-Foto längst vor Fortschritt 1 vollständig bedeckt ist).
`checkerboard.glsl` (12×10) legt sein Raster künftig über das Bild statt über
die Fläche; die Folge ist, dass die Felder nur bei passendem
Seitenverhältnis quadratisch sind — eine dokumentierte kosmetische Folge, kein
Hindernis.

### D6 – Export-Profile über die längere Kante
Jedes Profil legt die **längere Kante** fest: 960 / 640 / 320 px, 30 fps.
Daraus: Querformat 960×540, 640×360, 320×180; Hochformat 540×960, 360×640,
180×320. Alle sechs Maße sind exakt das nominelle Seitenverhältnis, alle
zwölf Kantenlängen gerade (H.264 `yuv420p` braucht keine Korrektur), und die
beiden Formate sind exakte Transponierte. Die Fläche sinkt gegenüber heute um
etwa ein Viertel bei gleicher langer Kante, also bleiben die Bitraten in
`apps/web/src/export/exportFormat.ts` konservative Obergrenzen.

`ProfileSpec` in `render/encode.py` wird von festem `(width, height)` auf
eine lange Kante plus eine Ableitung je Canvas-Format umgestellt. Der
API-Vertrag behält seine Form: `ExportProfile` bleibt die Aufzählung mit drei
Werten, die Pixelgröße wird serverseitig aus Profil und Canvas-Format
bestimmt (das Projekt ist dort ohnehin geladen). Die Beschreibung in
`backend/src/mmy_backend/exports.py` ist über OpenAPI sichtbar und wird
mitgeändert (`gen-api`).

Die Pixelgröße verlässt den **Namen** des Profils: „Hohe Qualität (960×720)“
wird „Hohe Qualität“, und die Größe erscheint als abgeleitete Angabe neben der
geschätzten Dateigröße und dem Empfehlungstext. Ein in die Übersetzung
eingebackenes Maß funktioniert nicht mehr, sobald es von Projektzustand
abhängt; die drei Namen in `de`/`en` bleiben sonst unverändert.

Verworfen: gleiche Fläche wie heute (16:9 landet auf 1088×612 — exakt, aber
unkenntliche Zahlen und mehr Rechenaufwand als „Hohe Qualität“ heute hat) und
gleiche kurze Kante (480 ergibt 853,33 px Breite, also kein exaktes 16:9).
Daraus die Regel in der Spec: **Ausgabemaße sind genau das Seitenverhältnis
des Canvas, nie eine Näherung** — sonst rechnen Vorschaupuffer und Export auf
verschiedenen Seitenverhältnissen, und die Golden-Frame-Toleranz müsste
gelockert werden.

### D7 – Layout und CSS
`MonitorPane.module.css` und `CompactWindow.module.css` tragen das
Seitenverhältnis heute als Literal. Sie bekommen es als CSS-Custom-Property
aus dem gewählten Format; die Größenbudgets je Layout-Modus bleiben
unverändert. Im kompakten Layout gilt die Höhenbegrenzung des Monitors weiter
(`add-mobile-layout`: höchstens 45 % der Fensterhöhe) — im Hochformat wird
der Monitor dafür schmaler, statt die Begrenzung zu überschreiten. Das steht
als Requirement „Canvas in jedem Layout-Modus“ in der neuen Spec `canvas`.

Nicht als Delta formuliert: Die Spec `mobile-ui` aus `add-mobile-layout`
schreibt „Vorschaumonitor (4:3, höchstens 45 % der Fensterhöhe)“. Eine
Delta-Datei dagegen ist jetzt nicht möglich, weil `mobile-ui` noch nicht in
`openspec/specs/` liegt (die Change ist nicht archiviert). TASK-WEB-073
ändert diese Formulierung auf „im Seitenverhältnis des Canvas“ mit; eine
Planungssitzung kann sie nachziehen, sobald `mobile-ui` eine lebende Spec ist.

### D8 – Ort der Bedienung
Der Aufgabenbereich, Gruppe „2. Film bearbeiten“, bekommt den Eintrag
„Filmformat festlegen…“; er öffnet einen modalen Y2K-Dialog „Filmformat“ mit
zwei Auswahlgruppen (Format, Hintergrund), „OK“ und „Abbrechen“.

Warum dort: Der Aufgabenbereich ist die Grundidiom der Oberfläche, er ist per
Tastatur erreichbar, und `add-mobile-layout` spiegelt jede Gruppe des
Aufgabenbereichs ohne Zutun in ein Taskleisten-Sheet — der Eintrag ist damit
am Handy automatisch vorhanden, ohne eine zweite Platzierung zu spezifizieren.
Das Original hat keinen solchen Eintrag; die Rechtfertigung ist, dass diese
Change die erste gewollte Abweichung von der Parität ist und der
Aufgabenbereich die Stelle ist, an der das Original seine Film-Schritte
anbietet.

Verworfen: **Extras → „Optionen…“** — dieser Dialog hält
Anwendungseinstellungen (Sprache), das Canvas ist Projektzustand; beides zu
mischen würde „Optionen“ zu zwei Dingen machen. Verworfen: **nur ein
Menüeintrag** unter Extras — kein Spiegel am Handy. Verworfen: **ein
Auswahlfeld direkt am Monitor** — näher am Effekt, aber kein Y2K-Idiom, und
im kompakten Layout fehlt dafür der Platz.

### D9 – Shader-Vertrag in der Doku
`packages/shaders/README.md` („Source and target picture … already
letterboxed to 4:3“) und der Kommentar zu `resolution` in `prelude.glsl`
(„frame space, 4:3“) sind nach dieser Change falsch. Sie werden mitgeändert
und benennen das Inhaltsrechteck und die zusätzlichen Uniforms; das ist der
Vertrag, den eine spätere Shader-Sitzung liest.

### D10 – Tests
- pytest: Projektmodell (gültige und ungültige Canvas-Werte, Migration von
  Version 6 und von Version 1), Profilmaße je Format, Einpassung
  (`contain_rect`/`letterbox`) mit der erweiterten Testwert-Tabelle.
- Vitest: `geometry.ts` gegen dieselbe Tabelle, Dialog „Filmformat“ (Vorbelegung,
  OK, Abbrechen, de/en, Tastatur), Monitor-Seitenverhältnis je Format,
  Assistent „Qualität“ mit Pixelgröße je Format.
- `pixi run check-shaders` und Randwert-Golden-Frames je Übergang mit
  Inhalt, dessen Seitenverhältnis nicht dem Canvas entspricht.
- Playwright: Format und Hintergrund umstellen, Seite neu laden, Export in
  beiden Formaten (ffprobe prüft die Maße); Golden-Frame-Vergleich Vorschau
  gegen Export je Format.

## Risks / Trade-offs

- **Bestehende Projekte sehen anders aus** (D4): 4:3 wird 16:9. Gewollt,
  aber die erste Fassung bietet keinen Weg zurück zu 4:3. Minderung: Der
  Inhalt bleibt vollständig sichtbar, es wird nichts beschnitten.
- **Kette der Schema-Versionen** (D3): Diese Change hängt hinter vier noch
  nicht gelandeten Changes. Minderung: Die Migrationsregel ist von der Nummer
  unabhängig; eine Planungssitzung kann die Nummer senken.
- **Breite Berührungsfläche:** Projektmodell, zwei Renderer, Shader-Prelude,
  Export-Profile, CSS, Dialog. Minderung: Die Geometrie bleibt ein
  Funktionspaar mit gespiegelten Testwerten (D2), und die Shader-Änderung
  sitzt in `prelude.glsl` statt in den einzelnen Übergangsdateien (D5).
- **Übergänge sehen anders aus als heute** — auch im Querformat, weil
  `GradientSize` und `BorderSoftness` sich künftig auf das Bild beziehen
  (D5). Das ist die beabsichtigte Behebung von mmy-5ul, aber bestehende
  Golden-Frames mit nicht füllendem Inhalt ändern sich und müssen neu
  abgenommen werden.
- **Konflikte mit Geschwister-Changes:** Das Delta zu `app-shell`
  („Aufgabenbereich mit drei Schritten“) ist als Vereinigung der Einträge
  aller bereits geplanten Changes geschrieben (Video importieren,
  Videoeffekte, Titel, Als App installieren) und das Delta zu
  `movie-export` („Qualitätsprofile“) auf dem Drei-Profil-Text von
  `extend-export-profiles` plus dem Ton-Text von
  `add-narration-and-audio-levels`. Fällt eine dieser Changes weg oder ändert
  ihren Text, muss die umsetzende Sitzung den Requirement-Text abgleichen.
  `extend-export-profiles` ist umgesetzt, aber **noch nicht archiviert** —
  `openspec/specs/movie-export/spec.md` nennt dort noch zwei Profile; sie
  sollte vor oder mit dieser Change archiviert werden.

## Migration Plan

Datenmigration: beim Laden eines Projekts ohne Canvas-Angabe wird Querformat
16:9 mit schwarzem Hintergrund ergänzt und bei der nächsten Änderung als
Schema-Version 7 gespeichert — derselbe Mechanismus, mit dem `project.py`
heute die leere Musikspur ergänzt. Kein Eingriff in Medien oder
Bildstreifen, keine Änderung an gespeicherten Exporten.

Rückfall: Das Canvas-Feld ist ein Default-Fill; ein Projekt der Version 7
unterscheidet sich von einem der Version 6 nur durch dieses Feld. Eine
Rücknahme der Change müsste es ignorieren.

## Open Questions

Keine. Die Reihenfolge gegenüber `add-narration-and-audio-levels` (D3) und
gegenüber Bead mmy-5ul (D5) ist ausdrücklich beschrieben und in beiden
Richtungen tragfähig; die Standardwerte (Querformat 16:9, schwarz) folgen dem
heutigen Verhalten und sind im PR änderbar.
