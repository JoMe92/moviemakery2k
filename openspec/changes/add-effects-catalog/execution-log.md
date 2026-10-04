# Execution log

<!-- nogg:mmy-9p8:2026-10-03T19:17:31Z -->
- 2026-10-03T22:24:06+00:00 — mmy-9p8 closed for TASK-CAT-006 (Bead closed at 2026-10-03T19:17:31Z).
  - implementation commits: 67993f2
  - Bead note:
    discovery (non-blocking, planning-stage spec inconsistency, not fixed here since openspec/ is read-only outside a planning session): openspec/changes/add-effects-catalog/{proposal.md,design.md} say "22 zustandslose Bild-Effekte" in prose, but design.md's own D1 decision explicitly enumerates only 21 named effects (Sepia, Negative, Posterisieren, Schwellenwert, Schwarzweiß, Helligkeit+/-, Unschärfe, Verpixeln, Film-Alterung x3, Filmkörnung, Kohlestift, Federzeichnung, Aquarell, Spiegeln h/v, Rotieren 90/180/270 = 21 items, counted twice). Independently, docs/research/movie-maker-reference.md §3 states the original has "30 in the XML"; 30 minus the 9 explicitly excluded time-dependent/speed effects (proposal.md Nicht-Ziele: Hue Cycle=1, Fade In/Out from/to Black/White=4, Ease In/Out=2, Speed Up Double/Slow Down Half=2) = 21, matching D1's enumeration exactly. This strongly suggests "22" is a planning-stage off-by-one typo, not a missing 22nd effect. TASK-CAT-006 (commit 67993f2) implemented and tested the catalog at 21 entries (matching the decision record and the source arithmetic), not the inconsistent "22" summary number. Suggest a future planning session correct "22" to "21" in proposal.md/design.md (one-word fix) - or, if a genuinely distinct 22nd stateless effect was intended and simply never named, have that planning session name it.
    
    Closing: commit 67993f2 on feat/add-effects-catalog (worktree /home/jome/src/moviemakery2k-mmy-1d6).
    Evidence:
    - pixi run gen-api -> regenerated openapi.json/schema.d.ts cleanly (EffectCatalog schema, /api/catalog/effects path).
    - pixi run typecheck-web / typecheck-backend -> clean.
    - pixi run lint-backend -> clean.
    - pixi run test-web -> 581/581 passed.
    - targeted pytest (test_catalog_file/test_catalog_api/test_effect_catalog_file/test_effect_catalog_validation/test_openapi_and_web/test_health/test_project/test_errors, non-GL) -> 122 passed, 0 unexpected.
    See the discovery note above for the 22-vs-21 catalog-count reconciliation this task's test is based on.
    Scope: startup validation + GET /api/catalog/effects + the full-catalog checks (count, excluded groups, source documentation, startup error paths). Frontend consumption of this endpoint (apiClient.ts) is TASK-WEB-065's job, not touched here.

<!-- nogg:mmy-f7y:2026-10-03T19:08:21Z -->
- 2026-10-03T22:24:06+00:00 — mmy-f7y closed for TASK-FX-009 (Bead closed at 2026-10-03T19:08:21Z).
  - implementation commits: 3ef597c
  - Bead note:
    Closing: commit 3ef597c on feat/add-effects-catalog (worktree /home/jome/src/moviemakery2k-mmy-1d6).
    Evidence:
    - pixi run check-shaders -> OK 6 transitions, OK 21 effects.
    - pixi run test-web -> 581/581 passed.
    - pixi run typecheck-backend -> clean (51 source files); typecheck-web clean.
    - pixi run lint-backend -> clean.
    - targeted non-GL pytest (catalog/schema/source-text tests) -> 27 passed, 0 unexpected.
    - All 9 golden-frame tests (test_render_stylized_effects.py) error with the same pre-existing EGL/llvmpipe gap as every other requires_gl test on this host (see discovery note on mmy-1d6) - could not execute here. Mitigated by independently re-simulating every shader's uv math (incl. a bit-for-bit PCG hash port) in plain Python before committing; this caught and fixed one real bug (Sobel test texture too narrow for the 640px-relative step, edge computed as 0 instead of 3.2) before it ever reached a commit.
    Scope: 9 catalog entries (blur, pixelate, film-age-old/older/oldest, film-grain, charcoal, pen-and-ink, watercolor) + their shaders, reusing all FX-008 infra unchanged. Catalog now has 21/22 entries; TASK-CAT-006 still owns the exact-count/reference cross-check and startup wiring.

