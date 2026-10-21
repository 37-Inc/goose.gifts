# Static proof QA — October 19, 2026

Local exported output reviewed through the loopback-only preview server. This
is not a deployed Cloudflare, real-search, real-product or performance receipt.

- Next 16.3.5 / webpack: static export succeeded, 17 pages; TypeScript passed.
- Eight targeted snapshot/random/manifest/show tests passed, including every
  emitted HTML and nested RSC companion's freshness policy and safe asset.
- Scoped ESLint passed with the intentional native-document-anchor override.
- 1440px desktop: warm-paper composition, distinct lead/two secondary examples,
  loaded images, no horizontal overflow, no external scripts or console errors.
  Reduced the oversized first artwork after reviewing the composed screenshot.
- 390 × 844 mobile: all three illustrations loaded; scroll width 390px; first
  action bottom 591px. Labels make the fictional, non-purchasable status explicit.
- Search submit updated `?q=desk`; the deliberate local 503 showed useful
  unavailable text and collection links. Back restored empty query/input/status.
  Staging Worker search success, provider fallback and relevance remain separate.
- Random changed paperweight → trophy without repeating; image/name/caption and
  ordinary `/gifts/illustrative-tuesday-trophy` links changed together.
- 1280 × 720 presentation: controls bottom 684px, no horizontal overflow;
  ArrowRight and End moved to selection 3 and disabled Next at the boundary.
  Draft status, pending exact products, and unconfirmed appearance remain visible.
- Exported JS scan found no fixture IDs/slugs/titles/image paths, production
  analytics IDs, GTM, private source hashes or database configuration. Those
  product values appear only in guarded HTML/RSC. No fixture retailer link is
  rendered, and safe variants contain no product content.

Review images remain outside source in `output/playwright/`:
`stupid-gifts-desktop.png`, `stupid-gifts-mobile.png`, `stupid-gifts-show-720.png`.
No measured LCP/CLS, burst load, deployed expiry, public show readiness, or real
retailer navigation is claimed by these checks.

## Bounded real-cohort follow-up — October 19 Pacific / October 20 UTC

- Built the separately prepared private `staging-2026-10-20-cohort-1` snapshot:
  four ready and six held products, 23 exported pages. No private input or
  merchant imagery was copied into source control. The cohort's content deadline
  remains October 21 at 05:33:27.737 UTC; the Worker guard is still required.
- Kept inherited titles, descriptions and editorial wording intact. Preserved
  the existing three editorial paragraphs and added a small, wrapping exact
  retailer listing name. Real photos use a white field with restrained spacing.
- Real release metadata/Random copy no longer describes the products as
  fictional examples. Held pages use the snapshot's safe generic wording.
  Guide-specific selections remain pending: a migration sample is not an
  office-safe or gift-exchange recommendation.
- 390 × 844: homepage first action bottom 591px; the longer button headline
  wraps cleanly with retailer CTA bottom 756px. The toast page's CTA is at 718px;
  its long exact listing title wraps within 346px with no overflow. Primary
  images loaded. Related images below the viewport remain normally lazy-loaded.
- 1440 × 900: product CTA bottom 512px; three editorial paragraphs, restrained
  heading hierarchy, no horizontal overflow or third-party scripts. Homepage
  real-photo composition was reviewed at both viewport sizes.
- Retailer anchor host/target/rel and visible price-free label were inspected;
  no affiliate link was followed. No production tracking configuration changed.
- Artifact tests now accept the same snapshot environment variable as the build
  and verify the actual cohort's private/expiry-bound product values are absent
  from immutable JS, generic safe fallbacks and the pending presentation.

Additional local screenshots: `stupid-gifts-real-desktop.png`,
`stupid-gifts-real-mobile.png`, `stupid-gifts-real-product-desktop.png`,
`stupid-gifts-real-product-mobile.png`, and `stupid-gifts-real-toast-mobile.png`.
These are private QA evidence, not durable merchant assets or public creative.

## Retained content routes — October 20 UTC

- Both illustrative and private real-cohort exports passed TypeScript. The final
  real export has 66 HTML assets, including all 43 canonical guides. All 368
  content-bearing route/HTML/RSC/JSON mappings have safe fallbacks. No shared
  catalog contract or production `app/` files changed.
- The canonical guide content, title-focus groups and featured slugs were checked
  against `37cc671`: exact unchanged initializers. Existing guide/editorial/schema
  and Neon-boundary tests pass. The live DB-selection implementation is unchanged.
- The four-ready-product sample supports eight guides, with no more than two
  matches each; 35 remain visibly empty and non-indexable. Only ready original
  merchant titles establish focus membership. Generated copy cannot invent it.
- Directory tests cover 49 owned synthetic records across 24/24/1 products,
  deterministic ordering, finite route boundaries, ordinary links, page-1 alias,
  and HTML/nested-RSC guards. The actual cohort exports one page; deployed
  query/invalid/overflow redirects remain Worker acceptance checks.
- The sample Weird Gift Index reuses the canonical dictionaries/algorithm. Its
  visible tables, Article/Dataset schema and aggregate-only JSON agree. The page
  identifies the small sample, original method date, current snapshot date,
  price/source-data limitations, disclosure, citation and verified contact alias.
  JSON and its direct `.json` alias share snapshot expiry and a generic fallback.
- 28 focused tests passed against each actual export (fixture then real input).
  Scoped ESLint and `git diff --check` passed. All 32 emitted JS files were scanned
  for current product IDs/slugs/titles/images/retailer URLs, fixture literals,
  production analytics IDs and private field names; none were present.
