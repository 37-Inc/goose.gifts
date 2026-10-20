# Stupid Gifts — staging implementation

This is an additive, protected Cloudflare preview, not a production cutover.
The launch spec and `roadmap-lbbz1` remain authoritative.

## Build and deployment

Use Node 22. Refresh source credentials using the runbook; never copy the
Postgres, Amazon or personal provider keys into the public snapshot.

```sh
CATALOG_SNAPSHOT_PATH=/absolute/private/cohort/catalog.snapshot.json npm run build:staging
npm run test:staging
npm run lint
npm run build
```

Without `CATALOG_SNAPSHOT_PATH`, the build uses explicitly synthetic fixtures.
The build copies a validated public-field-only snapshot into ignored
`build/stupid-gifts/`, renders `static-site/out/`, and records the source SHA,
snapshot digest, every asset digest and expiry policy. Commit reviewed source,
then rebuild before deployment. `verify-release.mts` refuses dirty/mismatched
source, changed snapshot bytes, changed assets or changed expiry routes.

`wrangler.staging.jsonc` targets only `stupid-gifts-staging` in the existing
37.technology account; it has no custom domains or production routes.
Set `STAGING_AUTH_SECRET` through the provider secret mechanism. Missing/short
secrets fail closed; Basic authentication uses username `staging`. Never put
the secret into a URL, repository, CLI output or screenshot.

```sh
node --import tsx scripts/staging/verify-release.mts
wrangler deploy --config wrangler.staging.jsonc --secrets-file /absolute/private/staging-secrets.json
```

Use the existing authorized Wrangler session if the ambient Cloudflare API
token is under-scoped. Do not broaden credentials or upgrade plans implicitly.
Provider resource operations use the official `cf` CLI; build/deploy uses
Wrangler. Production DNS, schedules, Vercel/Neon and account branding are unchanged.

All staging responses are noindex/no-store; analytics and external connection
endpoints are blocked by CSP. Semantic search defaults off. HTML, RSC and
public data companions are expiry guarded; expired or held products resolve
to product-free safe assets. Cache/conditional requests must not bypass that
guard. Public JavaScript must not contain merchant/product snapshot literals.

## Actual data evidence — October 19 local / October 20 UTC

Protected artifacts are under
`~/.codex/private/goose-gifts-migration/` (0700 directories, 0600 files).
They are not deployment assets.

- `export-2026-10-20-first/`: all 13 source tables, 40,692,109 bytes,
  one read-only repeatable-read snapshot. Manifest SHA-256:
  `6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076`.
  All 3,492 stored vectors round-trip through native pgvector binary bytes.
  This does not yet prove a full typed PostgreSQL restore.
- `sample-2026-10-20/`: exactly ten source products and one fresh Amazon
  `getItems` read at `2026-10-20T05:33:27.737Z`. No source database writes.
- `cohort-2026-10-20-first/`: four ready, six held for changed source facts.
  Rights are value-specific and merchant-derived, expiring at
  `2026-10-21T05:33:27.737Z`. Inherited editorial is not treated as perpetual
  owned content. No unverified prices are advertised.
- `import-2026-10-20-first/`: strict parameterized import packet, original
  source records and ten original vectors; only four vectors enter the
  eligible search index. Historical embedding-input provenance is unknown.
- `d1-atomicity-receipt.json`: deliberately failing a two-statement batch
  left zero rows in its disposable probe table; the probe was removed.
- `d1-import-receipt.json`: all ten D1 rows reconcile exactly, four public
  projections and six held; receipt replay skips writes. A `toast` FTS query
  returns one ready product.
- `vectorize-readback-receipt.json`: all four original vectors are visible
  with exact float32 byte hashes and metadata. A self-query ranks its own
  vector first; the wrong-revision filter returns no matches. This proves
  index transfer, not historical embedding-input freshness.

Do not infer UTC for historical timezone-naive dates. The reviewed sample
decisions preserve unresolved `created_at` as NULL in operational D1 while
retaining exact original text privately. See
`STUPID_GIFTS_TIMESTAMP_AUDIT.md` for writer evidence and remaining gates.

## Still required before launch

Full-catalog timestamp/reconciliation and native recovery proof, immutable
multi-revision publication/rollback, search parity and spending controls,
complete preserved route coverage, compliant recurring expiry publication,
real show curation, production analytics checks, and the final owner/provider
checklist remain open. Four staging products are not a launch-ready catalog.
The free Vectorize allowance also cannot hold all 3,383 historical product
vectors (5,196,288 dimensions); do not silently upgrade or discard inventory.
