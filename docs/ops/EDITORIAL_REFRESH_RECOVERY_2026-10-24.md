# Stupid Gifts — Same-run editorial recovery

Status: **offline implementation; live recovery is not authorized or complete**.
`roadmap-lbbz1.4.9` remains open. Do not start another batch, change the timer,
release the retained owner, or run the original daily publish command. This
procedure supersedes the visible42/indexable34 proposal in local commits
`f81e8d04`/`43482e1`; their historical evidence is unchanged.

## Cause and correction

The scheduled ten-product provider phase completed, but its saved projection
would remove eight approved articles because retailer title/photo metadata or
dimensional-unit capitalization changed. That proposal was not published.
Original articles remain in private data and the accepted public snapshot.
There were no substantive fact changes in the saved responses.

| Product ID | Saved observation difference |
| --- | --- |
| B09HT6ZC7K | Title/photo URL; identical facts |
| B00KJJOWZG | Title and dimensional-unit casing |
| B07KGJS2F3, B01KR3SAIS, B07VLBVQBP | Dimensional-unit casing only |
| B0BGXLMHRV, B0DCNB17CD, B07B4PP1BB | Dimensional-unit casing only |
| B000L70MQO, B002SQG4TU | Unchanged; latter confirmed missing |

The narrow proof retains all42 original articles/indexable pages without new
copy approval or rewritten current hashes/status. Saved-input comparisons are
not actual D1 before-state or permission evidence: live bounded capture is still
required to prepare the production repair.

## Immutable original bindings

- Run/revision: `daily-2026-10-24-628707b5`.
- Original clean operator: `stupid-catalog-care/goose.gifts`, source
  `628707b5746414ea52dc47daecdbfa8bce819220`.
- Config: `f56748cd3c1408cd41190464fd580c97a916cfd5cc7162c27415eeb45c3ae3f1`.
- Proposal: `7add492a22821a5a2f3c5d5e5c514a84fb8f15680c16a04008b9160351dccca3`.
- Checkpoint: `65164fa2aeecc60a824396af4505f9a885d9b4ce36cef17917408bd9dff17d64`,
  phases_complete, WRITING generation17/epoch441. Capability stays private.
- Journal: sequence416,
  `4db02718d9377f3df9455459b3a988489d87a6c838e9adcba9dd5cfb1aa8dab9`.
- Original publication cutoff: **2026-10-24T17:32:15.176Z**, elapsed.
- Source/checkpoint deadline: **2026-10-25T15:32:15.176Z**, never extend.
- Charged run:199 HTTP/348 SQL/24,112 reads/225 writes/zero unknowns;
  preparation separately3 HTTP/5 SQL/3 reads. Keep the ten-product reservation
  and every prior charge. Existing5000 HTTP/12000 SQL/1.5M reported-read/30k
  reported-write ceilings and shared-account reserves are unchanged.
- Last verified serving release: `storefront-da7a1e0c1523`, runtime
  `da7a1e0c152306d7e18ec510559221265d6fe886`, snapshot
  `765f61c6bc9eaa544f7f4e87a72f2231fba0a59a29c38743aa0bebc9aec0ff88`.
  No fresh provider verification was made during offline engineering.

## Small design, separate authorities

1. **Original article proof.** `editorial-equivalence.ts` checks exact original/
   current identity, article, quality/provenance and complete facts. JS recomputes
   both whole-source hashes. Only inches/pounds casing inside itemDimensions is
   normalized. Numeric/unit/material/color/feature/missing-fact changes fail.
   The exporter and final/public SQL share this narrow original-approval lane.
   Current editorial status/hashes, supplier deadlines and native proof are
   unchanged. SQL uses query-local CTEs, not a new persisted proof table.
2. **One append-only execution adoption.** The existing workspace records one
   event binding the original manifest/config/head/checkpoint/owner to a clean
   reviewed executor and replacement publication cutoff. Only code SHA/source
   root differ in a new config file; old input references remain unchanged.
   Replacement context changes only cutoff, retaining exact original observation
   timestamp and source deadline. This is future publication authority, not a
   renewal of supplier evidence.
