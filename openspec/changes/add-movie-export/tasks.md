Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Die
Golden-Frame-Prüfung Vorschau ↔ Export (design.md D7) ist hier zum ersten Mal
möglich; die sechs Übergänge behalten ihre Quellen aus `add-slideshow-mvp`.

## 1. Infrastruktur

- [ ] TASK-INFRA-005 Spike und Abhängigkeiten: `moderngl` und `glcontext` (alle Plattformen) sowie `mesalib` (nur linux-64) in die Pixi-Umgebungen `default` und `prod` aufnehmen, `pixi.lock` aktualisieren; nachweisen, dass `moderngl.create_context(standalone=True, backend="egl")` ohne Display und ohne Systempakete einen llvmpipe-Kontext liefert und dass das FFmpeg der Umgebung die Encoder `libx264` und `aac` hat (design.md D1, D8). Erledigt, wenn ein Pixi-Task `check-render-env` lokal und in CI den Renderer-String (llvmpipe) und beide Encoder ausgibt; scheitert der EGL-Nachweis, wird eine blockierende Discovery gemeldet.
- [ ] TASK-INFRA-006 Dokumentation: README (Export-Abschnitt, Plattformhinweis), `docs/architecture.md` (Render-Pipeline, Export-Jobs) und CHANGELOG-Abschnitt „Unreleased“ ergänzen; Dockerfile prüfen, dass das `prod`-Image exportieren kann (nach TASK-API-007, TASK-WEB-013). Erledigt, wenn die Doku den Ablauf aus design.md D4/D5 beschreibt und ein Export im Docker-Container (`docker run` + `curl` auf die Export-API) eine abspielbare MP4 erzeugt.

## 2. Zeitmodell

- [ ] TASK-CAT-002 Gemeinsame Testvektoren `packages/fixtures/timeline-vectors.json` für das Zeitmodell anlegen (Gesamtdauer 12,50 s, Übergang länger als erlaubt, ein einziges Bild, Bilder ohne Übergang, Abfrage mitten im Übergang und an Segmentgrenzen) und die bestehende TS-Implementierung per Vitest dagegen prüfen. Erledigt, wenn Vitest alle Vektoren grün prüft und ein absichtlich falscher Vektor den Test rot macht.
- [ ] TASK-RENDER-001 Zeitmodell als reine Python-Funktionen portieren (`mmy_backend/render/timeline.py`: Segmente, Zeit → Standbild/Übergang mit Fortschritt, Anzahl Bilder `ceil(Dauer · fps)`) (nach TASK-CAT-002). Erledigt, wenn pytest dieselben Vektoren wie Vitest grün prüft und mypy strict sauber ist.

## 3. Render-Pipeline

- [ ] TASK-RENDER-002 Shader-Lader im Backend: Fragment-Quelle wie `shaderSource.ts` aus Prelude, Body und Epilogue bauen, genau eine Ersetzung `#version 300 es` → `#version 330 core`, Vertex-Shader und Vollbild-Dreieck spiegeln, Rückfall auf `fade`, Uniforms `uFrom`/`uTo`/`progress`/`resolution` plus Katalogparameter setzen (nach TASK-INFRA-005; design.md D2). Erledigt, wenn pytest alle sechs Übergangsprogramme unter llvmpipe kompiliert und ein fehlender Shader auf `fade` zurückfällt.
- [ ] TASK-RENDER-003 Frame-Renderer: Vorschaubild laden, ganzzahliges `containRect` wie im Browser auf Schwarz, Textur mit Ursprung unten links, Standbild und Übergang zeichnen, RGBA auslesen und vertikal spiegeln; höchstens zwei Bildtexturen gleichzeitig (nach TASK-RENDER-001, TASK-RENDER-002; design.md D4). Erledigt, wenn pytest für jeden der sechs Übergänge die Randwert-Golden-Frames (rot bei `progress` 0, blau bei 1, Mitte verschieden) und ein Hochkant-Bild mit schwarzen Balken prüft.
- [ ] TASK-RENDER-004 Kodierung: Frames per Pipe an FFmpeg (`rawvideo` RGBA, 30 fps) mit stummer Tonspur über einen eigenen Eingang (`anullsrc`, AAC 48 kHz Stereo), `libx264` yuv420p mit `+faststart`, Profile `high` 960×720 und `small` 640×480, Fortschritts-Callback, Abbruch beendet FFmpeg und löscht die Teildatei, Ausgabe zuerst als `.part` und dann atomar umbenannt (nach TASK-RENDER-003; design.md D4). Erledigt, wenn pytest per ffprobe Codecs, Auflösung, fps und Dauer (3 Bilder, 2 Übergänge: Zeitmodell ± 1 Bild) prüft, ein Mittelbild per PSNR > 35 dB gegen den Roh-Frame vergleicht und die Laufzeit für 12 Bilder à 5 s bei beiden Profilen im Testprotokoll steht.

