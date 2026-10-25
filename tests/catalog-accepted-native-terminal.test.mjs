import test from 'node:test';
import assert from 'node:assert/strict';
import {permanentCatalogFixture} from './helpers/permanent-catalog-fixture.mjs';
import {preparePermanentCatalog,settlePermanentCatalog} from '../lib/catalog/freeze-permanent-catalog.ts';
import {createPermanentCatalogSeal} from '../scripts/catalog/permanent-catalog-seal.ts';
import {approvedCohortOperationKey} from '../lib/catalog/freeze-approved-cohort.ts';
import {claimMutationOwnership} from '../lib/catalog/mutation-fence.ts';
import {claimBuildRequest,beginBuildActivation,resolveBuildActivation} from '../lib/catalog/build-requests.ts';
import {enqueuePublication,claimPublication,recordPublicationDispatch,completePublication,completeActivatedApprovedCatalogPublication} from '../lib/catalog/publication.ts';
import {prunedVectorPlan,prunedVectorIds} from '../lib/catalog/prune-existing-revision.ts';
import {prepareOwnedApprovedCohortPlan,settleOwnedApprovedCohortVectorProof,readActivatedCatalogVectors,readAcceptedActivatedCatalogNative} from '../scripts/catalog/owned-vector-delivery.ts';
import {createSealedSnapshotEnvelope} from '../scripts/catalog/export-d1-snapshot.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';
import {createWorkerdD1Meter} from './helpers/workerd-d1-meter.mjs';

const hash=value=>sha256(canonicalJson(value));
const network=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Live network forbidden');};
test.after(()=>{globalThis.fetch=network;});

async function fixture(t){
  const f=await permanentCatalogFixture(t,{count:12});
  async function activate(revision,queued,prior,permanent){
    const build=await claimBuildRequest(f.db,queued.requestId,'fixture:'+revision.snapshot.catalogRevision,f.now());
    const intent={releaseId:'release-'+revision.snapshot.catalogRevision,catalogRevision:revision.snapshot.catalogRevision,
      codeSha:revision.request.codeSha,catalogSnapshotSha256:revision.packet.receipt.snapshot_sha256,manifestSha256:'a'.repeat(64),
      vectorSyncWatermark:revision.vectorSyncWatermark,priorReleaseId:prior.releaseId,nextExpiry:null};
    await enqueuePublication(f.db,revision.snapshot,intent,f.now());
    const publication=await claimPublication(f.db,revision.snapshot,intent.releaseId,f.now()),version='fixture:version-'+revision.snapshot.catalogRevision;
    await recordPublicationDispatch(f.db,revision.snapshot,publication,'version:'+version,f.now());
    const permit=await beginBuildActivation(f.db,build,revision.snapshot,publication,version,
      async()=>({environment:f.scope.environment,settled:true,active:{...prior,versionReference:'fixture:prior'}}),f.now(),queued.owner);
    const value=prunedVectorPlan(revision),plan={catalogRevision:value.catalogRevision,planSha256:hash(value),ids:prunedVectorIds(value)};
    const read=()=>readActivatedCatalogVectors(f.db,permit,plan,f.adapters,permanent?{permanent:revision}:{});
    if(permanent)await completePublication(f.db,revision.snapshot,intent.releaseId,publication.token,async()=>{await read();return intent;},f.now,permit.mutationOwner);
    else await completeActivatedApprovedCatalogPublication(f.db,revision,publication,permit,async()=>{await read();return intent;},f.now);
    return{intent,permit,plan,read};
  }
  const prepared=await preparePermanentCatalog(f.db,f.owner,f.request),original=prepared.revision;
  const initial=await activate(original,await settlePermanentCatalog(f.db,prepared.owner,original,f.adapters),f.original.intent,true);
  await resolveBuildActivation(f.db,initial.permit,async()=>{await initial.read();return{environment:f.scope.environment,settled:true,
    active:{...initial.intent,versionReference:initial.permit.versionReference}};});
  const receipt={...f.sql.prepare('SELECT * FROM publication_receipts WHERE release_id=?').get(initial.intent.releaseId)},seal=createPermanentCatalogSeal(original,
    {releaseId:initial.intent.releaseId,receiptSha256:hash(receipt)});
  f.advance(1000);
  const approval={schemaVersion:1,runId:'terminal-proof',catalogRevision:'terminal-proof',changes:[]};
  const request={scope:f.scope,codeSha:'7'.repeat(40),previous:original.snapshot,predecessor:seal,approval,approvalSha256:hash(approval),context:{
    envelopeSha256:sha256(JSON.stringify(createSealedSnapshotEnvelope(original.snapshot))+'\n'),snapshotSha256:original.packet.receipt.snapshot_sha256,
    projectionSha256:original.packet.receipt.projection_sha256,sourceExportSha256:original.sourceDigest,
    vectorSyncWatermark:original.vectorSyncWatermark,
    publicationReceiptWatermark:f.sql.prepare('SELECT max(rowid) n FROM publication_receipts').get().n,
    cutoff:new Date(f.now().getTime()+3600000).toISOString(),priorPublication:seal.publication}};
  const owner=await claimMutationOwnership(f.db,f.scope,{phase:'freezing',ownerReference:'terminal-proof',operationKey:approvedCohortOperationKey(request)});
  const planResult=await prepareOwnedApprovedCohortPlan({db:f.db,owner,request,adapters:f.adapters});
  const queued=await settleOwnedApprovedCohortVectorProof({db:f.db,owner:planResult.owner,revision:planResult.revision,adapters:f.adapters});
  const active=await activate(planResult.revision,queued,initial.intent,false);
  return{...f,...active};
}

