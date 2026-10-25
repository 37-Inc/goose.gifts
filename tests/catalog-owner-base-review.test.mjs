import test from 'node:test';
import assert from 'node:assert/strict';
import { permanentCatalogFixture } from './helpers/permanent-catalog-fixture.mjs';
import { scope } from './helpers/published-vector-fixture.mjs';
import { preparePermanentCatalog, settlePermanentCatalog } from '../lib/catalog/freeze-permanent-catalog.ts';
import { createPermanentCatalogSeal, readCatalogPredecessor } from '../scripts/catalog/permanent-catalog-seal.ts';
import { prepareHeldCatalogResolution, captureHeldCatalogResolution, applyHeldCatalogResolution } from '../scripts/catalog/held-catalog-resolution.ts';
import { approvedBaseChangeLimit } from '../lib/catalog/owner-base-review.ts';
import { approvedCohortOperationKey } from '../lib/catalog/freeze-approved-cohort.ts';
import { prepareApprovedCohort } from '../lib/catalog/freeze-approved-cohort.ts';
import { claimMutationOwnership, releaseMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { createSealedSnapshotEnvelope } from '../scripts/catalog/export-d1-snapshot.ts';
import { prepareOwnedApprovedCohortPlan, settleOwnedApprovedCohortVectorProof, readOwnedApprovedCohortVectors, readActivatedCatalogVectors } from '../scripts/catalog/owned-vector-delivery.ts';
import { prunedVectorPlan, prunedVectorIds } from '../lib/catalog/prune-existing-revision.ts';
import { claimBuildRequest, beginBuildActivation, resolveBuildActivation } from '../lib/catalog/build-requests.ts';
import { enqueuePublication, claimPublication, recordPublicationDispatch, completePublication, completeActivatedApprovedCatalogPublication } from '../lib/catalog/publication.ts';
import { approvedRequestControl, hydrateApprovedRequest, approvedRevisionControl, hydrateApprovedRevision, createPublishedApprovedCatalogSeal } from '../scripts/catalog/approved-catalog-seal.ts';
import { storeHeldRevision, restoreHeldRevision } from '../scripts/catalog/held-catalog-command.mts';

const hash = x => sha256(canonicalJson(x));
test('owner base marker is strict and never raises the ordinary daily30 change bound', () => {
  assert.equal(approvedBaseChangeLimit(), 30);
  const review = { schemaVersion: 1, kind: 'owner-base-catalog-review', authorizationSha256: 'a'.repeat(64), resolutionPlanSha256: 'b'.repeat(64) };
  assert.equal(approvedBaseChangeLimit(review), 3383);
  for (const bad of [null, { ...review, approval: true }, { ...review, authorizationSha256: '' }, { ...review, kind: 'daily' }])
    assert.throws(() => approvedBaseChangeLimit(bad), /owner_base_review_invalid/);
});

for (const full of [false, true]) test(`owner base restoration uses normal approved publication with zero native writes (${full ? '996 changes /3383 identities' : '33 changes'})`,
  { skip: full && process.env.CATALOG_FULL_CAPACITY !== '1' }, async t => {
    const f = await permanentCatalogFixture(t, { count: full ? 3383 : 66, ownerHeld: full ? 1022 : 33, ownerDuplicates: full ? 28 : 2 });
    const prepared = await preparePermanentCatalog(f.db, f.owner, f.request), original = prepared.revision;
    async function publish(revision, queued, priorIntent, permanent = false) {
      const build = await claimBuildRequest(f.db, queued.requestId, 'fixture:build-' + revision.snapshot.catalogRevision, f.now());
      const intent = { releaseId: 'release-' + revision.snapshot.catalogRevision, catalogRevision: revision.snapshot.catalogRevision,
        codeSha: revision.request.codeSha, catalogSnapshotSha256: revision.packet.receipt.snapshot_sha256, manifestSha256: 'a'.repeat(64),
        vectorSyncWatermark: revision.vectorSyncWatermark, priorReleaseId: priorIntent.releaseId, nextExpiry: null };
      await enqueuePublication(f.db, revision.snapshot, intent, f.now());
      const pub = await claimPublication(f.db, revision.snapshot, intent.releaseId, f.now());
      const version = 'fixture:version-' + revision.snapshot.catalogRevision;
      await recordPublicationDispatch(f.db, revision.snapshot, pub, 'version:' + version, f.now());
      const permit = await beginBuildActivation(f.db, build, revision.snapshot, pub, version,
        async () => ({ environment: scope.environment, settled: true, active: { ...priorIntent, versionReference: 'fixture:old-version' } }), f.now(), queued.owner);
      const plan = prunedVectorPlan(revision);
      const read = () => readActivatedCatalogVectors(f.db, permit, { catalogRevision: plan.catalogRevision, planSha256: hash(plan), ids: prunedVectorIds(plan) },
        f.adapters, permanent ? { permanent: revision } : {});
      if (!permanent && !full) {
        const row = f.sql.prepare("SELECT delivery_id,request_json FROM catalog_vector_deliveries WHERE generation=? AND json_extract(request_json,'$.kind')='approved-cohort-plan'").get(revision.persistent.generation);
        const triggers = f.sql.prepare("SELECT name,sql FROM sqlite_schema WHERE name IN ('catalog_vector_delivery_identity_immutable','catalog_vector_delivery_complete_immutable')").all();
        for (const trigger of triggers) f.sql.exec('DROP TRIGGER ' + trigger.name);
        try {
          for (const mutate of [p => p.approval.schemaVersion = 2, p => p.approval.runId = 'different-header',
            p => p.approval.extra = 'not-an-allowed-header', p => p.approval.changes = null]) {
            const bad = JSON.parse(row.request_json); mutate(bad);
            f.sql.prepare('UPDATE catalog_vector_deliveries SET request_json=? WHERE delivery_id=?').run(canonicalJson(bad), row.delivery_id);
            await assert.rejects(read(), /vector_plan_receipt_invalid/);
          }
        } finally {
          f.sql.prepare('UPDATE catalog_vector_deliveries SET request_json=? WHERE delivery_id=?').run(row.request_json, row.delivery_id);
          for (const trigger of triggers) f.sql.exec(trigger.sql);
        }
      }
      if (permanent) await completePublication(f.db, revision.snapshot, intent.releaseId, pub.token, async () => { await read(); return intent; }, f.now, permit.mutationOwner);
      else await completeActivatedApprovedCatalogPublication(f.db, revision, pub, permit, async () => { await read(); return intent; }, f.now);
      assert.equal(await resolveBuildActivation(f.db, permit, async () => { await read(); return { environment: scope.environment, settled: true, active: { ...intent, versionReference: version } }; }), 'resolved');
      const receipt = { ...f.sql.prepare('SELECT * FROM publication_receipts WHERE release_id=?').get(intent.releaseId) };
      const publication = { releaseId: intent.releaseId, receiptSha256: hash(receipt) };
      return { intent, seal: permanent ? createPermanentCatalogSeal(revision, publication) : await createPublishedApprovedCatalogSeal(f.db, revision, publication) };
    }
    const initial = await publish(original, await settlePermanentCatalog(f.db, prepared.owner, original, f.adapters), f.original.intent, true);
    const originalMigrationUsage=f.db.metrics();
    // A new owner cleanup is not permission to reuse/raise the exhausted old
    // migration profile. Keep its costs, then exercise the explicit owner-only
    // cleanup profile: bounded9kHTTP/22kSQL/2Mreads/50kwrites for the
    // existing996-row+FTS repair and full projection. Routine30k stays unchanged;
    // all prior migration costs remain reported, not a provider quota reset.
    f.advance(1000);
    f.db=await f.makeNextDayDb({requests:9000,statements:22000,reportedRowsRead:2000000,reportedRowsWritten:50000});
    const beforeNative = canonicalJson([...f.index]), beforeDispatches = f.dispatches(), originalProducts = canonicalJson(original.snapshot.products);
    const writing = await claimMutationOwnership(f.db, scope, { phase: 'writing', ownerReference: 'owner-restoration', operationKey: sha256('owner-restoration') });
    const rows = await captureHeldCatalogResolution(f.db, writing, original.snapshot.heldProducts.map(p => p.id));
    const auth = 'c'.repeat(64), plan = prepareHeldCatalogResolution({ baseline: original.snapshot, rows, owner: writing,
      reference: 'Synthetic owner original dataset approval sha256:' + auth, now: f.now().toISOString() });
    const cursor = { current: writing }, applied = await applyHeldCatalogResolution({ db: f.db, plan, planSha256: hash(plan), ownerCursor: cursor });
    assert.equal(applied.promoted, full ? 996 : 33);
    const ownerBaseReview = { schemaVersion: 1, kind: 'owner-base-catalog-review', authorizationSha256: auth, resolutionPlanSha256: hash(plan) };
    const approval = applied.approval, request = { scope, codeSha: '7'.repeat(40), previous: original.snapshot, predecessor: initial.seal,
      approval, approvalSha256: hash(approval), ownerBaseReview, context: {
        envelopeSha256: sha256(JSON.stringify(createSealedSnapshotEnvelope(original.snapshot)) + '\n'), snapshotSha256: original.packet.receipt.snapshot_sha256,
        projectionSha256: original.packet.receipt.projection_sha256, sourceExportSha256: original.sourceDigest,
        vectorSyncWatermark: original.vectorSyncWatermark, publicationReceiptWatermark: f.sql.prepare('SELECT max(rowid) n FROM publication_receipts').get().n,
        priorPublication: initial.seal.publication, cutoff: new Date(f.now().getTime() + 3600000).toISOString() } };
    assert.throws(() => approvedCohortOperationKey({ ...request, ownerBaseReview: undefined }), /approval_invalid/);
    const wrong = structuredClone(request); wrong.approval.changes[0].publicId = original.snapshot.products[0].publicId; wrong.approvalSha256 = hash(wrong.approval);
    assert.throws(() => approvedCohortOperationKey(wrong), /owner_base_scope/);
    await releaseMutationOwnership(f.db, cursor.current);
    const freezing = await claimMutationOwnership(f.db, scope, { phase: 'freezing', ownerReference: 'owner-restoration', operationKey: approvedCohortOperationKey(request) });
    const control = approvedRequestControl(request);
    assert.deepEqual((await hydrateApprovedRequest(f.db, freezing, control)).ownerBaseReview, ownerBaseReview);
    let result;
    try { const direct = await prepareApprovedCohort(f.db, freezing, request);
      result = await prepareOwnedApprovedCohortPlan({ db: f.db, owner: direct.owner, request, adapters: f.adapters }); }
    catch (error) { t.diagnostic(JSON.stringify({ stage: 'owner-base-freeze-and-policy', ...f.metrics(), budget: f.db.metrics(),
      failure:f.failure(), targetRows:f.sql.prepare('SELECT count(*) n FROM catalog_public_products WHERE catalog_revision=?').get(approval.catalogRevision).n,
      lastSql: f.queryText.slice(-1)[0]?.slice(0,250) })); throw error; }
    assert.deepEqual(result.remainingIds, []); assert.deepEqual(prunedVectorPlan(result.revision).products, []); assert.deepEqual(prunedVectorPlan(result.revision).absentIds, []);
    const revision = result.revision;
    const blobs=new Map(),blobStore={async putBlob(bytes){const key=sha256(Buffer.from(bytes).toString('utf8'));blobs.set(key,Buffer.from(bytes));return{sha256:key,reference:'objects/'+key+'.json'};},
      async readBlob(ref){return blobs.get(ref.sha256);}};
    const frozenRef=await storeHeldRevision(blobStore,revision,f.now().toISOString());
    assert.deepEqual(await restoreHeldRevision(blobStore,frozenRef,original.snapshot),revision);
    await assert.rejects(restoreHeldRevision(blobStore,frozenRef,{...original.snapshot,generatedAt:f.now().toISOString()}),/revision_digest/);
    assert.equal(revision.snapshot.products.length, full ? 3355 : 64); assert.equal(revision.snapshot.heldProducts.length, full ? 28 : 2);
    assert.equal(canonicalJson(revision.snapshot.products.slice(0, original.snapshot.products.length)), originalProducts);
    const revisionControl = approvedRevisionControl(revision);
    assert.deepEqual((await hydrateApprovedRevision(f.db, result.owner, revisionControl)).request.ownerBaseReview, ownerBaseReview);
    await readOwnedApprovedCohortVectors(f.db, result.owner, revision, f.adapters);
    const queued = await settleOwnedApprovedCohortVectorProof({ db: f.db, owner: result.owner, revision, adapters: f.adapters });
    const published = await publish(revision, queued, initial.intent);
    assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase, 'idle');
    assert.equal(canonicalJson([...f.index]), beforeNative); assert.equal(f.dispatches(), beforeDispatches);
    const policy = JSON.parse(f.sql.prepare("SELECT request_json FROM catalog_vector_deliveries WHERE generation=? AND json_extract(request_json,'$.kind')='approved-cohort-plan'").get(revision.persistent.generation).request_json);
    assert.equal(policy.approval.changes.length, 0); assert.equal(policy.ownerBaseApprovalCount, applied.promoted); assert.equal(policy.approvalSha256, hash(approval));
    assert.ok(Buffer.byteLength(JSON.stringify(policy)) < 200000);
    const readOwner = await claimMutationOwnership(f.db, scope, { phase: 'freezing', ownerReference: 'post-owner-read', operationKey: sha256('post-owner-read') });
    const empty = { schemaVersion: 1, runId: 'next-normal', catalogRevision: 'next-normal', changes: [] };
    await readCatalogPredecessor({ db: f.db, owner: readOwner, seal: published.seal, approval: empty, approvalSha256: hash(empty), adapters: f.adapters });
    assert.ok(f.metrics().maxRequest < 512 * 1024); assert.ok(f.metrics().maxResponse < 512 * 1024);
    if (full) t.diagnostic(JSON.stringify({ fixture: 'owner-base-996-no-provider', ...f.metrics(), originalMigrationUsage,ownerCleanupUsage:f.db.metrics(), promoted: applied.promoted,
      public: revision.snapshot.products.length, held: revision.snapshot.heldProducts.length, nativeMutations: f.dispatches() - beforeDispatches }));
  });
