# Stupid Gifts — isolated static proof

This additive Next 16 / React 19 app leaves `app/` and the production Vercel build
unchanged. Build with the repository's installed Next:

```sh
node node_modules/next/dist/bin/next build static-site --webpack
node static-site/scripts/preview-server.mjs
node --import tsx --test tests/static-site*.test.mjs tests/show-manifest*.test.mjs
```

The loopback preview server is for visual review, not deployment: it deliberately
returns search unavailable until the staging Worker is attached. The release
must serve all output through the Worker policy; `createStaticRoutes` maps actual
HTML, `.txt`, and nested `__next.*.txt` companions to safe fallback assets. Never
publish `out/` without that expiry guard.

The build reads one immutable local allowlisted snapshot. Set
`CATALOG_SNAPSHOT_PATH` to use an explicitly prepared rights-cleared snapshot;
without it, the checked-in `synthetic_fixture` is used. No database, Amazon,
OpenAI or remote font request runs during rendering. Inter's existing licensed
Latin subset is self-hosted with its SIL license. SVG illustrations are original
geometric design fixtures, not merchant images or photographs of actual products.
Artifact tests automatically use the integration build's immutable
`build/stupid-gifts/catalog.snapshot.json` when present. For direct manual Next
builds, use the same `CATALOG_SNAPSHOT_PATH` for the build and tests. Pure fixture
tests remain independent; no input is saved to Git.

All routes have noindex metadata and robots disallows crawling. There is no
initialized analytics provider by default, service worker, catalog browser
storage, offer schema, fabricated availability, or enabled fixture retailer CTA.
The shared `ProductImage` and price-free schema helper are reused; staging CTA
anchors retain native navigation. Worker redirect/expiry acceptance is separate
integration work.

Analytics is opt-in implementation, not activation: only a build with
`NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED=true`, a non-fixture catalog, and the exact
HTTPS hostname `stupid.gifts` can load the existing shared adapter. Local,
unknown-host, staging and synthetic-fixture pages remain off. DNT/GPC is checked
before loading and dispatch, including deferred provider initialization. The
adapter retains Goose's GA4/Ads destinations and existing PostHog configuration;
it reuses the original contract sanitizer and disables broad capture. Static
attribution uses the tab-lifetime `stupid.gifts.analytics-attribution.v1`
sessionStorage key, only after the same build/host/catalog/DNT/GPC gates. It
contains only the original contract's sanitized traffic source, medium and
campaign; no URL, query, referrer path, session ID or term/content is stored.
Ordinary internal navigation keeps the original source; a new explicit coarse
campaign can replace it. Invalid/blocked storage never interrupts navigation.
Goose's original attribution behavior and key are unchanged. Explicit events
cover page views, completed current searches, rendered lists (deduplicated),
canonical card selections, successful Random spins and chosen retailer links.
Search text, copy, full URLs and private fields are not event properties. Native
links are never delayed or intercepted; the Ads callback cannot open another tab.
No consent UI/state exists in the current adapter, so none is invented here.
Production privacy/legal review, an approved public privacy notice, hostname
configuration and explicit activation remain separate release gates. Do not set
the flag for current staging or fixture deployments.

Review `/`, `/gifts/illustrative-very-official-paperweight`,
`/gifts/illustrative-held-selection`, `/gift-guides`, `/weird-gift-index`,
`/weird-gift-index/data`, `/random-gift`, `/howie`, `/safe/catalog`, and
`/preview/presentation`.
The last route is unlinked, noindex and excluded from sitemap policies; arrow,
PageUp/PageDown, Home/End and Space keys operate its selection slides.

`content/show/drafts.json` contains four truthful pending manifests. No episode
date, appearance, endorsement, selected product, physical sample or product-image
permission is implied. The initial 12 real products and four real weekly sets
remain a release gate. Published episode routes are intentionally not generated
until a confirmed real manifest is available.

All 43 existing guide definitions, editorial sections, explicit FAQs and focus
groups are shared with the live app through the pure
`lib/gift-guide-definitions.ts`. The live app's selection behavior is unchanged.
Static membership requires every original title-focus group and uses existing
conservative family deduplication, without the live app's broad fallback. Thin
guides remain empty/non-indexable rather than borrowing unrelated products.
Runtime fallback FAQs that claim a live catalog are not copied into this sample.

The directory exports 24 ready products per finite page in quality/id order.
`/gifts/page/1` is a non-indexable duplicate asset whose ordinary URL the Worker
redirects to `/gifts`. Query, invalid and overflow redirects are Worker-owned.
Page counts and links use the complete snapshot's earliest expiry.

The Weird Gift Index and its aggregate-only JSON are generated together with
the original dictionaries and algorithm. They explicitly describe a bounded
snapshot sample, not the complete catalog, sales, popularity, or demand. Source
price coverage is not measured and no price conclusions are made. Both assets
expire with the first ready record, including the direct `.json` alias.
Full-catalog analysis remains a release-readiness gate.

Homepage browsing keeps the three opening cards and renders at most nine more
below search. An explicit More gifts button loads 24 cards at a time; it does
not auto-fetch or use infinite scrolling. Random renders one initial card and
loads its bounded 48-card pool only on the first spin. This completes lazy
payloads/static browsing; the prior hero and Random pool were already bounded.

`createBrowseRelease` deterministically projects approved display-only cards
from the same snapshot. Shards use `/catalog/<public-content-sha256>/*.json`,
include revision/deadline identity and the public retailer-source enum, and omit
retailer URLs, prices, long editorial and private source fields. Every exact JSON route has its own earliest-content
expiry and generic unavailable fallback. They are exported by Next directly;
the normal release asset inventory/checksum hook needs no extra writer.
Missing/old-release, mixed-revision, malformed and expired responses show a
refresh/browse state, not a healthy empty collection. Historical shard retention
through cache lifetime is still publishing-layer work; no expiry is extended.

The larger owned-fixture export check is intentionally opt-in because it replaces
the local output. Rebuild with your approved snapshot afterward:

```sh
STATIC_SITE_BUILD_SHARD_FIXTURE=1 node --import tsx --test tests/static-site-shards.test.mjs
```
