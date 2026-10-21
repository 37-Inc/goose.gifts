# Offline D1-write rollback mechanism — October 21, 2026

`roadmap-lbbz1.3.1`: an offline, checksum-bound reconstruction mechanism and
owned native PostgreSQL fixture. **Not a verified production capture, final
writer barrier, real post-cutover recovery, or permission to restart Neon.**
The old archive-only recovery did not reconstruct current maintenance state or
finalized D1 telemetry. `source_record_json` intentionally remains historical.

## Input and packet contract

`scripts/catalog/recovery-delta.ts` accepts the pinned native PostgreSQL archive
and a private UTF-8 JSON frozen-row input. Both independently supplied SHA-256
values must match; directories must be0700, regular files0600, outside Git, and
not symlinks. Outputs use a fresh private directory without overwriting files.
No credentials, database URL, network client, provider capture, or database apply
option exists in its CLI.

The input has:

- `schemaVersion:1`, `scope:application-logical-tables-through-0012`;
- `provenance.kind`: `synthetic-fixture` or `unverified-capture`, a nonempty
  reference and `barrierEvidence:null`;
- `tables`: every logical application table exported by `D1_RECOVERY_TABLES`,
  plus `sqlite_sequence`; each value is its complete frozen row array;
- `inventory`: one entry per named table, with row count and SHA-256 of
  `canonicalJson(rows)`. Missing, duplicate, unexpected or changed inventories
  refuse. Limits are20000rows/table,100000total rows and128MiB input.

The named scope excludes derived FTS/shadow tables and provider internals. This
inventory checks the supplied input, **not whether a provider actually returned
every row**. Real row data is reusable with `unverified-capture`; asserted
`provider-barrier-capture` or non-null barrier evidence refuses. An independent,
complete provider-barrier capture remains missing and must be separately built
and verified before production acceptance. Do not relabel a real capture as a
synthetic fixture to execute it.

The packet contains exact baseline/input hashes, changed full PostgreSQL rows
with their expected original values, full-table post-reconstruction hashes and
the supported next item-sequence value. `d1-sidecar.json` preserves the entire
original frozen input byte-for-byte, including D1-only rights/provenance,
diagnostics, fences, outbox/delivery state, receipts and telemetry controls.
`manifest.json` binds packet and sidecar checksums. Every packet reports
`barrierVerified:false`; preparation is not application or recovery success.

## Supported reconstruction and refusal

- Existing/new products use current maintenance semantics and original native
  float32 payloads, not the immutable historical product JSON. Historical JSON
  must still match the pinned baseline. Unchanged products keep original bytes/
  values; historical counters/category are retained, new counters begin at zero.
  Typed identities, flags, currency, minor amounts, scores and maintenance state
  must agree. Existing identities/slugs/source are immutable.
- Unknown native bytes refuse, rather than silently becoming a missing vector.
  Arrays, JSONB, numeric scales and full PostgreSQL column values are preserved
  semantically; vector bytes remain exact, including negative zero/subnormals.
- Historical wall times remain opaque. NULL normalized times require recorded
  unresolved/source-null provenance. A non-NULL normalized UTC value for a naive
  original requires per-field documented-UTC-writer evidence and equality.
  Changed/new time values require explicit valid UTC instants; no historical
  local-time inference or sub-microsecond rounding is allowed.
- Current run/item values use the **same decoder as the actual D1 telemetry
  store**, merging raw/start/finish JSON with typed overrides. Runs with a new
  telemetry overlay must be finalized; new items retain assigned IDs/sequence.
  For a D1-native run, the PG-only creation field explicitly maps to recorded
  start time; D1 does not contain a separate original creation timestamp.
  Missing fields, typed drift, changed append-only history or duplicate sequence
  values refuse. The original baseline source rows remain separately preserved.
- New append-only editorial events use the actual maintenance writer shape,
  with typed/raw values, operation ledger and timestamp provenance cross-checks.
  Their original operation controls remain in the private sidecar.
