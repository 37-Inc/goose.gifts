# Stupid Gifts — Independent editorial proof review

**Current review status:** the earlier42-visible/34-indexable conclusion below
is historical and is superseded by the final source-bound factual-equivalence
and same-run adoption review at the end of this file. The newly authorized
implementation preserves all42 original indexable articles without changing
their original approval/hash/status or native provenance. This remains offline
implementation/test evidence, not an actual D1 capture, dispatch or publication.

Reviewed offline against `f81e8d04b33433da71e1d552f5c77fffb22694ca` by the
separate `stupid_editorial_proof_review` reviewer. This is not publication,
credential, quota or ownership authority. No provider call, protected-input
mutation or pinned-operator edit was performed.

## Conclusion

The bounded projector/repair approach can preserve all42 original articles as
visible copy, with the eight source-changed products nonindexable. It **cannot**
preserve all42 indexable pages through the unchanged628 publisher while also
preserving original current/editorial hashes and stale status. This is a real
contract contradiction, not a missing reference string or an account limitation.

- `scripts/catalog/export-d1-snapshot.ts:328-344`, especially339-340, rejects an
  indexable permanent DTO unless the current status is `generated_ready` or
  `manual_locked` and current source hash equals original editorial source hash.
- `lib/catalog/d1.ts:100-132`, especially117-128, enforces the same condition in
  the shared SQL predicate used by final publication and listed/keyword reads.
  It additionally verifies current private copy/quality/identity provenance.
- `lib/catalog/snapshot.ts:142-165` computes indexability from current editorial
  approval; `scripts/catalog/maintenance-state.ts:165-178` intentionally retains
  the exact original article without upgrading that approval or vector proof.
- `scripts/catalog/run-cloudflare-weekly.ts:229-232` binds execution to exact
  clean source/config/root. Existing workspace manifests also pin source/config;
  changing a helper alone is not authorized adoption of a different publisher.

Accepting a derived equality report does not make the existing SQL understand a
new proof. Rewriting editorial hash/status to make equality pass would silently
replace the original review binding. Skipping the shared SQL, substituting its
response, mutating current hashes only for publication, or claiming an unchanged
publisher consumed a new proof would weaken/bypass checks and is not acceptable.

## Smallest safe factual-equivalence report

Use a deterministic **report**, not a publisher capability, in this repair:

1. Bind the exact prior approved base/article, original source snapshot/hash,
   actual current source snapshot/hash, same product identity and current row/
   sidecar hashes to the immutable repair proposal and original run.
2. Verify the original and current whole-source hashes independently using the
   existing canonical source hasher. Preserve both hashes verbatim.
3. Compare complete source facts after only the observed `inches`/`pounds` unit
   capitalization normalization within `itemDimensions`. All numeric values,
   units, dimensions, material, color, features, missing facts and other strings
   remain exact. Ignore title/image metadata only in this factual comparison;
   do not erase their genuine original/current whole-source differences.
4. Require unchanged article bytes, original reviewed base, identity, quality,
   actual exact-value grants, curation state and original expiry. No title/photo
   difference alone can authorize a new article, new native proof or future
   supplier observation.
5. Classify any substantive, missing or unsupported fact change as a repair
   rejection, not an invitation to normalize broadly or synthesize new facts.

The report justifies restoring existing visible copy. It does not establish
current indexability, replace a native vector binding, or extend evidence life.

## Required negative coverage

- Changed numeric dimension, units, quantity, material, color or feature;
  deleted/empty/null facts; non-dimensional case changes; wrong product/base.
- Altered original article/hash, different source/image/title snapshot without
  its actual hash, unknown prior approval, lower quality or current curation hold.
- Rewritten proposal, wrong run/config/checkpoint/owner, before-row or sidecar
  drift, reused proof against another product/current hash or expired evidence.
- Old and current source/editorial hashes, private article/history, existing
  native bytes/provenance, grants and observation deadlines remain unchanged.
