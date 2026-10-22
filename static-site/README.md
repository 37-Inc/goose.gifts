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

The default protected preview and all fixtures have noindex metadata and robots
disallows crawling. There is no
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
`/gifts/illustrative-held-selection`, `/gift-guides`,
`/random-gift`, `/howie`, `/safe/catalog`, and
`/preview/presentation`.
Weird Gift Index and its data/companion routes are retired and must return 404,
including when a stale package still contains those paths. Public source and
final packaged assets must not contain personal owner attribution. A retained
old chunk with that identity refuses packaging; use an explicit no-retention
release rather than carrying those bytes forward.
The last route is unlinked, noindex and excluded from sitemap policies; arrow,
PageUp/PageDown, Home/End and Space keys operate its selection slides.

`content/show/drafts.json` is the owner-maintained four-set shortlist. Candidate
UUIDs/variants may be recorded before they enter the approved snapshot; none of
that implies current eligibility, physical possession, recording permission,
endorsement or an appearance. Unapproved draft presentation props strip candidate
identities, copy, imagery and links to generic pending slots. `published.json`
starts empty. Initial publication requires confirmed date/status, owner and
presentation approvals, non-fixture catalog data and ready original products;
`assertEpisodePublishable` remains the strict initial gate.

Published manifests alone generate `/howie/<key>`, its `/presentation` view and
display-only `/data.json`; no approval flags or unused merchant fields are sent.
The hub shows the latest published set and stable archive links. Missing/held
originals retain their immutable public ID and exact variant, explicitly marked
unavailable; only eligible alternatives are separately labeled, never promoted
into the original slot. Product-free archives remain useful stable records.
Every episode HTML/RSC/JSON and presentation payload shares the first displayed
product deadline, with merchant-free safe variants preserving original identity.
Presentation also stops displaying products when its loaded deadline passes.
Only a published set adds a From the show navigation link.

Next export disallows empty dynamic parameter lists. The small `.episode.tsx` /
`.episode.ts` route extensions are enabled only when tracked `published.json` is
nonempty, so no dummy or draft episode is emitted to work around that limitation.
The original Vercel app is unaffected. The existing presentation layout and
keyboard controls are reused. Server-only `qrcode-generator` produces a local
deterministic SVG for the canonical episode page with the three coarse episode
campaign fields, alongside an ordinary link; no external QR service or client
encoder is involved.

Zero-ready snapshots render the existing safe Home, with held/noindex root,
directory, Random and shard policies. The Worker therefore serves unavailable
variants and rejects a healthy-empty compatibility feed.

Optional controlled export tests copy the project under ignored `output/`, keep
the actual drafts/publication source untouched and mark test episodes not aired.
They use explicit local release contexts and no provider calls:

```sh
STATIC_SITE_BUILD_SHOW_FIXTURE=1 STATIC_SITE_BUILD_EMPTY_FIXTURE=1 CATALOG_SNAPSHOT_PATH=<approved-snapshot> node --import tsx --test tests/static-site-show.test.mjs
```

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
refresh/browse state, not a healthy empty collection.

`retainStaticAssets` is a pure publishing seam, not an implicit prior-directory
loader. Its caller supplies an explicit prior release ID, trusted manifest SHA,
exact sealed manifest/snapshot bytes and asset map; the helper verifies their
digests and coherence. It returns only files and route policies to merge before
final checksums/sealing. The staging builder/verifier now share this integration:
reviewed context must explicitly provide `retainedManifestSha256` (a SHA-256 or
`null`), independently of `priorReleaseId`. Only a non-null digest permits
`CATALOG_PRIOR_RELEASE_PATH`, pointing to an explicit sealed package containing
`asset-manifest.json`, `catalog.snapshot.json` and `assets/`. Its exact manifest
digest and release ID must match the context before any retained bytes are used.
No local discovery, implicit prior package or public filesystem path is added.

