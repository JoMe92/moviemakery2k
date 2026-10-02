## Context

Stand nach 0.1.0 (`add-slideshow-mvp`, archiviert): Bilder importieren,
Bildstreifen mit sechs Übergängen, Echtzeit-Vorschau über WebGL2, Autosave.
Die Shader in `packages/shaders` folgen bereits einem Vertrag (Prelude,
Body, Epilogue; Uniforms `uFrom`, `uTo`, `progress`, `resolution` plus
Katalogparameter), der für den Export gedacht war (ADR 0001). Das Zeitmodell
liegt als reine Funktion in `apps/web/src/timeline/timeline.ts`.

### Lückenanalyse gegenüber Movie Maker 2.1

Grundlage: `docs/research/movie-maker-reference.md` und die aktuellen Specs.

| Bereich | Original 2.1 | 0.1.0 | Priorität |
|---|---|---|---|
| Film fertig stellen (Export) | Assistent „Film speichern“, Profile | fehlt | **1 – dieser Change** |
| Musik / Audio | Audio- und Musikspur, Pegelregler Ton ↔ Musik | fehlt | 2 |
| Videoclips | Import, Clip-Erkennung nach Szenen | nur Bilder | 3 |
| Zeitachse | Spuren, Zoom, Trimmen, Teilen | nur Storyboard | 3 |
| Videoeffekte | ca. 28–30 | keine (Slot deaktiviert) | 4 |
| Titel und Abspann | 43 Animationen, Titel-Assistent | fehlt | 5 |
| Übergänge | 60 | 6 | 6 |
| Projekte | Speichern/Laden als Datei | ein Projekt, Autosave | 6 |
| Sonstiges | Erzählung, AutoMovie, Schnappschuss | fehlt | später |

Begründung der Reihenfolge: Erst der Export macht aus dem Prototyp ein
Werkzeug, und er validiert die Shader-Pipeline, auf der alle späteren
Übergänge und Effekte aufbauen. Bilder plus Musik ist der klassische
Movie-Maker-Anwendungsfall, darum folgt die Musik direkt danach.

### Vorgaben des Product Owners (2026-10-02)

- Nächster Change ist der Export allein; Musik folgt als eigener Change.
- Format 4:3 mit den Profilen 640×480 und 960×720.
- Bedienung über einen Assistenten im Y2K-Stil.

Technische Vorklärung durch den `architect` (2026-10-02, per `pixi search`
geprüft): moderngl 5.12, glcontext 3.0 und mesalib 26.2 gibt es auf
conda-forge für linux-64, osx-arm64 und win-64; `libegl`/`libglvnd` nur für
linux-64; `libosmesa` gar nicht. Das gesperrte FFmpeg 9.0.2 ist die
`gpl`-Variante. Nicht geprüft: ob der Mesa-EGL-ICD aus conda-forge ohne
Systempakete einen Kontext ohne Display liefert, und ob `libx264` und `aac`
im FFmpeg-Build enthalten sind. Beides klärt TASK-INFRA-005 vorab.

## Goals / Non-Goals

**Goals:**
- Ein exportierter Film zeigt dieselben Bilder, Dauern und Übergänge wie die
  Vorschau; Abweichungen sind messbar (Golden Frames, Dauer).
- Die Shader-Dateien werden für den Export nicht verändert oder dupliziert.
- Die Tonspur ist als eigener FFmpeg-Eingang angelegt, damit der Musik-Change
  nur diesen Eingang austauscht.
- Export läuft in CI (ubuntu-latest ohne GPU) und im Docker-Image.

**Non-Goals (Design-Ebene):**
- Keine Job-Warteschlange über Neustarts hinweg; Jobs leben im Speicher.
- Kein Streaming des Films während des Renderns.
- Keine Optimierung für Projekte mit Hunderten von Bildern über das
  Speicherlimit in D5 hinaus.

## Decisions

### D1 – headless GL: moderngl über EGL mit Mesa llvmpipe; offiziell nur Linux
`moderngl.create_context(standalone=True, backend="egl")` mit `mesalib` als
Pixi-Abhängigkeit nur für linux-64. Linux ist die offiziell unterstützte
Plattform für den Export (CI, Docker-Image, Pi). Unter macOS und Windows nutzt
moderngl den nativen Kontext (CGL/WGL) ohne Gewähr; schlägt die
Kontexterstellung fehl, meldet der Export einen verständlichen Fehler statt
abzustürzen.
*Alternativen:* PyOpenGL + EGL (mehr Boilerplate, kein Mehrwert); OSMesa (auf
conda-forge nicht verfügbar); FFmpeg-Filtergraph mit `xfade` (verworfen in
ADR 0001, weicht von der Vorschau ab).

