# Project

## Purpose

moviemakerY2K ist ein kleiner Video-Editor im Look & Feel von Movie Maker 2.x
(Windows XP, ca. 2002–2005). Der Kern des Produkts sind die **Übergänge und
Effekte**: Sie werden nach den dokumentierten Original-Parametern
(MSDN/Vista-SDK, SMPTE/SMIL-Wipes) möglichst treu nachgebaut. Alles andere
(Architektur, Tooling, Tests, Barrierefreiheit, Sicherheit) folgt modernen
Standards.

## Product Context

- **Vorbild:** Movie Maker 2.1 (XP SP2). Workflow: Aufgabenbereich (Aufnehmen,
  Bearbeiten, Fertigstellen), Sammlungen, Vorschaumonitor, Storyboard und
  Zeitachse umschaltbar, Drag & Drop von Übergängen und Effekten auf Slots,
  Titel-Assistent, Export-Assistent.
- **Referenzkatalog 2.x:** 60 Übergänge, ca. 28–30 Videoeffekte, 43
  Titel-/Abspann-Animationen (Phasen Entrance → Main → Exit). Details:
  `docs/research/movie-maker-klon.md`.
- **Entschieden:** Name moviemakerY2K · Lizenz GPL-3.0-or-later · eigener
  Y2K-Look (an XP/Luna angelehnt, keine Original-Assets, keine pixelgenaue
  Kopie) · keine Referenzinstallation, die Treue richtet sich nach den
  dokumentierten Parametern.
- **MVP-Rahmen:** Import (Video, Foto, Musik), Storyboard/Timeline mit
  Trimmen und Teilen, ~5 Übergänge, ~5 Effekte, 3 Titelanimationen, Musikspur
  mit Pegel, MP4-Export (H.264/AAC), Projekt speichern und laden. Was genau
  hineinkommt, legen die Changes fest.

## Architecture

Abhängigkeiten und Befehle laufen über **Pixi** (`pixi.toml`, `pixi run …`);
pnpm nur für npm-Pakete, die es nicht auf conda-forge gibt.


Siehe `docs/adr/0001-architektur.md`.

- `apps/web`: Vite + React + TypeScript (strict). Die Vorschau läuft über
  WebGL2, das Y2K-Theme über CSS-Tokens.
- `backend/`: Python 3.13 + FastAPI + Pydantic v2. FFmpeg läuft nur als
  Subprozess. Export: FFmpeg-Decode → headless GL (EGL) mit den geteilten
  Shadern → FFmpeg-Encode.
- `packages/shaders`: GLSL ES 3.00, gemeinsam für Vorschau und Export.
- `packages/catalog`: Katalog der Übergänge, Effekte und Titel. Single Source
  of Truth.
- Der API-Vertrag ist Pydantic → OpenAPI → generierte TS-Typen. Die
  Projektdatei ist versioniertes JSON und referenziert Medien nur.

## Conventions

- Stable task IDs use `TASK-<AREA>-<NNN>`. Areas: `WEB`, `API`, `RENDER`,
  `FX` (Übergänge, Effekte, Titel), `CAT` (Katalog), `INFRA`.
- OpenSpec is written only in planning sessions.
- A task has one Bead mapping via namespaced labels.
- Change lifecycle: `open`, `done`, `archived`.
- Spezifikationen und Doku sind auf Deutsch, Code-Bezeichner auf Englisch.
- Jeder Effekt- oder Übergangs-Change nennt seine Quelle (XML-Parameter bzw.
  SMIL-Wipe-Nummer) und definiert einen Golden-Frame-Test.
- Keine Microsoft-Assets ausliefern. Die Dateien in `docs/research/sources/`
  sind nur Referenz.
- Quality-Gate: `pixi run check`.
