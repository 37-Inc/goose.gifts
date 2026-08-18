# SEO Growth Todo

Created from the 2026-07-04 SEO/GEO audit. Keep this file current during
daily ops so crawl growth work stays actionable instead of becoming a one-off
report.

## Shipped 2026-07-04

- [x] Canonicalize the site around `https://www.goose.gifts` in metadata,
  sitemap, robots, Open Graph, and JSON-LD.
- [x] Recover old indexed bundle URLs with permanent redirects to relevant
  catalog searches or gift-guide pages instead of leaving them as dead 404s.
- [x] Expand the gift-guide network from a handful of broad pages into
  catalog-backed long-tail pages for personas, occasions, and weird recipient
  intents.
- [x] Add raw server-rendered WebSite, Organization, BreadcrumbList, ItemList,
  and FAQPage schema where the visible page content supports it.
- [x] Add visible FAQ/editorial blocks to guide pages so AI search engines can
  extract direct answers instead of seeing product grids only.
- [x] Compress and resize public share assets so social preview images match
  declared metadata dimensions and do not waste crawl/share weight.

## Shipped 2026-08-07

- [x] Added canonical `/gifts/<slug>` pages with Goose-owned public UUIDs and
  stable slug history. The four public-Pinterest products have edited,
  listing-specific copy and are included in the sitemap; all other catalog gift
  pages remain `noindex` until reviewed.
- [x] Preserved every existing product-pinned `/random-gift?gift=<id>` URL as a
  permanent redirect to its canonical gift page, retaining UTM attribution.
- [x] Replaced the product-page 500-character indexing shortcut with a factual
  gate covering fresh Amazon verification, explicit offer availability,
  current source hashes, editorial review quality, duplicate ownership, and
  substantive multi-paragraph copy. Held pages remain `noindex, follow`.
- [x] Backfilled a bounded first cohort of 25 source-verified catalog products,
  bringing the indexable product total to 29, and added a crawlable paginated
  `/gifts` directory. The sitemap uses editorial content timestamps rather than
  catalog clicks or routine refresh dates.
- [ ] Recheck the 2026-08-07 product cohort after 7, 14, and 28 days: submitted,
  discovered, crawled, indexed, Google-selected canonical, impressions, clicks,
  and soft-404/duplicate exclusions. Expand in bounded cohorts only when factual
  QA and crawl/index signals remain clean.
  - Baseline: sitemap resubmission accepted at `2026-08-08T04:10:47Z` with HTTP
    204 and pending processing. One approved URL was unknown to Google and one
    was discovered but not indexed. Do not count either state as indexation.
  - 7-day checkpoint (2026-08-14): one of five sampled eligible gift URLs is
    submitted and indexed (the Screaming Goat), with matching Google/user
    canonicals, indexing allowed, and a successful mobile crawl. The hippo is
    discovered but not indexed; three sampled pages remain unknown. No
    `/gifts/` URL appeared in the current Search Analytics page report. The
    live sitemap contains 46 gift URLs and 94 URLs total. Search Console
    accepted a refresh on 2026-08-14 with HTTP 204, downloaded it at
    `16:48:52Z`, and now reports all 94 URLs with zero warnings/errors. Keep
    catch-up disabled and recheck at 14/28 days rather than extrapolating from
    one indexed sample.
  - Interim checkpoint (2026-08-18): the comparable five-page sample now has
    two submitted/indexed pages with matching Google/user canonicals and
    successful crawls (the original Screaming Goat and alligator), two
    discovered-not-indexed pages (hippo and ceramic eye), and one URL still
    unknown (Pizza Boss). No `/gifts/` URL appears in the current Search
    Analytics page report. This is progress, but not enough breadth to enable
    the 100/day catch-up before the scheduled 14/28-day checks.
  - The indexed goat exposed a Product-snippet error because its page declared
    Product schema without a fresh offer, review, or visible rating. The gift
    page schema now falls back to valid WebPage/Breadcrumb markup and emits a
    Product only when it has a current visible offer; this leaves robots,
    canonical, sitemap eligibility, and editorial content unchanged.
    PR #102 is deployed at `2eb445d8e51f7e2bd1da3218b6a06a31c5ae4ded`;
    live verification confirmed the indexed goat now has no Product object,
    retains `index, follow`, and keeps its matching canonical.

## Shipped 2026-08-09

