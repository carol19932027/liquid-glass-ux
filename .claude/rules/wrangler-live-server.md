---
description: The live/dev server is Cloudflare Workers via Wrangler, not the Vite dev server
alwaysApply: true
---

# Live server rule (persistent)

- The dev/live server is **Wrangler** on **Cloudflare Workers**:
  - local: `wrangler dev` — serves the Worker script plus the built assets
  - live: `wrangler deploy` — publishes to `https://<worker>.<account-subdomain>.workers.dev`
- **The Vite dev server is no longer used as the preview mechanism.** Do not start
  `npm run dev` to preview the app.
- **Vite stays only as the build tool**: `vite build` → `dist/`, which the Worker serves
  through its `assets` configuration (`not_found_handling: "single-page-application"`).
- Domain: the default Cloudflare **`workers.dev`** subdomain. No custom domain or zone is
  configured — do not add `routes` or `custom_domains` to `wrangler.jsonc` without asking
  the user first.
- Credentials come only from GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`. Never hardcode, log, print, or commit them; never ask the user
  to paste a token into chat.
- Branch previews use `wrangler versions upload --preview-alias <slug>` (or a separate
  Worker name), and the resulting URL is published the same way the live preview URL is:
  commit comment / PR comment / job summary.
- Keep the workspace↔CI sync watcher (`npm run sync:ci`) running unless the user asks to
  stop it.
- Transitional: `.github/workflows/preview-live.yaml` (Vite dev server behind a tunnel)
  exists only until the Worker deploy path is verified end-to-end, then it gets retired —
  ask before deleting it.
