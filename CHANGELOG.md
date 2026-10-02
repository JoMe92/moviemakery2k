# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/JoMe92/moviemakery2k/releases/tag/v0.1.0
