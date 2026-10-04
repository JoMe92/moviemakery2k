## Context

Ausgangspunkt ist das Gerüst aus dem Bootstrap: `apps/web` (Vite, React 19,
TS), `backend/` (FastAPI, bisher mit uv), `packages/{catalog,shaders}` (nur
READMEs) und ADR 0001 (Web-App + FFmpeg-Backend + geteilte GLSL-Shader). Die
Motivation steht in proposal.md. Die Recherche zum Original steht in
`docs/research/movie-maker-reference.md`.

Rahmen vom Product Owner (2026-10-02): nur Vorschau, kein Export. Sechs
klassische Übergänge. Bilder werden ins Backend hochgeladen. Die volle Shell
ist sichtbar, funktional ist nur der Kern. Pixi verwaltet alles, was über
conda-forge verfügbar ist.

Recherche zur Toolchain (Stand 2026-10-02): Pixi 0.81, `prefix-dev/setup-pixi`
v0.10. conda-forge liefert nodejs, pnpm, python, ffmpeg 9, fastapi 0.142,
uvicorn, python-multipart, pillow, pydantic, ruff, mypy, pytest, httpx, biome
2.5 und glslang. npm liefert @dnd-kit/core 6 und @dnd-kit/sortable 10 (stabil;
`@dnd-kit/react` ist noch 0.x), zustand 5 und openapi-typescript 7.

## Goals / Non-Goals

**Goals:**
- Ein Befehl (`pixi run dev`) startet den Prototyp auf einem frischen Rechner,
  der nur Pixi installiert hat.
- Die Übergangs-Shader sind von Anfang an so geschnitten, dass sie später
  unverändert im Backend-Export laufen (ADR 0001).
- Die Zeitlogik der Diashow ist eine reine, getestete Funktion. Vorschau und
  späterer Export rechnen identisch.

**Non-Goals (Design-Ebene):**
- Keine Datenbank. Medienindex und Projekt sind JSON-Dateien im
  Datenverzeichnis.
- Kein Undo/Redo, keine Mehrfachauswahl, keine Tastatur-Shortcuts außer
  Leertaste (Play/Pause) und Entf (entfernen).
- Keine Auslieferung über Docker. Das Dockerfile wird nur auf Pixi umgestellt.

## Decisions

### D1 – Pixi als einziger Einstieg, pnpm nur für npm-Pakete
`pixi.toml` im Repo-Root mit Kanal `conda-forge` und den Plattformen
`linux-64`, `osx-arm64` und `win-64`.
- `[dependencies]`: python 3.13.*, nodejs 24.* (LTS), pnpm, ffmpeg >=7,
  fastapi, uvicorn, python-multipart, pillow, pydantic.
- `[feature.dev.dependencies]`: ruff, mypy, pytest, httpx, biome, glslang.
- `[pypi-dependencies]`: `mmy-backend = { path = "backend", editable = true }`.
  `backend/pyproject.toml` bleibt die Paketdefinition, der Build-Backend wird
  `hatchling`. Pixi deckt die PyPI-Anforderungen über die conda-Pakete, es
  wird nichts doppelt installiert.
- Umgebungen: `default` (mit `dev`) für Entwicklung und CI, `prod` (ohne
  `dev`) für das Dockerfile.
- Tasks sind die einzige Befehlsschnittstelle: `install-web`, `gen-api`,
  `dev`, `dev-web`, `dev-backend`, `demo`, `lint`, `format`, `typecheck`,
  `test`, `test-e2e`, `check-shaders`, `build`, `check`. Abhängigkeiten
  laufen über `depends-on`. `dev` startet Backend und Vite parallel; erlaubt
  ist dafür die Task-Shell oder ein kleines Skript, aber kein Makefile.
- Biome kommt aus conda-forge statt aus npm, die Version ist an die
  `biome.json`-Schema-URL gekoppelt. TypeScript, Vite, React usw. bleiben in
  `package.json`/`pnpm-lock.yaml`.
