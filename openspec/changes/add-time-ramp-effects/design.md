## Context

Stand: `develop` nach dem Archivieren der 14 abgeschlossenen Changes
(2026-10-05). Die Basis-Specs beschreiben damit wieder die Anwendung, und
`openspec/specs/video-effects/spec.md` ist der Ausgangspunkt dieser Change.
Die Change `add-canvas-format` ist offen und nicht integriert; sie ist hier
nicht Grundlage (siehe D10).

Was schon da ist und benutzt wird:

- **Effekt-Durchgang mit einer Eingabetextur**, in Vorschau und Export
  identisch: `Renderer.resolveEffect` (`apps/web/src/render/Renderer.ts`)
  rendert `effect-prelude.glsl` + `effects/<id>.glsl` +
  `effect-epilogue.glsl` in eine Zwischentextur, bevor das Ergebnis in den
  Still-/Übergangs-Durchgang geht; `FrameRenderer`
  (`backend/src/mmy_backend/render/frames.py`) spiegelt das mit zwei eigenen
  `ctx.framebuffer`-Instanzen und denselben GLSL-Dateien
  (`add-effects-catalog`, design.md D2).
- **Das Zeitmodell liegt doppelt vor und kann nicht auseinanderlaufen.**
  `apps/web/src/timeline/timeline.ts` und
  `backend/src/mmy_backend/render/timeline.py` berechnen beide aus der
  Elementliste die `PlacedSlide`-Werte `start`, `end` und `transitionIn`
  (effektive Dauer des eingehenden Übergangs) und werden beide gegen
  `packages/fixtures/timeline-vectors.json` geprüft. Dasselbe Verfahren
  schützt die Musikplanung (`music-vectors.json`).
- **Der Export rastert die Zeit, die Vorschau nicht.** Der Docstring von
  `render/timeline.py` legt fest: „For the export, frame n lies at
  `t = n / fps`; the number of frames is `ceil(total duration · fps)`“. Die
  Vorschau zeichnet dagegen zu den Zeitpunkten, die ihr die
  Bildwiederholrate des Browsers bzw. die Audiouhr liefert (Spec
  preview-player, „Musik in der Wiedergabe“).
- **Ein Test-Haken für exakte Shader-Zustände** existiert für Übergänge:
  `?debug-progress=<id>:<p>` (`apps/web/src/render/debugProgress.ts`) zeigt
  nur ein 640×480-Canvas mit genau diesem Fortschritt. Darauf stehen die
  Golden-Frame-Vergleiche in `e2e/test_export_golden.py` und
  `e2e/test_export_golden_pattern.py`.

Was fehlt: Effekt-Shader haben kein Zeit-Uniform. `effect-prelude.glsl`
stellt nur `uImage` und `resolution` bereit, und `EffectSpec` in der Vorschau
ist `{ id, params }` — ein Katalogeintrag mit festen Werten, ohne jeden Bezug
zum aktuellen Zeitpunkt.

Vorgabe des Product Owners (2026-10-05, Bead mmy-y9w): Vorschau und Export
müssen sich innerhalb der in `movie-export` genannten Toleranz einig sein,
und **wie das Backend die Rampe für ein gegebenes Frame ableitet, muss hier
stehen** und nicht dem Implementierer überlassen bleiben.

## Goals / Non-Goals

**Goals:** Sieben zeitabhängige Effekte des Originals als normale
Katalogeinträge, getragen von einem einzigen neuen Uniform; eine Definition
des Rampenwerts, aus der Vorschau und Export beweisbar denselben Wert
ableiten; ein Golden-Frame-Vergleich, der diesen Beweis für einen Zeitwert
tatsächlich führen kann.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Ein Uniform in der Prelude, für jedes Effekt-Programm

`packages/shaders/effect-prelude.glsl` bekommt neben `resolution` ein
weiteres Uniform:

```glsl
// Progress of the element over its own placed span: 0.0 at its start,
// 1.0 at its end. Constant for a given (element, time).
uniform float elementProgress;
```

