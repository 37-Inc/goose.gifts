# Stupid Gifts — staging implementation

This is an additive, protected Cloudflare preview, not a production cutover.
The launch spec and `roadmap-lbbz1` remain authoritative.

### October 21 operator checkpoint

- The signed-in account is still Workers Free ($0); no $5 subscription or $15
  minimum was purchased. Codex runs the existing local task, not hosted CI.
- PR #205 is merged at `a3f11f687a107da85ed74faa3e8796f8d38c7e3d`;
  Vercel reports success for that source. The existing automation
  `goose-gifts-daily-ops` is updated in place to **Daily Catalog Care**, ACTIVE
  daily at 08:30 Pacific, retaining its ID/chat/creation time. Monday discovery
  is implemented inside the command; no second job exists. Its next allowance
  is October 22. The operator checkout is the retained managed worktree
  `~/.codex/worktrees/goose-migration-integration/goose.gifts`; do not archive it
  or use the shared checkout, now used by the separate Pinterest rebrand chat.
  Pinterest remains owner-PAUSED; this task does not resume or rename it.
- A fresh repeatable-read export (`export-2026-10-21-before-daily/`) contains
  all thirteen tables / 11,921 rows. Every table's row count and byte hash
  matches the October 20 export. New manifest SHA-256:
  `7e0ef540f25ef41f8dca0ffa8c7360f8741790951feb8a95cf8097dd2be2be02`.
  Recovery metadata is captured in the same transaction; final writer-barrier
  reconciliation remains required before production changes.
- Migrations 0009–0012 are installed in isolated staging. All 3,383 products
  and prior publication counts are preserved. Only staging's mutation fence
  is enabled, idle with no pending vectors, deliveries, builds or runs.
  `operator-readiness-jBhZTA/receipt.json` SHA-256:
  `84a8a68f1e080bd670f4ccfc8d83c8a51fd9c5215506fa6a14ff6b8ca90dfd24`.
  Five read-only readiness requests read 220 rows and wrote zero. This is
  structural readiness, not execution, search coverage or a public cutover.
- Daily canary `57fc2e81-6eb9-4357-a17d-777435352b12` selected ten distinct
  products but failed in the private verification adapter after one merchant
  response, before product writes. Exact telemetry and product timestamps
  confirm zero refreshed products and zero OpenAI calls. The repeated installed
  command correctly skipped the consumed allowance. The optional-field evidence
  comparison and private adapter serialization are fixed; a fresh successful
  merchant/publication canary is **still pending**, not falsely marked passed.
  Preserve the October 21 reservation; the next daily allowance is October 22.
  Sanitized receipt `daily-canary-2026-10-21-receipt.json` SHA-256:
  `c753e946a0bd7c8c7bf8e36fe74aeaa051080c76005931562dfc60a14232afe2`.
- Search is visible in safe states and bookmarked mobile queries scroll into
  view. Open-tab product bodies expire without requiring a reload. Presentation
  keeps its existing unavailable-episode archive. Synthetic visual/browser QA
  is not owner approval of a real opening cohort. The earlier four-product
  merchant observation has expired; never relabel it as current.
- PR #207 (`62fc900ecb04266f6b899f184ece1410c03418d9`) is production READY
  at Vercel deployment `dpl_Cj5WKi5XMTos2ZFofABFUjTXxxd5`; all six checked
  public routes returned 200. Monday enrichment stays inside the same reserved
  ten-product response; new prune-delete journals retain hashes/IDs, not bodies.
- The protected **expiry-only** publication passed at that source, with the
  separately reviewed recovery library `de2379a3a28b52be57899b657d681cd32dae082b`.
  Worker version `72a30266-66f3-445b-ad7a-8e54e5735ad5`, deployment
  `4f196d60-cdc8-473b-a6b9-32e1e9acbc8c`, manifest SHA-256
  `f6ec33d428baa17e68da60e164b41cbbc4927857ff45729d9c1d473ce2fb2219`.
  Fifteen safe HTML/RSC/feed checks and four native vector absences passed;
  all 3,383 private identities and history counts were preserved. The public
  sample is now **zero ready / ten held**, with 3,373 migration-only identities.
  This is not a fresh opening cohort or full search/load acceptance.
