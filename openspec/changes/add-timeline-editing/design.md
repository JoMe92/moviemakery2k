## Context

Stand: `develop` nach `add-video-import` (archiviert gemeinsam mit den
übrigen Changes aus der WMM-2.x-Lückenanalyse). `add-mobile-layout`/
`add-mobile-delivery` laufen auf eigenen, unintegrierten Branches und sind
hier nicht Grundlage.

Zwei Architektur-Beratungen (2026-10-03) haben diese Change vorbereitet:

1. Die erste (vor `add-video-import`) hat festgelegt, dass Videoclip-Import
   auf die Mediensammlung begrenzt bleibt, weil Player und Export auf zwei
   Standbild-Texturen ausgelegt sind (`add-video-import/design.md`).
2. Die zweite (für diese Change) hat den konkreten Umbau-Mechanismus
   geprüft:
   - `apps/web/src/render/Renderer.ts` (`ImageSource`, `sourceSize`,
     `ensureLetterboxed`) nutzt `ctx.drawImage()`, das ein
     `HTMLVideoElement` genauso akzeptiert wie ein `HTMLImageElement` — der
     Letterbox-Cache (der auf gleicher Canvas-Größe beruht) muss für
     Video-Frames nur deaktiviert werden, kein neuer Rendering-Pfad.
   - `apps/web/src/player/Player.tsx` und die Audio-Clock
     (`docs/architecture.md` Abschnitt 6) bleiben die einzige Zeitquelle;
     ein Video bekommt keinen eigenen Takt (`video.play()`), sondern wird
     pausiert gehalten und pro Tick per `video.currentTime` auf die
     passende Stelle gesetzt (Scrubbing).
   - `buildTimeline`/`frameAt` (`apps/web/src/timeline/timeline.ts`,
     `backend/src/mmy_backend/render/timeline.py`) und
     `packages/fixtures/timeline-vectors.json` bleiben unverändert: Nur der
     Adapter, der ein Projekt-Slide in ein `TimelineSlide` übersetzt,
     berechnet für `kind: "video"` die `duration` als `trimOut − trimIn`,
     bevor er in den bestehenden Algorithmus geht.
   - Export (`backend/src/mmy_backend/render/frames.py`) bleibt die
     einzige Rendering-Pipeline (kein zweiter, FFmpeg-eigener
     Übergangsmechanismus); Video-Segmente liefern ihre Frames über einen
     sequentiellen FFmpeg-Dekodier-Subprozess statt eines statischen JPEGs,
     der bestehende GLSL-Übergang (`_render_transition`) bleibt unverändert.
   - Clip-Teilen ist mit diesem Datenmodell trivial: ein Eintrag wird am
     Schnittpunkt zu zwei Einträgen mit angepasstem `trimOut`/`trimIn`.

`openspec/specs/slideshow-project/spec.md` beschreibt heute Schema-Version 2
(Bild + Musikspur); `openspec/specs/preview-player/spec.md` spricht generell
von „Bild“, ohne eine zweite Medienart vorzusehen. `movie-export`s Spec
(„Qualitätsprofile“, „Assistent“) ist bereits unabhängig von der Medienart
formuliert (nennt nirgends „nur Standbilder“) und braucht deshalb **keine**
Änderung — der Export bleibt nach außen dasselbe MP4 mit denselben
Qualitätsprofilen, nur die interne Frame-Quelle ändert sich.

Vorgaben des Product Owners (2026-10-03):

- Dritte von neun geplanten Changes; baut auf `add-video-import` auf.
- Clip-Ton bleibt stumm in dieser Change (README-Roadmap gruppiert
  „Videoclips, Erzählung, Pegelregler Ton ↔ Musik“ als einen späteren,
  gemeinsamen Bereich — diese Scope-Entscheidung übernimmt diese Gruppierung
  direkt aus dem bereits dokumentierten Roadmap, keine neue Rückfrage
  nötig).

Standardwerte, vom Planning Agent festgelegt (im PR änderbar): Export
dekodiert Video-Frames sequentiell vorwärts mit der Ziel-Framerate (30 fps,
wie die Qualitätsprofile) über einen einmal pro Video-Slide geöffneten
FFmpeg-Subprozess (kein wiederholtes `-ss`-Seeking, das bei
Inter-Frame-Codecs langsam ist).

## Goals / Non-Goals

