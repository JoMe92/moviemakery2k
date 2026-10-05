# @mmy/catalog – transition, effect, title and AutoMovie catalog

The **single source of truth** for transitions, effects, titles and AutoMovie
styles.

- `transitions.json` is the transition catalog, validated by
  `transitions.schema.json`; `effects.json` is the (stateless, single-image)
  effect catalog, validated by `effects.schema.json`; `titles.json` is the
  title and credits catalog, validated by `titles.schema.json` (all JSON
  Schema 2020-12).
- A transition entry names its shader in `packages/shaders/transitions/`, an
  effect entry its shader in `packages/shaders/effects/`. Every key in
  `params` becomes a `uniform float <name>` in that shader. A title entry
  names no shader of its own: it describes a `layout`
  (`one-line`/`two-line`/`credits`), a resting `anchor`, a `fontScale` and one
  effect per phase (`entrance`, `main`, `exit`) — a `fade`, a `static` hold,
  or a `position` move between two transforms — which the shared
  `title-vertex`/`title-fragment` program renders.
- `source` documents where the parameters come from (the Movie Maker 2.x
  effect XML or the SMPTE wipe number; see
  `docs/research/sources/README.md` for links to the originals and
  [the research notes](../../docs/research/movie-maker-reference.md)).
  `estimated` lists values that cannot be verified against the original
  (**[E]**, estimated). They can be re-tuned here without any code change.
- `automovie.json` is the AutoMovie style catalog, validated by
  `automovie.schema.json`. A style adds no render technique of its own: it only
  names one `transitionId`, one optional `effectId`, one `titleStyleId` and
  whether it needs a music track. Those IDs are checked against the three
  catalogs above at startup, so a typo stops the backend instead of producing a
  broken AutoMovie.
- The backend loads and validates all four catalogs at startup and serves
  them at `GET /api/catalog/transitions`, `GET /api/catalog/effects`,
  `GET /api/catalog/titles` and `GET /api/catalog/automovie`. The reference
  XML files themselves are never served or shipped.
- `names` holds the display name per UI language; both `de` and `en` are
  required (e.g. `{ "de": "Überblenden", "en": "Fade" }`). A missing name stops
  the backend at startup.