- Real Vectorize processing exceeded the bounded polling window. Resume-only
  recovery confirmed the existing accepted references under the same owner,
  source hashes and full atomic SQL CAS; it cannot dispatch a new mutation.
  All four delete journals are verified with **one attempt each**. The original
  checkpoint is finalized, build resolved and scope idle/released with no
  external pending work. Final ledger: 652 HTTP / 891 SQL, zero unconfirmed;
  zero Amazon/model calls. Original limits and October 21 freshness reservation
  were not reset. Private final receipt `expiry-only-62fc900-final-receipt.json`
  SHA-256 `dc71780fd3bebf0c7d7b5d999a586f4d97054d447c6571ef65a63721d395ceb4`;
  publication receipt `3b95b2032be99af8c5f16bedbac7b1927ac120dd1018c3779ee86802d0cbb18f`;
  body-free proof `f698045dec9719611e56d884fe0df6f4a69ed77de6c65816e23d17acd635958f`.
  Keep `roadmap-lbbz1.4.3` open for the fresh daily canary on October 22;
  parent relevance/capacity, final delta/recovery and launch gates remain open.

### Verified checkpoint — October 20, 13:50 UTC

PRs #189–199 are merged. Source `c82ea01e00373a403877be2968f623c503d9b591`
is independently verified on protected Cloudflare staging and the unchanged
Goose-branded Vercel production site. Staging has all 3,383 archived product
identities and maintained operational history, but only four current
rights-verified public products. Neon remains the production writer.

Storage, vector delivery and the complete protected publication path passed
disposable-provider tests; 553
staging and 88 existing regression tests pass. The 60,000-request local burst
is not proof of Cloudflare Free-plan capacity. No new scheduler, public DNS
cutover, paid plan, provider rebrand or decommissioning is active. Full
hosted-runner handoff, search coverage, final delta/recovery and owner
launch checks remain open; see the sections below and canonical Beads.

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
then rebuild before deployment. The builder refuses dirty source before output
writes and rechecks clean, unchanged HEAD after compilation and before sealing.
This is an observed provenance check, not an OS-level cross-process writer lock.
`verify-release.mts` refuses dirty/mismatched
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

### Optional prospective copy review (offline, bounded)

`prepare-cohort.mts` still holds changed source hashes by default. An explicit
review of at most ten exact selected identities can instead reuse or edit the
existing copy against the original fresh receipt without a new model/provider
call. This is a new factual/copy review, not a claim that the old source was
unchanged, a model approval, an owner `manual_locked` decision, or a rights grant.
The existing source status, quality, model and generation timestamp remain intact.

Both preparation CLIs accept `--review /private/review.json --review-sha256 SHA256`;
`prepare-import.mts` additionally requires `--fresh /private/fresh.json` and the
same canonical `AMAZON_ASSOCIATE_TAG`/optional `AMAZON_MARKETPLACE` as preparation.
The review SHA pins original UTF-8 bytes. Its exact schema is:

```text
{schemaVersion:1, kind:"prospective-copy-review", freshReceiptSha256,
 reviewedAt, reference, entries:[{id, sourceRowSha256, sourceFactsHash,
 originalCopySha256, copy:{punnyTitle:string|null, wittyDescription:string|null,
 editorialWriteup:string}, copySha256, reason,
 imageReview:"unchanged"|"reviewed_fresh_image"}]}
```

`sourceRowSha256` hashes `JSON.stringify` of the original exported row, including
its separately preserved vector representation; receipt/review hashes pin their
original file bytes. Copy hashes use `reviewedCopyHash` (canonical JSON of exactly
the three copy keys); `originalReviewCopy` supplies the original field mapping.
`sourceFactsHash` uses the unchanged `editorialSourceHash` algorithm over current
title, approved fresh image URL and parsed fresh facts. Review must occur strictly
after the observation, no later than preparation, and before the original 24-hour
deadline. An image change requires explicit `reviewed_fresh_image` evidence;
the program does not inspect pixels or authenticate a human reviewer itself.

Original rows, hashes and `source_record_json` are never rewritten. The private
`inputs.json` records the complete review and its pinned SHA. Import independently
reconstructs every prepared input, right and public DTO from original rows,
receipt and review, refusing missing/tampered provenance or field transformations.
Its private `copy-review-provenance.json` preserves the prospective association.
Current editorial validation, eligibility, quality, duplicate, price and rights
gates still apply; review cannot extend the original observation/expiry or prove
fresh historical embedding input. Nothing is published by these offline tools.

