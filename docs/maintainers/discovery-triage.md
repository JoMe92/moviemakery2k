# Discovery triage log

A **discovery** is something an implementing session found but was right not
to fix in place: the wrong change, a spec that is silent, a cross-cutting
fix. `./scripts/nogg discoveries` lists the ones no planning session has
reviewed yet, and the acknowledgement that clears them
(`./scripts/nogg discoveries --ack <id> …`) is recorded in
`.nogging/state/acknowledged-discoveries.json` — which is **not** in the
repository. This file is: it records what a planning session decided about
each discovery and why, so the next person does not have to read the notes
again.

Every discovery lands in exactly one of three buckets:

| Bucket | Meaning | Outcome |
| --- | --- | --- |
| **cleared** | Already resolved, obsolete, or about one developer's host rather than the product | acknowledged; where the host limitation is still real, a line in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) |
| **defect** | A real bug that needs no spec decision | a Beads issue carrying the evidence from the note |
| **spec** | A genuine specification question | an OpenSpec change, or a correction to the change that owns the requirement |

## 2026-10-05 — 45 discoveries (mmy-v91)

The first triage of this repository. 45 discoveries had accumulated, 44 of
them on Beads that were already closed, and the mechanism had become a
write-only log. Work moved fast in the days before, so every note was
re-verified against `develop` at 2d21e00 before it was acted on; several
described a `develop` that no longer existed.

**Result: 2 new OpenSpec changes, 3 corrections to in-flight changes,
1 defect Bead, 39 discoveries cleared.**

### Spec items

| Discovery | Question | Decision |
| --- | --- | --- |
| mmy-0pz | The backend caps a title line at 200 characters (`TITLE_LINE_MAX_LENGTH`); no title field in the web app caps its input, so an over-long film title makes the autosave fail. Where does the shared limit live, and does the field truncate or block? | New change **`limit-title-text-length`**. The backend stays the single source of truth; the web app mirrors it in one constant, checked by a test against `maxLength` in the generated `openapi.json`. The field blocks further input at the limit rather than shortening text. |
| mmy-46b | "Fit movie to music" distributes the duration over all elements, but a video clip's length is its trim window and is deliberately not stretched — so with any video in the strip the movie lands *near* the music instead of on it (measured: 51.25 s against 60 s). Stretch the clips, or change the distribution? | New change **`fit-to-music-with-video-clips`**. Neither: the fit now distributes over the *stretchable* elements (pictures and titles) and keeps video clips fixed, which hits the music exactly. A strip with nothing stretchable reports the reachable duration, as the unreachable case already did. |
| mmy-0pz | Neither the spec nor design.md D2 said what an empty film title should do. | The implementing session's decision stands (no opening title at all, rather than a silent empty five-second one) and is now written into `add-automovie`'s own spec delta and design.md D2. Requiring a film title in the dialog was considered and rejected there. |
| mmy-9p8 | `add-effects-catalog` said "22 stateless image effects" in prose but enumerated 21, and the catalog shipped 21. | A planning-stage counting error, not a missing effect: 30 effects in the original XML minus the nine deliberately deferred ones is 21. Corrected to 21 everywhere in that change, with the arithmetic recorded in design.md D1. |
| mmy-z5f | design.md D2 of `add-titles-and-credits` says a freestanding title element is drawn without blending — which cannot hold while such a title fades. | The implementation's resolution (blend the title's own black-backed raster over a black-cleared frame while its phase alpha is below 1, which reproduces D1 exactly) is now part of D2. The rasterisation is unchanged. |

### Defect

| Discovery | Defect | Issue |
| --- | --- | --- |
| mmy-43e | Re-verified as still present: `SlideTile.tsx` and `MusicClipBlock.tsx` classify a press on release at `LONG_PRESS_MS` (400 ms) with no visible arm and no `onTap`, so a deliberate 400–700 ms tap on a filmstrip picture or a music clip opens its action sheet instead of selecting it. The collection sheet was fixed for exactly this (`HOLD_MS` = 1000 ms plus `data-armed`); these two tiles were deliberately left out of that Bead's scope. Raising them needs the dnd-kit `TouchSensor` activation constraint reconsidered too, since it fires at the same 400 ms. | mmy-c4r |

### Cleared — this host, not the product

Several notes describe the aarch64 Raspberry Pi the sessions run on. Only
one of them is still true.

