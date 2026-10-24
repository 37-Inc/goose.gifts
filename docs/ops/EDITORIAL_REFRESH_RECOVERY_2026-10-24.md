# Stupid Gifts — Editorial refresh correction

Status: **offline capture/repair/successor adapters implemented and independently
reviewed; publication hold remains in place**. The original publication context
expired at `2026-10-24T17:32:15.176Z`. Do not dispatch this original-context run.
Tracked by `roadmap-lbbz1.4.9`, which must remain open until the pending run is
safely resolved. This document does not authorize recovery or publication.

## Reproduction and narrow fix

The old projector removes an approved permanent article when the whole supplier
source hash changes. That hash includes retailer title and image URL as well as
facts. It also changes when dimensional units change capitalization.

Offline comparison used the original `011.ndjson` archive, the accepted
`storefront-da7a1e0c1523` snapshot, and the pending run's two saved Amazon
observation envelopes. No provider request was made. Exact-value **test-only**
grants allowed pure projector evaluation; they are not production rights or
recovery inputs. Reproduction used the real merge/revalidation/projector code,
including the daily cleared-listing preservation policy.

| Product ID | Saved response difference | Old projector | Corrected projector |
| --- | --- | --- | --- |
| B09HT6ZC7K | Title and photo URL; facts identical | Removes article | Exact original retained |
| B00KJJOWZG | Title and dimensional unit casing | Removes article | Exact original retained |
| B07KGJS2F3 | Dimensional unit casing | Removes article | Exact original retained |
| B01KR3SAIS | Dimensional unit casing | Removes article | Exact original retained |
| B07VLBVQBP | Dimensional unit casing | Removes article | Exact original retained |
| B0BGXLMHRV | Dimensional unit casing | Removes article | Exact original retained |
| B0DCNB17CD | Dimensional unit casing | Removes article | Exact original retained |
| B07B4PP1BB | Dimensional unit casing | Removes article | Exact original retained |
| B000L70MQO | No source change | Retains article | Exact original retained |
| B002SQG4TU | Confirmed missing; no replacement facts | Retains article | Exact original retained |

There are **zero substantive fact changes** among the eight affected products.
All ten articles and base presentation fields match the accepted snapshot
exactly. The eight changed-source products remain nonindexable under the
existing current-source-proof rule; the two unchanged products keep their prior
indexability. This is42 visible articles but34 indexable pages, not an assertion
of full SEO parity. Object key order is irrelevant.

`maintenance-state.ts` now compares facts independently of title/photo metadata.
Only the observed `inches`/`pounds` capitalization is normalized; numeric values,
different units, missing facts, other strings and article replacements remain
distinct. Original sealed approval is retained, not regenerated. Existing
curation holds, exact-value permissions and explicit revocations still apply.
Current supplier hashes/status, observation deadlines and native vector proof
are **not** rewritten or upgraded; existing indexability checks are untouched.
Material factual changes still suppress public
article display under the existing policy, while immutable original content
and private history remain preserved.

Regression coverage includes title/photo churn, dimensional casing, repeat and
later refreshes, numeric/unit/material/behavior changes, empty facts, unreviewed
copy, nonindexable bases, curation/rights holds and native/source-byte retention.
This is not a new approval step for ordinary maintenance.

Local checks: the final D1 regression file passes35/35; the broader maintenance/
merge/selection/revalidation group passes59 with one optional local Postgres
differential test skipped because its pinned image was unavailable (no pull).
The snapshot/persistent
display/daily-operator/export/storefront boundary group passes67 with5 explicitly
skipped build-artifact checks. Staging TypeScript and lint pass; full-repository
lint reports25 existing warnings in the unrelated published-vector test, zero
errors, and changed-file lint is clean. The optional full `test:staging` run was
intentionally interrupted during long historical publication-recovery
simulations and is **not** counted as a pass. No full static build, real provider
capacity test or live QA was performed for this offline-only patch.

Protected-file inventories were read back unchanged after testing:433 run files,
eight care files and the original daily reservation. The original628 operator
remains clean. The locally available `origin/main`79d0d1d adds unrelated redirect
and Pinterest documentation/tooling; it does not change the projector, its tests
or the operating runbook. No remote fetch or provider call was made.

