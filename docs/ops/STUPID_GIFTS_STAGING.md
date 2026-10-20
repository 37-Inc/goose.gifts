# Stupid Gifts — staging implementation

This is an additive, protected Cloudflare preview, not a production cutover.
The launch spec and `roadmap-lbbz1` remain authoritative.

## Build and deployment

Use Node 22. Refresh source credentials using the runbook; never copy the
Postgres, Amazon or personal provider keys into the public snapshot.

```sh
CATALOG_SNAPSHOT_PATH=/absolute/private/cohort/catalog.snapshot.json \
CATALOG_RELEASE_CONTEXT_PATH=/absolute/private/release-context.json npm run build:staging
npm run test:staging
npm run lint
npm run build
```

Without `CATALOG_SNAPSHOT_PATH`, the build uses explicitly synthetic fixtures.
Every build, including a synthetic build, requires an explicit private release
context with exactly `schemaVersion: 1`, `sourceMode`, `releaseId`, `codeSha`,
`catalogRevision`, `catalogSnapshotSha256`, `generatedAt`,
`vectorSyncWatermark`, `priorReleaseId` and `retainedManifestSha256`.
The source SHA must match committed
HEAD; the snapshot digest hashes the validated snapshot serialized with
`JSON.stringify(snapshot) + '\n'`. Capture time must not precede the snapshot
or be in the future. Read the watermark and prior release from independently
verified state; zero and null are explicit bootstrap evidence, never defaults.
The verifier binds this copied context to the release manifest. An already-built
release ID cannot be overwritten: verify/reuse that sealed package or assign a
new reviewed ID.

`sourceMode` is explicitly `preview`, `goose-production`, or
`stupid-production`, never inferred from `NODE_ENV` or the request hostname.
The selected origin, wordmark, canonical/OG URLs and analytics host gate share
one allowlisted identity. The builder seals `site-identity.json`; verification
checks its digest and the exported canonical/social origins. Preview uses the
actual protected Workers hostname and remains noindex. A production identity
build does not authorize deployment, DNS changes, analytics activation or
provider rebranding.

Set `retainedManifestSha256` to explicit null when no overlap is needed.
Otherwise supply the independently verified prior manifest digest and
`CATALOG_PRIOR_RELEASE_PATH` pointing to its private package containing
`asset-manifest.json`, `catalog.snapshot.json` and `assets/`. The prior ID must
match `priorReleaseId`; both build and verify require that exact package.
Only content-addressed catalog shards and allowlisted owned JS/CSS/fonts
may overlap, for at most fifteen minutes without renewal. Current holds,
display changes or shorter rights deadlines remove old product bodies.
Old HTML/RSC are never copied. Encoded aliases use the same expiry guard.
The default overlap budget is 512 entries / 16 MiB; no implicit directory
discovery, historical asset registry or unbounded retention is introduced.

The build copies a validated public-field-only snapshot into ignored
`build/stupid-gifts/`, renders `static-site/out/`, and records the source SHA,
snapshot digest, every asset digest and expiry policy. Commit reviewed source,
then rebuild before deployment. `verify-release.mts` refuses dirty/mismatched
source, changed snapshot bytes, changed assets, changed expiry routes or a
changed prepared feed. Feed ranking and family deduplication run at build time;
the Worker receives a revision/digest-bound index plan, not a second product
copy or a per-request catalog-ranking job.

Home renders at most three hero cards and nine feed cards initially. Explicit
“More gifts” requests fetch revision-bound shards of 24 cards; Random renders
one card and fetches its pool of at most 48 only on the first spin. These
content-addressed JSON assets have the same rights/expiry guards as HTML/RSC,
and a ten-second abort deadline covers both fetching and response parsing.
They do not contain retailer URLs, prices or private editorial fields.

