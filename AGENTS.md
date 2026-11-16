# Agent Rules — MANDATORY

These rules are **standing instructions**, not one-shot requests. They apply to every
turn in this repository until the user explicitly revokes or amends a rule in chat.
Read this file at the start of each turn and comply before doing anything else.

## 1. Language: always answer in Persian (فارسی)

- **Every** user-facing response in this repository must be written in Persian (فارسی),
  right-to-left, regardless of the language of the user's message, the tool output, or
  the code being discussed.
- This is **persistent**, not "only the next reply". It stays in force until the user
  explicitly says to switch languages.
- Keep inside Persian prose: code, file paths, identifiers, commands, log output, URLs,
  and commit messages (these stay in their original form/English).
- Commit messages, code comments, and CI/workflow files may remain in English — the
  Persian requirement covers **chat responses to the user**.

## 2. Protected: the Glass library (`src/glass/**`)

- **Never** create, edit, rename, move, reformat, or delete any file under `src/glass/`
  without first asking the user and receiving **explicit permission in chat**.
- Reading `src/glass/**` is always allowed. Writing to it is not.
- If a task seems to require a Glass change: stop, explain the need in Persian, propose
  the exact diff, and wait for approval.
- Enforcement is automated: `scripts/guard-glass.sh` runs in CI (job `guard-glass`) and
  fails any push or pull request that touches `src/glass/**` unless the commit carries a
  `Glass-Approved-By:` trailer or the PR has the `glass-approved` label.

## 3. No new frameworks without permission

- **Never** add a new framework or runtime — front-end **or** back-end — without first
  asking the user and receiving **explicit permission in chat**.
- Currently approved libraries: **Vite**, **Hono**, **Wrangler** (plus the existing
  baseline toolchain: TypeScript). The machine-readable list is
  [`scripts/framework-allowlist.txt`](./scripts/framework-allowlist.txt).
- This covers: new **direct** dependencies in `package.json`, new framework config files
  (`next.config.*`, `nuxt.config.*`, `svelte.config.*`, `astro.config.*`,
  `remix.config.*`, `angular.json`, …), and switching build tools or server runtimes.
- Transitive dependencies of an approved library are fine; a new direct dependency that
  is not on the allowlist is not.
- Enforcement is automated: `scripts/guard-frameworks.sh` runs in CI (job
  `guard-frameworks`) and fails any push or PR that adds a non-allowlisted direct
  dependency or framework config file, unless the commit carries a
  `Framework-Approved-By:` trailer or the PR has the `framework-approved` label.
- Local check: `npm run guard:frameworks`.

## 4. Preview & sync

- Keep the Vite dev server on `0.0.0.0:5173` (`npm run dev`) and the workspace↔CI sync
  watcher (`npm run sync:ci`) running unless the user asks to stop them.
