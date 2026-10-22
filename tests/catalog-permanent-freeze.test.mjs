import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {setup,scope,uuid} from './helpers/published-vector-fixture.mjs';
import {canonicalJson,sha256,convertSourceRow} from '../scripts/catalog/migration.ts';
import {createCatalogD1MigrationRest} from '../scripts/catalog/d1-write-rest.ts';
import {createOneTimeMigrationBudget} from '../scripts/catalog/one-time-migration-budget.ts';
import {captureOwnedD1} from '../scripts/catalog/capture-owned-d1.ts';
import {prepareOwnedOperationalImport,applyOwnedOperationalImport} from '../scripts/catalog/owned-operational-import.ts';
import {mapAuthoredCopyEvidence} from '../scripts/catalog/authored-copy-evidence.ts';
import {assemblePermanentBaseline} from '../scripts/catalog/permanent-baseline.ts';
import {permanentBaselineCurrent,preparePermanentDisplayPlan,applyPermanentDisplayPlan} from '../scripts/catalog/permanent-display-d1.ts';
import {claimMutationOwnership,releaseMutationOwnership} from '../lib/catalog/mutation-fence.ts';
import {permanentCatalogOperationKey,preparePermanentCatalog,settlePermanentCatalog,assertPermanentCatalog} from '../lib/catalog/freeze-permanent-catalog.ts';
import {prunedVectorPlan,prunedVectorIds} from '../lib/catalog/prune-existing-revision.ts';
import {claimBuildRequest,beginBuildActivation,resolveBuildActivation} from '../lib/catalog/build-requests.ts';
import {enqueuePublication,claimPublication,recordPublicationDispatch,completePublication,completeActivatedPublication,completeActivatedPermanentPublication} from '../lib/catalog/publication.ts';
import {readPermanentNativeProof,readActivatedCatalogVectors} from '../scripts/catalog/owned-vector-delivery.ts';
import {createSealedSnapshotEnvelope} from '../scripts/catalog/export-d1-snapshot.ts';
import {createProjectionPacket,getListedRevisionProductsByPublicIds,getRevisionProductsByPublicIds} from '../lib/catalog/d1.ts';