- Lost acknowledgement/atomic CAS failure cannot become indexability approval,
  a second write, a cleared owner or an uncharged retry.

## Independent checks executed

1. Scrubbed Node22 local test:
   `node --import tsx --test --test-name-pattern='indexable permanent bases require' tests/catalog-public-projections.test.mjs`
   **PASS1/1**, zero skips. Its real local SQLite/shared-predicate assertions
   reject changed copy, quality, source/editorial hashes, identity/status and
   missing grants across keyword/list/count/rollback checks.
2. Separate pure `checkCurrent` fixture: unchanged article plus `indexable:true`
   and preserved stale/hash-mismatched current row is rejected with
   `current_rights_incompatible`; the exact same article with `indexable:false`
   passes. **PASS**. This fixture is synthetic, not production rights evidence.

No full staging/build/live suite was run by this reviewer. Prior interrupted
staging remains interrupted, not passing evidence. The graph was stale relative
to f81; these findings use direct current source rather than stale graph claims.

## Exact remaining owner decision

Approve recovery that restores all42 **visible** articles while eight pages
temporarily remain nonindexable (34 indexable), preserving the original run,
hashes/status/provenance and unchanged publication gates; **or** defer live
publication and separately authorize a source-bound publisher contract change
that consumes a durable factual-equivalence proof in both JS and final SQL,
with explicit source/config adoption and full adversarial/end-to-end tests.

The second choice is additional engineering scope, not a paid plan, supplier
refetch, login or permission-to-use-existing-imagery problem. Neither choice
authorizes live dispatch from this offline review. Evidence expiry remains
`2026-10-25T15:32:15.176Z`; it must never be renewed by this report.

## Independent implementation review — recovery and successor

Reviewed the actual new `scripts/catalog/editorial-recovery.ts` and
`scripts/catalog/editorial-recovery-successor.ts` plus both corresponding test
files, not only the proposal. The initial54-test interim run was followed by a
final scrubbed Node22 run: **61/61 passing, zero skips, zero failures**, including
the offline CLI and oversized-native refusal tests. The five source/test hashes remained unchanged across
that final run. This is local SQLite/REST-fixture evidence, not live capture or
dispatch.

Positive findings:

- Planner binds exactly ten selected rows/receipts and permits eight projection
  repairs only. Original source records, current factual/editorial hashes and
  status, native bytes/provenance, grants and operation history are preserved.
- Atomic batch CAS includes all ten original product/sidecar pairs and source
  operation receipts, then exact eight after-states and the same owner's next
  epoch. No automatic inverse write, owner claim/release or phase replay exists.
- Committed HTTP/checkpoint acknowledgement loss reconciles the exact repair
  receipt and current post-state instead of applying twice. The REST fixture
  keeps the charged unknown, rather than refunding it on successful readback.
- Replacement publication proposal retains all ten original approval entries,
  replacing only repaired row bindings. The original proposal is not rewritten.
- Successor reconciliation requires finalized body-free controls, matching
  actual receipt/resolved build/public identity and exact idle generation/epoch;
  it checks source/config/prior publication, counts and monotonic accounting.
  Unknown readback or foreign/stale state leaves the original pointer intact.
- Private successor files are immutable; complete-tuple pointer CAS/readback
  makes lost local acknowledgement retryable without rewriting success records.
  Old source-body expiry is not extended by finalized body-free reconciliation.

Findings delivered to implementer during review:

1. Initial SQL lacked a database-clock expiry fence, allowing dispatch just
   before expiry to write after it. **Start-of-batch fence now implemented and
   tested.** The final50th statement now also checks expiry before commit;
   a test advances the DB clock after writes/receipt insertion and confirms
   atomic rollback, original epoch and retained unknown charge.
2. Budget validation initially checked five values, not exact field names.
   **Fixed:** exact names plus original minimum-budget floor are now enforced.