- Playwright: 1440 × 900 guide hub contains all 43 ordinary links. The populated
  coworker guide, empty cat guide, sample index and its tables fit 390 × 844 with
  scroll width 390; a visible ready product image loaded. The index tables fit
  the 346px content width, JSON-LD parsed, and the HTML pages had no console errors.
  Internal aggregate-JSON navigation returned 200/application-json locally; its
  browser viewer requested a missing `/favicon.ico` (404), while HTML pages use
  the owned SVG favicon. No retailer was opened.
- SEO skill guidance was limited to truthful visible-content/schema alignment,
  internal links, explicit report methodology and metadata. Preview noindex and
  crawler blocking remain intact; no indexing or external validation submitted.

Additional screenshots outside source: `stupid-gifts-guides-desktop.png`,
`stupid-gifts-guide-desktop.png`, `stupid-gifts-guide-mobile.png`,
`stupid-gifts-empty-guide-mobile.png`, `stupid-gifts-index-desktop.png`, and
`stupid-gifts-index-mobile.png`. Full-catalog coverage/analysis and public show
content remain separate readiness gates.

## Short-desktop refinement — October 20 UTC

- A wide/short media query (`min-width: 1001px`, `max-height: 780px`) reduces
  only homepage opening spacing and lead artwork height. At 1280 × 720 the
  loaded lead image, title (bottom 579px) and View gift (bottom 642px) fit.
- 1440 × 1000 retains the original 1.65 artwork ratio and opening margins;
  390 × 844 retains 1.25 and its first action at 591px. Neither overflows.
- Real-cohort export/TypeScript and all 28 focused tests passed again.
  Screenshots: `stupid-gifts-home-short-desktop.png`,
  `stupid-gifts-home-tall-desktop.png`, `stupid-gifts-home-mobile-unchanged.png`.

## Lazy static browse shards — October 20 UTC

- Kept the already-bounded three-card opening; added at most nine SSR browse
  cards below search and an explicit 24-card More button. Random now sends one
  initial card and lazily fetches its existing bounded 48-card pool on first spin.
  No automatic shard fetch, infinite-scroll system or browser storage was added.
- Card-only JSON is deterministically content-addressed from the public display
  projection and format/bounds. It excludes retailer URLs, prices, long editorial,
  private facts and internal catalog fields. Finite Next route handlers export it
  directly; every exact JSON route is manifest-guarded at its own earliest expiry.
- The opt-in 73-record owned-fixture export test passed 8/8: initial Home HTML/RSC
  stops at 12 records, Random at one, all emitted JSON matches the source projection,
  each shard has a safe fallback, and fixture values are absent from immutable JS.
  The temporary input is removed; no real content is turned into synthetic fixtures.
- Playwright large-fixture browsing: initial 3 hero + 9 feed cards, zero shard
  requests. Manual loads produced 33/57/70 feed cards, three requests total,
  70 unique ordinary product links, and no More button at the end. Random began
  with one card/zero requests, spun 0 → 29 → 20, and fetched its pool only once.
- Mocked safe-unavailable JSON removed the feed/Random cards and displayed an
  explicit fresh-look/browse state, not healthy empty results. Unit tests also
  cover cancellation transport, response-parsing across expiry, malformed/mixed
  revisions, extra fields, duplicate identities and empty source snapshots.
- Restored the private four-ready-row cohort. Its Home has three hero + one lower
  card; Random begins with one card, then one four-card pool fetch. Canonical links
  changed together with the selection, without opening a retailer. At 390px there
  is no overflow and the hero action is unchanged at 591px; 1280 × 720 remains
  unchanged. Both new feed compositions were visually inspected; no console errors.
- Real-cohort export/TypeScript, 36 focused checks and scoped ESLint passed. The
  opt-in build check is skipped in the normal suite and run separately above.
  Historical shard retention through cache lifetime is pending publishing work;
  unavailable old-release URLs fail explicitly, and no content expiry is extended.

Screenshots outside source: `stupid-gifts-shards-real-{desktop,mobile}.png` and
`stupid-gifts-shards-feed-{desktop,mobile}.png`.

## Remake route follow-up — October 21 UTC

- Reviewed the maintained static routes against `roadmap-lbbz1.3/.4/.5` and the
  launch spec. No broad redesign or retired-feature restoration was warranted.
  The expired four-product merchant sample was not reused as fresh visual proof.
- Fixed a missing Search form/anchor in the safe collection shell. Its native
  GET action and enhanced submissions both use root query URLs, even when the
  shell is displayed at an expired product/guide path. Unavailable search copy
  no longer claims that a collection exists below the empty state.
- A saved mobile query previously left search at 1,054px, below the 844px
  viewport. Initial/history queries now reveal the search section; blank/short
  queries retain the product-first home composition.
- Added one shared client boundary for already-open static product bodies.
  It reads existing rendered deadline attributes and clears the page body at
  the earliest one, also checking visibility/pageshow restoration. Worker
  request guards remain authoritative; already-received bytes cannot be recalled.
- New clock/interaction tests cover deadline boundaries, restored tabs, long
  timer clamping, no-timer safe/legal pages, query history/cancellation and
  root-only submission. Export checks still scan safe assets and immutable JS
  for product/private content.
- Local owned fixtures only: 1440×900 home, 390×844 home/search, and 1280×720
  unpublished presentation reviewed. Three opening illustrations loaded; mobile
  width is 390px and first action bottom is 591px. Browser clock advancement
  removed the open product image and displayed the safe collection heading.
  No real retailer was opened; the loopback search's intentional 503 is not a
  provider/search acceptance result.

Private local artifacts: `output/playwright/remake-home-desktop.png`,
`remake-home-mobile.png`, `remake-search-mobile.png`,
`remake-expired-mobile.png`, and `remake-show-720.png`. These are synthetic layout
and behavior evidence, not real-cohort, imagery-rights, episode, owner-taste,
performance or public-launch acceptance.