const accountId='a'.repeat(32),databaseId=uuid(9999),manifest='b'.repeat(64),asset='/images/gift-placeholder.svg';
const svg='<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>';
const grant=value=>({basis:'owned',value,reference:'ROOT approved exact synthetic value; no real rights claim'});
const same=(a,b)=>assert.equal(canonicalJson(a),canonicalJson(b));
async function fixture(t,{count=12,afterExpiry=false}={}){
  const f=await setup(t,{providerIdentity:`cloudflare:${accountId}:${scope.indexName}`});
  if(afterExpiry)f.advance(Date.parse(f.revision.snapshot.products[0].eligibleUntil)-f.now().getTime()+3600000);
  let statements=0,requests=0,maxRequest=0,maxResponse=0,loseSeal=false;
  const ledger={httpRequests:0,sqlStatements:0,knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:0},dbScope={accountId,databaseId,databaseName:'permanent-freeze'};
  // Explicit LOCAL fixture profile covers genuine union+installer+freeze/replay;
  // synthetic usage is not account evidence or authorization for any live run.
  const budget=createOneTimeMigrationBudget({scope:dbScope,ledgerAtObservation:ledger,observations:[{accountId,utcDay:f.now().toISOString().slice(0,10),
    capturedAt:f.now().toISOString(),coverage:'account-wide',resources:[databaseId],rowsRead:0,rowsWritten:0,evidenceSha256:'a'.repeat(64)}],
    required:{requests:10000,statements:25000,rowsRead:2000000,rowsWritten:85000,evidenceSha256:'b'.repeat(64)}},f.now());
  const send=async(url,init)=>{requests++;assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}${init.method==='POST'?'/query':''}`);
      if(init.method==='GET')return Response.json({success:true,result:{uuid:databaseId,name:'permanent-freeze',read_replication:{mode:'disabled'}}});
      const {batch}=JSON.parse(init.body);assert.ok(batch.length<=50);statements+=batch.length;
      maxRequest=Math.max(maxRequest,Buffer.byteLength(init.body));assert.ok(maxRequest<=512*1024);f.sql.exec('BEGIN');let result;
      try{result=batch.map(q=>{assert.ok(q.params.length<=100);const before=f.sql.prepare('SELECT total_changes() n').get().n;
        const rows=f.sql.prepare(q.sql).all(...q.params).map(r=>({...r}));return{success:true,results:rows,meta:{served_by_primary:true,
          rows_read:rows.length,rows_written:f.sql.prepare('SELECT total_changes() n').get().n-before}};});f.sql.exec('COMMIT');}
      catch(error){f.sql.exec('ROLLBACK');throw error;}
      if(loseSeal&&batch.some(q=>q.sql.startsWith('INSERT INTO catalog_projection_receipts'))){loseSeal=false;throw new Error('synthetic committed seal ACK loss');}
      const bytes=JSON.stringify({success:true,result});maxResponse=Math.max(maxResponse,Buffer.byteLength(bytes));assert.ok(maxResponse<=512*1024);return new Response(bytes);};
  const makeDb=(initial=ledger)=>createCatalogD1MigrationRest({accountId,databaseId,databaseName:'permanent-freeze',token:'FIXTURE_ONLY',budget,ledger:initial,now:f.now,
    accounting:{scope:dbScope,initial,async reserve(){},async settle(){}},fetch:send});
  const db=await makeDb();
  await releaseMutationOwnership(db,f.owner);
  const now=()=>f.now().toISOString(),writers=()=>[{id:'daily',kind:'application',codePaths:['scripts/catalog/run-cloudflare-weekly.ts'],reference:'Synthetic stopped job',stoppedAt:now()},
    {id:'operator',kind:'operator',codePaths:[],reference:'Synthetic sole operator',stoppedAt:now()}];
  const claim=key=>claimMutationOwnership(db,scope,{phase:'writing',ownerReference:key,operationKey:sha256(key)});
  const owner=await claim('union'),initial=await captureOwnedD1({db,owner,reference:'Synthetic initial capture',stoppedWriters:writers()});
  const source=Array.from({length:count},(_,i)=>{const n=i+1,current=initial.capture.tables.products.find(p=>p.public_id===uuid(n));
    return{id:`B${String(n).padStart(9,'0')}`,public_id:uuid(n),slug:current?.slug??`original-gift-${n}`,source:'amazon',title:`Supplier fixture ${n}`,
      price:'19.99',currency:'USD',image_url:`https://supplier.invalid/${n}.jpg`,affiliate_url:`https://www.amazon.com/dp/B${String(n).padStart(9,'0')}?tag=fixture-20`,
      source_query:'synthetic',humor_tags:'{}',punny_title:null,witty_description:null,quality_score:'0.85',rating:null,review_count:null,
      is_active:count===3383?n<=2363&&![9,10].includes(n):![9,10].includes(n),editorial_writeup:null,source_facts:null,source_facts_hash:null,
      editorial_source_hash:null,availability_status:'IN_STOCK',editorial_status:'pending',editorial_quality_score:null,editorial_model:null,
      editorial_prompt_version:null,editorial_generated_at:null,editorial_block_reason:null,duplicate_of_product_id:null,content_updated_at:null,
      availability_checked_at:null,last_verified_at:null,created_at:now(),updated_at:now(),embedding:null};});
  const incoming=source.slice(10).map(row=>convertSourceRow('products',row,{catalogRevision:'archive',archiveId:manifest,timestamps:{}})),batches=[];
  for(let i=0;i<incoming.length;i+=40)batches.push({table:'products',rows:incoming.slice(i,i+40),exportSha256:manifest});
  const packet={batches,preservedRows:initial.capture.tables.products,summary:{sourceManifestSha256:manifest,importedAt:now(),batchCount:batches.length,importedRows:incoming.length,sourceIdentityCount:count}};
  const union=prepareOwnedOperationalImport({packet,capture:initial.capture,captureSha256:initial.captureSha256,owner}),cursor={current:owner};
  await applyOwnedOperationalImport({db,plan:union.plan,planSha256:union.sha256,ownerCursor:cursor,cooperativeCapture:{receipt:initial.receipt,sha256:initial.receiptSha256}});
  const captured=await captureOwnedD1({db,owner:cursor.current,reference:'Synthetic completed union',stoppedWriters:writers()});
  const raw=source.map(row=>JSON.stringify(row)).join('\n')+'\n',tables=[{raw,rows:source,definition:{schema:'public',name:'products',sha256:sha256(raw),rowCount:count,columns:Object.keys(source[0]).map(name=>({name}))}},
    {raw:'',rows:[],definition:{schema:'public',name:'catalog_editorial_events',sha256:sha256(''),rowCount:0,columns:[]}}];
  const evidence=mapAuthoredCopyEvidence({tables,summary:{manifestSha256:manifest,tables:tables.map(t=>({schema:'public',name:t.definition.name,sourceSha256:t.definition.sha256,rowCount:t.rows.length}))}},
    {expectedManifestSha256:manifest,archiveReference:'private:synthetic',canonicalAffiliateTag:'fixture-20',seeds:[]});
  const assembler={expectedEvidenceSha256:sha256(canonicalJson(evidence)),approvedRightsById:Object.fromEntries(evidence.products.map(p=>[p.id,
    {title:grant(p.fields.title.value),description:grant(p.fields.title.value),imageUrl:grant(asset),affiliateUrl:grant(p.fields.retailerUrl.value)}])),
    placeholder:{path:asset,bytes:Buffer.from(svg),expectedSha256:sha256(svg)},now:f.now()};
  const proposal=assemblePermanentBaseline(evidence,permanentBaselineCurrent(captured.capture),assembler);
  const installation=preparePermanentDisplayPlan({capture:captured.capture,captureSha256:captured.captureSha256,owner:cursor.current,
    union:{plan:union.plan,sha256:union.sha256},evidence,assembler,approvedProposal:{value:proposal,sha256:sha256(canonicalJson(proposal)),reference:'ROOT exact synthetic plan'}});
  await applyPermanentDisplayPlan({db,plan:installation.plan,planSha256:installation.sha256,ownerCursor:cursor,cooperativeCapture:{receipt:captured.receipt,sha256:captured.receiptSha256}});
  await releaseMutationOwnership(db,cursor.current);
  const previous=f.revision.snapshot,receipt=f.sql.prepare("SELECT * FROM publication_receipts WHERE release_id='original-release'").get();
  const request={scope,codeSha:'9'.repeat(40),catalogRevision:'permanent',previous,preserveSupplierPhotos:true,
    productOrder:[...previous.products.map(p=>p.publicId),...proposal.proposed.map(p=>p.input.product.publicId).filter(id=>!previous.products.some(p=>p.publicId===id))],
    context:{envelopeSha256:sha256(`${JSON.stringify(createSealedSnapshotEnvelope(previous))}\n`),snapshotSha256:f.revision.packet.receipt.snapshot_sha256,
      projectionSha256:f.revision.packet.receipt.projection_sha256,sourceExportSha256:f.revision.sourceDigest,vectorSyncWatermark:f.revision.vectorSyncWatermark,
      publicationReceiptWatermark:2,cutoff:new Date(f.now().getTime()+3600000).toISOString(),priorPublication:{releaseId:'original-release',receiptSha256:sha256(canonicalJson(receipt))}},
    installation:{...installation,capture:{receipt:captured.receipt,sha256:captured.receiptSha256}},
    native:{source:f.published.source,revisionSha256:sha256(canonicalJson(f.revision)),plan:prunedVectorPlan(f.revision)}};
  const freezing=await claimMutationOwnership(db,scope,{phase:'freezing',ownerReference:'permanent',operationKey:permanentCatalogOperationKey(request)});
  const metrics=()=>({requests,statements,maxRequest,maxResponse});
  return{...f,db,makeDb,request,owner:freezing,metrics,loseSeal(){loseSeal=true;}};
}
test('one-time permanent freeze preserves3383 identities/native, then reopens and settles expired active ACK with bounded full-row proofs',async t=>{
  const f=await fixture(t,{count:3383,afterExpiry:true}),products=f.sql.prepare('SELECT * FROM products ORDER BY id').all(),native=canonicalJson([...f.index]),
    journals=f.sql.prepare('SELECT * FROM catalog_vector_deliveries ORDER BY delivery_id').all(),start=f.metrics();
  const prepared=await preparePermanentCatalog(f.db,f.owner,f.request),{revision}=prepared;
  const sealed=f.metrics();
  assert.equal(revision.snapshot.products.length,2361);assert.equal(revision.snapshot.heldProducts.length,1022);
  assert.ok(revision.snapshot.products.every(p=>p.eligibleUntil===null&&p.imageUrl===asset));
  const plan=prunedVectorPlan(revision);assert.equal(plan.products.length,0);assert.equal(plan.absentIds.length,0);assert.equal(prunedVectorIds(plan).length,8);
  assert.equal(revision.packet.rows.filter(r=>r.source_facts_hash===null).length,2353);
  assert.equal((await getListedRevisionProductsByPublicIds(f.db,[uuid(11)],f.now(),'permanent')).length,1);
  assert.equal((await getRevisionProductsByPublicIds(f.db,[uuid(11)],f.now(),'permanent')).length,0);
  const queued=await settlePermanentCatalog(f.db,prepared.owner,revision,f.adapters);
  const settled=f.metrics();
  assert.equal(queued.state,'build_queued');same(f.sql.prepare('SELECT * FROM products ORDER BY id').all(),products);
  same(f.sql.prepare('SELECT * FROM catalog_vector_deliveries ORDER BY delivery_id').all(),journals);assert.equal(canonicalJson([...f.index]),native);assert.ok(Object.is(f.index.get(uuid(1)).values[0],-0));
  const read=await readPermanentNativeProof({db:f.db,owner:queued.owner,revision,adapters:f.adapters});assert.equal(read.settled,true);
  const replay=await settlePermanentCatalog(f.db,queued.owner,revision,f.adapters);assert.equal(replay.state,'existing');
  const repeated=f.metrics();
  const build=await claimBuildRequest(f.db,queued.requestId,'fixture:bulk-build',f.now()),intent={releaseId:'permanent-release',catalogRevision:'permanent',codeSha:f.request.codeSha,
    catalogSnapshotSha256:revision.packet.receipt.snapshot_sha256,manifestSha256:'a'.repeat(64),vectorSyncWatermark:0,priorReleaseId:'original-release',nextExpiry:null};
  await enqueuePublication(f.db,revision.snapshot,intent,f.now());const publication=await claimPublication(f.db,revision.snapshot,intent.releaseId,f.now());
  await recordPublicationDispatch(f.db,revision.snapshot,publication,'version:fixture:bulk-version',f.now());
  const permit=await beginBuildActivation(f.db,build,revision.snapshot,publication,'fixture:bulk-version',async()=>({environment:scope.environment,settled:true,
    active:{...f.original.intent,versionReference:f.original.permit.versionReference}}),f.now(),queued.owner);
  const control={catalogRevision:'permanent',planSha256:sha256(canonicalJson(plan)),ids:prunedVectorIds(plan)};
  let activeDb=f.db,observations=0;const observe=async()=>{observations++;return readActivatedCatalogVectors(activeDb,permit,control,f.adapters,{permanent:revision});};
  await assert.rejects(completePublication(f.db,revision.snapshot,intent.releaseId,publication.token,async()=>{await observe();throw new Error('Synthetic active version read ACK lost');},f.now,permit.mutationOwner));
  f.advance(16*60000);const beforeReopen=f.db.metrics();activeDb=await f.makeDb({httpRequests:beforeReopen.requests,sqlStatements:beforeReopen.statements,
    knownRowsRead:beforeReopen.reportedRowsRead,knownRowsWritten:beforeReopen.reportedRowsWritten,unconfirmedRequests:beforeReopen.unconfirmedRequests});
  assert.ok(activeDb.metrics().requests>beforeReopen.requests);assert.ok(Buffer.byteLength(JSON.stringify(revision.packet.rows))>512*1024);
  await assert.rejects(completeActivatedPublication(activeDb,revision,publication,permit,async()=>{assert.fail('ordinary10/20 guard widened');},f.now),/publication_activation_fenced/);
  const callbacks=observations;await completeActivatedPermanentPublication(activeDb,revision,publication,permit,async()=>{await observe();return intent;},f.now);
  assert.ok(observations>callbacks);assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='permanent-release'").get().n,1);
  assert.equal(await resolveBuildActivation(activeDb,permit,async()=>{await observe();return{environment:scope.environment,settled:true,active:{...intent,versionReference:permit.versionReference}};}),'resolved');
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');assert.equal(canonicalJson([...f.index]),native);
  const end=f.metrics(),cost=(a,b)=>({requests:b.requests-a.requests,statements:b.statements-a.statements});
  t.diagnostic(JSON.stringify({fixture:'LOCAL REST+SQLite only; not provider acceptance',prepare:cost(start,sealed),settle:cost(sealed,settled),
    extraProofAndReplay:cost(settled,repeated),publicationThroughIdle:cost(repeated,end),freezeThroughIdle:cost(start,end),wire:end}));
});
test('current overlay keeps original clock; source/history/receipt/native/owner/expiry drift refuses and committed seal retry is exact',async t=>{
  const f=await fixture(t),before=f.dispatches();f.loseSeal();await assert.rejects(preparePermanentCatalog(f.db,f.owner,f.request));
  const actual=f.sql.prepare('SELECT mutation_epoch epoch FROM catalog_mutation_scopes').get(),prepared=await preparePermanentCatalog(f.db,{...f.owner,epoch:actual.epoch},f.request);
  assert.ok(prepared.revision.snapshot.products.slice(0,8).every(p=>p.persistent&&p.eligibleUntil!==null));
  const original=structuredClone(prepared.revision),read=revision=>readPermanentNativeProof({db:f.db,owner:prepared.owner,revision,adapters:f.adapters});
  await assertPermanentCatalog(f.db,prepared.owner,original);assert.equal((await read(original)).settled,true);
  for(const change of [r=>r.snapshot.products.reverse(),r=>r.packet.rows[0].tags='different',r=>r.packet.receipt.created_at='2020-01-01T00:00:00.000Z']){
    const changed=structuredClone(original);change(changed);await assert.rejects(assertPermanentCatalog(f.db,prepared.owner,changed));}
  for(const mutate of [r=>{r.nativePreservation.source.deliverySha256='0'.repeat(64);},r=>{r.nativePreservation.source.receiptSha256='0'.repeat(64);},
    r=>{r.request.installation.plan.input.capture.tables.products[0].source_query='changed';}]){const changed=structuredClone(original);mutate(changed);await assert.rejects(read(changed));}
  for(const fault of ['native','source','held','prior','owner']){const reset=f.sql.prepare('SELECT * FROM products WHERE public_id=?').get(fault==='held'?uuid(9):uuid(1));
    let once=false;const adapters={...f.adapters,async readback(id,signal){const v=await f.adapters.readback(id,signal);if(id===uuid(1)&&!once){once=true;
      if(fault==='native')v.values[0]=0;if(fault==='source'||fault==='held')f.sql.prepare("UPDATE products SET tags='drift' WHERE public_id=?").run(reset.public_id);
      if(fault==='prior')f.sql.prepare("UPDATE publication_receipts SET code_sha=? WHERE release_id='original-release'").run('0'.repeat(40));
      if(fault==='owner')f.sql.prepare('UPDATE catalog_mutation_scopes SET captured_at=?').run(new Date(f.now().getTime()+1).toISOString());}return v;}};
    await assert.rejects((async()=>{await assertPermanentCatalog(f.db,prepared.owner,original);await readPermanentNativeProof({db:f.db,owner:prepared.owner,revision:original,adapters});await assertPermanentCatalog(f.db,prepared.owner,original);})(),undefined,fault);
    if(fault==='source'||fault==='held')f.sql.prepare('UPDATE products SET tags=? WHERE public_id=?').run(reset.tags,reset.public_id);
    if(fault==='prior')f.sql.prepare("UPDATE publication_receipts SET code_sha=? WHERE release_id='original-release'").run(f.original.intent.codeSha);
    if(fault==='owner')f.sql.prepare('UPDATE catalog_mutation_scopes SET captured_at=?').run(prepared.owner.capturedAt);
  }
  assert.equal(f.dispatches(),before);same(original,prepared.revision);f.advance(2*3600000);await assert.rejects(assertPermanentCatalog(f.db,prepared.owner,original));
});
test('0015 keeps all16 historical projection bytes/rowids/FTS immutable, permits only explicit identity-only null facts',async t=>{
  const f=await setup(t,{migrationThrough:14}),rows=()=>f.sql.prepare('SELECT rowid,* FROM catalog_public_products ORDER BY rowid').all(),before=rows();
  assert.equal(before.length,16);f.sql.exec('BEGIN');f.sql.exec(await readFile(new URL('../migrations/d1/0015_persistent_projection_facts.sql',import.meta.url),'utf8'));f.sql.exec('COMMIT');same(rows(),before);
  assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
  const p=f.revision.snapshot.products[0],base={id:p.id,publicId:p.publicId,slug:p.slug,source:p.source,currency:p.currency,title:'Own identity',description:'Own identity',
    imageUrl:asset,affiliateUrl:p.affiliateUrl,price:0,isActive:true,qualityScore:.8,eligibleUntil:null,indexable:false};
  const snapshot={...f.revision.snapshot,catalogRevision:'null-facts',products:[base]},packet=await createProjectionPacket(snapshot,{[p.publicId]:null},manifest,f.now());
  assert.equal(packet.rows[0].source_facts_hash,null);
  await assert.rejects(createProjectionPacket({...snapshot,products:[p]},{[p.publicId]:null},manifest,f.now()),/factual hash/);
  await assert.rejects(createProjectionPacket(snapshot,{},manifest,f.now()),/factual hash/);
  f.sql.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)').run('null-facts',f.now().toISOString(),manifest,'importing');
  const row=packet.rows[0],keys=Object.keys(row),insert=f.sql.prepare(`INSERT INTO catalog_public_products(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`);
  insert.run(...keys.map(k=>row[k]));const finite={...row,catalog_revision:'finite-null',eligible_until:p.eligibleUntil,public_display_json:JSON.stringify(p)};
  assert.throws(()=>insert.run(...keys.map(k=>finite[k])));
  for(const field of ['eligibleUntil','indexable']){const invalid={...base};delete invalid[field];
    assert.throws(()=>insert.run(...keys.map(k=>k==='catalog_revision'?`missing-${field}`:k==='public_display_json'?JSON.stringify(invalid):row[k])));}
  assert.equal(f.sql.prepare("SELECT count(*) n FROM catalog_public_products_fts WHERE catalog_public_products_fts MATCH 'identity'").get().n,1);
  same(rows().slice(0,16),before);
});