The separate `release-identity.json` binds the exact manifest bytes without a
self-referential checksum. The protected, no-store
`/.well-known/catalog-release.json` endpoint reports only release ID, source
SHA, catalog revision, snapshot SHA and manifest SHA. This proves package
identity, not Vectorize visibility or publication completion.

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
  The subsequent native restore proof is recorded below; full cluster settings
  and privileges are still outside that proof.
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
- `d1-operational-replay-receipt.json`: the reviewed replay implementation
  compared all ten actual rows using two SELECTs and made zero writes. A
  matching receipt alone is not accepted as proof of unchanged target data.
- `history-d1-run-c3mzEy/receipt.json`: the offline checksum-pinned packet
  imported 17 catalog runs and 3,750 run items into staging in 95 atomic
  batches, then safely replayed all 95 (plus two canary replays). Full-field
  readback and foreign-key checks passed; sequence high-water is 3,750.
  Existing ten product rows were unchanged. This uses only proven
  timezone-aware history fields, preserving every original source JSON line.
  Receipt SHA-256:
  `6346d2417b872b18cf86f731ea6334ca3558be2816290a958f574eaa9fa4f157`.
  Provider counters were 34,091 rows read and 18,991 written, including
  indexes/receipts; these are not unique imported-row counts.
- `operational-d1-run-YRU9u1/apply-receipt.json`: atomic migration 0005 and
  complete operational packet passed at 07:36 UTC. All 8,091 identities and
  expected fields reconciled (3,383 products, 17 runs, 3,750 items, 601 editorial
  events, 340 searches); all 205 batches replayed safely. The ten original
  products, four public projections and publication state were unchanged;
  3,373 additional products remain held. FK/quick_check/FTS and sequence checks
  passed. Apply counters: 101,695 rows read / 30,252 written, including indexes
  and receipts. SHA-256:
  `7297cdabec9b8e81120f97f10f11e47b9f9725768fe1426d59a125d852495fe1`.
  See [the operational mapping](STUPID_GIFTS_OPERATIONAL_PACKET.md).
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
- `recovery-native-pg17-T9TYHf/receipt.json`: all 13 tables, 11,921 rows and
  3,492 native vectors restored into isolated PostgreSQL 17.6 / pgvector 0.8.0.
  The recorded 165 columns, 21 constraints, 61 indexes, two functions, two
  triggers and two observed sequence configurations also match. The source is
  PostgreSQL 17.11; no identical-minor-version claim is made. Owned containers
  and volumes were removed. See [the native recovery receipt](STUPID_GIFTS_NATIVE_RECOVERY_2026-10-20.md)
  for hashes and remaining grants, sequence-state and cutover-delta gaps.
- `recovery-native-pg17-hsCHd4/receipt.json`: root repeated the entire native
  recovery against the integrated source at 06:33 UTC, with the same complete
  row/vector/schema checks. Implementation hashes match that checkout.
  Receipt SHA-256:
  `0a2e5608e64efcf5ca4c778dd192b030cc0d9d0cdd0c4012b1ff146608912bb4`.

The first protected release was source `2f5f21d`, Worker version
`069b3186-cd68-4e4f-b495-588790979ed9`; the bounded semantic QA version was
`f8147246-161e-493e-ad30-300ed3c77992`. All unauthenticated probes returned 401.
Authenticated home, directory, product, held product, Random, guide and search
passed. Desktop 1440px, mobile 390px and 720p previews were inspected; the mobile
retailer button fits in the first viewport. Unloaded below-fold lazy images
are not counted as first-view image failures.

