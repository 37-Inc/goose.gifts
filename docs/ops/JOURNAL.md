# goose.gifts — Operations Journal

Newest entries first. Every scheduled run appends an entry. This file is the
operator's memory across runs — write for a cold start.

---

## 2026-07-14 - Daily ops: random gift utility

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200, `/search` returned a 308 redirect to `/`, and
`/search?q=dad%20with%20no%20spare%20time` returned a 308 redirect to the
homepage catalog query. `/?q=dad%20with%20no%20spare%20time` returned 200 with
`Check price`, Product, and ItemList content present.

**Metrics snapshot**: Vercel Web Analytics reported 30 visitors and 94
pageviews for 2026-06-14 through 2026-07-14 UTC. Last nonzero day was
2026-07-14 with 4 visitors / 8 pageviews. Top paths remain `/`, guide pages,
and `/search`; top referrers are mostly direct/unknown, with one visitor each
from `finday.com`, `findicons.com`, `querycat.com`, `search.infospace.com`,
and `zhongsou.com`. Database totals before today's code change: 3,275 active
products, 19,546 product impressions, 96 product click events, 296 lifetime
searches, 6 searches and 3 product clicks in the last 7 days, and 2
campaign-attributed product clicks from `chatgpt.com`. GA4 showed 22 active
users / 33 sessions, 75 page views, 26 search events from 4 users, and 3
outbound-click conversion events from 3 users. Search Console analytics for
2026-07-06 through 2026-07-13 returned no query rows.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 76 candidates, 76 active/enriched/embedded candidates, 5 inserted, and
71 updated.

**Indexation and distribution checks**: Search Console still reports the
submitted sitemap at 44 URLs / 0 indexed, with no sitemap errors or warnings.
Homepage URL inspection still shows `Duplicate, Google chose different
canonical than user`; Google's last crawl was 2026-07-08, before the apex 308
redirect repair, and Google still chose `https://goose.gifts/` over the user
canonical `https://www.goose.gifts/`. The representative
`/gift-guides/white-elephant-gifts` URL remains unknown to Google. Pinterest
metrics remain below the public-test checkpoint: v2 has 26 impressions and
0 clicks/saves; v3 is still 0 and remains Sandbox-only/non-public evidence.

**Growth lever chosen**: lead-generation and shareable acquisition utility.
Shipped `/random-gift`, a crawlable random ridiculous gift generator that shows
one homepage-eligible product at a time, supports a stable `?gift=` share URL,
offers another-spin discovery, links to six alternates, adds Product/WebPage
schema, and records featured and alternate product interactions with the
`random_gift` click source. Linked it from the header, footer, and sitemap.

**Skipped alternatives**: did not publish another guide batch because the
indexation gate remains unhealthy; did not start public Pinterest/social
posting because outbound posting remains owner-approval-gated; did not expand
the Weird Gift Index into adjacent pages because it needs referral/citation
evidence first. The selected work was the highest-leverage reversible move
because it creates a specific destination for future social, newsletter,
community, and outreach drafts without requiring external action today.

**Review and QA**: self-reviewed the diff for catalog relevance, randomization
stability, duplicate product exposure, outbound click attribution, schema
truthfulness, internal links, and mobile text fit. Verified `npm run lint`,
`npm run build`, `git diff --check`, local `/random-gift` 200 response,
canonical, JSON-LD, sitemap entry, stable share link, and desktop/mobile
Playwright screenshots. The only local browser console error was the expected
Vercel Analytics localhost 404 for `/_vercel/insights/script.js`.

**SEO/growth work shipped**: `/random-gift` gives goose.gifts a shareable,
tracked, crawlable acquisition asset backed by the stricter homepage relevance
gate. Bulk SEO page publishing remains deferred until Search Console shows
the sitemap/indexation/canonical issue improving.

**Next**: use `/random-gift` as the first owned-channel/community draft target
once Cameron approves posting. On the next daily run, recheck whether Google
has recrawled the apex redirect and whether the new utility receives direct,
referral, or `random_gift` click activity.

## 2026-07-12 - Traffic sprint: creative learning loop and search credibility

**Trigger**: Cameron authorized an autonomous traffic sprint, including
parallel agents and concept generation, while deferring public Pinterest-pilot
preparation, external posting/outreach, paid tools, spend, and API applications.

**Live evidence**:
- Vercel reported 24 visitors and 84 pageviews in the latest month; the database
  showed 0 searches and 3 product clicks in the last 7 days.
- Search Console remained stale at 44 submitted / 0 indexed. The homepage was
  last crawled on July 8, before the apex 308 fix, and still showed Google's old
  apex canonical. Live search now surfaces the homepage, however, plus a stale
  legacy bundle result.
- The search-visible homepage snapshot exposed coloring books, makeup bags,
  bath products, and other weak inventory, making catalog credibility a blocker
  for outreach.

**Pinterest creative learning loop**:
- Added an append-only, schema-validated creative event log with CLI commands
  for validation, summary, next actions, and safe event recording.
- Recorded 32 events across four v4 concepts and five generation attempts,
  including prompt lineage, authorization, review gates, scores, failures, and
  next actions. Public posting and paid spend are validator-enforced as false.
- Generated four Pinterest-native editorial directions and a corrective goat
  revision under `docs/ops/pinterest-creative-lab/v4-concepts/`. The eye-rug
  interior led aesthetically at 4.63/5, but no candidate passed the truthful-
  product gate; all remain internal concept studies.
- The first goat output incorrectly rendered a life-size animal. It was retained
  as a rejected attempt, then revised into a tabletop figurine, proving that the
  loop can convert a concrete failure into a targeted next attempt.

**Search and catalog credibility**:
- Removed fabricated per-request sitemap modification dates; built sitemap
  output now contains no `<lastmod>` until durable page timestamps exist.
- Tightened homepage eligibility to require original merchant-title evidence,
  ignore generated tags/copy as brand-fit proof, exclude recurring commodity
  formats, and reduce automated source-query ranking weight.
- A live-catalog simulation leaves 899 of 3,275 products eligible and zero
  eligible titles matching the reported coloring/makeup/bath-bomb/trivia/
  notebook problem categories. Updated the analytics SQL gate to match.

**Link-earning strategy**:
- Added `docs/ops/ACQUISITION.md`. The first recommended link-worthy asset is a
  recurring Weird Gift Index, paired with a random-ridiculous-gift utility.
- Targeted editorial/newsletter outreach, native X content, publisher feeds,
  reactive PR, and rule-compliant community participation follow only after an
  asset and the search-visible site pass a credibility gate.
- Encoded a reusable goal workflow that prepares assets, prospect research, and
  tracked drafts autonomously, then stops before posting, sending, or spending.

**Review and QA**:
- `npm run test:ranking`: 8/8 passed.
- `npm run test:creative`: 5/5 passed.
- Creative log validation/summary/next-action commands passed with 32 events.
- `npm run lint` and `npm run build` passed. Built sitemap inspection confirmed
  zero emitted `<lastmod>` values.

**Skipped**: no public pilot was prepared; no Pin, tweet, community post, email,
or outreach message was sent; no account/API application was made; no paid tool
or spend was authorized.

**Next**: use actual product images and dimensions for reference-guided
revisions of the eye-rug and alligator concepts. In parallel, make guide product
sets more distinctive, then build the first Weird Gift Index or random-gift
utility before beginning prospect outreach.

---

## 2026-07-12 - Pinterest Creative Lab plan prepared; experiment not started

**Trigger**: Cameron asked Codex to preserve the creative research in a durable
marketing document, add it to the marketing roadmap as the next experiment, and
get the pipeline ready without proceeding.

**Prepared**:
- Added `docs/ops/MARKETING.md` as the running strategy, creative standard,
  experiment backlog, candidate schema, and learning log.
- Queued the Pinterest Creative Lab in `docs/ops/ROADMAP.md`: research native
  references, brief distinct concepts, generate editorial scenes, apply a taste
  and product-fidelity gate, prepare tracked candidates, then stop for approval.
- Added explicit runbook boundaries: no concept generation, subscription,
  publication, or spend is authorized by this preparation.

**Record correction**:
- Cameron confirmed v3 was posted only through the Pinterest Sandbox API. It is
  a workflow/qualitative artifact, not a public traffic experiment.
- Superseded the prior public-v3 attribution language in the active Pinterest
  record. Historical recovered claims below are not authoritative for v3
  distribution.

**Status**: ready for a future explicitly authorized concept sprint; no creative
was generated and nothing was posted or purchased in this run.

---

## 2026-07-12 - Daily ops: guide crawl hub

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200, `/search` returned a 308 redirect to `/`, and
`/search?q=dad%20with%20no%20spare%20time` returned a 308 redirect to the
homepage catalog query. `/?q=dad%20with%20no%20spare%20time` returned 200 with
`Check price`, Product, and ItemList content present.

