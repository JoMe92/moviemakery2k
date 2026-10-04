# Execution log

<!-- nogg:mmy-hmd:2026-10-03T15:20:36Z -->
- 2026-10-03T22:24:06+00:00 — mmy-hmd closed for TASK-INFRA-018 (Bead closed at 2026-10-03T15:20:36Z).
  - implementation commits: 937ef60
  - Bead note:
    Commit 937ef60 on feat/add-project-management: extended e2e/test_slideshow_flow.py with test_undo_redo_and_clipboard - add two pictures, reorder via dnd-kit keyboard drag (Enter/ArrowRight/Enter), Strg+Z undo / Strg+Y redo, select+copy+paste a picture (Strg+C/Strg+V), then reload: storyboard keeps the confirmed state (3 tiles) while Bearbeiten->Rückgängig/Wiederholen are aria-disabled again. Discovery: the keyboard-drag move step must not immediately follow the pickup key - dnd-kit's KeyboardSensor attaches its move/drop document listener via setTimeout(0) (core.esm.js attach()), so a key dispatched by Playwright right after Enter can arrive before that listener exists and silently no-ops; worked around with a 50ms wait_for_timeout between pickup/move/drop (same risk exists for any future E2E keyboard-drag test in this repo, not specific to this change). Validation on this host: pixi run build + pixi run pytest -c e2e/pytest.ini e2e/test_slideshow_flow.py green (3/3, incl. the new test); full pixi run test-e2e: 34 passed, only the 3 export/render tests + 12 export-golden tests failed/errored, all with 'kein OpenGL-Kontext... Mesa llvmpipe' - the same pre-existing aarch64 Pi GL/EGL limitation already recorded on mmy-6tj, unrelated to this diff (no backend/export files touched).

<!-- nogg:mmy-dxx:2026-10-03T15:05:20Z -->
- 2026-10-03T22:24:06+00:00 — mmy-dxx closed for TASK-WEB-055 (Bead closed at 2026-10-03T15:05:20Z).
  - implementation commits: 59b012e
  - Bead note:
    Commit 59b012e on feat/add-project-management: added menu.keys.undo/redo/cut/copy/paste in en.ts/de.ts and wired them as shortcut hints on the corresponding Edit menu items (menus.ts); added a regression test confirming Datei->Projekt öffnen…/Projekt speichern and Bearbeiten->Alles auswählen stay visible+aria-disabled (spec app-shell), plus a test for the new shortcut-hint text; updated several AppMenus.test.tsx queries from exact to regex names since items with shortcuts now concatenate label+shortcut in their accessible name. Documented the feature in README.md (Features bullet) and CHANGELOG.md (Unreleased: intro line + Added bullets for Undo/Redo and Cut/Copy/Paste). Validation: pixi run typecheck-web, test-web (553 passed, incl. i18n parity test), check-shaders, build all green on this host. pixi run check fails at the lint-web (biome) step on this aarch64 Pi before reaching typecheck/test/build — reproduced identically on bare develop (biome --version itself crashes: jemalloc 'Unsupported system page size' on this 16K-page kernel), so pre-existing and unrelated to this diff; expected to pass on CI's x86_64 runners. Also noted in passing: ./scripts/test has one pre-existing unrelated failure (nogg.test.sh: 'rec-stale-claim: claim_stale_seconds not in config'), reproduced on bare develop too — a Nogging config/test issue, not part of this OpenSpec change.

<!-- nogg:mmy-bh9:2026-10-03T14:56:34Z -->
- 2026-10-03T22:24:06+00:00 — mmy-bh9 closed for TASK-WEB-054 (Bead closed at 2026-10-03T14:56:34Z).
  - implementation commits: a3a2e1c
  - Bead note:
    Follow-up commit a3a2e1c on feat/add-project-management: same CI-caught Biome formatting fix as mmy-6tj's follow-up note, here in appStore.test.ts (three mockApi({ listMedia: ... }) calls needed to wrap onto multiple lines).

<!-- nogg:mmy-7yy:2026-10-03T14:50:41Z -->
- 2026-10-03T22:24:06+00:00 — mmy-7yy closed for TASK-WEB-053 (Bead closed at 2026-10-03T14:50:41Z).
  - implementation commits: 617ece4
  - Bead note:
    Commit 617ece4 on feat/add-project-management: ClipboardEntry (kind slide) + cut()/copy()/paste() in appStore.ts (D4/D5: paste=hard cut after selection or at end, auto-selects the new picture, one undo step; cut=copy+remove in one undo step; bare copy does not touch slides/music, so pushes no history step). Wired Edit menu + Strg+X/C/V (extended shell/globalShortcuts.ts matchShortcut and AppMenus.tsx). Tests: appStore.test.ts (copy+paste duplicate placement/no-transition/selection, cut+paste undo-step counts, paste-without-selection appends at end, paste/cut/copy no-ops), globalShortcuts.test.ts (x/c/v matching), AppMenus.test.tsx (menu+keyboard cut/copy/paste, disabled without selection/clipboard). Validation: pixi run typecheck-web, test-web (547 passed), check-shaders, build all green on this host. pixi run lint-web (biome) and backend GL-dependent render tests remain blocked by this aarch64 Pi's pre-existing environment limits (see mmy-6tj note), unrelated to this diff.

<!-- nogg:mmy-6tj:2026-10-03T14:43:00Z -->
- 2026-10-03T22:24:06+00:00 — mmy-6tj closed for TASK-WEB-052 (Bead closed at 2026-10-03T14:43:00Z).
  - implementation commits: a01349b
  - Bead note:
    Follow-up commit a01349b on feat/add-project-management: CI's pixi run check (x86_64 runner) caught real Biome formatting violations in appStore.ts (stillMusic line, undo()/redo() set() calls) that this aarch64 Pi could not catch locally (biome crashes here, see earlier note). Fixed to match Biome's exact suggested formatting; confirms the earlier local validation gap was real, not just the aarch64 jemalloc crash - always expect CI's own lint/check run to be authoritative over this host for Biome-formatted files.
