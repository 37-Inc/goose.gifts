# goose.gifts — Strategy & Roadmap

Owner-approved direction (Cameron, 2026-07-01): pivot from generate-on-demand
to a **pre-indexed catalog** model, in the style of thisiswhyimbroke.com.

## Why the pivot

Today's flow — user submits a form, then waits while we run LLM generation +
live Amazon/Etsy searches — has three problems:

1. **Latency**: tens of seconds before the user sees anything. Most bounce.
2. **Cost**: every search pays for LLM calls + product API calls, even for
   duplicate/similar queries.
3. **SEO**: the best content is trapped behind a form; crawlers see little.

The catalog model inverts it: discovery, curation, scoring, and embedding
happen **once per product, in a nightly batch**. The user-facing site becomes
fast, cheap, and crawlable.

## Phase 1 — Catalog-first architecture (current phase)

### 1a. Catalog schema & ingestion pipeline

- Extend `products` with: `embedding vector(1536)`, `humorTags text[]`,
  `punnyTitle`/`wittyDescription` (LLM-written copy), `qualityScore`,
  `sourceQuery`, `isActive`, `lastVerifiedAt`. pgvector is already enabled.
- Nightly ingestion job (script run during the daily ops session, later a
  Vercel cron): pick N discovery themes (seasonal occasions, trending topics,
  gaps from search analytics) → search Google CSE/Amazon + Etsy → dedupe
  against existing catalog → LLM pass to filter for genuine gag-gift quality,
  tag, and write punny copy → embed (`text-embedding-3-small`) → upsert.
- Target: 50–150 net-new products/day; catalog of thousands within a month.
- Re-verify stale products periodically (dead links, price drift) and
  deactivate the broken ones.

### 1b. New landing page (thisiswhyimbroke style)

- Home page = dense, scrollable grid of the best catalog items: punny title,
  image, price, one-liner; affiliate link on click. Ranked by the existing
  multi-armed bandit (CTR × recency × novelty), so the page self-optimizes.
- Statically rendered/ISR for speed and SEO; structured data (ItemList/Product)
  that matches visible products and uses clean, crawlable product images.
- Catalog cards must avoid promotional/composite marketplace images where
  possible. Normalize Amazon image URLs to their underlying product shot,
  render images contained rather than cropped, and treat text-heavy/seasonal
  promo imagery as a catalog-quality issue in daily ops.
- Do not revive bundle permalinks for the main product. Long-tail SEO should
  come from catalog-backed persona, occasion, and price pages with visible
  product feeds.

### 1c. Realtime semantic search

- Single search bar. Query → one embedding call → pgvector cosine similarity
  over the catalog → instant results (sub-second, ~$0.00002/query).
- Thin-result queries are logged as tomorrow's ingestion themes, so the search
  bar becomes a demand-discovery instrument without sending shoppers into a
  separate bundle flow.

### Cost effect

LLM + product-API spend becomes a fixed nightly batch (bounded, tunable);
marginal cost per visitor drops to ~zero. This is the main margin lever.

## Phase 2 — SEO page network

- Programmatic landing pages generated from the catalog: occasion pages
  ("funny white elephant gifts"), persona pages ("gifts for coworkers who
  love cats"), price pages ("gag gifts under $20"). Interlinked, in the
  sitemap, each with real products and LLM-written editorial copy.
- Query clusters should be built from Search Console when access exists, then
  from on-site searches and catalog themes until then. Each page should have a
  clear target query, H1, meta title/description, canonical, ItemList/Product
  schema where eligible, internal links to sibling clusters, and at least one
  product grid that is useful without JavaScript.
- Recurring cadence: every weekly check-in run should publish 3-5 new
  catalog-backed guide pages or materially improve existing ones, unless the
  catalog cannot support that many useful pages yet. These are non-legacy guide
  and roundup pages, not a return to bundle permalinks.
- Presentation standard: guide pages should feel editorially finished, with
  polished intro copy, scannable sections, useful product ordering, visible
  FAQ answers, related guide links, and desktop/mobile visual QA before merge.
- Seasonal calendar: build pages 6–8 weeks ahead of gifting peaks
  (Christmas/white elephant season is the big one — prep starts October;
  also Father's/Mother's Day, Valentine's, graduation, Halloween).
- Search Console feedback loop once access is granted (see NEEDS).

### Immediate SEO/GEO todo list

The actionable checklist lives in `docs/ops/SEO_GROWTH_TODO.md`. Treat it as
part of Phase 2 until the site has a meaningful crawl footprint.

Priority order:

1. Fix crawl-signal hygiene: canonical `www`, sitemap/robots consistency, raw
   server-rendered schema, and compressed share assets.
2. Recover stale indexed bundle URLs with permanent redirects into catalog
   searches or guide pages. Do not rebuild the old bundle product, but do not
   waste indexed long-tail demand on hard 404s.
3. Build a larger guide network from catalog reality: start with query/tag
   clusters that already have enough products, then expand toward weird
   combinatorial pages that publishers and retailers under-serve.
4. Add FAQ/editorial content to guide pages so AI search engines can cite the
   page as an answer source, not just a list of outbound products.
5. Improve price/revenue coverage as data becomes available so ranking can
   optimize for affiliate value, not just click volume.

## Phase 3 — Growth loops & revenue depth

- Shareability: OG images per product, Pinterest-optimized pages
  (gag gifts are a strong Pinterest category).
- Creative acquisition experiments: maintain a backlog of low-cost tests that
  could bring qualified shoppers without waiting for Google, such as themed
  Pinterest batches, linkable "ridiculous find of the day" pages, embeddable
  mini-roundups, creator/blogger pitch lists, seasonal PR hooks, and catalog
  data stories. Prepare assets and tracking first; get approval only for the
  outward-facing post/send/spend.
- Email capture + weekly "dumbest gifts this week" newsletter
  once Cameron approves email collection and outbound content.
- Owned social distribution once Cameron approves channels: X/Twitter for
  daily ridiculous finds, TikTok/Reels/Shorts for vertical product roundups,
  and Pinterest pins for evergreen gag-gift searches. Generate assets from the
  catalog, track tagged links, and avoid spammy posting or fake engagement.
- Conversion and retention loops: test homepage ranking, product-card copy,
  guide CTA placement, outbound-click instrumentation, saved/favorite concepts,
  and returning-visitor paths so traffic has more chances to become revenue.
- Revenue optimization: compare Amazon vs. Etsy/Awin EPC per category once
  reporting access exists; weight the bandit by commission, not just CTR.

## Success metrics

- Catalog size & freshness; % searches with strong semantic hits.
- Organic sessions (Search Console), indexed pages.
- Non-search acquisition: qualified referral/social/Pinterest sessions,
  repeatable content assets prepared, and approved distribution experiments run.
- Conversion quality: guide/home/search outbound CTR, product click depth,
  source-attributed clicks, and returning-user engagement.
- Outbound affiliate CTR; clicks → revenue once reporting access exists.
- Marginal cost per visitor (should trend to ~zero after Phase 1).
