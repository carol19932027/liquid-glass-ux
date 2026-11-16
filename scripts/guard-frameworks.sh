#!/usr/bin/env bash
# guard-frameworks.sh — enforces "no new frameworks without permission".
#
# Fails when a change adds a direct dependency that is not on the approved list
# (scripts/framework-allowlist.txt), or adds a framework config file, unless the
# change carries explicit approval:
#   * a `Framework-Approved-By: <who>` commit trailer, or
#   * the `framework-approved` label on the pull request.
#
# Usage:
#   scripts/guard-frameworks.sh [BASE_REF] [HEAD_REF]
# Env overrides:
#   GUARD_BASE_REF, GUARD_HEAD_REF, GUARD_ALLOWLIST_FILE,
#   GUARD_PR_NUMBER, GUARD_PR_LABELS, GUARD_QUIET=1
set -euo pipefail

ALLOWLIST_FILE="${GUARD_ALLOWLIST_FILE:-scripts/framework-allowlist.txt}"
BASE="${1:-${GUARD_BASE_REF:-}}"
HEAD="${2:-${GUARD_HEAD_REF:-HEAD}}"
QUIET="${GUARD_QUIET:-0}"

log() { [ "$QUIET" = "1" ] || echo "$@"; }
fail() { echo "::error::$*" >&2; echo "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is required"
command -v node >/dev/null 2>&1 || fail "node is required to parse package.json"
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "not inside a git repository"

# ---------------------------------------------------------------- resolve refs
if ! git rev-parse --verify --quiet "${HEAD}^{commit}" >/dev/null; then HEAD="HEAD"; fi
HEAD_SHA=$(git rev-parse "$HEAD")

resolve_base() {
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  case "$candidate" in 0000000000000000000000000000000000000000) return 1 ;; esac
  git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null || return 1
  echo "$candidate"
}

if ! BASE=$(resolve_base "$BASE"); then
  git fetch --quiet --depth=200 origin main 2>/dev/null || true
  if BASE=$(resolve_base "origin/main"); then
    BASE=$(git merge-base "$BASE" "$HEAD_SHA" 2>/dev/null || echo "$BASE")
  else
    BASE="$HEAD_SHA"   # nothing to compare against: compare tree to itself
  fi
fi

# ------------------------------------------------------------ allowed packages
if [ ! -f "$ALLOWLIST_FILE" ]; then
  fail "allowlist file not found: ${ALLOWLIST_FILE}"
fi
ALLOWED=$(grep -vE '^\s*(#|$)' "$ALLOWLIST_FILE" | sed 's/[[:space:]]*$//' | sort -u)

deps_at() { # ref -> direct dependency names (one per line)
  git show "${1}:package.json" 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      try {
        const p = JSON.parse(s), out = [];
        for (const k of ["dependencies","devDependencies","peerDependencies","optionalDependencies"])
          out.push(...Object.keys(p[k] || {}));
        process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
      } catch { /* no package.json at this ref */ }
    });'
}

BASE_DEPS=$(deps_at "$BASE" | sort -u || true)
HEAD_DEPS=$(deps_at "$HEAD_SHA" | sort -u || true)
NEW_DEPS=$(comm -13 <(printf '%s\n' "$BASE_DEPS") <(printf '%s\n' "$HEAD_DEPS") | sed '/^$/d' || true)

# ------------------------------------------------------- forbidden config files
CONFIG_RE='(^|/)(next|nuxt|svelte|sveltekit|astro|remix|angular|gatsby|qwik|solid-start|meteor|express|fastify|nestjs|koa)\.config\.[cm]?[jt]s$|(^|/)angular\.json$|(^|/)firebase\.json$'
NEW_CONFIGS=$(git diff --name-only --diff-filter=A "$BASE" "$HEAD_SHA" 2>/dev/null \
  | grep -E "$CONFIG_RE" || true)

VIOLATIONS=""
for dep in $NEW_DEPS; do
  if ! printf '%s\n' "$ALLOWED" | grep -qxF "$dep"; then
    VIOLATIONS="${VIOLATIONS}  + package.json dependency: ${dep}
"
  fi
done
if [ -n "$NEW_CONFIGS" ]; then
  while IFS= read -r cfg; do
    [ -n "$cfg" ] && VIOLATIONS="${VIOLATIONS}  + framework config file: ${cfg}
"
  done <<< "$NEW_CONFIGS"
fi

if [ -z "$VIOLATIONS" ]; then
  log "guard-frameworks: OK — no new framework/dependency outside ${ALLOWLIST_FILE} (${BASE:0:7}..${HEAD_SHA:0:7})"
  exit 0
fi

MESSAGE="guard-frameworks: a new framework or dependency was added without approval:
${VIOLATIONS}
Approved list: $(printf '%s\n' "$ALLOWED" | tr '\n' ',' | sed 's/,$//; s/,/, /g')

Ask the user for explicit permission first, then either:
  * add a commit trailer:  Framework-Approved-By: <user>
  * or label the PR:       framework-approved
See AGENTS.md rule 4 for the full rule."

# Approval path 1: commit trailer
if git log --format='%B' "${BASE}..${HEAD_SHA}" 2>/dev/null | grep -qiE '^[[:space:]]*Framework-Approved-By:'; then
  log "guard-frameworks: OK — additions carry a Framework-Approved-By trailer"
  exit 0
fi

# Approval path 2: PR label
PR_LABELS="${GUARD_PR_LABELS:-}"
PR_NUMBER="${GUARD_PR_NUMBER:-}"
if [ -z "$PR_LABELS" ] && [ -n "$PR_NUMBER" ] && command -v gh >/dev/null 2>&1 && [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  PR_LABELS=$(gh pr view "$PR_NUMBER" --json labels --jq '.labels[].name' 2>/dev/null | paste -sd, - || true)
fi
if printf '%s' "$PR_LABELS" | tr ',' '\n' | grep -qxF "framework-approved"; then
  log "guard-frameworks: OK — additions approved via the framework-approved PR label"
  exit 0
fi

fail "$MESSAGE"