## Exact pending-run bindings

- Run/revision: `daily-2026-10-24-628707b5`.
- Original operator: `stupid-catalog-care/goose.gifts`, clean source
  `628707b5746414ea52dc47daecdbfa8bce819220`.
- Config: `f56748cd3c1408cd41190464fd580c97a916cfd5cc7162c27415eeb45c3ae3f1`.
- Original reviewed proposal:
  `7add492a22821a5a2f3c5d5e5c514a84fb8f15680c16a04008b9160351dccca3`.
- Checkpoint: `65164fa2aeecc60a824396af4505f9a885d9b4ce36cef17917408bd9dff17d64`,
  `phases_complete`, WRITING generation17/epoch441. Full ownership capability
  stays in protected storage, not this document.
- Journal head at offline inspection: sequence416,
  `4db02718d9377f3df9455459b3a988489d87a6c838e9adcba9dd5cfb1aa8dab9`.
- Original supplier/checkpoint not-after: `2026-10-25T15:32:15.176Z`. Do not renew it.
- Charged run:199 HTTP /348 SQL /24,112 known reads /225 writes /zero unknowns.
  Preparation separately:3 HTTP /5 SQL /3 reported reads /zero writes/unknowns.
  Retain every original charge and the existing ten-product reservation.
- Serving release last verified by the held run: `storefront-da7a1e0c1523`,
  runtime `da7a1e0c152306d7e18ec510559221265d6fe886`, snapshot
  `765f61c6bc9eaa544f7f4e87a72f2231fba0a59a29c38743aa0bebc9aec0ff88`.
  It was not rechecked against the provider in this offline task.

Protected inputs remain under
`~/.codex/private/goose-gifts-migration/{daily-catalog-care/2026-10-24,weekly-runs}`.
No manifest, proposal, checkpoint, owner, lock or cadence file was changed.

## Initial same-run recovery outline — historical, not dispatch authority

The following outline predates the implemented adapters described below. It
does not override the now-expired original context or authorize live actions.

Merging this code alone cannot fix the saved projection: the eight faulty
`public_display_json`/private `persistentBase` values were already written to D1.
Replaying the old upsert is also wrong: its immutable operation receipt makes it
an idempotent no-op. Do not start another run, fetch again or release ownership.

The least disruptive path is a separately reviewed **eight-row projection
repair**, then the original pinned publisher, not source/config replacement:

1. Develop/test a small recovery adapter using the existing mutation fence,
   immutable operation receipts and budget accounting. Bind its own reviewed
   source/patch separately to the exact original run, config, journal head,
   checkpoint and current WRITING capability. Do not edit the original checkout
   or pretend the new helper is source628. No general source-adoption framework
   or migration/restoration replay is required.
2. After explicit recovery approval, recheck account-wide Free headroom and the
   exact owner/checkpoint/absence of publication control. Read only the ten
   selected current rows, their sidecars, actual saved grants and operation
   receipts. All reads/repair/publication share the original run's charged
   ledger and existing limits. Stop on drift, expiry or insufficient headroom;
   this document is not a new quota grant.
3. Build a new immutable repair proposal from the accepted original bases and
   the same saved observations. Require all ten identities/base fields and all
   ten articles to match the accepted snapshot; authorize changes only to the
   eight faulty projections and their `persistentBase` sidecars. Preserve current
   supplier facts/hashes/status/observations, original source records, actual
   permissions, native bytes/provenance, existing outbox/history and deadlines.
   Never use the reproduction's fixture grants. Other2,349 public gifts and
   all1,024 holds remain unchanged.
4. Apply with exact before-row/sidecar and owner CAS assertions, advancing the
   same owner's epoch normally. Append new, deterministic maintenance operation
   receipts with the repaired row hashes and original run/revision. Retain old
   receipts. Retries reconcile those exact receipts, never apply twice. Append
   a valid checkpoint with the resulting owner; do not rewrite old checkpoints,
   clear a lock, replace the owner or reset any counter. This adapter needs local
   SQLite lost-ack/CAS/retry tests before dispatch.
