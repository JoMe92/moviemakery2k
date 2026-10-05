Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese
Change ist unabhängig von den anderen acht geplanten WMM-2.x-Lücken-Changes
und wird archiviert, sobald sie fertig ist.

## 1. Shader

- [x] TASK-FX-005 Linear-/Winkel-Wipe-Shader: ein parametrisierter Shader
  (Richtung/Winkel, `gradientSize`, optionale Keil-/Zickzack-Periode)
  verallgemeinert `wipe-right.glsl` und deckt mindestens ab: die fünf
  fehlenden Wipe-Richtungsvarianten, Split V/H, Diagonal, Rechteck, Raute,
  Balken (design.md D1). Erledigt, wenn für jeden neuen Eintrag ein
  Golden-Frame-Test die Randwerte (0/1) und einen Zwischenwert prüft, mit
  `source`-Angabe (MaskNum/GUID) wie bei den bestehenden sechs, und die
  bestehenden `wipe-right`-Tests unverändert grün bleiben.
- [x] TASK-FX-006 Polygon-Wipe-Formen: derselbe Shader (oder eine
  Erweiterung) deckt zusätzlich ab: Bow Tie V/H, Diagonal-Cross, Box-Out,
  Filled V ×4, Zig Zag V/H, Inset ×4, Fan In, Swinging Door, Windshield ×2
  (nach TASK-FX-005; design.md D1). Erledigt, wenn für jeden neuen Eintrag
  ein Golden-Frame-Test die Randwerte und einen Zwischenwert prüft.
- [x] TASK-FX-007 Radial-/Kurven-Wipe-Shader: ein parametrisierter Shader
  (`borderSoftness`, optionale `replicateX`/`replicateY`) verallgemeinert
  `circle.glsl` und deckt ab: Iris, Circles (Replicate 8×6), Wheel, Star,
  Heart, Key Hole, Eye, Sweep Diagonal/Horizontal (design.md D1). Erledigt,
  wenn für jeden neuen Eintrag ein Golden-Frame-Test die Randwerte, einen
  Zwischenwert und — für die Wiederholungs-Variante — das Kachelraster
  prüft, und die bestehenden `circle`-Tests unverändert grün bleiben.

## 2. Katalog und Oberfläche

- [x] TASK-CAT-005 Katalog-Abgleich: alle neuen Einträge in
  `packages/catalog/transitions.json` mit `source`-Angabe, Abgleich der
  Namen gegen `docs/research/movie-maker-reference.md` §3, keiner der 13
  WMTFX-Einträge enthalten (nach TASK-FX-007; design.md D2). Erledigt, wenn
  `scripts/nogg validate`-äquivalente Katalog-Validierung beim Start grün
  ist und ein Test die Gesamtzahl (> 40) sowie die Abwesenheit der
  WMTFX-Namen prüft.
- [x] TASK-WEB-064 Sammlung bei vielen Übergängen: Verifikation, dass die
  bestehende generische Katalog-Iteration alle neuen Kacheln korrekt zeigt;
  Sammlungsbereich scrollbar, wenn die Kachelzahl den sichtbaren Bereich
  übersteigt (nach TASK-CAT-005; design.md D3). Erledigt, wenn ein
  Komponententest die Kachelzahl gegen die Katalog-Größe und Scrollen samt
  weiterhin funktionierendem Drag & Drop prüft.

## 3. Abschluss

- [x] TASK-INFRA-021 Doku-Abschluss: README/CHANGELOG „Unreleased“ mit der
  neuen Übergangszahl, `docs/research/movie-maker-reference.md` um eine
  Status-Notiz ergänzt (welche Basis-/SMPTE-Übergänge umgesetzt sind, die
  13 WMTFX-Übergänge weiterhin offen) (nach TASK-WEB-064). Erledigt, wenn
  `pixi run check` grün ist.