3. Capture initially accepted times before owner/operation timestamps or after
   planning time. **Fixed:** explicit lower/upper time checks are now present.
4. Original editorial quality used `Number(value)<0.8`, allowing NaN to bypass
   the comparison. **Fixed:** affirmative0.8–1 range, with unknown-quality test.
5. Repair/capture now bind actual D1 `providerIdentity` to the expected account/
   database; the wrong-database fixture is rejected before capture.
6. Context now includes exact original snapshot bytes; their expected raw SHA
   and validated selected subset are checked, not only a self-labelled hash.

No remaining correctness blocker was found in the reviewed adapter/successor
scope after those fixes. The offline CLI is read-only, authenticates private
context/capture inputs, emits only report hashes/counts and has no live mode or
clock-override flag. The minor raw-byte authentication finding is **fixed**:
the CLI hashes the raw Buffer, decodes UTF8 with fatal validation, and rechecks
file identity, ownership, permissions and link count on the opened descriptor.
Additional negatives reject feature/color/quantity changes and missing
dimensions; the oversized-native fixture refuses before dispatch rather than
raising REST bounds. No new admission rule, source/status/hash promotion,
current indexability proof or capacity claim was added by these fixes.

Final reviewed source hashes:

- Core: `95990d0359053ae211edfa397d67ec51144321e9cdae66da30a8c337ab610503`.
- Successor: `d5985db0efc52ce3d1ec1de3625f087e37069bb41b0a712321572c34a9768659`.
- Offline CLI: `bb9572cdb34ddb99012acbdc514403fdd8539c9009904ccbd1609a79da4f4a0a`.
- Repair tests: `a490ca983ce29c3d64b94e4d2c901bf121f9d19f0992816d348c16c570a98309`.
- Successor tests: `b6db347d7901e3a626c6d048d1d14b50ed6c7fb49c3e077915243232f9f9ece8`.

## Actual remaining live blocker

The original publication-context cutoff is `2026-10-24T17:32:15.176Z` and has
elapsed. The separate supplier/body not-after remains
`2026-10-25T15:32:15.176Z`; that later deadline does **not** extend the earlier
publication/repair window. The adapter correctly refuses the elapsed original
context. No original-config live repair/resume command is now runnable safely.

A fresh **explicitly approved context-adoption/pending-run disposition** is
needed before live recovery, without rewriting original manifest/config,
checkpoint, reservation or charges and without renewing supplier observation
rights. That adoption mechanism is not implemented or implied by this adapter.
There is no operational live CLI or actual production before-state capture;
capture/apply/successor are implemented API adapters tested with real accounted
REST/local SQLite fixtures, and the shipped CLI is offline review only.
The separate42-visible/34-indexable versus new publisher-proof contract decision
also remains. Do not backdate the CLI, fabricate capture files, open/reset an
owner, start another batch or label this offline review a live recovery success.

## Superseding factual-equivalence implementation review

Reviewed the working patch based on `43482e1b8751d9a8e9d3efa6c106e43d68499555`.
The additional publisher-proof/adoption scope was explicitly authorized after
the original review. The unchanged628 operator is still not claimed to consume
this new contract; it remains untouched.

- `lib/catalog/editorial-equivalence.ts:23-68` verifies both original/current
  whole-source hashes using the existing hasher, identical original article,
  identity, original reviewed status/quality/model/prompt/time and current
  private/typed consistency. Numeric scores require finite numbers or JSON
  numeric strings; arrays, booleans, objects, binary/leading-zero strings and
  unknown values cannot gain approval through coercion. Hashes/status require
  actual strings, not string-coercible arrays. Provenance nonempty checks match
  JavaScript trim whitespace, including tabs, NBSP and BOM, in both JS and SQL.
