# goose.gifts — Operations Journal

Newest entries first. Every scheduled run appends an entry. This file is the
operator's memory across runs — write for a cold start.

---

## 2026-07-04 - Daily ops: gift-guide SEO pages shipped

**Health**: production homepage, `/sitemap.xml`, `/search`, and sample bundle
`/trendy-gifts-for-82-year-old-men-who-love-gadgets-qzug` all returned 200.
The bundle page had the expected title, canonical, and JSON-LD.

**Metrics snapshot**: Vercel Web Analytics reported 20 visitors and 30
pageviews for 2026-06-04 through 2026-07-04 UTC. Top path remains `/` with 17
visitors / 18 pageviews. Database totals after today's catalog run: 109
bundles, 22,461 lifetime bundle views, 103 bundle clicks, 3,251 active
products, 17,330 product impressions, 92 product click events, and 267 lifetime
searches. Recent demand is thin but alive: 4 searches in the last 24h / 7d /
30d, with top recent searches including `dad with no spare time` and
`white elephant`.

**Shipped growth work**: added crawlable gift-guide pages at
`/gift-guides/white-elephant-gifts`,
`/gift-guides/funny-gifts-for-coworkers`,
`/gift-guides/funny-gifts-for-dads`, `/gift-guides/weird-kitchen-gadgets`, and
`/gift-guides/novelty-desk-toys`. The homepage now links to these guide pages,
and the sitemap includes them at daily priority. Each guide has query-targeted
metadata, canonical URL, visible editorial copy, visible product grids, and
matching ItemList/Product JSON-LD. This should move indexed pages and organic
long-tail coverage for the same themes the catalog discovery already targets.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 76 candidates, 4 inserted, 72 updated. Newly added products are active
and image/affiliate-backed, but they do not yet have product embeddings or
punny/witty copy; no separate enrichment command exists today.

**Review / QA**: self-reviewed the diff for SEO claims, visible content,
schema/content match, sitemap visibility, and layout risk. `npm run lint`,
`npm run build`, and `git diff --check` passed.

**Tomorrow**: either add product enrichment for newly discovered catalog items
or expand guide coverage from observed search demand once more searches accrue.

---

## 2026-07-03 - Clarified owner-level business mission

**Owner direction**: Cameron clarified that autonomous operation should behave
like a talented employee whose mission is to grow the business every day, not
just keep the checklist green.

**Shipped in this run**:
- Added a `Mission` section to `docs/ops/RUNBOOK.md` that frames every run
  around increasing business value through qualified traffic, catalog depth,
  conversion paths, analytics clarity, SEO/GEO coverage, site quality, or
  better learning.
- Updated operating principles so every non-incident run should ship a growth
  improvement, fix a quality/conversion issue, or produce concrete evidence
  that changes the next day's priorities.

**Next**: daily runs should use this mission as the tie-breaker when choosing
between maintenance, polish, catalog work, SEO/GEO, analytics, and conversion
improvements.

## 2026-07-03 - Added standing review and QA cadence

**Owner direction**: Cameron asked that autonomous operation include an explicit
review pass to catch and fix problems in my own changes, plus a QA process to
ensure the site still functions correctly and looks good.

**Shipped in this run**:
- Updated `docs/ops/RUNBOOK.md` so every shipped change now requires a
  self-review pass before verification.
- Split verification into a broader QA step covering build/lint, user-flow
  testing, visual checks for UI changes, SEO/GEO page checks, and production
  smoke checks after deploy.
- Added a cadence: daily smoke QA, visual QA for UI changes, weekly product
  quality review, and a monthly deeper audit for performance, accessibility,
  SEO crawlability, disclosures, analytics, and docs drift.

**Next**: future daily runs should log what the review/QA pass found, including
whether it fixed issues before shipping.

## 2026-07-03 - Corrected unknown-price catalog policy

**Decision**: Missing Amazon PA-API price data is expected enough that it
should be treated as "unknown price," not as proof the product is unsuitable
for the live catalog. Amazon's current PA-API docs still list price resources,
but they also mark PA-API/Offers as deprecated and direct migration toward
Creators API / OffersV2. Until that migration is done, title/image/affiliate
link are the stronger activation signals.

**Shipped in this run**:
- Changed `catalog:prefetch` so image-backed products with affiliate links stay
  active when `price = 0`; known prices still need to fit the configured
  min/max range.
- Reversed the prior zero-price cleanup policy by reactivating inactive
  image-backed products whose price is unknown.
- Updated the homepage catalog query to include active unknown-price products
  and display them as `Check price` instead of `$0.00`.