Es steht damit **jedem** Effekt-Programm zur Verfügung, nicht nur den sieben
neuen, und beide Render-Seiten setzen es bei **jedem** Effekt-Durchgang.

Begründung: Die Alternative wäre ein Katalog-Merkmal „dieser Effekt ist
zeitabhängig“ plus zwei Programmvarianten. Das kauft nichts — ein nicht
benutztes Uniform kostet in GLSL nichts, der Programm-Cache bleibt wie er
ist, und `pixi run check-shaders` prüft Parameter gegen den Katalog, nicht
Prelude-Uniforms (`resolution` ist der Präzedenzfall). Die 21 bestehenden
Effekte bleiben dadurch Bild für Bild unverändert, und ihre
Golden-Frame-Tests müssen nicht angefasst werden.

Der Wert wird je Seite des Übergangs getrennt gesetzt: `EffectSpec` wird von
`{ id, params }` zu `{ id, params, ramp }`. `drawStill(frame, effect)` und
`drawTransition(…, fromEffect, toEffect)` übergeben damit ohne weitere
Signaturänderung je Element den eigenen Rampenwert — in der Mitte eines
Übergangs trägt das Ausgangselement seinen Wert nahe 1 und das Zielelement
seinen nahe 0, und der Effekt-Durchgang läuft wie heute zweimal.

### D2 – Der Rampenwert ist eine reine Funktion von (Element, Zeitpunkt)

Maßgeblich ist genau eine Formel, über der bereits geteilten Spanne eines
Elements aus dem Zeitmodell:

```
elementProgress(i, t) = clamp((t − start_i) / (end_i − start_i), 0, 1)
```

`start_i` und `end_i` sind `PlacedSlide.start` und `PlacedSlide.end` des
Elements `i`; `end_i > start_i` ist durch das Projektmodell garantiert
(Anzeigedauer mindestens 0,5 s, bei Videoclips `trimOut > trimIn`).

Verbindlich daran ist:

- Die Funktion hängt **nur** von Element und Zeitpunkt ab. Kein Frame-Zähler,
  keine Wanduhr, kein `performance.now()`, keine aufsummierten Zeitdeltas und
  kein Zustand aus dem vorigen Frame gehen ein. Zwei Aufrufe mit demselben
  `t` liefern denselben Wert, in beliebiger Reihenfolge und auf beiden Seiten.
- Sie wird als reine Funktion neben dem Zeitmodell implementiert, einmal in
  `apps/web/src/timeline/timeline.ts` und einmal in
  `backend/src/mmy_backend/render/timeline.py`, und beide Fassungen werden
  gegen dieselben Werte in `packages/fixtures/timeline-vectors.json` geprüft
  (Format-Version 2: je `samples`-Eintrag zusätzlich der Rampenwert jedes zum
  Zeitpunkt beteiligten Elements). Das ist genau das Verfahren, mit dem
  Zeitmodell und Musikplanung schon heute nicht auseinanderlaufen können.
- Gerechnet wird auf der CPU in doppelter Genauigkeit; an GL geht ein
  einziges `float`-Uniform. Die Umwandlung `float64 → float32` ist
  rundungstreu definiert, also liefern gleiche `float64`-Eingaben auf beiden
  Seiten dasselbe Bitmuster im Uniform. Kein Teil der Rechnung findet im
  Shader statt.

### D3 – Die Rampe läuft über die **eigene** Spanne des Elements

Die Rampe bezieht sich auf `[start_i, end_i]` — die ganze Anzeigedauer des
Elements, **einschließlich** seines eingehenden Übergangs, nicht auf
`[start_i + transitionIn_i, end_i]`.

`docs/research/movie-maker-reference.md` gibt dazu nichts her: §3 listet die
Effekte nur namentlich, die XML-Parameter sind nicht dokumentiert, und §8
hält fest, dass Verhalten dieser Art ohne Referenzinstallation nicht
verifizierbar ist (Kennzeichnung [E]). Die Entscheidung fällt deshalb nach
Vorhersagbarkeit:

- Die eigene Spanne ist die Größe, die der Benutzer selbst einstellt und auf
  der Kachel sieht. Setzt oder entfernt er einen Übergang zum Element, ändert
  das die Einblendung **nicht** — bei der Alternative würde dieselbe
  Einblendung anders aussehen, sobald ein Nachbar seine Dauer ändert, denn
  `transitionIn` hängt über `min(T, d_{i−1}/2, d_i/2)` auch an der Dauer des
  Vorgängers.
- Die Alternative hätte zudem keinen sinnvollen Wert während des eingehenden
  Übergangs: Die Rampe wäre dort negativ und auf 0 geklemmt, das Element
  bliebe über den ganzen Übergang hinweg vollständig schwarz, und ein
  Überblenden auf ein schwarzes Bild ist weder das, was der Benutzer
  erwartet, noch das, was das Original zeigt.
- `start_i` und `end_i` liegen in Vorschau und Export schon geteilt vor; die
  Alternative müsste zusätzlich `transitionIn_i` in die Rampe hineinrechnen
  und damit eine zweite Fehlerquelle in die Formel aufnehmen.

Folge, die so gewollt ist: Die Rampe ist immer genau so lang wie das Element.
Eine kürzere Einblendung erreicht der Benutzer, indem er den Clip teilt (Spec
slideshow-project, „Videoclip teilen“) — derselbe Weg wie im Original, wo die
Dauer der Fade-Effekte ebenfalls nicht einstellbar ist. Eine einstellbare
Rampendauer ist Nicht-Ziel; sie bräuchte entweder einen Parameter pro Instanz
(in `add-effects-catalog` verworfen) oder ein zweites Uniform mit der
Elementdauer.

### D4 – Woraus Export und Vorschau ihr `t` nehmen

Die Gleichheit von Vorschau und Export ist **für einen gemeinsamen Zeitpunkt
`t`** zugesichert, nicht Frame für Frame — die beiden Seiten rastern die Zeit
unterschiedlich, und das ist richtig so:

- **Export:** Frame `n` wird bei `t = n / fps` gerendert (fps = 30 aus dem
  Qualitätsprofil); die Framezahl ist `ceil(Gesamtdauer · fps)`. Das steht
  schon heute so in `render/timeline.py` und ist der einzige Zeitwert, den der
  Export kennt. Aus diesem `t` ergeben sich im `FrameRenderer` bereits das
  Segment (`frame_at`), die Übergangs-`progress` und bei Videoclips die
  Position im Original; der Rampenwert kommt aus demselben `t` und derselben
  `PlacedSlide` und wird **nicht** aus dem Frame-Index abgeleitet.
- **Vorschau:** Der Rampenwert MUSS aus demselben `t` berechnet werden, mit
  dem die Vorschau bereits `frameAt(timeline, t)` aufruft — also aus der
  Position des Wiedergabe-Zeitgebers (bei geplanter Musik die Audiouhr, Spec
  preview-player). Der Callback-Zeitstempel des Browsers darf nur diesen
  Zeitgeber fortschreiben, nie direkt in die Rampe eingehen, und es darf
  keinen pro Frame hochgezählten Rampenwert geben. Praktisch heißt das: der
  Rückruf, der heute je Elementindex den `EffectSpec` liefert, wird
  zeitabhängig und bekommt dasselbe `t` übergeben.
- **Kein Zwischenspeichern über Frames hinweg.** Der Effekt-Durchgang MUSS
  für ein Element mit gesetztem Effekt in jedem gezeichneten Frame neu laufen.
  Beide Seiten halten Zwischentexturen und geladene Quellbilder vor
  (`_SlideImage`-Cache im Backend, `imageCache` in der Vorschau); das bleibt
  erlaubt, denn es betrifft die **Eingabe** des Durchgangs. Das **Ergebnis**
  des Effekt-Durchgangs darf nicht über Frames hinweg wiederverwendet werden,
  auch nicht mit der Begründung „dasselbe Standbild, derselbe Effekt“ — genau
  diese Abkürzung würde eine Einblendung einfrieren und wäre in der Vorschau
  sichtbar, im Export aber nicht (oder umgekehrt).