**Metrics snapshot**: Vercel Web Analytics reported 24 visitors and 84
pageviews for 2026-06-12 through 2026-07-12 UTC. Last nonzero day was
2026-07-11 with 1 visitor / 1 pageview. Top paths remain `/`, guide pages, and
`/search`; top referrers are mostly direct/unknown, with one visitor each from
`finday.com`, `findicons.com`, `querycat.com`, and `zhongsou.com`. Database
totals before today's code change: 3,275 active products, 19,058 product
impressions, 95 product click events, 290 lifetime searches, 0 searches and
3 product clicks in the last 7 days, and 2 campaign-attributed product clicks
from `chatgpt.com`. GA4 showed 17 active users / 28 sessions, 65 page views,
25 search events from 3 users, and 2 outbound-click conversion events.
Search Console analytics for 2026-07-04 through 2026-07-11 returned no query
rows.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 72 candidates, 72 active/enriched/embedded candidates, 0 inserted, and
72 updated.

**Indexation and distribution checks**: Search Console still reports the
submitted sitemap at 44 URLs / 0 indexed, with no sitemap errors or warnings.
Homepage URL inspection still shows `Duplicate, Google chose different
canonical than user`; Google's last crawl was 2026-07-08, before the 308 apex
redirect repair, and Google still chose `https://goose.gifts/` over the user
canonical `https://www.goose.gifts/`. The representative
`/gift-guides/white-elephant-gifts` URL remains unknown to Google. Pinterest
metrics remain too early for another creative batch: v2 has 26 impressions and
0 clicks/saves; v3 has 0 impressions/clicks/saves.

**Growth lever chosen**: crawl/internal-link repair for the guide network.
The sitemap listed all guide pages, but the homepage exposed only a subset of
featured guide chips and the footer had no guide-network entry point. Shipped a
server-rendered `/gift-guides` hub with canonical metadata, CollectionPage and
ItemList structured data, and visible links to all 43 guide pages grouped by
recipient/theme. Linked the hub from the header, footer, and sitemap.

**Skipped alternatives**: did not publish another guide page because the
indexation gate remains unhealthy; did not create new Pinterest assets because
the public test remains below the 14-day / 250-impression checkpoint; did not
start an outward-facing channel because posting approval is still owner-gated
in `NEEDS.md`. The selected work was the highest-leverage reversible move
because it improves crawl discovery and user navigation for already-published
catalog-backed pages without adding more unindexed URLs to the problem.

**Review and QA**: self-reviewed the diff for over-broad content, broken guide
slugs, sitemap/canonical coverage, structured-data visibility, and mobile text
fit. Verified all 43 guide definitions are represented in the hub. QA covered
`npm run lint`, `npm run build`, local `/gift-guides` HTTP/content checks,
desktop and mobile Playwright screenshots, and production health smoke. The
only local browser console error was the expected Vercel Analytics localhost
404 for `/_vercel/insights/script.js`.

**SEO/growth work shipped**: permanent crawlable `/gift-guides` directory plus
the daily catalog refresh. Bulk SEO page publishing remains deferred until
Search Console shows the sitemap/indexation/canonical issue improving.

**Next**: after Google recrawls the apex 308, re-inspect homepage canonical and
the `/gift-guides` hub. If sitemap indexed count remains zero, prioritize
additional crawl diagnostics and internal-link quality over new guide pages.

## 2026-07-11 - Daily ops: legacy search signal consolidation

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200, `/search` returned a redirect to `/`, and
`/?q=dad%20with%20no%20spare%20time` returned 200 with `Check price`,
Product, and ItemList content present.

**Metrics snapshot**: Vercel Web Analytics reported 25 visitors and 85
pageviews for 2026-06-11 through 2026-07-11 UTC. Last nonzero day was
2026-07-11 with 1 visitor / 1 pageview. Top paths remain `/`, guide pages, and
`/search`; top referrers are mostly direct/unknown, with one visitor each from
`finday.com`, `findicons.com`, `querycat.com`, and `zhongsou.com`. Database
totals before today's code change: 3,269 active products, 19,058 product
impressions, 95 product click events, 290 lifetime searches, 23 searches and
3 product clicks in the last 7 days, and 2 campaign-attributed product clicks
from `chatgpt.com`. GA4 showed 17 active users / 28 sessions, 65 page views,
25 search events from 3 users, and 2 outbound-click conversion events. Search
Console analytics for 2026-07-03 through 2026-07-10 returned no query rows.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 73 candidates, 73 active/enriched/embedded candidates, 6 inserted, and
67 updated.

**Indexation and distribution checks**: Search Console still reports the
submitted sitemap at 44 URLs / 0 indexed, with no sitemap errors or warnings.
Homepage inspection still shows `Duplicate, Google chose different canonical
than user`, with Google choosing `https://goose.gifts/` and the user canonical
set to `https://www.goose.gifts/`. The representative
`/gift-guides/white-elephant-gifts` URL is still unknown to Google. Pinterest
metrics remain too early for another creative batch: v2 has 26 impressions and
0 clicks/saves; v3 has 0 impressions/clicks/saves.

**Growth lever chosen**: crawl/analytics hygiene for the catalog-first search
surface. GA4 still showed recent landing-page rows for `/search` and legacy
bundle-era page titles, while Vercel still counted `/search` as a top path.
Changed the retired `/search` route from a temporary redirect to a permanent
redirect into `/` or `/?q=...`, matching the current homepage catalog search
surface and reducing stale URL/title noise as crawlers and analytics refresh.

**Skipped alternatives**: did not publish another guide page because the
indexation gate is still unhealthy; did not create new Pinterest assets because
the public test has only 26 impressions and no clicks; did not start a new
outward-facing channel because posting approval is still the owner-dependent
blocker in `NEEDS.md`. The selected work was the highest-leverage reversible
move because it consolidates legacy demand and measurement around the product
surface that already drives the few recent clicks.

**Review and QA**: self-reviewed the diff for redirect semantics, SEO/crawl
side effects, and doc accuracy. Verification covered `npm run build`,
`npm run lint`, local redirect checks, and production smoke after deploy.

**SEO/growth work shipped**: permanent `/search` consolidation plus the daily
catalog prefetch. Bulk SEO page publishing remains deferred until Search
Console shows the sitemap/indexation/canonical issue improving.

**Next**: keep watching GSC after the apex 308 and `/search` 308 have been
recrawled. If the sitemap still reports zero indexed URLs on the next weekly
run, prioritize deeper canonical/internal-link/crawl repair over new pages or
more creative production.
## 2026-07-10 - Growth remediation: relevance, canonical, and channel evidence

**Trigger**: Cameron approved the project-review roadmap and asked Codex to turn
it into Beads work and execute it, while checking whether Pinterest and
Amazon/Awin data were actually available.

**Operator-state repair**:
- Preserved the July 7 Pinterest v3 generator and Sandbox result records,
  plus journal context that had existed only in the
  dirty local `main` checkout.
- Reconciled that work with PRs #42-#44 on a clean remediation branch so future
  worktree runs can see the full experiment instead of rebuilding it.

**Catalog-quality repair**:
- Replaced the legacy homepage score that explicitly boosted beauty, bath,
  books, and generic clickbait with a brand-fit score based on original-title
  gag signals, curated source query, quality, and measured engagement.
- Added a hard homepage eligibility gate. The live catalog has 3,269 active
  products, 3,162 without a discovery source, and 931 that pass the new
  relevance gate.
- Added ranking tests and exposed source-less/eligible counts in
  `analytics:snapshot`.

**Canonical/indexation**:
- Search Console reported 44 submitted and 0 indexed URLs. The homepage was
  crawled successfully but Google chose `https://goose.gifts/` over the declared
  `https://www.goose.gifts/`; a representative guide was discovered but not
  indexed.
- Vercel's apex domain redirect had no explicit status and emitted 307. Updated
  the project-domain redirect to 308 and verified the live response.
- Added a runbook/roadmap gate that pauses bulk guide publishing while
  indexation or canonical selection is unhealthy.

**Pinterest evidence**:
- Queried the recorded Pin IDs with `pin_metrics=true`; no Pins were created or
  changed. Cameron later clarified that only v2 was a public cohort.
- v2 totals: 26 impressions, 0 Pin clicks, 0 outbound clicks, 0 saves.
- v3 was Sandbox-only, so zero metrics are expected and are not a creative or
  distribution result. Database and GA4 showed no Pinterest product-click
  conversion.
- Added `npm run pinterest:metrics` and set the next useful checkpoint at 14
  days or 250 aggregate impressions.

