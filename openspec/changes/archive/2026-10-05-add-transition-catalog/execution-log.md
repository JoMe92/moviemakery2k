# Execution log

<!-- nogg:mmy-3hn:2026-10-03T19:27:58Z -->
- 2026-10-03T22:24:06+00:00 — mmy-3hn closed for TASK-INFRA-021 (Bead closed at 2026-10-03T19:27:58Z).
  - implementation commits: 48e159d
  - Bead note:
    Closing: commit 48e159d on feat/add-transition-catalog. Evidence: see discovery note above for the per-component pixi run check breakdown (everything green except the pre-existing, unrelated biome/ARM crash). CHANGELOG.md Unreleased/Added documents the 6->47 transition count; README.md feature bullet and Roadmap updated; docs/research/movie-maker-reference.md §3 has the implemented/open status note.

<!-- nogg:mmy-4cv:2026-10-03T19:18:00Z -->
- 2026-10-03T22:24:06+00:00 — mmy-4cv closed for TASK-CAT-005 (Bead closed at 2026-10-03T19:18:00Z).
  - implementation commits: 9cea82b
  - Bead note:
    Closing: commit 9cea82b on feat/add-transition-catalog. Evidence: pixi run check-shaders -> OK 47 transitions; pixi run test-web -> 570/570; pixi run typecheck-web/lint-backend -> clean; pytest tests/test_catalog_file/test_catalog_api/test_render_shaders (non-GL) -> 29 passed incl. the new test_catalog_grew_past_forty_without_any_wmtfx_3d_or_particle_transition; e2e/test_golden_frames.py -k for the 3 new ids -> 9 passed. Catalog: 47 entries (6 MVP + 41 Basic/SMPTE 2D wipes), count>40 and WMTFX-absence both test-enforced.

<!-- nogg:mmy-xll:2026-10-03T19:24:19Z -->
- 2026-10-03T22:24:06+00:00 — mmy-xll closed for TASK-WEB-064 (Bead closed at 2026-10-03T19:24:19Z).
  - implementation commits: d51b12b
  - Bead note:
    Closing: commit d51b12b on feat/add-transition-catalog. Evidence: pixi run test-web -> 573/573 passed (TransitionCollection.test.tsx: 11/11, 3 new in the TASK-WEB-064 describe block: tile-count-matches-catalog with the real 47-entry catalog, shared-scrollable-Pane-wrapper, and drag&drop/selection still working for the catalog's last tile); pixi run typecheck-web -> clean. No shader/catalog/production code touched (test-only bead).

<!-- nogg:mmy-5lk:2026-10-03T19:10:47Z -->
- 2026-10-03T22:24:06+00:00 — mmy-5lk closed for TASK-FX-007 (Bead closed at 2026-10-03T19:10:47Z).
  - implementation commits: 1f6c30d
  - Bead note:
    Closing: commit 1f6c30d on feat/add-transition-catalog. Evidence: pixi run check-shaders -> OK 44 transitions; pixi run test-web -> 567/567 passed; pixi run typecheck-web -> clean; pixi run lint-backend -> clean; pytest tests/test_catalog_file/test_catalog_api/test_render_shaders (non-GL) -> 28 passed; FULL e2e/test_golden_frames.py (all 44 catalog transitions, progress 0/1 + midpoint) -> 135 passed, 0 failed, 6m08s. Catalog now has 6 MVP + 11 (FX-005) + 18 (FX-006) + 9 (FX-007) = 44 transitions, all with wmm2x-xml/smpte source refs.

<!-- nogg:mmy-i8x:2026-10-03T18:50:15Z -->
- 2026-10-03T22:24:06+00:00 — mmy-i8x closed for TASK-FX-006 (Bead closed at 2026-10-03T18:50:15Z).
  - implementation commits: 4174f44
  - Bead note:
    Closing: commit 4174f44 on feat/add-transition-catalog. Evidence: pixi run check-shaders -> OK 35 transitions; pixi run test-web -> 558/558 passed; pixi run typecheck-web -> clean; pixi run lint-backend -> clean; pytest tests/test_catalog_file/test_catalog_api/test_render_shaders (non-GL) -> 28 passed; e2e/test_golden_frames.py -k for all 18 new ids -> 54 passed across two runs (24+30), 0 failed. All 18 entries carry an smpte source ref to movie-maker-reference.md §3's SMPTE MaskNums, with geometry/mapping explicitly marked estimated where the exact SMIL shape wasn't available offline.

<!-- nogg:mmy-4vc:2026-10-03T18:34:39Z -->
- 2026-10-03T22:24:06+00:00 — mmy-4vc closed for TASK-FX-005 (Bead closed at 2026-10-03T18:34:39Z).
  - implementation commits: 51758b5
  - Bead note:
    Closing: commit 51758b5 on feat/add-transition-catalog (worktree /home/jome/src/moviemakery2k-mmy-4vc). Evidence: pixi run check-shaders -> OK 17 transitions; pixi run test-web -> 540/540 passed; pixi run typecheck-web -> clean; pixi run lint-backend -> clean; targeted pytest (test_catalog_file/test_catalog_api/test_render_shaders, non-GL) -> 28 passed; e2e/test_golden_frames.py -k for the 11 new ids -> 51 passed, 0 failed (3 unrelated ERRORs in test_export_golden.py are the pre-existing host GL gap, see notes). All 11 new entries (wipe-wide-right, wipe-narrow-right, wipe-down, wipe-wide-down, wipe-narrow-down, diagonal-down-right, split-vertical, split-horizontal, rectangle, diamond, bars) carry a wmm2x-xml/smpte source ref per movie-maker-reference.md §3.
