# Claude Rules — MANDATORY

Standing instructions for every turn in this repository. They are **persistent** and stay
in force until the user explicitly revokes or amends them. The full text lives in
[`AGENTS.md`](./AGENTS.md); `.claude/rules/` holds the same rules split per topic.

## 1. Language: always answer in Persian (فارسی)

- Every user-facing response must be written in Persian (فارسی), right-to-left — not just
  the next reply, but **all** replies in this repository until the user says otherwise.
- Code, file paths, identifiers, commands, logs, URLs, and commit messages stay as-is
  (English/original form) inside the Persian prose.

## 2. Protected: the Glass library (`src/glass/**`)

- Never create, edit, rename, move, reformat, or delete any file under `src/glass/`
  without asking the user first and receiving **explicit permission in chat**.
- Reading is allowed; writing is not. If a change seems necessary, stop, explain the need
  in Persian, show the proposed diff, and wait for approval.
- CI enforces this via `scripts/guard-glass.sh` (job `guard-glass`): pushes and PRs that
  touch `src/glass/**` fail unless the commit has a `Glass-Approved-By:` trailer or the
  PR carries the `glass-approved` label.

## 3. No new frameworks without permission

- Never add a new framework or runtime (front-end or back-end) without asking the user
  first and receiving **explicit permission in chat**.
- Approved libraries: **Vite**, **Hono**, **Wrangler** (+ baseline TypeScript). The
  machine-readable allowlist is `scripts/framework-allowlist.txt`.
- Covers new direct `package.json` dependencies, new framework config files
  (`next.config.*`, `nuxt.config.*`, `astro.config.*`, `angular.json`, …), and switching
  build tools or server runtimes. Transitive deps of an approved library are fine.
- CI enforces it: `scripts/guard-frameworks.sh` (job `guard-frameworks`) fails pushes/PRs
  that add a non-allowlisted dependency unless a commit carries a
  `Framework-Approved-By:` trailer or the PR has the `framework-approved` label.
- Local check: `npm run guard:frameworks`.

## 4. Live server: Cloudflare Workers via Wrangler (`workers.dev`)

- Dev/live server is **Wrangler**: `wrangler dev` locally, `wrangler deploy` for the live
  `https://<worker>.<account-subdomain>.workers.dev` URL.
- **Vite stays only as the build tool** (`vite build` → `dist/`, served by the Worker's
  `assets` config). `npm run dev` is no longer the preview mechanism.
- Domain: default **`workers.dev`** subdomain only — do not add `routes`/`custom_domains`
  without asking.
- Credentials only from Actions secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`;
  never hardcode, log, or print them.
- Keep the `npm run sync:ci` watcher running unless asked to stop it.
- Transitional: `.github/workflows/preview-live.yaml` (Vite behind a tunnel) is retired
  once the Worker deploy path is verified.
