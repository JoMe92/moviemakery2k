Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese
Change ändert nur die Capability `video-effects` und ist von
`add-canvas-format` unabhängig; die Begründung dazu steht in design.md D10.

## 1. Gemeinsame Rampendefinition

- [ ] TASK-RENDER-011 Rampenwert als geteilte reine Funktion
  `elementProgress(i, t) = clamp((t − start_i) / (end_i − start_i), 0, 1)`
  neben dem Zeitmodell in `apps/web/src/timeline/timeline.ts` und
  `backend/src/mmy_backend/render/timeline.py`, dazu
  `packages/fixtures/timeline-vectors.json` auf Format-Version 2 mit dem
  Rampenwert jedes beteiligten Elements je `samples`-Eintrag und ein
  nachgezogenes `packages/fixtures/README.md` (design.md D2, D3). Erledigt,
  wenn Vitest und pytest beide Fassungen gegen dieselben Vektoren prüfen und
  die Fälle ohne Übergang, mit eingehendem Übergang, mitten im Übergang
  (beide Elemente), genau auf einer Segmentgrenze, geklemmt bei 0 und bei der
  Gesamtdauer sowie ein Videoclip mit Trim darin vorkommen.

## 2. Shader-Infrastruktur

- [ ] TASK-FX-013 Uniform `elementProgress` und Test-Haken für exakte Rampen
  Das Uniform in `packages/shaders/effect-prelude.glsl`, `EffectSpec` um
  `ramp` erweitert und in `Renderer.resolveEffect` sowie im `FrameRenderer`
  bei jedem Effekt-Durchgang gesetzt, das Ergebnis des Durchgangs nicht über
  Frames hinweg wiederverwendet, der Shader-Vertrag in
  `packages/shaders/README.md` nachgezogen und der Test-Haken
  `?debug-effect=<id>:<rampe>` analog `debugProgress.ts` (nach
  TASK-RENDER-011; design.md D1, D4, D9). Erledigt, wenn
  `pixi run check-shaders` grün ist, die Golden-Frame-Tests der 21
  bestehenden Effekte unverändert bestehen und ein Test zeigt, dass der Haken
  bei zwei verschiedenen Rampenwerten zwei verschiedene Bilder liefert.

## 3. Die sieben Effekte

- [ ] TASK-FX-014 Einblenden aus und Ausblenden zu Schwarz und Weiß
  Katalogeinträge und Shader für die vier Effekte, jeweils als Mischung des
  Bildes mit Schwarz bzw. Weiß über `elementProgress` (nach TASK-FX-013;
  design.md D1). Erledigt, wenn für jeden der vier Einträge Golden Frames bei
  den Rampenwerten 0, 0,5 und 1 aus Vorschau und Export innerhalb der
  Toleranz der Spec movie-export übereinstimmen und die Randwerte genau
  Vollfarbe bzw. unverändertes Bild zeigen.
- [ ] TASK-FX-015 Langsam vergrößern, Langsam verkleinern, Farbton-Zyklus
  Katalogeinträge und Shader für den Zoom 1,0 → `zoom` bzw. `zoom` → 1,0 und
  für `cycles` volle Farbton-Umläufe, Skalierungsfaktor immer `≥ 1`, `zoom`
  und `cycles` als feste, mit `estimated` gekennzeichnete Katalogparameter
  (nach TASK-FX-013; design.md D5, D6). Erledigt, wenn für jeden der drei
  Einträge Golden Frames bei den Rampenwerten 0, 0,5 und 1 aus Vorschau und
  Export übereinstimmen und ein Test belegt, dass die abgetastete UV nie
  außerhalb von `[0, 1]` liegt.

## 4. Katalog und Oberfläche

- [ ] TASK-CAT-009 Katalog-Validierung über alle 28 Effekt-Einträge
  Alle Einträge in `packages/catalog/effects.json` mit Quelle,
  Start-Validierung des Backends, Abgleich gegen
  `docs/research/movie-maker-reference.md` §3 und ein nachgezogener
  Statushinweis in §3 (nach TASK-FX-014, TASK-FX-015; design.md D1).
  Erledigt, wenn ein Test die Gesamtzahl 28, die Anwesenheit der sieben neuen
  Einträge und die Abwesenheit von Speed Up Double und Slow Down Half prüft.
- [ ] TASK-WEB-081 Demo in der Sammlung „Videoeffekte“ läuft die Rampe ab
  Der Doppelklick führt `elementProgress` in einer Schleife von 0 auf 1 über
  2 Sekunden, für jeden Eintrag gleich, und Wiedergabe, Suchen oder eine
  Auswahl im Bildstreifen beenden die Demo wie bisher (nach TASK-CAT-009;
  design.md D8). Erledigt, wenn Komponententests die Schleife, den
  unveränderten Hinweistext, das Beenden der Demo und beide Sprachen
  abdecken.

## 5. Abschluss

- [ ] TASK-INFRA-031 E2E und Doku zu den zeitabhängigen Effekten
  Playwright setzt „Einblenden aus Schwarz“ auf ein Element, stellt die
  Vorschau auf ein Vielfaches von 1/30 s, exportiert und vergleicht dasselbe
  Frame aus Film und Vorschau gegen die Toleranz der Spec movie-export;
  README und CHANGELOG „Unreleased“ nennen die sieben Effekte (nach allen
  anderen Tasks; design.md D9). Erledigt, wenn `pixi run test-e2e` und
  `pixi run check` grün sind.