**Affiliate-data audit**:
- Amazon discovery still works, but a fresh dry run returned no price and
  PA-API does not expose Associates earnings reports. Associates Central was
  not authenticated in either available browser session.
- No Awin token/publisher ID exists and all 3,269 products are Amazon-sourced.
- Removed vague price/revenue requests from `NEEDS.md`; the limitations and
  reopening conditions now live in `docs/ops/AFFILIATE_DATA.md`.

**Expected movement**: better homepage brand fit and outbound CTR; eventual
`www` canonical consolidation/indexation after Google recrawls; a clean
Pinterest baseline without premature creative churn.

---

> Recovered operator records from July 7 are retained first in this merged
> journal because they previously existed only in the local checkout. The
> normal reverse-chronological automation history resumes after this recovered
> block.

## 2026-07-07 - Superseded v3 public-post record

Cameron corrected this record on 2026-07-12: v3 was posted only through the
Pinterest Sandbox API. A prior local record described a public web posting and
manual tracking cohort, but it is not authoritative and must not be used as
evidence of public distribution, traffic, or conversion.

---

## 2026-07-07 - Pinterest developer app icon uploaded

**Trigger**: Cameron noticed the Pinterest developer app image was blank and
asked whether the goose icon should be uploaded.

**Action**:
- Uploaded `public/sillygoose.png` as the app icon for Pinterest app
  `Goose.gifts` / app ID `1588384`.

**Verification**:
- The Pinterest Developer app Details tab showed the goose icon after upload.
- Reloaded `https://developers.pinterest.com/apps/1588384/details/`; the goose
  icon persisted and the upload control changed from `Upload` to `Change`.

**Correction**: v3 remained Sandbox-only. Any future public creative pilot must
use a newly approved concept set and distinct tracking, not the old v3 records.

---

## 2026-07-07 - Pinterest API trial v3 creative posted

**Trigger**: Cameron asked to iterate on the latest Pinterest designs so they
felt less ad-like, more visually appealing, and more focused on funny products
or genuinely giftable hooks, then try posting them through the new API tooling.

**Creative shipped**:
- Added a v3 Pinterest generator:
  `scripts/ops/generate-pinterest-v3-assets.mjs`.
- Generated an editorial/product-joke batch under
  `docs/ops/pinterest-assets/batch-1-v3/`, with a contact sheet, SVG/PNG
  assets, and a JSON manifest.
- The v3 direction uses larger product photography, tighter one-joke headlines,
  fewer CTA elements, and no repeated product tiles.

**API tooling shipped**:
- Added `scripts/ops/post-pinterest-v3-trial.mjs`.
- Added npm shortcuts:
  `npm run pinterest:generate:v3` and `npm run pinterest:post:v3`.
- The posting helper defaults to Pinterest Sandbox, creates missing Sandbox
  boards with `API Trial - ...` names, posts image-base64 Pins, and writes
  `docs/ops/pinterest-assets/batch-1-v3/post-results.json`.

**Auth / access**:
- Completed the Pinterest Sandbox OAuth flow and stored tokens in macOS Keychain
  services `goose.gifts.PINTEREST_SANDBOX_ACCESS_TOKEN` and
  `goose.gifts.PINTEREST_SANDBOX_REFRESH_TOKEN`.
- Pinterest Trial access still means API-created Pins and boards are Sandbox
  entities visible only to the creator. Public automated posting still requires
  Standard access approval.

**Posted through Sandbox API**:
- White Elephant Gifts That Make the Room Pay Attention:
  https://www.pinterest.com/pin/1107815208383208933/
- Funny Coworker Gifts for Meetings That Should Have Been Emails:
  https://www.pinterest.com/pin/1107815208383208938/
- Weird Kitchen Gadgets That Look Fake but Are Real:
  https://www.pinterest.com/pin/1107815208383208941/
- Novelty Desk Toys for Busy-Looking Nothing:
  https://www.pinterest.com/pin/1107815208383208942/
- Weird Home Decor Gifts With a Plot Twist:
  https://www.pinterest.com/pin/1107815208383208943/

**Verification**:
- `npm run pinterest:generate:v3` rendered all five v3 assets.
- Visually checked the v3 contact sheet and full-size coworker/home-decor cards.
- `npm run pinterest:post:v3 -- --dry-run` prepared five payloads.
- `npm run pinterest:post:v3 -- --force` created five Sandbox boards and five
  Sandbox Pins.
- `node scripts/ops/pinterest-api.mjs boards --sandbox` read back all five
  Sandbox boards with one Pin each.
- Direct Sandbox `GET /v5/pins/{id}` read-back returned the expected title,
  board ID, UTM link, and `image` media type for all five Pins.

**Next**: review the v3 Sandbox Pins visually in the logged-in Pinterest account.
If the API workflow and creative direction look good, use this flow as the demo
artifact for the Pinterest Standard access upgrade.
## 2026-07-10 - Daily ops: acquisition analytics loop shipped

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200, `/search` returned a 307 redirect to `/`, and
`/?q=dad%20with%20no%20spare%20time` returned 200 with `Check price`,
Product, and ItemList content present.

**Metrics snapshot**: Vercel Web Analytics reported 25 visitors and 85
pageviews for 2026-06-10 through 2026-07-10 UTC. Last nonzero day was
2026-07-10 with 1 visitor / 1 pageview. Top paths remain `/`, guide pages, and
`/search`; top referrers are mostly direct/unknown, with one visitor each from
`finday.com`, `findicons.com`, `querycat.com`, `search.spacetime.com`, and
`search.yam.com`. Database totals before today's code change: 3,268 active
products, 18,986 product impressions, 95 product click events, 290 lifetime
searches, 27 searches and 4 product clicks in the last 7 days, and 2
campaign-attributed product clicks from `chatgpt.com`. GA4 showed 16 active
users / 26 sessions, 63 page views, 25 search events from 3 users, and 2
outbound-click conversion events. Search Console analytics for 2026-07-02
through 2026-07-09 returned no query rows.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 73 candidates, 73 active/enriched/embedded candidates, 1 inserted, and
72 updated. Post-run catalog count: 3,269 active products, all embedded and
with punny copy; 3,252 active products still have unknown prices.

**Growth lever chosen**: analytics and learning loops. The site has a few
attributed product clicks and early non-search referrers, but the admin
dashboard only exposed product-surface click sources. Today's highest-leverage
reversible move was to make acquisition source and UTM campaign cohorts visible
in the dashboard, and to print the already-fetched top search terms in the ops
snapshot so future runs can choose SEO, Pinterest, and conversion work from one
clearer evidence surface.

**Plausible alternatives skipped**:
- More SEO guide pages: deferred because Search Console still has no query
  rows, zero-result searches are empty, and the current on-site searches
  already point mostly at shipped or known guide candidates.
- Public Pinterest posting: deferred because outward-facing recurring posting
  still needs owner approval/Standard access; no public posts were created.
- Product-card conversion tweaks: skipped because there were only 4 product
  clicks in the last 7 days, which is too little to justify UI conclusions
  before improving attribution visibility.

**Shipped**:
- Added 90-day Acquisition Sources and Campaign Clicks panels to the admin
  dashboard, backed by `/api/admin/stats`.
- The new panels show source/referrer or UTM cohort, click count, share, and
  latest click timing, making Pinterest/social/AI-search experiments easier to
  evaluate without manually running SQL.
- Updated `npm run analytics:snapshot` output to include top searches in 90d,
  which were already queried but not printed.

**Review / QA**:
- Self-reviewed the diff for SQL grouping errors, admin-only data exposure,
  responsive layout issues, and whether the work advances the broader growth
  mandate.
- `npm run analytics:snapshot -- --days 7` passed and now prints top searches
  such as `dad`, `Fishing`, `poop`, and `dad with no spare time`.
- `npm run lint` and `npm run build` passed.
- Local admin QA on `http://localhost:3007/admin` rendered the new panels with
  production data: acquisition sources `www.goose.gifts` and `chatgpt.com`,
  plus the `chatgpt.com / (none) / (none)` campaign cohort. Desktop and mobile
  Playwright snapshots showed the new cards stacking/truncating cleanly.

**SEO/GEO and lead-generation log**: no new crawlable SEO page shipped today.
That was deliberate: the stronger compounding growth move was improving the
learning loop for acquisition and query demand. SEO/GEO input gathering did
ship through the ops snapshot top-search output, and the dashboard now exposes
the attribution cohorts that should move once Pinterest or other owned
distribution is approved.

**Next**: use the new dashboard panels in the next run to decide whether
`chatgpt.com`, Pinterest campaign traffic, or an on-site search cluster has
enough signal to justify the next guide, distribution batch, or conversion
experiment.

---