3. **Bounded existing repair.** Capture exactly ten current rows/sidecars/receipts,
   validate original proposal hashes and actual grants, then review eight exact
   patches. One50-statement atomic transaction checks all before-state, owner and
   database expiry, restores article/indexable projection and persistent bases,
   appends its operation and advances the same owner's epoch once. Other2,349
   public/1,024 held products, source records, native vectors and original
   editorial/history are untouched. Lost ACK retries reconcile receipts; every
   unknown charge remains retained.
4. **Normal publication, observed successor.** Resume the same run without provider
   phases. Persistent publication journals its technical successor; reconciliation
   independently checks actual D1 receipt, resolved build, idle scope and public
   identity before updating the normal successor pointer. Original full-config
   and canonical publication-config digests are distinct. Exit0/upload is not
   completion.

## Executable proposal, not live permission

Use the clean committed `stupid-editorial-preservation/goose.gifts` checkout.
Prefix every command with:

```sh
env -i HOME="$HOME" PATH="/Users/cameronehrlich/.nvm/versions/node/v22.23.1/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" node --import tsx scripts/catalog/editorial-recovery-command.mts
```

`--help` is read-only. **Offline** `prepare --output NEW_PRIVATE_DIRECTORY --cutoff
ISO` writes a new private packet outside original care/run directories without
opening/locking the original workspace. Cutoff must be later than the old cutoff
and no later than the unchanged source deadline. Returned jobPath/jobSha256/
approvalSha256 identify the exact packet, not approval already granted.

Only after **new explicit live authorization**, use actual immutable values:

```text
adopt     --job JOB --job-sha256 JOB_SHA --approve ADOPTION_SHA
capture   --job JOB --job-sha256 JOB_SHA --approve ADOPTION_SHA
review    --job JOB --job-sha256 JOB_SHA
repair    --job JOB --job-sha256 JOB_SHA --approve ACTUAL_REVIEWED_PLAN_SHA
publish   --job JOB --job-sha256 JOB_SHA --approve ACTUAL_REVIEWED_PROPOSAL_SHA
reconcile --job JOB --job-sha256 JOB_SHA --approve ADOPTION_SHA
```

Adopt before accounted headroom/capture: the packet binds the exact prior journal
head. Never silently reanchor after new reads. Capture/repair/publication use the
original account-wide Free headroom policy and charged ledger. Inspect the actual
eight changes before approving their real plan/proposal digests. These commands
do not fetch a merchant batch or call a model. If capture was interrupted before
its result was saved, any reread stays charged in this same ledger; never guess
the missing production input or treat retries as uncharged.

Publication retries reuse existing control/package/owner/permit. Finalized
body-free reconciliation cannot renew expired supplier evidence. On drift,
capacity failure, unknown mutation or elapsed evidence, stop without resetting
accounting, forcing owner release or creating an automatic rollback. New journal
events require this reviewed operator for status/cleanup of the adopted run,
retaining its ORIGINAL628 repository binding; frozen readers remain retained for
their historical unadopted runs.

## Validation and closeout

Exact latest tests/review and source hashes are in
`evidence/2026-10-24-editorial-recovery-proof-review.md`. Run focused recovery/ops,
both staging/Worker typechecks, lint and selected composed publication tests.
The earlier interrupted full staging is not a pass. No full production build,
online audit, real provider/capacity test or live QA is claimed.

Future completion requires2,359 public/1,024 held identities,42 exact original
articles/indexable pages, actual public source/snapshot/manifest, matching D1
receipt, resolved build, final idle owner and representative home/search/photo/
article/product/affiliate checks. Then reconcile .4.9 and actual costs in .4.8.
Future clean operator/timer handoff is separate; no paid upgrade, new scheduler,
Neon/Vercel writer/deploy or Pinterest restart. If the unchanged source deadline
passes first, report the concrete disposition decision; never extend it.
