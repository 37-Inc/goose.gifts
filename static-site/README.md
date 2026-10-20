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
analytics provider, production analytics adapter, service worker, catalog browser
storage, offer schema, fabricated availability, or enabled fixture retailer CTA.
The shared `ProductImage` and price-free schema helper are reused; staging CTA
anchors deliberately do not import the production tracking adapter. Production
analytics and Worker redirect/expiry acceptance are separate integration work.

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