## 2026-07-09 - Daily ops: Pinterest API dry-run posting path shipped

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200, `/search` returned a 307 redirect to `/`, and
`/?q=dad%20with%20no%20spare%20time` returned 200 with `Check price` and
ItemList schema present.

**Metrics snapshot**: Vercel Web Analytics reported 24 visitors and 84
pageviews for 2026-06-09 through 2026-07-09 UTC. Last nonzero day was
2026-07-08 with 2 visitors / 2 pageviews. Top paths remain `/`, guide pages,
and `/search`; top referrers are mostly direct/unknown. Database totals before
today's discovery finished: 3,265 active products, 18,950 product impressions,
95 product click events, 290 lifetime searches, 27 searches and 4 product
clicks in the last 7 days, and 2 campaign-attributed product clicks from
`chatgpt.com`. GA4 showed 18 active users / 28 sessions, 65 page views, 25
search events from 3 users, and 2 outbound-click conversion events. Search
Console analytics for 2026-07-01 through 2026-07-08 returned no query rows.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 74 candidates, 74 active/enriched/embedded candidates, 3 inserted, and
71 updated.

**Growth lever chosen**: acquisition beyond search, specifically making
Pinterest API publishing repeatable and measurable. Yesterday's attribution and
pin-manifest work made Pinterest/social traffic measurable; today's
highest-leverage reversible move was to add an approved-copy create-pin dry-run
path that resolves live public boards, builds the exact Pinterest payload from
approved copy/assets, and preserves UTM tracking before any public post.

**Plausible alternatives skipped**:
- More SEO guide pages: deferred because there was no new query cluster or
  Search Console evidence today, and publishing another page would be lower
  leverage than unblocking a repeatable distribution channel.
- Public Pinterest posting: deferred because recurring outward-facing posting
  still needs an approved publishing workflow; today's command can post only
  when `--dry-run` is intentionally omitted.
- Product-card conversion tweaks: skipped because product clicks are too sparse
  for a credible UI conclusion, while distribution instrumentation and API
  workflow are current blockers.

**Shipped**:
- Added `docs/ops/pinterest-approved-pins.json`, a machine-readable record of
  the owner-approved first Pinterest batch: board names, assets, tracking URLs,
  titles, descriptions, alt text, and live Pin URLs.
- Added `npm run pinterest:approved-pins` and `npm run pinterest:create-pin`
  alongside the existing `npm run pinterest:pin-drafts` manifest workflow.
- Extended `scripts/ops/pinterest-api.mjs` with approved-draft listing,
  live-board resolution, base64 image payload construction, dry-run redaction,
  and an explicit create-pin POST path for a future approved run.
- Updated `docs/ops/PINTEREST_DRAFTS.md` with the repeatable API commands.

**Review / QA**:
- Self-reviewed the diff for accidental posting risk, token disclosure, base64
  logging, board mismatch risk, and whether the work advances non-search
  growth.
- Verified the official Pinterest create-pin shape supports `media_source`
  `image_base64`; the dry-run payload uses `source_type: image_base64`,
  `content_type: image/png`, title, description, alt text, link, and board id.
- `node --check scripts/ops/pinterest-api.mjs`, `npm run
  pinterest:approved-pins`, and `npm run pinterest:create-pin -- --draft
  white-elephant-gifts --dry-run` passed. The dry run resolved live board
  `Funny White Elephant Gifts` to board id `1107815277030422220` and redacted
  the 676,428-character base64 payload.
- `git diff --check`, `npm run build`, and `npm run lint` passed.

**SEO/GEO and lead-generation log**: SEO page publishing was deliberately
deferred today because the data did not expose a stronger crawlable page
candidate than the existing backlog, while Pinterest distribution had a concrete
workflow gap. Lead-generation/growth work shipped as API-ready Pinterest posting
infrastructure with UTM-preserving links, which should make the next approved
owned-distribution test faster and more measurable.

**Next**: once Cameron approves the next outward-facing Pinterest batch or the
Standard API upgrade path, run the create-pin command without `--dry-run` for a
fresh, non-duplicate batch and monitor campaign-attributed clicks in
`npm run analytics:snapshot`.

---

## 2026-07-08 - Daily ops: Pinterest API pin-draft loop shipped

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200, `/search` returned a 307 redirect to `/`, and
`/?q=dad%20with%20no%20spare%20time` returned 200 with `Check price`,
Product, and ItemList content present.

**Metrics snapshot**: Vercel Web Analytics reported 24 visitors and 88
pageviews for 2026-06-08 through 2026-07-08 UTC. Last nonzero day was
2026-07-07 with 4 visitors and 9 pageviews. Top paths remain `/` plus guide
traffic: `/gift-guides/white-elephant-gifts` had 4 visitors,
`/gift-guides/funny-gifts-for-coworkers`, `/gift-guides/funny-gifts-for-dads`,
`/gift-guides/novelty-desk-toys`, `/purrfect-gifts-for-cat-loving-bookworms-n6y7`,
and `/search` each had 2 visitors. Referrers remain mostly direct/unknown:
21 visitors and 85 pageviews. GA4 showed 12 direct active users / 21 sessions,
1 paid-search session, 3 one-session referrals, 25 search events, and 2 users /
2 `conversion_event_outbound_click` events. Search Console analytics for
2026-07-01 through 2026-07-07 returned no query rows. Database totals before
today's code change: 3,264 active products, 18,806 product impressions, 93
product click events, 290 lifetime searches, 27 searches and 2 product clicks
in the last 7 days, no zero-result searches in 30 days, no campaign-attributed
clicks yet, and 3,247 active products still have unknown prices.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 74 candidates, 74 active/enriched/embedded candidates, 1 inserted, and
73 updated.

**Growth lever chosen**: acquisition and lead-generation infrastructure beyond
search. Yesterday's attribution work made Pinterest/social traffic measurable;
today's highest-leverage reversible move was to turn the connected Pinterest
Trial API account and existing v2 creative assets into a repeatable pin-draft
workflow with tracked guide links. This advances the Standard-access demo path
without public posting or spend.

**Plausible alternatives skipped**:
- Another guide page: skipped because Search Console still has no query rows,
  on-site searches had no new zero-result clusters, and another page would not
  solve the current distribution bottleneck.
- Product-card conversion changes: skipped because there were only 2 product
  clicks in the last 7 days; getting qualified, attributable traffic is the
  more urgent learning loop.
- Public Pinterest posting: skipped because recurring outward-facing publishing
  remains owner-approved only, and Pinterest Trial-created objects are for demo
  evidence rather than a public acquisition campaign.

**Shipped growth work**:
- Added `npm run pinterest:pin-drafts`, which validates live Pinterest board
  access, maps five prepared v2 guide assets to API Trial boards and public
  boards, and writes a dry-run manifest without creating pins.
- Added `docs/ops/pinterest-assets/batch-1-v2/pins-manifest.json` with five
  UTM-tagged pin drafts for white elephant gifts, coworker gifts, weird kitchen
  gadgets, novelty desk toys, and weird home decor. Campaign:
  `pinterest_api_trial_batch_1_v2`.
- The script supports an explicit `--create-trial-pins` flag for the Standard
  access screen recording path; default daily use remains dry-run only.

**Review / QA**:
- Self-reviewed the diff for accidental public posting, duplicate-spend risk,
  token leakage, missing board/asset validation, URL tracking, and whether the
  work supports the broader growth mandate.
- `npm run pinterest:whoami` returned the expected `goosegifts` business
  account, and `npm run pinterest:boards` returned both API Trial boards and
  starter public boards.
- `npm run pinterest:pin-drafts` wrote a 5-pin dry-run manifest and created 0
  pins.
- Verified all five guide URLs in the manifest return 200.
- `node --check scripts/ops/prepare-pinterest-pins.mjs`, `npm run build`, and
  `npm run lint` passed.

**SEO/GEO and lead-generation note**: no new crawlable SEO page shipped today.
That was deliberate: the best growth move was preparing a measurable Pinterest
lead-generation workflow that points at existing crawlable guide pages and can
be used for the Standard-access upgrade/demo. Expected movement once posting is
approved: campaign-attributed Pinterest sessions and product clicks for the
five evergreen guide URLs.

**Next**: record the OAuth/API posting demo using the explicit Trial create
flag, submit Pinterest Standard access, then use approved public boards with the
same UTM campaign structure once recurring posting is authorized.

---

## 2026-07-07 - Pinterest API OAuth connected under Trial access

**Trigger**: Cameron reported that Pinterest Trial access had been approved and
asked to continue the API setup so future Pinterest work can avoid browser-only
posting.

**Pinterest app state**:
- App name: `Goose.gifts`
- App ID: `1588384`
- Access tier: Trial access active.
- Registered redirect URI:
  `http://localhost:3737/oauth/pinterest/callback`