- [x] Scoped the random-gift bot mitigation to `/random-gift` and private API/
  admin routes. Effective robots-policy tests prove Googlebot, Bingbot,
  OAI-SearchBot, and PerplexityBot can fetch canonical gift pages and guides;
  GPTBot, ClaudeBot, and Applebot-Extended can also fetch those public
  editorial pages while remaining blocked from the high-cost random route.
- [x] Added durable run/cohort telemetry before any catalog catch-up: exact
  selection and rejection histories, stable reason codes, factual snapshots,
  timing, Git revision, provider token usage, dated cost estimates, and an
  owner-readable intervention queue. The next weekly run must be audited by
  run ID before enabling the proposed 100/day catch-up.

## First-run remediation 2026-08-10

- [x] Corrected telemetry redaction so provider token counters remain numeric
  while credentials stay redacted, and added an idempotent UTC timestamp
  migration for exact run-time reporting.
- [x] Made editorial enrichment complete and non-destructive: four-product
  request maximum, one per-item retry for omitted/short drafts or reviews,
  response diagnostics, retention of a valid draft when an optional reviewer
  correction fails validation, and preservation of approved copy at both the
  application and database-upsert layers.
- [x] Reclassified incomplete generation as automatic `pending`/`stale` work;
  only explicit unsupported-fact rejections enter the owner queue.
- [x] Added authenticated post-job invalidation for canonical gift pages, the
  crawlable directory, related-product caches, the random pool, and the
  sitemap, with a five-minute fallback. This keeps sitemap membership aligned
  with the same eligibility gate that emits page robots metadata without
  reopening the high-cost random-page crawler path.
- [x] Production receipt: deployed the remediation, applied the UTC migration,
  restored the three reviewed pages from
  `catalog-editorial-cohorts/2026-08-10-recovery.json`, replay the exact held
  2026-08-10 cohort, and record run IDs, ready/pending/manual counts, token
  usage, API cost, sitemap membership, and live robots state before considering
  any catch-up cadence.
  - Recovery run `11d51739-ddf2-4496-8ba8-45a11efb309b` restored 3/3 reviewed
    pages. Exact held-cohort run `081dac8d-3e13-4a38-bebc-0882a5982279` and
    acceptance run `bdc8aa17-fb82-4f31-a044-c4768effa37d` ended at 20 ready,
    five blocked, one automatic pending item, and zero owner interventions.
    The two paid replays used 52,350 total provider-reported tokens and an
    estimated $0.013099.
  - Live acceptance: 46 gift URLs in the sitemap; every one returned 200 with a
    matching canonical and no `noindex`. Sampled held pages returned
    `200, noindex, follow` outside the sitemap. The legacy product-pinned random
    URL still returned a UTM-preserving 308. No sitemap resubmission was needed.
  - Keep 100/day disabled until the already-defined 7/14/28-day Search Console
    cohort shows healthy crawl, Google canonical, exclusions, and indexation.

## Shipped 2026-08-11

- [x] Improved the existing `/gift-guides/funny-gifts-for-dads` page from
  current page/query evidence rather than creating another URL. The 2026-07-14
  through 2026-08-09 window showed 285 impressions, zero clicks, and average
  position 44.1; the clearest clusters were `funny gifts for dad` (40
  impressions), `funny dad gifts` (31), and `dad joke gifts` (16).
- [x] Aligned the title, description, H1, and visible editorial around funny dad
  gifts and dad-joke intent. Added distinct birthday/holiday, hobby, and
  practical-novelty guidance; explicitly warns against guessing at technical
  fishing or grilling gear and against treating every dad as the same person;
  links contextually to fishing, golf, coffee, kitchen, and sarcastic-gift
  guides; and supplies page-specific visible FAQs that match the FAQ schema.
- [x] Verified that the Dad guide is submitted and indexed, indexing is
  allowed, Google and user canonicals both use `www`, the last mobile fetch was
  successful, and the live guide has 36 distinct eligible products. The live
  sitemap remains processed with zero errors and contains 94 URLs.
- [x] Reconfirmed that the random-page crawler mitigation has not leaked onto
  canonical product SEO. A representative enriched `/gifts/<slug>` page emits
  `index, follow` with a matching canonical and is discoverable in Search
  Console; it is currently discovered but not yet indexed, which is a rollout
  result to monitor rather than a reason to expose held pages.
