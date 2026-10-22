import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile,readdir } from 'node:fs/promises';
import { setup,scope,uuid } from './helpers/published-vector-fixture.mjs';
import { canonicalJson,sha256 } from '../scripts/catalog/migration.ts';
import { createProjectionPacket,projectionQueries } from '../lib/catalog/d1.ts';
import { permanentSourceRows } from '../lib/catalog/freeze-permanent-catalog.ts';
import { prunedVectorPlan } from '../lib/catalog/prune-existing-revision.ts';
import { readHistoricalNativePreservation } from '../scripts/catalog/owned-vector-delivery.ts';
import { enqueuePublication,claimPublication,recordPublicationDispatch } from '../lib/catalog/publication.ts';
import { enqueueBuildRequest,claimBuildRequest,recoverUnstartedBuildRequest,beginBuildActivation,
  beginReviewedUploadActivation,readReviewedUploadActivation,encodeReviewedUploadActivationApproval,reviewedUploadActivationDeadline } from '../lib/catalog/build-requests.ts';

const hash='a'.repeat(64),version=uuid(990),same=(a,b)=>assert.equal(canonicalJson(a),canonicalJson(b)),marked=async()=>{};
function deadlineGrant(input){
  const priorApproval=structuredClone(input.approval);
  return{...input,priorApproval,approval:{...priorApproval,schemaVersion:2,checkpointSha256:'b'.repeat(64),
    reviewReference:'fixture:explicit-deadline-v2',priorApprovalSha256:sha256(encodeReviewedUploadActivationApproval(priorApproval)),
    activationDeadline:new Date(Date.parse(input.claim.request.cutoff)+90*60000).toISOString()}};
}
async function fixture(t,{wide=false,grantRelease='reviewed-release'}={}){
  const f=await setup(t);let snapshot=f.revision.snapshot,source=f.revision.packet.receipt.source_export_sha256;
  if(wide){
    const extra=Array.from({length:2351},(_,i)=>({id:`B${String(i+100).padStart(9,'0')}`,publicId:uuid(i+100),slug:`own-${i}`,source:'amazon',currency:'USD',
      title:`Own identity ${i}`,description:`Own identity ${i}`,imageUrl:'/images/gift-placeholder.svg',
      affiliateUrl:`https://www.amazon.com/dp/B${String(i+100).padStart(9,'0')}?tag=fixture-20`,price:0,isActive:true,qualityScore:.8,eligibleUntil:null,indexable:false}));
    const insert=f.sql.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,is_active,quality_score,editorial_status,
      catalog_revision,rights_json,source_record_json,updated_at,public_display_json) VALUES(?,?,?,?,?,? ,1,.8,'stale','reviewed-wide',?,'{}',?,?)`);
    for(const p of extra)insert.run(p.id,p.publicId,p.slug,p.source,p.title,p.currency,JSON.stringify(Object.fromEntries(
      ['title','description','imageUrl','affiliateUrl'].map(k=>[k,{basis:'owned',value:p[k],reference:'synthetic exact-value approval'}]))),f.now().toISOString(),JSON.stringify(p));
    snapshot={...snapshot,catalogRevision:'reviewed-wide',products:[...snapshot.products,...extra]};
    const facts=Object.fromEntries(f.sql.prepare('SELECT public_id,source_facts_hash FROM products').all().map(r=>[r.public_id,r.source_facts_hash]));
    const packet=await createProjectionPacket(snapshot,facts,source,f.now());
    f.sql.prepare("INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,'reconciled')")
      .run(snapshot.catalogRevision,snapshot.generatedAt,source);
    for(const q of projectionQueries(packet))f.sql.prepare(q.sql).run(...q.params);
  }
  const request={...f.published.request,sourceRevision:snapshot.catalogRevision,sourceDigest:sha256(`${JSON.stringify(snapshot)}\n`)};
  const queued=await enqueueBuildRequest(f.db,request);let claim;
  for(let n=0;n<3;n++){claim=await claimBuildRequest(f.db,queued.requestId,'reviewed-build',f.now(),1000);assert.ok(claim);f.advance(1001);}
  const grant={schemaVersion:1,requestId:claim.requestId,packageSha256:hash,previousToken:claim.token,checkpointSha256:hash,reviewReference:'fixture:original3plus1'};
  claim=await recoverUnstartedBuildRequest(f.db,claim,f.owner,grantRelease,grant);
  const intent={releaseId:'reviewed-release',catalogRevision:snapshot.catalogRevision,codeSha:request.codeSha,
    catalogSnapshotSha256:request.sourceDigest,manifestSha256:hash,vectorSyncWatermark:wide?0:f.revision.vectorSyncWatermark,
    priorReleaseId:request.priorReleaseId,nextExpiry:snapshot.products[0].eligibleUntil};
  await enqueuePublication(f.db,snapshot,intent,f.now());const publication=await claimPublication(f.db,snapshot,intent.releaseId,f.now(),1000);
  f.advance(16*60000);
  const original={build:{...f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(claim.requestId)},
    publication:{...f.sql.prepare('SELECT * FROM publication_outbox WHERE intent_id=?').get(publication.intentId)}};
  const input={claim,publication,versionReference:version,owner:f.owner,original,approval:{schemaVersion:1,requestId:claim.requestId,
    packageSha256:hash,configSha256:hash,checkpointSha256:hash,reviewPinSha256:hash,evidenceSha256:hash,reviewReference:'fixture:explicit-reviewed-activation'}};
  const inventory=()=>canonicalJson(f.sql.prepare('SELECT * FROM products ORDER BY id').all()),before=inventory(),native=canonicalJson([...f.index]);
  const rows=()=>permanentSourceRows({products:f.sql.prepare('SELECT * FROM products').all(),
    catalog_maintenance_products:f.sql.prepare('SELECT * FROM catalog_maintenance_products').all(),
    catalog_maintenance_operations:f.sql.prepare('SELECT * FROM catalog_maintenance_operations').all()});
  const proof=async signal=>{assert.equal(inventory(),before);await readHistoricalNativePreservation({db:f.db,owner:f.owner,
    native:{source:f.published.source,revisionSha256:sha256(canonicalJson(f.revision)),plan:prunedVectorPlan(f.revision)},current:rows(),adapters:f.adapters,signal});
    return{environment:scope.environment,settled:true,active:{...f.original.intent,versionReference:f.original.permit.versionReference}};};
  const queries=[],batches=[];let beforeBatch,afterBatch;
  const db={...f.db,prepare(sql){const s=f.db.prepare(sql),bind=s.bind,q={sql,params:[]};queries.push(q);
    s.bind=(...params)=>{q.params=params;return bind.apply(s,params);};return s;},async batch(statements,options){
    batches.push(statements.map(s=>s.wire()));beforeBatch?.(statements);const result=await f.db.batch(statements,options);afterBatch?.(statements);return result;}};
  return{...f,db,input,snapshot,proof,queries,batches,inventory,before,native,setBefore(fn){beforeBatch=fn;},setAfter(fn){afterBatch=fn;}};
}

test('reviewed expired exact3+1/claimed tokens activate atomically across2359 listings without renewals or catalog/native writes',async t=>{
  const f=await fixture(t,{wide:true}),original=canonicalJson(f.input);
  await assert.rejects(recordPublicationDispatch(f.db,f.snapshot,f.input.publication,`version:${version}`,f.now()),/fenced/);
  await assert.rejects(beginBuildActivation(f.db,f.input.claim,f.snapshot,f.input.publication,version,f.proof,f.now(),f.owner));
  f.batches.length=0;const normalChanges=f.sql.prepare('SELECT total_changes() n').get().n;
  let marked=false;
  const permit=await beginReviewedUploadActivation(f.db,f.input,f.snapshot,f.proof,async()=>{
    assert.equal(f.batches.length,0);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,normalChanges);marked=true;});
  assert.equal(marked,true);assert.equal(f.batches.length,1);same(await readReviewedUploadActivation(f.db,f.input),permit);
  const build=f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(f.input.claim.requestId),outbox=f.sql.prepare('SELECT * FROM publication_outbox WHERE intent_id=?').get(f.input.publication.intentId);
  same(build,{...f.input.original.build,state:'activating',lease_until:null,release_id:'reviewed-release',version_reference:version});
  same(outbox,{...f.input.original.publication,state:'dispatched',dispatch_reference:`version:${version}`});
  assert.equal(f.inventory(),f.before);assert.equal(canonicalJson([...f.index]),f.native);assert.equal(canonicalJson(f.input),original);
  assert.ok(Object.is(f.index.get(uuid(1)).values[0],-0));assert.equal(f.snapshot.products.length,2359);assert.equal(f.snapshot.heldProducts.length,2);
  for(const batch of f.batches){assert.ok(batch.length<=50);assert.ok(Buffer.byteLength(JSON.stringify({batch}))<512*1024);for(const q of batch)assert.ok(q.params.length<=100);}
  const migrations=new URL('../migrations/d1/',import.meta.url),schema=(await Promise.all((await readdir(migrations)).sort().map(n=>readFile(new URL(n,migrations),'utf8')))).join('\n');
  const py="import sys,json,sqlite3\nv=json.load(sys.stdin)\nc=sqlite3.connect(':memory:',cached_statements=0)\nc.executescript(v['schema'])\nc.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,100)\nfor q in v['queries']:c.execute('EXPLAIN '+q['sql'],q['params']).fetchall()\nprint(len(v['queries']))";
  const count=Number(execFileSync('python3',['-c',py],{input:JSON.stringify({schema,queries:f.queries}),encoding:'utf8',timeout:10000}));
  t.diagnostic(`${count} actual reviewed-activation/read SQL statements compiled at engine depth100`);
  f.advance(24*3600000);same(await readReviewedUploadActivation(f.db,f.input),permit); // Control-only read does not grant another dispatch.
});

test('unknown atomic ACK reads exact permit only; missing grant never dispatches and duplicate write refuses',async t=>{
  const f=await fixture(t);let writes=0;
  f.setAfter(statements=>{if(statements.some(s=>s.query.startsWith('UPDATE publication_outbox'))){writes++;throw new Error('synthetic committed ACK loss');}});
  await assert.rejects(beginReviewedUploadActivation(f.db,f.input,f.snapshot,f.proof,marked),/ACK loss/);
  const before=f.sql.prepare('SELECT total_changes() n').get().n;
  const permit=await readReviewedUploadActivation(f.db,f.input);assert.equal(permit.token,f.input.claim.token);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);assert.equal(writes,1);
  await assert.rejects(beginReviewedUploadActivation(f.db,f.input,f.snapshot,f.proof,marked));assert.equal(writes,1);
  const g=await fixture(t);await assert.rejects(readReviewedUploadActivation(g.db,g.input));assert.equal(g.batches.length,0);
});

test('v2 separately authorizes a bounded later dispatch without rewriting original request, claims or v1 bytes',async t=>{
  const f=await fixture(t),old=canonicalJson(f.input),input=deadlineGrant(f.input),request=f.input.original.build.request_json;
  assert.equal(encodeReviewedUploadActivationApproval(f.input.approval),canonicalJson(f.input.approval));
  assert.equal(await reviewedUploadActivationDeadline(f.input.approval,f.input.claim.request.cutoff),f.input.claim.request.cutoff);
  f.advance(Date.parse(f.input.claim.request.cutoff)-f.now().getTime()+1);
  await assert.rejects(beginReviewedUploadActivation(f.db,f.input,f.snapshot,f.proof,marked));
  const permit=await beginReviewedUploadActivation(f.db,input,f.snapshot,f.proof,marked);
  const build=f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(input.claim.requestId);
  assert.equal(build.request_json,request);assert.equal(build.lease_token,input.claim.token);assert.equal(build.attempts,3);
  assert.equal(build.operator_recovery_json,input.original.build.operator_recovery_json);
  assert.equal(canonicalJson(f.input),old);assert.equal(f.inventory(),f.before);assert.equal(canonicalJson([...f.index]),f.native);
  f.advance(Date.parse(input.approval.activationDeadline)-f.now().getTime()+1);
  same(await readReviewedUploadActivation(f.db,input),permit); // Resolution only; never another dispatch.
});

test('v2 rejects wrong prior approval, widened bindings and deadline; crossing the new deadline rolls back exact rows',async t=>{
  for(const fault of ['prior','package','missing-prior','overlong','not-later','expired','late'])await t.test(fault,async t=>{
    const f=await fixture(t),input=deadlineGrant(f.input),owner={...f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get()};
    if(fault==='prior')input.approval.priorApprovalSha256='0'.repeat(64);
    if(fault==='package')input.approval.packageSha256='0'.repeat(64);
    if(fault==='missing-prior')delete input.priorApproval;
    if(fault==='overlong')input.approval.activationDeadline=new Date(Date.parse(input.claim.request.cutoff)+2*3600000+1).toISOString();
    if(fault==='not-later')input.approval.activationDeadline=input.claim.request.cutoff;
    if(fault==='expired')f.advance(Date.parse(input.approval.activationDeadline)-f.now().getTime());
    let marks=0;
    await assert.rejects(beginReviewedUploadActivation(f.db,input,f.snapshot,f.proof,async()=>{marks++;
      if(fault==='late')f.advance(Date.parse(input.approval.activationDeadline)-f.now().getTime());}));
    assert.equal(marks,fault==='late'?1:0);
    same(f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(input.claim.requestId),input.original.build);
    same(f.sql.prepare('SELECT * FROM publication_outbox WHERE intent_id=?').get(input.publication.intentId),input.original.publication);
    same(f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get(),owner);
  });
});

function currentGrant(input){
  const priorApproval=structuredClone(input.approval),reviewedAt=new Date(Date.parse(input.claim.request.cutoff)+130*60000).toISOString();
  return{...input,priorApproval,approval:{...priorApproval,schemaVersion:3,checkpointSha256:'b'.repeat(64),
    reviewReference:'fixture:fresh-publication-authorization',priorApprovalSha256:sha256(encodeReviewedUploadActivationApproval(priorApproval)),
    reviewedAt,authorizationSha256:sha256('synthetic direct current owner authorization'),
    activationDeadline:new Date(Date.parse(reviewedAt)+40*60000).toISOString()}};
}
test('v3 fresh authorization dispatches after the unchanged v2 maximum and preserves every original byte',async t=>{
  const f=await fixture(t),old=canonicalJson(f.input),input=currentGrant(f.input);
  f.advance(Date.parse(input.approval.reviewedAt)-f.now().getTime());
  const {reviewedAt,authorizationSha256,...oldShape}=input.approval;void reviewedAt;void authorizationSha256;
  await assert.rejects(reviewedUploadActivationDeadline({...oldShape,schemaVersion:2},input.claim.request.cutoff,input.priorApproval));
  const permit=await beginReviewedUploadActivation(f.db,input,f.snapshot,f.proof,marked);
  const build=f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(input.claim.requestId);
  for(const key of ['request_json','lease_token','run_reference','attempts','operator_recovery_json'])assert.equal(build[key],input.original.build[key]);
  assert.equal(canonicalJson(f.input),old);assert.equal(f.inventory(),f.before);assert.equal(canonicalJson([...f.index]),f.native);
  f.advance(Date.parse(input.approval.activationDeadline)-f.now().getTime()+1);same(await readReviewedUploadActivation(f.db,input),permit);
});
test('v3 rejects future review, expiry, wrong prior and wider fresh or hard-day windows without a write',async t=>{
  for(const fault of ['future','expired','prior','overlong','hard-limit','authorization','late'])await t.test(fault,async t=>{
    const f=await fixture(t),input=currentGrant(f.input);f.advance(Date.parse(input.approval.reviewedAt)-f.now().getTime());
    if(fault==='future')input.approval.reviewedAt=new Date(f.now().getTime()+1).toISOString();
    if(fault==='expired')f.advance(Date.parse(input.approval.activationDeadline)-f.now().getTime());
    if(fault==='prior')input.approval.priorApprovalSha256='0'.repeat(64);
    if(fault==='overlong')input.approval.activationDeadline=new Date(Date.parse(input.approval.reviewedAt)+2*3600000+1).toISOString();
    if(fault==='hard-limit'){const day=input.claim.request.cutoff.slice(0,10);input.approval.reviewedAt=`${day}T20:00:00.000Z`;input.approval.activationDeadline=`${day}T21:00:00.001Z`;}
    if(fault==='authorization')input.approval.authorizationSha256='not-a-hash';
    let marks=0;await assert.rejects(beginReviewedUploadActivation(f.db,input,f.snapshot,f.proof,async()=>{marks++;
      if(fault==='late')f.advance(Date.parse(input.approval.activationDeadline)-f.now().getTime());}));
    same(f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(input.claim.requestId),input.original.build);
    same(f.sql.prepare('SELECT * FROM publication_outbox WHERE intent_id=?').get(input.publication.intentId),input.original.publication);
    assert.equal(marks,fault==='late'?1:0);
  });
});

test('proof failures happen before durable marker; late owner/source/prior/row drift rolls back the whole CAS',async t=>{
  for(const fault of ['native','prior','source','token','outbox','cutoff','late-owner','late-source','late-prior','late-cutoff'])await t.test(fault,async t=>{
    const f=await fixture(t);let marks=0;
    const beforeBuild={...f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(f.input.claim.requestId)},beforeOutbox={...f.input.original.publication};
    const beforeOwner={...f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get()};
    const mutate=()=>{
      if(fault==='token')f.sql.prepare('UPDATE catalog_build_requests SET lease_token=? WHERE request_id=?').run(uuid(999),f.input.claim.requestId);
      if(fault==='outbox')f.sql.prepare("UPDATE publication_outbox SET dispatch_reference='foreign' WHERE intent_id=?").run(f.input.publication.intentId);
      if(fault.endsWith('source'))f.sql.prepare('UPDATE products SET is_active=0 WHERE public_id=?').run(uuid(1));
      if(fault.endsWith('prior'))f.sql.prepare('UPDATE publication_receipts SET completed_at=? WHERE release_id=?').run(f.now().toISOString(),f.input.claim.request.priorReleaseId);
      if(fault==='late-owner')f.sql.prepare('UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1').run();
      if(fault==='late-cutoff')f.advance(Date.parse(f.input.claim.request.cutoff)-f.now().getTime());
    };
    if(fault==='native')f.index.get(uuid(1)).values[0]=0;
    if(fault==='cutoff')f.advance(Date.parse(f.input.claim.request.cutoff)-f.now().getTime());
    if(!fault.startsWith('late-'))mutate();
    if(fault==='late-owner')f.sql.exec(`CREATE TRIGGER fixture_reviewed_owner AFTER UPDATE OF state ON publication_outbox WHEN NEW.release_id='reviewed-release'
      BEGIN UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1; END;`);
    const proof=async signal=>{if(fault==='prior')return{environment:scope.environment,settled:true,active:null};return f.proof(signal);};
    await assert.rejects(beginReviewedUploadActivation(f.db,f.input,f.snapshot,proof,async()=>{marks++;if(fault!=='late-owner')mutate();}));
    assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests WHERE request_id=?').get(f.input.claim.requestId).state,'building');
    if(fault.startsWith('late-')){same(f.sql.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').get(f.input.claim.requestId),beforeBuild);
      same(f.sql.prepare('SELECT * FROM publication_outbox WHERE intent_id=?').get(f.input.publication.intentId),beforeOutbox);
      same(f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get(),beforeOwner);assert.equal(marks,1);}
    else assert.equal(marks,0);
  });
});

test('reviewed authority is exact-shaped, original-claim bound, and a timed-out observation never marks or writes',async t=>{
  const f=await fixture(t);
  await assert.rejects(beginReviewedUploadActivation(f.db,f.input,f.snapshot,f.proof),/reviewed_activation_invalid/);
  assert.equal(f.batches.length,0);assert.equal(f.queries.length,0);
  for(const change of [{schemaVersion:2},{extra:true},{evidenceSha256:'not-a-hash'}])assert.throws(()=>encodeReviewedUploadActivationApproval({...f.input.approval,...change}));
  for(const change of [i=>i.approval.requestId=hash,i=>i.approval.packageSha256='b'.repeat(64),i=>i.owner.epoch++,i=>i.original.build.attempts=2,
    i=>i.original.publication.lease_until=f.now().toISOString(),i=>i.publication.token=uuid(999),
    i=>{const r=JSON.parse(i.original.build.operator_recovery_json);r.schemaVersion=2;i.original.build.operator_recovery_json=JSON.stringify(r);},
    i=>{const r=JSON.parse(i.original.build.operator_recovery_json);r.approval.extra=true;i.original.build.operator_recovery_json=JSON.stringify(r);}]){
    const input=structuredClone(f.input);change(input);await assert.rejects(beginReviewedUploadActivation(f.db,input,f.snapshot,f.proof,marked));}
  let signal,marks=0;const timer=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timer(fn,ms===30000?10:ms,...args));
  await assert.rejects(beginReviewedUploadActivation(f.db,f.input,f.snapshot,async value=>{signal=value;return new Promise(()=>{});},async()=>{marks++;}),/observation_failed/);
  assert.equal(signal.aborted,true);assert.equal(marks,0);assert.equal(f.batches.length,0);
  const foreign=await fixture(t,{grantRelease:'foreign-release'});
  await assert.rejects(beginReviewedUploadActivation(foreign.db,foreign.input,foreign.snapshot,foreign.proof,marked),/reviewed_activation_fenced/);
  assert.equal(foreign.queries.length,0);
});
