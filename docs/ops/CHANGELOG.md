# goose.gifts — Running Changelog & Plan

A running, human-readable log of the meaningful changes made to goose.gifts and
what's planned next. Its job is to give Cameron and any Claude session shared
context: **what we've done, and where we're going.**

- This log is commingled on purpose: both interactive owner+Claude sessions and
  the autonomous daily operator write here. Tag each entry with who did it —
  `[owner+claude]` for a hands-on session with Cameron, `[daily-ops]` for an
  autonomous run.
- Keep it skimmable. One short block per change: **what shipped**, **why**, and
  the PR/commit. Detailed operational metrics stay in `JOURNAL.md`; strategy
  lives in `ROADMAP.md`; open asks live in `NEEDS.md`. This file is the
  narrative thread across all of them.

> **Convention (do not skip):** update this file as part of any working session
> — append shipped work to the Changelog and keep "Upcoming / planned" honest —
> *before ending the session*, without waiting to be asked. See `CLAUDE.md`.

---

## Upcoming / planned

Living list; reorder as priorities shift. Not a commitment, a shared view of
what's likely next.

- **Design polish, round 2** (owner+claude track): tighten the mobile search
  bar (placeholder truncation), revisit guide-page headers to match the new
  cleaner homepage style, and consider per-product Open Graph share images.
- **Catalog-first relaunch** (daily-ops track, top priority): keep improving
  catalog depth, enrichment/relevance quality, semantic-search results, and
  outbound CTR. Full plan in `ROADMAP.md` Phase 1.
- **SEO/GEO network** (daily-ops track): guide-page network + indexation repair
  per `SEO_GROWTH_TODO.md`, gated on Search Console access (`NEEDS.md`).
- **Revenue signal**: wire up affiliate earnings data (Amazon Associates / Awin)
  so ranking can weight by commission, not just clicks (`NEEDS.md`).

---

## Changelog

Newest first.

### 2026-07-16 — Amazon Creators API migration `[owner+claude]`

Replaced the retired PA-API/SigV4 catalog path with an OAuth Creators API
client for discovery, enrichment, and stale-product refresh (PR #57,
rebased onto the design refresh and merged to `main`). Removed the legacy AWS
configuration and test/code cruft; Google CSE remains an optional verified-only
discovery fallback. Live API and dry-run catalog/revalidation checks passed.

The production cutover is complete: Creators credentials are installed in
Production, Preview, and Development; retired AWS variables/toggle are gone;
and Vercel deployment `goose-gifts-e5cj376vm-37-inc.vercel.app` is Ready with
the public aliases. Homepage, sitemap, redirect, and semantic-search smoke
checks passed.

### 2026-07-16 — Homepage & catalog design refresh `[owner+claude]`

Made the browsing experience feel like a polished consumer product instead of a
dense data grid. **Shipped to production** (PR #58, merged, deploy `e3d920c`
verified live).

- Product grid: 6 columns → max 4 (2 mobile / 3 tablet), far more breathing room.
- Cards decluttered: soft rounded image tile with hover lift, two-line title,
  one witty one-liner, small retailer mark. Removed the "Check price" row (only
  17 of 3,314 products carry price data) and tag chips; real prices now show as
  a floating chip on the image.
- Hero recentered with a hand-drawn underline accent; search pill + guide chips
  are the focal point. Removed banded gray sections for one calm white surface.
  Search now shows skeleton tiles while loading; friendlier empty state.
- Guide pages and random-gift inherit the new cards via shared `ProductGrid`.

Also enabled `POSTGRES_URL`/`DATABASE_URL` for Vercel **preview** deployments
(settings change only, no data copied) so Cameron can preview future PRs against
real catalog data. Kept on by owner's request.

### 2026-07-01 — Project handover & operating system `[owner+claude]`

Cameron handed over day-to-day operation of goose.gifts. Established the
operating docs that everything else runs from: `RUNBOOK.md` (daily loop, weekly
check-in, escalation, guardrails), `ROADMAP.md` (catalog-first pivot),
`NEEDS.md` (owner asks), `JOURNAL.md` (operator memory), later `HANDOFF.md`.

- Built `scripts/ops/pull-env.sh`: bootstraps all production env vars from
  Vercel given a single `VERCEL_TOKEN` (handles the API's per-var encryption).
- Scheduler saga: claude.ai routine creation was broken in research preview; a
  GitHub Actions scheduler was built then removed at owner's request; a daily
  routine is instead set up by a separate agent per `HANDOFF.md`.
- Learned (now load-bearing facts): cloud sandboxes block raw Postgres TCP 5432
  — use the `@vercel/postgres` HTTPS driver; production baseline showed the site
  had gone dormant, confirming the catalog pivot as a relaunch.