- [ ] Recheck the Dad guide after 14 and 28 days (2026-08-25 and 2026-09-08):
  impressions, CTR, average position, organic sessions, and `gift_guide`
  outbound clicks. Do not revise it again before the evidence window closes
  unless rendering, canonical, schema, or indexation regresses.

## Shipped 2026-07-05

- [x] Recovered the stale optical illusion decor bundle URL into the canonical
  `/gift-guides/optical-illusion-decor-gifts` guide instead of sending that
  long-tail traffic to a raw search page.

## Shipped 2026-07-06

- [x] Published the Monday SEO sprint with five new catalog-backed guide pages:
  `/gift-guides/funny-gifts-for-moms`,
  `/gift-guides/funny-gifts-for-gamers`,
  `/gift-guides/funny-golf-gifts`,
  `/gift-guides/funny-gardening-gifts`, and
  `/gift-guides/funny-hostess-gifts`.
- [x] Expanded homepage guide links from 12 to 18 so the new guide pages get
  immediate internal links instead of relying only on sitemap discovery.

## Shipped 2026-07-07

- [x] Published `/gift-guides/funny-poop-gifts` from on-site searches for
  `poop` and related bathroom-humor terms. The live catalog had enough matching
  active products for a useful server-rendered guide, and the homepage now links
  to it alongside the existing dad-fishing guide candidate.
- [x] Added legacy slug routing for `poop`, `toilet`, and `fart` bundle-style
  URLs so future stale long-tail hits land on the canonical guide instead of a
  generic search page.

## Shipped 2026-07-08

- [x] Prepared the first Pinterest API pin-draft manifest for five existing
  evergreen guide pages with UTM-tagged URLs, board mapping, and Trial-create
  support for the Standard-access demo. No public posting shipped.

## Shipped 2026-07-10

- [x] Added top-search output to the daily analytics snapshot so future
  SEO/GEO candidates can come from visible query demand instead of hidden
  database rows.
- [x] Added admin dashboard acquisition-source and UTM-campaign panels so
  Pinterest, AI-search, referral, and other lead-generation tests can be judged
  by attributed outbound product clicks.
- [x] Changed the Vercel apex-domain redirect from temporary 307 to permanent
  308 for `goose.gifts` → `www.goose.gifts`; Search Console had selected the
  apex URL despite the declared `www` canonical.
- [x] Added an indexation gate: pause bulk guide publishing while the sitemap
  reports zero indexed pages or representative guides remain unindexed.

## Shipped 2026-07-11

- [x] Changed the retired `/search` route from a temporary redirect to a
  permanent redirect into the homepage catalog search (`/` or `/?q=...`). GA4
  still showed `/search` and legacy bundle-era titles in recent landing-page
  rows, so this consolidates crawl and analytics signals on the current
  catalog-first surface.
- [x] Rechecked the indexation gate before publishing more guide pages:
  Search Console still reports 44 submitted sitemap URLs and 0 indexed, the
  homepage still has Google choosing the apex canonical, and the representative
  white-elephant guide is still unknown to Google.

## Shipped 2026-07-12

- [x] Added a crawlable `/gift-guides` directory with visible links to all
  43 maintained guide pages, canonical metadata, and CollectionPage/ItemList
  structured data. Linked it from the header, footer, and sitemap so existing
  catalog-backed guides are easier for users and crawlers to discover.
- [x] Rechecked the indexation gate before publishing more pages: Search
  Console still reports 44 submitted sitemap URLs and 0 indexed, the homepage
  still has Google choosing the apex canonical from a 2026-07-08 crawl, and
  the representative white-elephant guide is still unknown to Google.

## Shipped 2026-07-14

- [x] Added `/random-gift`, a crawlable lead-generation utility with a stable
  canonical route, Product/WebPage schema, header/footer/sitemap links, and
  product click tracking under the `random_gift` source. This gives future
  social/newsletter/community drafts a specific utility to share without
  posting externally today.
- [x] Rechecked the indexation gate before publishing more guide pages:
  Search Console still reports 44 submitted sitemap URLs and 0 indexed, the
  homepage still has Google choosing the apex canonical from a 2026-07-08
  crawl, and the representative white-elephant guide is still unknown to
  Google.

## Shipped 2026-07-15

- [x] Preserved the daily catalog growth loop after Amazon deprecated PA-API:
  Google CSE discoveries now retain usable product metadata and canonical
  Associate-tagged links when `GetItems`/`SearchItems` return the migration
  error. Remote revalidation fails safe without deactivating products.
