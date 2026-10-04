#!/usr/bin/env bash
# Purge the Microsoft/community reference XMLs (docs/research/sources/*.xml)
# from the ENTIRE git history of moviemakerY2K (Bead mmy-80g).
#
# Run this only in a fresh `git clone --mirror` of the repository, after all
# open work is merged. It rewrites every branch and tag in that mirror,
# verifies the result and then PRINTS the force-push commands. It never
# pushes anything itself.
#
# Guide: docs/maintainers/purge-history.md
#
# Usage:
#   scripts/purge-ms-reference-history.sh [--dry-run] [MIRROR_DIR]
#
#   MIRROR_DIR  path to the fresh mirror clone (default: current directory)
#   --dry-run   run all checks and list the affected commits and refs, but
#               do not rewrite anything
#
# git-filter-repo >= 2.47 is required (for --sensitive-data-removal). It is
# found as `git filter-repo` on PATH, else via `pixi exec git-filter-repo`.
# Override with FILTER_REPO, e.g. FILTER_REPO="pipx run git-filter-repo".

set -euo pipefail
export LC_ALL=C

PURGE_GLOB='docs/research/sources/*.xml'
PROTECTED_REF='refs/dolt/data'

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }

dry_run=0
mirror_dir=.
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) mirror_dir="$1" ;;
  esac
  shift
done

cd "$mirror_dir" || die "cannot enter $mirror_dir"
mirror_dir=$(pwd)

# --- locate git-filter-repo ------------------------------------------------
if [ -n "${FILTER_REPO:-}" ]; then
  read -r -a fr <<<"$FILTER_REPO"
elif git filter-repo --version >/dev/null 2>&1; then
  fr=(git filter-repo)
elif command -v pixi >/dev/null 2>&1; then
  fr=(pixi exec git-filter-repo)
else
  die "git-filter-repo not found. Install it with one of:
    pixi exec git-filter-repo --version   (no install needed with pixi)
    pipx install git-filter-repo
    python3 -m pip install --user git-filter-repo
  or set FILTER_REPO to a command that runs it."
fi
"${fr[@]}" --version >/dev/null 2>&1 || die "'${fr[*]} --version' failed"
fr_help=$("${fr[@]}" -h 2>&1 || true)
[[ "$fr_help" == *--sensitive-data-removal* ]] \
  || die "git-filter-repo is too old: version 2.47 or newer is required (--sensitive-data-removal)"
info "using: ${fr[*]} ($("${fr[@]}" --version))"

# --- refuse anything but a fresh, untouched mirror clone --------------------
[ "$(git rev-parse --is-bare-repository 2>/dev/null)" = true ] \
  || die "$mirror_dir is not a bare repository. Create a fresh mirror clone:
    git clone --mirror https://github.com/JoMe92/moviemakery2k.git moviemakery2k-purge.git"
[ "$(git config --get remote.origin.mirror || true)" = true ] \
  || die "remote.origin.mirror is not true: this is not a 'git clone --mirror' clone"
[ "$(git remote)" = origin ] || die "expected exactly one remote, 'origin'"
[ ! -e filter-repo ] || die "git-filter-repo has already run here (filter-repo/ exists); start from a new mirror clone"
[ "$(git worktree list | wc -l)" -le 1 ] || die "the mirror has linked worktrees; use a fresh mirror clone"
origin_url=$(git config --get remote.origin.url)
info "mirror: $mirror_dir (origin: $origin_url)"

# --- what is affected? ------------------------------------------------------
affected=$(git log --all --format='%h %ad %s' --date=short -- "$PURGE_GLOB")
if [ -z "$affected" ]; then
  info "no commit in any ref touches $PURGE_GLOB; nothing to do"
  exit 0
fi
info "commits touching $PURGE_GLOB:"
while IFS= read -r line; do printf '    %s\n' "$line"; done <<<"$affected"
first=$(git log --all --format=%H -- "$PURGE_GLOB" | tail -n1)
info "refs that contain the first such commit ($(git rev-parse --short "$first")):"
git for-each-ref --contains "$first" --format='    %(refname)'