## 4. Backend-API

- [ ] TASK-API-006 Export-Jobs: `POST /api/exports` (Profil, Dateiname; Schnappschuss des gespeicherten Projekts, Medienprüfung, leeres Projekt → 422, laufender Export → 409), `GET /api/exports/{id}` (Status, Fortschritt, Fehler), `GET /api/exports/{id}/file` (nur bei `done`, `Content-Disposition`), `DELETE /api/exports/{id}` (Abbrechen bzw. Löschen); Rendern im eigenen Thread mit eigenem GL-Kontext, fehlender GL-Kontext → `failed` mit verständlicher Meldung (nach TASK-RENDER-004; design.md D5). Erledigt, wenn pytest Start, Statusfolge, Download, 409, 422, Abbruch ohne Teildatei, „Datei vor dem Ende“ und den Schnappschuss (Projektänderung während des Exports) abdeckt.
- [ ] TASK-API-007 Aufbewahrung und Vertrag: höchstens 5 fertige Exporte behalten, verwaiste `.part`-Dateien beim Start entfernen, Pydantic-Modelle der Export-API in OpenAPI aufnehmen und `pixi run gen-api` ausführen (nach TASK-API-006). Erledigt, wenn pytest Aufbewahrung und Aufräumen beim Start abdeckt und `pixi run gen-api && git diff --exit-code` sauber ist.

## 5. Oberfläche

- [ ] TASK-WEB-012 Assistent „Film speichern“: modaler Y2K-Dialog mit den Schritten Dateiname (Vorgabe „Mein Film“, Prüfung der unerlaubten Zeichen), Qualität (Optionsfelder, geschätzte Dateigröße), Fortschritt (Prozent, Restzeit, Abbrechen mit Rückfrage, Abfrage alle 500 ms) und Fertig (Download); Fehlerdialog mit „Erneut versuchen“; Tastaturbedienung und Fokusfalle (nach TASK-API-007; design.md D6). Erledigt, wenn Komponententests mit gemocktem Client den Standarddurchlauf, ungültige Dateinamen, Abbrechen vor und während des Exports und den Fehlerfall abdecken.
- [ ] TASK-WEB-013 Einstiege freischalten: Aufgabenbereich „Auf dem Computer speichern“ und Datei → „Film speichern…“ öffnen den Assistenten und sind bei leerem Bildstreifen deaktiviert (`aria-disabled`); „Im Web veröffentlichen“ bleibt deaktiviert (nach TASK-WEB-012). Erledigt, wenn Komponententests beide Einstiege mit und ohne Bilder im Bildstreifen abdecken.

## 6. End-to-End

- [ ] TASK-WEB-014 E2E und Kreuzvergleich: Ablauf Import → Bildstreifen → Übergang → Assistent → Download (ffprobe prüft Profil „Kleine Datei“, Dauer und Spuren) sowie Golden Frames Vorschau ↔ Export für alle sechs Übergänge bei `progress` 0,5 (Browser über `?debug-progress`, Backend-Renderer direkt aus pytest; Toleranz je Kanal ≤ 2 bei ≥ 99,5 % der Pixel) (nach TASK-WEB-013; design.md D7). Erledigt, wenn `pixi run test-e2e` lokal und im CI-Job `e2e` grün ist.
