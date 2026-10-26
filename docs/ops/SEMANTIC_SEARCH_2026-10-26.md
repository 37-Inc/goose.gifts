# Stupid Gifts — Offline semantic-search preparation

Tracked in `roadmap-lbbz1.4.7` and the retained-run repair
`roadmap-lbbz1.4.13`. This is local preparation, **not authorization to execute**
recovery, install a key, spend, mutate an index or resume catalog care. Cameron
subsequently authorized reviewed code integration and production file deployment;
that does not approve the still-pending key/spending/live-index decision.

## Why search is off

The October26 read-only audit found eight production vectors, all labeled with
the old launch revision, while the accepted catalog contains3,352public gifts.
None match the current revision filter. Production has no embedding secret.
The retained failed daily run also prevents the shared query allocation.
The October20 four-query staging test passed; full-catalog semantic relevance
was never evaluated. Do not describe this as a failed quality experiment.

## What can honestly be reused

The checksum-pinned archive retains3,383native vectors and covers all3,352public
identities. **Dimension1536 does not establish the model or original input.**
Both the current generator and the legacy pre-migration producer explicitly
use `text-embedding-3-small` (`lib/db/operations.ts` and `lib/db/migrate-data.ts`
before commit77a5a53). That supports compatibility, but code history is not a
per-record producer/input attestation for every old vector.

The inspected, still-retained October26 embedding receipt binds seven public
products to `text-embedding-3-small`, exact input/facts hashes and native bytes.
All seven pass the implemented1,024-d projection. Two are also exact matches
for archived native bytes. The saved authenticated D1 provenance audit provides
matching model/input/native attestations for three archived vectors total.
These are different evidence scopes: the remaining archive is not thereby
proven incompatible, nor may it silently be relabeled as v3.

`scripts/catalog/search-vector-projection.ts` verifies the pinned receipt,
product, input, facts, model-specific original dimensions and native hash before
prefix-shortening, L2 normalization and float32 conversion. It supports
v3-small1536 and v3-large3072 as original dimensions; unknown/ada/mislabeled
vectors fail. It never replaces originals, renews a deadline or calls a model.
The large-model cases are synthetic tests, not actual catalog evidence.

OpenAI explicitly documents shortening existing v3 embeddings and normalizing
the result: https://developers.openai.com/api/docs/guides/embeddings

For the whole public catalog,1024dimensions would store3,432,448dimensions;
including the previously observed12,288existing dimensions gives3,444,736,
below Free's5M limit. An illustrative31days×50queries plus the initial upsert
uses5,019,648queried dimensions, below30M. This illustration excludes subsequent
updates and real existing queried usage; it does not establish fresh account-wide
capacity, approve spend or demonstrate retrieval quality.
Current provider limits: https://developers.cloudflare.com/vectorize/platform/pricing/

## Stable derived serving integration — implemented, not enabled

`prepareSemanticCatalog` turns pinned authentic receipts into an offline vector
plan and a hash-only serving artifact. Its fixed profile is v3-small, native1536
to derived1024, prefix/L2/float32, with the retained producer's exact public input
fields plus retained source-query context. Current public title, pun, witty copy
and tags must reproduce that receipt's input. The original native bytes and model
receipt remain unchanged. Raw input/context and vector values are not embedded in
the serving artifact.

Vector IDs bind profile, product/public identity, public-input hash, exact full
input hash and original/derived native hashes. Receipt dates, supplier facts,
catalog revisions, slugs, scores and descriptions are not embedding inputs;
changing those does not rewrite an unchanged vector. Changed actual inputs fail
closed until their own compatible vector proof is prepared.
An optional previous-vector inventory yields only new/changed planned upserts;
unchanged vectors and prior stored history are not rewritten/deleted. That local
planning inventory is not a claim the provider actually contains those entries.

The Worker checks every match against both this artifact and the CURRENT public
snapshot, returning only that snapshot's cleared view. Excluded/removed/inactive
records, wrong IDs, inputs, model, dimensions, transform or metadata cannot gain
access through a broad D1 lookup. Finite supplier overlays do not expire an
independently cleared, input-verified vector. Unknown/invalid derived proofs fall
back to keyword search rather than reopening legacy native serving.

The derived index uses a separate `SEMANTIC_VECTORIZE` binding; original
`VECTORIZE` maintenance/history remain intact. The profile-specific index needs
no redundant metadata-filter setup. Local identity validation replaces the old
daily-revision filter. The normal shared atomic query budget is scoped to this
compiled derived index, never request parameters. Query/product normalization
shares one implementation. No query retries/refunds are added; late embedding
completion after timeout cannot trigger a background vector request.

The optional `semanticSearch.derivedCatalog` publication setting pins an absolute
artifact path, its canonical-JSON SHA256 and its separate index name. The normal
builder embeds it in the already hash-bound asset manifest; normal package and
uploaded-version verification check the artifact/index/bindings. No extra asset,
private publisher, credential or live enablement is introduced. Omission keeps
the historical build/config behavior. Explicit standalone builds use
`CATALOG_SEMANTIC_CATALOG_PATH` and `CATALOG_SEMANTIC_CATALOG_SHA256`.

