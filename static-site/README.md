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
Use the same `CATALOG_SNAPSHOT_PATH` for the build and its artifact tests; the
tests check the exact cohort that was exported without saving that input to Git.

All routes have noindex metadata and robots disallows crawling. There is no
analytics provider, production analytics adapter, service worker, catalog browser
storage, offer schema, fabricated availability, or enabled fixture retailer CTA.
The shared `ProductImage` and price-free schema helper are reused; staging CTA
anchors deliberately do not import the production tracking adapter. Production
analytics and full route parity are separate integration/acceptance work.

Review `/`, `/gifts/illustrative-very-official-paperweight`,
`/gifts/illustrative-held-selection`, `/gift-guides/white-elephant-gifts`,
`/random-gift`, `/howie`, `/safe/catalog`, and `/preview/presentation`.
The last route is unlinked, noindex and excluded from sitemap policies; arrow,
PageUp/PageDown, Home/End and Space keys operate its selection slides.

`content/show/drafts.json` contains four truthful pending manifests. No episode
date, appearance, endorsement, selected product, physical sample or product-image
permission is implied. The initial 12 real products and four real weekly sets
remain a release gate. Published episode routes are intentionally not generated
until a confirmed real manifest is available. This proof covers two existing
guide URLs, not the complete production route inventory.