The final manifest seals `retention: { priorManifestSha256, currentAssetPaths }`
or explicit `null`. Verification checks every asset checksum, reconstructs the
current-only inventory, reruns the retention helper from the same trusted prior
package/capture time, and compares combined files, bytes and policies. Historical
shards cannot be relabeled as current to bypass freshness. Missing/wrong prior
inputs, symlink escapes, byte tampering, policy extension or unexpected assets fail
within that provenance boundary. Next deletes its output before export; the
two-release drill verifies stale files cannot enter the fresh inventory.
`currentAssetPaths` is sealed **builder provenance**, not independent proof of
regeneration against someone able to rewrite and reseal the entire package:
an old owned chunk relabeled as current cannot be distinguished without a clean
rebuild or an externally trusted post-build digest. This verifier recomputes
retained policy given the trusted builder inventory; it does not add that second
trust system or claim to resist whole-package resealing.

Old shard bytes survive only while their public display projection still matches
current ready products. Deadlines are capped at original rights, current rights
and a fixed 15-minute overlap from first retirement capture. Held, changed,
retired or expired products get unavailable aliases without old bytes. The
manifest-sealed `retainedUntil` is preserved across release chains, never renewed.
Only trusted, checksum-matching owned Next JS/CSS/fonts can also carry over;
product/private literals in code fail packaging. No old HTML/RSC is copied.
Paths, file sizes and total packaging are bounded (default 512 routes/16 MiB).
Current paths/policies win; immutable-name byte collisions fail. The current
unavailable JSON and `/safe/asset.txt` remain the fallbacks. This covers a bounded
deployment overlap, not indefinite old-tab support: long-suspended tabs must
reload. Historical product OG retention is not added before any such assets have
actually been deployed.

The optional two-release build/verify drill uses only owned fixtures and local
assets. It replaces the local output, so rebuild an approved snapshot afterward:

```sh
STATIC_SITE_BUILD_RETENTION_FIXTURE=1 node --import tsx --test tests/static-site-release-retention.test.mjs
```

OG cards use the explicit reviewed `siteIdentity`, never a separately hardcoded
brand or origin. Finite `/og/<descriptor-sha256>.png` routes render 1200×630 local
typography/shapes with the installed Next renderer and bundled font; no merchant
image, external font, emoji service or image generation is used. Brand and guide
cards use owned text; product titles come only from the approved snapshot and
inherit its product deadline with an owned brand-card fallback. Unsupported
glyphs or titles that cannot fit safely use the brand card instead of invented
or truncated copy. Fixture cards explicitly say not for sale. `styleVersion`
must change when the renderer changes so immutable paths never change bytes.
Metadata includes absolute OG images and Twitter large-image cards. Preview and
fixtures remain noindex; production mode alone does not index held/thin/private
routes. Indexability requires explicit route eligibility and non-fixture status.
Eligible Home/catalog/Random/report pages, the maintained guide hub and matching
guides, confirmed published archives and reviewed privacy content can index only
in an explicit production source mode. Empty/held/thin routes, duplicate page 1,
unpublished show content and presentation views stay noindex; query search is
also noindex at the Worker. Production robots permits maintained public content
and names the selected canonical sitemap; preview/fixture robots still blocks
everything. Retired/unknown paths remain Worker 404s. This is source capability,
not activation or a cutover.

Production static privacy reuses the existing published policy verbatim except
for the approved identity name, preserving its date, contact and conditional
analytics wording. The existing Vercel privacy view imports the same pure copy
without changing its content. Preview privacy remains explicitly preview-only.
The tiny existing owned favicon is reused across modes; no new mascot or logo
rights are implied. Production privacy review and provider activation remain
separate gates.

The larger owned-fixture export check is intentionally opt-in because it replaces
the local output. Rebuild with your approved snapshot afterward:

```sh
STATIC_SITE_BUILD_SHARD_FIXTURE=1 node --import tsx --test tests/static-site-shards.test.mjs
```
