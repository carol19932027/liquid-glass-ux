---
description: Never add a new front-end or back-end framework without explicit permission
alwaysApply: true
---

# Framework allowlist (persistent)

- **Never** add a new framework or runtime — front-end **or** back-end — without first
  asking the user and receiving **explicit permission in chat**.
- Currently approved libraries: **Vite**, **Hono**, **Wrangler**, plus the existing
  baseline toolchain (**TypeScript**).
- The machine-readable list is `scripts/framework-allowlist.txt` — treat that file as the
  source of truth, and never edit it to make a check pass without asking first.
- What counts as "adding a framework":
  - a new **direct** dependency in `package.json` (`dependencies`, `devDependencies`,
    `peerDependencies`, `optionalDependencies`)
  - a new framework config file: `next.config.*`, `nuxt.config.*`, `svelte.config.*`,
    `astro.config.*`, `remix.config.*`, `angular.json`, `gatsby-config.*`,
    `firebase.json`, server frameworks such as Express/Fastify/NestJS/Koa
  - swapping the build tool or the server runtime
- Transitive dependencies pulled in by an approved library are fine.
- If a task seems to need something outside the allowlist: stop, explain the need in
  Persian, name the exact package and why, and wait for approval.
- Automated enforcement: `scripts/guard-frameworks.sh` runs in CI as the
  `guard-frameworks` job and fails pushes/PRs that violate this rule, unless a commit
  carries a `Framework-Approved-By:` trailer or the PR has the `framework-approved` label.
- Local check: `npm run guard:frameworks`.
