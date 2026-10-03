## Context

Stand: `develop` nach `add-effects-catalog` (archiviert gemeinsam mit den
übrigen Changes der WMM-2.x-Lückenanalyse). `add-mobile-layout`/
`add-mobile-delivery` laufen auf eigenen, unintegrierten Branches und sind
hier nicht Grundlage.

Eine Architektur-Beratung (2026-10-03) hat die Pipeline geprüft:
`Renderer.ts` nimmt als Bildquelle jedes `ImageBitmap | HTMLImageElement |
HTMLCanvasElement` — ein mit `fillText` beschriebener Canvas ist also schon
heute eine gültige Quelle, keine neue Renderer-Fähigkeit nötig für den
Fall „Titel als eigenes Element“. Zwei echte Lücken bleiben: Erstens
zeichnet `letterbox()` heute immer opak auf Schwarz (Canvas mit `alpha:
false`); ein Overlay-Titel über ein bestehendes Bild braucht eine zweite,
alpha-erhaltende Rasterung plus einen bisher nicht vorhandenen
Alpha-Blend-Zeichenmodus (`gl.enable(gl.BLEND)`), sowohl im Web-Renderer
als auch im Backend-`FrameRenderer`. Zweitens hat der Vertex-Shader keinen
Position/Zoom-Uniform; die Phasen-Attribute aus der Recherche (Position,
Zoom je Phase) brauchen einen neuen Vertex-Transform, nicht nur einen
Fragment-Shader.

`docs/research/movie-maker-reference.md` §3 beschreibt die
Original-Architektur: drei Phasen (Entrance → Main → Exit), jede mit
Effekt, Position, Zoom, Textbereich; mögliche Effekte u. a. Fade, Blur,
OverZoom, Rotate, TypeWriter, FadeEllipse, FadeWipe, BounceWipe,
Perspective, SpotLight, Flashing, Inverse, Multi, Mirror, OutlineExplode.
Die Beratung hat diese Liste auf vorhandene bzw. in dieser Change neu
gebaute Bausteine zurückgeführt (siehe D4). Der Titel-Assistent des
Originals wählt zuerst die Platzierung (Anfang, vor dem Clip, auf dem Clip,
Ende), dann Text, Animation, Schrift und Farbe.

Vorgaben des Product Owners (2026-10-03):

- Sechste von neun geplanten Changes; nutzt Bausteine aus
  `add-transition-catalog` (generischer Wipe) und `add-effects-catalog`
  (Ein-Textur-Effekte) wieder, ohne deren Kataloge zu ändern.
- Scope auf ein MVP von 8 benannten Stilen begrenzt (4 einzeilig, 2
  zweizeilig, 2 Nachspann); TypeWriter, Perspective, OutlineExplode, Multi
  und die übrigen ~35 Namen bleiben zurückgestellt.

Standardwerte, vom Planning Agent festgelegt (im PR änderbar): gebündelte
Schriftart „Liberation Sans“ (offen lizenziert, mit Arial/Verdana
metrik-kompatibel, für Pixel-Parität zwischen Vorschau und Export
mitgeliefert statt auf eine System-Schrift zu vertrauen); Standard-Dauer
eines freistehenden Titel-Elements 5 s (wie ein Bild-Element); Phasendauer
Entrance/Exit je 1 s, Rest ist „Main“.

## Goals / Non-Goals

**Goals:** Ein Titel lässt sich als eigenes Element (Anfang/vor Clip/Ende)
oder als Overlay (auf Clip) einfügen, mit einem der 8 MVP-Stile, über einen
Assistenten; Vorschau und Export zeigen densel­ben Text, dieselbe Animation
und dieselbe Schrift. Nachspann-Scroll nutzt denselben Mechanismus wie
statische Titel, kein zweites Render-Konzept.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Text-Rasterung
Titeltext wird per Canvas2D (`fillText`, gebündelte Schriftart „Liberation
Sans“, Zeilenumbruch nach fester Breite) auf einen **alpha-erhaltenden**
Canvas gezeichnet (anders als `letterbox()`s opakes Schwarz). Für ein
freistehendes Titel-Element (Hintergrund: schwarz, wie im Original) wird
der Hintergrund vor dem Text in denselben Canvas gezeichnet — das Ergebnis
ist dann wie bisher eine normale, opake Bildquelle. Für ein Overlay bleibt
der Hintergrund transparent.