**Credentials**:
- Stored app ID in macOS Keychain service
  `goose.gifts.PINTEREST_APP_ID`.
- Stored app secret in macOS Keychain service
  `goose.gifts.PINTEREST_APP_SECRET`.
- Completed OAuth authorization for scopes:
  `boards:read boards:write pins:read pins:write user_accounts:read`.
- Stored OAuth tokens in macOS Keychain services
  `goose.gifts.PINTEREST_ACCESS_TOKEN` and
  `goose.gifts.PINTEREST_REFRESH_TOKEN`.
- Do not paste or log the secret/token values. Treat all `pina_` and `pinr_`
  strings as passwords.

**Shipped operator tooling**:
- Added `npm run pinterest:oauth` to repeat the local OAuth code flow and store
  tokens safely.
- Added `npm run pinterest:whoami` and `npm run pinterest:boards` as read-only
  smoke tests for the connected API account.

**Verification**:
- `npm run pinterest:whoami` returned the expected `goosegifts` business
  account with 5 boards and 5 pins.
- `npm run pinterest:boards` returned all five existing public starter boards.
- `node --check scripts/ops/pinterest-oauth.mjs`,
  `node --check scripts/ops/pinterest-api.mjs`, `npm run lint`, and
  `npm run build` passed.

**Important limitation**: Pinterest Trial access can create Pins and boards, but
Trial-created Pins/boards are visible only to their creator as sandbox entities.
Public automated posting still requires a Standard access upgrade. Pinterest
requires a screen recording that demonstrates the OAuth flow and live Pinterest
API integration, even if goose.gifts is the only intended user.

**Next**: use the Trial OAuth connection to build and demo the API posting flow
without relying on the browser. Then record the OAuth/API demo and submit the
Standard access upgrade request before moving the daily job to public API
posting.

---

## 2026-07-07 - Manual growth run: attribution loop shipped

**Trigger**: Cameron asked to kick off a manual run immediately after correcting
the daily mandate away from default curated pages.

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200 and included `/gift-guides/funny-poop-gifts`,
`/search` returned a 307 redirect to `/`, and
`/?q=dad%20with%20no%20spare%20time` returned 200 with `Check price` and
ItemList schema present.

**Metrics snapshot**: Vercel Web Analytics still reported 27 visitors and 91
pageviews for 2026-06-07 through 2026-07-07 UTC. Referrers remain mostly opaque:
20 visitors / 80 pageviews are direct or unknown. GA4 showed 18 direct active
users / 27 sessions, 1 paid-search session, and 3 one-session referrals. GA4
events showed 2 users / 2 `conversion_event_outbound_click` events. Database
totals before this code change: 3,264 active products, 18,770 product
impressions, 93 product click events, 290 lifetime searches, 27 searches and 2
product clicks in the last 7 days, and no campaign-attributed clicks yet.
Search Console analytics for 2026-06-30 through 2026-07-06 returned no query
rows.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 76 candidates, 76 active/enriched/embedded candidates, 0 inserted, and
76 updated.

**Growth lever chosen**: analytics and conversion learning loop. The immediate
business problem is not just more pages; it is that future distribution tests
would be hard to evaluate because product clicks did not preserve first-touch
campaign/referrer/session context. Shipped additive click attribution so
UTM-tagged Pinterest, creator, newsletter, social, or partner links can be traced
through to outbound affiliate clicks.

**Plausible alternatives skipped**:
- More guide pages: skipped because the same-day correction explicitly asked for
  broader growth, and search/organic data is still too thin to prove another page
  is the best lever.
- External posting/outreach: skipped because recurring outward-facing posting is
  still owner-approved only; instrumentation should land first so approved tests
  have measurable results.
- Product-card copy/layout tests: skipped because the bigger near-term blocker
  is attribution. Changing cards without source/campaign click attribution would
  make a future traffic bump harder to understand.

**Shipped**:
- Added nullable `product_clicks` attribution fields for `session_id`,
  `landing_page`, UTM parameters, and `referrer_host`; applied the additive
  production migration before deploy.
- Updated `ProductGrid` to preserve first-touch campaign/referrer context in the
  browser and send it on outbound product clicks.
- Updated `/api/track-click` to sanitize and store attribution without changing
  the affiliate click path.
- Added campaign-attributed clicks and product-click referrers to
  `npm run analytics:snapshot`.
- Updated `docs/SEARCH_ANALYTICS.md` with the new attribution flow.

**Review / QA**:
- Self-reviewed the diff for click-path safety, PII risk, storage failure
  behavior, DB migration safety, and whether the experiment supports non-search
  acquisition.
- Verified the production migration columns exist in `product_clicks`.
- `git diff --check`, `npm run build`, `npm run lint`, and
  `npm run analytics:snapshot` passed. The refreshed snapshot shows the new
  campaign/referrer sections with the expected baseline: no campaign-attributed
  clicks yet and product-click referrers currently resolving to `www.goose.gifts`.

**Next**: run a small approved distribution experiment with UTM-tagged links
after deploy, starting with Pinterest or a creator/blogger target list, and use
the new campaign-attributed click section to decide whether it is worth
repeating.

---

## 2026-07-07 - Owner correction: broaden daily growth mandate

**Owner direction**: Cameron called out that daily ops had become too focused on
adding curated SEO pages. He reiterated that goose.gifts has been fully handed
over and the operator should grow the business creatively by any compliant,
reversible, measurable means, not just by publishing guide pages.

**Process change shipped**:
- Updated `docs/ops/RUNBOOK.md` so daily step 4 must deliberately choose across
  the full business-growth surface: acquisition beyond search, conversion,
  retention, monetization, analytics/learning loops, product quality, creative
  distribution prep, partnerships, and SEO/GEO.
- Added a journal requirement to log which lever was chosen, which plausible
  alternatives were skipped, and why the selected work was the highest-leverage
  reversible move for the business that day.
- Updated `docs/ops/ROADMAP.md` Phase 3 and success metrics to include creative
  acquisition experiments, distribution assets, conversion loops, non-search
  traffic, source-attributed clicks, and returning-user engagement.

**Operating implication**: future daily runs should not treat "new crawlable
guide page" as the default. A guide is valid only when data says it is the best
lever. Otherwise, ship or prepare a different measurable growth experiment, such
as better click instrumentation, Pinterest/creator assets, referral/social
tracking, product-card conversion work, newsletter capture planning, revenue
reporting, or partner/outreach prep.

---

## 2026-07-07 - Daily ops: poop-gifts guide shipped

**Health**: production homepage returned 200 with title
`Funny Gag Gifts, White Elephant Ideas, and Weird Presents | goose.gifts`,
`/sitemap.xml` returned 200, `/search` returned a 307 redirect to `/`, and
`/?q=dad%20with%20no%20spare%20time` returned 200 with the catalog ItemList
schema present.

**Metrics snapshot**: Vercel Web Analytics reported 27 visitors and 91
pageviews for 2026-06-07 through 2026-07-07 UTC, with 4 visitors / 8 pageviews
on 2026-07-07. Top paths still center on `/`, but guide and old long-tail URLs
are visible: `/gift-guides/white-elephant-gifts` had 3 visitors,
`/gift-guides/funny-gifts-for-coworkers`, `/gift-guides/funny-gifts-for-dads`,
`/gift-guides/novelty-desk-toys`, and
`/purrfect-gifts-for-cat-loving-bookworms-n6y7` had 2 visitors each. GA4 showed
18 direct active users / 27 sessions, 1 paid-search session, and 3 one-session
referrals. Database totals: 3,263 active products before discovery, 18,698
product impressions, 93 product click events, 290 lifetime searches, 27 searches
and 2 product clicks in the last 7 days, and 1 gift-guide click from
`white-elephant-gifts` on 2026-07-07. Search Console analytics for 2026-06-30
through 2026-07-06 returned no query rows.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 76 candidates, 76 active/enriched/embedded candidates, 1 inserted, and
75 updated.

**Shipped growth work**: published `/gift-guides/funny-poop-gifts`, a crawlable
catalog-backed guide from live on-site demand around `poop` and adjacent
bathroom-humor searches. The focused `poop`/`toilet`/`fart` candidate check had
47 active products before publishing, enough for a useful 36-product
server-rendered guide. The guide inherits the maintained title/meta/canonical,
FAQ, ItemList schema, related links, and tracked product grid. Homepage guide
links now include both `Funny Poop Gifts` and the existing
`Funny Gifts for Dads Who Fish` candidate, and legacy bundle-style slugs
containing `poop`, `toilet`, or `fart` now 308 to the canonical poop guide.
Expected movement: more indexed long-tail guide coverage, better retention for
bathroom-humor search demand, and more measurable guide-product clicks.

**Review / QA**:
- Self-reviewed the diff for thin-page risk, redirect specificity, sitemap
  inclusion through the shared guide list, schema/content match, and homepage
  link density.
