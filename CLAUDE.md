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

- Develop on a `codex/`-prefixed branch; open a PR and (with standing owner
  authorization) merge to `main`. **Cloudflare is the release target for
  stupid.gifts. A main merge is not a Cloudflare publication.** Follow the
  reviewed, source-pinned publication/readback contract in `docs/ops/RUNBOOK.md`.
- Vercel Git auto-deployment is frozen: the legacy project's Git connection is
  removed and `vercel.json` disables Git deployments. Retain the existing Goose
  deployment as rollback only. Do not reconnect Git, redeploy manually or invoke
  a deploy hook without explicit rollback authorization. Provider deletion is a
  separate retirement gate, not part of this freeze.
- After a PR merges, remove its completed local worktree and local branch from
  the canonical checkout; GitHub automatically deletes the merged remote
  branch. Preserve or inspect any untracked files before removing a worktree.
- Never merge a change that fails `npm run build` or `npm run lint`.
- `npm run build` builds the Cloudflare static site with an explicit reviewed
  `CATALOG_SNAPSHOT_PATH` and `CATALOG_RELEASE_CONTEXT_PATH`, from clean committed
  source. Run the release verifier afterwards. It never fetches catalog data or
  deploys. `build:staging` remains a compatible alias. `build:legacy` is the
  retained Neon-backed Next app and requires its separate rollback environment;
  do not fetch legacy credentials to validate a Cloudflare-only change.
- New catalog execution uses only the reviewed D1 operator's explicit credential
  contract; it remains gated. `./scripts/ops/pull-env.sh` is legacy Vercel
  seeding/rollback tooling, not an execution fallback. Do not retry unattended
  Keychain access, change ACLs or substitute ambient credentials. Retained Neon
  access uses HTTPS (`@vercel/postgres`), never raw TCP 5432.