PR [190](https://github.com/37-Inc/goose.gifts/pull/190) merged as `7b73ab7`.
The merged source was rebuilt and deployed to the protected Worker as version
`2a2a39b6-8b0b-4625-af14-70677f8bf0b4`, with semantic search disabled again.
The release contains 369 files and 368 guarded route aliases; provider startup
was 2 ms. The normal production Vercel deployment passed, and the public Goose
homepage, catalog, guides and ordinary Random remained available. This did not
switch the public domain or move the production writer.

Initial Cloudflare aggregate metrics over 55 mixed browser/semantic requests
reported zero errors, CPU p50 0.985 ms and p99 16.244 ms. The live GraphQL schema
explicitly identifies these fields as microseconds. This small mixed sample
is not route attribution, full-catalog capacity or proof of Free-plan headroom.
No paid plan, raw URL logging or production traffic was enabled.

A subsequent 60-request static-only probe against source `b5e2fac` had zero
HTTP errors and owner-machine TTFB p50 20.84 ms / p95 245.52 ms. Cloudflare's
adaptive metrics returned only 21 sampled requests for the exact window, with
zero errors and CPU p50 0.739 ms / p99 11.469 ms. Do not equate that sampled
count to all 60 requests, or treat this as demonstrated Free-tier CPU headroom
or the required full burst rehearsal.

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

The provider-neutral publication core adds a revision-scoped lease and
immutable intent to the existing revision/receipt model. A dispatch accepted
by a provider is only `dispatched`; completion requires independent deployed
identity and vector-visibility readback, then an atomic recheck of current
facts, holds, content deadlines, watermark and lease ownership. Failed dispatch
is retried at most three times. A real one-off staging proof on merged PR #191
(`f167e0764fe8eee8a19916cd6e348503d4189765`) progressed from `claimed` to
`dispatched` to `published`, with no completion receipt before independently
checking all five live identity fields and all four original vector values and
metadata. Worker version: `657d02af-2cc0-474a-82f2-599717e87e09`.
Private receipt `publication-proof-QKPwWC/receipt.json` has SHA-256
`b6201229402c5d8d2ca5ed3150c3291c7bb90cf842b1dbef7aabd40fda136bf6`.
This baseline has watermark zero; it does not prove later outbox processing.
The browser fetched Random's JSON once across three successful spins, with no
adjacent repeats or horizontal overflow. Production Goose routes remain healthy.
This is not an activated scheduled publisher: reusable provider workflows and
environment-wide deployment serialization remain separate work.

The reviewed search budget is an aggregate atomic D1 reservation, shared across
isolates and catalog revisions for the compiled environment/index scope. The
staging configuration permits at most 50 allocated semantic calls and 32,768
conservatively reserved input tokens per D1 UTC day, but the semantic switch
remains **false** by default. Missing/malformed caps, uncertain receipts, database
failure or exhaustion use keyword search before any embedding/index call.
Allocation is never refunded after uncertain failures. This is application
budget protection, not a provider bill cap or proof of Free-plan CPU headroom.

Do not infer UTC for historical timezone-naive dates. The reviewed sample
decisions preserve unresolved `created_at` as NULL in operational D1 while
retaining exact original text privately. See
`STUPID_GIFTS_TIMESTAMP_AUDIT.md` for writer evidence and remaining gates.

## Still required before launch

Full-catalog timestamp/reconciliation and remaining recovery gaps, the complete
multi-revision publishing/vector-outbox loop, 30-query search parity and global
spending controls, compliant recurring expiry publication,
real show curation, burst rehearsal, production analytics checks and the final
owner/provider checklist remain open. Four staging products are not a
launch-ready catalog. Provider cutover and decommissioning are separate gates.
The free Vectorize allowance also cannot hold all 3,383 historical product
vectors (5,196,288 dimensions); do not silently upgrade or discard inventory.

The next writer/freezer implementation must share one environment/index fence
across maintenance, importers, vector delivery and activation. The current
read-only snapshot reconstruction proves an **existing** reviewed seal, not a
new revision or a lock: two stable captures cannot exclude a later write or
ABA change. A pruning freshness run may remove expired/held content but cannot
refresh merchant verification, promote old holds, invent vector provenance or
claim an all-held catalog is healthy. Keep the current Neon job until these
transactions, telemetry, slug reservations and recovery checks are proven.
