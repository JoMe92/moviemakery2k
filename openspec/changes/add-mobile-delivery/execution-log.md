# Execution log

<!-- nogg:mmy-5tp:2026-10-03T21:43:05Z -->
- 2026-10-03T22:24:06+00:00 — mmy-5tp closed for TASK-WEB-051 (Bead closed at 2026-10-03T21:43:05Z).
  - implementation commits: a85f65b
  - Bead note:
    evidence: commit a85f65b. apps/web/src/export/share.test.tsx (14 tests, fake ShareEnv): available (preparing disabled + 'Wird vorbereitet…', then enabled, share with File 'Mein Film.mp4' video/mp4, download unchanged), English label, not shown when insecure / no canShare / canShare false / throws (no fetch), too large by Content-Length and by blob size, load failure, exactly 200 MB allowed, AbortError silent, other error alert + download stays, abort on leaving. Web 793 tests + tsc green.

<!-- nogg:mmy-6xr:2026-10-03T09:31:40Z -->
- 2026-10-03T22:24:06+00:00 — mmy-6xr closed for TASK-WEB-049 (Bead closed at 2026-10-03T09:31:40Z).
  - implementation commits: 6943c63, ff74802
  - Bead note:
    evidence: commits 6943c63 (deps) and ff74802 on feat/add-mobile-delivery. apps/web/pwa.config.test.ts: prompt/generateSW/manual registration, no runtimeCaching, globPatterns without api, navigateFallbackDenylist matches /api, /api/... and not /apiary, MMY_PWA=off -> selfDestroying. src/pwa/serviceWorker.test.ts: registers only with prod+secure+supported (insecure, dev, unsupported, real Vitest env do not), onNeedRefresh -> reload calls updateSW(true). UpdateNotice.test.tsx: hidden/shown, Reload, de+en. Web 541 tests + tsc green; build precaches 12 shell entries, sw.js has no /api route. E2E subset (slideshow, language, document lang; 10 tests) green with the worker active on 127.0.0.1.

<!-- nogg:mmy-ypk:2026-10-03T21:36:01Z -->
- 2026-10-03T22:24:06+00:00 — mmy-ypk closed for TASK-WEB-050 (Bead closed at 2026-10-03T21:36:01Z).
  - implementation commits: 2127059, f8eb46e
  - Bead note:
    discovery (2026-10-03, add-mobile-delivery session): Beads dependency on add-mobile-layout is closed, but that code is not on origin/develop (branch feat/add-mobile-layout is unpushed, only in the worktree moviemakery2k-mmy-3pa). This task needs the compact shell (title bar state / taskbar sheet), so it cannot be built on feat/add-mobile-delivery without merging unintegrated work of another session. Unblock once add-mobile-layout is merged into develop; then merge develop into feat/add-mobile-delivery and continue.
    evidence: commit 2127059. apps/web/src/pwa/install.test.tsx (12 tests, fakes for isSecureContext, matchMedia display-mode, navigator.standalone, beforeinstallprompt/appinstalled): availability rules, env detection, Android prompt (accepted hides entry, dismissed keeps it), iOS instructions, wide: Extras menu item + Finish task, iOS dialog de/en, Android path without dialog, absent over HTTP and in standalone; compact: entry in the '3. Fertig stellen' taskbar sheet opens the dialog. Web 779 tests + tsc green.
    correction: the evidence note above names 2127059 by mistake (the commit hook had rejected the first attempt). The WEB-050 commit is f8eb46e, pushed. discovery: the shared .git/hooks commit-msg hook changed during this session (uncommitted Nogging update in the shared checkout) and now requires a lower-case bead id token, e.g. [MMY-ypk]; the CLAUDE.md convention says upper-case [MMY-YPK]. Earlier commits on this branch use upper-case.

<!-- nogg:mmy-gc8:2026-10-03T09:24:25Z -->
- 2026-10-03T22:24:06+00:00 — mmy-gc8 closed for TASK-WEB-048 (Bead closed at 2026-10-03T09:24:25Z).
  - implementation commits: 857bc0b
  - Bead note:
    evidence: commit 857bc0b on feat/add-mobile-delivery. backend/tests/test_web_manifest.py (5 tests): manifest fields vs spec incl. theme/background colour = theme.css tokens, every manifest icon exists in its declared size (PNG via Pillow, SVG), maskable + apple-touch-icon 180 opaque, index.html links manifest/apple meta, icon.svg equals generator output. Build copies manifest+icons into dist (checked). Icons visually reviewed. Web 529 tests pass, mypy/ruff clean.

