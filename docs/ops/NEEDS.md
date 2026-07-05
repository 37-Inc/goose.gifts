# Needs from Cameron (prioritized)

Living list, reviewed every run and included in every weekly check-in.
Items move to "Received" when done.

## P0 — blocking autonomous operation

None currently.

The first scheduled run should still prove the loop end-to-end by appending a
journal entry, but there is no known owner action needed for the scheduler or
credentials.

## P1 — needed within the first weeks

### 1. Owned growth channel approval

To generate leads outside search, I need explicit approval before posting from
outward-facing accounts. Best remaining channels:
- **X/Twitter**: a goose.gifts account for one daily ridiculous find, threaded
  seasonal lists, and tagged links back to catalog pages.
- **TikTok/Reels/Shorts**: short vertical product roundups generated from the
  catalog; I can prepare scripts/assets, but posting needs account access or
  approval of the publishing tool.
- **Pinterest**: account access now exists, but first-pin themes, board naming,
  and any recurring posting workflow still need approval before anything is
  published externally.

Needed from Cameron: choose which channels to authorize for posting and approve
any paid/video-generation tooling before spend.

### 2. Revenue reporting access

I can optimize clicks blind, but revenue-weighting the site needs earnings
data:
- **Amazon Associates**: https://affiliate-program.amazon.com → Tools →
  Product Advertising API is already keyed; for earnings, either periodically
  export a report and drop it in the repo/an issue, or share report access.
  Current PA-API test calls return item/title/image data but often no
  `Offers.Listings.Price`; the catalog now treats that as unknown price data
  rather than a reason to withhold the product.
- **Awin**: https://ui.awin.com → the existing `AWIN_API_TOKEN` may already
  cover transaction reports; I'll verify once credentials land and update
  this item.

### 3. Product price coverage

Most active catalog products currently have unknown prices. That is acceptable
for the user-facing `Check price` flow, but it weakens Product rich-result
eligibility and makes gift guides less persuasive than competitor pages with
visible prices. Needed from Cameron only if the current API/account limits
cannot provide prices: any available Amazon/Awin/export path that lets daily
ops refresh price coverage for products shown on SEO pages.

## P2 — high value, not urgent

### 4. Analytics reporting depth

Vercel Web Analytics is active and programmatically readable, but the current
Hobby plan only exposes the latest 31 days and custom events require Pro or
Enterprise. Google Analytics is installed on the site, but no GA Data API read
credentials are available in env. If deeper analytics become important,
provide GA property/Data API access or a PostHog project key/host so daily ops
can report funnels beyond the app's own database search/click tables.

### 5. Direct email/Slack channel (optional)

Weekly check-ins arrive as GitHub issues, which email you automatically. If
you'd rather get real email/Slack from me, connect a connector at
**https://claude.ai/customize/connectors** and include it in the routine.

## Received

- 2026-07-01: Full operating authorization (merge, deploy, daily autonomy,
  weekly check-ins, escalate when urgent/blocked).
- 2026-07-01: Daily Codex automation `goose-gifts-daily-ops` created and
  active. GitHub branch push/PR/merge path verified via PR #14. `VERCEL_TOKEN`
  stored as a GitHub repo secret and in local operator stores (macOS Keychain
  plus `$HOME/.codex/secrets/goose.gifts/vercel-token`); `pull-env.sh` can
  bootstrap from those stores without the token being in the repo.
- 2026-07-05: Google Search Console access for
  `https://www.goose.gifts/`. The service account
  `goose-gifts-search-console@ereps-seo.iam.gserviceaccount.com` is the
  project-specific owner; `https://www.goose.gifts/sitemap.xml` is submitted
  with 38 URLs, 0 errors, and 0 warnings. Use `scripts/ops/gsc.sh` for
  repeatable checks.
- 2026-07-05: Pinterest account and email alias. `goosegifts@37.technology`
  is a verified Google Workspace alternate email for `cam@37.technology`;
  `https://www.pinterest.com/goosegifts/` is live with profile name
  `goose.gifts`, the site URL, and a short public bio. Pinterest shows
  `goose.gifts` as a connected claimed website. Posting remains
  owner-approved only.