- [x] Rechecked the indexation gate: Search Console still reports 47 submitted
  sitemap URLs and 0 indexed; the homepage inspection is unchanged from its
  2026-07-08 crawl and the representative white-elephant guide remains
  discovered but not indexed. Bulk guide publishing remains deferred.

## Shipped 2026-07-31

- [x] Improved the existing `/gift-guides/funny-gifts-for-coworkers` page from
  current combined page/query evidence instead of creating another guide. The
  page led the scheduled set with 269 impressions, 0 clicks, and average
  position 39.9; observed clusters included funny coworker gifts, funny gifts
  for employees and colleagues, and funny boss gifts.
- [x] Extended the guide model with optional page-specific editorial sections
  and FAQ overrides. The coworker page now explains the office-safe room test,
  relationship and power-dynamic constraints, desk-gift tradeoffs, and links
  contextually to boss, desk-toy, office-prank, and Secret Santa guides. No
  generic copy was added to the other guides.
- [ ] Recheck the coworker page after 14 and 28 days: impressions, CTR, average
  position, organic sessions, and `gift_guide` outbound clicks. Do not revise
  again before evidence has time to move unless a rendering/indexation defect
  appears.

## Shipped 2026-08-18

- [x] Improved the existing `/gift-guides/secret-santa-gag-gifts` page from
  current page/query evidence rather than creating another URL. The 2026-07-20
  through 2026-08-16 window showed 248 impressions, zero clicks, and average
  position 54.7. Visible page-filtered query evidence included `funny secret
  santa gifts`, `gag gifts for christmas exchange`, `secret santa funny gifts`,
  and adjacent white-elephant phrasing that the page needed to distinguish.
- [x] Aligned the title, description, H1, and introduction around funny Secret
  Santa gifts and assigned-recipient intent. Added specific recipient,
  workplace, budget, handoff, and second-life guidance; contextual links to
  coworker, boss, white-elephant, and Christmas guides; and three page-specific
  visible FAQs that match the FAQ schema. The catalog audit found 12 distinct
  eligible products.
- [x] Verified before the edit that the Secret Santa URL is submitted/indexed,
  indexing is allowed, Google and user canonicals match `www`, and its last
  mobile fetch succeeded. Recheck impressions, CTR, position, organic sessions,
  and `gift_guide` outbound clicks on 2026-09-01 and 2026-09-15; do not revise
  again before those checkpoints unless a technical regression appears.
- [x] Production acceptance: PR #107 merged as `c7e9bcd8`; the exact Vercel
  deployment is READY. The live guide returns 200 with its new title,
  description, H1, editorial, FAQ content, and matching canonical, has no
  `noindex`, and appears in the current 97-URL sitemap alongside 49 eligible
  gift pages. The indexed Screaming Goat remains `index, follow`, and its old
  Pinterest destination still returns a UTM-preserving 308 to the exact slug.

## Shipped 2026-08-04

- [x] Improved the existing `/gift-guides/white-elephant-gifts` page from
  current page/query evidence instead of creating another URL. It had 260
  impressions, 0 clicks, and average position 66.8; its strongest clusters were
  `funny white elephant gifts`, `funny white elephant gift ideas`, `hilarious
  white elephant gifts`, and `white elephant gag gifts`.
- [x] Aligned the search title, description, and H1 around funny white elephant
  gifts people will actually steal. Added a people-first four-part rubric for
  quick reaction, usefulness, stealability, and broad room fit; page-specific
  FAQs; and contextual links to adult, workplace-safe, Secret Santa, and Dirty
  Santa guides. The live catalog audit found 34 distinct products, so the
  editorial layer is backed by useful inventory.
- [ ] Recheck the white-elephant page after 14 and 28 days: impressions, CTR,
  average position, organic sessions, and `gift_guide` outbound clicks. Do not
  revise again before evidence has time to move unless rendering or indexation
  regresses.
- [x] 2026-08-07 early hold checkpoint: the current 28-day window shows white
  elephant at 292 impressions, 0 clicks, and position 66.3; coworkers is at 392
  impressions, 0 clicks, and position 39.5. Both URLs are submitted and indexed,
  but Search Console's last crawls are still 2026-07-18, before their editorial
  changes. Keep both 14/28-day holds; do not confound them with another edit.

## Ongoing Daily Ops

- [ ] Use on-site search logs to propose new guide pages, but only publish a
  page when the catalog has enough real products to make it useful.
