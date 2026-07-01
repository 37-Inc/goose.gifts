# goose.gifts — Operations Journal

Newest entries first. Every scheduled run appends an entry. This file is the
operator's memory across runs — write for a cold start.

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