### D2 – Alpha-Blend für Overlay-Titel
Ein neuer Zeichenmodus (`gl.enable(gl.BLEND)`, `gl.blendFunc(gl.SRC_ALPHA,
gl.ONE_MINUS_SRC_ALPHA)`) zeichnet die Titel-Textur **nach** dem
bestehenden Still-/Übergangs-/Effekt-Durchgang über das Ergebnis, nur wenn
ein Overlay-Titel gesetzt ist. Der Web-Renderer und der Backend-
`FrameRenderer` bekommen diesen Modus gleich; kein Blend bei einem
freistehenden Titel-Element (das ist bereits eine vollständige, opake
Bildquelle).

### D3 – Vertex-Transform für Position und Zoom
Ein neuer Vertex-Shader-Uniform (Translation + Skalierung) ersetzt die
bisherige feste Vollbild-Position für die Titel-Textur. Jede Phase
(Entrance, Main, Exit) definiert Position und Zoom als Start- und
Endwert; `Main` ist im Regelfall statisch (Start = Ende). Nachspann-Scroll
ist exakt derselbe Mechanismus mit Start ≠ Ende während „Main“ — kein
eigenes Scroll-Konzept. Die Canvas-Rasterung für Nachspann-Listen skaliert
auf die tatsächliche Inhaltshöhe (kann die Bildhöhe überschreiten), statt
wie bei Bildern auf Puffergröße.

### D4 – MVP-Stil-Katalog aus Bausteinen
`packages/catalog/titles.json` (neu, analog `transitions.json`): 8
Einträge, jeder mit `id`, zweisprachigem Namen, Layout (`one-line`/
`two-line`/`credits`), und je Phase einem Effekt aus: `fade` (Alpha-Fade),
`wipe:<id>` (ein Eintrag aus dem generischen Wipe-Shader von
`add-transition-catalog`, angewendet auf den Text-Alpha-Kanal statt
zwischen zwei Bildern), `position` (Fly-In/Out über D3), oder einem
Ein-Textur-Effekt aus `add-effects-catalog` als zusätzliche statische
Behandlung während „Main“. Die 8 Einträge:
- **Einzeilig:** Basic Title (Fade ein/aus, Mitte, statisch), Fly In
  (Entrance: Position von links, Exit: Fade), Zoom In (Entrance: Zoom von
  30 % auf 100 %, Exit: Fade), Subtitle (unten, kleinere Schrift, Fade
  ein/aus).
- **Zweizeilig:** Fade In and Out (zwei Zeilen, Fade ein/aus, statisch),
  Fly In Fades (Entrance: Position von unten, Exit: Fade).
- **Nachspann:** Scroll Up Stacked (Liste von Einträgen, Main: Position von
  unten nach oben über die volle Phasendauer, Entrance/Exit: Fade am
  Rand), Fade In and Out (Nachspann) (statische Liste, Fade ein/aus, kein
  Scroll).

### D5 – Datenmodell: Element oder Overlay
Ein Titel ist entweder ein **eigenes Element** (`kind: "title"`:
`lines: string[]` oder `creditEntries: string[]`, `styleId`, `duration`
wie ein Bild-Element, Standard 5 s) für die Platzierungen Anfang, vor
einem Clip oder Ende — es wird einfach an der gewünschten Position in die
Elementliste eingefügt, wie heute schon jedes Element — oder ein
**Overlay-Feld** `title: { lines, styleId } | null` auf einem bestehenden
Bild- oder Videoclip-Element für die Platzierung „auf dem Clip“ (folgt der
Dauer des Host-Elements, kein eigenes Dauerfeld, wie `effectId`). Schema-
Version 5 nach Version 4 aus `add-effects-catalog`; Migration von Version
4: jedes Element bekommt `title: null`.

### D6 – Titel-Assistent
Ein modaler Y2K-Assistent (wie „Film speichern“) mit den Schritten
„Platzierung“ (Anfang/vor dem gewählten Clip/auf dem gewählten Clip/Ende —
nur verfügbare Optionen je nach aktueller Auswahl), „Text“ (ein-/
zweizeilig bzw. Liste bei Nachspann), „Stil“ (eine der 8 MVP-Vorlagen mit
Live-Vorschau im Monitor) und „Farbe“ (Textfarbe aus einer festen Palette;
die Schriftart ist fest „Liberation Sans“, siehe Standardwerte).
