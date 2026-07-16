# goose.gifts — working notes for Claude

Read `docs/ops/CHANGELOG.md` at the start of a session to see what we've done
recently and what's planned. For deeper context: `docs/ops/RUNBOOK.md` (how to
operate), `docs/ops/ROADMAP.md` (strategy), `docs/ops/NEEDS.md` (owner asks),
`docs/ops/JOURNAL.md` (detailed operator memory).

## Keep the running log current — standing instruction from the owner

Maintain `docs/ops/CHANGELOG.md` as an ongoing record without being asked. When
a working session (with Cameron or autonomous) makes a meaningful change, or the
plan shifts:

- Append a dated entry to the **Changelog** describing what shipped and why,
  tagged `[owner+claude]` or `[daily-ops]`, with the PR/commit.
- Keep **Upcoming / planned** honest — add new intentions, remove what's done.
- Do this **before ending the session**, as part of the work, not a reminder.

Keep entries short; heavy operational detail belongs in `JOURNAL.md`.

## Conventions

- Develop on a `claude/`-prefixed branch; open a PR and (with standing owner
  authorization) merge to `main`, which auto-deploys to production via Vercel.
- Never merge a change that fails `npm run build` or `npm run lint`.
- Credentials self-bootstrap via `./scripts/ops/pull-env.sh` (needs
  `VERCEL_TOKEN`). Database access works only over HTTPS (`@vercel/postgres`),
  never raw TCP 5432.
