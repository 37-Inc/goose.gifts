# Needs from Cameron (prioritized)

Living list, reviewed every run and included in every weekly check-in.
Items move to "Received" when done.

## P0 — blocking autonomous operation

None currently.

## P1 — needed within the first weeks

### 1. Owned growth channel approval

To generate leads outside search, I need explicit approval before posting from
outward-facing accounts. Best remaining channels:
- **X/Twitter**: a goose.gifts account for one daily ridiculous find, threaded
  seasonal lists, and tagged links back to catalog pages.
- **TikTok/Reels/Shorts**: short vertical product roundups generated from the
  catalog; I can prepare scripts/assets, but posting needs account access or
  approval of the publishing tool.
- **Pinterest**: the account, Standard access, production publisher, catalog
  candidate feed, and minimum approval/duplicate/receipt guards are complete;
  see Received below. Cameron's scheduled-studio exception now authorizes at
  most one hard-gated exact package per calendar day, including a documented
  no-op when quality or evidence is weak. It does not authorize a second Pin,
  Sandbox use, paid distribution, or spend.

Needed from Cameron: choose which channels to authorize for posting and approve
any paid/video-generation tooling before spend.

## P2 — high value, not urgent

### 2. Review one held catalog item

The 2026-08-24 weekly run held the customized ugly-pet pillow at
`/gifts/purr-sonalized-ugly-pet-pillow-cuddle-your-inner-weird` because its
generated editorial made unsupported size and personalization claims. It is not
publicly indexable. Either leave it held or provide corrected factual copy for
an exact editorial seed; no broader catalog action is needed.

### 3. Funnel and admin analytics rebuild

PostHog, Google Search Console, GA4 Data API, and the app database cover the
current analytics stack; Vercel Web Analytics is intentionally disabled.
Catalog jobs now have durable run/item
receipts, token/cost/timing telemetry, rejection reasons, and a CLI manual-review
queue, so this is no longer a blocker for the first measured enrichment run.
The remaining product analytics work is guide-page product impressions/clicks,
source/session stitching, zero-result and thin-result search reporting, and an
admin dashboard shaped around catalog-first guide growth.

### 4. Direct email/Slack channel (optional)

Weekly check-ins arrive as GitHub issues, which email you automatically. If
you'd rather get real email/Slack from me, connect a connector at
**https://claude.ai/customize/connectors** and include it in the routine.

## Received

- 2026-08-25: Pinterest Standard access. Pinterest's verified developer sender
  confirmed on 2026-08-24 that the `Goose.gifts` app is approved. The production
  token refreshed with all five requested scopes; API v5 verified the correct
  `goosegifts` BUSINESS account, real public boards, public metrics, and a full
  dry-run create payload. The approval email thread was archived. This clears
  the access blocker, not the exact-package approval gate or paid-spend gate.

- 2026-08-25: Pinterest guarded production workflow. The owner-authorized
  cleanup removed five old ad-style Pins, six Sandbox test Pins, and five empty
  API Trial boards; at that cleanup checkpoint the account contained only six
  product-faithful public Pins. Subsequent guarded daily cycles added raw
  chicken, Butt Station, and Lick'em cat brush, bringing the current total to
  nine. The publisher checks the exact owner approval event and candidate state,
  account, complete disclosed package, 2:3 artifact, and duplicate tracking URL;
  it read-verifies success and records durable receipts. `npm run
  pinterest:candidates` supplies current high-quality enriched products without
  running the weekly catalog job.

- 2026-07-16: Amazon Creators API application and v3.1 credential received.
  The clean migration is merged as PR #57; credentials are installed in Vercel
  Production, Preview, and Development, while retired AWS variables and the
  legacy source toggle have been removed. Production smoke passed.

- 2026-07-10: Affiliate data-path audit completed. Amazon PA-API remains usable
  for product discovery but does not provide Associates earnings reporting and
  frequently omits prices. Awin has no configured publisher account/token and
  the catalog contains no Awin products. These are documented operational
  limitations in `docs/ops/AFFILIATE_DATA.md`, not standing owner asks.

- 2026-07-01: Full operating authorization (merge, deploy, daily autonomy,
  weekly check-ins, escalate when urgent/blocked).
- 2026-07-01: Daily Codex automation `goose-gifts-daily-ops` created and
  active. GitHub branch push/PR/merge path verified via PR #14. `VERCEL_TOKEN`
  stored as a GitHub repo secret and in local operator stores (macOS Keychain
  plus `$HOME/.codex/secrets/goose.gifts/vercel-token`); `pull-env.sh` can
  bootstrap from those stores without the token being in the repo.
- 2026-08-02: Google Search Console access for
  `https://www.goose.gifts/` uses the Full non-owner Portfolio Search Operator
  `portfolio-search-reader@thirty-seven-search-ops.iam.gserviceaccount.com`
  at `~/.config/gcloud/portfolio-search-console-sa.json`. Its email retains the
  earlier `reader` identifier. The older Goose identity is deprecated for GSC
  but remains in place for GA4.
  `https://www.goose.gifts/sitemap.xml` is submitted with 38 URLs, 0 errors,
  and 0 warnings. Use `scripts/ops/gsc.sh` for repeatable checks.
- 2026-07-05: Pinterest account and email alias. `goosegifts@37.technology`
  is a verified Google Workspace alternate email for `cam@37.technology`;
  it is the canonical public contact for Goose Gifts. Do not publish
  `cam@37.technology` or the invalid `cameron@37.technology` as a Goose Gifts
  contact.
  `https://www.pinterest.com/goosegifts/` is live with profile name
  `goose.gifts`, the site URL, and a short public bio. Pinterest shows
  `goose.gifts` as a connected claimed website. Starter public boards exist for
  funny white elephant gifts, funny coworker gifts, weird kitchen gadgets,
  novelty desk toys, and weird home decor, and the profile avatar uses the
  goose.gifts logo. OAuth Standard access is connected; the obsolete API Trial
  Pins and boards were removed after approval. Posting remains exact-package
  owner-approved only.
- 2026-07-05: Google Analytics Data API read access for GA4 property
  `507421709` (`G-6RR3HPR747`). The dedicated goose service account has Viewer
  access to the property, Analytics Data/Admin APIs are enabled in
  `goose-gifts-1759468598826`, and `scripts/ops/ga4.sh` / `npm run
  analytics:ga4 -- ...` can report events, traffic source/medium, landing
  pages, and filtered event rows.
