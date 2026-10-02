# 0001 – Web app + FFmpeg backend with shared GLSL shaders

- **Status:** accepted (2026-10-02)
- **Supersedes:** the KMP/Compose recommendation in
  [`docs/research/movie-maker-reference.md`](../research/movie-maker-reference.md) §5

## Context

moviemakerY2K is a small video editor in the style of Movie Maker 2.x
(Windows XP). Its focus is **transitions and effects**; everything else should
follow modern standards. Constraints set by the Product Owner: the frontend is
a small web app and the backend uses FFmpeg. Further decisions: GPL license,
an original Y2K look without any original assets, and the name moviemakerY2K.

For an effect to count as a faithful recreation, **preview and export must be
close enough to pixel-identical**. FFmpeg's built-in filters (`xfade`, `eq`,
`hue`, …) only approximate the Movie Maker effects, and they cannot express 3D
transitions (Page Curl, Flip) or particle transitions (Shatter, Whirlwind) at
all.

## Decision

1. **Monorepo** with pnpm workspaces (TypeScript) and one uv project (Python).
2. **Frontend `apps/web`:** Vite + React + TypeScript (strict), Biome, Vitest.
   The preview renders with **WebGL2**. The Y2K theme is built on CSS tokens.
3. **Backend `backend/`:** Python 3.13 + FastAPI + Pydantic v2, uv, Ruff,
   mypy (strict), pytest. FFmpeg runs **as a subprocess** (CLI) and is never linked.
4. **Render pipeline (target):** FFmpeg decodes to raw frames, headless OpenGL
   (EGL) applies the effect and transition shaders, and FFmpeg finally encodes
   to H.264/AAC. An early intermediate step may use plain FFmpeg filter graphs.
5. **Shared packages:** `packages/shaders` (GLSL ES 3.00) and
   `packages/catalog` (effect catalog) are the single source. Neither frontend
   nor backend invents its own effect definitions.
6. **API contract:** the Pydantic models are the source of truth. The OpenAPI
   schema produces the TypeScript types for the frontend (the generator was
   added later as `pixi run gen-api`).
7. **Project file:** a versioned JSON document (storyboard/timeline, clips,
   transitions, effects, titles, audio). Media files are only referenced.
8. **License:** GPL-3.0-or-later, which also permits FFmpeg built with libx264.

> uv (and the Makefile used at the time) were later replaced by Pixi, see
> [ADR 0002](0002-pixi.md).

## Consequences

- (+) One shader source for preview and export, and fidelity becomes testable
  (golden frames).
- (+) Python offers mature routes to headless GL (e.g. moderngl/EGL) and
  FFmpeg pipes.
- (−) Two languages in one repository. This is contained by the shared
  packages in `packages/` and the OpenAPI schema.
- (−) Differences between WebGL2 and desktop GL (precision, headers) require a
  small compatibility layer.
- (−) Export needs a GPU or software GL (Mesa llvmpipe) in the container.
- Some local machines only have an old FFmpeg (4.3). The target is
  **FFmpeg ≥ 7**; Pixi and the backend image provide it.

## Rejected alternatives

- **FFmpeg filter graph only:** quick to build, but cannot do 3D or particles
  and diverges from the preview.
- **Rendering in the browser (WebCodecs) without a backend:** contradicts the
  "backend with FFmpeg" requirement and is limited for codecs and audio
  mixing.
- **Node backend:** headless GL there only supports WebGL1 (headless-gl),
  which is worse for the shader pipeline.
- **KMP/Compose (earlier recommendation):** suited an Android target. The
  target is now a web app.
