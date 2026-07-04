# goose.gifts

goose.gifts is a catalog-first gag gift affiliate site. The app prefetches and
enriches funny products, embeds them for semantic search, and serves a fast
homepage feed where shoppers can search phrases like "dad with no spare time"
without entering a slow bundle-generation flow.

## Current Product

- **Homepage product feed**: best available catalog items are rendered directly
  on `/`, with affiliate disclosures and product-level click tracking.
- **Semantic catalog search**: `/api/search-products` embeds the query and
  ranks active products by pgvector similarity, catalog quality, engagement,
  and recency. Keyword fallback keeps search usable while embeddings backfill.
- **Catalog enrichment**: `scripts/ops/prefetch-catalog.mjs` discovers and
  backfills products with punny titles, short descriptions, humor tags, quality
  scores, and `text-embedding-3-small` vectors.
- **Admin visibility**: `/admin` shows catalog health, product click metrics,
  and search analytics.

The old public bundle generator, bundle search endpoint, bundle permalink pages,
and admin bundle screens have been removed from the maintained runtime path.

## Tech Stack

- Next.js 15 App Router and React 19
- Tailwind CSS
- Vercel Postgres / Neon with pgvector
- OpenAI for product copy, tags, quality scoring, and embeddings
- Amazon Product Advertising API plus Google Custom Search for catalog discovery

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run build
```

Catalog operations:

```bash
npm run catalog:prefetch
npm run catalog:enrich -- --backfill-limit 500 --enrichment-batch-size 36
```

Operational docs live in `docs/ops/`. Start with `docs/ops/RUNBOOK.md`,
`docs/ops/ROADMAP.md`, and `docs/ops/HANDOFF.md`.

## Affiliate Disclosure

goose.gifts participates in affiliate programs including Amazon Associates. We
earn commissions from qualifying purchases made through links at no additional
cost to shoppers.