5. Create a **new** post-repair reviewed proposal at a new immutable path; keep
   `reviewed-proposal.json` and its old digest unchanged. The ordinary daily
   wrapper hardcodes that original path, so do not rerun its `review`/`publish`
   command blindly. The existing `runCloudflareWeekly` resume driver supports
   an explicit alternative approval path/digest. Resume that driver from the
   original clean628 checkout/config, at `phases_complete`, after the usual
   Free-headroom check; provider phases must not execute again. Only operator
   maintenance code changed, so the approved storefront runtime need not be
   replaced with a different design. A direct driver resume does not write the
   daily wrapper's successor pointer: explicitly reconcile the verified final
   seal/success receipt through a reviewed wrapper step, never fabricate it.
6. Verify the actual public release/build/receipt and idle owner,2,359 public
   products/1,024 holds/42 original articles, representative article pages,
   home/search/photos and affiliate URLs. Reconcile `.4.9` and `.4.8`, then lift
   the existing-task hold and update the future clean operator to the approved
   fix. No new scheduler, old Neon writer, Pinterest posting or paid upgrade.

The original-context production workflow is now blocked by its elapsed cutoff.
The capture/repair and successor adapters are implemented below, but fresh
production capture and source/context adoption are not authorized. Do not infer
a runnable original-context live command from this outline. Expiry never
authorizes extending saved evidence or clearing WRITING ownership.

**Unresolved publication choice:** the exporter's `checkCurrent` and final
publication SQL require current editorial/source-hash agreement for indexable
permanent pages. The offline regression explicitly exercises that exporter and
passes with the eight articles visible but nonindexable. Do not bypass those
checks or claim42 indexable pages. Before approving recovery, decide whether to
accept that temporary34-page SEO cohort or separately review/test carrying
original editorial approval across proven factual equivalence throughout the
export/publication contract. This local patch does not implement that broader
proof change or grant permission to re-enrich/fetch another batch.

## Implemented offline adapters and executable checks

`scripts/catalog/editorial-recovery.ts` exports:

- `captureEditorialRepair`: exactly ten current product rows/sidecars and their
  immutable original operation receipts, with exact checkpoint/owner/database
  binding and original accounted budget floor. It performs no write SQL or
  merchant/model call. The caller must supply the original workspace-accounted
  D1 client, not a fresh ledger or ambient connection.
- `prepareEditorialRepair`: pure byte/hash-bound planner. It verifies the raw
  accepted snapshot, exact original proposal, source/current hashes, article,
  actual captured grants and factual equivalence. Its eight patches modify only
  `public_display_json`, `semantic_json.persistentBase` and sidecar version.
  The replacement proposal keeps all ten entries and changes only eight receipt
  bindings. No caller can rehash a forged after-state into a valid plan.
- `applyEditorialRepair`: one **50-statement atomic batch**, within existing
  REST bounds. It checks all ten before-row/sidecar pairs and original receipts,
  exact same WRITING capability/captured time, and database time both before
  updates and at transaction end. It appends a normal immutable operation,
  advances the same owner's epoch once and appends a valid checkpoint. Exact
  committed-ACK/checkpoint-loss retries reconcile receipts/post-state; unknown
  HTTP charges stay unknown. Oversized data is refused, not truncated or given
  higher limits. No automatic inverse write or owner release is implemented.

`scripts/catalog/editorial-recovery-successor.ts` exports the real accounted
D1/public observer, private filesystem store and finalized reconciliation.
It requires exact source/config/prior publication and successor seal, actual
receipt/resolved build/idle scope/public identity, unchanged checkpoint/seal,
monotonic accounting and the original workspace lock. It writes immutable
control/success receipts and a full-tuple CAS of `last-success.json`; lost local
ACKs are retryable. It can reconcile an already-finalized run after supplier
expiry without reading or renewing expired bodies. It cannot finalize this
currently unfinished run or invent provider observations from saved JSON.