- Renamed the ops analytics metric from active zero-price products to active
  unknown-price products so the snapshot no longer reports expected missing
  offer prices as a catalog-readiness defect.
- Updated the runbook and needs list so future runs do not treat missing PA-API
  offer price as a catalog blocker.

**Next**: keep pricing/enrichment on the roadmap for better ranking and display,
but do not block catalog growth on it. The higher leverage path is now copy,
tagging, embeddings, and SEO pages over a larger active product base.

## 2026-07-03 - Catalog prefetch survives Amazon throttling

**Health + GitHub checks**:
- Live site checks passed: homepage 200 with correct title, `/sitemap.xml` 200,
  `/search` 200, and sample bundle permalink
  `/unique-gift-bundles-for-dads-48th-anniversary-t55h` redirected to `www`
  and returned 200.
- No open PRs were waiting. The only open issue is weekly check-in #20, with
  no comments or new direction from Cameron.

**Traffic snapshot**:
- Vercel Web Analytics, 2026-06-03 through 2026-07-03 UTC: 19 visitors and
  24 pageviews. Traffic is still overwhelmingly homepage/direct.
- Database activity remains dormant: 0 searches and 0 product-click events in
  the last 30 days.

**Shipped in this run**:
- Hardened `catalog:prefetch` so Amazon PA-API throttling no longer aborts the
  daily run. `SearchItems` fallback now degrades gracefully, both Amazon calls
  retry with backoff on 429s, and a repeatedly throttled theme is skipped
  instead of crashing the entire batch.
- Ran the bounded daily discovery command:
  `npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
  It inserted 32 products and updated 44 existing rows across six themes.

**Catalog snapshot after ship**:
- Products: 3,247 total.
- Active/inactive: 17 / 3,230.
- Active zero-price products: 0.
- Embedded products: 0. Products with punny copy: 0.
- Recent windows now show 32 products created in the last 24 hours and 82 in
  the last 7/30 days.

**Verification**:
- `npm run analytics:snapshot`
- `npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`
- `npm run build`
- `npm run lint`

**Learned**: the current ingestion bottleneck is reliability, not discovery
volume. Google CSE is surfacing enough candidates, but Amazon rate limits can
interrupt enrichment unless the batch is defensive. Pricing is still the main
catalog-depth blocker because new discoveries continue landing inactive.

**Next**: solve price/enrichment so discovered rows can become active inventory,
then add the planned punny-copy/tagging/embedding pass once the active catalog
can grow again.

## 2026-07-02 - Catalog cleanup before daily discovery

**Health + GitHub checks**:
- Live site checks passed: homepage 200 with correct title, `/sitemap.xml` 200,
  `/search` 200, and sample bundle permalink
  `/fun-gift-bundles-for-gamers-who-love-style-96vd` 200.
- No open PRs or issues were waiting in `37-Inc/goose.gifts`.

**Traffic snapshot**:
- Vercel Web Analytics, 2026-06-02 through 2026-07-02 UTC: 17 visitors and
  22 pageviews. Traffic is still almost entirely homepage/direct.
- Database activity remains dormant: 0 searches and 0 product-click events in
  the last 30 days.

**Shipped in this run**:
- Updated `catalog:prefetch` so each non-dry run first deactivates any active
  product rows with `price <= 0`, matching the existing rule that new no-price
  discoveries should stay out of the live catalog.
- Ran the bounded daily discovery command:
  `npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
  It deactivated 3,148 legacy zero-price rows, inserted 50 newly discovered
  products, and updated 2 existing products.

**Catalog snapshot after ship**:
- Products: 3,215 total.
- Active/inactive: 17 / 3,198.
- Active zero-price products: 0.
- Embedded products: 0. Products with punny copy: 0.
- Amazon PA-API is still returning title/image/review data without usable
  `Offers.Listings.Price`, so all 50 new discoveries were staged inactive.

**Verification**:
- `npm run analytics:snapshot`
- `npm run build`
- `npm run lint`

**Learned**: yesterday's biggest catalog-quality problem was not homepage
rendering but inventory truthfulness. Marking zero-price legacy rows inactive
immediately makes homepage/search metrics more honest and prevents bad rows
from contaminating future catalog work.

**Next**: solve pricing/enrichment so daily discoveries can become active
inventory, then add the planned punny-copy/tagging/embedding pass for search
and SEO pages.

## 2026-07-01 (late night) - Analytics snapshot and HTTPS DB driver cleanup

**Analytics setup found**:
- Vercel Web Analytics is installed (`@vercel/analytics`) and readable through
  the Web Analytics API.
- Google Analytics / Google Ads tags are present in `app/layout.tsx`
  (`G-6RR3HPR747`, `AW-17626116539`), but no GA Data API read credentials are
  present in env.