Historical naive timestamps may remain explicitly unresolved: import converts
the historical baseline without a display, then installs the validated current
display and fresh explicit verification instants. Historical timestamp provenance
continues to describe the original source; it is not fabricated UTC evidence.

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
  product holds, changed facts and revoked display rights override new
  database-backed reads and publication checks. Previously served static bytes
  and search-cache entries are not retroactively recalled by a database change.
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
- `recovery-native-pg17-5eHz6h/receipt.json`: the metadata-aware repeat also
  restores exact sequence state/ownership and trigger modes from the explicitly
  later `recovery-metadata-WpYBE3` supplement. All original rows/vectors still
  reconcile. Receipt SHA-256:
  `036f047ebcc68c01929f20b305e7e31868b40ed855992fa26ee3f3422319d704`.
  Four read-only source queries captured the supplement; ACL/settings are
  private evidence only, not replayed. No final write barrier is implied.

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

Remaining timestamp/recovery evidence, the complete multi-revision
publishing/vector-outbox loop, 30-query search parity and compliant recurring
expiry publication,
real show curation, burst rehearsal, production analytics checks and the final
owner/provider checklist remain open. Four staging products are not a
launch-ready catalog. Provider cutover and decommissioning are separate gates.
The free Vectorize allowance also cannot hold all 3,383 historical product
vectors (5,196,288 dimensions); do not silently upgrade or discard inventory.

## Opt-in maintenance and expiry preparation

Migration 0009 introduces one shared mutation owner for each isolated D1
database/index. Its empty table is deliberately **disabled**. Enabling it
requires stopping all old/manual writers first; this is not a provider access
control. Enabled legacy import, projection, vector and publication paths refuse
mutations. Ownership is never recovered by guessing that a timed-out provider
operation has stopped. Activation and its independently resolved receipt use
the same owner, not a second unrelated lock.

`pruneExistingRevision` can create an immutable revision from a strict subset
of a previously approved seal, with resumable projection chunks and atomic
source/ownership checks. It never promotes held products, extends rights,
refreshes Amazon data or generates embeddings. `settlePrunedRevision` queues a
build only after an explicitly injected adapter independently confirms settled
index state, exact vector bytes/metadata and removed-ID absence. The owned
adapter is implemented below; protected CI orchestration and schedules remain
inactive. Unchanged, all-held, source-drift, partial-restart and lost-response
cases have executable SQLite tests.

The explicit D1 maintenance store preserves the existing eleven-method runner
contract while separating immutable source archives from private current state.
Product identity/slug, update, vector-outbox payload, operation receipt and owner
epoch are checked in one transaction. Replays preserve the prior UUID and time.
Unknown source/rights/vector provenance remains held; a database write cannot
make an old observation fresh. This does not change the runner's default Neon
backend or its schedule.

The extended actual disposable D1 rehearsal applies migrations 0001–0012.
Fourteen checks cover failed-batch rollback, competing-owner refusal, atomic
product/outbox/receipt, zero-write retry, immutable history, guarded holds,
native vector bytes, owned delivery with a mock provider, shared telemetry
cursor and settled release. It made 133 SQL calls: 4,202 rows read, 440 written,
all confined to the independently deleted scratch database. Current staging
still has only migrations 0001–0008 and no enabled writer. A separate read-only
check validates current-rights SQL on D1; canonical timestamp normalization
avoids D1's long-GLOB limit. Receipts and costs are in the journal.

Migration 0011 adds retained vector-delivery evidence, not another writer lock.
The explicit REST bridge takes an account/index/token; it never loads ambient
credentials. Acceptance is not completion: exact mutation processing and
UUID/native-float32/metadata readback or deletion absence are separate checks.
REST decimal numbers are decoded back to float32 before comparing original
bytes. A lost mutation ID remains owned; no elapsed-time takeover or blind
resend is allowed. Stable-ID rollback needs verified prior-vector restoration,
not just an old Worker deployment.