Independent review is recorded in
`evidence/2026-10-24-editorial-recovery-proof-review.md`. Findings fixed during
review include start **and terminal** SQL expiry fences, exact budget keys/floor,
capture time bounds, affirmative original-quality validation, actual database
identity, raw snapshot binding and raw-byte/strict-UTF8 input authentication.

Executable offline checks from this clean worktree, with Node22/scrubbed env:

```sh
env -i HOME="$HOME" PATH="/Users/cameronehrlich/.nvm/versions/node/v22.23.1/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" npm run test:catalog-editorial-recovery
env -i HOME="$HOME" PATH="/Users/cameronehrlich/.nvm/versions/node/v22.23.1/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" npm run test:catalog-ops
env -i HOME="$HOME" PATH="/Users/cameronehrlich/.nvm/versions/node/v22.23.1/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" node --import tsx scripts/catalog/editorial-recovery-offline.mts --help
```

The read-only CLI takes `--context FILE --context-sha256 SHA --capture FILE
--capture-sha256 SHA`, authenticates private600 files and emits body-free plan/
proposal hashes. It has **no live mode, credential access, file writes, backdate
override or owner operation**. It refuses an elapsed original cutoff. Its local
FS/SQLite fixtures exercise the real capture, accounted REST repair, failed
receipt transaction rollback, CAS/owner drift, unknown retention, retries,
expiry races, new proposal and successor reconciliation—not production grants.

Latest focused repair/successor/maintenance/accounting/current-display group:
**103 passed, zero skipped, zero interrupted**. Both strict typechecks and
changed-file lint pass. Prior interrupted full staging is still **not passing
evidence**; no production build/live QA/provider-capacity claim is made. No
dependencies changed or online security audit was attempted in this offline
scope.

The integrated `npm run test:catalog-ops` gate also passed:61/61 new recovery
tests, followed by118 existing ops tests passed and one optional pinned local
Postgres17/pgvector differential skipped (no image pull). Independent reviewer
reran61/61 on stable source and recorded exact source hashes. Full lint has
zero errors and25 pre-existing unrelated warnings. Post-test fingerprints of
all433 original run files, eight original care files and the reservation match
the pre-work inventory; the pinned628 checkout remains clean.

## Concrete blockers and exact future approval boundary

1. **Original publication context elapsed.** Actual saved `context.json` has
   cutoff `2026-10-24T17:32:15.176Z`, independent of the later supplier/checkpoint
   not-after `2026-10-25T15:32:15.176Z`. The unchanged normal publisher refuses
   the elapsed context. Do not rerun original `catalog:care publish`/driver
   resume, backdate time, replace config/context/checkpoint or renew evidence.
   A separately reviewed, explicitly approved immutable context-adoption or
   safe pending-run disposition is needed; that additional protocol is **not
   implemented or authorized by this patch**.
2. **Production before-state is missing locally.** The saved original proposal
   contains hashes, not full post-phase rows/sidecars/grants. A real plan needs
   a separately authorized bounded capture of exactly ten current rows and their
   receipts through the original ledger/capability, checked against those hashes.
   The capture API exists and is tested; no such provider call was made. Do not
   substitute synthetic grants or reconstruct guessed production before-state.
3. **Indexability decision remains explicit.** Approve42 visible/34 indexable
   under unchanged publisher checks, or separately scope a durable factual-
   equivalence proof accepted by both JS export and final SQL with reviewed
   source/config adoption. Rewriting original status/hash or injecting around
   old gates is not an acceptable shortcut. No model/supplier grant is needed
   merely to make that choice.

Only after resolving those blockers may a new explicit live approval cover:
same-run bounded capture; independent review of its actual immutable plan;
exact eight-row repair under the retained owner and original charged ledger;
review of a **new** ten-entry proposal; normal same-run publication; actual
receipt/build/idle/public QA; then the implemented successor reconciliation.
It must retain the original ten-product reservation, all immutable inputs and
unknown charges, Free caps/headroom and original supplier deadline. Approval
does not authorize a new batch, metadata rewrite, automatic rollback, owner
release, timer change or Pinterest restart. If evidence has expired by then,
stop and decide disposition separately. There is deliberately no allegedly
runnable live command for a context the code knows is expired.
