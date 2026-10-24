# Stupid Gifts — Independent editorial proof review

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
