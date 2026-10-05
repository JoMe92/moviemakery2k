# Execution log

<!-- nogg:mmy-3sb:2026-10-03T11:03:09Z -->
- 2026-10-03T22:24:06+00:00 — mmy-3sb closed for TASK-INFRA-015 (Bead closed at 2026-10-03T11:03:09Z).
  - implementation commits: e6b3a61, 7dafc53, 4264e81
  - Bead note:
    discovery: 'pixi run check' cannot run on this aarch64 Pi: Pixi's biome aborts (jemalloc: Unsupported system page size, 16K pages) and backend render/export pytest needs EGL/llvmpipe (missing on aarch64 here). Ran steps individually: npx biome check . clean, lint-backend/lint-scripts/typecheck/check-shaders/build OK, web tests green, backend 409 passed + 17 failed/33 errors all render/export EGL (backend untouched by this change). Full gate runs in CI.
    evidence: commit e6b3a61; screenshots taken from the current build with Playwright (iPhone 13 portrait/landscape, collection sheet, iPad gen 7) on procedurally generated pictures; they surfaced and led to fixes 7dafc53 (compact monitor collapsed) and 4264e81 (notices over action bar). Gate as in the discovery note; CI on the PR verifies pixi run check.

<!-- nogg:mmy-e9d:2026-10-03T10:45:39Z -->
- 2026-10-03T22:24:06+00:00 — mmy-e9d closed for TASK-INFRA-014 (Bead closed at 2026-10-03T10:45:39Z).
  - implementation commits: 10ce586
  - Bead note:
    discovery: on this aarch64 Pi the export renderer has no EGL (pixi mesalib llvmpipe is linux-64 only; check-render-env: eglInitialize failed), so every export e2e (also the existing desktop test_export_flow) times out locally. Export parts of e2e are verified in CI (linux-64) only.
    evidence: commit 10ce586; local: test_mobile layout/scroll tests 8 passed (6 device/orientation combos + menu sheet + tablet), all four phone flows (iPhone 13/Pixel 7 × portrait/landscape) pass import, pick+add, transition sheet, music, action bar, 44 px checks and full-screen wizard up to the export wait (EGL missing locally); desktop e2e subset (slideshow, language, lang, golden frames/pattern) 33 passed unchanged; ruff clean. Found+fixed on the way: picking tiles aria-disabled (fix for TASK-WEB-040). Full 'pixi run test-e2e' incl. export runs in CI on the PR.

<!-- nogg:mmy-gnc:2026-10-03T10:16:17Z -->
- 2026-10-03T22:24:06+00:00 — mmy-gnc closed for TASK-WEB-045 (Bead closed at 2026-10-03T10:16:17Z).
  - implementation commits: 745a22b, 33b148e
  - Bead note:
    evidence: commits 745a22b (tile size), 33b148e (haptics); storyboard/TileSize.test.tsx: three levels via Kleiner/Größer with limits, English labels, persisted after reload, two-finger zoom in/out, desktop header unchanged; ui/haptics.test.tsx: 10/15/2x10 ms patterns, long press vibrates, 'Vibration ausschalten' (off, persisted, no vibration), no switch/no error without navigator.vibrate; TouchReorder: vibration on activation and drop. vitest 62/641, tsc, biome.

<!-- nogg:mmy-rqs:2026-10-03T10:19:49Z -->
- 2026-10-03T22:24:06+00:00 — mmy-rqs closed for TASK-WEB-046 (Bead closed at 2026-10-03T10:19:49Z).
  - implementation commits: 0ce2940
  - Bead note:
    evidence: commit 0ce2940; render/previewBuffer.test.ts + Renderer.test (buffer at DPR 1, DPR 3 capped to 2, very wide monitor capped at 1920 px, GPU limit respected, debug view unchanged), player/Visibility.test.tsx ('Tab im Hintergrund': paused, rAF cancelled, position kept). lazy/async thumbnails and overscroll-behavior are markup/CSS. vitest 64/647, tsc, biome.