**Goals:** Videoclips lassen sich wie Bilder in den Bildstreifen einfügen,
kürzen, teilen, in der Vorschau abspielen (stumm) und exportieren, mit
denselben Übergängen und derselben Bild-Einpassung wie heute; eine
Zeitachsen-Ansicht zeigt dieselben Daten als Spuren mit Zoom und
Zieh-Griffen. Bestehende Bild-/Musik-Funktionalität, `timeline.ts`-Fixtures
und die Export-Qualitätsprofile bleiben unverändert.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Slide-Datenmodell (Schema-Version 3)
`slides` wird eine diskriminierte Union: `kind: "image"` (unverändert,
`duration`) und `kind: "video"` (`mediaId` verweist auf ein `VideoItem` aus
`media-library`, `trimIn`/`trimOut` in Sekunden, `0 ≤ trimIn < trimOut ≤`
Videodauer). Die Segmentlänge folgt ausschließlich aus `trimOut − trimIn` —
kein zusätzliches, redundantes Dauerfeld, das mit dem Trim auseinanderlaufen
könnte. Ein eingehender Übergang gehört weiterhin zum Element, unabhängig
von dessen Art. Migration von Version 2: jedes bestehende Element bekommt
`kind: "image"`, seine `duration` bleibt unverändert; ein Element ohne
`kind` (Alt-Alt-Bestand vor Version 2) gilt ebenfalls als `image`.

### D2 – Einfügen aus der Sammlung
Ein Video aus „Meine Videos“ lässt sich wie ein Bild per Drag & Drop oder
Doppelklick in den Bildstreifen einfügen (dieselben Interaktionen wie
`slideshow-project`s „Bilder in den Bildstreifen ziehen“). Der
Standard-Trim ist die volle Videolänge (`trimIn = 0`, `trimOut =`
Videodauer); kein eingehender Übergang (harter Schnitt), wie bei neu
eingefügten Bildern.

### D3 – Kürzen
Ein Eigenschaften-Dialog (Doppelklick oder Kontextmenü, wie bei
Musikstücken) setzt `trimIn`/`trimOut` numerisch, mit Vorschau des
resultierenden Posterbilds an den neuen Rändern. Werte außerhalb von
`0 ≤ trimIn < trimOut ≤` Videodauer werden abgelehnt.

### D4 – Clip-Teilen
Clip → „Teilen“ (nur aktiviert, wenn das ausgewählte Element ein Videoclip
ist und die Wiedergabeposition innerhalb seiner Spanne liegt) teilt es am
Abspielkopf in zwei Elemente mit demselben `mediaId`: Das erste bekommt
`trimOut = Schnittpunkt`, behält den eingehenden Übergang des Originals; das
zweite bekommt `trimIn = Schnittpunkt`, beginnt ohne eingehenden Übergang
(harter Schnitt an der neuen inneren Kante). Der ursprüngliche
Übergang zum nachfolgenden Element bleibt an seinem Platz unverändert.

### D5 – Player: Video-Textur und Scrubbing
`Renderer.ts`s Bildquelle akzeptiert zusätzlich `HTMLVideoElement`; der
Letterbox-Cache (bisher an gleicher Canvas-Größe erkannt) wird für
Video-Frames deaktiviert, da sich deren Pixelinhalt bei gleicher Größe
trotzdem ändert. Kein eigener Wiedergabe-Takt: Das `<video>`-Element bleibt
pausiert, und bei jedem Zeichnen wird `video.currentTime = trimIn +
(Wiedergabezeit − Segmentanfang)` gesetzt. Videoclips spielen stumm
(`muted = true`); die Audiouhr der Musikspur bleibt der einzige Taktgeber.

### D6 – Export: Frame-Quelle je Segment
`FrameRenderer` bleibt die einzige Export-Pipeline. Für ein Video-Segment
öffnet der Export einmalig einen sequentiellen FFmpeg-Dekodier-Subprozess
(Ziel-Framerate des gewählten Qualitätsprofils) und entnimmt ihm
fortlaufend Frames anstatt ein statisches JPEG zu laden; die bestehende
Übergangs-Logik (`_render_transition`) behandelt diese Frames identisch zu
Bild-Frames. Kein `xfade`/`concat` auf FFmpeg-Ebene — das würde eine zweite
Übergangs-Mathematik neben dem GLSL-Shader einführen und Vorschau/Export
auseinanderlaufen lassen.

### D7 – Zeitachsen-Ansicht
Ansicht → „Zeitachse“ schaltet eine zweite Darstellung desselben
Bildstreifens frei: eine horizontale Spur mit einem Zeitlineal, Clips in
proportionaler Breite zu ihrer Dauer, einem Zoom-Regler und Zieh-Griffen an
den Clip-Kanten, die bei Videoclips `trimIn`/`trimOut` live anpassen (bei
Bildern die Anzeigedauer). Übergänge erscheinen als gemeinsamer Keil
zwischen zwei Clips. Auswahl und Abspielkopf-Position sind mit der
Storyboard-Ansicht geteilt (derselbe Store), sodass ein Wechsel der
Ansicht nichts an Auswahl oder Wiedergabeposition ändert.