An actual disposable-index rehearsal passed upsert, exact processed-mutation
identity, byte/metadata readback, delete and confirmed absence: 51 bounded
requests, two writes, independently verified scratch cleanup. The API's
processed marker can precede vector visibility, so visibility remains a
separate check. This proves the single-vector REST contract, not throughput
or full-index settlement; the exact receipt is in the journal.

An expired, settled pruning delivery can explicitly abandon its importing
revision while retaining all evidence. A new cutoff/operation may then prepare
and activate a replacement; abandonment never means reconciled or publishable.
Final vector proof is deliberately capped at **20 UUIDs**. Full-catalog
batched proof remains an activation gate, not a claimed capability.

Migration 0012 and `createD1CatalogTelemetryStore` preserve the five-method
run/item telemetry contract. `runCatalogWithBackend` and
`runWeeklyCatalogWithBackend` inject maintenance/telemetry, independently
verified publication and explicit ownership-aware finalization. They preserve
the existing weekly policy limits and never silently choose D1. Item writes
are bounded, idempotent and retain private retry evidence on failure.
Imported history and completed runs cannot be silently rewritten.

`prepareApprovedCohort` now supplies the separate bounded candidate-promotion
step: a private hash-pinned envelope explicitly names reviewed changes and
their immutable maintenance receipts. Exact row/display hashes, current
facts/rights, original vector payloads, family deduplication and final CAS
checks gate its sealed projection. The same owned-delivery journal handles
vector promotion and excluded-ID deletion. Unchanged candidates keep their
existing deadlines. At most 20 ready-plus-removed IDs can enter the proof;
larger cohorts refuse before publication work. Settlement queues a build;
it does not fabricate a deployed receipt or refresh merchant evidence.

The concrete `scripts/catalog/check-cloudflare-runner.ts` CLI is read-only:
an explicit hash-pinned private config identifies exact account/database/index,
affiliate configuration and an existing Goose-scoped Keychain reference.
It sends only fixed SELECT/metadata-PRAGMA statements, inspects structural
schema/ownership/pending work and writes a protected sanitized receipt.
`--execute` refuses; even all checks passing means execution is unavailable.
The actual staging rehearsal made four requests, 143 reads and zero writes,
correctly reporting missing 0009–0012. It used explicitly injected Wrangler
authentication; Keychain resolution remains separately unverified.

The explicit weekly driver and its private receipt store are described below.
Before selecting D1 for the scheduled job, exercise the protected credential
bootstrap and one bounded complete provider run with independent live publication
proof. The daily strict-subset pruner is not the weekly candidate-promotion
path. Resolve final Neon delta handling before installing immutable-archive
triggers. Retain the existing Neon job until these integrations and recovery
checks are verified.

### Explicit provider boundary

`createCatalogD1Rest` supplies the maintenance store's actual REST transport.
The caller supplies the exact account, database ID/name and token; no ambient
credential or Neon fallback exists. Primary-only identity, atomic batches,
immutable bindings and bounded request/response/row accounting are checked.
Unknown writes are not retried. Default whole-client ceilings are 600 requests
and 1,200 statements. An explicit reviewed run may choose up to 10,000/25,000;
all other limits remain unchanged or tighter, and phases share one client.
These ceilings are safety stops, not guarantees of worst-case weekly capacity
or provider billing. Unknown consumption remains unknown.

Catalog-wide maintenance reads omit native vectors/provenance that only point
mutations need. A rejected read page can shrink from ten rows to five, two,
then one without advancing its cursor; an oversized single row fails. Writes
are never retried through this mechanism.

The optional `createCatalogProviderEvidence` bridge records the existing Amazon
observation and embedding response without making additional provider calls.
Freshness starts before the real merchant request, not at database write time.
Only independently reviewed rights and matching source facts, embedding input
and original float32 bytes can be used. Its receipt-storage callback must
durably save/read-verify private content; a returned hash alone is not proof.
Contradictory or missing requested evidence stops an unsafe upsert and the new
publication, even at equal database timestamps. It does not revoke previously
served bytes instantly or extend their original expiry. Default Neon behavior
remains unchanged; this bridge does not activate the scheduled D1 writer.

### Explicit Cloudflare driver and approved Codex operator