- `npm run build` and `npm run lint` passed.
- Local built-server checks verified the new guide returns 200 with title
  `Funny Poop Gifts | goose.gifts`, canonical
  `https://www.goose.gifts/gift-guides/funny-poop-gifts`, FAQPage and ItemList
  schema, and 40 outbound/product links in rendered HTML.
- Verified homepage rendered links to `/gift-guides/funny-poop-gifts` and
  `/gift-guides/funny-gifts-for-dads-who-fish`.
- Verified sample legacy slug
  `/hilarious-poop-gift-bundles-for-prank-friends-ab12` returns a 308 to
  `/gift-guides/funny-poop-gifts`.
- Playwright desktop/mobile screenshots showed the new guide and homepage guide
  chips render without overlap. The only console error was the expected local
  `/_vercel/insights/script.js` 404 from running Vercel Web Analytics under
  `next start`.

**Next**: watch Search Console/GA4 for whether newly published guide URLs begin
to get impressions, keep recycling stale bundle URLs into canonical guides, and
use the next search-log cluster to publish another non-thin guide only when the
catalog can support it.

---

## 2026-07-07 - Pinterest white elephant Pin replaced

**Owner direction**: Cameron spotted a second duplicate-product issue on the
first Pinterest Pin and asked to fix and reupload it.

**Shipped in this run**:
- Hardened `scripts/ops/generate-pinterest-assets.mjs` so v2 Pinterest cards
  fetch the full guide product list, require five distinct product images, and
  fail instead of repeating a product tile.
- Regenerated the v2 white elephant asset. Verified the corrected image uses
  five distinct products: socks, emergency humor box, coasters, mystic pickle,
  and squirrel hot tub.
- Posted the corrected white elephant Pin:
  https://www.pinterest.com/pin/1107815208383151361/
- Deleted the old duplicate-image Pin:
  https://www.pinterest.com/pin/1107815208383131380/
- Verified the `Funny White Elephant Gifts` board shows `1 Pin`, pointing to
  the corrected live URL.

**Next**: keep the v2 generator guardrail in place before any future Pinterest
batch, then move toward API/OAuth posting so replacements are less browser
fragile.

---

## 2026-07-06 - Pinterest v2 starter batch posted

**Owner direction**: Cameron approved trying the stronger v2 Pinterest creative
set, with one requested cleanup: remove duplicate belly/fanny-pack products from
the white elephant image before posting.

**Shipped in this run**:
- Regenerated the white elephant v2 asset so the product collage uses distinct
  products instead of duplicate belly/fanny-pack style items.
- Posted the five approved v2 product-collage Pins from the `goose.gifts`
  Pinterest account.
- Verified the `Created` tab at `https://www.pinterest.com/goosegifts/` shows
  all five live Pins.

**Live Pins**:
- Funny White Elephant Gifts People Will Actually Steal:
  https://www.pinterest.com/pin/1107815208383151361/
- Office-Safe Funny Gifts for Coworkers:
  https://www.pinterest.com/pin/1107815208383131573/
- Weird Kitchen Gadgets That Are Actually Giftable:
  https://www.pinterest.com/pin/1107815208383131619/
- Novelty Desk Toys for Bad Meetings:
  https://www.pinterest.com/pin/1107815208383131622/
- Weird Home Decor Gifts for Rooms That Need a Double Take:
  https://www.pinterest.com/pin/1107815208383131674/

**Next**: evaluate whether Pinterest API access is available for this account so
daily ops can post through an authenticated script instead of browser automation.
Until that is wired, future external Pinterest posting remains explicit-owner
approved.

---

## 2026-07-06 - Daily ops: Monday guide sprint shipped

**Health**: production homepage returned 200 with the expected title,
`/sitemap.xml` returned 200, `/search?q=dad%20with%20no%20spare%20time`
returned a 307 redirect to `/?q=...`, and the semantic catalog query page
returned 200 with `Check price` rendering and outbound affiliate links.

**Metrics snapshot**: Vercel Web Analytics reported 23 visitors and 83
pageviews for 2026-06-06 through 2026-07-06 UTC, with 1 visitor / 14 pageviews
on 2026-07-06. Guide pages now appear in top paths:
`/gift-guides/funny-gifts-for-coworkers`,
`/gift-guides/funny-gifts-for-dads`,
`/gift-guides/novelty-desk-toys`, and
`/gift-guides/white-elephant-gifts` each had 2 visitors. GA4 showed 22 direct
sessions, 1 paid-search session, and 3 referral sessions in the same reporting
window. Database totals: 3,256 active products before discovery, 18,446
impressions, 92 product click events, 290 lifetime searches, 0 searches in the
last 24 hours, and 1 product click in the last 7 days. Catalog readiness stayed
strong: all active products had images, affiliate links, embeddings, and punny
copy; 3,239 active products still had unknown prices.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 74 candidates, 74 active/enriched/embedded candidates, 7 inserted, and
67 updated.

**Shipped growth work**: completed the Monday SEO publishing sprint with five
new crawlable catalog-backed guides:
`/gift-guides/funny-gifts-for-moms`,
`/gift-guides/funny-gifts-for-gamers`,
`/gift-guides/funny-golf-gifts`,
`/gift-guides/funny-gardening-gifts`, and
`/gift-guides/funny-hostess-gifts`. Each guide returned a full 36-product
server-rendered grid in QA, inherits the existing guide template's title/meta,
canonical URL, visible FAQ/editorial copy, related internal links, sitemap
entry, and matching ItemList/FAQ schema. Expanded homepage featured guide links
from 12 to 18 so the new pages get immediate internal links. Expected metric
movement: more indexed long-tail guide pages, more organic landing-page
coverage beyond the homepage, and more outbound click opportunities from
recipient/hobby-specific queries.

**Review / QA**:
- Self-reviewed the diff for thin-page risk, keyword overreach, homepage link
  density, sitemap/schema coverage, and old bundle-flow regression risk.
- Verified each new guide returns 36 products from the production catalog.
- `git diff --check`, `npm run build`, and `npm run lint` passed.
- Local built-server Playwright checks verified the gamer guide on desktop and
  mobile plus the homepage guide-link block. The only console error was the
  expected local `/_vercel/insights/script.js` 404 from Vercel Web Analytics
  outside Vercel.

**Needs**: no new P0 blocker. Revenue reporting, product price coverage, and
owned channel posting approval remain the highest-leverage owner-dependent
inputs.

**Next**: verify the deployed guide pages and open the weekly check-in issue
with the five-page sprint, traffic baseline, and top owner asks. Tomorrow,
review Search Console/GA4 for whether the new guide URLs start appearing, then
either improve price coverage or recover another stale bundle/query cluster.

---

## 2026-07-05 - Google Analytics Data API access connected

**Owner direction**: Cameron asked to trigger whatever auth was needed and to
audit whether analytics was ready for user/funnel analysis.

**Shipped in this run**:
- Confirmed GA4 browser tagging is live in `app/layout.tsx` with measurement ID
  `G-6RR3HPR747` and Google Ads tag `AW-17626116539`.
- Found the matching GA4 property in Google Analytics:
  `507421709` (`goose.gifts`).
- Added the dedicated goose service account
  `goose-gifts-search-console@goose-gifts-1759468598826.iam.gserviceaccount.com`
  to the GA4 property as `Viewer`.
- Enabled Analytics Data/Admin APIs in Google Cloud project
  `goose-gifts-1759468598826`.
- Added `scripts/ops/ga4.sh` and `npm run analytics:ga4 -- ...` for repeatable
  read-only GA4 reports.
- Updated `.env.example`, the runbook, needs list, and Search Analytics docs
  with the property ID, key path, and supported report commands.

**Verification**:
- `npm run analytics:ga4 -- events` reads GA4 Data API rows from the dedicated
  service-account key. The first verified 30-day report included `page_view`,
  `session_start`, `first_visit`, `user_engagement`, `scroll`, `search`, and
  `conversion_event_outbound_click`.
- The GA4 property UI lists the dedicated goose service account with `Viewer`
  access.

**Next**: the remaining analytics work is instrumentation and reporting, not
owner auth: track guide-page product impressions/clicks, add source/session
stitching, and rebuild admin growth dashboards around catalog search and guide
performance.

---

## 2026-07-05 - Dedicated Google Cloud project for Search Console

**Owner direction**: Cameron asked to trigger whatever auth was needed to fully
set up goose.gifts with isolated Google Cloud/Search Console access.

**Shipped in this run**:
- Reauthenticated `cam@37.technology` for `gcloud` and ADC.
- Found the existing dedicated Google Cloud project
  `goose-gifts-1759468598826` (`goose-gifts`) with billing enabled.
