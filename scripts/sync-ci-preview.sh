#!/usr/bin/env bash
# Watches workspace files and automatically commits + pushes updates to the
# active branch so the GitHub Actions Vite HMR live-server stays in sync.
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)
INTERVAL="${SYNC_INTERVAL_SECONDS:-3}"

if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "HEAD" ]; then
  echo "Refusing to auto-sync directly onto '${BRANCH}'. Use a working branch." >&2
  exit 1
fi

echo "Syncing workspace to origin/${BRANCH} (polling every ${INTERVAL}s)..."

while true; do
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    if ! git diff --cached --quiet; then
      TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      git commit -m "chore(sync): workspace HMR sync ${TIMESTAMP} [skip ci]" --no-verify
      git push origin "$BRANCH"
      echo "[${TIMESTAMP}] Pushed workspace changes to origin/${BRANCH}"
    fi
  fi
  sleep "$INTERVAL"
done
