## Why

`add-video-import` hat den Videoimport bewusst auf die Mediensammlung
begrenzt (Posterbild, keine Wiedergabe, kein Export) — Player und Export
waren dafür fundamental auf zwei Standbild-Texturen ausgelegt. Diese Change
ist der angekündigte Umbau: Videoclips lassen sich in den Bildstreifen
ziehen, kürzen, am Abspielkopf teilen, in der Vorschau abspielen und
exportieren. Zusätzlich liefert sie die im README-Roadmap genannte
„Timeline view with trimming and splitting“ als Spuren-Ansicht, die
dieselben Daten alternativ zum Storyboard zeigt.

Zwei Architektur-Beratungen (2026-10-03) haben den Umfang und Mechanismus
festgelegt:

- **Datenmodell:** `slides` wird eine Union aus `kind: "image"` (unverändert,
  feste `duration`) und `kind: "video"` (`trimIn`/`trimOut`; die Länge folgt
  ausschließlich aus `trimOut − trimIn`, nicht aus einem zusätzlichen
  Dauerfeld). Schema-Version 3.
- **Player:** ein verstecktes `<video>`-Element wird wie ein Bild in die
  bestehende Zwei-Texturen-Shader-Engine eingespeist (`Renderer.ts`
  akzeptiert `HTMLVideoElement` als Bildquelle neben `HTMLImageElement`).
  Kein eigener Wiedergabe-Takt: Das Video wird pausiert gehalten, und pro
  Bildwechsel wird `video.currentTime` auf die passende Stelle gesetzt
  (Scrubbing) — die Audiouhr bleibt der einzige Taktgeber, wie heute bei
  Musik.
- **Export:** Die bestehende Python-Frame-für-Frame-Pipeline
  (`render/frames.py`) bleibt die einzige Rendering-Pipeline; für
  Video-Segmente liefert ein sequentieller FFmpeg-Dekodier-Subprozess
  fortlaufende Frames statt eines statischen JPEGs. Übergänge an
  Video-Grenzen laufen unverändert durch den bestehenden GLSL-Übergang —
  keine zweite, FFmpeg-eigene Übergangs-Mathematik (`xfade`/`concat`), um
  Vorschau und Export nicht auseinanderlaufen zu lassen.
- **Clip-Ton bleibt stumm:** Die Tonspur eines Videoclips spielt in dieser
  Change weder in der Vorschau noch im Export mit — nur die Musikspur, wie
  heute. Das README-Roadmap nennt „Videoclips, Erzählung, Pegelregler Ton ↔
  Musik“ als einen gemeinsamen, späteren Bereich (Audio/Narration, sechste
  der neun geplanten Changes); Clip-Ton-Mischung gehört dorthin, nicht in
  den visuellen Umbau dieser Change.

## What Changes

- **Videoclip in den Bildstreifen:** aus der Sammlung „Meine Videos“ wie ein
  Bild per Drag & Drop oder Doppelklick einfügbar; Standard-Trim ist die
  volle Videolänge. Die Kachel zeigt das Posterbild.
- **Kürzen:** ein Eigenschaften-Dialog (wie bei Musikstücken) setzt
  `trimIn`/`trimOut` numerisch.
- **Clip → „Teilen“:** teilt das ausgewählte Videoclip-Element am
  Abspielkopf in zwei Elemente; das erste behält den eingehenden Übergang
  des Originals, das zweite beginnt mit hartem Schnitt.
- **Wiedergabe:** Videoclips spielen stumm im Vorschaumonitor, mit
  denselben Übergängen, derselben Seitenverhältnis-Einpassung und derselben
  Zeitanzeige wie Bilder.
- **Export:** der exportierte Film enthält die Videoclips an ihrer Stelle,
  inklusive Übergängen; Ton bleibt wie heute nur die Musikspur.
- **Zeitachsen-Ansicht:** Ansicht → „Zeitachse“ zeigt denselben Bildstreifen
  als Spuren-Darstellung mit proportionaler Breite je Dauer, Zoom und
  Zieh-Griffen zum Kürzen an den Clip-Kanten — eine zweite Sicht auf
  dieselben Daten, nicht ein zweites Datenmodell.

## Capabilities

### New Capabilities

- `timeline-view`: Spuren-Darstellung des Bildstreifens mit proportionaler
  Breite, Zoom und Zieh-Griffen zum Kürzen, als Alternative zur
  Storyboard-Kachelreihe

### Modified Capabilities

- `slideshow-project`: Slide-Union `image`/`video`, Trim, Schema-Version 3,
  Teilen
- `preview-player`: neue Requirement „Videoclips in der Wiedergabe“ (stumm,
  Scrubbing-Sync, dieselbe Einpassung wie Bilder)

## Nicht-Ziele

- Ton von Videoclips in Vorschau oder Export, Pegelregler Ton ↔ Musik,
  Erzählung (Mikrofon) — eigene, spätere Change „Audio/Narration“.
- Videoeffekte (Zeitlupe, Zeitraffer, Sepia, Schwarzweiß …) — eigene,
  spätere Change „Effekte“.
- Eine normalisierte Zwischenfassung des Videos (unverändert aus
  `add-video-import`); Export dekodiert weiterhin aus dem Original.
- Echte Mehrspur-Bearbeitung (mehrere parallele Videospuren,
  Bild-in-Bild) — bleibt bei einer einzigen Reihe wie im Original Movie
  Maker; nur die Ansicht wechselt zwischen Kacheln und Spuren-Darstellung.
- Frame-genaues Rückwärts-Seeking über alle Codecs hinweg; die
  Export-Dekodierung liest sequentiell vorwärts.
- Änderungen an den Export-Qualitätsprofilen oder am Fehlervertrag von
  `movie-export` — dessen Spec ist bereits unabhängig von der Medienart und
  bleibt unverändert.