- *Alternativen:* uv + volta (zwei Tools, kein FFmpeg); Nix (zu schwer);
  Biome über npm (verstößt gegen „alles in Pixi, was geht“).

### D2 – Frontend-Architektur
- **State:** ein Zustand-Store (`project`, `media`, `catalog`, `ui`,
  `playback`). Projektänderungen lösen ein entprelltes Autosave aus
  (500 ms, `PUT /api/project`).
- **Drag & Drop:** @dnd-kit/core + @dnd-kit/sortable, Pointer- und
  Keyboard-Sensor. Dateien vom Desktop kommen per nativem HTML5-Drop auf die
  Sammlung, das ist von dnd-kit getrennt.
- **API-Client:** Die Typen generiert `openapi-typescript` aus dem
  OpenAPI-Dokument des Backends (`pixi run gen-api`), Aufrufe laufen über
  `openapi-fetch`. Das generierte File ist eingecheckt. CI prüft, dass es
  aktuell ist (`gen-api` + `git diff --exit-code`).
- **Styling:** reines CSS mit Tokens (`--y2k-*`) und CSS Modules pro
  Komponente, Icons als eigene Inline-SVGs. Schriftstapel Tahoma, Verdana,
  "DejaVu Sans", sans-serif. Es wird keine Schrift mitgeliefert.
- *Alternativen:* Redux Toolkit (zu viel Zeremonie); `@dnd-kit/react`
  (noch 0.x); Tailwind (der Luna-Look braucht ohnehin eigene Verläufe und
  Rahmen); XP.css (Look zu nah am Original, eigene Interpretation gewünscht).

### D3 – Zeitmodell (überlappend, wie Movie Maker)
Bild *i* hat die Dauer `d_i`. Bild *i+1* hat optional einen eingehenden
Übergang mit der Solldauer `T_i` (der Übergang gehört zum Zielbild und wandert
beim Umsortieren mit). Effektiv gilt
`t_i = min(T_i, d_i/2, d_{i+1}/2)`, ohne Übergang ist `t_i = 0` (harter
Schnitt). Start von *i+1* = Start von *i* + `d_i − t_i`. Gesamtdauer =
`Σd − Σt`.
Eine reine Funktion `buildTimeline(project) → segments[]` liefert Abschnitte
vom Typ `still(slide)` oder `transition(from, to, transitionId, t0, t1)`.
`frameAt(timeline, t)` liefert, was zum Zeitpunkt *t* zu zeichnen ist. Beides
ist in Vitest vollständig getestet und wird später für den Export portiert.
Standardwerte: Bild 5,0 s (Bereich 0,5–60 s), Übergang 1,25 s (Bereich
0,25–5 s), Schritte von 0,25 s. Die Standardwerte von Movie Maker sind als [E]
markiert (Recherche §8).

### D4 – Renderer: WebGL2, Frame-Raum, gl-transitions-artige Schnittstelle
- Ausgabeformat des Monitors ist fest 4:3 (Canvas 640×480 logisch, skaliert
  per CSS, DPR-bewusst). Jedes Bild wird einmal per Canvas2D letterboxed auf
  schwarzen Hintergrund in eine Frame-Textur gezeichnet. Die Shader arbeiten
  dadurch nur im Frame-Raum, genau wie später der Export nach FFmpeg-Scale+Pad.
- **Shader-Vertrag** (`packages/shaders/transitions/<id>.glsl`): Die Datei
  enthält nur
  `vec4 transition(vec2 uv)` sowie die eigenen `uniform`-Parameter.
  Bereitgestellt werden `getFromColor(uv)`, `getToColor(uv)`,
  `uniform float progress` (0…1) und `uniform vec2 resolution`. Den Rahmen
  (`#version 300 es`, Präzision, `main`) setzt der Renderer davor bzw. danach.
  Das entspricht der Schnittstelle von gl-transitions und lässt sich im
  Backend mit einem Desktop-GL-Header wiederverwenden.
