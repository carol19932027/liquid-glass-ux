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

## 3. Preview & sync

- Keep the Vite dev server (`0.0.0.0:5173`) and the `npm run sync:ci` watcher running
  unless the user asks to stop them.
