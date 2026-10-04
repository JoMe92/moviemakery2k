## Why

moviemakerY2K ist bisher überall fest auf 4:3 verdrahtet: der Vorschaumonitor
(`apps/web/src/render/geometry.ts`, `FRAME_ASPECT = 4 / 3`), die Einpassung in
Vorschau und Export (`letterbox()` in `Renderer.ts` bzw.
`backend/src/mmy_backend/render/frames.py`) und alle drei Qualitätsprofile
(960×720, 640×480, 320×240). Das war die richtige Entscheidung für die Treue
zu Movie Maker 2.x — das Original kennt kein anderes Format.

Der Product Owner hat am 2026-10-04 entschieden, hier bewusst von der Parität
abzuweichen: Der Editor wird in der Praxis für soziale Netzwerke benutzt, und
dafür braucht es Hochformat. Das ist die erste gewollte Abweichung vom
Original, und sie ist deshalb als eigener Change und nicht als Nebenwirkung
einer anderen Change geplant.

Zwei Dinge gehören dafür zusammen: Sobald das Format wählbar ist, füllt der
Inhalt die Fläche noch seltener aus als heute (ein Querformat-Foto auf einem
Hochformat-Canvas lässt oben und unten große Flächen frei), also braucht die
freie Fläche eine wählbare Farbe. Beides ist in der ersten Fassung streng
begrenzt: zwei Formate, zwei Farben.

## What Changes

- **Wählbares Filmformat:** Ein Projekt hat ein Canvas-Format, entweder
  **Querformat 16:9** oder **Hochformat 9:16**. Es gilt für den
  Vorschaumonitor und den Export gleichermaßen und für jede Art von
  Bildstreifen-Element — Bilder wie Videoclips (letztere, sobald
  `add-timeline-editing` sie liefert).
- **Wählbarer Hintergrund:** Die Fläche, die der Inhalt nicht ausfüllt, ist
  entweder **schwarz** oder **weiß**. Schwarz ist der Standard und das
  heutige Verhalten.
- **Neue Capability `canvas`:** Canvas-Format, Hintergrund, die Einpassung des
  Inhalts und das daraus folgende **Inhaltsrechteck** werden an genau einer
  Stelle definiert und von Vorschau (WebGL2) und Export (headless GL) aus
  derselben Definition abgeleitet. Die Gleichheit von Vorschau und Export ist
  eine harte Projekt-Invariante und bleibt es.
- **Übergangsgeometrie im Inhaltsrechteck:** Richtungsübergänge laufen über
  das sichtbare Inhaltsrechteck, nicht über die gesamte Fläche samt Rändern.
  Ohne das wäre das Hochformat unbrauchbar: Ein waagerechter Wisch würde den
  größten Teil seiner Dauer über leere Ränder laufen (siehe design.md D5 und
  Bead mmy-5ul).
- **Projektmodell und Migration:** Das Projekt bekommt ein Feld `canvas`
  (Format und Hintergrund), Schema-Version 7. Ältere Projekte werden als
  Querformat 16:9 mit schwarzem Hintergrund übernommen.
- **Qualitätsprofile folgen dem Format:** Die drei Profile behalten ihre Namen
  und ihre Rolle, ihre Pixelmaße ergeben sich aus dem Canvas-Format
  (Hochformat ist die Transponierte des Querformats).
- **Bedienung:** Der Aufgabenbereich bekommt in „2. Film bearbeiten“ den
  Eintrag „Filmformat festlegen…“, der einen modalen Y2K-Dialog
  „Filmformat“ mit zwei Auswahlgruppen öffnet (Format, Hintergrund).

## Capabilities

### New Capabilities

- `canvas`: Canvas-Format (16:9, 9:16) und Hintergrundfarbe (schwarz, weiß),
  die gemeinsame Einpassungs- und Inhaltsrechteck-Definition für Vorschau und
  Export, und der Dialog „Filmformat“

### Modified Capabilities

- `slideshow-project`: Feld `canvas` im Projektmodell, Schema-Version 7,
  Migration älterer Projekte
- `preview-player`: „Darstellung im Monitor“ gilt im Canvas-Format statt fest
  in 4:3, mit der gewählten Hintergrundfarbe
- `movie-export`: Qualitätsprofile im Canvas-Format statt fest in 4:3; der
  Export ergänzt mit der Hintergrundfarbe des Projekts
- `transitions`: Die Geometrie eines Übergangs ist über dem Inhaltsrechteck
  definiert, nicht über der gesamten Canvas-Fläche
- `app-shell`: Aufgabenbereich-Eintrag „Filmformat festlegen…“ in
  „2. Film bearbeiten“

## Nicht-Ziele

Vom Product Owner ausdrücklich ausgeschlossen (2026-10-04):

- **Andere Seitenverhältnisse** als 16:9 und 9:16 — also auch kein 1:1, kein
  4:5 und kein 4:3. Das heutige 4:3 verschwindet damit als wählbares Format;
  bestehende Projekte werden auf Querformat 16:9 migriert (design.md D3).
- **Beliebige Hintergrundfarben**, Farbwähler, Farbverläufe oder ein
  Hintergrundbild — nur schwarz und weiß.
- **Abgeleitete Hintergründe** (unscharf vergrößerter Inhalt, „blurred
  background“, Spiegelung).
- **Überschreiben je Element** — das Format und der Hintergrund gelten für das
  ganze Projekt, nicht je Bild oder Videoclip.

Weitere Nicht-Ziele dieser Change:

- **Zuschneiden, Füllen („cover“), Schwenken oder Zoomen (Ken Burns):** Der
  Inhalt wird weiterhin vollständig und seitenverhältnistreu eingepasst
  („contain“); er wird nie beschnitten.
- **Format je Export-Profil** oder ein Export in einem anderen Format als dem
  Canvas-Format des Projekts.
- **Automatisches Erkennen** eines passenden Formats aus dem importierten
  Material; die Auswahl ist immer ausdrücklich.
- **Neue Übergänge oder neue Katalogparameter.** Diese Change ändert nur, über
  welcher Fläche die bestehende Übergangsgeometrie rechnet; sie nimmt keine
  Einträge in den Katalog auf und ändert keinen `gradientSize`-Wert.
- **Neue Layout-Modi.** Das kompakte Layout aus `add-mobile-layout` bleibt wie
  es ist; nur das Seitenverhältnis des Monitors folgt dem Canvas (design.md
  D7).
