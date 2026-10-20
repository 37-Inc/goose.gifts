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
source, changed snapshot bytes, changed assets, changed expiry routes or a
changed prepared feed. Feed ranking and family deduplication run at build time;
the Worker receives a revision/digest-bound index plan, not a second product
copy or a per-request catalog-ranking job.

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
- `d1-projection-receipt.json`: four immutable public projections and a sealed
  receipt reconcile exactly. Replaying a receipt verifies actual stored bytes;
  missing/corrupt rows are not accepted. Rollback preflight accepts the current
  compatible revision and refuses it after its content deadline. Mutable
  product holds, changed facts and revoked display rights override old releases.
- `staging-semantic-receipt.json`: four bounded real embedding/Vectorize/D1
  queries through the deployed Worker return the expected toast, gothic décor
  and BS-button results; wall latency 740–1,641 ms. Semantic was temporarily
  enabled for this QA; the checked-in staging default remains off. This is a
  four-product proof, not the full 30-query migration acceptance.
- `recovery-pg14-jenjlR/receipt.json`: all 11,921 rows across 13 tables and
  3,492 vectors restored into a disposable Unix-socket-only PostgreSQL cluster,
  with exact field/vector hashes and 21 key/relationship checks. See
  [the recovery receipt](STUPID_GIFTS_RECOVERY_DRILL_2026-10-20.md). The fresh
  cluster was stopped and removed; protected evidence remains. This proves
  raw archival recovery, not full original-schema/native-pgvector restoration.

The first protected release was source `2f5f21d`, Worker version
`069b3186-cd68-4e4f-b495-588790979ed9`; the bounded semantic QA version was
`f8147246-161e-493e-ad30-300ed3c77992`. All unauthenticated probes returned 401.
Authenticated home, directory, product, held product, Random, guide and search
passed. Desktop 1440px, mobile 390px and 720p previews were inspected; the mobile
retailer button fits in the first viewport. Unloaded below-fold lazy images
are not counted as first-view image failures.

Initial Cloudflare aggregate metrics over 55 mixed browser/semantic requests
reported zero errors, CPU p50 0.985 ms and p99 16.244 ms. The live GraphQL schema
explicitly identifies these fields as microseconds. This small mixed sample
is not route attribution, full-catalog capacity or proof of Free-plan headroom.
No paid plan, raw URL logging or production traffic was enabled.

## Preserved routes and failure checks

The static app reuses all 43 existing guide definitions without importing their
database/cache loader. Product membership requires original-title focus
matches, rights-cleared display data and family deduplication; thin guides are
not filled with unrelated gifts. The proof cohort supports eight guides and
leaves 35 empty/noindex. Directory pages contain 24 entries, with bounded
page redirects. The Weird Gift Index and its JSON endpoint explicitly report
only this sample and make no full-catalog, popularity or price claims.

Actual exported HTML, RSC and JSON aliases are tested through the Worker with
an advanced clock and conditional request headers: every timed response serves
the exact safe asset at expiry, expired products leave the sitemap, and browse
routes make no D1 read. This is fail-closed protection, not a completed recurring
publisher; expired previews are expected to become safe/empty until rebuilt
from newly verified content.

Do not infer UTC for historical timezone-naive dates. The reviewed sample
decisions preserve unresolved `created_at` as NULL in operational D1 while
retaining exact original text privately. See
`STUPID_GIFTS_TIMESTAMP_AUDIT.md` for writer evidence and remaining gates.

## Still required before launch

Full-catalog timestamp/reconciliation and native recovery proof, the complete
multi-revision publishing/vector-outbox loop, 30-query search parity and global
spending controls, static preview assets, compliant recurring expiry publication,
real show curation, burst rehearsal, production analytics checks and the final
owner/provider checklist remain open. Four staging products are not a
launch-ready catalog. Provider cutover and decommissioning are separate gates.
The free Vectorize allowance also cannot hold all 3,383 historical product
vectors (5,196,288 dimensions); do not silently upgrade or discard inventory.
