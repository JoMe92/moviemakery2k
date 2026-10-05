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

### Known host limitations

CI (x86_64 Linux) is the authority for the gate. Two things are worth
knowing if you develop somewhere else:

- **A 16 KB-page kernel (for example a Raspberry Pi 5 running the 64-bit
  Raspberry Pi OS) cannot run Pixi's Biome binary.** It aborts immediately,
  on any input, with `jemalloc: Unsupported system page size`, which stops
  `pixi run check` at its first step. Run the same version by hand instead
  and the rest of the gate individually:

  ```bash
  npx -y @biomejs/biome@2.5.15 check .   # the version pinned in pixi.toml
  ```

  Use the full package name. A bare `npx biome` installs an unrelated npm
  package called `biome` and reports success without checking anything.
- **Headless WebGL needs software rendering.** `pixi.toml` sets
  `LIBGL_ALWAYS_SOFTWARE=1` for Linux, which pins Mesa llvmpipe instead of
  letting Mesa look for a GPU driver it may not find; `pixi run
  check-render-env` prints the renderer it ended up with. Without it the
  backend renderer has no EGL context and every export test fails.

### Writing browser tests

`e2e/` has two traps that cost a session each; both are easy to avoid:

- **A React controlled `<input>` ignores a plain `el.value = …`
  assignment.** Seeking the playhead or filling a field from Playwright has
  to go through the native `HTMLInputElement` value setter, or the component
  never sees the change.
- **A dnd-kit keyboard drag needs a pause after the pickup key.** The
  `KeyboardSensor` attaches its move/drop listener via `setTimeout(0)`, so a
  key dispatched immediately after `Enter` can arrive before that listener
  exists and silently does nothing. Wait ~50 ms between pickup, move and
  drop.

## Commits

- **Conventional Commits:** `type(scope): subject`, with type one of `build`,
  `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `test`.
  The `commit-msg` hook enforces this.
- **Atomic commits:** one logical change per commit, and each commit should
  build and pass the tests on its own. Do not mix refactorings, formatting
  and behaviour changes.
- **Issue token:** commits for planned work name their Beads issue in the
  subject, with the prefix upper-cased and the id left exactly as Beads
  wrote it, e.g. `feat(web): seek bar [MMY-1na]` for issue `mmy-1na`. The
  hook requires the upper-case prefix; upper-casing the id as well
  (`[MMY-1NA]`) is rejected.

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
before working on planned changes. What planning sessions decided about the
findings reported from implementation is logged in
[`docs/maintainers/discovery-triage.md`](docs/maintainers/discovery-triage.md). Small fixes and documentation improvements
are welcome as plain pull requests.

## No Microsoft assets

moviemakerY2K is an independent project inspired by the classic Movie Maker.
Do **not** add any Microsoft material: no icons, bitmaps, sounds, fonts,
help texts, screenshots of the original, `Parity.fx` or binaries. The original
XML definitions are a development reference only: they are not in the
repository (see `docs/research/sources/README.md` for links), local copies
there are git-ignored, and they are never committed or shipped. Transitions and effects must be implemented from the documented
parameters (see [the research notes](docs/research/movie-maker-reference.md)),
and new effects go into the catalog plus a shader — never duplicated in the
web app or the backend. Do not copy third-party shader code without checking
its license (for gl-transitions: per file).

## License

By contributing you agree that your contributions are licensed under the
[GPL-3.0-or-later](LICENSE).
