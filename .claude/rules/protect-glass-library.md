---
description: Protect the Glass library in src/glass from unauthorized edits
paths:
  - "src/glass/**"
alwaysApply: true
---

# Glass library protection (persistent)

- **Never** create, edit, rename, move, reformat, or delete any file under `src/glass/`
  without first asking the user and receiving **explicit permission in chat**.
- Reading `src/glass/**` is always allowed. Writing to it is not.
- If a task seems to require a Glass change: stop, explain the need (in Persian, per the
  language rule), show the exact proposed diff, and wait for approval before touching it.
- Do not work around this rule via scripts, codegen, `sed`, formatters, or bulk renames.
- Automated enforcement: `scripts/guard-glass.sh` runs in CI as the `guard-glass` job and
  fails pushes/PRs that touch `src/glass/**` unless the commit carries a
  `Glass-Approved-By:` trailer or the PR has the `glass-approved` label.
