Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese Change
setzt auf `add-narration-and-audio-levels` auf (Schema-Version 6, Ton im
Export) und auf `extend-export-profiles` (drei Qualitätsprofile) und wird nach
beiden umgesetzt und archiviert; die Reihenfolge und ihre Alternative stehen in
design.md D3.

## 1. Datenmodell

- [ ] TASK-API-023 Projektmodell Schema-Version 7: Feld `canvas` mit `format` (`16:9`, `9:16`) und `background` (`black`, `white`) als Pydantic-`Literal`, andere Werte abgelehnt, Migration älterer Versionen auf Querformat 16:9 mit schwarzem Hintergrund, `gen-api` (design.md D1, D3). Erledigt, wenn pytest gültige und ungültige Werte, die Migration aus Version 6 und aus Version 1 und den Standard eines neuen Projekts abdeckt und der generierte TS-Typ beide Aufzählungen trägt.

## 2. Gemeinsame Canvas-Geometrie

- [ ] TASK-RENDER-010 Geometrie je Canvas-Format: `FRAME_ASPECT` entfällt, `canvasAspect(format)` und formatabhängige Puffergröße in `render/geometry.ts`, 1:1 gespiegelt in `render/geometry.py`; `letterbox()` beider Seiten füllt mit der Hintergrundfarbe statt fest mit Schwarz (nach TASK-API-023; design.md D2). Erledigt, wenn beide Seiten dieselbe Testwert-Tabelle fahren — je Format ein Inhalt mit nicht passendem Seitenverhältnis — und alle Maße exakt dem Seitenverhältnis entsprechen.
- [ ] TASK-FX-011 Inhaltsrechteck an die Shader: Vorschau und Export übergeben Rechteck und Pixelgröße als Uniforms, `prelude.glsl` rechnet alle Formfunktionen in einer darauf begrenzten Inhalts-UV, die Farbabtastung bleibt auf der rohen UV, bei zwei Rechtecken gilt das kleinste beide umfassende (nach TASK-RENDER-010; design.md D5). Erledigt, wenn `check-shaders` grün ist und die Randwert-Golden-Frames jedes Übergangs auch mit nicht füllendem Inhalt exakt Ausgangs- bzw. Zielbild zeigen.
- [ ] TASK-FX-012 Mittelpunkt- und Rasterübergänge auf das Inhaltsrechteck: `circle.glsl` über die Prelude-Helfer statt selbst über `resolution`, Schachbrett-Raster und die Pixelparameter (`GradientSize`, `BorderSoftness`) auf das Rechteck bezogen, Shader-Vertrag in `README.md` und `prelude.glsl` ohne 4:3 (nach TASK-FX-011; design.md D5, D9). Erledigt, wenn Golden-Frames bei 0,5 für Wischen, Kreis und Schachbrett je Format die in Spec transitions beschriebene Lage zeigen.

## 3. Export

- [ ] TASK-API-024 Profilmaße je Canvas-Format: `ProfileSpec` in `render/encode.py` von festen Maßen auf eine lange Kante (960, 640, 320) plus Ableitung je Format, Profilbeschreibung in `exports.py` nachgezogen, `gen-api` (nach TASK-API-023; design.md D6). Erledigt, wenn pytest alle drei Profile in beiden Formaten prüft (960×540/540×960, 640×360/360×640, 320×180/180×320) und alle Maße exakt dem Seitenverhältnis entsprechen, mit geraden Kanten.
- [ ] TASK-WEB-071 Assistent „Qualität“ im Canvas-Format: das Pixelmaß verlässt den Profilnamen („Hohe Qualität“ statt „Hohe Qualität (960×720)“) und erscheint als abgeleitete Angabe je Profil für das aktuelle Format, neben Größenschätzung und Empfehlungstext, in `de` und `en` (nach TASK-API-024; design.md D6). Erledigt, wenn Komponententests die drei Profile in beiden Formaten und beiden Sprachen prüfen.

## 4. Oberfläche

- [ ] TASK-WEB-072 Dialog „Filmformat“: modaler Y2K-Dialog mit den Gruppen Format (Querformat 16:9, Hochformat 9:16) und Hintergrund (Schwarz, Weiß), Vorbelegung aus dem Projekt, OK wendet an, Abbrechen lässt unverändert, dazu der Eintrag „Filmformat festlegen…“ in „2. Film bearbeiten“, Texte in `de` und `en` (nach TASK-API-023; design.md D8). Erledigt, wenn Komponententests Vorbelegung, OK, Abbrechen, Tastatur, beide Sprachen und den Eintrag samt Taskleisten-Sheet abdecken.
- [ ] TASK-WEB-073 Monitor und Layout im Canvas-Format: die 4:3-Literale in `MonitorPane.module.css` und `CompactWindow.module.css` weichen einer CSS-Custom-Property aus dem gewählten Format, die Größenbudgets je Layout-Modus bleiben (im Hochformat wird der Monitor schmaler), die 4:3-Formulierung in Spec `mobile-ui` wird nachgezogen (nach TASK-RENDER-010; design.md D7). Erledigt, wenn Tests das Seitenverhältnis je Format in allen drei Layout-Modi prüfen und nie horizontal gescrollt wird.

## 5. Abschluss

- [ ] TASK-INFRA-027 E2E und Doku: Playwright stellt Format und Hintergrund um und prüft sie nach einem Neuladen, exportiert in beiden Formaten (Maße per ffprobe) und vergleicht je Format einen Golden Frame aus Vorschau und Export mit nicht passendem Inhalt; `docs/architecture.md`, README-Abschnitt zum Filmformat und CHANGELOG „Unreleased“ (nach allen anderen Tasks; design.md D10). Erledigt, wenn `pixi run test-e2e` und `pixi run check` grün sind.
