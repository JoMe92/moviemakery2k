# Execution log

<!-- nogg:mmy-13q:2026-10-03T15:00:16Z -->
- 2026-10-03T22:24:06+00:00 — mmy-13q closed for TASK-INFRA-026 (Bead closed at 2026-10-03T15:00:16Z).
  - implementation commits: 04ee6e9
  - Bead note:
    Commit 04ee6e9 on feat/extend-export-profiles: adds e2e/test_export_flow.py::test_export_email_web_file_and_download (320x240, same build_project/open_wizard flow as the small/high tests, ffprobe checks resolution+duration); fixes open_wizard()'s profile radio selector (regex -> plain substring, see discovery note); updates README.md (feature bullet, wizard step 2, profile table row) and CHANGELOG.md Unreleased (save-movie bullet + three-profile bullet). Evidence: e2e/test_export_flow.py collects 3 tests incl. the new one; lint-scripts (ruff) green; manual run confirms the new test's wizard/selector logic works and only fails at the same pre-existing host GL limitation as the other two export e2e tests (see discovery note) - needs CI (x86_64) for an actual green pixi run test-e2e.

<!-- nogg:mmy-9cn:2026-10-03T14:46:43Z -->
- 2026-10-03T22:24:06+00:00 — mmy-9cn closed for TASK-WEB-070 (Bead closed at 2026-10-03T14:46:43Z).
  - implementation commits: 08d7701
  - Bead note:
    Commit 08d7701 on feat/extend-export-profiles: adds 'email_web' to exportFormat.ts PROFILES (estimated bitrate 110_000, documented as an estimate pending re-measurement via bench-export), new export.profiles.email_web / export.profileHints.* keys in de.ts/en.ts, renders the recommendation under the size in SaveMovieWizard.tsx plus a .recommendation CSS rule. Tests: exportFormat.test.ts (email_web formats smaller than both other profiles), SaveMovieWizard.test.tsx (all three radios incl. email_web, size + hint text, in both de and en). Evidence: typecheck-web green; full vitest run 530/530 green. lint-web (biome) could not run locally on this host (see discovery note) - relying on CI.

<!-- nogg:mmy-xjc:2026-10-03T14:36:02Z -->
- 2026-10-03T22:24:06+00:00 — mmy-xjc closed for TASK-API-022 (Bead closed at 2026-10-03T14:36:02Z).
  - implementation commits: 34fb5c3
  - Bead note:
    Commit 34fb5c3 on feat/extend-export-profiles: adds ExportProfile.EMAIL_WEB (320x240) to backend/src/mmy_backend/render/encode.py PROFILES table, updates ExportRequest.profile Field description in exports.py, regenerates apps/web/src/generated/{openapi.json,schema.d.ts} via pixi run gen-api. Tests: backend/tests/test_render_encode.py::test_profiles extended (3 values), new test_email_web_profile_resolution_and_file_size (GL-gated, asserts 320x240 @30fps and file size smaller than SMALL for the same project). Evidence: pixi run lint-backend/typecheck-backend green; non-GL pytest subset 53 passed (3 pre-existing GL-env failures unrelated, see discovery note). GL-gated tests (incl. the new one) could not run locally on this ARM host; rely on CI.