### D2 – Shader-Wiederverwendung über genau eine Header-Ersetzung
Das Backend baut die Fragment-Quelle wie `apps/web/src/render/shaderSource.ts`
(Prelude + Body + Epilogue) und ersetzt nur die erste Zeile `#version 300 es`
durch `#version 330 core`. `precision`-Zeilen sind in 330 erlaubt. Der
Vertex-Shader und das Vollbild-Dreieck ohne Vertex-Buffer werden gespiegelt,
ebenso der Rückfall auf `fade` bei fehlendem Shader. Ein Test kompiliert alle
sechs Programme unter llvmpipe.
*Alternative:* GLES-3.0-Kontext über EGL (Quelle byte-identisch), aber moderngl
unterstützt GLES nur unzuverlässig.

### D3 – Zeitmodell doppelt, abgesichert durch gemeinsame Testvektoren
`buildTimeline`/`frameAt` bleiben in TypeScript für die Vorschau und werden als
reine Funktionen nach Python portiert (`mmy_backend/render/timeline.py`).
Beide werden gegen dieselbe Datei
`packages/fixtures/timeline-vectors.json` geprüft (Eingabe-Projekte,
erwartete Segmente, Zuordnung Zeit → Bild/Übergang/Fortschritt an
Stützstellen). Vitest und pytest lesen die Datei.
*Alternative:* Zeitmodell nur im Backend; verworfen, weil die Wiedergabeuhr
dann vom Netzwerk abhinge.

### D4 – Frame-Erzeugung und Kodierung
- Eingabe ist das vorhandene `media/<id>/preview.jpg` (EXIF-normalisiert,
  längste Kante ≤ 1920). Es wird mit derselben ganzzahligen
  `containRect`-Rechnung wie im Browser auf Schwarz eingepasst und als Textur
  hochgeladen (Ursprung unten links wie `UNPACK_FLIP_Y`).
- Bild n liegt bei `t = n / fps`; Anzahl der Bilder `ceil(Gesamtdauer · fps)`.
- Standbilder werden ohne Shader gezeichnet, Übergänge mit dem Shader des
  Katalogeintrags und dessen Parametern.
- Rückgabe als RGBA an `ffmpeg -f rawvideo -pix_fmt rgba -s WxH -r 30 -i -`
  plus `-f lavfi -i anullsrc=r=48000:cl=stereo -shortest`, Kodierung
  `libx264 -preset medium -crf 20 -pix_fmt yuv420p -profile:v high
  -movflags +faststart`, Audio `aac -b:a 128k`. Die vertikale Spiegelung
  passiert beim Auslesen.
- Profile: `high` 960×720 (Standard), `small` 640×480, beide 30 fps.

### D5 – Export-Jobs
- `POST /api/exports` mit `{profile, fileName}` → `202 {id, status}`. Der
  Server nimmt einen Schnappschuss des gespeicherten Projekts und prüft die
  Medienreferenzen. Leeres Projekt → `422`.
- `GET /api/exports/{id}` → `{status: queued|running|done|failed|cancelled,
  progress 0..1, error?}`. Das Frontend fragt alle 500 ms ab (kein SSE).
- `GET /api/exports/{id}/file` → MP4 mit `Content-Disposition` und dem
  gewünschten Dateinamen.
- `DELETE /api/exports/{id}` bricht ab (FFmpeg-Prozess beenden, Teildatei
  löschen) bzw. löscht ein Ergebnis.
- Rendern in einem eigenen Thread (`asyncio.to_thread`); GL-Kontext wird im
  selben Thread erzeugt und benutzt. Höchstens ein laufender Export; ein
  zweiter Start während eines laufenden Exports → `409`.
- Ablage unter `MMY_DATA_DIR/exports/<id>/`, zuerst `out.mp4.part`, dann
  atomar umbenannt. Behalten werden die letzten 5 fertigen Exporte; beim
  Start werden Teildateien entfernt.
- Speicher: Es liegen höchstens die Texturen des aktuellen und des nächsten
  Bildes im GPU-Speicher.