<!-- nogg:mmy-95a:2026-10-03T09:59:53Z -->
- 2026-10-03T22:24:06+00:00 — mmy-95a closed for TASK-WEB-043 (Bead closed at 2026-10-03T09:59:53Z).
  - implementation commits: eccf3ea, d15945b
  - Bead note:
    evidence: commits eccf3ea d15945b ; ui/TouchInputs.test.tsx (11): 'Bilddauer per Stepper' 3 s +2×0.5 -> 4 s (de) and en, limits min/max, inputmode=decimal and unchanged validity (0,3 refused, dialog stays), transition 0.25 s up to 5 s, volume 5 % to 200 % (de) and down to 0 % (en), trim 0.1 s with 0.5 s minimum length, waveform handles (pointer drag + preview on release, keyboard), wizard full-screen sheet with Zurück/Weiter/Abbrechen in the footer. 16 px font is CSS (theme.css), checked in TASK-INFRA-014 e2e. vitest 59/624, tsc, biome.

<!-- nogg:mmy-d14:2026-10-03T10:05:23Z -->
- 2026-10-03T22:24:06+00:00 — mmy-d14 closed for TASK-WEB-044 (Bead closed at 2026-10-03T10:05:23Z).
  - implementation commits: 52c17ee, 7dafc53
  - Bead note:
    evidence: commit 52c17ee; player/Gestures.test.tsx (7): 'Wischen zum nächsten Bild' (+ back), short/vertical/mouse swipes ignored, double tap toggles full screen, 'Vollbild ohne Fullscreen-API' (overlay, 'Vollbild beenden' and Escape restore compact), Fullscreen API on the monitor container + fullscreenchange exit, controls hide after 3 s and return on touch, no button on mouse desktop. MediumLayout assertion adapted to the layout-neutral (display: contents) monitor container. vitest full suite green, tsc, biome.
    follow-up fix 7dafc53: display:contents fullscreen container collapsed the compact monitor (found via README screenshots in TASK-INFRA-015); e2e now asserts canvas height >= 100 px in all device layouts.

<!-- nogg:mmy-0rj:2026-10-03T09:53:38Z -->
- 2026-10-03T22:24:06+00:00 — mmy-0rj closed for TASK-WEB-042 (Bead closed at 2026-10-03T09:53:38Z).
  - implementation commits: 1f18c97, a87ed1d
  - Bead note:
    evidence: commits 1f18c97 a87ed1d ; transitions/TransitionSheet.test.tsx (6): 'Übergang setzen am Handy' (Kreis, default 1.5 s, plays once and pauses after, saved, stays open until Fertig), 'Dauer per Stepper' (+ at 5 s disabled, stays 5 s), − disabled at 0.25 s, 'Kein Übergang' removes, English names. ActionBar test now expects the sheet. vitest full suite green, tsc, biome.

<!-- nogg:mmy-dga:2026-10-03T09:44:36Z -->
- 2026-10-03T22:24:06+00:00 — mmy-dga closed for TASK-WEB-040 (Bead closed at 2026-10-03T09:44:36Z).
  - implementation commits: e714f48, ab1be6b, edf0073
  - Bead note:
    evidence: commits e714f48 ab1be6b ; media/CollectionSheet.test.tsx (8): tabs + Importieren, 'Drei Bilder hinzufügen' C,A,B with default duration and sheet closed, 'Keine Auswahl' disabled + toggle off, insert after selected picture, music appended in pick order, long press -> Eigenschaften/Löschen (+properties dialog, delete confirm), English. Taskbar test updated (import now opens the sheet). vitest 56 files green, tsc, biome.
    follow-up fix edf0073: picking tiles carried aria-disabled=true from the disabled dnd-kit draggable (found by TASK-INFRA-014 e2e on iPhone 13; jsdom ignored it). Unit assertion added.