- **An den Rändern** wird geklemmt, auf beiden Seiten durch dieselbe Formel.
  Weil das letzte Frame des Exports bei `(ceil(D·fps) − 1)/fps` und damit in
  der Regel vor `D` liegt, erreicht „Ausblenden zu Schwarz“ im fertigen Film
  kein reines Schwarz. Das ist gewollt: Die Vorschau zeigt an genau demselben
  `t` genau dasselbe Bild. Eine Sonderbehandlung des letzten Frames würde die
  Gleichheit aufgeben und wird nicht gemacht.

### D5 – Farbton-Zyklus passt in dasselbe Uniform

Farbton-Zyklus ist keine einseitige Rampe, sondern eine zyklische Größe. Er
braucht trotzdem kein eigenes Uniform: Der Shader dreht den Farbton um
`elementProgress · cycles · 360°` und nimmt von sich aus den Bruchteil, mit
`cycles` als festem Katalogparameter (Wert 1 — genau ein voller Durchlauf
über das Element). Bei `elementProgress` 0 und 1 ist das Bild also
unverändert, in der Mitte um 180° gedreht. Ein zweiter Uniform-Typ („Zeit in
Sekunden“) wäre die Alternative und wird verworfen: Er wäre nicht mehr
dimensionslos, also nicht mehr aus der Spanne allein ableitbar, und würde die
Rampe von der Elementdauer abhängig machen.

### D6 – Langsam vergrößern/verkleinern sind ein Zoom, immer ≥ 1

„Ease In“ und „Ease Out“ des Originals sind ein langsamer Zoom über den Clip,
keine Farboperation. Im Effekt-Vertrag ist das eine Abtastung von
`getColor(uv)` um die Bildmitte:

```
s = mix(1.0, zoom, elementProgress)          // Langsam vergrößern
s = mix(zoom, 1.0, elementProgress)          // Langsam verkleinern
getColor((uv − 0.5) / s + 0.5)
```

Der Skalierungsfaktor bleibt damit immer `≥ 1`, die abgetastete UV bleibt
innerhalb von `[0, 1]`, und keine Seite muss sich auf einen
Texture-Wrap-Modus verlassen — das ist der Grund, „Langsam verkleinern“ als
Zoom **von** `zoom` **auf** 1,0 zu definieren und nicht als Zoom unter 1,0.
`zoom` ist ein fester Katalogparameter (1,2) und als `estimated`
gekennzeichnet, wie `levels` bei Posterisieren: der Originalwert ist ohne
Referenzinstallation nicht belegbar.

Der Zoom arbeitet wie jeder bestehende Effekt auf dem **schon eingepassten**
Frame samt seinen Balken (Spiegeln und Rotieren tun das heute genauso). Ein
zoomendes Element schiebt seine Balken also mit nach außen. Das ist die
bestehende Vertragslage des Effekt-Durchgangs und braucht kein
Inhaltsrechteck-Uniform (siehe D10).

### D7 – Overlay-Titel bleiben außerhalb der Rampe

Ein Overlay-Titel (`title` auf einem Bild- oder Videoclip-Element, Spec
titles-and-credits) wird nach dem Still-/Übergangs-Durchgang auf das fertige
Bild gezeichnet, also nach dem Effekt-Durchgang. Er blendet daher **nicht**
mit ein oder aus. Das wird so dokumentiert und nicht geändert: Die
Titel-Animation hat ihre eigenen Phasen (Entrance → Main → Exit), und sie
einem Element-Effekt zu unterwerfen würde zwei unabhängige Zeitachsen
koppeln. Dieselbe Reihenfolge gilt in Vorschau und Export, die Gleichheit
bleibt also unberührt.

### D8 – Die Demo in der Sammlung läuft die Rampe ab

Ein Doppelklick auf einen Eintrag der Sammlung „Videoeffekte“ demonstriert
den Effekt heute an einem statischen Beispielbild. Für eine Rampe wäre das
nichtssagend. Die Demo läuft deshalb `elementProgress` von 0 bis 1 über
2 Sekunden und beginnt von vorn, solange die Demo sichtbar ist.