### D6 – Assistent im Y2K-Stil
Modaler Dialog mit Schritten und den Schaltflächen „Zurück“, „Weiter“,
„Abbrechen“ wie im Original:
1. **Dateiname:** Vorgabe „Mein Film“; unerlaubte Zeichen (`/\:*?"<>|`)
   werden abgelehnt, `.mp4` wird angehängt.
2. **Qualität:** Optionsfelder „Hohe Qualität (960×720)“ (vorausgewählt) und
   „Kleine Datei (640×480)“ mit geschätzter Dateigröße aus Dauer und Profil.
3. **Film wird gespeichert:** Fortschrittsbalken in Prozent, verbleibende Zeit
   geschätzt, Schaltfläche „Abbrechen“ mit Rückfrage.
4. **Fertig:** „Film herunterladen“ startet den Download; „Fertig stellen“
   schließt den Assistenten.
Fehler (Backend, Render, FFmpeg) zeigt der Assistent als Y2K-Dialog mit der
Möglichkeit, es erneut zu versuchen. Ist der Bildstreifen leer, sind
Aufgabenbereich-Eintrag und Menüeintrag deaktiviert.

### D7 – Golden Frames Vorschau ↔ Export
- **Unit (pytest):** Randwert-Frames bei `progress` 0 und 1 für jeden Übergang
  (rot → blau, exakt wie in der Vorschau) und Mitte ≠ beiden Enden.
- **Kreuzvergleich (E2E):** Für jeden der sechs Übergänge bei `progress` 0,5
  ein Bild aus dem Browser (`?debug-progress`, SwiftShader) und eines aus dem
  Backend-Renderer (direkt aus pytest aufgerufen) mit denselben Eingaben.
  Toleranz: Abweichung je Kanal ≤ 2 bei mindestens 99,5 % der Pixel. Exakte
  Gleichheit zwischen SwiftShader und llvmpipe ist nicht realistisch.
- **Integration:** Export eines Projekts mit drei Bildern und zwei
  Übergängen; ffprobe prüft H.264 + AAC, 640×480, Dauer = Zeitmodell ± 1 Bild;
  ein Bild mitten im Übergang aus dem MP4 gegen den Roh-Frame (PSNR > 35 dB).

### D8 – Abhängigkeiten und Auslieferung
`moderngl` und `glcontext` als Laufzeitabhängigkeiten aller Plattformen,
`mesalib` als Zielabhängigkeit für linux-64, jeweils in den Umgebungen
`default` und `prod`. Das Docker-Image (Pixi-Umgebung `prod`) bringt damit
llvmpipe mit. Falls der conda-ICD nicht gefunden wird, ist der dokumentierte
Ausweg `__EGL_VENDOR_LIBRARY_DIRS` auf das Pixi-Verzeichnis bzw. als letzte
Möglichkeit `apt install libegl-mesa0` in CI und Dockerfile.

## Risks / Trade-offs

- **EGL/llvmpipe aus conda-forge funktioniert nicht ohne Systempakete** →
  TASK-INFRA-005 ist ein Spike vor allen Render-Tasks; schlägt er fehl, wird
  das als blockierende Discovery gemeldet und neu geplant.
- **Präzisionsunterschiede SwiftShader ↔ llvmpipe** (Kanten bei Pixelate und
  Checkerboard) → Toleranz in D7; Abweichungen darüber hinaus sind Fehler.
- **Zeitmodell driftet zwischen TS und Python** → gemeinsame Vektoren mit
  Grenzfällen (Übergang länger als erlaubt, ein Bild, kein Übergang).
- **Laufzeit mit llvmpipe** (geschätzt, nicht gemessen: 12 Bilder à 5 s bei
  640×480 unter 15 s, bei 960×720 etwa doppelt) → Fortschritt und Abbrechen
  im Assistenten; Messung als Teil von TASK-RENDER-004.
- **macOS/Windows** → nur ohne Gewähr (D1); klare Fehlermeldung.

## Migration Plan

Keine Datenmigration: Das Projektschema bleibt bei `schemaVersion` 1, Exporte
liegen in einem neuen Unterverzeichnis. Rollback = Change zurücknehmen;
`MMY_DATA_DIR/exports/` kann gelöscht werden.

## Open Questions

- Keine offenen Fragen des Product Owners. Die Plattformfrage (D1) ist mit
  „Linux offiziell, macOS/Windows ohne Gewähr“ entschieden und kann bei
  Bedarf in einem späteren Change erweitert werden.
