# Goose Gifts — cleanup verification and conversion review

Owner-approved work: `roadmap-vpmm.4.3` (implementation) and
`roadmap-vpmm.4.6` (investigation and proposals). Captured October 2 Pacific /
October 3 UTC. No visual redesign, provider settings, billing, outreach, or
tracking expansion was performed.

## Outcome and remaining gate

The obsolete admin and detailed click analytics cleanup is deployed in
[PR #160](https://github.com/37-Inc/goose.gifts/pull/160), merge
`f26311f2c78b650bf5cfd939044e08b31506c519`. Production alias
`www.goose.gifts` points to READY deployment `dpl_GbLBCzQr5d47Y1thxqcc2Mkhc3jC`
at that exact SHA.

Production navigation, search, feed stability, affiliate navigation, GA4
receipt, privacy suppression and catalog-cache authentication passed. The
PostHog adapter is unchanged and sends the expected allowlisted events, but
**stored PostHog receipt is blocked by the shared Product Analytics billing
limit**. Therefore `.4.3` is not acceptance-complete. The investigation and
recommendations in `.4.6` are complete; proposed visual changes remain an owner
decision, not shipped work.

Signed-in PostHog UI verification, project 550427 / Goose Gifts:

- Activity shows “Usage limit reached” for Product Analytics.
- Shared organization billing period: September 8–October 8, 2026.
- Displayed free volume: 1 M; billing volume limit: 1.15 M; current: 1.24 M.
- Current Product Analytics spending cap: $37; next-period cap already $0.
- These are **organization totals, not Goose usage or a Goose-specific bill**.
- No billing limit, project, key, filter, or other product was modified.

The last stored Goose event is `2026-09-19T05:33:37.870Z` (September 18 Pacific).
Fresh browser events and one separately labeled direct-ingestion QA probe
returned HTTP 200 / `status: Ok`, but aggregate readback contains none of them.
Do not equate transport acceptance with stored events. PostHog documents that
[hitting a billing limit stops ingestion](https://github.com/PostHog/posthog.com/blob/master/contents/docs/billing/estimating-usage-costs.mdx).
The API's newer ingestion-warning read was empty; the visible billing warning
is the decisive account evidence, not a guessed SDK fault.

Owner decision: keep the current spending cap and use GA4 while waiting for the
October 8 reset, or explicitly authorize a different shared billing policy.
Do not raise the cap autonomously. After ingestion resumes, perform one
QA-tagged real detail-to-retailer flow and confirm stored PostHog page/outbound
events before closing `.4.3`. This review neither assumes missing events will
be backfilled nor changes the separately owned portfolio analytics rollout.

## Cleanup acceptance evidence

- 110 tests pass; `npm run lint` and the production-environment build pass.
  The first build lacked the isolated worktree's environment; after refreshing
  from Vercel Production it passed. No dependency versions changed.
- Removed admin UI/session/auth/report routes, including the unauthenticated
  whole-catalog `/api/admin/products` endpoint, and `/api/track-click` plus its
  client writes. Local and production retired paths return 404.
- Current homepage, directory, kitchen guide, random gift and sitemap return
  200. A real result card opens its owned detail page; its retailer CTA opens
  the correct Amazon ASIN with `tag=goose-gifts-37-20` in a new tab.
- Production feed: 24 items, identical IDs for a repeated seed, and 24 disjoint
  items when excluding page one; no overlapping pagination or runtime error.
- `/api/admin/catalog-cache`: unauthenticated POST 401; authenticated POST 200
  with the expected catalog/product/guide/random/index/sitemap invalidations.
  URL and bearer contract are unchanged; secrets are not included in evidence.
- Baseline had 108 historical click records and 335 search records. After the
  one real QA search and retailer exit: still 108 click records, 336 searches.
  Correct UTC search receipt: `2026-10-03T05:13:17.751Z`. Naive database
  timestamps must be interpreted as UTC, not the local Node process timezone.
- Before QA, GA4 realtime for the explicit vocabulary was empty; afterward it
  contains `page_view`, `search`, `view_item_list`, `select_item`, and one
  `conversion_event_outbound_click`. A retailer CTA emits a selection too;
  selections are not exclusively owned-detail opens.
- Browser event properties retain QA medium/campaign, coarse result count,
  product/UI context and query-free page location, not search text or affiliate
  URL. PostHog outgoing bodies retain only the established allowlist and
  `$geoip_disable`. Neither source adapter nor analytics contract changed.
- Fresh production pages with DNT or GPC enabled have no gtag, no data-layer
  events and no Google/PostHog requests. Localhost suppression and Preview
  host exclusion remain covered by the unchanged gates and tests.
- Catalog schema, all migrations, historical tables/columns, catalog job
  telemetry, server search diagnostics, affiliate navigation and Google Ads
  destination/callback behavior are preserved. No destructive data operation.
- Existing dependency advisories remain, including the conditional Next
  ImageResponse advisory and dev glob/braces advisories. This is not a
  dependency remediation or a clean-security-audit claim.

Maintained ranking consumers: homepage, semantic/keyword search, guides,
related gifts, directory, editorial duplicate selection/backfill and Pinterest
candidate CLI. Stale clicks/impressions/last-click weights were replaced with
existing relevance, brand-fit/quality, factual freshness and deterministic
ties; homepage retains bounded daily seeded exploration and family diversity.
The unused Thompson/trending helper was removed. The analytics CLI labels
historical clicks and exports aggregate search diagnostics instead of terms.

Rollback is code-only: open a scoped revert PR for `f26311f`, rerun checks and
deploy through the normal workflow. Historical schema/data were retained, so
no database restore or destructive migration is needed. Do not blindly revert
subsequent unrelated work.

## Matched baseline and source quality

GA4 property `507421709`, timezone `America/Los_Angeles`, exact production
hostnames `goose.gifts` / `www.goose.gifts`. PostHog project `550427`, whose
existing source gate restricts events to production. DB connection verified
against current Vercel Production; aggregate queries used a read-only
transaction. No raw query text or visitor identities were exported.

Windows are complete and equally 28 days:

- Prior: August 7–September 3 inclusive; UTC `[Aug 7 07:00, Sep 4 07:00)`.
- Recent: September 4–October 1 inclusive; UTC `[Sep 4 07:00, Oct 2 07:00)`.

| GA4 measure | Prior | Recent |
| --- | ---: | ---: |
| Sessions | 74 | 103 |
| Engaged sessions | 13 | 12 |
| Pageviews | 90 | 110 |
| Recorded engagement seconds | 737 | 435 |
| Sessions excluding exact suspect burst | 74 | 41 |
| Engaged sessions excluding exact suspect burst | 13 | 11 |

On September 17, direct/desktop generated 62 GA4 sessions with one engaged
session, while PostHog recorded 57 different page paths and no action. This is
suspected automation or unlabeled QA, **not an identified bot or verified
customer cohort**. Applying the exact same exclusion to both windows yields
the adjusted totals above. The remaining 41 sessions are not proven humans
either. Landing-page row sums can overlap; do not add them as unique visitors.

Recent raw GA4 segments:

- Device: desktop 96 sessions / 9 engaged; mobile 6 / 2; tablet 1 / 1.
- Source: direct 96 / 11; amazon / `(not set)` 5 / 0; `(not set)` 1 / 0;
  vercel.com referral 1 / 1. No native Pinterest or Google referral is reported.
- Entry pages: `/` 18 / 8; `/gifts` 7 / 1; coworker guide 4 / 1; kitchen guide
  2 / 1. Fifty-four product landing paths have 55 summed row-sessions and only
  one engaged row-session. These sparse rows do not prove a UX cause.

PostHog's coarse source properties record seven directory pageviews with
`chatgpt.com`, one coworker-guide pageview with that source, and two kitchen
guide pageviews with `www.google.com`. These are small discovery signals, not
proof of recommendations, customers or sales. GA4 native acquisition differs
from these allowlisted custom properties: the adapter clears page referrer,
and the custom source/QA dimensions are not registered in GA4 reports. A native
`sessionMedium != qa` filter does not reliably exclude the custom QA receipts.
No attribution/filter/property-registration change was made here.

## Did people search, open details or exit?

GA4 recent vocabulary: 110 pageviews, 139 list events, eight selections, four
retailer exits; no recorded search or random spin. A list event means a
rendered list, not each card being seen. Selections include both owned-card
and retailer placements; use UI context where available, not an invented
eight-detail-open funnel.

PostHog's recent stored subset has 77 pageviews, 148 list events, five
selections, three exits. All three stored exits are explicit QA: two September
8 `reporting_20260908`, one September 16 `mobile_landing_20260916_human`.
Excluding whole QA identities leaves 75 pageviews, 146 list events, two
directory-card selections, zero stored exits and searches. Excluding the
September 17 burst as well leaves 18 pageviews and the two selections.
**These are observed events before ingestion stopped, not evidence of zero
activity through October 1.** Matched dates do not repair missing coverage.

GA4's fourth exit is an unattributed Wiener Switch event with no matched
PostHog receipt. It cannot be confidently classified as a customer or QA.
Do not report “all four were QA” or claim a sale. Provider counts are not
interchangeable: prior PostHog has two non-QA searches while prior GA4 has none.

Search diagnostics before today's QA: 335 lifetime records, most recent August
28; 11 in the prior window and none in the recent window. The route and write
path still exist; the real production search increments the table and sends a
GA4 search event. Its old date was **not caused by this cleanup removing
collection**. It means no successful requests were stored in that period; it
does not rule out failed submits, SSR-only loads, privacy suppression or vendor
loss. There are no independent submit/error events to reconstruct those paths.
Zero recent searches means the no-result rate is undefined, not 0%.
Nearest-neighbor retrieval can return weak matches rather than zero results,
so a historical zero-result count is not itself a relevance success measure.

## Runtime and visual review

Production at 390×844 mobile and 1440×1000 desktop: no horizontal overflow,
broken loaded images or application-error screen on representative pages.
Real search ranks the exact product first, but fills 36 results with several
weak pickleball-shirt neighbors. This is a relevance issue worth testing,
not evidence that all searches are poor.

| Surface | Current observation | Implication |
| --- | --- | --- |
| Mobile homepage | Header about 65px; first card starts about 720px | Hero, whitespace and guide chips dominate, not the navigation bar |
| Desktop homepage | Header about 80px; first card about 626px | Titles start around 902px; stronger objects should appear sooner |
| Mobile kitchen guide | First product card about 1,890px | Guide navigation and introductory sections precede any actual gift |
| Mobile product detail | Product image, title and Amazon CTA visible in first viewport | Keep the recently shipped compact detail layout; no broad redesign needed |

Opening homepage products include a Pet Sweep prank box, 21st-birthday toilet
paper, Butt Station and a patterned mug. This is visually repetitive and
occasion-specific relative to the approved useful-absurdity positioning. The
prank-box card needs a plain factual explanation that it is an empty wrapping
box, not an actual pet-cleaning appliance. Generated puns and unsupported
“ancient divination” style filler should not substitute for product facts.

## Small, ranked proposals — not deployed

1. **Product-first entry hierarchy.** Retain the already compact header and
   approved warm-orange character. Compress hero/blurb/search spacing; use one
   compact guide control and put secondary guide links below the first row.
   On guides, show a short useful intro plus the first selected objects before
   longer editorial sections; retain substantive indexable content below.
   Before: mobile homepage card at ~720px / guide ~1,890px. Proposed concept:
   homepage card at ≤420px / guide at ≤550px, with the object and a readable
   plain-language title visible without the first scroll. Desktop target ≤400px.
2. **Curated opening objects and factual card copy.** Select six to eight varied,
   current, purchasable useful-absurdity objects; avoid a row dominated by
   novelty paper or mug variants. Use the exact merchant images with consistent
   framing, not invented AI product shots. Concept: “Pet Sweep prank gift box” /
   “An empty box for wrapping a real gift,” with playful voice subordinate to
   understanding the item. Curate only a small entry cohort, not the whole DB.
3. **Bounded search relevance follow-up.** Test a small offline set of explicit
   item/recipient intents, then propose fewer strong matches or a separated
   weak fallback rather than always filling 36. Compare exact-item recovery,
   product-family duplication and unrelated commodity leakage before changing
   retrieval. Do not add raw inquiry capture or new event types.

Recommended owner choice: approve one coherent, small entry-layout plus
opening-cohort pass (1 + 2); keep the search change separate. This is a
conversion hypothesis, not a remedy for the much larger acquisition problem.

Evaluate existing owned-card selections per eligible entry pageview and actual
retailer exits, segmented by entry surface and excluding explicit QA and
documented suspect bursts. Vendor gaps must be visible. Inspect first after
two weeks; do not declare a winner before roughly 100 reasonably qualified
sessions or 20 owned-card selections. If four weeks cannot reach that, record
insufficient exposure rather than manufacturing a conversion conclusion.
Success: more intentional card opens and downstream retailer exits with no
truth/accessibility regression. Stop/revert for broken product navigation or
images, mobile overflow, hidden affiliate disclosure, keyboard/touch regression,
or a repeated >20% loading slowdown under comparable conditions. No paid test
or statistically powered A/B claim is proposed at this volume.

## Evidence and reproducibility

Safe aggregate provider requests, SQL, results and release checks are in
`docs/ops/evidence/2026-10-02-admin-analytics/`. Google queries use the Portfolio
reader and readonly scope; PostHog reads target only project 550427. Files have
no credentials, raw inquiry text or exported visitor identifiers. QA identity
matching happens inside provider queries, not exported rows. Browser screenshots
are retained locally in `output/admin-analytics-20261002/playwright/` after
worktree housekeeping. New testing visits are QA, not growth evidence.

Resume checklist: read the billing gate and latest provider timestamp; once
storage is available, verify one real QA flow in both vendors, update the
existing `.4.3` Bead, and stop. Seek the owner's design choice before the
proposed entry-layout/product-cohort implementation. No new recurring job is
needed for this handoff.
