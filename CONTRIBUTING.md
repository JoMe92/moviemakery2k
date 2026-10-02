# Contributing to moviemakerY2K

Thanks for your interest! This file explains how to set up the project, what
has to pass before a change can be merged, and the few rules that keep the
project legally clean and the history readable.

## Setup

The only prerequisite is [Pixi](https://pixi.sh) (≥ 0.81). Pixi installs
Python, Node.js, pnpm, FFmpeg and every tool from the lockfile
(`pixi.lock`); pnpm (provided by Pixi) only manages the npm packages.

```bash
git clone https://github.com/JoMe92/moviemakery2k.git
cd moviemakery2k
pixi run dev            # backend + Vite dev server → http://localhost:5173
scripts/install-hooks   # optional: commit-msg, pre-commit and pre-push hooks
```

- Add dependencies through `pixi.toml` (conda-forge first) or, for npm-only
  packages, through `pnpm` — never with a global `pip`/`npm` install.
- If `~/.cache` is not writable, set `PIXI_CACHE_DIR` to a directory with
  enough space.
- Run `pixi task list` to see every command.

## Quality gate

Before opening a pull request, run:

```bash
pixi run check      # lint, typecheck, unit tests, shader check, build
pixi run test-e2e   # browser tests (needed for UI, renderer or shader changes)
pixi run format     # auto-fix formatting (Biome, Ruff)
```

If you change a backend model or route, regenerate the API types with
`pixi run gen-api` and commit the result; CI fails when
`apps/web/src/generated/` is out of date.

## Commits

- **Conventional Commits:** `type(scope): subject`, with type one of `build`,
  `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `test`.
  The `commit-msg` hook enforces this.
- **Atomic commits:** one logical change per commit, and each commit should
  build and pass the tests on its own. Do not mix refactorings, formatting
  and behaviour changes.
- **Issue token:** commits for planned work name their Beads issue in the
  subject, upper-cased, e.g. `feat(web): seek bar [MMY-1na]` for issue
  `mmy-1na`.

## Branches

- `main` holds releases, `develop` is the integration branch; pull requests
  target `develop`.
- Work branches are named `<type>/<slug>` with type one of `feat`, `fix`,
  `chore`, `docs`, `refactor`, `perf`, `test`.
  - For every type except `chore`, `<slug>` must be the name of an OpenSpec
    change in `openspec/changes/<slug>/` (live or archived), e.g.
    `feat/add-slideshow-mvp`.
  - `chore/<topic>` takes any kebab-case topic.
  - Planning branches are `plan/<planning-id>/<description>`.
- `scripts/check-branch-name <branch>` implements the rule; the pre-push hook
  and CI both use it.

## Specs, issues and the agent workflow

Larger changes are planned as **OpenSpec** changes in `openspec/` (the
specifications are currently written in German) and broken down into
**Beads** issues (`bd ready` lists available work). The project is developed
with the **Nogging** operating model for AI agents and humans: planning
sessions own `openspec/`, implementation works on one claimed issue at a time.
Read [`AGENTS.md`](AGENTS.md) and [`docs/nogging/`](docs/nogging/operating-model.md)
before working on planned changes. Small fixes and documentation improvements
are welcome as plain pull requests.

## No Microsoft assets

moviemakerY2K is an independent project inspired by the classic Movie Maker.
Do **not** add any Microsoft material: no icons, bitmaps, sounds, fonts,
help texts, screenshots of the original, `Parity.fx` or binaries. The XML
files in `docs/research/sources/` are a development reference only; they are
never shipped. Transitions and effects must be implemented from the documented
parameters (see [the research notes](docs/research/movie-maker-reference.md)),
and new effects go into the catalog plus a shader — never duplicated in the
web app or the backend. Do not copy third-party shader code without checking
its license (for gl-transitions: per file).

## License

By contributing you agree that your contributions are licensed under the
[GPL-3.0-or-later](LICENSE).