- Enabled the required APIs in that project: IAM, Service Usage, Cloud Resource
  Manager, Site Verification, and Search Console.
- Created
  `goose-gifts-search-console@goose-gifts-1759468598826.iam.gserviceaccount.com`.
- Replaced the stable local key at
  `~/.config/gcloud/goose-gifts-search-console-sa.json` with a key from the
  dedicated goose project. The previous interim key was backed up locally with
  an `ereps-seo-retired` suffix.
- Replaced the interim Google verification file with the dedicated-project
  verification file at `/googleee777952c9d7ed07.html`.
- Merged and deployed PR #35, then completed Search Console ownership through
  the new service account after production served the new verification file.
- Removed the interim `ereps-seo` goose service account from both Site
  Verification ownership and its stale Search Console site entry.
- Closed Beads task `roadmap-93zq`.

**Verification**:
- `gcloud` is active as `cam@37.technology`.
- The dedicated project has billing enabled and `cam@37.technology` is owner.
- The local key now identifies
  `goose-gifts-search-console@goose-gifts-1759468598826.iam.gserviceaccount.com`.
- Production serves `/googleee777952c9d7ed07.html` and returns 404 for the
  retired `/google9ee84afec0bdaec6.html` file.
- Site Verification lists only the dedicated goose service account as owner for
  `https://www.goose.gifts/`.
- `scripts/ops/gsc.sh sites` lists `https://www.goose.gifts/` as `siteOwner`;
  sitemap readback works with 38 submitted URLs, 0 errors, and 0 warnings; and
  Search Analytics / URL Inspection API calls authenticate from the new key.
- The old eReps and interim goose keys no longer list goose.gifts in Search
  Console or Site Verification.

**Next**: watch Google recrawl the homepage canonical; the last inspection still
showed Google-selected canonical `https://goose.gifts/` from a pre-recrawl
state.

---

## 2026-07-05 - Search Console service account isolation

**Owner direction**: Cameron noticed that the eReps Search Console service
account had been added to goose.gifts and asked whether the project should use
a dedicated service account instead of commingling product identities.

**Shipped in this run**:
- Created
  `goose-gifts-search-console@ereps-seo.iam.gserviceaccount.com` for
  goose.gifts Search Console access.
- Created the local key at
  `~/.config/gcloud/goose-gifts-search-console-sa.json`.
- Replaced the old eReps Google verification file with the new goose-specific
  verification file at `/google9ee84afec0bdaec6.html`.
- Switched `scripts/ops/gsc.sh` to the goose-specific key path.
- Updated the runbook and needs list so future ops runs use the goose-specific
  credential.
- Deployed the verification-file swap through PR #33.
- The direct Site Verification `FILE` insert endpoint returned repeated Google
  503 backend errors after deploy, so the existing verified owner delegated
  ownership to the goose-specific service account, then the new account added
  the Search Console URL-prefix property.
- Removed
  `ereps-service-account@ereps-seo.iam.gserviceaccount.com` from the Site
  Verification owner list and removed its stale Search Console site entry.
- Added Beads task `roadmap-93zq` for the larger cleanup of moving this service
  account into a fully dedicated goose.gifts Google Cloud project once human
  `gcloud` auth/billing access is refreshed.

**Verification**:
- Production serves `/google9ee84afec0bdaec6.html` with the expected Google
  verification body.
- Production returns 404 for the old `/googleb19b5c4cd59433a7.html` file.
- Site Verification lists only
  `goose-gifts-search-console@ereps-seo.iam.gserviceaccount.com` as owner for
  `https://www.goose.gifts/`.
- `scripts/ops/gsc.sh sites` with the new default key lists only
  `https://www.goose.gifts/` as `siteOwner`.
- The old eReps key still lists eReps and Stitch It, but no longer lists
  goose.gifts.
- `scripts/ops/gsc.sh sitemaps` and URL Inspection work from the new key.

**Next**: no immediate owner action is needed for Search Console API reads. The
remaining access-hygiene improvement is `roadmap-93zq`, which requires a
dedicated Google Cloud project or refreshed human Cloud auth.

---

## 2026-07-05 - Pinterest first draft batch

**Prepared**:
- Added `docs/ops/PINTEREST_DRAFTS.md` with five pending-review Pinterest Pin
  drafts, one for each starter board.
- Each draft includes the board, target guide page, UTM-tagged tracking URL,
  title, description, alt text, and vertical image direction.
- Generated five vertical PNG image assets and a contact sheet under
  `docs/ops/pinterest-assets/batch-1/`.
- Reworked the creative direction into a more Pinterest-native v2 product
  collage set under `docs/ops/pinterest-assets/batch-1-v2/`, using real product
  images from the live guide pages and stronger scroll-stopping hooks.

**Publishing status**: nothing posted. Cameron still needs to approve the draft
batch before any external Pinterest publishing.

**Next**: after approval, post the v2 image assets and log live Pin URLs here.

---

## 2026-07-05 - Pinterest profile cleanup and starter boards

**Shipped in this run**:
- Verified the Pinterest profile fields: display name `goose.gifts`, username
  `goosegifts`, website `www.goose.gifts`, and the short public bio.
- Created the first public Pinterest boards:
  - `Funny White Elephant Gifts`
  - `Funny Gifts for Coworkers`
  - `Weird Kitchen Gadgets`
  - `Novelty Desk Toys`
  - `Weird Home Decor`
- Confirmed all five boards render on the profile's Saved tab with `0 Pins`.
- Uploaded `public/sillygoose.png` as the Pinterest profile avatar.

**Verification**:
- The public profile now renders a Pinterest-hosted avatar image for
  `goose.gifts` instead of Pinterest's default placeholder.

**Next**: prepare first pin concepts. Do not post externally until Cameron
explicitly approves the first publishing workflow.

---

## 2026-07-05 - Pinterest account and domain claim setup

**Shipped in this run**:
- Added `goosegifts@37.technology` as a Google Workspace alternate email for
  `cam@37.technology` and verified delivery with a test message.
- Created the Pinterest business account at
  `https://www.pinterest.com/goosegifts/` using `goosegifts@37.technology`.
- Set the profile name to `goose.gifts`, added the site URL, and added a short
  public bio.
- Added the Pinterest domain-claim meta tag to the site metadata.
- Completed Pinterest's website claim flow for `www.goose.gifts`.
- Added the real Pinterest profile link to the site footer.
- Prepared first no-post Pinterest concepts for the eventual launch: boards for
  white elephant gifts, funny coworker gifts, and weird home decor; initial pin
  candidates should come from the optical illusion guide and the next
  catalog-backed evergreen gift guides.

**Verification**:
- Admin console shows `goosegifts@37.technology` alongside the existing product
  aliases.
- The alias delivery test arrived in `cam@37.technology`; the test message was
  archived after verification.
- The public Pinterest profile renders with the expected name, username, bio,
  and website link.
- Pinterest settings show `goose.gifts` as a connected claimed website with an
  `Unclaim` action available.

**Next**: prepare pin concepts for evergreen guide pages. Do not post
externally until Cameron explicitly approves the first publishing workflow.

---

## 2026-07-05 - Google Search Console connected for goose.gifts

**Owner direction**: Cameron clarified that the intended GSC setup target was
goose.gifts, not eReps.

**Shipped in this run**:
- Enabled the Google Site Verification API on the existing `ereps-seo` Google
  Cloud project using the available service-account token.
- Added and deployed the Google verification file at
  `/googleb19b5c4cd59433a7.html` through PR #29.
- Verified `https://www.goose.gifts/` for
  `ereps-service-account@ereps-seo.iam.gserviceaccount.com` via the Site
  Verification API.
- Added the verified URL-prefix property to Search Console and submitted
  `https://www.goose.gifts/sitemap.xml`.
- Added `scripts/ops/gsc.sh` for repeatable Search Console checks.
- Moved Google Search Console access from owner-needed work to received work in
  `NEEDS.md` and marked the SEO todo complete.

**Verification**:
- Production verification file returned 200 with the expected
  `google-site-verification` body.
- Search Console site list now includes `https://www.goose.gifts/` as
  `siteOwner`.
- Sitemap readback shows 38 submitted URLs, 0 errors, and 0 warnings.
- URL Inspection for the homepage works. Google's last crawl was 2026-07-03,
  before the recent canonical-to-`www` fix, so it still reports the old
  `goose.gifts/` canonical until Google recrawls.
- Live homepage now serves canonical and `og:url` as `https://www.goose.gifts`.

**Next**: use Search Console data in the weekly guide-candidate workflow once
query rows populate, and watch for Google to recrawl the homepage and settle on
the `www` canonical.

---

## 2026-07-05 - Daily ops: optical illusion guide recovery shipped