Das gilt für **alle** Einträge, nicht nur die sieben neuen: Die 21
bestehenden Effekte ignorieren das Uniform und sehen unverändert statisch
aus. Damit braucht der Katalog kein Merkmal „zeitabhängig“, und die
Sammlung braucht keine Verzweigung. Der Hinweistext („Beispiel: Sepia“) und
das Zurückkehren zum Projekt bei Wiedergabe, Suchen oder Auswahl bleiben wie
in Spec video-effects beschrieben.

### D9 – Wie die Gleichheit geprüft wird

Drei Ebenen, von der engsten zur weitesten:

1. **Geteilte Testvektoren** (`packages/fixtures/timeline-vectors.json`,
   Format-Version 2): Vitest und pytest prüfen beide Implementierungen der
   Formel aus D2 gegen dieselben Zahlen, mit der dort schon festgelegten
   absoluten Toleranz. Deckt ab: Element ohne Übergang, Element mit
   eingehendem Übergang, Zeitpunkt mitten im Übergang (beide beteiligten
   Elemente), Zeitpunkt genau auf einer Segmentgrenze, Klemmen bei 0 und bei
   der Gesamtdauer, Videoclip mit Trim.
2. **Golden Frames bei exaktem Rampenwert**: ein neuer Test-Haken
   `?debug-effect=<effektId>:<rampe>` analog `?debug-progress`. Er zeigt nur
   ein Canvas, das das eingebaute Testbild (`testPattern.ts`) durch den
   Effekt-Durchgang bei genau diesem `elementProgress` zeichnet. Dasselbe Bild
   wird im Backend über denselben Shader gerendert und per Pixelvergleich
   gegen die Toleranz aus Spec movie-export geprüft (höchstens 2 je Kanal bei
   mindestens 99,5 % der Pixel), bei den Rampenwerten 0, 0,25, 0,5, 0,75 und 1
   für jeden der sieben Effekte. Ohne diesen Haken gäbe es keine Möglichkeit,
   die Vorschau auf einen bestimmten Zeitwert zu zwingen; der bestehende
   Effekt-E2E-Test vergleicht nur Mittelwerte mit großzügiger Toleranz.
3. **Ein Durchlauf durch die Anwendung**: ein Projekt mit einem Element mit
   „Einblenden aus Schwarz“, die Vorschau per Suchleiste auf ein Vielfaches
   von 1/30 s gestellt, danach derselbe Zeitpunkt aus dem exportierten Film —
   derselbe Vergleich wie in 2., aber über die echte Oberfläche und den echten
   Export.

### D10 – Verhältnis zu `add-canvas-format`

Diese Change ändert **nur** die Capability `video-effects` und berührt keine
Anforderung, die `add-canvas-format` ändert (dort: `canvas`,
`slideshow-project`, `preview-player` „Darstellung im Monitor“,
`movie-export`, `transitions`, `app-shell` „Aufgabenbereich mit drei
Schritten“). Es gibt deshalb **keine Reihenfolge-Abhängigkeit**: Die beiden
Changes lassen sich in beliebiger Reihenfolge umsetzen und archivieren.

An den Dateien überschneiden sich beide nur in
`packages/shaders/README.md` (Shader-Vertrag) und, mit getrennten
Abschnitten, in `packages/shaders/prelude.glsl` gegenüber
`effect-prelude.glsl`. `add-canvas-format`s TASK-FX-011 gibt das
Inhaltsrechteck an den **Übergangs**-Vertrag; der Effekt-Vertrag bekommt es
nicht, weil kein Effekt dieser Change eine Formfunktion über der Fläche
rechnet (siehe D6). Wer zuletzt umsetzt, löst höchstens einen Textkonflikt in
`README.md` auf.

Kein Schema-Wechsel: Die sieben Effekte benutzen das bestehende Feld
`effectId` (Schema-Version 4 aus `add-effects-catalog`, inzwischen
Version 6). Diese Change hat damit auch keine Berührung mit
`add-canvas-format`s Schema-Version 7.
