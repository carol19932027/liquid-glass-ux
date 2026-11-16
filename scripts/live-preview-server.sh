#!/usr/bin/env bash
# live-preview-server.sh
#
# Runs the Vite dev server inside a CI runner, exposes it through a public HTTPS
# tunnel (WebSocket-capable, so Vite HMR works from a normal browser), publishes
# the verified URL, then keeps the runner workspace in sync with origin/<branch>
# so every pushed commit hot-reloads in connected browsers.
#
# Tunnel providers are tried in order until one is verifiably healthy:
#   1. cloudflared quick tunnel   (https://*.trycloudflare.com)
#   2. pinggy                     (https://*.a.pinggy.io)
#   3. localhost.run              (https://*.lhr.life)
#
# Environment (all optional):
#   PORT, PREVIEW_MINUTES, SYNC_BRANCH, PR_NUMBER, LOG_DIR,
#   GH_TOKEN / GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID,
#   GITHUB_SERVER_URL, GITHUB_STEP_SUMMARY
set -uo pipefail

PORT="${PORT:-5173}"
PREVIEW_MINUTES="${PREVIEW_MINUTES:-60}"
SYNC_BRANCH="${SYNC_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)}"
LOG_DIR="${LOG_DIR:-/tmp/live-preview}"
mkdir -p "$LOG_DIR"

VITE_LOG="${LOG_DIR}/vite.log"
VITE_PID=""
PROVIDER_PID=""
PROVIDER_NAME=""
LAST_LOG=""
TUNNEL_URL=""
HTTP_CODE="000"
CLIENT_CODE="000"
WS_CODE="000"

say() { echo "[live-preview] $*"; }

cleanup() {
  [ -n "$PROVIDER_PID" ] && kill "$PROVIDER_PID" 2>/dev/null
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# --------------------------------------------------------------------------
# Vite dev server
# --------------------------------------------------------------------------
start_vite() {
  VITE_TUNNEL=1 nohup npm run dev > "$VITE_LOG" 2>&1 &
  VITE_PID=$!
  say "Vite dev server starting (pid ${VITE_PID}) on 0.0.0.0:${PORT}"
}

wait_local_vite() {
  local i
  for i in $(seq 1 45); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
      say "Vite answering locally on 127.0.0.1:${PORT} (attempt ${i})"
      return 0
    fi
    if ! kill -0 "$VITE_PID" 2>/dev/null; then
      say "Vite exited early — log tail:"; tail -n 30 "$VITE_LOG" 2>/dev/null
      return 1
    fi
    sleep 1
  done
  say "Vite did not answer within 45s — log tail:"; tail -n 30 "$VITE_LOG" 2>/dev/null
  return 1
}

# --------------------------------------------------------------------------
# Health probing
# --------------------------------------------------------------------------
probe() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" 2>/dev/null || true; }

# Vite's HMR socket: same origin, root path, subprotocol "vite-hmr".
# A tunnel that cannot proxy the upgrade answers 200 (the HTML shell) instead of 101.
ws_probe() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    -H 'Sec-WebSocket-Protocol: vite-hmr' "$1/" 2>/dev/null || true)
  printf '%s' "${code:-000}"
}

verify_tunnel() { # url attempts require_ws
  local url="$1" attempts="${2:-8}" require_ws="${3:-1}" i
  HTTP_CODE="000"; CLIENT_CODE="000"; WS_CODE="000"
  for i in $(seq 1 "$attempts"); do
    HTTP_CODE=$(probe "${url}/"); HTTP_CODE="${HTTP_CODE:-000}"
    CLIENT_CODE=$(probe "${url}/@vite/client"); CLIENT_CODE="${CLIENT_CODE:-000}"
    if [ "$HTTP_CODE" = "200" ] && [ "$CLIENT_CODE" = "200" ]; then
      WS_CODE=$(ws_probe "$url")
      if [ "$require_ws" != "1" ] || [ "$WS_CODE" = "101" ]; then
        say "Tunnel healthy after ${i} attempt(s) — / 200, /@vite/client 200, WS upgrade ${WS_CODE}"
        return 0
      fi
      say "  HTTP ok but WebSocket upgrade returned ${WS_CODE} (101 required for HMR); retrying…"
    else
      say "  not ready (attempt ${i}/${attempts}): / -> ${HTTP_CODE}, /@vite/client -> ${CLIENT_CODE}"
    fi
    sleep 5
  done
  return 1
}