- `lib/catalog/editorial-equivalence.ts:86-130` provides the shared final SQL
  proof. Complete `json_tree` facts are compared in both directions, including
  array order, empty containers and nulls; integer/real JSON numbers share a
  numeric type. Only immediate object-valued `itemDimensions` strings of the
  exact decimal-number-plus-inches/pounds form normalize unit capitalization.
  Title/photo churn does not rewrite their genuine whole-source hashes.
- `lib/catalog/d1.ts:118-135` adds only a second permanent-indexable approval
  lane. The existing current-provenance branch, substantive article checks,
  exact permanent grants, curation holds and native/supplier freshness gates
  remain. `maintenance-state.ts:148-171` preserves an already indexable original
  base only when this proof succeeds. The exporter checks the same proof in
  `export-d1-snapshot.ts:347-357`; conditional owned capture adds original/private
  proof only where needed, without changing complete product-row hashes.
- `editorial-recovery.ts:90-114` restores the exact original indexable base for
  precisely the eight affected rows. The original source/editorial hashes,
  stale statuses, native bytes, observations, grants and history stay unchanged.

This is **not** a claim that bare SQL recomputes SHA256. Original source bytes
come from the validated immutable import (`authored-copy-evidence.ts` source
table validation and recorded-generation approval; `migration.ts` original row
storage; migration0010 source-record update trigger). JS recomputes both source
hashes before sealing the bounded plan; the repair's complete before/after
product-and-sidecar CAS binds that seal to actual commit state. Real SQLite
tests reject late original/native/product/sidecar drift, including unaffected
selected rows, and retain unknown charges on lost ACK. Final SQL rechecks the
actual immutable approval bindings and full current factual structure, rather
than accepting a new writable proof label. This trust boundary is deliberate.

Final independent scrubbed Node22 checks:

- Seven-file equivalence/repair/maintenance/public/snapshot group:
  **108/108 pass**, zero skips/failures.
- Both actual SQLite100-depth tests: **10/10 pass**, covering106 normal generated
  queries and23 expired-original-permit completion queries. The deepest failing
  interim provenance conjunction was rebalanced without dropping predicates.
  The experimental extra score/dimension CTEs were removed. Maximum generated
  SQL is **60,429 bytes** for listed reads and **60,141 bytes** in the expired
  completion group, below100KB. SQL text size is not used as depth evidence.
- Changed seven-file ESLint: **pass**, no warnings/errors.

## Actual saved-input comparison

Read only the exact original archive and the two original saved observation
envelopes supplied by the root; no provider, lock, counter or protected-file
write was performed. Archive `export-2026-10-22-known-writers-held/011.ndjson`
SHA256 is `3d5efe00cbff1e06420da81edffa47616e76a15f2623bcdc095cada7782cfbb9`.
Both envelopes' canonical value hashes match their immutable artifact refs:
`0d330b745d1ae8685084cd63e667d0466736c4804bff58a2441c0e4037f79f14`
and `c1845064b02b715ab7155fcc6b2ffdf41591de44559df11049eb5ddfe600e54a`.

Reconstructing only current title/photo/facts/hash/stale status from that SAME
saved response, the new proof returns **true for all8/8** affected IDs:
`B09HT6ZC7K`, `B07KGJS2F3`, `B01KR3SAIS`, `B07VLBVQBP`, `B00KJJOWZG`,
`B0BGXLMHRV`, `B0DCNB17CD`, `B07B4PP1BB`. Both original and reconstructed current
whole-source hashes independently match for every row; original article/source
bytes remain unchanged. This validates the equality rule against actual saved
inputs, **not** current D1 before-state, actual grants, available capacity or
publication readiness. No synthetic production capture was fabricated.

## Independent adoption/successor cross-review

Reviewed actual `execution-adoption.ts`, `run-workspace.ts` adoption paths,
revised successor bindings and corresponding tests. Independent local suite:
**76/76 pass**, zero skips/failures.

