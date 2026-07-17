# goose.gifts — working notes for Claude

Read `docs/ops/CHANGELOG.md` at the start of a session to see what we've done
recently and what's planned. For deeper context: `docs/ops/RUNBOOK.md` (how to
operate), `docs/ops/ROADMAP.md` (strategy), `docs/ops/NEEDS.md` (owner asks),
`docs/ops/JOURNAL.md` (detailed operator memory).

## The overarching roadmap lives in Beads (source of truth)

Cameron's cross-project priorities live in his central **Beads** task tracker
(tasks prefixed `roadmap-`, e.g. `roadmap-93zq`), not in this repo. The
autonomous operator (running via Codex on Cameron's machine) reads and closes
those tasks. The `docs/ops/*` files here are this project's local reflection of
that roadmap — keep them consistent with Beads, but Beads is the source of
truth for cross-project sequencing.

Access note: the Beads tracker requires the `bd` CLI and lives outside this
repo, so a **cloud/web Claude session cannot reach it** (GitHub access here is
scoped to `37-Inc/goose.gifts` only, and there is no `bd` CLI or beads data in
the sandbox). Do Beads work from a **local/terminal session** (or teleport a
web session down with `claude --teleport`). When a web session identifies work
that belongs in Beads, record it in `docs/ops/` and flag it for the local
operator to file rather than assuming it was tracked.

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
