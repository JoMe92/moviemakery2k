Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese
Change ist die fünfte von neun geplanten WMM-2.x-Lücken-Changes und wird
unabhängig von den anderen archiviert.

## 1. Datenmodell

- [ ] TASK-API-019 Slide-Datenmodell Version 4: `effectId` (Katalog-ID oder
  `null`) auf jedem Element, Validierung gegen den Effekt-Katalog, Migration
  von Version 3 (`effectId: null`), `gen-api` (design.md D3). Erledigt, wenn
  pytest die Migration, die Ablehnung einer unbekannten Effekt-ID und ein
  Projekt mit gemischten Bild-/Videoclip-Elementen mit und ohne Effekt
  abdeckt.

## 2. Shader

- [ ] TASK-FX-008 Effekt-Rendering-Infrastruktur und einfache Effekte: ein
  Ein-Textur-Programm-Typ (Zwischentextur/zusätzliches Framebuffer-Objekt
  in `Renderer.ts` und `FrameRenderer`), Katalogeinträge und Shader für
  Sepia, Negative, Posterisieren, Schwellenwert, Schwarzweiß, Helligkeit+,
  Helligkeit−, Spiegeln horizontal, Spiegeln vertikal, Rotieren 90°/180°/270°
  (design.md D1, D2). Erledigt, wenn für jeden Eintrag ein Golden-Frame-Test
  das erwartete Bild bei einem bekannten Eingabebild prüft und ein Test
  zeigt, dass ein Element ohne `effectId` unverändert bleibt.
- [ ] TASK-FX-009 Stilisierte Effekte: Unschärfe, Verpixeln, Film-Alterung
  Alt/Älter/Am ältesten, Filmkörnung, Kohlestift, Federzeichnung, Aquarell
  (nach TASK-FX-008; design.md D1). Erledigt, wenn für jeden Eintrag ein
  Golden-Frame-Test das erwartete Bild bei einem bekannten Eingabebild
  prüft.

## 3. Katalog und Oberfläche

- [ ] TASK-CAT-006 Katalog-Validierung: alle 22 Einträge in
  `packages/catalog/effects.json` mit Quelle, Start-Validierung, Abgleich
  gegen `docs/research/movie-maker-reference.md` §3 (nach TASK-FX-009).
  Erledigt, wenn ein Test die Gesamtzahl (22) und die Abwesenheit der
  zeitabhängigen und Geschwindigkeits-Effekte (Fade/Ease/Hue Cycle/Speed)
  prüft.
- [ ] TASK-WEB-065 Effekt-Platz und Sammlung „Videoeffekte“: Ziehen aus der
  neuen Sammlung auf den Kachel-Effekt-Platz, Kontextmenü „Keinen Effekt“,
  Effekt-Symbol auf der Kachel, Aufgabenbereich-Eintrag „Videoeffekte
  anzeigen“ aktiv, Sammlung mit Doppelklick-Demo am Beispielbild (nach
  TASK-API-019, TASK-CAT-006; design.md D4). Erledigt, wenn
  Komponententests Effekt setzen, Effekt entfernen, die Demo in der
  Sammlung und das Effekt-Symbol auf der Kachel abdecken.

## 4. Abschluss

- [ ] TASK-INFRA-022 E2E und Doku: Playwright-Smoke erweitert um Effekt auf
  ein Element setzen → Vorschau zeigt ihn → Export enthält denselben Effekt
  an dieser Stelle; README/CHANGELOG „Unreleased“ (nach TASK-WEB-065).
  Erledigt, wenn `pixi run test-e2e` grün ist.
