# Historical Operator Handoff — goose.gifts

**Superseded July reference — not current operating authority.** Use
`RUNBOOK.md`, current `JOURNAL.md` entries and canonical Beads for execution,
release, credentials and schedules. Cloudflare is the Stupid Gifts release
target; legacy Vercel Git deployment is frozen. Do not create another schedule
or execute the old setup/bootstrap below. The existing `goose-gifts-daily-ops`
task and its current writer/access gates remain authoritative.

October22 live checkpoint: Cloudflare now serves `82efb21` /
`homepage-code-82efb2100d66`; UI/privacy cleanup is deployed and both completed
publication runs must not be replayed. Full catalog migration and persistent
product/supplier-field separation remain open, and the daily D1 writer is still
gated. Use the current operator in `goose-production-cutover`, preserving the
original `9943718` checkout/workspace as historical evidence. See the current
production checkpoint in `STUPID_GIFTS_STAGING.md`.

The remainder records the July2026 setup; it is retained as history only.

---

You are taking over as the autonomous operator of **goose.gifts**, an
AI-powered gag-gift affiliate site (Next.js 15 + Neon Postgres on Vercel;
revenue from Amazon Associates, Etsy planned). The owner, Cameron Ehrlich
(GitHub org `37-Inc`, repo `37-Inc/goose.gifts`), has granted **standing
authorization to merge PRs and deploy to production**. The former automatic
Vercel deployment path described by this July setup is now frozen.

## Your first task: set up the daily schedule

Create a **daily scheduled routine** on this repository with a morning
run time and this prompt:

> You are the autonomous operator of goose.gifts with standing authorization
> from the owner to merge and deploy. Read docs/ops/RUNBOOK.md in the
> repository and execute today's run exactly as it describes.

Requirements for the schedule's execution environment:
- **Full network access** (it must reach the Vercel API, Neon database over
  HTTPS, OpenAI, Google Custom Search, Etsy, and the live site).
- The environment variable **`VERCEL_TOKEN`** must be set (Cameron will
  provide it). Everything else self-bootstraps: `./scripts/ops/pull-env.sh`
  pulls all production env vars from Vercel into `.env.local` (runbook
  step 0).
- Permission to push branches and merge PRs on `37-Inc/goose.gifts`.

Known pitfall: creating routines via claude.ai's web form was failing with
"Failed to create routine" on 2026-07-01 (research preview bug). If it still
fails, try the Claude Desktop app (Routines sidebar → New routine → Remote)
or `/schedule` from a local Claude Code CLI. The owner explicitly does NOT
want a GitHub Actions-based scheduler.

## The operating system (read these, in the repo)

- **`docs/ops/RUNBOOK.md`** — the daily loop, weekly check-in (GitHub issue,
  Mondays — GitHub's notification email doubles as the owner check-in),
  urgent-escalation path, and guardrails (no spending money, no
  spam/compliance-risking tactics, never merge a failing build, ask the
  owner before anything irreversible or outward-facing beyond the site).
- **`docs/ops/ROADMAP.md`** — owner-approved strategy.
- **`docs/ops/NEEDS.md`** — prioritized asks for the owner; surfaced every
  weekly check-in.
- **`docs/ops/JOURNAL.md`** — cross-run memory. Read the recent entries
  before doing anything; append an entry after every run.

## Current state (2026-07-01)

- **The strategy**: pivot from generate-on-demand (user submits form → slow
  LLM + live product-API search) to a **pre-indexed catalog**, in the style
  of thisiswhyimbroke.com. Nightly batch: discover gag gifts → LLM
  filter/tag/write punny copy → embed → store. User experience: a fast,
  SEO-optimized landing grid of best performers + a single search bar doing
  realtime semantic search (pgvector) over the catalog. This moves LLM cost
  out of the request path entirely. Details in ROADMAP Phase 1. The homepage
  now uses product-catalog search as the primary flow. The old public bundle
  generator, bundle search, bundle permalink pages, and admin bundle surfaces
  have been removed from the maintained runtime path.
- **Current growth checklist**: `docs/ops/SEO_GROWTH_TODO.md` tracks the
  standing SEO/GEO work. Current priorities are stale bundle-slug recovery
  through redirects, a recurring weekly sprint to publish 3-5 new or materially
  improved catalog-backed guide pages, server-rendered schema/FAQ content,
  polished desktop/mobile presentation, Search Console access, and product
  price/revenue coverage. These are new guide/page packages, not a return to
  the old bundle permalink product.
- **Why it's urgent**: baseline from production shows the site is dormant —
  109 bundles, 3,165 products, 22k lifetime views, but **zero searches and
  zero new bundles in the last 30 days** (last: 2026-04-15). The pivot is
  the relaunch, not an optimization. It is the top priority; current work
  should keep improving catalog depth, enrichment quality, search relevance,
  and outbound CTR.
- **Technical facts learned the hard way**:
  - Cloud sandboxes block raw TCP 5432 — use the HTTPS driver
    (`@vercel/postgres`, already a dependency), never `postgres`/psql.
  - The Vercel env **list** API returns values encrypted; `pull-env.sh`
    already handles per-var decryption. Don't rewrite it, just run it.
  - pgvector is enabled in Neon; product embeddings use 1536 dimensions.
    Homepage rotation uses catalog quality and daily seeded exploration.
  - Prod env gaps: no `AWIN_*` vars exist (Etsy affiliate revenue likely
    never wired). Amazon product data uses the Creators API OAuth variables
    (`AMAZON_CREATORS_CREDENTIAL_ID`, `_SECRET`, and `_VERSION`) plus
    `AMAZON_ASSOCIATE_TAG`; Google CSE is discovery-only fallback data.
- **Admin dashboard** and detailed click writes are retired. Historical schema
  and records remain for rollback. Use GA4/PostHog for current product actions,
  `analytics:snapshot` for catalog/aggregate search diagnostics, and catalog
  report/review CLIs for operations. `/api/admin/catalog-cache` retains separate
  bearer authentication at its existing URL.

## Owner contact

- Weekly check-in + needs list: GitHub issue per RUNBOOK (emails him).
- Urgent: GitHub issue titled `URGENT: …` mentioning `@cameronehrlich`.
- Email: cameronehrlich@gmail.com (only if GitHub is unavailable).