<!-- nogg:mmy-1fc:2026-10-03T09:20:31Z -->
- 2026-10-03T22:24:06+00:00 — mmy-1fc closed for TASK-INFRA-016 (Bead closed at 2026-10-03T09:20:31Z).
  - implementation commits: c57fbd8
  - Bead note:
    evidence: commit c57fbd8 on feat/add-mobile-delivery. backend/tests/test_serve_lan.py (16 tests, fake run, no server): token file create/reuse/rotate/0600 incl. tightening, start reuses data-dir token, HTTP defaults 0.0.0.0:8080 + no-HTTPS and link warnings + QR, HTTPS 8443 with cert, --qr-host order, --port/MMY_LAN_PORT, --behind-proxy 127.0.0.1 with ts.net QR, missing cert/key file aborts naming the file without token or server, cert without key, unbuilt web app. ruff/mypy clean (incl. mypy --strict on the script); segno added via pixi (lock updated). Live LAN smoke test was not run (sandbox denied binding to the network); covered by TASK-INFRA-017 E2E.

<!-- nogg:mmy-c8q:2026-10-03T21:27:42Z -->
- 2026-10-03T22:24:06+00:00 — mmy-c8q closed for TASK-WEB-047 (Bead closed at 2026-10-03T21:27:42Z).
  - implementation commits: aca917a, 2127059
  - Bead note:
    discovery (2026-10-03, add-mobile-delivery session): Beads dependency on add-mobile-layout is closed, but that code is not on origin/develop (branch feat/add-mobile-layout is unpushed, only in the worktree moviemakery2k-mmy-3pa). This task needs the compact shell (title bar state / taskbar sheet), so it cannot be built on feat/add-mobile-delivery without merging unintegrated work of another session. Unblock once add-mobile-layout is merged into develop; then merge develop into feat/add-mobile-delivery and continue.
    evidence: merge aca917a (origin/develop with add-mobile-layout), commit 2127059. apps/web/src/shell/AccessDialog.test.tsx (8 tests): isAuthRequired; wide: dialog 'Zugang erforderlich', status bar 'Kein Zugang' not 'Backend nicht erreichbar', OK closes and state stays; English texts; offline keeps old message without dialog; refused save switches to unauthorized; compact portrait+landscape: sheet dialog + 'Kein Zugang' in title bar; medium: title bar. Web 767 tests + tsc green. Biome not runnable on this Pi (see mmy-e4e), relies on CI.

<!-- nogg:mmy-e4e:2026-10-03T09:17:14Z -->
- 2026-10-03T22:24:06+00:00 — mmy-e4e closed for TASK-API-015 (Bead closed at 2026-10-03T09:17:14Z).
  - implementation commits: bdcb9b8, 2592000
  - Bead note:
    discovery: (1) scripts/test fails on clean develop too: scripts/nogg.test.sh case rec-stale-claim ('claim_stale_seconds not in config') - Nogging tooling, unrelated to this change. (2) biome cannot run on this Raspberry Pi 5 (16k page size, jemalloc 'Unsupported system page size'), so lint-web/format only runs in CI here. (3) Adding ErrorCode auth.required forces an errors.auth.required catalog entry in de/en (errorKey type check); added in this Bead to keep typecheck green, WEB-047 builds the dialog/state on it.
    evidence: commit bdcb9b8 on feat/add-mobile-delivery. backend/tests/test_access.py (15 tests: no-token setting open, 401 auth.required without/wrong cookie/bearer, cookie+bearer valid, rotated token rejects old cookie, app shell+manifest public, ?token= exchange sets HttpOnly/SameSite=Strict/Path=//Max-Age=2592000 and 303 without token, wrong token no cookie, Secure via X-Forwarded-Proto and https). Backend: 352 non-GL tests pass, mypy+ruff clean; web: 529 vitest pass, tsc clean. GL export tests fail locally only (no EGL context on Pi), CI covers them.

<!-- nogg:mmy-zha:2026-10-03T22:27:17Z -->
- 2026-10-03T22:29:30+00:00 — mmy-zha closed for TASK-INFRA-017 (Bead closed at 2026-10-03T22:27:17Z).
  - implementation commits: d794577, 4d28d21, af85873
  - Bead note:
    evidence: commits d794577 (e2e/test_lan_mode.py, 4 tests: no token -> 'Zugang erforderlich' + 'Kein Zugang'; token link -> 303 to / without token, cookie HttpOnly/SameSite=Strict/30 days, reload works; wrong token no cookie; manifest + icons public, /api 401 auth.required), 4d28d21 (docs/mobile.md, README 'Using it on your phone', CHANGELOG Unreleased, architecture test table), af85873 (Biome fixes from CI). PR #27: CI check (lint, typecheck, test, check-shaders, build), e2e, docker, invariants all pass on af85873. Locally the LAN E2E passed; export/golden E2E need EGL (Pi lacks it).
    discovery: the shared commit-msg hook (uncommitted Nogging update in the shared checkout) no longer accepts the 'style' type that develop history uses; used chore instead.
