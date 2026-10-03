# Product analytics and search diagnostics

Current browser events use one explicit adapter in `lib/client-analytics.ts`
and the sanitized contract in `lib/analytics-contract.ts`:
`page_view`, `search`, `view_item_list`, `select_item`,
`conversion_event_outbound_click`, and `random_gift_spin`.

GA4 is `G-6RR3HPR747` (property `507421709`), Google Ads is
`AW-17626116539`, and the dedicated PostHog project is `550427`.
Use the Portfolio automation reader for GA4. Vercel Web Analytics is disabled.
The production-host allowlist and DNT/GPC checks remain unchanged. Preview and
localhost are suppressed. Autocapture, replay, text/form capture, surveys and
automatic pageviews remain disabled. Raw search terms, full affiliate URLs,
query-bearing landing URLs and first-party session payloads are not forwarded.

## What each signal means

- `search` fires after a successful catalog-search response, with
  `result_count`; zero results are distinguishable in PostHog. It is not an
  independent submit event and failed requests do not emit it.
- `view_item_list` records rendered products, not viewport exposure.
- `select_item` can open an owned gift page or select a retailer CTA. Filter
  `ui_context` before interpreting it as a detail opening.
- `conversion_event_outbound_click` records a retailer exit, not a sale.
- PostHog uses memory-only identity. Do not infer durable users, returning
  shoppers or cross-visit funnels. Provider counts need not agree under privacy
  suppression or delivery failure. GA4 custom QA/result-count dimensions may
  be unavailable; verify reporting metadata before querying them.

## Retired October 2026

The unused `/admin` UI, login/session/auth endpoints, stats report and public
`/api/admin/products` are removed. `/api/track-click` and its client writes
are removed. Historical `product_clicks`, product counters, `search_queries`,
admin/error tables and all migration files remain unchanged for rollback.
Frozen impressions and old clicks cannot form a current CTR. The historical
`search_queries.clicked` flag is no longer maintained and never proved a
complete search-to-retailer funnel.

Homepage, search, guides, related gifts, directory, editorial duplicate winners
and Pinterest candidates use existing relevance/quality/factual freshness,
stable tie-breaking and existing diversity/exploration rules instead of click
or impression counters. The unused Thompson-sampling helper is removed.

## Operational data retained

`GET /api/search-products` retains its existing best-effort server diagnostics
(query, result count, similarity, user agent, timestamp). These are request
records, including possible QA/bots, rather than proven humans. No collection
was added. The server-rendered `/?q=` path searches directly; its client makes
one existing diagnostic API request after hydration. Therefore SSR search
activity alone does not guarantee a stored search row.

`npm run analytics:snapshot -- --json` returns catalog health, result-count
buckets and explicitly labeled historical clicks without exporting raw search
text. Catalog runs/items/editorial events, the weekly runner, report/review
queues and affiliate repair tooling remain maintained.

`POST /api/admin/catalog-cache` retains its URL and exact bearer-secret
authentication. Catalog writers expire the shared data tags and crawler-facing
paths. `npm run test:catalog-cache` verifies this contract.

## Measurement and rollback

Compare complete windows in the GA4 property's America/Los_Angeles timezone;
apply production-host and symmetric source-quality filters. Separately exclude
explicit QA identities in PostHog. Missing coverage, an observed zero, unknown
human status, and sales are different claims. Never export raw searches or
identities into reports. No database deletion, retention change, provider
configuration change or tracking expansion is included in this cleanup.

Rollback is a code revert of the simplification PR. No data restoration or
migration is required; historical tables and columns remain available.
