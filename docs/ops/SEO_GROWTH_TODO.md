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
