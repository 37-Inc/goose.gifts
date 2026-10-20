# Historical operational mapping and offline packet

October 20, 2026. Local-only preparation; no provider execution, source writes,
embedding generation, publication or cutover. This approved mapping supersedes
the creation-only NULL exception in the initial timestamp audit. It does **not**
assert that historical naive wall times have been reconstructed as UTC.

## Representation

Migration `0005_historical_timestamps.sql` makes the normalized derivatives
`products.updated_at`, `catalog_editorial_events.created_at` and
`search_history.created_at` nullable. Product creation and verification fields
were already nullable. These are unknown **instants**, not missing source rows.
Exact original timestamp text remains in private `source_record_json` and the
checksum-pinned source archive. Products omit only embeddings from D1 JSON;
the original full source lines and native vector bytes remain in that archive.
Other runtime tables preserve the exact source NDJSON line.

Only those six historical product/event/search columns accept an explicit
`{timezone:'unresolved', evidence:'...'}` decision. Their private
`timestamp_provenance_json` records the source archive and per-field
`source_null`, `unresolved` or `evidenced` state. Evidenced instants distinguish
an explicit source offset from documented UTC writer semantics. Invalid wall
times and discarding an explicit source instant are refused. No global UTC
assumption, inferred local timezone, epoch fallback or now-as-old-time is used.
This provenance describes the archived source interpretation; a later fresh
verification does not retroactively prove the original historical timezone.
Runs/items remain explicitly timezone-aware; nonempty slug history still needs
writer evidence. Raw-only editorial/content/click wall times remain untouched.

The additive migration rebuilds only three tables, preserving all existing
columns, rowids and values and adding `{}` provenance defaults without invented
backfill. It rebuilds operational FTS and retains product parent identities,
slug references, immutable public projections and their sealed receipts.
**Run the complete migration in one atomic migration-runner transaction** with
foreign keys enabled and deferred during the rebuild; never split it into
autocommitted statements or disable foreign keys. Reconcile FK/FTS/projection
integrity before applying data. The populated local tests exercise rollback.

Both mutable and revision-specific D1 READY predicates require a known
verification instant. Newly imported unresolved products have no public copy,
deadline, projection or vector work and remain held. Preserved fresh products
are not rewritten. A later genuinely fresh verified fetch/editorial/rights
decision may promote a product normally; importing history does not do that.
The new product/outbox writer requires explicit UTC update/event times and UTC
for any non-NULL creation/verification timestamps; it never backfills unknowns.
New products require UTC creation; only an existing unresolved creation may
remain NULL during a subsequent update.

## Packet and reconciliation

`scripts/catalog/prepare-operational.ts` validates the pinned full protected
archive and emits deterministic `ImportBatch` files of at most 40 rows/one
megabyte. It reuses the existing run/item conversion and receipt identities.
No source/provider clients are imported. Parent runs precede items; products
precede slug history. Original receipt sequences are retained.

An optional preserved-product subset requires exact target rows, a pinned
independent readback receipt and explicit evidence reference. Each identity and
all original nonvector source fields must match the full snapshot structurally;
whitespace/key order are not source deltas. A genuine field/identity delta,
missing source identity or duplicate refuses preparation for explicit review.
Existing ten-row `{}` provenance defaults are supported with that external
evidence, not an invented backfill. Private preserved target rows and per-row
hashes are included in the protected packet. Every source identity is either
emitted or explicitly preserved. Reconciliation compares every expected target
field plus complete table identity counts; matching import receipts alone do
not prove rows. `importBatch` retries are atomic and verify existing row bytes.

Pinned source manifest:
`6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076`.
Protected packet:
`~/.codex/private/goose-gifts-migration/operational-packet-2026-10-20-first`.
Packet manifest:
`a454e7c1b09b8a8237949a1f47bfae29255346f67bf0bad7cfedf36fe2a4c1b1`.
Packet clock `2026-10-20T07:30:00.000Z` is an explicit deterministic operator
input, **not** an execution/freshness receipt.

| Target | Source identities | Emitted | Preserved |
| --- | ---: | ---: | ---: |
| products | 3,383 | 3,373 | 10 |
| product_slug_history | 0 | 0 | 0 |
| catalog_runs | 17 | 17 | 0 |
| catalog_run_items | 3,750 | 3,750 | 0 |
| catalog_editorial_events | 601 | 601 | 0 |
| search_history | 340 | 340 | 0 |
| Total | 8,091 | 8,081 | 10 |

The ten sample original source field sets match the later complete snapshot;
their separately fresh operational state remains exact. Protected directories
are mode 0700, files 0600, checksummed/read back, outside Git and never replaced.
The full archive validator again checked all 3,492 original vectors, including
archived bundles; the packet regenerates/queues none.

The opt-in test models the existing ten products and 95 history batches before
0005, seeds four local immutable ready projections, then applies/replays the
full packet. It reconciles all 8,091 target identities, retains all ten targets
and projections/receipts, checks FK/FTS/SQLite integrity, and proves the next
item sequence is 3,751 in a rolled-back probe. Expected first pass: 110 new
batches, 95 exact history replays; second pass: 205 exact replays. This is a
**local SQLite proof, not remote D1 execution**. Re-run with Node 22:

```sh
CATALOG_OPERATIONAL_PROOF_BASE="$HOME/.codex/private/goose-gifts-migration" \
CATALOG_OPERATIONAL_PACKET_SHA=a454e7c1b09b8a8237949a1f47bfae29255346f67bf0bad7cfedf36fe2a4c1b1 \
node --experimental-strip-types --test tests/catalog-migration-operational.test.mjs
```

Each run writes a new private `local-verification-<UUID>.json` receipt with
implementation hashes; no receipt is overwritten. The default test suite uses
only synthetic fixtures and skips this full-source opt-in test.
Final reviewed implementation proof:
`local-verification-e35fb05c-78cd-4861-a0ae-ad1f016f4161.json`, SHA-256
`059a7842e95bd27ca17f988a73b37b43ccc2606ce76a5eefdab700bcf10c8c56`.

## Remaining consumer and cutover gates

Do not port the old live runner by coalescing unknown timestamps. A future D1
refresh selector must put unknown verification first with deterministic ID ties;
unknown times must not be treated as epoch/now or age-deactivated. Updated-time
ordering needs an explicit unknown bucket. New products/events/search writes
must record real UTC; existing unresolved creation history stays unresolved.

Future historical reporting must count all rows in lifetime totals and report
unknown-instant coverage separately from date-window counts. Never silently
drop unknown historical searches/events or infer their date from import time.
New hash-only search diagnostics keep their existing UTC/30-day retention
contract. No legacy runner, analytics report or scheduler was modified here.

Root review and actual atomic D1 migration/readback remain required. Final
writer barrier/delta reconciliation, D1 recovery, provider search/index parity,
rights/freshness/public-asset acceptance and cutover are independent gates.
Normalized historical UTC reconstruction remains unproven where explicitly
unresolved; source losslessness and identity reconciliation are separately
testable and do not require fabricating those instants.