<!-- nogg:mmy-1d6:2026-10-03T18:46:10Z -->
- 2026-10-03T22:24:06+00:00 — mmy-1d6 closed for TASK-FX-008 (Bead closed at 2026-10-03T18:46:10Z).
  - implementation commits: 7525ce0
  - Bead note:
    discovery (non-blocking, pre-existing environment, not caused by this change): this aarch64 Raspberry Pi worktree host cannot run 3 of the pixi quality-gate tools used by `pixi run check`.
    (1) `pixi run lint-web` (biome) crashes immediately on ANY input with `<jemalloc>: Unsupported system page size` / `memory allocation of 4 bytes failed`. This kernel's PAGESIZE is 16384; biome's bundled jemalloc only supports 4096. Verified host-wide (crashes linting a single untouched file too).
    (2) Every moderngl/EGL `requires_gl` test (pre-existing) fails with `eglInitialize failed (0x3001)` / `v3d: driver missing` per `pixi run check-render-env` - same failure for existing test_render_shaders.py/test_render_frames.py as for the new test_render_effects.py added here.
    (3) `pixi run test-backend` (full `pytest` in backend/) hangs indefinitely on this host; narrowed to tests/test_exports_api.py and tests/test_media_audio.py hanging (not erroring, not timing out) - pre-existing, untouched by this change.
    Worked around by running targeted pytest selections (non-GL + the new files), tsc (typecheck-web), ruff (lint-backend), and check-shaders directly - all green. Full `pixi run check` cannot be verified end-to-end on this host; CI (presumably x86_64) should be the authority for the GL golden-frame tests and lint-web.
    
    Closing: commit 7525ce0 on feat/add-effects-catalog (worktree /home/jome/src/moviemakery2k-mmy-1d6).
    Evidence:
    - pixi run check-shaders -> OK 6 transitions, OK 12 effects.
    - pixi run test-web -> 572/572 passed (incl. Renderer.test.ts effect-pass cases, effectSource.test.ts).
    - pixi run typecheck -> typecheck-web clean, typecheck-backend clean (50 source files).
    - pixi run lint-backend / lint-scripts -> clean.
    - targeted non-GL pytest (test_catalog_file/test_catalog_api/test_effect_catalog_file/test_render_effects/test_render_shaders/test_render_frames) -> 48 passed, 0 unexpected (50 GL-requiring tests ERROR identically to the pre-existing GL tests - this host's EGL/llvmpipe gap, see discovery note; cross-checked all 12 effects' expected golden-frame pixels independently in plain Python against each shader's uv formula, matching exactly).
    - pixi run lint-web (biome) and the full pixi run test-backend could not be exercised on this host (see discovery note) - not caused by this change, CI is the authority for those.
    Scope: catalog (effects.json/effects.schema.json, 12 entries), shared shader contract (effect-prelude/epilogue.glsl + packages/shaders/effects/*.glsl), Renderer.ts effect pass (2 intermediate textures + 1 FBO, skipped entirely without an effectId), FrameRenderer.apply_effect mirror in the backend. UI wiring (effect slot, "Videoeffekte" collection) is TASK-WEB-065; data-model effectId field is TASK-API-019; full 22-entry validation is TASK-CAT-006 - none of those are touched here.
