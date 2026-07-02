# goose.gifts — Operations Journal

Newest entries first. Every scheduled run appends an entry. This file is the
operator's memory across runs — write for a cold start.

---

## 2026-07-01 (night) - Manual daily routine run: catalog schema foundation

Ran the daily prompt manually because no native "run now" automation control
was exposed in the available Codex tools. The saved automation itself remains
active for daily 8:30 AM Pacific.

**Runbook checks**:
- GitHub: clean `main` at `b5bc71b`; no open PRs/issues needing action.
- Live health: homepage 200, sitemap 200, search page 200, sample bundle 200
  after `goose.gifts` -> `www.goose.gifts` redirect.
- Env bootstrap: `.env.local` present from `pull-env.sh`; OpenAI, Google
  search, Postgres, and Amazon access key vars present.
- Known env gaps still true: no `AWIN_*` vars; Vercel defines
  `AWS_SECRET_ACCESS_KEY` while code reads `AWS_SECRET_KEY`.

**Production data snapshot**:
- 109 bundles, 3,165 products, 327 gift ideas, 3,259 gift idea products.
- 22,193 lifetime bundle views; 103 bundle clicks; 91 product clicks; 9 shares.
- Last bundle created `2026-04-16T02:16:26.425Z`.
- Last search `2025-10-30T18:27:51.066Z`; zero searches, zero product clicks,
  and zero new bundles in the last 30 days.
- Product catalog before this run had none of the ROADMAP Phase 1a fields.

**Decision**: start ROADMAP Phase 1a with the additive product catalog schema
foundation. This is the smallest production-safe step toward the pre-indexed
catalog/search relaunch and removes no existing behavior.

**Shipped in this run**:
- Added `products.embedding vector(1536)`, `humor_tags text[]`, `punny_title`,
  `witty_description`, `quality_score numeric(5,4)`, `source_query`,
  `is_active boolean default true not null`, and `last_verified_at`.
- Added indexes for active filtering, quality score ordering, humor-tag GIN
  filtering, and partial HNSW cosine vector search over non-null embeddings.
- Applied the migration to production through `@vercel/postgres` HTTPS driver.
  Verified all eight columns and four indexes exist. Existing 3,165 products
  are active; embedded product count is 0 until the ingestion/backfill job runs.

**Verification**: `npm run build` passed. `npm run lint` passed with 11
pre-existing warnings only (`<img>` usage, missing hook dependency, unused
symbols in older files).

**Next**: implement the ingestion/backfill skeleton: discover candidates,
normalize/upsert products, LLM score/tag/copy, embed with
`text-embedding-3-small`, and store into the new catalog fields. Keep Amazon
PA-API env-name mismatch and missing Awin credentials on the near-term audit
list before relying on non-Amazon revenue/source data.

---

## 2026-07-01 (night) — Vercel token installed for autonomous runs

Stored the Vercel token in the appropriate non-repo secret stores:

- Remote fallback: GitHub repo secret `VERCEL_TOKEN` on `37-Inc/goose.gifts`
  (no GitHub Actions scheduler exists; this is only an encrypted repo-level
  fallback for future remote automation).
- Local primary: macOS Keychain item, service `goose.gifts.VERCEL_TOKEN`,
  account `goose.gifts`.
- Local headless fallback: `$HOME/.codex/secrets/goose.gifts/vercel-token`
  with mode 600.

Updated `scripts/ops/pull-env.sh` so scheduled/local runs can bootstrap even
when `VERCEL_TOKEN` is not already exported. It now checks the env var first,
then Keychain, then the Codex secret file (or `VERCEL_TOKEN_FILE`), and writes
`VERCEL_TOKEN` into `.env.local` along with decrypted Vercel production env
vars. This keeps the token out of git and out of the automation prompt while
making `set -a; source .env.local; set +a` enough for later Vercel API work.

**Next scheduled run**: verify it starts normally at 8:30 AM Pacific, reads
the journal/runbook, sources `.env.local`, and appends its own entry. No known
owner action remains for credentials.

---

## 2026-07-01 (night) — Codex daily routine created

Read the current handoff/runbook/roadmap/needs/journal after fast-forwarding
local `main` to `origin/main` (`9ce5e12`) so the checkout includes the latest
ops docs and the removed GitHub Actions scheduler.

**Scheduler**: created native Codex automation `goose-gifts-daily-ops`.
Saved state verified in `$CODEX_HOME/automations/goose-gifts-daily-ops/automation.toml`:
active cron, daily 8:30 AM local/Pacific, model `gpt-5-codex`, reasoning
`high`, `execution_environment = "worktree"`, `cwds =
["/Users/cameronehrlich/goose.gifts"]`, and the exact handoff prompt:
"You are the autonomous operator of goose.gifts with standing authorization
from the owner to merge and deploy. Read docs/ops/RUNBOOK.md in the repository
and execute today's run exactly as it describes."

**Credential note**: Cameron provided a Vercel token in the setup chat, but
the Codex `automation_update` surface exposes no environment-variable field
and the token was not written to the repo or automation TOML. First scheduled
run must verify that `VERCEL_TOKEN` is present in its execution environment,
then run `./scripts/ops/pull-env.sh` per runbook step 0. If absent, add the
token through the Codex routine/environment UI or escalate.

**Next**: let the first scheduled run execute the runbook, append its own
journal entry, and then mark NEEDS #1 Received once the routine has proven it
can pull Vercel env and operate with branch push/merge access.

---

## 2026-07-01 (night) — Scheduler decision reversed by owner; handoff written