Actual local current-input preparation found TWO of the seven inspected receipt
products match the accepted cleared presentation and original archived native
bytes. The other five remain public; their new receipt inputs must not silently
replace different cleared inputs. The private `prepared-semantic-report.json`
records this limited evidence. Two vectors are NOT full-catalog search readiness,
and this receipt does not establish the other3,350archive inputs as incompatible.

## Native-preservation correction

The ordinary D1 refresh could queue a delete when supplier changes invalidate
semantic eligibility even though the permanent listing remains cleared.
`maintenance-d1.ts` now preserves that listing's existing native entry under
the already explicit daily permanent-listing policy. It does **not** claim the
old embedding matches changed input or queue an unproven replacement.
Other curation/rights and dispatched-work fences remain in force.

## Proposed same-run recovery — DO NOT EXECUTE YET

Original run: `daily-2026-10-26-1bc3f6c7`, configSHA
`ae9ce817026a578d539b261c48d25ad7cdca9cbd9ac2f45760bc0bf92e87ae2d`,
checkpointSHA `c7f38a8e7ffa289a630b79ea82736902157cbe163cfdd81dd7163dc36698624e`.
Retain the exact original writing owner, generation23/epoch530 and journal.
Original context cutoff and retention deadline are different; neither is renewed.

1. Keep the job PAUSED. Read/validate the original source/config/checkpoint,
   journal, retained inputs and all charges; do not edit the frozen source.
2. Make a separately authorized, bounded fresh capture of the exact owner,
   **entire** pending outbox count/rows, original immutable payloads/native state,
   delivery/build state and account-wide Free headroom. Sequence9 is known from
   the incident; that does not prove it is the only current pending operation.
3. Review the complete capture. `prepareFailedRunRecovery` rejects missing or
   stale captures, unknown/dispatched/leased work, a changed owner/public release,
   a truncated queue inventory or insufficient supplied headroom. It never grants
   execution or resets an allowance.
4. If sequence9 is the **sole** pending item and is still the original unsent
   delete, `prepareUnsentNativeReconciliation` prepares one12-statement CAS batch.
   It binds the original owner, complete queue row, native/provenance bytes,
   immutable payload and same-run source operation. It retains the full queue row
   in an immutable operation receipt, removes only that unsent queue item and
   advances the same owner's epoch once. Products, native bytes, original
   payload/history and AUTOINCREMENT high-water remain intact. No vector deletion,
   provider-success record or ownership release is included.
5. Account that batch only in the original workspace/limits and append reviewed
   recovery authority there. If a response is lost, read the exact operation
   receipt and advanced owner; do not rerun the old batch or provider phases.
   Any additional pending item or attempted/leased operation requires review of
   its own real evidence, not broader cancellation or a forced release.
6. Independently verify native/product/history preservation, no pending delivery,
   build or queue work, and the existing failed/partial telemetry. Then use the
   established fenced release helper on the **actual** next owner. Append an
   owner-null failed/partial recovery checkpoint, retaining the old checkpoints,
   original inputs/deadlines, consumed supplier allowance and every charge/unknown.
   This is failure closure, not successful catalog publication.
7. Keep actual public `web-20261026-1bc3f6c7`, version
   `e60b0c19-5f6e-45cc-a1e4-b9be9c554d67`, deployment
   `97847d14-ed01-4895-82c2-128e1af8552e`, snapshotd6f1c526/manifest9803c8b1.
   Do not roll back to the old catalog receipt or deploy files during recovery.

The original ledger remains204HTTP/324SQL/47,897known reads/173writes/0unknown;
the independent three-statement read-only search audit is a separate receipt.
No helper here claims live recovery acceptance. The CAS is tested only against
the full local SQLite migration schema, including rollback and replay fences.

## Remaining boundary

Retain the full keyword catalog. Resolve the provenance scope before bulk
projection: additional genuine evidence or a separately approved targeted plan,
not guessed model labels or blanket re-embedding. The separate key/evaluation
and ongoing-query decision is pending; do not ask again or infer consent from
the dormant50/day and32,768-token limits. Real natural-language/negative-query
quality, latency/fallback, fresh Free usage, independent review and actual
publication/config/rollback verification remain required before enabling search.
Complete actual compatible coverage and index/bundle capacity are still required;
installing a key alone is not enough. Do not run a blanket re-embedding job.

Private offline evidence is in
`~/.codex/private/goose-gifts-migration/semantic-evaluation-20261026/`.
The reviewed operator/frozen run is not modified by this branch.

## Local verification

`npm run test:staging` completed with1,299passing tests,28skipped and zero
failures (main suite1,291passing; durable suite8passing). The focused projection,
preparation and atomic reconciliation tests also pass independently. Both strict
TypeScript projects and lint pass. Recovery cases use the full SQLite migration
schema with synthetic records; no provider execution or real retrieval-quality
acceptance is implied by these results.

The subsequent end-to-end serving integration passes47focused cases,
independently rerun by a read-only reviewer. Review's late-provider-dispatch
finding was fixed and regression-tested. The full suite, both strict typechecks,
lint, dependency audits, explicit-context build and package/Worker verification
are rerun for the final source. These are local/mocked acceptance, not measured
real semantic relevance or latency.
