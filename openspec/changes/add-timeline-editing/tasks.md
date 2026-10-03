Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Dies
ist die größte der neun geplanten WMM-2.x-Lücken-Changes (zwei
Architektur-Beratungen in design.md); sie wird nach `add-video-import`
umgesetzt und archiviert.

## 1. Datenmodell

- [ ] TASK-API-018 Slide-Datenmodell Version 3: `Slide` als diskriminierte
  Union `image`/`video` (`trimIn`/`trimOut` statt `duration` bei Video,
  Validierung `0 ≤ trimIn < trimOut ≤` Videodauer), Migration von Version 2
  (jedes Element gilt als `image`), `gen-api` (design.md D1). Erledigt, wenn
  pytest die Migration von Version 2, Ablehnung ungültiger Trim-Werte und
  ein gemischtes Projekt (Bild- und Videoclip-Elemente) abdeckt.

## 2. Bildstreifen und Player

- [ ] TASK-WEB-058 Videoclip einfügen: Drag & Drop und Doppelklick aus
  „Meine Videos“ in den Bildstreifen, Standard-Trim (volle Länge), Kachel
  mit Posterbild, `buildTimeline`-Adapter berechnet die Dauer aus
  `trimOut − trimIn` (nach TASK-API-018; design.md D2). Erledigt, wenn
  Komponententests Anhängen per Doppelklick und Einfügen zwischen zwei
  Bildern abdecken und bestehende Bild-Tests unverändert grün bleiben.
- [ ] TASK-WEB-059 Player-Video-Textur: `Renderer.ts` akzeptiert
  `HTMLVideoElement` als Bildquelle, Letterbox-Cache für Video-Frames
  deaktiviert, Scrubbing-Sync (`video.currentTime` pro Zeichnen, kein
  Autoplay), stummgeschaltet (nach TASK-WEB-058; design.md D5). Erledigt,
  wenn Komponententests Wiedergabe, Suchen und einen Übergang an einer
  Video-Grenze prüfen, und ein E2E-Golden-Frame-Test eine deterministische
  Testvideo-Stelle gegen einen erwarteten Frame vergleicht.
- [ ] TASK-WEB-060 Videoclip kürzen: Eigenschaftendialog mit `trimIn`/
  `trimOut` (wie beim Musikstück-Kürzen), Validierung, Posterbild-Vorschau
  an den neuen Rändern (nach TASK-WEB-058; design.md D3). Erledigt, wenn
  Komponententests Kürzen auf einen Ausschnitt und Ablehnung eines
  ungültigen Trims abdecken.
- [ ] TASK-WEB-061 Clip → „Teilen“: Aktivierung nur bei ausgewähltem
  Videoclip innerhalb seiner Spanne, Teilen am Abspielkopf in zwei Elemente
  mit Übergangs-Vererbung (design.md D4; nach TASK-WEB-060). Erledigt, wenn
  Komponententests das Teilen-Szenario und die Deaktivierung bei einem
  Bild-Element abdecken.

## 3. Export

- [ ] TASK-RENDER-007 Export-Frame-Quelle für Video: `FrameRenderer` öffnet
  je Video-Segment einen sequentiellen FFmpeg-Dekodier-Subprozess
  (Ziel-Framerate des Qualitätsprofils) statt ein statisches JPEG zu laden;
  der bestehende Übergangs-Renderer bleibt unverändert (nach TASK-API-018;
  design.md D6). Erledigt, wenn pytest den Export eines Projekts mit einem
  Videoclip, einem Übergang an einer Video-Grenze und einem gekürzten
  Videoclip (Export beginnt nicht bei Sekunde 0 des Originals) abdeckt und
  die bestehenden Bild-Export-Tests unverändert grün bleiben.

## 4. Zeitachsen-Ansicht

- [ ] TASK-WEB-062 Zeitachsen-Ansicht: Ansicht → „Zeitachse“ schaltet eine
  Spuren-Darstellung frei (Zeitlineal, proportionale Breite, Zoom-Regler,
  Übergänge als Keil, Zieh-Griffe zum Kürzen an beiden Kanten), geteilte
  Auswahl/Wiedergabeposition mit dem Storyboard (nach TASK-WEB-061;
  design.md D7). Erledigt, wenn Komponententests Ansicht-Wechsel mit
  erhaltener Auswahl, Zoom, Zieh-Griff-Kürzen bei Video und bei Bild sowie
  die Grenzen beim Ziehen abdecken.

## 5. Abschluss

- [ ] TASK-WEB-063 Text- und Dokument-Abschluss: `de`/`en`-Texte für
  Kürzen-Dialog, Teilen und Zeitachse, README/CHANGELOG „Unreleased“ (nach
  TASK-WEB-062). Erledigt, wenn `pixi run check` grün ist.
- [ ] TASK-INFRA-020 E2E-Szenario: Playwright-Smoke erweitert um
  Video-Import → in den Bildstreifen ziehen → Kürzen → Teilen → Abspielen
  → Export; bestehende Bild-/Audio-Smoke-Szenarien bleiben unverändert grün
  (nach TASK-WEB-063 und TASK-RENDER-007). Erledigt, wenn
  `pixi run test-e2e` grün ist.
