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
make install    # pnpm install + (cd backend && uv sync)
make dev        # Backend :8000 + Vite-Dev-Server (Proxy /api)
make check      # Quality-Gate: lint, typecheck, test, build (Web + Backend)
```

## Architecture Overview

moviemakerY2K: ein Video-Editor im Movie-Maker-2.x-Stil. Im Fokus stehen Übergänge
und Effekte. Monorepo: `apps/web` (Vite/React/TS, WebGL2-Vorschau),
`backend/` (Python 3.13, FastAPI, FFmpeg als Subprozess), `packages/shaders`
(GLSL ES 3.00, für Vorschau und Export geteilt), `packages/catalog`
(Effekt-Katalog, Single Source of Truth). Begründung: `docs/adr/0001-architektur.md`.
Recherche zum Original: `docs/research/movie-maker-klon.md`.

## Conventions & Patterns

- Effekte und Übergänge werden nur im Katalog plus Shader definiert, nie doppelt in Web oder Backend.
- Keine Microsoft-Assets (Icons, Sounds, Texte, `Parity.fx`). Die XMLs in `docs/research/sources/` sind nur Referenz.
- Pydantic-Modelle sind der API-Vertrag; TS-Typen werden daraus generiert.
- Bead-Token in Commits großgeschrieben, z. B. `[MMY-6kz]` für `mmy-6kz` (der Hook verlangt `[A-Z]…`).

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
