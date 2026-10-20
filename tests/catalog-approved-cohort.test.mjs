import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { approvedCohortOperationKey, approvedCohortVectorPlan, prepareApprovedCohort, settleApprovedCohort } from '../lib/catalog/freeze-approved-cohort.ts';
import { claimMutationOwnership, readMutationOwner, releaseMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { createProjectionPacket, projectionQueries, getRevisionProductsByPublicIds } from '../lib/catalog/d1.ts';
import { validateCatalogSnapshot } from '../lib/catalog/snapshot.ts';
import { createSealedSnapshotEnvelope, reconstructD1Snapshot } from '../scripts/catalog/export-d1-snapshot.ts';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { createD1CatalogMaintenanceStore, loadMaintenanceVectorPayload } from '../scripts/catalog/maintenance-d1.ts';
import { maintenanceEmbeddingText } from '../scripts/catalog/maintenance-state.ts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { nativeHash } from '../scripts/catalog/vector-outbox.ts';
import { abandonExpiredPrunedRevision, deliverOwnedOutboxEvent, deliverOwnedApprovedCohortVector, readOwnedApprovedCohortVectors } from '../scripts/catalog/owned-vector-delivery.ts';
import { claimBuildRequest, beginBuildActivation } from '../lib/catalog/build-requests.ts';
import { enqueuePublication, claimPublication, recordPublicationDispatch } from '../lib/catalog/publication.ts';

const AT = Date.parse('2026-10-20T12:00:00.000Z');
const at = ms => new Date(AT+ms).toISOString();
const scope = { environment:'staging',indexName:'test-approved-cohort' };
const id = n => `B${String(n).padStart(9,'0')}`;
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source = 'b'.repeat(64);
const values = Array(1536).fill(Math.fround(.1)); values[0]=-0;
const names = ['Brass lobster desk bell','Velvet mushroom reading lamp','Cosmic pickle kayak anchor','Glass cactus snow globe','Rubber flamingo bath mat'];
function product(n, overrides={}) {
  return { id:id(n),title:names[n-1]||`Fixture object ${n}`,price:19.99,currency:'USD',source:'amazon',
    imageUrl:`https://example.invalid/owned-${n}.jpg`,affiliateUrl:`https://www.amazon.com/dp/${id(n)}?tag=fixture-20`,
    humorTags:[`fixture${n}`],punnyTitle:null,wittyDescription:`Owned synthetic description ${n}.`,sourceQuery:'synthetic',
    sourceFacts:{fixture:n},isActive:true,qualityScore:.85,availabilityStatus:'IN_STOCK',remotelyVerified:true,
    editorialStatus:'generated_ready',editorialQualityScore:.95,editorialWriteup:Array(2).fill(Array(55).fill(`Specific useful owned editorial ${n}`).join(' ')).join('\n\n'),
    embedding:[...values],...overrides };
}
const rights = p => Object.fromEntries(Object.entries({title:p.title,description:p.wittyDescription,imageUrl:p.imageUrl,
  affiliateUrl:p.affiliateUrl,wittyDescription:p.wittyDescription,editorialWriteup:p.editorialWriteup,humorTags:JSON.stringify(p.humorTags)})
  .map(([field,value])=>[field,{basis:'owned',reference:`test-only-owned/${p.id}/${field}`,value}]));
async function setup(t,{initial=2}={}) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');
  for(const name of (await readdir(new URL('../migrations/d1/',import.meta.url))).filter(name=>/^\d{4}.*\.sql$/.test(name)).sort())
    sql.exec(await readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  let clock=AT;let before;let after;let lost;
  sql.function('strftime',(format,instant)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(instant,'now');return new Date(clock).toISOString();});
  const db={prepare(query){let params=[];return{query,bind(...args){assert.ok(args.length<=100);params=args;return this;},
    async all(){const results=sql.prepare(query).all(...params).map(row=>({...row}));
      // Deliberately reverse this unordered candidate query; neither digest nor
      // approved display order may accidentally depend on provider row order.
      return{results:query.startsWith('SELECT p.* FROM json_each(?) ids')?results.reverse():results};},
    async run(){return sql.prepare(query).run(...params);},execute(){before?.(query);return sql.prepare(query).all(...params);}};},
    async batch(statements){sql.exec('BEGIN');try{for(const s of statements)s.execute();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
      after?.(statements);if(lost?.(statements)){lost=null;throw new Error('PRIVATE lost response');}}};
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const index=new Map();let calls=0;let unknown=false;const sent=[];
  const adapters={...scope,providerIdentity:'test:owned-index',async dispatch(input){calls++;sent.push(structuredClone(input));
    if(input.vector)index.set(input.publicId,structuredClone(input.vector));else index.delete(input.publicId);
    if(unknown)throw new Error('PRIVATE unknown provider');return{reference:`test-mutation-${calls}`};},
    async resolve(input){return unknown?{state:'pending'}:{state:'settled',reference:input.reference||`test-mutation-${calls}`};},
    async readback(publicId){return structuredClone(index.get(publicId)||null);}};
  let cursor={current:await claimMutationOwnership(db,scope,{phase:'writing',ownerReference:'seed-run',operationKey:'a'.repeat(64)})};
  let mode={runId:'seed-run',catalogRevision:'prior-revision'};let intentOverride;
  function store() { return createD1CatalogMaintenanceStore({db,owner:cursor.current,ownerCursor:cursor,...mode,
    newPublicId:()=>uuid(Number(sql.prepare('SELECT count(*) n FROM products').get().n)+1),
    intent(_method,args){const p=args[0];if(!p?.id)return{reviewedDeleteReference:'test-only/delete'};
      const hash=args[1];return intentOverride?intentOverride(p,hash):{rightsById:{[p.id]:rights(p)},
        verificationById:{[p.id]:{reference:'test-only/source-observation',observedAt:at(-3600000),sourceFactsHash:hash}},
        ...(p.embedding?{embeddingById:{[p.id]:{reference:'test-only/original-embedding',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:hash}}}:{}),
        reviewedDeleteReference:'test-only/delete'};}}); }
  async function upsert(p){const hash=editorialSourceHash(p);p.editorialSourceHash=hash;
    try{await store().upsertProduct(p,hash);}catch(error){throw new Error(`${p.id}: ${error.message}`,{cause:error});}}
  async function drain(){for(const row of sql.prepare("SELECT sequence FROM vector_sync_outbox WHERE status='pending' ORDER BY sequence").all()){
    const options={db,owner:cursor.current,sequence:row.sequence,catalogRevision:mode.catalogRevision,loadPayload:event=>loadMaintenanceVectorPayload(db,event),adapters};
    const first=await deliverOwnedOutboxEvent(options);cursor.current=first.owner;
    if(first.state==='pending'){const second=await deliverOwnedOutboxEvent({...options,owner:cursor.current});cursor.current=second.owner;assert.equal(second.state,'complete');}
    else assert.equal(first.state,'complete');}}
  for(let n=1;n<=initial;n++)await upsert(product(n));
  await upsert(product(initial+1,{isActive:false,embedding:null}));
  await drain();
  const rows=sql.prepare('SELECT * FROM products ORDER BY public_id').all();
  const previous=validateCatalogSnapshot({schemaVersion:1,dataKind:'catalog',catalogRevision:'prior-revision',generatedAt:at(0),
    products:rows.filter(row=>row.public_display_json).map(row=>JSON.parse(row.public_display_json)),
    heldProducts:rows.filter(row=>!row.public_display_json).map(row=>({id:row.id,publicId:row.public_id,slug:row.slug,path:`/gifts/${row.slug}`,
      title:'Gift currently unavailable',description:'This gift is not currently available in the curated catalog. Browse other gifts instead.',reason:'inactive'})),
    slugHistory:[{slug:'older-lobster',canonicalSlug:rows[0].slug,publicId:rows[0].public_id}]},new Date(AT));
  const packet=await createProjectionPacket(previous,Object.fromEntries(rows.map(row=>[row.public_id,row.source_facts_hash])),source,new Date(AT));
  sql.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)').run(previous.catalogRevision,at(0),source,'published');
  for(const q of projectionQueries(packet))sql.prepare(q.sql).run(...q.params);
  const priorIntent={releaseId:'prior-release',catalogRevision:previous.catalogRevision,codeSha:'c'.repeat(40),catalogSnapshotSha256:packet.receipt.snapshot_sha256,
    manifestSha256:'f'.repeat(64),vectorSyncWatermark:initial,priorReleaseId:null,nextExpiry:previous.products[0].eligibleUntil};
  const prior={release_id:'prior-release',catalog_revision:previous.catalogRevision,code_sha:priorIntent.codeSha,completed_at:at(0),manifest_json:JSON.stringify(priorIntent)};
  sql.prepare('INSERT INTO publication_receipts VALUES(?,?,?,?,?)').run(...Object.values(prior));
  const sealed=createSealedSnapshotEnvelope(previous);
  const context={envelopeSha256:sha256(`${JSON.stringify(sealed)}\n`),snapshotSha256:packet.receipt.snapshot_sha256,projectionSha256:packet.receipt.projection_sha256,
    sourceExportSha256:source,vectorSyncWatermark:initial,publicationReceiptWatermark:1,cutoff:at(6*3600000),
    priorPublication:{releaseId:prior.release_id,receiptSha256:sha256(canonicalJson(prior))}};
  const originals=new Map(previous.products.map(p=>{const row=rows.find(row=>row.public_id===p.publicId);const original={publicId:p.publicId,
    catalogRevision:previous.catalogRevision,sourceFactsHash:row.source_facts_hash,embeddingTextHash:row.embedding_text_hash,
    values:[...values],vectorBytesSha256:nativeHash(values)};
    return[p.publicId,{sha256:sha256(canonicalJson(original)),async load(){return original;}}];}));
  await releaseMutationOwnership(db,cursor.current);
  clock+=1000; // A later real weekly observation/write, not the seed transaction's clock.
  cursor={current:await claimMutationOwnership(db,scope,{phase:'writing',ownerReference:'weekly-run',operationKey:'d'.repeat(64)})};
  mode={runId:'weekly-run',catalogRevision:'approved-revision'};
  const f={sql,db,adapters,index,sent,previous,packet,context,priorIntent,originals,upsert,drain,
    owner:()=>cursor.current,now:()=>new Date(clock),advance(ms){clock+=ms;},calls:()=>calls,setIntent(fn){intentOverride=fn;},
    before(fn){before=fn;},after(fn){after=fn;},lose(fn){lost=fn;},uncertain(value){unknown=value;},
    async freeze(ids=[]){
      const changes=ids.map(publicId=>{
        const row={...sql.prepare('SELECT * FROM products WHERE public_id=?').get(publicId)};
        const operation=sql.prepare(`SELECT * FROM catalog_maintenance_operations WHERE run_id='weekly-run' AND EXISTS(
          SELECT 1 FROM json_each(changes_json) c WHERE json_extract(c.value,'$.productId')=?) ORDER BY next_epoch DESC LIMIT 1`).get(row.id);
        return{publicId,operationId:operation.operation_id,inputSha256:operation.input_sha256,productSha256:sha256(canonicalJson(row)),
          displaySha256:sha256(row.public_display_json??'null')};});
      const approval={schemaVersion:1,...mode,changes};const request={previous,context,scope,codeSha:'e'.repeat(40),approval,approvalSha256:sha256(canonicalJson(approval))};
      await releaseMutationOwnership(db,cursor.current);
      const owner=await claimMutationOwnership(db,scope,{phase:'freezing',ownerReference:'approved-build',operationKey:approvedCohortOperationKey(request)});
      return{owner,request};
    },
    async promote(prepared){let owner=prepared.owner;const revision=prepared.revision;const plan=approvedCohortVectorPlan(revision);
      for(const publicId of [...plan.products.map(p=>p.publicId),...plan.absentIds]){
        const changed=revision.request.approval.changes.some(p=>p.publicId===publicId);
        const options={db,owner,revision,publicId,adapters,...(!changed&&plan.products.some(p=>p.publicId===publicId)?{original:originals.get(publicId)}:{})};
        const first=await deliverOwnedApprovedCohortVector(options);owner=first.owner;
        if(first.state==='pending'){const next=await deliverOwnedApprovedCohortVector({...options,owner});assert.equal(next.state,'complete');owner=next.owner;}
        else assert.equal(first.state,'complete');
      }return owner;
    }};return f;
}
test('actual maintenance → drain → approved addition/update → exact originals → proof → build/activation permission',async t=>{
  const f=await setup(t);const old=f.previous.products[1];
  await f.upsert(product(1,{title:'Bronze lobster desktop bell',sourceFacts:{fixture:1,material:'bronze'}}));
  await f.upsert(product(4));await f.drain();
  const {owner,request}=await f.freeze([uuid(1),uuid(4)]);
  const before=f.sql.prepare('SELECT * FROM products').all();const prepared=await prepareApprovedCohort(f.db,owner,request);
  assert.equal(prepared.state,'prepared');assert.equal(prepared.revision.snapshot.catalogRevision,'approved-revision');
  assert.deepEqual(prepared.revision.snapshot.products.map(p=>p.publicId),[uuid(1),uuid(2),uuid(4)]);
  assert.deepEqual(prepared.revision.sourceRows.map(row=>row.public_id),[uuid(1),uuid(2),uuid(3),uuid(4)]);
  assert.deepEqual(prepared.revision.snapshot.products[1],old);assert.deepEqual(prepared.revision.snapshot.slugHistory,f.previous.slugHistory);
  assert.ok(prepared.revision.snapshot.heldProducts.some(p=>p.publicId===uuid(3)));
  assert.deepEqual(f.sql.prepare('SELECT * FROM products').all(),before);
  assert.equal(prepared.revision.vectorSyncWatermark,4);assert.equal(prepared.revision.globalVectorWatermark,4);
  assert.equal(Date.parse(prepared.revision.snapshot.products[0].eligibleUntil),AT-3600000+35*86400000);
  const current=await f.promote(prepared);
  assert.equal(nativeHash(f.index.get(old.publicId).values),nativeHash(values));assert.ok(Object.is(f.index.get(old.publicId).values[0],-0));
  const queued=await settleApprovedCohort(f.db,current,prepared.revision,()=>readOwnedApprovedCohortVectors(f.db,current,prepared.revision,f.adapters));
  assert.equal(queued.state,'build_queued');assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,1);
  assert.equal((await settleApprovedCohort(f.db,queued.owner,prepared.revision,()=>readOwnedApprovedCohortVectors(f.db,queued.owner,prepared.revision,f.adapters))).state,'existing');
  const build=await claimBuildRequest(f.db,queued.requestId,'test-only/workflow',f.now());
  const intent={releaseId:'new-release',catalogRevision:'approved-revision',codeSha:request.codeSha,catalogSnapshotSha256:prepared.revision.packet.receipt.snapshot_sha256,
    manifestSha256:'a'.repeat(64),vectorSyncWatermark:4,priorReleaseId:'prior-release',nextExpiry:prepared.revision.snapshot.products[0].eligibleUntil};
  await enqueuePublication(f.db,prepared.revision.snapshot,intent,f.now());
  const publication=await claimPublication(f.db,prepared.revision.snapshot,intent.releaseId,f.now());
  await recordPublicationDispatch(f.db,prepared.revision.snapshot,publication,'test-only/dispatch',f.now());
  const prior={environment:'staging',settled:true,active:{releaseId:f.priorIntent.releaseId,codeSha:f.priorIntent.codeSha,
    catalogRevision:f.priorIntent.catalogRevision,catalogSnapshotSha256:f.priorIntent.catalogSnapshotSha256,manifestSha256:f.priorIntent.manifestSha256,versionReference:'old-version'}};
  const permit=await beginBuildActivation(f.db,build,prepared.revision.snapshot,publication,'test-only/upload',async()=>prior,f.now(),queued.owner);
  assert.equal(permit.mutationOwner.phase,'activating'); // Permission only; no fake deployed/publication receipt.
});
test('unapproved factual/copy changes, revoked rights and unavailable products become held, never stale public content',async t=>{
  for(const mutate of [
    (f)=>f.sql.prepare("UPDATE products SET source_facts_hash=? WHERE public_id=?").run('f'.repeat(64),uuid(1)),
    (f)=>f.sql.prepare("UPDATE products SET rights_json='{}' WHERE public_id=?").run(uuid(1)),
    (f)=>f.sql.prepare("UPDATE products SET availability_status='UNAVAILABLE' WHERE public_id=?").run(uuid(1)),
    (f)=>{const row=f.sql.prepare('SELECT public_display_json FROM products WHERE public_id=?').get(uuid(1));
      f.sql.prepare('UPDATE products SET public_display_json=? WHERE public_id=?').run(JSON.stringify({...JSON.parse(row.public_display_json),title:'Unapproved current copy'}),uuid(1));},
  ]){const f=await setup(t);mutate(f);const {owner,request}=await f.freeze();const result=await prepareApprovedCohort(f.db,owner,request);
    assert.deepEqual(result.revision.snapshot.products,[f.previous.products[1]]);assert.ok(result.revision.snapshot.heldProducts.some(p=>p.publicId===uuid(1)));
    assert.deepEqual(approvedCohortVectorPlan(result.revision).absentIds,[uuid(1)]);}
});
test('explicit approved former-held product may enter; family duplicate and unknown evidence remain held',async t=>{
  const f=await setup(t);await f.upsert(product(3));await f.upsert(product(4,{title:names[0]}));await f.drain();
  const {owner,request}=await f.freeze([uuid(3),uuid(4)]);const result=await prepareApprovedCohort(f.db,owner,request);
  assert.deepEqual(result.revision.snapshot.products.map(p=>p.publicId),[uuid(1),uuid(2),uuid(3)]);
  assert.equal(result.revision.snapshot.heldProducts.find(p=>p.publicId===uuid(4)).reason,'duplicate');
  // The duplicate already has a settled maintenance upsert. Its exclusion must
  // therefore be an exact-ID deletion, not just omission from the proof plan.
  assert.ok(f.index.has(uuid(4)));assert.deepEqual(approvedCohortVectorPlan(result.revision).absentIds,[uuid(4)]);
  const current=await f.promote(result);assert.equal(f.index.has(uuid(4)),false);
  assert.equal((await settleApprovedCohort(f.db,current,result.revision,()=>readOwnedApprovedCohortVectors(f.db,current,result.revision,f.adapters))).state,'build_queued');
  const unknown=await setup(t);unknown.setIntent(()=>({reviewedDeleteReference:'test-only'}));
  await unknown.upsert(product(4));await unknown.drain();const next=await unknown.freeze([uuid(4)]);
  const held=await prepareApprovedCohort(unknown.db,next.owner,next.request);
  assert.ok(held.revision.snapshot.heldProducts.some(p=>p.publicId===uuid(4)));assert.equal(held.revision.snapshot.products.length,2);
});
test('expired source observations or short current rights never renew; all-held stays explicit',async t=>{
  const f=await setup(t);f.advance(36*86400000);const {owner,request}=await f.freeze();request.context.cutoff=at(36*86400000+3600000);
  await releaseMutationOwnership(f.db,owner);const freshOwner=await claimMutationOwnership(f.db,scope,{phase:'freezing',ownerReference:'later-build',operationKey:approvedCohortOperationKey(request)});
  const result=await prepareApprovedCohort(f.db,freshOwner,request);assert.equal(result.state,'all_held');assert.equal(result.revision.snapshot.products.length,0);
  assert.equal(result.revision.snapshot.heldProducts.length,3);assert.equal(result.revision.snapshot.generatedAt,f.now().toISOString());
  const short=await setup(t);short.setIntent((p,hash)=>({rightsById:{[p.id]:{...rights(p),title:{...rights(p).title,expiresAt:at(3600000)}}},
    verificationById:{[p.id]:{reference:'test-only',observedAt:at(-3600000),sourceFactsHash:hash}},
    embeddingById:{[p.id]:{reference:'test-only',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:hash}}}));
  await short.upsert(product(4));await short.drain();const next=await short.freeze([uuid(4)]);
  assert.ok((await prepareApprovedCohort(short.db,next.owner,next.request)).revision.snapshot.heldProducts.some(p=>p.publicId===uuid(4)));
});
test('approval hashes/receipts, global pending work, wrong owner and the 20 union bound fail closed',async t=>{
  const f=await setup(t);await f.upsert(product(4));
  const unfinished=await f.freeze([uuid(4)]);
  await assert.rejects(prepareApprovedCohort(f.db,unfinished.owner,unfinished.request),/unsettled/);
  const g=await setup(t);await g.upsert(product(4));await g.drain();const {owner,request}=await g.freeze([uuid(4)]);
  await assert.rejects(prepareApprovedCohort(g.db,{...owner,epoch:999},request));
  const bad=structuredClone(request);bad.approval.changes[0].displaySha256='0'.repeat(64);
  assert.throws(()=>approvedCohortOperationKey(bad),/approval_invalid/);
  g.sql.prepare("UPDATE products SET rights_json='{}' WHERE public_id=?").run(uuid(4));
  await assert.rejects(prepareApprovedCohort(g.db,owner,request),/approval_changed/);
  const big=await setup(t,{initial:21});const before=big.calls();const next=await big.freeze();
  await assert.rejects(prepareApprovedCohort(big.db,next.owner,next.request),/vector_proof_bound/);assert.equal(big.calls(),before);
  assert.equal(big.sql.prepare('SELECT count(*) n FROM catalog_projection_receipts').get().n,1);
});
test('lost seal/settlement responses restart from exact receipts; drift and unknown provider keep ownership',async t=>{
  const f=await setup(t);await f.upsert(product(4));await f.drain();const {owner,request}=await f.freeze([uuid(4)]);
  f.lose(statements=>statements.some(s=>s.query.startsWith('INSERT INTO catalog_projection_receipts')));
  await assert.rejects(prepareApprovedCohort(f.db,owner,request));
  const recovered=await readMutationOwner(f.db,scope);const prepared=await prepareApprovedCohort(f.db,recovered,request);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_projection_receipts').get().n,2);
  f.uncertain(true);const pending=await deliverOwnedApprovedCohortVector({db:f.db,owner:prepared.owner,revision:prepared.revision,
    publicId:uuid(1),original:f.originals.get(uuid(1)),adapters:f.adapters});
  assert.equal(pending.state,'pending');await assert.rejects(releaseMutationOwnership(f.db,pending.owner));
  const sent=f.calls();const retry=await deliverOwnedApprovedCohortVector({db:f.db,owner:pending.owner,revision:prepared.revision,
    publicId:uuid(1),original:f.originals.get(uuid(1)),adapters:f.adapters});assert.equal(retry.state,'pending');assert.equal(f.calls(),sent);
  f.uncertain(false);const complete=await deliverOwnedApprovedCohortVector({db:f.db,owner:pending.owner,revision:prepared.revision,
    publicId:uuid(1),original:f.originals.get(uuid(1)),adapters:f.adapters});
  const current=await f.promote({...prepared,owner:complete.owner});
  f.lose(statements=>statements.some(s=>s.query.startsWith('INSERT INTO catalog_build_requests')));
  await assert.rejects(settleApprovedCohort(f.db,current,prepared.revision,()=>readOwnedApprovedCohortVectors(f.db,current,prepared.revision,f.adapters)));
  const actual=await readMutationOwner(f.db,scope);
  assert.equal((await settleApprovedCohort(f.db,actual,prepared.revision,()=>readOwnedApprovedCohortVectors(f.db,actual,prepared.revision,f.adapters))).state,'existing');
  const g=await setup(t);const claim=await g.freeze();
  g.after(statements=>{if(statements.some(s=>s.query.startsWith('INSERT INTO catalog_public_products'))){g.after(null);
    g.sql.prepare("UPDATE products SET rights_json='{}' WHERE public_id=?").run(uuid(1));}});
  await assert.rejects(prepareApprovedCohort(g.db,claim.owner,claim.request));assert.equal(g.sql.prepare('SELECT count(*) n FROM catalog_projection_receipts').get().n,1);
});
test('new sealed reader recognizes operation-bound actual observation, not the later SQL clock',async t=>{
  const f=await setup(t);const claim=await f.freeze();const prepared=await prepareApprovedCohort(f.db,claim.owner,claim.request);
  const current=await f.promote(prepared);await settleApprovedCohort(f.db,current,prepared.revision,()=>readOwnedApprovedCohortVectors(f.db,current,prepared.revision,f.adapters));
  const revision=prepared.revision;const envelope=createSealedSnapshotEnvelope(revision.snapshot);
  const context={...f.context,envelopeSha256:sha256(`${JSON.stringify(envelope)}\n`),snapshotSha256:revision.packet.receipt.snapshot_sha256,
    projectionSha256:revision.packet.receipt.projection_sha256,sourceExportSha256:revision.sourceDigest,vectorSyncWatermark:0};
  assert.equal((await reconstructD1Snapshot(f.db,envelope,context)).status,'ready');
  const row=f.sql.prepare('SELECT timestamp_provenance_json FROM products WHERE public_id=?').get(uuid(1));const proof=JSON.parse(row.timestamp_provenance_json);
  proof.fields.availability_checked_at.observedAt=at(86400000);f.sql.prepare('UPDATE products SET timestamp_provenance_json=? WHERE public_id=?').run(JSON.stringify(proof),uuid(1));
  assert.equal((await reconstructD1Snapshot(f.db,envelope,context)).status,'held');
  assert.equal((await getRevisionProductsByPublicIds(f.db,[uuid(2)],f.now(),revision.snapshot.catalogRevision)).length,1);
});
test('unapproved revisions remain searchable only when compatible; no early mutable serving-revision flip',async t=>{
  const f=await setup(t);await f.upsert(product(1,{title:'New factual replacement',sourceFacts:{fixture:1,changed:true}}));await f.drain();
  const claim=await f.freeze();const prepared=await prepareApprovedCohort(f.db,claim.owner,claim.request);
  assert.deepEqual(prepared.revision.snapshot.products,[f.previous.products[1]]);
  assert.deepEqual((await getRevisionProductsByPublicIds(f.db,[uuid(1),uuid(2)],f.now(),f.previous.catalogRevision)).map(p=>p.publicId),[uuid(2)]);
  assert.equal(f.sql.prepare('SELECT catalog_revision FROM products WHERE public_id=?').get(uuid(2)).catalog_revision,'prior-revision');
  assert.equal(f.sql.prepare('SELECT status FROM catalog_revisions WHERE revision=?').get('approved-revision').status,'importing');
  await assert.rejects(settleApprovedCohort(f.db,prepared.owner,prepared.revision,()=>readOwnedApprovedCohortVectors(f.db,prepared.owner,prepared.revision,f.adapters)),/vectors_unconfirmed/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
});
test('exact approved full-row CAS and prior/watermark/expiry guards reject drift before final queue',async t=>{
  for(const mutate of [
    f=>f.sql.prepare('UPDATE products SET price_minor=1234 WHERE public_id=?').run(uuid(4)),
    f=>f.sql.exec("UPDATE publication_receipts SET manifest_json='[]'"),
    f=>f.sql.exec('UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1'),
    f=>f.advance(7*3600000),
  ]){
    const f=await setup(t);await f.upsert(product(4));await f.drain();const claim=await f.freeze([uuid(4)]);
    const prepared=await prepareApprovedCohort(f.db,claim.owner,claim.request);const owner=await f.promote(prepared);
    await assert.rejects(settleApprovedCohort(f.db,owner,prepared.revision,async()=>{
      const proof=await readOwnedApprovedCohortVectors(f.db,owner,prepared.revision,f.adapters);mutate(f);return proof;}));
    assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
    assert.equal(f.sql.prepare('SELECT status FROM catalog_revisions WHERE revision=?').get('approved-revision').status,'importing');
  }
});
test('delayed approved-vector settlement across expiry releases only proven work and can explicitly abandon the seal',async t=>{
  const f=await setup(t);f.setIntent((p,hash)=>({rightsById:{[p.id]:{...rights(p),title:{...rights(p).title,expiresAt:at(8*3600000)}}},
    verificationById:{[p.id]:{reference:'test-only/observation',observedAt:at(-3600000),sourceFactsHash:hash}},
    embeddingById:{[p.id]:{reference:'test-only/embedding',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:hash}}}));
  await f.upsert(product(4));await f.drain();const claim=await f.freeze([uuid(4)]);const prepared=await prepareApprovedCohort(f.db,claim.owner,claim.request);
  f.index.delete(uuid(4));const options={db:f.db,owner:prepared.owner,revision:prepared.revision,publicId:uuid(4),adapters:f.adapters};
  const first=await deliverOwnedApprovedCohortVector(options);assert.equal(first.state,'pending');const calls=f.calls();
  f.advance(9*3600000);const expired=await deliverOwnedApprovedCohortVector({...options,owner:first.owner});
  assert.equal(expired.state,'expired');assert.equal(f.calls(),calls);assert.equal(f.sql.prepare('SELECT external_pending FROM catalog_mutation_scopes').get().external_pending,0);
  await assert.rejects(settleApprovedCohort(f.db,expired.owner,prepared.revision,()=>readOwnedApprovedCohortVectors(f.db,expired.owner,prepared.revision,f.adapters)));
  const abandoned=await abandonExpiredPrunedRevision(f.db,expired.owner,prepared.revision);
  assert.equal(abandoned.state,'abandoned');await releaseMutationOwnership(f.db,abandoned.owner);
  assert.equal(f.sql.prepare('SELECT status FROM catalog_revisions WHERE revision=?').get('approved-revision').status,'importing');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
});