- Shader werden über Vite als `?raw` importiert, beim Start einmal kompiliert
  und gecacht. Ein Kompilierfehler fällt auf Fade zurück und wird geloggt.
- **Zufall deterministisch:** Dissolve nutzt einen Hash `hash(floor(uv *
  resolution) + seed)` statt `Math.random`. Gleiche Eingabe heißt gleiches
  Bild, Voraussetzung für spätere Golden Frames.
- *Alternativen:* CSS/Canvas2D-Übergänge (nicht mit dem Export teilbar);
  three.js/twgl (unnötig für zwei Texturen und ein Fullscreen-Dreieck);
  gl-transitions-Dateien direkt übernehmen (Geometrie weicht von WMM ab,
  Lizenz pro Datei; erlaubt ist nur das Schnittstellenmuster).

### D5 – Die sechs Übergänge und ihre Parameterquellen
| id | Name (UI) | Quelle | Parameter |
|---|---|---|---|
| `fade` | Überblenden | WMM-2.x-XML, DXT Fade `{16B280C5…}` | Überblendung ohne Schwarz (DXT `Overlap` = 1,0 [E]) |
| `dissolve` | Auflösen | WMM-2.x-XML `{F7F4A1B6…}` | zufällige Pixelblöcke, Blockgröße 1 px Frame-Raum [E] |
| `wipe-right` | Wischen, rechts | WMM-2.x-XML Wipe „Normal right“ | `GradientSize` 0,5, `wipeStyle` 0 |
| `circle` | Kreis | SMPTE 119 „Circle, Out, Soft“ | `BorderSoftness` 20 (Pixel bezogen auf 640 Breite [E]) |
| `pixelate` | Verpixeln | WMM-2.x-XML DXT Pixelate `{4CCEA634…}` | `MaxSquare` 50 (DXT-Standard [E]); zur Mitte max., dann zurück |
| `checkerboard` | Schachbrett | WMM-2.x-XML DXT CheckerBoard `{B3EE7802…}` „Across“ | Richtung rechts, 12×10 Felder (DXT-Standard [E]) |

Quelle: `docs/research/sources/wmm2x_builtin_from_msdn.xml` und W3C SMIL 3.0
Transitions. Werte mit [E] sind nicht am Original prüfbar (keine
Referenzinstallation) und stehen deshalb als Parameter im Katalog, damit man
sie ohne Codeänderung nachjustieren kann.

### D6 – Katalog als Datei, Backend als Auslieferer
`packages/catalog/transitions.json` plus `transitions.schema.json` (JSON
Schema 2020-12). Ein Eintrag hat `id`, `name`, `shader`, `defaultDuration`,
`params` und `source {kind, ref}`. Das Backend lädt und validiert den Katalog
beim Start (Pydantic) und liefert ihn über `GET /api/catalog/transitions`. Das
Frontend importiert die Shader-Quelltexte zur Build-Zeit, die Metadaten holt
es aber über die API. So ist das Backend die Autorität darüber, welche
Übergangs-IDs in einem Projekt gültig sind.

### D7 – Backend-Aufbau
- Module: `config` (Umgebungsvariablen `MMY_DATA_DIR`, `MMY_CATALOG_DIR`,
  `MMY_WEB_DIST`), `media` (Speicher + Bildverarbeitung), `catalog`,
  `project`, `api` (Router), `openapi` (CLI: OpenAPI als JSON ausgeben).
- **Medien:** Pillow prüft den echten Inhalt (Content-Type allein reicht
  nicht) und wendet `exif_transpose` an. Es werden gespeichert: das Original,
  ein Thumbnail (JPEG, passt in 160×120) und ein Vorschaubild (JPEG q90,
  längste Kante ≤ 1920). IDs sind UUID4 hex, Dateinamen dienen nur zur
  Anzeige und nie als Pfad. Limits: 25 MB pro Datei, 50 Dateien pro Request,
  max. 40 Megapixel (Schutz vor Decompression Bombs). Abgeleitete Bilder
  werden mit `Cache-Control: immutable` ausgeliefert.