- One append-only event binds original manifest/config/source/checkpoint/owner,
  exact journal head/caps and original context ref. Only execution code/root
  and the bounded publication cutoff change. The original observation time,
  supplier/body not-after, inputs, grants, cadence reservation and accounting
  are retained; no new batch, budget grant or counter reset is introduced.
- The replacement context registers atomically with that event. Lost head ACK
  or an orphan same-upload body is retryable without another adoption. Original
  source/database/Worker locks remain held while adding the effective source
  lock. Body-free post-expiry readback does not reopen content operations.
- Final controls/package/build/receipt bind the new execution code/publication
  config, while the original manifest and whole-run config stay original.
  Successor reconciliation independently requires actual finalized receipt,
  resolved build, public identity, exact idle owner and monotonic ledger before
  immutable success files/full-tuple pointer CAS can advance.
- Important ordering: local adoption must happen before accounted headroom or
  capture reads, because the approval packet pins the exact pre-adoption head.
  The command wrapper follows that order; a changed head must reject, never be
  silently re-anchored. Root fixed the additional finding that `loadJob` must
  recheck the original source checkout's clean exact commit before importing
  its headroom helper on every live path, not only during offline preparation.

No remaining blocker was found within this reviewed proof/adoption scope.
Actual production before-state/capacity/owner checks and any explicitly approved
live adoption/repair/publication remain root/operator work. The expired original
cutoff must not be backdated; the unchanged source/body deadline remains
`2026-10-25T15:32:15.176Z`. No live result is claimed by this review.

## Root integration acceptance (offline)

- Final integrated `npm run test:catalog-ops`: **101 recovery/adoption/proof/CLI
  tests passed**, then **118 existing ops tests passed**, one optional pinned
  local Postgres differential skipped (no image pull).
- Selected composed adopted persistent-catalog regression: **1/1 passed** using
  a genuine22-public/2-held persistent predecessor, real SQLite/accounted REST,
  normal freeze/publication/finalization and new-source successor seal. Original
  config/manifest/source remain unchanged, native upsert/delete count stays zero,
  exactly one supplier phase ran, and no model or supplier phase replay occurred.
  Compilation/upload/provider responses are mocked; this is not a live capacity
  or production build result. The simpler nonpersistent normal-run compatibility
  test also passed separately.
- Both staging/catalog (including catalog `.mts`) and Worker strict typechecks
  pass. Full lint passes with zero errors and25 pre-existing unrelated warnings.
  The earlier interrupted full staging run remains interrupted, not green.
- Actual saved original433 run files/eight care files and cadence SHA match the
  pre-work inventory. Original628 operator stays clean. No live capture, provider
  call, owner change, timer edit or publication was performed.
- Final integration fixed the CLI's double-close and derives its complete
  original workspace/scope/retention/caps/checkpoint/capacity/prior tuple from
  fixed original files before keys. Offline preparation self-validates through
  those same load gates without opening the original workspace. The test-only
  identity-prior mock now normalizes null to undefined exactly like production;
  no expired prior-body rule was relaxed.

Final source SHA256 (not Git commit IDs):

```text
editorial-equivalence.ts b90e19e054f521245e23802b9dae8a781ea17013edb33a5ee1514d1ff8ecd171
execution-adoption.ts 8d0a209bd429330f258654eed0f955c711a5d172ce875ee808b0d55222fa21e3
run-workspace.ts d101400db0176681fd39490c126747301124b0fca4a01328bdda2e857947dadd
editorial-recovery-command.mts 3ca29ab178771ec58d3c0d4c6b4d714a94d95b86557afa3e696898c847127b63
run-cloudflare-weekly.ts ad172d6925370d286e0bd6f9770fdf38d2a2e6accf12f25a7ec6611fb08b7b6d
publish-release.ts d6c665a7ca77efe9d2f98f1c225826598339fababc445bcbca12d3e1f1c893fd
editorial-recovery-successor.ts 79873937843028571df13ab2101484e55f45fa88aa274a4252c8a4b87317de81
```
