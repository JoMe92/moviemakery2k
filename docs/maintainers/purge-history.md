# Purging the Microsoft reference XMLs from the git history

Maintainer guide for Bead `mmy-80g`. This is a one-time, destructive
operation that rewrites every branch and tag on GitHub. Only the project
owner runs it, from their own machine, after all open work is merged.

## Why

Until `mmy-80g`, `docs/research/sources/*.xml` held raw copies of Movie
Maker transition, effect and title definitions taken from Microsoft
documentation (MSDN, Vista SDK) and from the rehanfx community site. They
were committed in `f25ce17` (the initial scaffold) and are still reachable
from every branch and from tag `v0.1.0`, even though the current tree no
longer contains them. Before the repository goes public, they must be gone
from the history as well, not just from the tip. What they contained and
where the originals live is recorded in
[`docs/research/sources/README.md`](../research/sources/README.md).

The tool is [git-filter-repo](https://github.com/newren/git-filter-repo),
wrapped by [`scripts/purge-ms-reference-history.sh`](../../scripts/purge-ms-reference-history.sh).
The script rewrites a fresh mirror clone, verifies the result and prints the
push commands. **It never pushes.**

## What changes

- Every commit from `f25ce17` onwards gets a new hash. The 25 commits before
  it keep theirs. Authors, dates, messages and all other file contents stay
  the same; only the six XML files disappear. Commit IDs mentioned in commit
  messages are updated to the new IDs.
- All branches are rewritten, and so is the tag **`v0.1.0`**: it will point
  to a new commit with a new hash. A GitHub release for `v0.1.0`, if there
  is one, follows the tag name and then points to the new commit. Anyone who
  recorded the old `v0.1.0` hash will see a different one.
- `refs/dolt/data` (the Beads database) is **not** changed. It is an
  independent commit chain that never touched `docs/research/sources/`, so
  git-filter-repo leaves its hash unchanged. The script checks this and only
  includes it in the push command if it did change.
- Open pull requests become unmergeable. That is why everything has to be
  merged first.

## Prerequisites

1. **All open work is merged** into `develop` (and `main`, if applicable),
   and no one is pushing. Close or merge every open PR, including Dependabot
   PRs. Branches that are pushed later from an old clone would bring the
   XMLs back.
2. **Beads is synced:** on the machine with the authoritative Beads database,
   run `bd dolt push`, so that `refs/dolt/data` on GitHub is current. The
   rewrite does not touch that ref, but the push step also must not
   overwrite it with an older copy. The local-only ref
   `refs/remotes/origin/__dolt_remote_info__` in your working clone is
   Dolt bookkeeping. It is not on GitHub and not in the mirror, so the
   rewrite does not affect it.
3. **git-filter-repo 2.47 or newer** (needed for `--sensitive-data-removal`).
   Any one of these works:
   - `pixi exec git-filter-repo --version` (no install; the script uses this
     automatically if `git filter-repo` is not on `PATH`)
   - `pipx install git-filter-repo`
   - `python3 -m pip install --user git-filter-repo`
4. Temporarily disable branch protection or rulesets that block force pushes
   on `develop`, `main` and tags (GitHub, *Settings > Rules / Branches*).
   Re-enable them afterwards.

## Step by step (PO's machine)

```bash
# 0. Work in a scratch directory, never in your working clone.
mkdir -p ~/purge && cd ~/purge

# 1. Fresh mirror clone (all branches, tags, refs/pull/*, refs/dolt/data).
git clone --mirror https://github.com/JoMe92/moviemakery2k.git moviemakery2k-purge.git

# 2. Optional: keep an untouched backup of the old history, offline.
git clone --mirror https://github.com/JoMe92/moviemakery2k.git moviemakery2k-backup.git

# 3. Dry run: checks and the list of affected commits and refs, no changes.
#    (Use the script from your working clone of the repository.)
/path/to/moviemakery2k/scripts/purge-ms-reference-history.sh --dry-run moviemakery2k-purge.git

# 4. Rewrite and verify.
/path/to/moviemakery2k/scripts/purge-ms-reference-history.sh moviemakery2k-purge.git
```

The script refuses to run unless the target is a bare `--mirror` clone with
a single `origin` remote on which git-filter-repo has not run yet.
git-filter-repo also refuses anything that does not look like a freshly
cloned repository. If you test the script against a local path, clone with
`git clone --mirror --no-local …`, otherwise that freshness check fails.

After the rewrite the script verifies that:

- `git log --all -- 'docs/research/sources/*.xml'` is empty,
- no `docs/research/sources/*.xml` object is reachable from any ref,
- no ref disappeared and the commit count is unchanged,
- `refs/dolt/data` is unchanged.

If any check fails, it stops and tells you not to push.

git-filter-repo prints its own "next steps", which suggest
`git push --force --mirror origin`. **Ignore that suggestion.** Instead, run
the commands the script prints at the end:

```bash
cd ~/purge/moviemakery2k-purge.git
git config --unset remote.origin.mirror
git push --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
```

Why not `--mirror`: GitHub's `refs/pull/*` refs are read-only, so a mirror
push reports errors for them. A mirror push also deletes any remote ref that
is not in the local mirror, for example a branch someone pushed after you
cloned. `remote.origin.mirror` has to be unset first, because git refuses
explicit refspecs on a mirror remote (`--mirror can't be combined with
refspecs`).

Then check on GitHub:

```bash
git clone https://github.com/JoMe92/moviemakery2k.git /tmp/check && cd /tmp/check
git log --all --oneline -- 'docs/research/sources/*.xml'   # must print nothing
git show-ref --tags                                        # v0.1.0 has the new hash
```

Re-enable branch protection afterwards.

## GitHub caveats

- **Pull request refs:** `refs/pull/<n>/head` and `refs/pull/<n>/merge` on
  GitHub still point to the old commits and cannot be updated by anyone but
  GitHub. Old commits stay reachable by hash (for example
  `https://github.com/JoMe92/moviemakery2k/commit/f25ce17`) and through the
  old PR pages.
- **Cached views and forks:** GitHub may keep serving cached views of old
  commits. Existing forks keep the old history; GitHub cannot clean them.
  While the repository is private, forks can only exist within the
  account's access, so do the rewrite **before** making it public.
- **Optional:** to drop the PR refs and cached views as well, contact
  GitHub Support (https://support.github.com/) and ask them to remove the
  cached views and dereference the old commits after a history rewrite.
  Give them the first changed commit, `f25ce17462669ae308e17d2e7c3a30bbea72e45f`
  (git-filter-repo prints it as "First Changed Commit"). See GitHub's guide
  *Removing sensitive data from a repository*. For this material (publicly
  documented XML samples, not secrets), this step is optional.

## Every other clone must re-clone

After the force push, every existing clone (the PO's working clone, the
Raspberry Pi, cloud sessions, other worktrees) still has the old history. A
`git pull` there would merge the old commits, and with them the XMLs, back
in, and a later push would publish them again. So:

1. Make sure nothing unpushed is left in the old clone. Anything unpushed has
   to be re-applied by hand on the new history (for example with
   `git format-patch` / `git am`, or by copying the files); do not merge or
   rebase old branches onto the new history.
2. Move the old clone away and clone again:

   ```bash
   mv moviemakery2k moviemakery2k-old
   git clone https://github.com/JoMe92/moviemakery2k.git
   cd moviemakery2k
   bd bootstrap        # set up the Beads database from refs/dolt/data
   ```

   If you keep local reference XMLs in `docs/research/sources/`, copy them
   over; they are git-ignored.
3. Delete the old clone once the new one works.

Cloud sessions (Claude Code on the web) start from a fresh clone anyway; end
any session that is still running on the old history before the force push,
and do not push from it afterwards.

## Rollback

Until the force push, nothing has happened on GitHub: delete the mirror and
start again. After the push, the backup mirror from step 2 can restore the
old state with the same push command run from the backup (unset
`remote.origin.mirror` first). That would also restore the XMLs, so only use
it if the rewrite itself is broken.