- **Index und Projekt:** `media.json` und `project.json` im Datenverzeichnis,
  atomar geschrieben (temp + `os.replace`). Ein `asyncio.Lock` serialisiert
  die Schreibzugriffe. Die Projektdatei hat `schemaVersion: 1`.
- Beim Löschen eines Mediums entfernt das Backend auch alle Bildstreifen-
  Einträge mit diesem Medium (Kaskade), samt deren eingehenden Übergängen.
- `pixi run demo` baut die Web-App und lässt FastAPI `apps/web/dist` unter `/`
  ausliefern: ein Prozess, ein Port, gut für Vorführungen.

### D8 – Tests
- Backend: pytest mit `TestClient`, temporäres `MMY_DATA_DIR` pro Test.
- Web: Vitest für die Zeitlogik, den Store, die Autosave-Entprellung und den
  Shader-Wrapper (Stringaufbau).
- Shader: `pixi run check-shaders` setzt Header + Datei + `main` zusammen und
  prüft mit `glslangValidator` (ES 3.00, Fragment) — auch in CI.
- E2E: ein Playwright-Smoke-Test (Python-Playwright + pytest-playwright aus
  conda-forge über Pixi, Chromium, als eigener CI-Job; Entscheidung bei der
  Umsetzung, Discovery mmy-9ri). Er importiert Testbilder,
  zieht sie in den Bildstreifen, setzt einen Übergang, drückt Play und prüft
  Canvas-Pixel. Zusätzlich prüft er an den Rändern jedes Übergangs: Bei
  `progress` 0 und 1 entspricht der Frame exakt dem Von- bzw. Nach-Bild
  (einfarbige Testbilder, Testhook `?debug-progress`). Das ist der
  Golden-Frame-Anteil, der ohne Export möglich ist. Der Vergleich Vorschau ↔
  Export folgt mit dem Export-Change.

## Risks / Trade-offs

- [Pixi-Cache auf nicht eingehängtem Laufwerk (lokal beobachtet: `~/.cache`
  zeigt auf ein fehlendes Mount)] → `PIXI_CACHE_DIR` ist in der README
  dokumentiert; CI ist nicht betroffen.
- [conda-forge-`pnpm`/`nodejs` hinken npm hinterher] → Die Versionen sind in
  `pixi.toml` als Bereiche gepinnt, `packageManager` in package.json muss
  passen; ein CI-Schritt prüft `pnpm --version` gegen das Feld.
- [win-64/osx-arm64 werden nicht in CI getestet] → nur gelockt. Unterstützt
  wird Linux; andere Plattformen nach bestem Bemühen.
- [WebGL2 fehlt (alte GPU, Headless ohne GPU)] → Der Monitor zeigt einen
  Y2K-Fehlerdialog. Playwright läuft mit SwiftShader (`--use-gl=swiftshader`).
- [Große Fotos blockieren das Hochladen] → Das Backend skaliert Vorschauen
  herunter. Das Frontend lädt Dateien sequenziell mit Fortschrittsanzeige.
- [DXT-Standardwerte sind nur geschätzt (E)] → Sie stehen als Katalogparameter
  bereit und lassen sich ohne Code nachjustieren.
- [Zwei Paketmanager (Pixi + pnpm)] → bewusst: npm-Pakete gibt es nicht auf
  conda-forge. Pixi stellt pnpm bereit und ruft es nur über Tasks auf.

## Migration Plan

1. Pixi einführen, uv/Makefile entfernen, CI umstellen (zuerst, alles weitere
   baut darauf auf).
2. Backend-APIs und Katalog, danach die OpenAPI-Typen generieren.
3. Shell und Theme, dann Sammlung, Bildstreifen, Player.
Rollback: Branch-Revert; es gibt keine persistenten Nutzerdaten außer dem
lokalen Datenverzeichnis.

## Open Questions

- Der Eindruck der genauen Farbwerte und Verläufe des Y2K-Themes wird am
  laufenden Prototyp justiert; das ändert weder Specs noch Tasks.