**Health**: production homepage returned 200 with the expected title,
`/sitemap.xml` returned 200, `/search?q=dad%20with%20no%20spare%20time`
redirected to `/?q=...`, and the semantic catalog query page returned 200 with
`Check price` rendering and outbound product links.

**Metrics snapshot**: Vercel Web Analytics reported 23 visitors and 48
pageviews for 2026-06-05 through 2026-07-05 UTC, with 2 visitors / 4 pageviews
on 2026-07-05. Top paths are still mostly `/`, but old bundle-style URLs and
the new gift-guide pages are now appearing in the top path list. Database
totals: 3,251 active products, 18,410 impressions, 92 product click events, 290
lifetime searches, 23 searches in the last 24 hours, and 0 product clicks in
the last 24 hours. Catalog readiness is strong for search/guide work: all
3,251 active products have images, affiliate links, embeddings, and punny copy;
3,234 active products still have unknown prices.

**Catalog work**: ran
`npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
Result: 76 candidates, 76 active/enriched/embedded candidates, 5 inserted, and
71 updated.

**Shipped growth work**: added
`/gift-guides/optical-illusion-decor-gifts`, a crawlable catalog-backed guide
for optical illusion decor gifts. This was chosen because the stale indexed
bundle URL
`/quirky-optical-illusion-statues-for-unique-decor-lovers-ey78` still received
traffic and the catalog has hundreds of matching image-backed affiliate
products. The old URL now 308 redirects to the canonical guide instead of a
search URL, so recoverable long-tail demand lands on a page with title/meta,
canonical, visible FAQ/editorial copy, related internal links, sitemap
inclusion, and matching ItemList/FAQ schema. Expected metric movement: more
indexed guide coverage and better organic retention for the optical illusion /
weird decor cluster.

**Review / QA**:
- Self-reviewed the diff for thin-page risk, redirect specificity, sitemap
  inclusion, schema/content match, and old bundle-flow regression risk.
- `npm run lint`, `npm run build`, and `git diff --check` passed.
- Local built-server checks verified the new guide title, canonical URL,
  visible H1, FAQ/ItemList schema, sitemap URL, 308 legacy redirect, and
  outbound product links.
- Playwright desktop and mobile screenshots of the new guide showed no visible
  layout breakage or text overlap.

**Needs**: revenue reporting, price coverage, and owned channel posting approval
remain the highest-leverage owner-dependent inputs.

**Next**: use the next live search/path data to recover another stale bundle
cluster into a guide when the catalog can support it, or begin the Monday
weekly SEO publishing sprint if that run is the first run after Monday.

---

## 2026-07-04 - Added recurring SEO guide publishing cadence

**Owner direction**: Cameron asked whether the SEO plan included a recurring
schedule to create and post new guide pages / non-legacy bundles that are
highly optimized and well presented.

**Shipped in this run**:
- Clarified that the existing SEO work had daily candidate discovery, but not
  an explicit weekly publishing quota.
- Added a weekly SEO publishing sprint to `SEO_GROWTH_TODO.md`: publish 3-5
  new or materially improved catalog-backed guide pages every Monday / first
  run after Monday, only when the catalog supports useful pages.
- Updated the runbook so weekly check-ins include the publishing sprint,
  desktop/mobile visual QA, sitemap/schema/canonical expectations, and
  owner-gated external posting.
- Updated the roadmap and handoff to frame these as polished guide/page
  packages, not a revival of legacy bundle permalinks.

**Review / QA**:
- Docs-only change; `git diff --check` passed.

**Next**: the next weekly run should execute this sprint: use search logs,
catalog themes, stale indexed URLs, and seasonal demand to ship 3-5 polished
guide pages or document why product depth/data quality is not ready.

---

## 2026-07-04 - SEO growth hardening and long-tail guide expansion

**Owner direction**: Cameron asked for the SEO/GEO audit ideas to be captured
in the docs, added to the todo list, worked through, reviewed, and shipped.

**Shipped in this run**:
- Added `docs/ops/SEO_GROWTH_TODO.md` and wired it into the roadmap, runbook,
  handoff, and needs list.
- Canonicalized crawl signals around `https://www.goose.gifts`; the shared
  site URL helper now normalizes a bare `goose.gifts` env value to `www`.
- Expanded the guide network from 5 to 36 catalog-backed pages, focused on
  long-tail persona, occasion, and weird-recipient intent clusters.
- Improved guide pages with visible FAQ/editorial content, related guide links,
  cleaner header navigation, and raw WebPage/BreadcrumbList/ItemList/FAQPage
  JSON-LD that matches visible content.
- Added permanent redirects for known old indexed bundle URLs, plus a guarded
  fallback for gift/bundle-style legacy slugs, without reviving the old bundle
  product surface.
- Updated `robots.txt` to use the canonical sitemap and keep `/admin/` and
  `/api/` out of crawl scope.
- Rebuilt public share assets: `sillygoose-og.png` is now a real 1200x630 card
  at about 98 KB, and `sillygoose.png` is down to a 512x512 icon asset.

**Review / QA**:
- `npm run lint` and `npm run build` passed after the final changes.
- Local built-server checks verified homepage canonical/OG/schema, sitemap
  count 37 with zero non-`www` URLs, 36 product links on the sampled guide,
  visible FAQ/related sections, guide schema graph, legacy 308 redirects, and
  a random unknown slug staying 404.
- A broader guide sweep verified all 36 guide pages have 36 product links plus
  visible FAQ and related-link sections.
- Playwright desktop/mobile checks on `/gift-guides/cat-lover-gag-gifts`
  showed no horizontal overflow, 10 guide-header links after the nav trim, and
  36 product cards. The only console error was the expected local
  `/_vercel/insights/script.js` 404 from Vercel Analytics outside production.

**Still open**:
- Price-specific guide pages should wait until price coverage improves.
- Search Console access and affiliate revenue reporting remain the highest
  leverage owner-dependent inputs for measuring and prioritizing the next SEO
  work.

**Next**: after deploy, verify production homepage, sitemap, one new guide
page, and the old bundle redirects. Then watch Search Console once available
and on-site search logs meanwhile for the next guide cluster.

---

## 2026-07-04 - Replaced bundle search with catalog search

**Owner direction**: Cameron asked to ditch the bundle-first search flow and
move to a simple semantic product search box on the main page, backed by
prefetched catalog data.

**Shipped in this run**:
- Replaced the homepage bundle/search flow with `CatalogSearchFeed`, which
  searches `/api/search-products` and renders product results in the main feed.
- Made the header search form submit to the homepage catalog feed, so the
  visible search box is the primary search interface rather than a separate
  bundle search page.
- Redirected `/search` to the homepage catalog feed and removed the old
  `/api/search-bundles` route and `SearchBar` component.
- Removed the public bundle generator/permalink flow and admin bundle surfaces
  from the maintained runtime path so shoppers stay in catalog search/results.
- Added product-level semantic search in `lib/db/product-search.ts`, with
  pgvector ranking when embeddings exist and keyword fallback while backfill
  catches up.
- Updated product click tracking so catalog-search clicks mark the logged
  `search_queries` row as clicked.
- Finished the catalog enrichment path in `catalog:prefetch`: discovered
  products now get LLM copy, tags, quality scores, and embeddings before
  upsert; the job also backfills a bounded set of existing active products.
- Added `npm run catalog:enrich` for enrichment-only backfills.
- Reframed the ops analytics snapshot around product search, product clicks,
  and catalog quality instead of active bundle creation.

**Catalog enrichment**: production had 3,251 active products; 3,247 were fully
enriched and 4 were missing copy/tags/embeddings. Ran
`npm run catalog:enrich -- --backfill-limit 20 --enrichment-batch-size 12`;
it backfilled the 4 missing products. Follow-up query confirmed 3,251 active,
3,251 enriched, 0 missing enrichment.

**Review / QA**:
- `npm run lint`, `npm run build`, `git diff --check`, `node --check
  scripts/ops/prefetch-catalog.mjs`, and `node --check
  scripts/ops/analytics-snapshot.mjs` passed.
- Local built-server smoke verified no stale bundle-search copy, no duplicate
  DOM ids, `/search?q=dad%20with%20no%20spare%20time` redirects to `/?q=...`,
  `/api/search-products` returns semantic product results, and `sitemap.xml`
  contains gift-guide URLs without bundle permalinks.
- Visual QA captured desktop and mobile screenshots for
  `/?q=dad%20with%20no%20spare%20time`. The first pass caught that the query
  heading could server-render before query-specific products arrived; fixed by
  server-rendering semantic search results when `q` is present.

**Next**: after deploy, verify live homepage/search/sitemap behavior and then
watch `/admin/search-analytics` for zero-result and low-similarity queries to
feed back into catalog discovery themes.

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