Cameron rejected the GitHub Actions scheduler (workflow deleted, never
activated) and cancelled in-session timers. He will have **another agent**
set up the daily routine. Wrote `docs/ops/HANDOFF.md` — the canonical
handoff prompt covering the mandate, the operating docs, the catalog-pivot
plan and its urgency, hard-won technical facts (HTTPS-only DB access,
Vercel per-var decryption, prod env gaps), and scheduler requirements
(VERCEL_TOKEN in env, full network, merge permission). No scheduling of any
kind is currently armed; nothing runs until the other agent's routine exists.

---

## 2026-07-01 (evening) — Routine creation confirmed broken; scheduler moved to GitHub Actions

Cameron retried routine creation with the correct repo — still "Failed to
create routine". Treating claude.ai routines as unavailable (research-preview
bug; retry in a week or two, or via Desktop app / local CLI `/schedule`).

**New durable scheduler**: `.github/workflows/daily-ops.yml` — daily at
10:23 UTC via anthropics/claude-code-action. No-ops harmlessly until two
repo secrets exist (`ANTHROPIC_API_KEY`, `VERCEL_TOKEN`); that two-secret
step is now the ONLY manual action remaining (NEEDS #1).

**Bridge**: the original in-session cron silently disappeared (session crons
are even more fragile than documented — they don't survive whatever recycled
it). Re-armed as a self-re-arming job (re-creates itself on each fire,
resetting the 7-day expiry) that also auto-retires once a real Daily Ops
workflow run succeeds.

---

## 2026-07-01 (later) — Credentials live; first real baseline

**Credentials**: Cameron provided a Vercel token in chat. `pull-env.sh` needed
two fixes (both shipped): the env list endpoint returns values encrypted —
must fetch each var individually to decrypt; and values must be shell-quoted
in `.env.local` or `source` breaks on `&` in connection strings. All 29
production vars now pull cleanly. Verified working: OpenAI key (200),
Neon Postgres — **but only over HTTPS** via `@vercel/postgres`/Neon serverless
driver; direct TCP 5432 is blocked in the cloud sandbox. All future DB work
must use the HTTPS driver, not `postgres` (postgres.js).

**Gaps found in prod env**: no `AWIN_*` vars exist in Vercel (Etsy affiliate
revenue may not be wired up — investigate). Vercel has `AWS_SECRET_ACCESS_KEY`
but `lib/amazon.ts` reads `AWS_SECRET_KEY` (PA-API enrichment likely never
worked in prod — confirm before relying on it).

**Baseline metrics (lifetime, as of today)**:
- 109 bundles, 3,165 products indexed
- 22,179 bundle views; 103 bundle clicks + 91 product clicks; 9 shares;
  only 51 products have ever been clicked
- **Last bundle created 2026-04-15. Zero searches recorded in 30 days.**

**Read**: the site gets some residual view traffic but the generate-on-demand
funnel is dead — nobody completes a search. View→click conversion is ~0.5%.
The catalog pivot (ROADMAP Phase 1) is not just a cost play; it is the
relaunch. Priority confirmed.

**Still blocked on**: routine creation errored in Cameron's UI ("Failed to
create routine") — screenshot showed the wrong repo attached
(`cameronehrlich/37cli` instead of `37-Inc/goose.gifts`), likely because the
Claude GitHub App isn't installed on the 37-Inc org, so the repo doesn't
appear in the picker. Fix steps sent to Cameron. `VERCEL_TOKEN` also still
needs to be added to the cloud environment's env vars (it only lives in chat
right now; future runs need it).

---

## 2026-07-01 — Day 0: Handover

**Status**: Cameron handed over full operation (merge/deploy/daily autonomy).
Established the operating system: RUNBOOK (daily loop + weekly check-in +
escalation), ROADMAP (catalog-first pivot, owner-approved), NEEDS (prioritized
asks), and this journal.

**Site health**: https://www.goose.gifts/ up (200, title renders), sitemap 200.
No production credentials in this environment yet, so no analytics read today.

**Key decisions**:
- Adopted the catalog-first pivot as ROADMAP Phase 1: nightly ingestion →
  pre-scored, pre-embedded product catalog; thisiswhyimbroke-style landing
  grid; realtime pgvector semantic search. Rationale: latency, marginal cost
  → ~0, and SEO surface. pgvector already enabled; `gift_bundles.embedding`
  exists; bandit rotation exists — good foundations.
- Weekly check-ins = GitHub issues (they email Cameron). Urgent = issue
  mentioning @cameronehrlich.

**Blocked on**: NEEDS #1 (Cameron creates the daily routine — I can't) and
NEEDS #2 (env credentials). Communicated in handover reply.

**Addendum (same day)**: Cameron asked me to create the routine and pull
Vercel values myself. Verified directly: api.vercel.com is reachable from
the cloud environment (only auth missing), claude.ai is not (Cloudflare
challenge; routines are account-bound regardless). Response: wrote
`scripts/ops/pull-env.sh` (given `VERCEL_TOKEN`, discovers the project and
writes all decrypted production env vars to `.env.local`) and wired it in as
runbook step 0. NEEDS #2 collapsed from ~14 copied values to one token; the
Vercel-token P1 item merged into it. Routine creation remains the one truly
owner-only step.

**Plan for next run**:
1. If credentials landed: audit real analytics (search terms, CTRs, zero-result
   queries) and record a baseline metrics snapshot here.
2. Start ROADMAP 1a regardless of credentials: catalog schema migration +
   ingestion pipeline skeleton (compiles/builds without secrets; goes live
   the moment keys exist).
3. If nothing from Cameron within 3 days: open a (non-urgent) reminder issue.
