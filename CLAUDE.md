# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
pixi run dev       # backend (MMY_API_PORT, default 8000) + Vite dev server (proxies /api)
pixi run check     # quality gate: lint, typecheck, test, check-shaders, build
pixi run test-e2e  # Playwright browser tests incl. golden frames
pixi task list     # all commands; dependencies only via pixi.toml (+ pnpm for npm packages)
```

## Architecture Overview

moviemakerY2K: a video editor in the style of Movie Maker 2.x, focused on
transitions and effects. Monorepo: `apps/web` (Vite/React/TS, WebGL2 preview),
`backend/` (Python 3.13, FastAPI, FFmpeg as a subprocess), `packages/shaders`
(GLSL ES 3.00, shared by preview and export), `packages/catalog` (effect
catalog, single source of truth). Overview: `docs/architecture.md`; rationale:
`docs/adr/0001-architecture.md`; toolchain: `docs/adr/0002-pixi.md`.
Research on the original: `docs/research/movie-maker-reference.md`.

## Conventions & Patterns

- Effects and transitions are defined only in the catalog plus a shader, never duplicated in the web app or backend.
- No Microsoft assets (icons, sounds, texts, `Parity.fx`). The original XML definitions are reference only and never committed (links in `docs/research/sources/README.md`).
- Pydantic models are the API contract; TS types are generated from them (`pixi run gen-api`).
- Bead token in commits upper-cased, e.g. `[MMY-6kz]` for `mmy-6kz` (the hook requires `[A-Z]…`).
- Public documentation (README, docs/, package READMEs, CONTRIBUTING.md) is written in English.

## Cloud Sessions (temporary, until JoMe92/nogging#26)

Claude Code on the web assigns each session a `claude/*` branch, which fails
`scripts/check-branch-name` (CI `invariants`). In a cloud session:

- The assigned `claude/*` branch is never a PR source; it may only carry backups.
- Work each Bead in the worktree from `./scripts/nogg worktree implement` on its
  `<type>/<slug>` branch. You may push that branch and open a PR into `develop`
  from it.
- `bd dolt push` does not work from the cloud (the git proxy only allows branch
  pushes). Hand the user the `bd` commands to replay Beads changes on a local machine.

## Nogging

This repository uses the Nogging operating model. **`AGENTS.md` is the
canonical instruction file** — read it (and `docs/nogging/`) for the hard
rules, the write boundary, and the workflow. This block carries only the one
detail specific to Claude Code.

- **Claude-only:** a `PreToolUse` hook (`scripts/hooks/pre-tool-use-openspec-guard`,
  wired in `.claude/settings.json`) blocks `Edit`/`Write` under `openspec/`
  unless the planning lock is held. It is a fast in-editor backstop to the
  tool-neutral write boundary described in `AGENTS.md`; the boundary holds
  without it.
- **Claude-only:** the **Orchestration Agent** — the always-on
  `nogg-orchestrator-<slug>` session above Planning and the Main Worker,
  orchestrate-only by default, floor- and boundary-lifted for `--role
  orchestrator`, reachable from a phone via Remote Control. `AGENTS.md` *The
  Orchestration Agent* and `docs/nogging/operating-model.md` have the persona
  and its scope; `scripts/nogg orchestrator {run,status,stop,restart}` and
  `.claude/commands/orchestrate.md` drive it.

Update Nogging with `npx github:JoMe92/nogging update`.
<!-- nogging:end -->

<!-- nogging:begin -->
## Nogging

This repository uses the Nogging operating model. **`AGENTS.md` is the
canonical instruction file** — read it (and `docs/nogging/`) for the hard
rules, the write boundary, and the workflow. This block carries only the one
detail specific to Claude Code.

- **Claude-only:** a `PreToolUse` hook (`scripts/hooks/pre-tool-use-openspec-guard`,
  wired in `.claude/settings.json`) blocks `Edit`/`Write` under `openspec/`
  unless the planning lock is held. It is a fast in-editor backstop to the
  tool-neutral write boundary described in `AGENTS.md`; the boundary holds
  without it. The close-protocol step `./scripts/nogg task-done <id>`
  (`AGENTS.md` hard rule 3) writes `tasks.md` directly from Bash and is
  unaffected by this hook, exactly like `sync()` already is — no override is
  needed to run it.
- **Claude-only:** specialists (`.claude/agents/*.md`) run in process through
  the Task tool. When a specialist's delegated, incorporated work
  contributes to a commit, per `AGENTS.md`'s *Specialist delegation* section,
  add a `Co-authored-by: <specialist persona name> <specialist persona
  email>` trailer naming it (roster in `.nogging/config.json`'s `personas`
  key).
- **Claude-only:** the **Orchestration Agent** — the always-on
  `nogg-orchestrator-<slug>` session above Planning and the Main Worker,
  orchestrate-only by default, floor- and boundary-lifted for `--role
  orchestrator`, reachable from a phone via Remote Control. `AGENTS.md` *The
  Orchestration Agent* and `docs/nogging/operating-model.md` have the persona
  and its scope; `scripts/nogg orchestrator {run,status,stop,restart}` and
  `.claude/commands/orchestrate.md` drive it.
- **Claude-only:** cloud sessions — the assigned `claude/*` branch is never a
  PR source; push the branch `nogg worktree implement`/`worktree plan`
  allocated and open the PR from that.
- Opt-in **Multi-machine mode** (`multi_machine: true` in
  `.nogging/config.json`) is tool-neutral, not Claude-specific — see
  `AGENTS.md` *Multi-machine mode*.

Update Nogging with `npx github:JoMe92/nogging update`.
<!-- nogging:end -->
