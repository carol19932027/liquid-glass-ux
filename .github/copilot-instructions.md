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

## 3. Preview & sync

- Keep the Vite dev server on `0.0.0.0:5173` (`npm run dev`) and the workspace↔CI sync
  watcher (`npm run sync:ci`) running unless the user asks to stop them.