before_refs=$(git for-each-ref --format='%(objectname) %(refname)')
before_commits=$(git rev-list --all --count)
before_protected=$(git rev-parse -q --verify "$PROTECTED_REF" || true)
info "before: $before_commits commits, $(printf '%s\n' "$before_refs" | wc -l) refs"

cmd=("${fr[@]}" --sensitive-data-removal --invert-paths --path-glob "$PURGE_GLOB")
if [ "$dry_run" -eq 1 ]; then
  info "dry run: would now execute"
  printf '   '; printf ' %q' "${cmd[@]}"; printf '\n'
  info "dry run: nothing was changed"
  exit 0
fi

# --- rewrite ----------------------------------------------------------------
info "rewriting history"
"${cmd[@]}"

# --- verify -----------------------------------------------------------------
info "verifying"
fail=0
left=$(git log --all --oneline -- "$PURGE_GLOB")
if [ -n "$left" ]; then
  printf 'FAIL: commits still touch %s:\n%s\n' "$PURGE_GLOB" "$left" >&2; fail=1
else
  echo "    OK  git log --all -- '$PURGE_GLOB' is empty"
fi
blobs=$(git rev-list --all --objects | grep -E ' docs/research/sources/[^ ]*\.xml$' || true)
if [ -n "$blobs" ]; then
  printf 'FAIL: XML objects still reachable:\n%s\n' "$blobs" >&2; fail=1
else
  echo "    OK  no docs/research/sources/*.xml object is reachable from any ref"
fi
after_commits=$(git rev-list --all --count)
echo "    commits: $before_commits before, $after_commits after"
after_refs=$(git for-each-ref --format='%(refname)')
missing=$(comm -23 <(printf '%s\n' "$before_refs" | awk '{print $2}' | sort) <(printf '%s\n' "$after_refs" | sort))
if [ -n "$missing" ]; then
  printf 'FAIL: refs disappeared:\n%s\n' "$missing" >&2; fail=1
else
  echo "    OK  all $(printf '%s\n' "$after_refs" | wc -l) refs are still present"
fi
after_protected=$(git rev-parse -q --verify "$PROTECTED_REF" || true)
protected_changed=0
if [ -n "$before_protected" ]; then
  if [ "$before_protected" = "$after_protected" ]; then
    echo "    OK  $PROTECTED_REF unchanged ($before_protected)"
  else
    echo "    NOTE $PROTECTED_REF changed ($before_protected -> ${after_protected:-deleted})"
    protected_changed=1
  fi
fi
[ "$fail" -eq 0 ] || die "verification failed; do NOT push. Delete this mirror and investigate."

# --- push instructions (printed, never executed) ----------------------------
changed=$(git for-each-ref --format='%(objectname) %(refname)' \
  | sort -k2 | join -1 2 -2 2 -o 1.1,2.1,0 \
      <(printf '%s\n' "$before_refs" | sort -k2) - \
  | awk '$1 != $2 {print "    " $3}')
info "refs rewritten by this run:"
printf '%s\n' "${changed:-    (none)}"

dolt_refspec=""
[ "$protected_changed" -eq 1 ] && dolt_refspec=" '$PROTECTED_REF:$PROTECTED_REF'"
cat <<EOF

Verification passed. Nothing has been pushed.

Review the result (for example: git log --oneline --all | head), then push
the rewritten history yourself:

    cd '$mirror_dir'
    git config --unset remote.origin.mirror
    git push --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'$dolt_refspec

Ignore the 'git push --force --mirror origin' suggestion that
git-filter-repo printed above. Do not use 'git push --mirror': GitHub rejects updates to its read-only
refs/pull/* refs, and a mirror push would also delete remote refs that are
missing locally. refs/pull/* on GitHub keep the old commits reachable until
the pull requests' cached refs are purged by GitHub Support (optional, see
docs/maintainers/purge-history.md). Afterwards, every other clone must be
re-cloned.
EOF