<!-- nogg:mmy-xo6:2026-10-03T09:48:02Z -->
- 2026-10-03T22:24:06+00:00 — mmy-xo6 closed for TASK-WEB-041 (Bead closed at 2026-10-03T09:48:02Z).
  - implementation commits: 3d3f4b2, 8180aff, 13e9f86, d3641f1
  - Bead note:
    discovery (mmy-fa5, not claimed): the swallowed-first-click bug sits exactly where touch reordering hooks in — dnd-kit's 50 ms document click guard in AbstractPointerSensor. Fix 3d3f4b2 (StoryboardPointerSensor releases the guard at the next pointerdown) already exists on develop while mmy-fa5 is still open; the new StoryboardTouchSensor (8180aff) shares the same guard release, so a tap right after a touch drop is not lost either. mmy-fa5 can likely be closed after a check by its owner; the e2e test still retries (e2e/test_slideshow_flow.py:55).
    evidence: commit 13e9f86 (+ sensor split 8180aff from TASK-WEB-038); storyboard/TouchReorder.test.tsx: 'Scrollen statt Ziehen' and 'Ziehen nach langem Drücken' (third to first, saved) for pictures and music clips, touch pointers ignored by the mouse sensor. vitest full suite green, tsc, biome.
    follow-up fix d3641f1: tiles/clips had touch-action: none (desktop pointer sensor), blocking real-device swipe scrolling; now pan-x pan-y, none only while dragging. Found during TASK-WEB-045; e2e (TASK-INFRA-014) covers real touch.

<!-- nogg:mmy-8uj:2026-10-03T09:36:57Z -->
- 2026-10-03T22:24:06+00:00 — mmy-8uj closed for TASK-WEB-039 (Bead closed at 2026-10-03T09:36:57Z).
  - implementation commits: b50d4df, dccdd31, 174ae24
  - Bead note:
    evidence: commits b50d4df, dccdd31, 174ae24; shell/ActionBar.test.tsx (12): 'Bild nach rechts verschieben' (= projectOps.moveSlide, saved), left/right bounds, Dauer/Übergang davor dialogs, Entfernen like Delete, all music actions (fade in/out aria-pressed, move, volume, trim, remove), 'Aktionsmenü per langem Drücken' (400 ms, same entries as desktop menu), >8 px move cancels, ⋯ on tiles/clips and in the bar. vitest 55/594 green, tsc, biome. Note: 'Übergang davor…' opens the existing transition properties dialog until TASK-WEB-042 adds the transition sheet.

<!-- nogg:mmy-dh4:2026-10-03T09:27:32Z -->
- 2026-10-03T22:24:06+00:00 — mmy-dh4 closed for TASK-WEB-038 (Bead closed at 2026-10-03T09:27:32Z).
  - implementation commits: 8180aff, 1285d71
  - Bead note:
    evidence: commits 8180aff (touch sensor 400ms/8px + touch drop-side fix) and 1285d71 (medium layout); shell/MediumLayout.test.tsx: 'Tablet' (collection+monitor side by side, storyboard, taskbar, menubar, no task pane/status bar), touch drag from collection into storyboard after long press, immediate move does not drag. vitest 54 files/582 green, tsc, biome; Playwright iPad screenshot ok, no h-scroll. Note: sensor split (D8) landed here because collection drag by touch needs it; TASK-WEB-041 keeps strip/music touch-action, overscroll, auto-scroll and its tests.

<!-- nogg:mmy-p69:2026-10-03T09:20:56Z -->
- 2026-10-03T22:24:06+00:00 — mmy-p69 closed for TASK-WEB-037 (Bead closed at 2026-10-03T09:20:56Z).
  - implementation commits: 73e619b
  - Bead note:
    evidence: commit 73e619b; shell/MenuSheet.test.tsx: 7 collapsed groups, 'Neues Projekt am Handy' (confirm -> storyboard empty, media unchanged), 'Film speichern…' aria-disabled on empty storyboard (no wizard) and enabled with slides, no shortcut hints, Clip -> 'Film an Musik anpassen', Help -> About as sheet. Full vitest green, tsc, biome.

