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
- **Pinterest**: account access, profile polish, starter public boards,
  OAuth/API Trial access, API Trial boards, and the first five-Pin v2
  product-collage batch are live. A dry-run API pin manifest now maps those
  assets to tracked guide URLs, and ops can build dry-run create-pin payloads
  from approved copy/assets. Recurring public posting still needs Pinterest
  Standard access plus owner approval of the publishing cadence or next batch.
  **Ready to submit (2026-07-17):** the full Standard-access application package
  — use-case text, scope justifications, data-handling statement, terminal demo
  shot-list, and exact dev-portal steps — is in
  `docs/ops/pinterest-standard-access.md` (Beads `roadmap-fd1h`). Owner action:
  record the ~2-min demo video and click **Upgrade** in the developer portal.

Needed from Cameron: choose which channels to authorize for posting and approve
any paid/video-generation tooling before spend.

## P2 — high value, not urgent

### 2. Funnel and admin analytics rebuild

Vercel Web Analytics, Google Search Console, GA4 Data API, and the app database
are now readable by ops scripts. The remaining work is product-side
instrumentation and admin reporting: guide-page product impressions/clicks,
source/session stitching, zero-result and thin-result search reporting, and an
admin dashboard shaped around catalog-first guide growth.

### 3. Direct email/Slack channel (optional)

Weekly check-ins arrive as GitHub issues, which email you automatically. If
you'd rather get real email/Slack from me, connect a connector at
**https://claude.ai/customize/connectors** and include it in the routine.

## Received

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
- 2026-07-05: Google Search Console access for
  `https://www.goose.gifts/`. The service account
  `goose-gifts-search-console@goose-gifts-1759468598826.iam.gserviceaccount.com`
  is the Search Console owner from the dedicated `goose-gifts` Google Cloud
  project. The old eReps service accounts no longer list goose.gifts.
  `https://www.goose.gifts/sitemap.xml` is submitted with 38 URLs, 0 errors,
  and 0 warnings. Use `scripts/ops/gsc.sh` for repeatable checks.
- 2026-07-05: Pinterest account and email alias. `goosegifts@37.technology`
  is a verified Google Workspace alternate email for `cam@37.technology`;
  `https://www.pinterest.com/goosegifts/` is live with profile name
  `goose.gifts`, the site URL, and a short public bio. Pinterest shows
  `goose.gifts` as a connected claimed website. Starter public boards exist for
  funny white elephant gifts, funny coworker gifts, weird kitchen gadgets,
  novelty desk toys, and weird home decor, and the profile avatar uses the
  goose.gifts logo. OAuth/API Trial access is connected, API Trial boards exist,
  and `npm run pinterest:pin-drafts` can validate a tracked five-pin dry-run
  manifest. Posting remains owner-approved only.
- 2026-07-05: Google Analytics Data API read access for GA4 property
  `507421709` (`G-6RR3HPR747`). The dedicated goose service account has Viewer
  access to the property, Analytics Data/Admin APIs are enabled in
  `goose-gifts-1759468598826`, and `scripts/ops/ga4.sh` / `npm run
  analytics:ga4 -- ...` can report events, traffic source/medium, landing
  pages, and filtered event rows.
