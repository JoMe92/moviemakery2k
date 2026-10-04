# @mmy/shaders – shared GLSL programs

One shader per transition, written in **GLSL ES 3.00**. The same file runs in
the preview (WebGL2) and, later, in the export (headless GL in the backend).
That is the only way to make both look the same
([ADR 0001](../../docs/adr/0001-architecture.md), design decision D4 of the
`add-slideshow-mvp` change).

## Shader contract

A file `transitions/<id>.glsl` contains **only**:

```glsl
uniform float <param>;   // one per entry in the catalog's params, same name
vec4 transition(vec2 uv) { … }
```

The renderer assembles the program as
`prelude.glsl` + `transitions/<id>.glsl` + `epilogue.glsl`, plus `vertex.glsl`.

| Provided | Meaning |
|---|---|
| `getFromColor(uv)` / `getToColor(uv)` | Source and target picture (frame space, already letterboxed to 4:3) |
| `uniform float progress` | 0.0 … 1.0 |
| `uniform vec2 resolution` | Output size in pixels |
| `uv` | 0…1, origin at the bottom left |

Rules:

- At `progress == 0.0` the output must be exactly the source picture, at
  `1.0` exactly the target picture. The boundary golden frames in the E2E
  suite check this.
- No runtime randomness: pseudo-randomness only through deterministic integer
  hashes.
- Sizes in pixels refer to a picture width of 640 px and are scaled by
  `resolution.x / 640.0`. This keeps the values in line with Movie Maker
  (DV/NTSC width).
- Add new parameters to `packages/catalog/transitions.json` first.

## Title shaders

`title-vertex.glsl` + `title-fragment.glsl` (design.md D1–D3 of
`add-titles-and-credits`): a second, self-contained program for Canvas2D-
rasterised title/credits textures (`@mmy/fonts`). Not a transition, so not
part of the `transitions/<id>.glsl` contract above:

| Uniform | Meaning |
|---|---|
| `uTranslate` (`vec2`) | Clip-space offset of the quad's centre; 0 = centred, ±1 = one half-frame |
| `uScale` (`vec2`) | 1.0 = natural (frame-filling) size |
| `uTitle` (`sampler2D`) | The rasterised title texture |

Position and zoom per phase (Entrance/Main/Exit, each a start→end pair) are
computed by the renderer and fed in as `uTranslate`/`uScale` per draw — see
`apps/web/src/render/titlePhase.ts`. Whether the draw is opaque (a
freestanding title element) or alpha-blended over the already-drawn frame
(an overlay title) is controlled by `gl.BLEND` state at draw time, not by
this shader (design.md D2).

## Checks

`pixi run check-shaders` assembles every transition program, validates it
with `glslangValidator` (ES 3.00) and cross-checks the parameters against
the catalog; it also compiles the title vertex/fragment shaders on their
own. The task is part of `pixi run check`.
