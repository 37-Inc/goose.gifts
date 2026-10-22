# Google Custom Search — retired October 22, 2026

The optional Google Programmable Search / Custom Search JSON API catalog
fallback is retired. Do not provision an engine, enable the API, add its old
environment variables, or restore a Vercel discovery job from older instructions.

Catalog discovery and verification use Amazon Creators API. Short or empty
responses stay short or empty; throttled themes are skipped with a telemetry
warning. Receipt uncertainty and other source errors still fail closed.
Customer-facing search uses the site's own catalog, D1 and optional Vectorize;
it does not require Google web search or an enterprise replacement service.

Only `customsearch.googleapis.com` was disabled in project
`goose-gifts-1759468598826`, with a fresh console readback showing **Enable**.
The project, existing keys, other Google services, GA4 and Search Console
were not deleted or changed. Old secret values may remain in retained rollback
configuration, but discovery no longer reads or uses them. The Cloudflare
operator also retains its defensive legacy-environment scrub.

See the [retirement receipt](ops/google-custom-search-retirement-2026-10-22/receipt.json)
and current [runbook](ops/RUNBOOK.md). No catalog run, site publication,
new search service, spend or Pinterest restart is authorized by this cleanup.
