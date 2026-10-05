## Why

`add-effects-catalog` hat den Effekt-Katalog bewusst auf die **21
zustandslosen** Bild-Effekte begrenzt und die zeitabhängigen Effekte des
Originals ausdrücklich als Nicht-Ziel zurückgestellt: „eine Rampe über die
Zeit, nicht pro Frame statisch“. Diese Change holt genau diese Gruppe nach.

`docs/research/movie-maker-reference.md` §3 zählt rund 30 Videoeffekte in
Movie Maker 2.x. Sieben davon sind eine Rampe über die Anzeigedauer eines
Elements: **Fade In from Black, Fade In from White, Fade Out to Black, Fade
Out to White, Ease In, Ease Out, Hue Cycle**. „Einblenden aus Schwarz“ ist
einer der am häufigsten benutzten Effekte des Originals überhaupt, und die
Mechanik dahinter ist klein: Der Effekt-Durchgang mit **einer**
Eingabetextur existiert bereits identisch in `apps/web/src/render/Renderer.ts`
und im `FrameRenderer` des Backends; es fehlt ihm nur ein Uniform mit dem
Fortschritt des Elements über seine eigene Spanne. Keine neue Pipeline, kein
zweiter Shader-Typ.

Der Grund, diese Gruppe als eigene Change zu planen, ist die harte
Projekt-Invariante: Vorschau (WebGL2) und Export (headless GL) müssen
dasselbe Bild liefern (Spec movie-export, „Export entspricht der Vorschau“:
Abweichung je Farbkanal höchstens 2 bei mindestens 99,5 % der Pixel). Ein
Zeitwert ist genau die Art Größe, die zwischen einem Browser-Frame-Callback
und einer kopflosen Render-Schleife leise auseinanderläuft. Diese Change legt
deshalb nicht nur die Effekte fest, sondern vor allem, **wie beide Seiten den
Rampenwert aus derselben Definition ableiten** (design.md D2–D4).

## What Changes

- **Ein neues Uniform `elementProgress`** in `packages/shaders/effect-prelude.glsl`,
  verfügbar für jedes Effekt-Programm: der Fortschritt des Elements über seine
  eigene Spanne, 0,0 am Anfang bis 1,0 am Ende. Die 21 bestehenden Effekte
  ignorieren es und bleiben Bild für Bild unverändert.
- **Eine gemeinsame Definition des Rampenwerts** als reine Funktion von
  Element und Zeitpunkt, einmal in `apps/web/src/timeline/timeline.ts` und
  einmal in `backend/src/mmy_backend/render/timeline.py`, beide gegen dieselben
  Werte in `packages/fixtures/timeline-vectors.json` geprüft — dasselbe
  Verfahren, mit dem Zeitmodell und Musikplanung schon heute nicht
  auseinanderlaufen können.
- **Sieben neue Katalogeinträge und Shader** (Einblenden aus Schwarz/Weiß,
  Ausblenden zu Schwarz/Weiß, Langsam vergrößern, Langsam verkleinern,
  Farbton-Zyklus). Der Effekt-Katalog zählt danach **28** Einträge.
- **Demo in der Sammlung „Videoeffekte“** läuft die Rampe ab, statt sie
  einzufrieren: Ein Doppelklick auf einen Eintrag zeigt den Effekt am
  Beispielbild mit einer Rampe von 0 bis 1 über 2 Sekunden, in einer Schleife.
- **Ein Test-Haken `?debug-effect=<id>:<rampe>`** analog zum vorhandenen
  `?debug-progress` für Übergänge: Er zwingt die Vorschau auf einen exakten
  Rampenwert und macht den Golden-Frame-Vergleich zwischen Vorschau und Export
  für einen Zeitwert überhaupt erst möglich.

## Capabilities

### Modified Capabilities

- `video-effects`: Katalog mit 28 statt 21 Einträgen; neue Anforderung
  „Zeitabhängige Effekte“ mit der gemeinsamen Rampendefinition und der
  Gleichheit von Vorschau und Export; animierte Demo in der Sammlung

## Nicht-Ziele

- **Speed Up Double / Slow Down Half** — die beiden letzten noch fehlenden
  Effekte aus §3. Sie ändern die Zeitabbildung eines Videoclips
  (`trimIn`..`trimOut` zu Timeline-Zeit) und damit die Anzeigedauer des
  Elements; das ist eine Änderung am Projektmodell und am Zeitmodell, keine
  Pixel-Operation, und gehört nicht in einen Effekt-Shader.
- **Eine einstellbare Rampendauer** („in 0,5 s einblenden statt über das ganze
  Element“). Wie im Original läuft die Rampe über die ganze Anzeigedauer des
  Elements; wer eine kürzere Einblendung will, teilt den Clip (Spec
  slideshow-project, „Videoclip teilen“). Begründung in design.md D3.
- **Mehrere Effekte gleichzeitig** auf einem Element — der Effekt-Platz bleibt
  Singular, wie in `add-effects-catalog` entschieden. Ein Element kann also
  nicht gleichzeitig einblenden und ausblenden.
- **Effekt-Parameter pro Instanz** — alle Werte kommen weiter aus dem
  Katalogeintrag.
- **Die zurückgestellten Titel-Phasen** (Flashing, SpotLight aus
  `add-titles-and-credits`). Sie haben dieselbe Form „ein Wert über eine
  Phase animiert“ und werden durch diese Change leichter, laufen aber über das
  Titel-Programm (`title-vertex.glsl`/`title-fragment.glsl`) und nicht über
  den Effekt-Durchgang. Eigene spätere Change.
- **Zeitabhängige Übergänge** oder eine Änderung am Übergangs-Shader-Vertrag.
  Der Übergangs-Durchgang bleibt unverändert.
