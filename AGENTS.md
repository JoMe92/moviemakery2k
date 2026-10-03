# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

> **Architecture in one line:** Issues live in a local Dolt database
> (`.beads/dolt/`); cross-machine sync uses `bd dolt push/pull` (a
> git-compatible protocol), stored under `refs/dolt/data` on your git
> remote — separate from `refs/heads/*` where your code lives.
> `.beads/issues.jsonl` is a passive export, not the wire protocol.
>
> See [SYNC_CONCEPTS.md](https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md)
> for the one-screen overview and anti-patterns (don't treat JSONL as the
> source of truth; don't `bd import` during normal operation; don't
> reach for third-party Dolt hosting before trying the default).

## Project: moviemakerY2K

Video editor in the style of Movie Maker 2.x; focus on transitions and effects.
`apps/web` (Vite/React/TS, WebGL2), `backend/` (Python 3.13, FastAPI, FFmpeg as
a subprocess), `packages/shaders` (shared GLSL), `packages/catalog` (effect
catalog). Toolchain and commands only through Pixi (`pixi run check`,
`pixi task list`). Architecture: `docs/adr/0001-architecture.md` and
`docs/architecture.md`; research: `docs/research/movie-maker-reference.md`.
No Microsoft assets. Bead token in commits upper-cased (`[MMY-6kz]` for
`mmy-6kz`). Public docs are in English; contributor guide: `CONTRIBUTING.md`.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

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

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->

<!-- nogging:begin -->
## Nogging agent instructions

Read `docs/nogging/operating-model.md` and the active Bead before work. This
block is the canonical, tool-neutral instruction set; the per-tool specifics
are confined to *Tool notes* at the end.

### Hard rules

1. Execution agents (Main Worker and specialists) must not edit `openspec/`.
2. Work only on a Bead that has been claimed by the Main Worker.
3. Before closing a Bead, run relevant validation. Close it (`bd close <id>`),
   then immediately run `./scripts/nogg task-done <id>` to tick its mapped
   `tasks.md` line (it refuses unless the Bead is already closed). Commit with
   a Conventional Commit containing the Bead ID (e.g. `[SPEC-abc]`), bundling
   that `tasks.md` tick into the same commit as the Bead's own execution
   change, and add a Bead note with the commit SHA and evidence.
4. Record every material discovery on the active Bead with the native Beads
   `discovery` label plus a required human-readable note — never as serialized
   data, and never by editing `openspec/`. A blocking discovery also sets the
   Bead status to `blocked`; the next planning session lists them with
   `bd list --label discovery`.
5. Leave an intent breadcrumb. Before an expensive or hard-to-reverse step, and
   before ending a turn with a Bead still `in_progress`, append a one-line
   `progress: <next step>` to the Bead note
   (`bd update <id> --append-notes "progress: …"`). On resume, in any tool, it
   is the primary "where was I" signal.

### The write boundary

`openspec/` is read-only for every execution agent and writable only during a
planning session holding `.nogging/locks/planning.lock`
(`./scripts/nogg plan-begin` … `plan-end`). The lock toggles a
`.nogging/locks/openspec.readonly` sentinel that the write guard consults.

### Specialist delegation

Isolated implementation or review work may be delegated to a specialist, but
claiming a Bead, closing it, writing the evidence note, and committing stay
with the Main Worker, and no delegated context may write `openspec/`.

When a specialist's delegated, incorporated work contributes to a commit, add
a `Co-authored-by: <specialist persona name> <specialist persona email>`
trailer naming that specialist (roster in `.nogging/config.json`'s `personas`
key).

### Planning only

The Planning Agent first allocates `./scripts/nogg worktree plan
<planning-id> <description>` from updated `origin/develop` and works only in
that worktree. It runs `plan-begin`, writes or revises OpenSpec, validates,
commits with `NOGGING_WRITER=planning`, materializes Beads
(`./scripts/nogg materialize <change>`), fast-forward integrates the plan
into `develop`, safely retires only a clean integrated worktree, then runs
`./scripts/nogg plan-end`. The commit precedes `materialize` so a crash
between them never leaves Beads without a committed spec.

### The Orchestration Agent

A fourth persona above Planning and the Main Worker (**Product Owner →
Orchestration Agent → {Planning, Lead} → Specialists**), run always-on as the
single supervised `nogg-orchestrator-<slug>` session by a systemd user service and
reachable from a phone via Remote Control. **Claude Code only** in this version.
It is **orchestrate-only by default** — reads state and drives Planning and Lead
sessions through `scripts/nogg`, writing no `openspec/` file and no code
itself. The command floor and the `openspec/` boundary are lifted for it (the
one documented exception, keyed to `--role orchestrator`); the discipline lives
in `.nogging/launch-prompts/orchestrator.md`, and `session list` / `doctor`
show it as `FULL-ACCESS`. It writes `openspec/` or code only under an explicit
`/orchestrate takeover {plan|code}` instruction (one task, then back), and it
never signs an acceptance report. See `docs/nogging/operating-model.md`.

### Multi-machine mode

When `.nogging/config.json` sets `"multi_machine": true` (default `false`), a
`trusted` or orchestrator session runs `bd dolt pull` once at session start —
before reading any Beads state — and `bd dolt push` before the session ends,
if it made any Bead write (create, update, claim, close). This keeps Beads
state synchronized across machines that share one Dolt remote.

`restricted` sessions are unaffected and need no change: they already cannot
run `bd dolt push`/`pull` (no remote Dolt sync in their authority level), and
a `restricted` session's local Bead writes land in Dolt history exactly as
before — they reach the remote via the same machine's next
`trusted`/orchestrator session push, which pushes every pending local commit,
not only its own.

`./scripts/nogg doctor` separately prints a NOTE (never a failure) when local
Dolt is ahead of its configured remote. See
`docs/nogging/failure-recovery.md` for the recovery path if two machines
write before either has pulled.

### Tool notes

- **Claude Code.** `openspec/` writes are also blocked by a `PreToolUse` hook
  (`scripts/hooks/pre-tool-use-openspec-guard`). Specialists are the
  `.claude/agents/*.md` roster, invoked in process through the Task tool.
  Operator entry points: `.claude/commands/{plan,discovery-review,sync-now}.md`.
- **Claude Code cloud sessions.** The assigned `claude/*` branch is never a PR
  source: push the branch `nogg worktree implement` / `worktree plan`
  allocated, and open the pull request from that branch instead.
- **Codex.** No per-tool hook — `openspec/` stays read-only through the
  filesystem write guard plus the commit hooks; the command floor is
  `.codex/rules/nogging.rules` (execpolicy). Codex has no in-process subagent
  mechanism: a specialist run is a separate supervised session,
  `scripts/nogg session launch --agent codex --role specialist:<type>
  --bead <id>`, under every specialist boundary rule. Operator entry points:
  `.codex/prompts/{plan,discovery-review,sync-now}.md`.
- **Pi.** No per-tool hook and no execpolicy file — `openspec/` writes are
  blocked by the project-local guard extension
  (`.pi/extensions/nogging-guard.ts`), which also enforces the command
  floor; `restricted` is floor-only (no network or filesystem sandbox at
  either authority level, unlike Claude Code or Codex). Pi has no in-process
  subagent mechanism: a specialist run is a separate supervised session,
  `scripts/nogg session launch --agent pi --role specialist:<type>
  --bead <id>`, under every specialist boundary rule. Operator entry points:
  `.pi/prompts/{plan,discovery-review,sync-now}.md`.

Update Nogging itself with `npx github:JoMe92/nogging update`.
<!-- nogging:end -->
