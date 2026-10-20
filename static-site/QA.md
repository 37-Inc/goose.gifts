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