- PostHog is not installed.

**Traffic snapshot**:
- Vercel Web Analytics, 2026-06-02 through 2026-07-02 UTC: 17 visitors and
  22 pageviews. Top path is `/` with 16 visitors / 17 pageviews. Referrers are
  mostly direct/unknown; visible referrers include findicons.com,
  greenmaven.com, search.spacetime.com, and search.yam.com.
- Vercel Hobby plan limits Web Analytics history to the latest 31 days.
  Custom events return 402 unless the project is on Pro/Enterprise.
- Database interaction history remains dormant: 0 searches and 0 product click
  events in the last 30 days; latest product click was 2026-04-16; latest
  recorded search was 2025-10-30. Lifetime DB totals: 109 bundles, 3,165
  products, 22,201 bundle views, 103 bundle clicks, 91 product-click events,
  263 searches.

**Shipped in this pass**:
- Added `npm run analytics:snapshot`, a read-only ops command that combines
  Vercel visitor/pageview data with Neon search/click/catalog-quality data.
- Updated the runbook to make that command the standard daily data read.
- Switched `lib/db/index.ts` from `postgres.js` to Drizzle's Vercel Postgres
  adapter so app DB access uses the HTTPS-friendly driver. Removed the direct
  `postgres` dependency.
- Added a NEEDS note for deeper analytics reporting: GA Data API credentials or
  a PostHog project key/host if we want funnel analytics beyond Vercel's free
  31-day pageview history and the app's own DB events.

**Catalog gap observed**: 3,148 active products still have `price = 0` from the
old catalog. The homepage query filters them out, but the ingestion/backfill
work should deactivate or reprice these before relying on catalog-wide search.

**Next**: build the price/enrichment backfill path, then LLM copy/tagging and
embeddings. Analytics says the idle site still gets a trickle of visitors, but
no one is searching or clicking; the relaunch needs homepage/catalog depth more
than dashboard polish.

---

## 2026-07-01 (late night) - Lint cleanup and catalog-first homepage

Cameron asked to fix all lint issues, clean up unneeded code, and get the site
on track for the ROADMAP Phase 1 version: daily prefetched products plus a
thisiswhyimbroke-style catalog homepage.

**Shipped in this run**:
- `npm run lint` now passes with zero warnings. Fixed raw `<img>` usage,
  hook dependencies, unused imports/functions, and stale one-off migration
  typing.
- Removed production-exposed debug surfaces: `/debug-images` and
  `/api/test-images`.
- Reworked the homepage from old generate-on-demand-first flow to a dense
  catalog-first product grid. The old custom bundle builder remains lower on
  the page as a secondary path.
- Removed fabricated review/social-proof UI from product cards. Cards now show
  real rating/review data only when present.
- Wired the new catalog fields into product reads (`punny_title`,
  `witty_description`, `humor_tags`, `quality_score`, `source_query`,
  `is_active`) and filtered homepage products to active, priced, image-backed
  affiliate rows.
- Added `npm run catalog:prefetch`, a bounded daily discovery command that
  uses Google CSE + Amazon PA-API, upserts through `@vercel/postgres`, tags and
  scores discoveries, and keeps no-price products inactive.
- Fixed Amazon PA-API env handling to accept both `AWS_SECRET_KEY` and
  `AWS_SECRET_ACCESS_KEY`, and aligned PA-API signing headers with the existing
  credential test harness.

**Learned**: PA-API credentials now sign successfully and return item/title/image
data, but current SearchItems/GetItems responses omit `Offers.Listings.Price`.
The prefetch command therefore stages new Amazon discoveries inactive
(`price=0`, `is_active=false`) until pricing/enrichment is solved. The live
homepage excludes those rows.

**Verification**:
- `npm run lint` passes with zero warnings.
- `npm run build` passes with no browser-data warnings after refreshing
  `caniuse-lite`/`baseline-browser-mapping` lockfile data.
- `npm run catalog:prefetch -- --dry-run --themes "funny white elephant gifts"
  --theme-limit 1 --per-theme 5 --max-new 5` discovered 6 candidate products,
  all inactive because PA-API omitted prices.
- Local browser check at desktop and 390px mobile: homepage rendered 16 active
  product cards, no horizontal overflow, no broken images reported, and no
  console errors.

**Next**: solve active-product enrichment. Options: find why PA-API is omitting
offers, add a compliant alternate price source, or allow Etsy/Awin ingestion
once Awin credentials are available. Then add LLM copy/embedding to
`catalog:prefetch` so daily discoveries become active search-ready catalog
items instead of only staged candidates.

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
