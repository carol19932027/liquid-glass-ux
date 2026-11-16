#!/usr/bin/env bash
# guard-glass.sh — enforces the protected Glass library rule mechanically.
#
# Rule: files under src/glass/** must never change without explicit user approval.
# Approval is recorded as either:
#   * a `Glass-Approved-By: <who>` commit trailer on one of the new commits, or
#   * the `glass-approved` label on the pull request (if gh/GITHUB_TOKEN is available).
#
# Usage:
#   scripts/guard-glass.sh [BASE_REF] [HEAD_REF]
# Env overrides:
#   GUARD_BASE_REF, GUARD_HEAD_REF, GUARD_PROTECTED_PATH,
#   GUARD_PR_NUMBER, GUARD_PR_LABELS, GUARD_QUIET=1
set -euo pipefail

PROTECTED="${GUARD_PROTECTED_PATH:-src/glass}"
BASE="${1:-${GUARD_BASE_REF:-}}"
HEAD="${2:-${GUARD_HEAD_REF:-HEAD}}"
QUIET="${GUARD_QUIET:-0}"

log() { [ "$QUIET" = "1" ] || echo "$@"; }
fail() { echo "::error::$*" >&2; echo "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is required"
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "not inside a git repository"

# Resolve HEAD
if ! git rev-parse --verify --quiet "$HEAD" >/dev/null; then
  HEAD="HEAD"
fi
HEAD_SHA=$(git rev-parse "$HEAD")

# Resolve BASE: fall back to merge-base with origin/main (handles new branches,
# force-pushes and the all-zeros "before" SHA GitHub sends for the first push).
resolve_base() {
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  case "$candidate" in
    0000000000000000000000000000000000000000) return 1 ;;
  esac
  git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null || return 1
  echo "$candidate"
}

if ! BASE=$(resolve_base "$BASE"); then
  git fetch --quiet --depth=200 origin main 2>/dev/null || true
  if BASE=$(resolve_base "origin/main"); then
    BASE=$(git merge-base "$BASE" "$HEAD_SHA" 2>/dev/null || echo "$BASE")
  else
    log "guard-glass: no usable base ref; comparing working tree against HEAD only"
    BASE="$HEAD_SHA"
  fi
fi

CHANGED=$(git diff --name-only "$BASE" "$HEAD_SHA" -- "$PROTECTED" 2>/dev/null || true)

if [ -z "$CHANGED" ]; then
  log "guard-glass: OK — no changes under ${PROTECTED}/ (${BASE:0:7}..${HEAD_SHA:0:7})"
  exit 0
fi

fail_msg="guard-glass: protected path ${PROTECTED}/ was modified without approval:
${CHANGED}

The Glass library is protected. Ask the user for explicit permission first, then either:
  * add a commit trailer:  Glass-Approved-By: <user>
  * or label the PR:       glass-approved
See AGENTS.md for the full rule."

# Approval path 1: commit trailer
if git log --format='%B' "${BASE}..${HEAD_SHA}" 2>/dev/null | grep -qiE '^[[:space:]]*Glass-Approved-By:'; then
  log "guard-glass: OK — ${PROTECTED}/ changes carry a Glass-Approved-By trailer"
  exit 0
fi

# Approval path 2: PR label (glass-approved)
PR_LABELS="${GUARD_PR_LABELS:-}"
PR_NUMBER="${GUARD_PR_NUMBER:-}"
if [ -z "$PR_LABELS" ] && [ -n "$PR_NUMBER" ] && command -v gh >/dev/null 2>&1 && [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  PR_LABELS=$(gh pr view "$PR_NUMBER" --json labels --jq '.labels[].name' 2>/dev/null | paste -sd, - || true)
fi
if echo "$PR_LABELS" | tr ',' '\n' | grep -qxF "glass-approved"; then
  log "guard-glass: OK — ${PROTECTED}/ changes approved via the glass-approved PR label"
  exit 0
fi

fail "$fail_msg"
