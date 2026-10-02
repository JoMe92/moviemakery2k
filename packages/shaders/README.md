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

## Checks

`pixi run check-shaders` assembles every program, validates it with
`glslangValidator` (ES 3.00) and cross-checks the parameters against the
catalog. The task is part of `pixi run check`.
