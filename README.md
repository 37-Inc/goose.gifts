# Stupid Gifts

[stupid.gifts](https://stupid.gifts) is a catalog of funny, unusual and actually
purchasable gifts. This repository retains its original `goose.gifts` name until
the separately tracked provider/repository cleanup.

## Current Product

- **Static catalog**: homepage batches, product pages and gift guides come from
  a reviewed snapshot. Browsing does not wake a database or call a model.
- **Search**: explicit submit-based keyword search uses Cloudflare D1. Optional
  Vectorize/embedding search is disabled until its separate acceptance gates pass.
- **Catalog maintenance**: cleared permanent listings survive supplier photo,
  price and stock expiry. The bounded D1 daily writer remains gated; the old
  Neon writer must not be run as a fallback. See the current runbook.
- **Operational visibility**: CLI catalog reports preserve job receipts and
  review queues. GA4/PostHog record explicit product events; the obsolete admin
  dashboard and detailed click writes are retired. Historical tables remain
  intact. See `docs/SEARCH_ANALYTICS.md`.

The old public bundle generator, bundle search endpoint, bundle permalink pages,
and admin bundle screens have been removed from the maintained runtime path.

## Tech Stack

- Next.js 16 App Router and React 19 (Node.js 22; use `.nvmrc`)
- Tailwind CSS
- Cloudflare Workers static assets, D1 and optional Vectorize, on the Free plan
- Separately configured APIs for bounded editorial/embedding maintenance
- Amazon Creators API plus Google Custom Search for catalog discovery

Vercel and Neon are retained for rollback only. Their Git auto-deployment and
old catalog writers are disabled; repository pushes do not publish to Vercel.

## Development

```bash
npm install
# Retained legacy app only; not the Cloudflare release target:
npm run dev
```

Useful checks:

```bash
npm run lint
npm run test:staging
```

Build the maintained Cloudflare site from clean, committed source using a public
snapshot and explicit reviewed release context. This command does not fetch data,
use Neon credentials, activate a publisher or replace production:

```bash
CATALOG_SNAPSHOT_PATH=/absolute/private/catalog.snapshot.json \
CATALOG_RELEASE_CONTEXT_PATH=/absolute/private/release-context.json npm run build
node --import tsx scripts/staging/verify-release.mts
```

`build:staging` remains compatible. `build:legacy` builds the retained Neon-backed
Next app with its separately authorized rollback environment. See
[build context and verification](docs/ops/STUPID_GIFTS_STAGING.md).

Operational docs live in `docs/ops/`. Start with `docs/ops/RUNBOOK.md`,
`docs/ops/ROADMAP.md`, and `docs/ops/HANDOFF.md`.

## Affiliate Disclosure

Stupid Gifts participates in affiliate programs including Amazon Associates. We
earn commissions from qualifying purchases made through links at no additional
cost to shoppers.