`npm run catalog:cloudflare -- --help` describes the separate
`preflight`, `start`, `resume` and `status` commands. Every invocation requires
an absolute private configuration file, its exact SHA-256 and the same
canonical private workspace root:
`~/.codex/private/goose-gifts-migration/weekly-runs`.
The October 21 owner decision uses one existing Codex task, not new hosted CI
or a Cloudflare Cron. Pre-cutover, `catalog:daily -- --backend neon --no-notify`
refreshes up to ten existing products per Pacific day and discovers new products
on Mondays. A pinned D1 daily configuration uses the same protected driver via
`catalog:daily -- --backend d1`; no implicit backend fallback or writer cutover.
Do not also run the old weekly command or create another workspace to bypass a
reservation or pending run.

The reviewed configuration pins the clean source commit, account, D1
ID/name, Vectorize index, Worker, affiliate tag, private input hashes,
per-kind retention deadlines and Goose-scoped Keychain references. It does
not contain credentials. There is no Vercel, Neon, ambient-token or default
environment fallback. Retention review is an input, not a grant supplied by
the runner; it never extends the merchant observation's original deadline.
`preflight` and `status` do not start provider phases or change ownership.

`start` runs the configured bounded phases with the D1 maintenance and
telemetry adapters, durably records merchant/embedding evidence and stops at
`phases_complete`. Promotion requires a **separately reviewed post-phase**
approval envelope passed to `resume` with its SHA-256. This is a migration
safety boundary, not an activated daily content approval workflow.
Resume drains the exact pending vectors, freezes the approved cohort, verifies
the native vectors, builds/seals the assets, invokes the immutable Worker
version upload, activates it and independently reads back the deployment, protected
release identity and native vectors. Only then can publication and final
telemetry be marked complete. The 20-ID promotion bound still applies; it is
not permission to refresh more than ten existing products that day.

The workspace keeps immutable content-addressed artifacts, checkpoint CAS,
original expiry metadata and an append-only budget journal. D1 requests are
reserved **before** dispatch, including after restart; an uncertain request
never refunds its allowance. These are D1 safety ceilings, not a quote or
aggregate billing cap for every provider. The shared file locks coordinate
only processes using this same canonical root. D1's no-takeover mutation fence
remains authoritative; cross-host CI and out-of-band deployment exclusion
must be established before installing a hosted publisher.

Private original-vector inputs and oversized ordered derived artifacts may use
32 MiB blobs in at most 128 independently verified 256 KiB chunks. The manifest
binds original byte length/hash/order; every chunk retains the same original
observation, rights policy and expiry. Small artifact/checkpoint formats remain
compatible. A reviewed previous snapshot can use the same 32 MiB path, preserving
its original raw-byte hash and expiry. Approval/rights inputs remain 512 KiB;
configuration limits, D1 request/batch limits and the 20-ID public proof limit
are unchanged.

Full private identity capture is paged only under the exact freezing owner,
generation, epoch and phase, with no pending mutations and primary-only reads.
Encoded responses and requests are bounded; the final receipt, build queue and
epoch transition remain one atomic transaction. The unowned reconstruction
path remains a single fail-closed capture. A representative 3,383-identity /
four-ready fixture passes capture, freeze, native promotion, queue and replay
using the actual REST serializer, SQLite transactions and durable accounting.
Its 619 HTTP / 1,229 SQL operations are mock transport measurements, not provider
billing or complete weekly throughput acceptance (`roadmap-lbbz1.4.1`).

Only ready product pages are exported. Known held identities and their finite
HTML/RSC aliases resolve to shared, neutral safe assets: no inherited canonical,
Product schema, retailer CTA or merchant body. Unknown products still return
404. Mixed, all-held and empty exports are tested. The representative
four-ready / 3,379-held package is bounded at 415 files / 14,957,413 bytes,
without raising the 10,000-file or 128 MiB ceilings. This is an asset-size
proof, not Cloudflare CPU/load acceptance (`roadmap-lbbz1.4.2`).

`roadmap-lbbz1.4.3` now uses Codex's existing local persistent private workspace.
This public repository must never contain private catalogs, evidence, credentials
or Actions artifacts. A future hosted operator remains deferred, not a launch
prerequisite. The workspace physically purges expired registered bodies after
journaling tombstones; minimal activation controls and budget reservations
survive. The driver purges on open, and `catalog:purge` also sweeps older runs
before daily maintenance, including interrupted runs without altering their
phase, ownership or unresolved activation. Unsafe or unowned legacy files are reported
for review, never adopted or swept. Exact source build intermediates are removed
after independent package verification so subsequent runs can share the stable
checkout. No new storage subscription, paid plan or second scheduler is needed.