test('accepted permanent receipt uses bounded native history without another catalog scan',async t=>{
  const f=await fixture(t),queries=[],before=f.dispatches();f.setMeter(createWorkerdD1Meter(t));const start=f.db.metrics();
  f.inspect(batch=>{queries.push(...batch.map(q=>q.sql));});
  const read=(intent=f.intent,plan=f.plan,adapters=f.adapters,db=f.db)=>readAcceptedActivatedCatalogNative(db,f.permit,plan,adapters,{intent});
  assert.equal((await read()).settled,true);assert.equal(f.dispatches(),before);
  assert.equal(queries.some(q=>/FROM catalog_public_products|FROM products ORDER BY/.test(q)),false);
  const cost=f.db.metrics();t.diagnostic(JSON.stringify({nativeTerminal:{requests:cost.requests-start.requests,
    sql:cost.statements-start.statements,reads:cost.reportedRowsRead-start.reportedRowsRead,nativeDispatches:0}}));
  assert.ok(cost.reportedRowsRead-start.reportedRowsRead<5000);
  await assert.rejects(read({...f.intent,nextExpiry:f.now().toISOString()}),/vector_terminal_receipt_invalid/);
  await assert.rejects(read({...f.intent,manifestSha256:'f'.repeat(64)}),/vector_terminal_receipt_invalid/);
  await assert.rejects(read(f.intent,{...f.plan,ids:Array.from({length:21},(_,n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`)}),/vector_terminal_receipt_invalid/);
  let providerReads=0;const denied={...f.adapters,async readback(){providerReads++;throw Error('must not read');}};
  const proxy=map=>({...f.db,prepare(sql){let statement=f.db.prepare(sql);return{bind(...args){statement=statement.bind(...args);return this;},
    async all(options){return map(sql,await statement.all(options));}};}});
  const broken=proxy((sql,result)=>sql==='SELECT * FROM publication_receipts WHERE release_id=?'?{results:[]}:result);
  await assert.rejects(read(f.intent,f.plan,denied,broken),/vector_terminal_receipt_invalid/);assert.equal(providerReads,0);
  const oversized=proxy((sql,result)=>{
    if(sql==='SELECT * FROM catalog_vector_deliveries WHERE delivery_id=?'&&result.results[0]){
      const row=structuredClone(result.results[0]),request=JSON.parse(row.request_json);
      if(request.kind==='approved-cohort-plan'){
        request.plan.history[0].ids=Array.from({length:21},(_,n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
        request.planSha256=hash(request.plan);row.request_json=canonicalJson(request);
        oversizedPlan.planSha256=request.planSha256;return{...result,results:[row]};
      }
    }return result;
  }),oversizedPlan={...f.plan};
  await assert.rejects(read(f.intent,oversizedPlan,denied,oversized),/vector_terminal_native_bound|vector_plan_receipt_invalid/);assert.equal(providerReads,0);
  const old=[...f.index],native=old[0][0];f.index.delete(native);
  await assert.rejects(read());for(const [key,value]of old)f.index.set(key,value);
  f.setMeter(undefined);
  const policy=f.sql.prepare("SELECT delivery_id,product_json FROM catalog_vector_deliveries WHERE generation=? AND json_extract(request_json,'$.kind')='approved-cohort-plan'")
    .get(f.permit.mutationOwner.generation);
  const triggers=f.sql.prepare("SELECT name,sql FROM sqlite_schema WHERE name IN('catalog_vector_delivery_identity_immutable','catalog_vector_delivery_complete_immutable')").all();
  for(const trigger of triggers)f.sql.exec('DROP TRIGGER '+trigger.name);
  let drifted=false;
  try{await assert.rejects(read(f.intent,f.plan,{...f.adapters,async readback(id,signal){
    if(!drifted){drifted=true;f.sql.prepare('UPDATE catalog_vector_deliveries SET product_json=? WHERE delivery_id=?').run('{}',policy.delivery_id);}
    return f.adapters.readback(id,signal);
  }}));assert.equal(drifted,true);}
  finally{f.sql.prepare('UPDATE catalog_vector_deliveries SET product_json=? WHERE delivery_id=?').run(policy.product_json,policy.delivery_id);
    for(const trigger of triggers)f.sql.exec(trigger.sql);}
  f.advance(2*86400000);f.db=await f.makeNextDayDb({requests:1000,statements:5000,reportedRowsRead:100000});
  assert.equal((await read()).settled,true);
});