<!-- nogg:mmy-4g9:2026-10-03T09:14:29Z -->
- 2026-10-03T22:24:06+00:00 — mmy-4g9 closed for TASK-WEB-035 (Bead closed at 2026-10-03T09:14:29Z).
  - implementation commits: f4b9222, a94792a
  - Bead note:
    evidence: commits f4b9222 (ImportInput refactor) + a94792a; shell/CompactWindow.test.tsx covers 'Kompaktes Layout' in portrait+landscape (regions, no menubar/taskpane/statusbar), empty-project hint de/en, rotation keeps playback+selection without remount, save-failed symbol in title bar, 'Gespeichert' notice only on change, import input without collection pane. vitest 51 files/566 green, tsc, biome. Playwright screenshots iPhone13 portrait/landscape, iPad, 1280x720: no horizontal scroll, modes compact/compact/medium/wide. Note: music-track empty hint still says 'drag' in compact -> addressed with TASK-WEB-040.

<!-- nogg:mmy-a1q:2026-10-03T09:17:59Z -->
- 2026-10-03T22:24:06+00:00 — mmy-a1q closed for TASK-WEB-036 (Bead closed at 2026-10-03T09:17:59Z).
  - implementation commits: 69cc9bf
  - Bead note:
    evidence: commit 69cc9bf; shell/Taskbar.test.tsx covers both 'Taskleiste' scenarios in de and en (import pictures opens file dialog with JPEG/PNG/WebP accept; empty storyboard -> save entry visible but aria-disabled, no wizard), enabled save with slides, active-step highlight + focus return. vitest 52 files/573, tsc, biome.

<!-- nogg:mmy-3d8:2026-10-03T09:06:01Z -->
- 2026-10-03T22:24:06+00:00 — mmy-3d8 closed for TASK-WEB-034 (Bead closed at 2026-10-03T09:06:01Z).
  - implementation commits: cced58d
  - Bead note:
    evidence: commit cced58d; ui/Sheet.test.tsx covers all 'Bottom-Sheets im Y2K-Stil' scenarios: modal+focus, close button, Escape, backdrop tap, swipe >80 px at grip with focus return, slow short swipe snaps back, fast swipe closes, Tab trap, prefers-reduced-motion (data-motion=reduce), full height, Help→About as sheet in compact and window dialog in wide. vitest 50 files/558 tests, tsc, biome clean.

<!-- nogg:mmy-rmq:2026-10-03T08:59:51Z -->
- 2026-10-03T22:24:06+00:00 — mmy-rmq closed for TASK-WEB-033 (Bead closed at 2026-10-03T08:59:51Z).
  - implementation commits: a0c635e
  - Bead note:
    progress: working in shared change worktree /home/jome/src/moviemakery2k-mmy-3pa on branch feat/add-mobile-layout (one branch/PR per change)
    evidence: commit a0c635e; existing TaskPane/TaskGroup/App tests unchanged and green; new shell/tasks.test.ts (groups, activation, store actions, de/en); vitest 49 files/545 tests, tsc -b, biome clean.

<!-- nogg:mmy-3pa:2026-10-03T08:57:02Z -->
- 2026-10-03T22:24:06+00:00 — mmy-3pa closed for TASK-WEB-032 (Bead closed at 2026-10-03T08:57:02Z).
  - implementation commits: 1472f62, 40e6a0d, 4cf6802
  - Bead note:
    discovery: scripts/test fails already on develop 1472f62 (scripts/nogg.test.sh: 'rec-stale-claim: claim_stale_seconds not in config'); Nogging config/test drift, unrelated to add-mobile-layout. Web validation used instead: vitest/tsc/biome.
    evidence: commit 40e6a0d; vitest 48 files/542 tests green incl. new layoutMode.test.tsx (boundaries 599/600, 1279/1280, landscape 499/500 height, coarse, live switch, store kept, wide unchanged without matchMedia); tsc -b clean; biome clean.
    follow-up fix: commit 4cf6802 (all layout subscribers notified; found while adding Sheet, covered by layoutMode.test root-attributes case).
