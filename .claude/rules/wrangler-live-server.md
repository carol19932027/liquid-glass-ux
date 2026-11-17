---
description: The live/dev server is Cloudflare Workers via Wrangler; Vite dev is local-only
alwaysApply: true
---

# Live server rule (persistent)

## Local development

- The local loop is **two processes**:
  - `npm run watch` → `vite build --watch` — rebuilds `dist/` on every source change
  - `npm run worker:dev` → `wrangler dev --ip 0.0.0.0 --port 8787` — serves the Worker plus
    `dist/`, i.e. the production-shaped artifact
- `npm run dev` (the Vite dev server) **stays as a local-only convenience** for tuning
  CSS/SVG with true HMR. It is never used in CI, never exposed publicly, and it is **not**
  the preview mechanism.

## Live / public

- `npm run deploy` → `wrangler deploy` → `https://liquid-glass-ux.<account-subdomain>.workers.dev`
- CI does it in `.github/workflows/deploy-worker.yaml`:
  - push to `main` → production deploy
  - other branches and pull requests → `wrangler versions upload --preview-alias <slug>`
  - the resulting URL is verified (`/` and `/healthz`) and published as a commit comment,
    PR comment and job summary
- A preview alias is a *version of the same Worker*, so the Worker must exist first:
  deploy `main` once, or run the workflow with `mode=production`.

## Worker configuration

- Vite is only a build tool: `vite build` → `dist/`, served through the `ASSETS` binding
  with `not_found_handling: "single-page-application"`.
- Server routes must be listed in `assets.run_worker_first` (`/healthz`, `/api/*`),
  otherwise the SPA fallback answers them with `index.html`. They are handled by the Hono
  Worker in `src/worker.ts`.
- An assets-only Worker cannot have a `binding`; a Worker with a `binding` must have `main`.
- Domain: the default **`workers.dev`** subdomain only. Do not add `routes` or
  `custom_domains` to `wrangler.jsonc` without asking the user first.

## Credentials

- Only from GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Never hardcode, log, print, or commit them; never ask the user to paste a token in chat.

## Removed — do not reintroduce without asking

- `.github/workflows/preview-live.yaml` (Vite dev server behind a public tunnel)
- `scripts/live-preview-server.sh`
- `scripts/sync-ci-preview.sh` and the `npm run sync:ci` auto-commit watcher