- **Still true:** Pixi's Biome binary aborts with `jemalloc: Unsupported
  system page size` on this 16 KB-page kernel, so `pixi run lint-web` (and
  therefore `pixi run check` as a whole) cannot run here. Also still true,
  and a trap of its own: a bare `npx biome` installs the unrelated npm
  package `biome`, so earlier notes claiming "biome clean" were measuring
  nothing (mmy-30q). Both are now in CONTRIBUTING's quality-gate section
  with the working command. *(mmy-1d6, mmy-30q, mmy-3hn, mmy-3sb, mmy-9cn,
  mmy-c8q, mmy-dxx, mmy-e4e, mmy-irw, mmy-lfs)*
- **Fixed:** every note about a missing OpenGL/EGL context — failing
  `requires_gl` tests, timing-out export e2e tests, and the full
  `pixi run test-backend` appearing to hang. All were the same gap and all
  were resolved by mmy-7ok (commit 2ecec8a), which pins Mesa llvmpipe via
  `LIBGL_ALWAYS_SOFTWARE=1` in `pixi.toml`. The full backend and e2e suites,
  export included, run on this host now. *(mmy-13q, mmy-1d6, mmy-3sb,
  mmy-4h6, mmy-e9d, mmy-hmd, mmy-xjc)*
- **Retracted by its own author:** mmy-hfz first reported that `206 Partial
  Content` video responses never decode on this host, then that the gap sat
  in the WebGL texture upload. Its final note withdraws both: the defect was
  in that Bead's own player code (a seek issued on every pump tick kept the
  element below `HAVE_CURRENT_DATA`) and reproduced on CI's x86_64 runner.
  Fixed in deb2a0c. There is no aarch64 limitation for video in WebGL.

### Cleared — obsolete

- **Landing-order notes.** mmy-c8q, mmy-d8k, mmy-um6, mmy-ypk and mmy-46b
  each reported that a dependency was closed as a Bead while its code was
  still on an unmerged branch. Every one of those branches is in `develop`
  now. These notes were correct and useful on the day; they are history.
- **`scripts/test` failing on a clean `develop`** (`.nogging/config.json`
  lacks `claim_stale_seconds`): reported four times (mmy-3pa, mmy-dxx,
  mmy-e4e, mmy-nlk), filed as mmy-lel, fixed in d3ef833.
- **`mmy-fa5`, the swallowed first click after a drop** (noted on mmy-xo6):
  closed 2026-10-03, fixed by 3d3f4b2.
- **The Beads token casing in commit subjects** (mmy-6kz, mmy-ypk). The
  claim that `nogg`'s LIMBO detection cannot match these commits is no
  longer true: `LIMBO_TOKEN_RE` is `\[([A-Z][A-Z0-9]*-[0-9a-z]+)\]`, which
  matches `[MMY-6kz]` — upper-case prefix, the Beads id unchanged. That is
  the convention CONTRIBUTING and CLAUDE.md already describe; only the word
  "upper-cased" read as if the whole token were.
- **Playwright instead of `@playwright/test`** (mmy-9ri): the note asks for
  a tool name to be corrected in a change that has since been archived, and
  no specification names a test tool at all. Nothing to change.
- **The `style` commit type** (mmy-zha): correctly rejected — the
  `commit-msg` hook allows the ten Conventional Commit types CONTRIBUTING
  lists, and `style` is not among them. `chore` was the right substitute.

### Cleared — resolved in place by the session that found it

mmy-abo (the title colour missing from D5's field list; the render-path
wiring, delivered under TASK-INFRA-023; the expected `typecheck-web` ripple),
mmy-ja3 (`ImportInput` moved to the shell so a hidden collection pane cannot
swallow the import it triggered), mmy-nlk (the media-index migration, its
failure containment and ADR 0003), mmy-p1q (`packages/fonts` missing from
the Docker image; the 10 s e2e backend-startup budget), mmy-vg9 (the
`docker_export_smoke.sh` schema regression that TypeScript could not catch),
mmy-xl0 and mmy-4vb (the shared `title-fragment.glsl` overshoot bug), mmy-z5f
(the missing `uAlpha` opacity input; the wizard's step order), mmy-xo6 (the
`touch-action` fix for real-device scrolling), mmy-d8k (rebase fallout in two
tests), mmy-hmd (the dnd-kit `KeyboardSensor` timing gotcha, now in
CONTRIBUTING since it threatens any future keyboard-drag e2e test).

Closing-evidence notes with nothing to decide: mmy-4cv, mmy-4vc, mmy-5lk,
mmy-9ri, mmy-i8x, mmy-k26, mmy-lel, mmy-lfs, mmy-uxn, mmy-13q.
No note was ever recorded on mmy-bmh or mmy-edq.
