# @mmy/catalog – transition, effect and title catalog

The **single source of truth** for transitions, effects (later also titles).

- `transitions.json` is the transition catalog, validated by
  `transitions.schema.json`; `effects.json` is the (stateless, single-image)
  effect catalog, validated by `effects.schema.json` (both JSON Schema
  2020-12).
- A transition entry names its shader in `packages/shaders/transitions/`, an
  effect entry its shader in `packages/shaders/effects/`. Every key in
  `params` becomes a `uniform float <name>` in that shader.
- `source` documents where the parameters come from (the Movie Maker 2.x
  effect XML or the SMPTE wipe number; see
  `docs/research/sources/README.md` for links to the originals and
  [the research notes](../../docs/research/movie-maker-reference.md)).
  `estimated` lists values that cannot be verified against the original
  (**[E]**, estimated). They can be re-tuned here without any code change.
- The backend loads and validates the catalog at startup and serves it at
  `GET /api/catalog/transitions`. The reference XML files themselves are never
  served or shipped.
- `names` holds the display name per UI language; both `de` and `en` are
  required (e.g. `{ "de": "Überblenden", "en": "Fade" }`). A missing name stops
  the backend at startup.