When prior merchant bodies have expired, `publication.prior.directory: null`
uses only the exact prior release/manifest/version identity. It verifies the D1
publication receipt plus actual deployed version and live identity without
copying old content. Supplying a private prior directory is an optional short
asset-overlap mode and retains its original observation/expiry bounds.

Publication configuration may include an explicitly reviewed `semanticSearch`
policy (`enabled`, `dailyRequestCap`, `dailyTokenCap`). Omission preserves the
historical off/50-request/32768-token values without changing old config hashes.
Staging cannot enable semantic search through this publisher. Production
policies are pinned for the run and emitted unchanged; independent version
readback must match all three settings before activation. Changing a reviewed
policy requires a new config/run and must also respect the existing shared
daily-budget state. This does not authorize search enablement or new spending.

Optional `publication.publicAnalytics` has exactly `enabled` (boolean),
`posthogKey` (the existing public `phc_` project key, never a personal API key),
and `posthogHost` (canonical HTTPS ingest origin, no path/query/credentials/port).
Only production may enable it. The checksum-bound values reach build and verify
only; omission preserves historical hashes/default-off, and disabled/staging
builds receive no PostHog values. There is no ambient analytics-env fallback or
new vendor/project; the adapter's fixed GA4/Ads IDs and privacy rules stay intact.
Changing any value during a run requires a new reviewed config/run.

- `phases_running` after interruption: stop for review; never automatically
  repeat paid merchant/model phases.
- `draining`, `freezing`, `publishing`: resume exact persisted work only.
  Unknown vector/upload/activation outcomes are read back, not blindly sent
  again. A partially built or sealed package may require explicit review.
- Expired artifacts: no new build or publication. Minimal control identities
  remain available to reconcile an activation already dispatched; that does
  not renew content rights.
- A stale lock, damaged journal or changed pinned input fails closed. Do not
  delete locks, reset the run or take over ownership by elapsed time.
- `published` is not `finalized`: final telemetry is separately verified.
  `finalized` is terminal and cannot rerun provider phases.

Read the structured `state` and receipt, not just the process exit code:
an expected pause awaiting review is a successful command, not a publication.

The concrete publisher uses separate `wrangler versions upload` and
deployment activation, with staging auth already provisioned on the exact
Worker and a previously verified catalog release. First deployment is an
explicit operator step: build and deploy a protected baseline, independently
verify its active version, package identity and vector state, then record its
publication receipt. Never fabricate a prior receipt or treat an unrelated
inert Worker as a catalog release. The weekly path does not fall back to
`wrangler deploy` when a Worker is missing.

An empty baseline is a genuine zero-product export, not a sentinel product
route. The protected two-fixture live rehearsal passed at `a64d40e` with
exactly one routine upload/activation and verified replay/cleanup; see the
dated receipt in `JOURNAL.md`. That is independent publication evidence, not
an actual merchant weekly run, full-catalog capacity or scheduler migration.

Wrangler may internally retry an immutable upload; duplicate matching
version tags require review. The executor never repeats that command on resume
and the actual activation POST is not retried.
It creates no routes, custom domains, schedules or paid resources,
and leaves semantic search and preview analytics disabled. A successful
local fixture test is not evidence that the live weekly job has migrated.

## Local burst rehearsal

`node --import tsx scripts/staging/local-burst.mts --seconds 600 --output /private/receipt.json`
exercises the actual Worker and feed builders with 60 owned fictional products.
The repeated full run on the intended Node22.23.1 runtime completed 60,000
requests over 600 seconds, a 95/5 static/mock-semantic mix, zero failures or
network calls; static p95 1.245 ms, mock-search p95 16.250 ms.
Exactly 3,000 mock search-store calls occurred, none
from browsing. The retained-asset deadline crossed during the real-clock run.

This is warm in-process Node behavior, **not** HTTP/CDN/Cloudflare CPU, real D1
query cost, provider latency, browser/LCP or distributed capacity evidence.
Do not use it to waive the production burst and paid-plan decision.
