import test from 'node:test';
import assert from 'node:assert/strict';
import {permanentCatalogFixture} from './helpers/permanent-catalog-fixture.mjs';
import {scope,uuid} from './helpers/published-vector-fixture.mjs';
import {preparePermanentCatalog,settlePermanentCatalog} from '../lib/catalog/freeze-permanent-catalog.ts';
import {approvedCohortOperationKey} from '../lib/catalog/freeze-approved-cohort.ts';
import {claimMutationOwnership} from '../lib/catalog/mutation-fence.ts';
import {claimBuildRequest,beginBuildActivation,resolveBuildActivation} from '../lib/catalog/build-requests.ts';
import {enqueuePublication,claimPublication,recordPublicationDispatch,completePublication} from '../lib/catalog/publication.ts';
import {prunedVectorPlan,prunedVectorIds} from '../lib/catalog/prune-existing-revision.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';
import {createPermanentCatalogSeal} from '../scripts/catalog/permanent-catalog-seal.ts';
import {createSealedSnapshotEnvelope} from '../scripts/catalog/export-d1-snapshot.ts';
import {prepareOwnedApprovedCohortPlan,readOwnedApprovedCohortVectors,readOwnedPermanentCohortNative,readActivatedCatalogVectors,
  approvedCatalogPlanChecks} from '../scripts/catalog/owned-vector-delivery.ts';

async function fixture(t){
  const f=await permanentCatalogFixture(t,{afterExpiry:true}),prepared=await preparePermanentCatalog(f.db,f.owner,f.request),initial=prepared.revision;
  const queued=await settlePermanentCatalog(f.db,prepared.owner,initial,f.adapters),build=await claimBuildRequest(f.db,queued.requestId,'native-test',f.now());
  const intent={releaseId:'native-initial',catalogRevision:initial.snapshot.catalogRevision,codeSha:initial.request.codeSha,
    catalogSnapshotSha256:initial.packet.receipt.snapshot_sha256,manifestSha256:'a'.repeat(64),vectorSyncWatermark:initial.vectorSyncWatermark,
    priorReleaseId:f.original.intent.releaseId,nextExpiry:null};
  await enqueuePublication(f.db,initial.snapshot,intent,f.now());const publication=await claimPublication(f.db,initial.snapshot,intent.releaseId,f.now());
  await recordPublicationDispatch(f.db,initial.snapshot,publication,'version:native-initial-version',f.now());
  const permit=await beginBuildActivation(f.db,build,initial.snapshot,publication,'native-initial-version',
    async()=>({environment:scope.environment,settled:true,active:{...f.original.intent,versionReference:f.original.permit.versionReference}}),f.now(),queued.owner);
  const plan=prunedVectorPlan(initial),read=()=>readActivatedCatalogVectors(f.db,permit,{catalogRevision:plan.catalogRevision,
    planSha256:sha256(canonicalJson(plan)),ids:prunedVectorIds(plan)},f.adapters,{permanent:initial});
  await completePublication(f.db,initial.snapshot,intent.releaseId,publication.token,async()=>{await read();return intent;},f.now,permit.mutationOwner);
  await resolveBuildActivation(f.db,permit,async()=>{await read();return{environment:scope.environment,settled:true,active:{...intent,versionReference:'native-initial-version'}};});
  const receipt={...f.sql.prepare('SELECT * FROM publication_receipts WHERE release_id=?').get(intent.releaseId)},predecessor=createPermanentCatalogSeal(initial,
    {releaseId:intent.releaseId,receiptSha256:sha256(canonicalJson(receipt))});
  const approval={schemaVersion:1,runId:'native-current',catalogRevision:'native-current',changes:[]},request={scope,codeSha:'7'.repeat(40),previous:initial.snapshot,
    predecessor,approval,approvalSha256:sha256(canonicalJson(approval)),context:{envelopeSha256:sha256(JSON.stringify(createSealedSnapshotEnvelope(initial.snapshot))+'\n'),
      snapshotSha256:initial.packet.receipt.snapshot_sha256,projectionSha256:initial.packet.receipt.projection_sha256,
      sourceExportSha256:initial.sourceDigest,vectorSyncWatermark:initial.vectorSyncWatermark,
      publicationReceiptWatermark:f.sql.prepare('SELECT max(rowid) n FROM publication_receipts').get().n,
      priorPublication:predecessor.publication,cutoff:new Date(f.now().getTime()+60000).toISOString()}};
  const owner=await claimMutationOwnership(f.db,scope,{phase:'freezing',ownerReference:approval.runId,operationKey:approvedCohortOperationKey(request)});
  const current=await prepareOwnedApprovedCohortPlan({db:f.db,owner,request,adapters:f.adapters});
  assert.ok(current.revision.persistent);assert.ok(current.revision.snapshot.products.every(p=>p.eligibleUntil===null));
  return{...f,...current};
}

test('native-only permanent proof retains exact policy/bits/history after context expiry without repeating full source scans or mutations',async t=>{
  const f=await fixture(t),before=canonicalJson(f.revision),changes=f.sql.prepare('SELECT total_changes() n').get().n,dispatches=f.dispatches();
  await readOwnedApprovedCohortVectors(f.db,f.owner,f.revision,f.adapters);f.advance(60001);
  await assert.rejects(readOwnedApprovedCohortVectors(f.db,f.owner,f.revision,f.adapters));
  const queries=[],db={...f.db,prepare(sql){queries.push(sql);return f.db.prepare(sql);}};
  assert.equal((await readOwnedPermanentCohortNative(db,f.owner,f.revision,f.adapters)).settled,true);
  const capture={prepare(sql){return{bind(){return{sql};}};}},old=approvedCatalogPlanChecks(capture,f.owner,f.revision);
  assert.ok(!queries.includes(old[1].sql),'native proof must not repeat the temporal/full-source plan assertion');
  assert.ok(queries.every(sql=>!sql.includes('CROSS JOIN catalog_public_products')),'native proof must not re-page the public projection');
  assert.equal(canonicalJson(f.revision),before);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes);assert.equal(f.dispatches(),dispatches);
  const bit=f.index.get(uuid(1)).values[0];f.index.get(uuid(1)).values[0]=Object.is(bit,-0)?0:-0;
  await assert.rejects(readOwnedPermanentCohortNative(f.db,f.owner,f.revision,f.adapters));f.index.get(uuid(1)).values[0]=bit;
});

test('native-only reader refuses finite/nonpersistent catalogs, owner drift and an absent genuine policy',async t=>{
  const f=await fixture(t),changed=structuredClone(f.revision);delete changed.persistent;
  await assert.rejects(readOwnedPermanentCohortNative(f.db,f.owner,changed,f.adapters),/vector_plan_invalid/);
  changed.persistent=f.revision.persistent;changed.snapshot.products[0].eligibleUntil=new Date(f.now().getTime()+60000).toISOString();
  await assert.rejects(readOwnedPermanentCohortNative(f.db,f.owner,changed,f.adapters),/vector_plan_invalid/);
  await assert.rejects(readOwnedPermanentCohortNative(f.db,{...f.owner,epoch:f.owner.epoch+1},f.revision,f.adapters));
  await assert.rejects(readOwnedPermanentCohortNative(f.db,f.owner,{...f.revision,sourceDigest:'d'.repeat(64)},f.adapters),/vector_plan_receipt_invalid/);
  const absent={...f.revision,snapshot:{...f.revision.snapshot,catalogRevision:'no-policy'}};
  await assert.rejects(readOwnedPermanentCohortNative(f.db,f.owner,absent,f.adapters),/vector_plan_incomplete/);
});
