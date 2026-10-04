## Why

Das Repo hat bisher nur ein Gerüst. Wir brauchen **schnell ein erstes
erlebbares Ergebnis**, an dem sich Look & Feel und die Übergänge beurteilen
lassen. Das Ergebnis ist eine Diashow im Stil der 2000er: Bilder laden, in den
Bildstreifen ziehen, Übergänge setzen, Play drücken. Gleichzeitig soll die
Entwicklungsumgebung reproduzierbar mit **Pixi** laufen, bevor weiterer Code
entsteht.

## What Changes

- **Pixi verwaltet das ganze Repository:** Python, Node.js, pnpm, FFmpeg,
  Biome, glslang sowie alle Python-Abhängigkeiten (Laufzeit und Dev) kommen
  über ein `pixi.toml` mit Lockfile. JavaScript-Bibliotheken bleiben bei pnpm
  (nicht über conda verfügbar). pnpm selbst und Node kommen aber aus Pixi.
  Alle Einstiegspunkte (`dev`, `check`, `test` …) sind Pixi-Tasks, CI nutzt
  Pixi. **BREAKING (Dev-Setup):** uv, `uv.lock` und das Makefile entfallen.
- **Klickbarer Prototyp der Oberfläche im Movie-Maker-2.x-Stil:** Menüleiste,
  Aufgabenbereich, Sammlungen, Vorschaumonitor und Storyboard als eigene
  Y2K-Interpretation. Funktional sind nur die Diashow-Funktionen, alles andere
  ist sichtbar, aber deaktiviert.
- **Mediensammlung:** Bilder (JPEG, PNG, WebP) importieren, per Dialog oder
  Drag & Drop. Upload ins Backend, dort Thumbnails und Vorschaubilder. Anzeigen
  und Löschen.
- **Diashow-Projekt:** Bilder per Drag & Drop in den Bildstreifen ziehen und
  umsortieren, entfernen, Anzeigedauer pro Bild. Ein Übergang pro Lücke.
  Automatisches Speichern im Backend und Wiederherstellen nach einem Reload.
- **6 klassische Übergänge** (Fade, Dissolve, Wipe, Circle, Pixelate,
  Checkerboard) als Katalogeinträge mit GLSL-Shadern. Ihre Parameter stammen
  aus den dokumentierten Movie-Maker-2.x-Definitionen.
- **Vorschau-Player:** Play, Pause, Stopp, Suchleiste und Zeitanzeige. Rendert
  Bilder und Übergänge in Echtzeit im Browser über WebGL2.
- **Minimales FastAPI-Backend:** Health, Medien, Übergangskatalog, Projekt.
  Die TS-Typen fürs Frontend werden aus OpenAPI generiert.

## Capabilities

### New Capabilities

- `dev-environment`: reproduzierbare Entwicklungsumgebung über Pixi
  (Toolchain, Abhängigkeiten, Tasks, CI-Quality-Gate)
- `app-shell`: Hauptfenster im Movie-Maker-2.x-Stil (Menüs, Aufgabenbereich,
  Sammlungen, Monitor, Storyboard) und das Y2K-Theme
- `media-library`: Bilder importieren, speichern, als Kacheln anzeigen und
  löschen
- `slideshow-project`: Bildstreifen bearbeiten (Reihenfolge, Dauern,
  Übergänge) und das Projekt speichern und laden
- `transitions`: Übergangskatalog und das sichtbare Verhalten der sechs
  MVP-Übergänge
- `preview-player`: Wiedergabe der Diashow im Vorschaumonitor

### Modified Capabilities

(keine, es gibt noch keine Specs)

## Nicht-Ziele

- Export als Videodatei (MP4/FFmpeg-Render). Folgt in einem eigenen Change.
- Videoclips, Musik, Ton, Erzählung, Titel und Abspann, Videoeffekte.
- Zeitachsenansicht (der Umschalter ist sichtbar, aber deaktiviert),
  Trimmen, AutoMovie.
- Mehrere Projekte, Benutzerkonten, Mehrbenutzerbetrieb, Deployment.
- Weitere Übergänge über die sechs hinaus, 3D- und Partikelübergänge.
- Pixelgenaue Kopie von Windows XP oder Movie Maker, Original-Assets.
- Mobile Layouts. Zielgröße ist ein Desktop-Browserfenster ab 1280×720.

## Impact

- **Neu/geändert:** `pixi.toml`, `pixi.lock`, `.github/workflows/ci.yml`,
  `backend/` (pyproject ohne uv, neue Module), `apps/web/` (komplette UI),
  `packages/catalog/`, `packages/shaders/`, `README.md`, `AGENTS.md`/`CLAUDE.md`
  (Befehle), neues `docs/adr/0002-pixi.md`.
- **Entfällt:** `Makefile`, `backend/uv.lock`, die uv-Schritte in CI und
  Dockerfile.
- **Neue Abhängigkeiten:** conda-forge (python-multipart, pillow, glslang,
  nodejs, pnpm, ffmpeg, biome), npm (@dnd-kit, zustand, openapi-typescript,
  openapi-fetch).
- **Daten:** Laufzeitdaten im Datenverzeichnis `MMY_DATA_DIR` (Standard
  `backend/.data/`, nicht versioniert).