- [ ] Recycle high-value old bundle slugs into canonical guides or catalog
  searches when they appear in analytics or search results.
- [ ] Prefer long-tail pages where goose.gifts can win on specificity:
  examples include `funny gifts for dads who fish`, `cat lover gag gifts`,
  `office-safe white elephant gifts under $25`, and `weird kitchen gadgets
  under $20`.
- [ ] Publish price-specific guide pages only after enough products on those
  pages have reliable price data.
- [ ] Keep each new guide page internally linked, in the sitemap, and backed by
  server-rendered products, metadata, canonical URL, and schema.
- [ ] Track whether SEO changes move indexed pages, organic sessions, on-site
  searches, and product clicks.

## Scheduled Opportunity Pages — 2026-07-28

The twice-weekly Pinterest and organic-growth studio may improve at most one of
these existing pages on the first run each week. Current Search Console shows
impressions but no clicks, so the goal is better relevance, usefulness, and
authority—not more URLs.

1. `/gift-guides/funny-gifts-for-coworkers` — first evidence-backed pass shipped
   2026-07-31. Hold for the 14/28-day metric recheck before another editorial
   change.
2. `/gift-guides/white-elephant-gifts` — first evidence-backed pass shipped
   2026-08-04. Hold for the 14/28-day metric recheck before another editorial
   change.
3. `/gift-guides/funny-gifts-for-dads` — first evidence-backed pass shipped
   2026-08-11. Hold for the 2026-08-25 and 2026-09-08 rechecks.
4. `/gift-guides/secret-santa-gag-gifts` — first evidence-backed pass shipped
   2026-08-18. Hold for the 2026-09-01 and 2026-09-15 rechecks.
5. `/gift-guides/weird-kitchen-gadgets` — distinguish actually usable tools
   from decorative novelty, add kitchen-specific buying criteria, and use its
   strong visual fit as the bridge between organic search and Pinterest.

Implementation should extend the guide model with optional page-specific
editorial sections and FAQ overrides rather than adding generic paragraphs to
all 43 guides. Keep the existing product-quality gates, validate rendered
inventory, and measure impressions, average position, organic sessions, and
outbound clicks after each change.

## Recurring Publishing Cadence

- [ ] **Daily input gathering**: every non-incident run should mine on-site
  searches, product clicks, stale indexed URLs, catalog themes, seasonality, and
  competitor-style long-tail patterns for new guide candidates.
- [ ] **Weekly SEO publishing sprint**: first verify sitemap/indexation and
  representative URL inspections. Publish 3-5 new catalog-backed guide pages
  only when canonical/indexation health is sound; otherwise use the sprint to
  repair crawlability, internal links, or catalog quality.
- [ ] Treat these as new guide/page packages, not revived legacy bundles. They
  can be themed roundups with beautiful editorial presentation, but the URL,
  metadata, sitemap entry, product feed, and schema should all live in the
  maintained gift-guide/catalog system.
- [ ] Each published page must have a target query, keyword-aware H1/title/meta
  description, canonical URL, visible intro/editorial copy, FAQ answers,
  related internal links, useful server-rendered product grid, and JSON-LD that
  matches visible content.
- [ ] Each weekly sprint should include desktop and mobile visual QA so the new
  pages feel intentionally designed, not like templated scrape pages.
- [ ] **Weekly distribution prep**: prepare Pinterest/social/OG asset ideas for
  new evergreen guide pages, but do not post externally until Cameron approves
  the first publishing workflow.
- [ ] **Monthly refresh**: prune, merge, or rewrite thin pages; refresh titles,
  intros, FAQs, internal links, and candidate priorities using Search Console
  once available and on-site search/click data until then.

## Data And Owner-Dependent Work

- [x] Get Google Search Console access so query clusters can come from real
  impressions and click-through data instead of only on-site searches.
- [x] Create/connect the Pinterest business account for goose.gifts. Account:
  `https://www.pinterest.com/goosegifts/`; email:
  `goosegifts@37.technology`.
- [x] Audit product-price and affiliate-reporting access. Amazon PA-API often
  omits prices and does not expose Associates earnings; Awin is not configured
  and has no products in the catalog. These are documented limitations, not
  standing owner blockers (`docs/ops/AFFILIATE_DATA.md`).
- [ ] Approve the first owned distribution workflow before posting externally.
  Pinterest is the best first SEO-adjacent channel once evergreen guide pages
  exist.
