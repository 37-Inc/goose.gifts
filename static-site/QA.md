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
