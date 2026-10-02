# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

MP4 export of the slideshow (OpenSpec change `add-movie-export`).

### Added

- **Save movie** wizard in the Y2K style (task pane *Auf dem Computer
  speichern* and *Datei → Film speichern…*, disabled for an empty
  storyboard): file name, quality with estimated file size, progress with
  remaining time and confirmed cancel, download; errors in a dialog with
  retry.
- MP4 export with two profiles, `high` 960×720 (default) and `small`
  640×480, both 30 fps, H.264 (`libx264`, CRF 20, faststart) with a silent
  AAC track that the coming music feature will replace.
- Export renderer in the backend: headless OpenGL 3.3 through EGL and Mesa
  llvmpipe (moderngl) running the **same transition shaders** as the preview
  (only the `#version` line is swapped), pictures letterboxed like in the
  monitor, frames piped to FFmpeg, atomic `.part` → `.mp4`.
- Python port of the timeline with shared test vectors
  (`packages/fixtures/timeline-vectors.json`) checked by Vitest and pytest.
- Export API: `POST /api/exports` (snapshot of the saved project, one export
  at a time), `GET /api/exports[/{id}]`, `GET /api/exports/{id}/file`,
  `DELETE /api/exports/{id}` (cancel or delete); the last five exports are
  kept and leftovers are removed at startup.
- Readable error when no OpenGL context can be created; Linux is the
  officially supported export platform, macOS and Windows without guarantee.
- `pixi run check-render-env` (EGL/llvmpipe context, test frame, FFmpeg
  encoders) and `pixi run bench-export` (export runtime per profile).
- Tests: golden boundary frames and MP4 checks for the exporter, E2E export
  through the wizard incl. cancel, and a preview ↔ export frame comparison
  for every transition.
- Docker image can export: it ships the shaders, verifies the render
  environment during the build, and a CI job (`docker`,
  `scripts/docker_export_smoke.sh`) exports a movie from the running
  container and checks it with ffprobe.

### Changed

- Pixi dependencies `moderngl`, `glcontext` and (linux-64) `mesalib`, plus
  linux-64 activation variables that point EGL/glcontext at the
  environment's Mesa; no system packages needed.
- CI runs `pixi run check-render-env` before the quality gate.
- README and architecture overview describe the export pipeline and jobs;
  the roadmap now points at music as the next milestone.

### Fixed

- The first click on a storyboard tile right after a drop is no longer
  ignored (listed as a known limitation in 0.1.0).
- The Docker build no longer fails on a `COPY` of the non-existent
  `backend/README.md`.

## [0.1.0] – 2026-10-02

First milestone: a clickable **slideshow prototype** in the style of the
classic Movie Maker 2.x (OpenSpec change `add-slideshow-mvp`).

### Added

- Movie Maker-style main window with an original Y2K theme: menu bar with
  keyboard-operable menus, task pane, collections, preview monitor,
  storyboard and status bar (unimplemented areas visible but disabled).
- Picture import (JPEG, PNG, WebP) via file dialog or drag & drop from the
  desktop, with per-file errors, thumbnails, preview images, EXIF
  orientation and deletion with storyboard cascade.
- Storyboard: drag & drop insert and reorder (mouse and keyboard),
  double-click append, removal, picture duration dialog (0.5–60 s).
- Six transitions derived from documented Movie Maker 2.x parameters:
  Fade, Dissolve, Wipe (normal, right), Circle (SMPTE 119), Pixelate,
  Checkerboard (across) — drag onto slots, duration dialog (0.25–5 s),
  overlapping timing model as in the original.
- Real-time WebGL2 preview player: play/pause (Space), stop, previous/next
  picture, seek bar, `h:mm:ss,cc` time display, active picture highlight,
  transition demo for the selected catalog entry.
- Autosave of the project in the backend; restored after reload.
- FastAPI backend: media, transition catalog and project endpoints, OpenAPI
  with generated TypeScript types, `pixi run demo` serving UI and API from
  one process, Pixi-based Docker image.
- Shared GLSL ES 3.00 shader contract and JSON-Schema-validated transition
  catalog (single source of truth for preview and the future export).
- Pixi as the single entry point for toolchain and dependencies; CI with
  quality gate and a Playwright end-to-end job including golden-frame tests
  for every transition.
- English README, architecture overview, contributing guide and ADRs.

### Known limitations

- No video export yet (FFmpeg export is the next milestone).
- The user interface is German only.
- A click on a storyboard tile right after a drop may be ignored once.

[Unreleased]: https://github.com/JoMe92/moviemakery2k/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/JoMe92/moviemakery2k/releases/tag/v0.1.0