- No deletion, identity/slug rename, new slug/search-history row or
  unsupported schema/mapping is silently accepted. Those classes require a
  separately reviewed extension. Hash-only D1 diagnostics are sidecar data, not
  fabricated raw PostgreSQL search queries.

## Native proof boundary

`runNativeRecovery` has a test-only `rollbackFixture` input, with no CLI apply
flag. It recomputes a pinned packet from the sidecar and validated baseline and
accepts **only synthetic-fixture provenance**. It uses the existing pinned cached
ARM64 PG17/pgvector image, local Unix Docker endpoint, a fresh uniquely labeled
container/volume, network none, no host mounts/ports and bounded resources.

The fixture first verifies ordinary native baseline restoration. It stages
changed rows with the existing native binary COPY primitives and tests a late
transaction failure, then successful apply and identical replay. The private
ledger is in the new recovery schema only. Transactional `ALTER SEQUENCE
RESTART` is used instead of nontransactional `setval`. Complete readback hashes
cover all13fixture tables, including untouched history, and the next allocated
item sequence is checked. Cleanup verifies removal of only owned resources.
Receipts contain hashes/counts, not catalog/ACL/configuration contents.

The fixture uses baseline schema shapes from the repository and new run/item
and editorial rows emitted by the actual in-memory D1 telemetry/maintenance stores. It demonstrates the
mechanism, not original source role permissions, production trigger behavior,
current merchant rights, semantic relevance, the final Neon delta, or a safe
old-application restart. The native PG minor-version difference remains explicit.

## Run locally

Use Node22 and the already reviewed/cached pinned image. No pull/upgrade occurs.

```sh
node --experimental-strip-types --test tests/catalog-recovery-delta.test.mjs
CATALOG_RECOVERY_TEST_NATIVE=1 node --experimental-strip-types \
  --test tests/catalog-recovery-delta.test.mjs
node --experimental-strip-types scripts/catalog/recovery-delta.ts --help
```

`CATALOG_RECOVERY_TEST_EVIDENCE_PARENT` may point at the existing protected
private migration directory; `CATALOG_RECOVERY_TEST_KEEP=1` retains fixture
artifacts/receipt, never the disposable Docker resources.

## Recorded evidence

- Final five-change native proof: private
  `sg-delta-fixture-zamlSG/recovery-native-pg17-Os5SQJ/receipt.json`, SHA-256
  `095b1f11dd67a55ab8331c3635d50fabb86b56d77f6980304d11cc8e397895fb`.
  Two products, one finalized run, one item and one editorial event; full13table
  readback, native vector bytes, late-failure data/allocator rollback, identical
  replay and next item sequence5 passed. Recorded implementation hashes match
  the reviewed source. Cleanup and independent label-filtered inventory verify
  no owned containers/volumes remain. An earlier attempt timed out at container
  readiness while a parallel Next build ran; its failure/cleanup receipt is
  retained, not counted as acceptance.
- Offline real-baseline-shaped identity check: source manifest
  `7e0ef540f25ef41f8dca0ffa8c7360f8741790951feb8a95cf8097dd2be2be02`;
  constructed8091runtime import rows reconstruct to zero changes across13PG
  tables. Input SHA-256
  `acdd896e2a041828c4724727f242e6546cb876ff2e5864dcf566d38321602bda`;
  expected-table-summary SHA-256
  `7f86c200c7e0fb3bf346473c976b469e9fce665c17d294437ab3629dea720487`.
  This input was constructed offline from the baseline, not captured from D1.
  No provider calls or source/file writes occurred in this identity check.
- Node22.23.1:31targeted recovery/migration/telemetry tests pass,5explicit optional
  skips; separate native fixture suite3/3 passes. Scoped staging TypeScript and
  full repository ESLint pass. Combined production build remains the root
  integration gate; the leaf has no Production DB credentials and does not
  bootstrap them for prerendering.