collect_diagnostics() { # url logfile -> stdout
  local url="$1" logfile="$2" host
  host=$(printf '%s' "$url" | sed -E 's#https?://([^/]+).*#\1#')
  echo "### URL"
  echo "${url}"
  echo
  echo "### DNS resolution (${host})"
  (getent hosts "$host" 2>&1 || true) | head -5
  echo
  echo "### curl -v (first 25 lines)"
  (curl -sv --max-time 15 "${url}/" 2>&1 || true) | head -25
  echo
  echo "### tunnel provider log (${logfile}, last 30 lines)"
  (tail -n 30 "$logfile" 2>/dev/null || echo "(no log)")
  echo
  echo "### vite log (last 15 lines)"
  (tail -n 15 "$VITE_LOG" 2>/dev/null || echo "(no log)")
}

# --------------------------------------------------------------------------
# Publishing helpers (GitHub)
# --------------------------------------------------------------------------
gh_available() { command -v gh >/dev/null 2>&1 && [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; }

publish_success() {
  local body
  echo "::notice title=Vite Live Preview (HMR)::${TUNNEL_URL} — provider ${PROVIDER_NAME}, / ${HTTP_CODE}, /@vite/client ${CLIENT_CODE}, WS ${WS_CODE}"

  body="**Vite HMR live preview (${PROVIDER_NAME}):** ${TUNNEL_URL}

- branch: \`${SYNC_BRANCH}\`
- window: ${PREVIEW_MINUTES} minutes
- verified: \`/\` → ${HTTP_CODE}, \`/@vite/client\` → ${CLIENT_CODE}, WebSocket upgrade → ${WS_CODE}
- run: ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"

  if gh_available && [ -n "${GITHUB_SHA:-}" ]; then
    gh api -X POST "repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/comments" -f body="$body" >/dev/null 2>&1 \
      || say "could not post commit comment (needs contents: write)"
  fi

  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "## Vite Live Preview Server (HMR enabled)"
      echo ""
      echo "- **Live URL:** [${TUNNEL_URL}](${TUNNEL_URL})"
      echo "- **Tunnel provider:** \`${PROVIDER_NAME}\`"
      echo "- **Synced branch:** \`${SYNC_BRANCH}\`"
      echo "- **Window:** ${PREVIEW_MINUTES} minutes"
      echo "- **Verified:** \`/\` → ${HTTP_CODE}, \`/@vite/client\` → ${CLIENT_CODE}, WebSocket upgrade → ${WS_CODE}"
      echo ""
      echo "Commits pushed to \`${SYNC_BRANCH}\` while this job runs are pulled into the runner"
      echo "workspace and hot-reloaded in connected browsers via Vite HMR (WSS, \`clientPort: 443\`)."
    } >> "$GITHUB_STEP_SUMMARY"
  fi

  local target_pr="${PR_NUMBER:-}"
  if gh_available; then
    if [ -z "$target_pr" ]; then
      target_pr=$(gh pr list --head "$SYNC_BRANCH" --state open --json number --jq '.[0].number // empty' 2>/dev/null || true)
    fi
    if [ -n "$target_pr" ]; then
      local pr_body="<!-- vite-hmr-live-preview -->
### Vite Live Preview (HMR active)
- **Live URL:** ${TUNNEL_URL}
- **Provider:** \`${PROVIDER_NAME}\`
- **Branch:** \`${SYNC_BRANCH}\`
- **Window:** ${PREVIEW_MINUTES} minutes (verified \`/\` ${HTTP_CODE}, \`/@vite/client\` ${CLIENT_CODE}, WS ${WS_CODE})
- **Run:** ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-}"
      local existing
      existing=$(gh api "repos/${GITHUB_REPOSITORY}/issues/${target_pr}/comments" \
        --jq '.[] | select(.body | contains("<!-- vite-hmr-live-preview -->")) | .id' 2>/dev/null | head -n 1 || true)
      if [ -n "$existing" ]; then
        gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${existing}" -f body="$pr_body" >/dev/null 2>&1 || true
      else
        gh api -X POST "repos/${GITHUB_REPOSITORY}/issues/${target_pr}/comments" -f body="$pr_body" >/dev/null 2>&1 || true
      fi
    fi
  fi
}

publish_failure() { # logfile
  local logfile="$1" diag
  diag=$(collect_diagnostics "${TUNNEL_URL:-<no url obtained>}" "$logfile")
  echo "::error::No tunnel provider became healthy — see the diagnostics comment on this commit"
  printf '%s\n' "$diag"
  if gh_available && [ -n "${GITHUB_SHA:-}" ]; then
    gh api -X POST "repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/comments" \
      -f body="**Vite HMR live preview failed to become reachable.** Diagnostics:

\`\`\`
${diag}
\`\`\`" >/dev/null 2>&1 || say "could not post diagnostics comment"
  fi
}

# --------------------------------------------------------------------------
# Tunnel providers
# --------------------------------------------------------------------------
url_from_log() { grep -Eo "$2" "$1" 2>/dev/null | head -n 1 || true; }

# start_provider <name> <logfile> <url-regex> <command...>
# Starts the tunnel, waits up to 40s for a public URL, verifies it, and leaves
# PROVIDER_PID / PROVIDER_NAME / TUNNEL_URL set on success.
start_provider() {
  local name="$1" log="$2" regex="$3"; shift 3
  local i url=""
  LAST_LOG="$log"
  say "starting ${name} tunnel…"
  nohup "$@" > "$log" 2>&1 &
  PROVIDER_PID=$!; PROVIDER_NAME="$name"
  for i in $(seq 1 40); do
    url=$(url_from_log "$log" "$regex")
    [ -n "$url" ] && break
    if ! kill -0 "$PROVIDER_PID" 2>/dev/null; then
      say "${name} exited early — log tail:"; tail -n 20 "$log" 2>/dev/null
      PROVIDER_PID=""; return 1
    fi
    sleep 1
  done
  if [ -z "$url" ]; then
    say "no ${name} URL after 40s — log tail:"; tail -n 20 "$log" 2>/dev/null
    kill "$PROVIDER_PID" 2>/dev/null; PROVIDER_PID=""; return 1
  fi
  TUNNEL_URL="$url"; say "${name} URL: ${TUNNEL_URL}"
  return 0
}

drop_provider() { [ -n "$PROVIDER_PID" ] && kill "$PROVIDER_PID" 2>/dev/null; PROVIDER_PID=""; }

try_cloudflared() { # require_ws
  local require_ws="${1:-1}" protocol="quic"
  # quic (cloudflared default) proxies WebSocket upgrades; http2 does not reliably,
  # so it is only used when HMR over WSS is not required.
  [ "$require_ws" = "1" ] || protocol="http2"
  command -v cloudflared >/dev/null 2>&1 || { say "cloudflared not installed — skipping"; return 1; }
  start_provider "cloudflared" "${LOG_DIR}/cloudflared-${protocol}.log" \
    'https://[a-zA-Z0-9-]+\.trycloudflare\.com' \
    cloudflared tunnel --no-autoupdate --protocol "$protocol" --url "http://127.0.0.1:${PORT}" || return 1
  if verify_tunnel "$TUNNEL_URL" 8 "$require_ws"; then return 0; fi
  drop_provider; return 1
}

try_pinggy() { # require_ws
  local require_ws="${1:-1}"
  command -v ssh >/dev/null 2>&1 || { say "ssh not available — skipping pinggy"; return 1; }
  start_provider "pinggy" "${LOG_DIR}/pinggy.log" 'https://[a-zA-Z0-9-]+\.a\.pinggy\.io' \
    ssh -p 443 -R0:localhost:${PORT} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o ServerAliveInterval=30 -o LogLevel=ERROR a.pinggy.io || return 1
  if verify_tunnel "$TUNNEL_URL" 8 "$require_ws"; then return 0; fi
  drop_provider; return 1
}

try_localhostrun() { # require_ws
  local require_ws="${1:-1}"
  command -v ssh >/dev/null 2>&1 || { say "ssh not available — skipping localhost.run"; return 1; }
  start_provider "localhost.run" "${LOG_DIR}/localhostrun.log" \
    'https://[a-zA-Z0-9.-]+\.(lhr\.life|localhost\.run)' \
    ssh -R 80:localhost:${PORT} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o ServerAliveInterval=30 -o LogLevel=ERROR localhost.run || return 1
  if verify_tunnel "$TUNNEL_URL" 8 "$require_ws"; then return 0; fi
  drop_provider; return 1
}

# --------------------------------------------------------------------------
# Workspace sync loop (feeds Vite HMR from pushed commits)
# --------------------------------------------------------------------------
sync_loop() {
  local end_ts current_sha remote_sha changed
  end_ts=$(( $(date +%s) + PREVIEW_MINUTES * 60 ))
  current_sha=$(git rev-parse HEAD)
  say "serving ${TUNNEL_URL} and tracking origin/${SYNC_BRANCH} @ ${current_sha:0:7} for ${PREVIEW_MINUTES}m"

  while [ "$(date +%s)" -lt "$end_ts" ]; do
    if ! kill -0 "$VITE_PID" 2>/dev/null; then
      say "Vite exited — restarting"
      start_vite
      wait_local_vite || say "Vite restart not healthy yet"
    fi
    if ! kill -0 "$PROVIDER_PID" 2>/dev/null; then
      say "tunnel process exited — preview ends early"
      break
    fi
    if git fetch --quiet origin "$SYNC_BRANCH" 2>/dev/null; then
      remote_sha=$(git rev-parse FETCH_HEAD)
      if [ "$remote_sha" != "$current_sha" ]; then
        changed=$(git diff --name-only "$current_sha" "$remote_sha" 2>/dev/null || true)
        say "syncing ${current_sha:0:7} -> ${remote_sha:0:7}"
        git reset --hard "$remote_sha" >/dev/null
        if printf '%s\n' "$changed" | grep -Eq '(^|/)package(-lock)?\.json$'; then
          say "dependency manifest changed — npm ci"
          npm ci --no-audit --no-fund || say "npm ci failed"
        fi
        current_sha="$remote_sha"
        say "workspace synced; Vite HMR pushed to connected browsers"
      fi
    fi
    sleep 5
  done
  say "preview window finished"
}

# --------------------------------------------------------------------------
main() {
  say "branch=${SYNC_BRANCH} port=${PORT} window=${PREVIEW_MINUTES}m"
  start_vite
  if ! wait_local_vite; then
    echo "::error::Vite dev server never answered on 127.0.0.1:${PORT}"
    publish_failure "${LAST_LOG:-$VITE_LOG}"
    exit 1
  fi

  local providers=(try_cloudflared try_pinggy try_localhostrun) require_ws provider
  # Pass 1: require a working WebSocket upgrade (101) — that is what makes HMR live.
  # Pass 2: accept HTTP-only so the preview still exists if no tunnel can proxy WSS.
  for require_ws in 1 0; do
    if [ "$require_ws" = "1" ]; then
      say "pass 1 — looking for a tunnel that proxies WebSocket (HMR) upgrades"
    else
      say "pass 2 — no WebSocket-capable tunnel found; falling back to HTTP-only preview"
    fi
    for provider in "${providers[@]}"; do
      if "$provider" "$require_ws"; then
        [ "$require_ws" = "1" ] || echo "::warning::Tunnel proxies HTTP but not WebSocket (WS ${WS_CODE}); HMR may not update live"
        publish_success
        sync_loop
        exit 0
      fi
    done
  done

  publish_failure "${LAST_LOG:-$VITE_LOG}"
  exit 1
}

if [ "${LIVE_PREVIEW_NO_MAIN:-0}" != "1" ]; then
  main "$@"
fi
