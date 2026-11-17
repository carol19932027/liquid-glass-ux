# Copilot Instructions — MANDATORY repository rules

These are standing instructions for any AI assistant working in this repository. They are
persistent (every turn) until the user explicitly revokes or amends them. The canonical
text is in [`AGENTS.md`](../AGENTS.md); per-topic copies live in `.claude/rules/` and
`.cursor/rules/`.

## 1. Language: always answer in Persian (فارسی)

- Write **every** user-facing response in Persian (فارسی), right-to-left — not only the
  next reply, but all replies, regardless of the language the user writes in.
- Keep code, file paths, identifiers, shell commands, log output, and URLs in their
  original form inside the Persian prose.
- Commit messages, code comments, and workflow files may stay in English; the Persian
  requirement covers chat responses to the user.

## 2. Protected: the Glass library (`src/glass/**`)

- Never create, edit, rename, move, reformat, or delete any file under `src/glass/`
  without asking the user first and receiving **explicit permission in chat**.
- Reading `src/glass/**` is allowed; writing is not. If a change seems necessary, stop,
  explain the need in Persian, show the proposed diff, and wait for approval.
- Never bypass the rule with scripts, codegen, `sed`, formatters, or bulk renames.
- CI enforces it: `scripts/guard-glass.sh` (job `guard-glass`) fails pushes/PRs touching
  `src/glass/**` unless a commit carries a `Glass-Approved-By:` trailer or the PR has the
  `glass-approved` label.

## 3. No new frameworks without permission

- Never add a new framework or runtime (front-end or back-end) without asking the user
  first and receiving **explicit permission in chat**.
- Approved libraries: **Vite**, **Hono**, **Wrangler** (+ baseline TypeScript). The
  machine-readable allowlist is `scripts/framework-allowlist.txt` — never edit it just to
  make a check pass.
- Covers new direct `package.json` dependencies, new framework config files
  (`next.config.*`, `nuxt.config.*`, `astro.config.*`, `angular.json`, Express/Fastify/
  NestJS/Koa, …), and switching build tools or server runtimes. Transitive dependencies of
  an approved library are fine.
- CI enforces it: `scripts/guard-frameworks.sh` (job `guard-frameworks`) fails pushes/PRs
  that add a non-allowlisted dependency unless a commit carries a
  `Framework-Approved-By:` trailer or the PR has the `framework-approved` label.
- Local check: `npm run guard:frameworks`.

## 4. Live server: Cloudflare Workers via Wrangler (`workers.dev`)

- **Local loop:** `npm run watch` (`vite build --watch`) + `npm run worker:dev`
  (`wrangler dev --ip 0.0.0.0 --port 8787`, serves the Worker plus `dist/`).
- **Live/public:** `npm run deploy` → `https://liquid-glass-ux.<subdomain>.workers.dev`.
  CI: `.github/workflows/deploy-worker.yaml` — `main` → production, other branches/PRs →
  `wrangler versions upload --preview-alias <slug>`.
- **`npm run dev` (Vite dev server) stays as a local-only CSS/SVG tuning tool with HMR** —
  never in CI, never public, and not the preview mechanism.
- Vite is otherwise only a build tool: `dist/` is served through the `ASSETS` binding with
  `not_found_handling: "single-page-application"`; routes in `assets.run_worker_first`
  (`/healthz`, `/api/*`) go to the Hono Worker in `src/worker.ts`.
- Domain: default **`workers.dev`** only — no `routes`/`custom_domains` without asking.
- Credentials only from Actions secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`;
  never hardcode, log, print, or ask for them in chat.
- **Removed, do not reintroduce without asking:** `preview-live.yaml`,
  `scripts/live-preview-server.sh`, `scripts/sync-ci-preview.sh` (`npm run sync:ci`).
