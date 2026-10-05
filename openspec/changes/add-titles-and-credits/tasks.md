Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese
Change ist die sechste von neun geplanten WMM-2.x-Lücken-Changes und
nutzt Bausteine aus `add-transition-catalog` und `add-effects-catalog`
wieder, ohne deren Kataloge zu ändern.

## 1. Datenmodell

- [x] TASK-API-020 Slide-Datenmodell Version 5: neue Slide-Art `title`
  (`lines`/`creditEntries`, `styleId`, Anzeigedauer), Overlay-Feld `title`
  auf Bild-/Videoclip-Elementen, Validierung (keine Doppelbelegung, nur
  Overlay auf Bild/Video), Migration von Version 4, `gen-api` (design.md
  D5). Erledigt, wenn pytest ein Titel-Element, ein Element mit
  Overlay-Titel, die Ablehnung eines Overlays auf einem Titel-Element und
  die Migration abdeckt.

## 2. Render-Bausteine

- [x] TASK-FX-010 Web-Renderer-Bausteine: Canvas2D-Textrasterung mit
  gebündelter Schriftart „Liberation Sans“ auf alpha-erhaltendem Canvas,
  Alpha-Blend-Zeichenmodus für Overlay-Titel, Vertex-Transform-Uniform für
  Position/Zoom pro Phase (design.md D1–D3). Erledigt, wenn
  Komponententests ein freistehendes Titel-Element (opak, wie ein Bild),
  einen Overlay-Titel über einem bereits gezeichneten Bild (Blend) und
  eine Position/Zoom-Animation über die Phasen hinweg prüfen.
- [x] TASK-RENDER-008 Backend-Render-Bausteine: dieselbe Textrasterung
  (dieselbe Schriftdatei wie TASK-FX-010), derselbe Alpha-Blend- und
  Vertex-Transform-Mechanismus im `FrameRenderer` für den Export (nach
  TASK-FX-010; design.md D1–D3). Erledigt, wenn pytest denselben Frame
  (freistehender Titel, Overlay, Position/Zoom-Zwischenstand) wie die
  entsprechenden Web-Tests erzeugt (Pixel-Vergleich oder Toleranzband wie
  bei bestehenden Golden-Frame-Tests).

## 3. Katalog und Oberfläche

- [x] TASK-CAT-007 Titel-Katalog: 8 MVP-Einträge in
  `packages/catalog/titles.json` (Basic Title, Fly In, Zoom In, Subtitle,
  Fade In and Out, Fly In Fades, Scroll Up Stacked, Fade In and Out
  (Nachspann)), Start-Validierung (nach TASK-FX-010, TASK-RENDER-008;
  design.md D4). Erledigt, wenn ein Test alle 8 Einträge, ihr Layout und
  ihre Phasen-Effekte gegen die Katalog-Validierung prüft.
- [x] TASK-WEB-066 Titel-Assistent: Schritte Platzierung/Text/Stil/Farbe,
  Platzierungs-Optionen je nach aktueller Auswahl, Live-Vorschau im
  Schritt „Stil“, erzeugt ein Titel-Element oder setzt das Overlay-Feld
  (nach TASK-API-020, TASK-CAT-007; design.md D6). Erledigt, wenn
  Komponententests alle vier Platzierungen (inkl. der Einschränkung ohne
  Auswahl), die Live-Vorschau und das korrekte Einfügen bzw. Setzen
  abdecken.

## 4. Abschluss

- [ ] TASK-INFRA-023 E2E und Doku: Playwright-Smoke erweitert um einen
  Titel am Filmanfang, einen Overlay-Titel auf einem Bild und einen
  Nachspann mit Scroll; Export enthält an diesen Stellen denselben Text
  und dieselbe Animation wie die Vorschau; README/CHANGELOG „Unreleased“
  (nach TASK-WEB-066). Erledigt, wenn `pixi run test-e2e` grün ist.
