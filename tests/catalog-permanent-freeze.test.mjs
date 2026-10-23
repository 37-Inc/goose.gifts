import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setup,scope,uuid} from './helpers/published-vector-fixture.mjs';
import {canonicalJson,sha256,convertSourceRow} from '../scripts/catalog/migration.ts';
import {createCatalogD1MigrationRest,createCatalogD1Rest} from '../scripts/catalog/d1-write-rest.ts';
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
import {readPermanentNativeProof,readHistoricalNativePreservation,readActivatedCatalogVectors,readActivatedPermanentCatalogNative,OWNED_VECTOR_PROOF_LIMIT} from '../scripts/catalog/owned-vector-delivery.ts';
import {createSealedSnapshotEnvelope} from '../scripts/catalog/export-d1-snapshot.ts';
import {createPermanentCatalogSeal,reconstructPermanentSnapshot,readPermanentCatalogPrior} from '../scripts/catalog/permanent-catalog-seal.ts';
import {approvedCohortOperationKey,prepareApprovedCohort,approvedCohortVectorPlan} from '../lib/catalog/freeze-approved-cohort.ts';
import {createD1CatalogMaintenanceStore,loadMaintenanceVectorPayload} from '../scripts/catalog/maintenance-d1.ts';
import {deliverOwnedOutboxEvent} from '../scripts/catalog/owned-vector-delivery.ts';
import {createProjectionPacket,getListedRevisionProductsByPublicIds,getRevisionProductsByPublicIds} from '../lib/catalog/d1.ts';
import {executePublication} from '../scripts/catalog/publish-release.ts';

const accountId='a'.repeat(32),databaseId=uuid(9999),manifest='b'.repeat(64),asset='/images/gift-placeholder.svg';
const svg='<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>';
const grant=value=>({basis:'owned',value,reference:'ROOT approved exact synthetic value; no real rights claim'});
const same=(a,b)=>assert.equal(canonicalJson(a),canonicalJson(b));
function assertIndexedProjectionQueries(queries,schema){
  const script=`import sys,json,sqlite3
v=json.load(sys.stdin)
c=sqlite3.connect(':memory:',cached_statements=0)
c.executescript(v['schema'])
c.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,100)
template=next(r for r in json.loads(v['queries'][0]['params'][0]) if r['source_facts_hash'] is None)
rows=[]
for i in range(2359):
  r=dict(template,public_id='fixture-'+str(i),product_id='product-'+str(i),slug='slug-'+str(i))
  rows.append(r)
keys=list(template)
c.executemany('INSERT INTO catalog_public_products('+','.join(keys)+') VALUES('+','.join('?' for _ in keys)+')',[[r[k] for k in keys] for r in rows])
report=[]
for query in v['queries']:
  sql=query['sql']; params=[json.dumps(rows[:20],separators=(',',':')),template['catalog_revision'],20]
  old=sql.replace(' e CROSS JOIN catalog_public_products p',' e JOIN catalog_public_products p')
  assert old!=sql
  plans={name:[r[3] for r in c.execute('EXPLAIN QUERY PLAN '+text,params)] for name,text in [('old',old),('new',sql)]}
  p=next(i for i,r in enumerate(plans['new']) if r.startswith('SEARCH p '))
  e=next(i for i,r in enumerate(plans['new']) if r.startswith('SCAN e '))
  assert e<p,plans
  assert any(k+'=?' in plans['new'][p] for k in ['public_id','product_id','slug']),plans
  old_pouter=next(i for i,r in enumerate(plans['old']) if r.startswith('SEARCH p '))<next(i for i,r in enumerate(plans['old']) if r.startswith('SCAN e '))
  costs={}
  for name,text in [('old',old),('new',sql)]:
    ticks=[0]
    def progress(): ticks[0]+=1; return 0
    c.set_progress_handler(progress,100)
    assert c.execute(text,params).fetchone()[0]=='true'
    c.set_progress_handler(None,0)
    costs[name]=ticks[0]*100
  assert costs['new']<10000,costs
  if old_pouter: assert costs['old']>costs['new']*50,costs
  assert c.execute(sql,[json.dumps(list(reversed(rows[:20]))),params[1],20]).fetchone()[0]=='true'
  for change in ['value','partial']:
    chunk=[dict(r) for r in rows[:20]]
    if change=='value': chunk[0]['description']='different'
    else: chunk=chunk[:-1]
    try: c.execute(sql,[json.dumps(chunk),params[1],20]).fetchone()
    except sqlite3.Error: pass
    else: raise AssertionError('projection drift was accepted')
  report.append({'steps':costs,'plan':plans['new']})
print(json.dumps(report))`;
  return JSON.parse(execFileSync('python3',['-c',script],{input:JSON.stringify({schema,queries}),encoding:'utf8',timeout:10000,maxBuffer:1024*1024}));
}
async function fixture(t,{count=12,afterExpiry=false,merchant=false}={}){
  const f=await setup(t,{providerIdentity:`cloudflare:${accountId}:${scope.indexName}`,merchant});
  if(afterExpiry)f.advance(Date.parse(f.revision.snapshot.products[0].eligibleUntil)-f.now().getTime()+3600000);
  let statements=0,requests=0,maxRequest=0,maxResponse=0,loseSeal=false,inspect;const queryText=[],queryWire=[];
  const ledger={httpRequests:0,sqlStatements:0,knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:0},dbScope={accountId,databaseId,databaseName:'permanent-freeze'};
  // Explicit LOCAL fixture profile covers genuine union+installer+freeze/replay;
  // synthetic usage is not account evidence or authorization for any live run.
  const budget=createOneTimeMigrationBudget({scope:dbScope,ledgerAtObservation:ledger,observations:[{accountId,utcDay:f.now().toISOString().slice(0,10),
    capturedAt:f.now().toISOString(),coverage:'account-wide',resources:[databaseId],rowsRead:0,rowsWritten:0,evidenceSha256:'a'.repeat(64)}],
    required:{requests:10000,statements:25000,rowsRead:2000000,rowsWritten:85000,evidenceSha256:'b'.repeat(64)}},f.now());
  const send=async(url,init)=>{requests++;assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}${init.method==='POST'?'/query':''}`);
      if(init.method==='GET')return Response.json({success:true,result:{uuid:databaseId,name:'permanent-freeze',read_replication:{mode:'disabled'}}});
      const {batch}=JSON.parse(init.body);inspect?.(batch);assert.ok(batch.length<=50);statements+=batch.length;queryText.push(...batch.map(q=>q.sql));
      queryWire.push(...batch.filter(q=>q.sql.includes('FROM json_each(?) e CROSS JOIN catalog_public_products p')));
      maxRequest=Math.max(maxRequest,Buffer.byteLength(init.body));assert.ok(maxRequest<=512*1024);f.sql.exec('BEGIN');let result;
      try{result=batch.map(q=>{assert.ok(q.params.length<=100);const before=f.sql.prepare('SELECT total_changes() n').get().n;
        const rows=f.sql.prepare(q.sql).all(...q.params).map(r=>({...r}));return{success:true,results:rows,meta:{served_by_primary:true,
          rows_read:rows.length,rows_written:f.sql.prepare('SELECT total_changes() n').get().n-before}};});f.sql.exec('COMMIT');}
      catch(error){f.sql.exec('ROLLBACK');throw error;}
      if(loseSeal&&batch.some(q=>q.sql.startsWith('INSERT INTO catalog_projection_receipts'))){loseSeal=false;throw new Error('synthetic committed seal ACK loss');}
      const bytes=JSON.stringify({success:true,result});maxResponse=Math.max(maxResponse,Buffer.byteLength(bytes));assert.ok(maxResponse<=512*1024);return new Response(bytes);};
  const makeDb=(initial=ledger)=>createCatalogD1MigrationRest({accountId,databaseId,databaseName:'permanent-freeze',token:'FIXTURE_ONLY',budget,ledger:initial,now:f.now,
    accounting:{scope:dbScope,initial,async reserve(){},async settle(){}},fetch:send});
  const makeNextDayDb=(limits={requests:800})=>createCatalogD1Rest({accountId,databaseId,databaseName:'permanent-freeze',token:'FIXTURE_ONLY',limits,
    accounting:{scope:dbScope,initial:ledger,async reserve(){},async settle(){}},fetch:send});
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
  return{...f,db,makeDb,makeNextDayDb,request,owner:freezing,metrics,queryText,queryWire,inspect(fn){inspect=fn;},loseSeal(){loseSeal=true;}};
}
// The real executor starts from its accepted receipt and exact activating claim.
// All D1 SQL/native bytes are real fixture data; only external HTTP is simulated.
async function resolveThroughExecutor(t,f,db,revision,build,publication,permit,plan,intent,expected='published'){
  const sourceRoot=await realpath(fileURLToPath(new URL('..',import.meta.url))),version=permit.versionReference;
  const config={schemaVersion:1,...scope,accountId,workerName:'permanent-fixture',database:{id:databaseId,name:'permanent-freeze'},
    codeSha:revision.request.codeSha,sourceMode:'preview',sourceRoot,releaseId:intent.releaseId,
    identityOrigin:'https://permanent-fixture.example.invalid',compatibilityDate:'2026-10-20',
    prior:{directory:null,manifestSha256:JSON.parse(revision.priorRow.manifest_json).manifestSha256,
      releaseId:'original-release',versionReference:uuid(8000)}};
  const control={schemaVersion:1,configSha256:sha256(canonicalJson(config)),requestId:build.requestId,runReference:build.runReference,
    stage:'activating',build,publication,intent,permit,vectorPlan:plan,packageSha256:'a'.repeat(64),
    uploadMarker:'fixture-upload',versionReference:version,deploymentMarker:'fixture-deployment',deploymentId:uuid(8002)};
  let checkpoint={sha256:'0'.repeat(64),checkpoint:{phase:'attention',owner:permit.mutationOwner,pins:{},control:{publication:control}}};
  const workspace={directory:sourceRoot,repository:sourceRoot,manifest:{codeSha:config.codeSha},async assertHeld(){},
    assertScope(actual){assert.deepEqual(actual,{accountId,...scope,databaseId,databaseName:'permanent-freeze',workerName:config.workerName});},
    async readCheckpoint(){return structuredClone(checkpoint);},async writeControlCheckpoint(expected,value){
      assert.equal(expected,checkpoint.sha256);checkpoint={sha256:sha256(canonicalJson(value)),checkpoint:value};},
    async putArtifact(value){return{sha256:sha256(canonicalJson(value))};}};
  const timer=globalThis.setTimeout,clear=globalThis.clearTimeout,timers=new Set();let timed=false,scans=0,nativeReads=0,shortSql=0;
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{const id=timer(fn,ms,...args);if(ms===30000){timers.add(id);timed=true;}return id;});
  t.mock.method(globalThis,'clearTimeout',id=>{if(timers.delete(id))timed=false;return clear(id);});
  f.inspect(batch=>{for(const q of batch){if(q.sql.includes('permanent_freeze_changed')){assert.equal(timed,false,'Full source/projection proof must precede the short resolver window');scans++;}
    if(timed)shortSql++;}});
  const response=result=>Response.json({success:true,result});
  const send=async(input,init={})=>{const url=new URL(input);assert.notEqual(init.method,'PUT');
    if(url.origin===config.identityOrigin)return Response.json({release_id:intent.releaseId,code_sha:intent.codeSha,
      catalog_revision:intent.catalogRevision,catalog_snapshot_sha256:intent.catalogSnapshotSha256,manifest_sha256:intent.manifestSha256});
    assert.equal(url.origin,'https://api.cloudflare.com');
    if(url.pathname.endsWith(`/d1/database/${databaseId}`))return response({uuid:databaseId,name:'permanent-freeze',read_replication:{mode:'disabled'}});
    if(url.pathname.endsWith(`/indexes/${scope.indexName}`))return response({name:scope.indexName,config:{dimensions:1536,metric:'cosine'}});
    if(url.pathname.endsWith('/deployments')){assert.equal(init.method,'GET');return response({deployments:[{id:uuid(8002),versions:[{version_id:version,percentage:100}],annotations:{'workers/message':control.deploymentMarker}}]});}
    assert.ok(url.pathname.endsWith('/get_by_ids'));assert.equal(timed,true);nativeReads++;
    const vectors=JSON.parse(init.body).ids.map(id=>f.index.get(id)).filter(Boolean);
    return new Response(`{"success":true,"result":[${vectors.map(v=>`{"id":${JSON.stringify(v.id)},"values":[${v.values.map(n=>Object.is(n,-0)?'-0':n).join(',')}],"metadata":${JSON.stringify(v.metadata)}}`).join(',')}]}`);
  };
  try{const result=await executePublication({db,owner:permit.mutationOwner,revision,permanent:revision,requestId:build.requestId,
    runReference:build.runReference,workspace,config,credentials:{cloudflareToken:'FIXTURE_ONLY'},
    dependencies:{fetch:send,command:async()=>assert.fail('Receipt resolution must not build/upload/activate'),now:f.now}});
    assert.equal(result.state,expected,JSON.stringify(result));
    if(expected==='published'){assert.ok(scans>100);assert.ok(nativeReads>0&&shortSql>0);
      assert.equal(checkpoint.checkpoint.control.publication.stage,'published');}
    return{scans,nativeReads,shortSql};
  }finally{f.inspect(undefined);t.mock.restoreAll();}
}
test('ordinary permanent executor keeps source, held, projection, prior, native and exact-owner drift fenced before resolution',async t=>{
  const f=await fixture(t,{afterExpiry:true}),prepared=await preparePermanentCatalog(f.db,f.owner,f.request),r=prepared.revision,
    queued=await settlePermanentCatalog(f.db,prepared.owner,r,f.adapters),build=await claimBuildRequest(f.db,queued.requestId,'fixture:bulk-build',f.now()),
    intent={releaseId:'permanent-drift',catalogRevision:r.snapshot.catalogRevision,codeSha:r.request.codeSha,
      catalogSnapshotSha256:r.packet.receipt.snapshot_sha256,manifestSha256:'a'.repeat(64),vectorSyncWatermark:0,priorReleaseId:'original-release',nextExpiry:null};
  await enqueuePublication(f.db,r.snapshot,intent,f.now());const publication=await claimPublication(f.db,r.snapshot,intent.releaseId,f.now());
  await recordPublicationDispatch(f.db,r.snapshot,publication,`version:${uuid(8001)}`,f.now());
  const permit=await beginBuildActivation(f.db,build,r.snapshot,publication,uuid(8001),async()=>({environment:scope.environment,settled:true,
    active:{...f.original.intent,versionReference:f.original.permit.versionReference}}),f.now(),queued.owner),plan=prunedVectorPlan(r),
    control={catalogRevision:r.snapshot.catalogRevision,planSha256:sha256(canonicalJson(plan)),ids:prunedVectorIds(plan)};
  await completePublication(f.db,r.snapshot,intent.releaseId,publication.token,async()=>intent,f.now,permit.mutationOwner);
  for(const fault of ['source','held','projection','prior','native','owner'])await t.test(fault,async t=>{
    const id=fault==='held'?uuid(9):uuid(1),row=f.sql.prepare('SELECT * FROM products WHERE public_id=?').get(id),candidate=structuredClone(r);
    if(fault==='source'||fault==='held')f.sql.prepare("UPDATE products SET tags='changed' WHERE public_id=?").run(id);
    if(fault==='projection'){
      assert.throws(()=>f.sql.prepare("UPDATE catalog_public_products SET description='changed' WHERE catalog_revision=? AND public_id=?").run(r.snapshot.catalogRevision,uuid(1)),/immutable/);
      candidate.packet.rows[0].description='changed';
    }
    if(fault==='prior')f.sql.prepare("UPDATE publication_receipts SET code_sha=? WHERE release_id='original-release'").run('0'.repeat(40));
    if(fault==='native')f.index.get(uuid(1)).values[0]=0;
    if(fault==='owner')f.sql.prepare('UPDATE catalog_mutation_scopes SET captured_at=?').run(new Date(f.now().getTime()+1).toISOString());
    try{const proof=await resolveThroughExecutor(t,f,f.db,candidate,build,publication,permit,control,intent,'pending');
      if(fault!=='native')assert.equal(proof.nativeReads,0);
      assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests WHERE request_id=?').get(build.requestId).state,'activating');
      assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'activating');
    }finally{
      f.sql.prepare('UPDATE products SET tags=? WHERE public_id=?').run(row.tags,id);
      f.sql.prepare("UPDATE publication_receipts SET code_sha=? WHERE release_id='original-release'").run(f.original.intent.codeSha);
      f.index.get(uuid(1)).values[0]=-0;f.sql.prepare('UPDATE catalog_mutation_scopes SET captured_at=?').run(permit.mutationOwner.capturedAt);
    }
  });
});
test('permanent receipt owns full rows; concrete native observation remains exact-permit fenced and accepted resolution survives cutoff',async t=>{
  const f=await fixture(t,{afterExpiry:true}),prepared=await preparePermanentCatalog(f.db,f.owner,f.request),r=prepared.revision,
    q=await settlePermanentCatalog(f.db,prepared.owner,r,f.adapters),build=await claimBuildRequest(f.db,q.requestId,'fixture:boundary',f.now()),
    intent={releaseId:'permanent-boundary',catalogRevision:r.snapshot.catalogRevision,codeSha:r.request.codeSha,
      catalogSnapshotSha256:r.packet.receipt.snapshot_sha256,manifestSha256:'a'.repeat(64),vectorSyncWatermark:0,priorReleaseId:'original-release',nextExpiry:null};
  await enqueuePublication(f.db,r.snapshot,intent,f.now());const pub=await claimPublication(f.db,r.snapshot,intent.releaseId,f.now());
  await recordPublicationDispatch(f.db,r.snapshot,pub,'version:fixture:boundary',f.now());
  const permit=await beginBuildActivation(f.db,build,r.snapshot,pub,'fixture:boundary',async()=>({environment:scope.environment,settled:true,
    active:{...f.original.intent,versionReference:f.original.permit.versionReference}}),f.now(),q.owner),plan=prunedVectorPlan(r),
    control={catalogRevision:r.snapshot.catalogRevision,planSha256:sha256(canonicalJson(plan)),ids:prunedVectorIds(plan)},
    read=(p=permit,c=control,a=f.adapters)=>readActivatedPermanentCatalogNative(f.db,p,c,r,a);
  await read();await assert.rejects(read({...permit,token:uuid(999)}));
  await assert.rejects(read(permit,{...control,ids:control.ids.slice(1)}));
  await assert.rejects(read({...permit,mutationOwner:{...permit.mutationOwner,generation:permit.mutationOwner.generation+1}}));
  const tags=f.sql.prepare('SELECT tags FROM products WHERE public_id=?').get(uuid(9)).tags;
  f.sql.prepare("UPDATE products SET tags='held drift' WHERE public_id=?").run(uuid(9));
  await assert.rejects(readActivatedCatalogVectors(f.db,permit,control,f.adapters,{permanent:r}));
  f.sql.prepare('UPDATE products SET tags=? WHERE public_id=?').run(tags,uuid(9));
  f.advance(16*60000);let once=false;
  const drift={...f.adapters,async readback(id,signal){const value=await f.adapters.readback(id,signal);if(!once){once=true;
    f.sql.prepare("UPDATE products SET tags='late held drift' WHERE public_id=?").run(uuid(9));}return value;}};
  await assert.rejects(completeActivatedPermanentPublication(f.db,r,pub,permit,async()=>{await read(permit,control,drift);return intent;},f.now));
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts WHERE release_id=?').get(intent.releaseId).n,0);
  f.sql.prepare('UPDATE products SET tags=? WHERE public_id=?').run(tags,uuid(9));
  f.advance(Date.parse(r.request.context.cutoff)-f.now().getTime()+1);const writes=f.dispatches();
  await assert.rejects(assertPermanentCatalog(f.db,q.owner,r));
  await assert.rejects(assertPermanentCatalog(f.db,permit.mutationOwner,r,{...permit,token:uuid(999)}));
  await assertPermanentCatalog(f.db,permit.mutationOwner,r,permit);
  const start=f.queryText.length;
  await completeActivatedPermanentPublication(f.db,r,pub,permit,async()=>{await read();return intent;},f.now);
  // Both complete row scans retain boundary visibility gates and final receipt
  // gates, but never repeat the full visibility scan in each source byte-page.
  const visibility=f.queryText.slice(start).filter(sql=>sql.includes('catalog_revisions c JOIN catalog_projection_receipts r')).length;
  assert.equal(visibility,7);
  await assertPermanentCatalog(f.db,permit.mutationOwner,r,permit);
  assert.equal(await resolveBuildActivation(f.db,permit,async()=>{await read();return{environment:scope.environment,settled:true,
    active:{...intent,versionReference:permit.versionReference}};}),'resolved');
  assert.equal(f.dispatches(),writes);assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
  const projectionQueries=f.queryWire.filter(q=>q.sql.includes('FROM json_each(?) e CROSS JOIN catalog_public_products p')),
    first=projectionQueries.find(q=>q.sql.includes('ON p.catalog_revision=? AND p.public_id=')),
    second=projectionQueries.find(q=>q.sql.includes('ON p.catalog_revision=?\n'));
  assert.ok(first&&second,'Both actual generated bulk projection SQL templates were captured');
  const schema=f.sql.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND tbl_name='catalog_public_products' AND type IN('table','index') ORDER BY type='index'").all().map(r=>r.sql+';').join('\n');
  t.diagnostic(JSON.stringify({fixture:'actual two SQL templates,2359 local projections; not D1 billed rows',cost:assertIndexedProjectionQueries([first,second],schema)}));
});
test('pure permanent source proof may read past dispatch cutoff but cannot authorize ordinary settlement',async t=>{
  const f=await fixture(t,{afterExpiry:true}),prepared=await preparePermanentCatalog(f.db,f.owner,f.request),before=f.sql.prepare('SELECT total_changes() n').get().n;
  f.advance(Date.parse(prepared.revision.request.context.cutoff)-f.now().getTime()+1);
  await assertPermanentCatalog(f.db,prepared.owner,prepared.revision);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
  await assert.rejects(settlePermanentCatalog(f.db,prepared.owner,prepared.revision,f.adapters));
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
});
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
  await recordPublicationDispatch(f.db,revision.snapshot,publication,`version:${uuid(8001)}`,f.now());
  const permit=await beginBuildActivation(f.db,build,revision.snapshot,publication,uuid(8001),async()=>({environment:scope.environment,settled:true,
    active:{...f.original.intent,versionReference:f.original.permit.versionReference}}),f.now(),queued.owner);
  const control={catalogRevision:'permanent',planSha256:sha256(canonicalJson(plan)),ids:prunedVectorIds(plan)};
  let activeDb=f.db,observations=0;const observe=async()=>{observations++;return readActivatedPermanentCatalogNative(activeDb,permit,control,revision,f.adapters);};
  await assert.rejects(completePublication(f.db,revision.snapshot,intent.releaseId,publication.token,async()=>{await observe();throw new Error('Synthetic active version read ACK lost');},f.now,permit.mutationOwner));
  f.advance(16*60000);const beforeReopen=f.db.metrics();activeDb=await f.makeDb({httpRequests:beforeReopen.requests,sqlStatements:beforeReopen.statements,
    knownRowsRead:beforeReopen.reportedRowsRead,knownRowsWritten:beforeReopen.reportedRowsWritten,unconfirmedRequests:beforeReopen.unconfirmedRequests});
  assert.ok(activeDb.metrics().requests>beforeReopen.requests);assert.ok(Buffer.byteLength(JSON.stringify(revision.packet.rows))>512*1024);
  await assert.rejects(completeActivatedPublication(activeDb,revision,publication,permit,async()=>{assert.fail('ordinary10/20 guard widened');},f.now),/publication_activation_fenced/);
  const callbacks=observations;await completeActivatedPermanentPublication(activeDb,revision,publication,permit,async()=>{await observe();return intent;},f.now);
  assert.ok(observations>callbacks);assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='permanent-release'").get().n,1);
  await assertPermanentCatalog(activeDb,permit.mutationOwner,revision,permit);
  const resolver=await resolveThroughExecutor(t,f,activeDb,revision,build,publication,permit,control,intent);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');assert.equal(canonicalJson([...f.index]),native);
  const end=f.metrics(),cost=(a,b)=>({requests:b.requests-a.requests,statements:b.statements-a.statements});
  t.diagnostic(JSON.stringify({fixture:'LOCAL REST+SQLite only; not provider acceptance',prepare:cost(start,sealed),settle:cost(sealed,settled),
    extraProofAndReplay:cost(settled,repeated),publicationThroughIdle:cost(repeated,end),freezeThroughIdle:cost(start,end),wire:end,resolver}));
});
test('current overlay keeps original clock; source/history/receipt/native/owner drift refuses and ordinary cutoff stays enforced',async t=>{
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
  assert.equal(f.dispatches(),before);same(original,prepared.revision);f.advance(2*3600000);
  await assertPermanentCatalog(f.db,prepared.owner,original); // Read proof is not dispatch authority.
  await assert.rejects(settlePermanentCatalog(f.db,prepared.owner,original,f.adapters));
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
test('restoring existing photos after permanent publication preserves original native proof and all source/history',async t=>{
  const f=await fixture(t,{merchant:true}),first=await preparePermanentCatalog(f.db,f.owner,f.request),r=first.revision;
  const q=await settlePermanentCatalog(f.db,first.owner,r,f.adapters),build=await claimBuildRequest(f.db,q.requestId,'fixture:first',f.now());
  const intent={releaseId:'permanent-release',catalogRevision:r.snapshot.catalogRevision,codeSha:r.request.codeSha,
    catalogSnapshotSha256:r.packet.receipt.snapshot_sha256,manifestSha256:'a'.repeat(64),vectorSyncWatermark:0,priorReleaseId:'original-release',nextExpiry:null};
  await enqueuePublication(f.db,r.snapshot,intent,f.now());const pub=await claimPublication(f.db,r.snapshot,intent.releaseId,f.now());
  await recordPublicationDispatch(f.db,r.snapshot,pub,'version:fixture:first',f.now());
  const permit=await beginBuildActivation(f.db,build,r.snapshot,pub,'fixture:first',async()=>({environment:scope.environment,settled:true,
    active:{...f.original.intent,versionReference:f.original.permit.versionReference}}),f.now(),q.owner),nativePlan=prunedVectorPlan(r);
  const read=()=>readActivatedCatalogVectors(f.db,permit,{catalogRevision:r.snapshot.catalogRevision,planSha256:sha256(canonicalJson(nativePlan)),
    ids:prunedVectorIds(nativePlan)},f.adapters,{permanent:r});
  f.advance(1); // Distinguish this receipt from the original fixture's same-clock publication.
  await completePublication(f.db,r.snapshot,intent.releaseId,pub.token,async()=>{await read();return intent;},f.now,permit.mutationOwner);
  assert.equal(await resolveBuildActivation(f.db,permit,async()=>{await read();return{environment:scope.environment,settled:true,
    active:{...intent,versionReference:permit.versionReference}};}),'resolved');
  f.advance(Date.parse(r.snapshot.products[0].eligibleUntil)-f.now().getTime()+3600000);
  f.db=await f.makeNextDayDb(); // Fresh UTC-day fixture client; never extend the original migration profile.
  const receipt={...f.sql.prepare("SELECT * FROM publication_receipts WHERE release_id='permanent-release'").get()};
  const owner=await claimMutationOwnership(f.db,scope,{phase:'writing',ownerReference:'restore',operationKey:sha256('restore')});
  const captured=await captureOwnedD1({db:f.db,owner,reference:'Fresh owner-authorized restoration',stoppedWriters:[
    {id:'daily',kind:'application',codePaths:['scripts/catalog/run-cloudflare-weekly.ts'],reference:'Synthetic stopped job',stoppedAt:f.now().toISOString()},
    {id:'operator',kind:'operator',codePaths:[],reference:'Synthetic sole operator',stoppedAt:f.now().toISOString()}]});
  const current=permanentBaselineCurrent(captured.capture),old=r.request.installation.plan.input;
  const assembler={...old.assembler,now:f.now(),placeholder:{...old.assembler.placeholder,bytes:Buffer.from(old.assembler.placeholder.bytesBase64,'base64')},
    existingDisplayReference:'owner-confirmed-existing-dataset:fixture',approvedRightsById:structuredClone(old.assembler.approvedRightsById)};
  for(const p of current)for(const [field,value]of Object.entries({title:p.title,description:p.description||p.wittyDescription||p.title,imageUrl:p.imageUrl,
    punnyTitle:p.punnyTitle,wittyDescription:p.wittyDescription,editorialWriteup:p.editorialWriteup,...(p.humorTags?.length?{humorTags:JSON.stringify(p.humorTags)}:{})}))
    if(typeof value==='string'&&value.trim())assembler.approvedRightsById[p.id][field]={basis:'licensed',value,reference:assembler.existingDisplayReference};
  const proposal=assemblePermanentBaseline(old.evidence,current,assembler),installation=preparePermanentDisplayPlan({capture:captured.capture,
    captureSha256:captured.captureSha256,owner,evidence:old.evidence,assembler,priorPublication:{releaseId:intent.releaseId,receiptSha256:sha256(canonicalJson(receipt))},
    approvedProposal:{value:proposal,sha256:sha256(canonicalJson(proposal)),reference:assembler.existingDisplayReference}}),cursor={current:owner};
  const native=canonicalJson([...f.index]),dispatches=f.dispatches();
  await applyPermanentDisplayPlan({db:f.db,plan:installation.plan,planSha256:installation.sha256,ownerCursor:cursor,
    cooperativeCapture:{receipt:captured.receipt,sha256:captured.receiptSha256}});
  await releaseMutationOwnership(f.db,cursor.current);
  const request={...r.request,catalogRevision:'restored',previous:r.snapshot,preserveSupplierPhotos:false,
    context:{...r.request.context,envelopeSha256:sha256(`${JSON.stringify(createSealedSnapshotEnvelope(r.snapshot))}\n`),snapshotSha256:r.packet.receipt.snapshot_sha256,
      projectionSha256:r.packet.receipt.projection_sha256,sourceExportSha256:r.sourceDigest,vectorSyncWatermark:0,publicationReceiptWatermark:3,
      cutoff:new Date(f.now().getTime()+3600000).toISOString(),priorPublication:{releaseId:intent.releaseId,receiptSha256:sha256(canonicalJson(receipt))}},
    installation:{...installation,capture:{receipt:captured.receipt,sha256:captured.receiptSha256}}};
  const freezing=await claimMutationOwnership(f.db,scope,{phase:'freezing',ownerReference:'restore',operationKey:permanentCatalogOperationKey(request)});
  const restored=await preparePermanentCatalog(f.db,freezing,request);
  assert.equal(restored.revision.snapshot.products.length,r.snapshot.products.length);
  assert.ok(restored.revision.snapshot.products.every(p=>p.eligibleUntil===null&&p.imageUrl.startsWith('https://')));
  await assert.rejects(readHistoricalNativePreservation({db:f.db,owner:restored.owner,native:request.native,current:restored.revision.sourceRows,
    original:captured.capture.tables.products,adapters:f.adapters}),/vector_preserved_source_changed/);
  assert.equal((await settlePermanentCatalog(f.db,restored.owner,restored.revision,f.adapters)).state,'build_queued');
  const bad=structuredClone(restored.revision);bad.request.installation.plan.input.capture.tables.products[0].source_query='forged';
  await assert.rejects(readPermanentNativeProof({db:f.db,owner:restored.owner,revision:bad,adapters:f.adapters}));
  same([...f.index],JSON.parse(native));assert.equal(Object.is(f.index.get(uuid(1)).values[0],-0),true);assert.equal(f.dispatches(),dispatches);
  const p=f.index.get(uuid(1));p.values[0]=0;
  await assert.rejects(readPermanentNativeProof({db:f.db,owner:restored.owner,revision:restored.revision,adapters:f.adapters}));p.values[0]=-0;
});
test('body-free published bulk seal survives old body expiry; empty/one/thirty changes preserve original identity/native history',async t=>{
  for(const changed of [0,1,30])await t.test(changed?`${changed} genuine curation changes`:'changes:[]',async t=>{
    const count=changed===30?40:12;
    const f=await fixture(t,{merchant:true,count}),prepared=await preparePermanentCatalog(f.db,f.owner,f.request),r=prepared.revision;
    const q=await settlePermanentCatalog(f.db,prepared.owner,r,f.adapters),build=await claimBuildRequest(f.db,q.requestId,'fixture:bulk',f.now());
    const intent={releaseId:'permanent-release',catalogRevision:r.snapshot.catalogRevision,codeSha:r.request.codeSha,catalogSnapshotSha256:r.packet.receipt.snapshot_sha256,
      manifestSha256:'a'.repeat(64),vectorSyncWatermark:0,priorReleaseId:'original-release',nextExpiry:null};
    await enqueuePublication(f.db,r.snapshot,intent,f.now());const pub=await claimPublication(f.db,r.snapshot,intent.releaseId,f.now());
    await recordPublicationDispatch(f.db,r.snapshot,pub,'version:fixture:permanent',f.now());
    const permit=await beginBuildActivation(f.db,build,r.snapshot,pub,'fixture:permanent',async()=>({environment:scope.environment,settled:true,
      active:{...f.original.intent,versionReference:f.original.permit.versionReference}}),f.now(),q.owner),plan=prunedVectorPlan(r);
    const read=()=>readActivatedCatalogVectors(f.db,permit,{catalogRevision:r.snapshot.catalogRevision,planSha256:sha256(canonicalJson(plan)),ids:prunedVectorIds(plan)},f.adapters,{permanent:r});
    await completePublication(f.db,r.snapshot,intent.releaseId,pub.token,async()=>{await read();return intent;},f.now,permit.mutationOwner);
    assert.equal(await resolveBuildActivation(f.db,permit,async()=>{await read();return{environment:scope.environment,settled:true,active:{...intent,versionReference:permit.versionReference}};}),'resolved');
    const receipt={...f.sql.prepare("SELECT * FROM publication_receipts WHERE release_id='permanent-release'").get()},seal=createPermanentCatalogSeal(r,{releaseId:intent.releaseId,receiptSha256:sha256(canonicalJson(receipt))});
    assert.ok(r.snapshot.products.slice(0,8).every(p=>p.persistent&&p.eligibleUntil!==null));
    assert.doesNotMatch(JSON.stringify(seal),/source_record_json|supplier\.invalid|example\.invalid|embedding_native_base64|rights_json|editorialWriteup/);
    // New UTC day, separate normal routine accounting; old migration/profile
    // counters remain retained, never extended or reset. No merchant/model call.
    f.advance(Date.parse(r.snapshot.products[0].eligibleUntil)-f.now().getTime()+3600000);
    // Local mechanism coverage only: the routine2359 capacity proof is separate.
    f.db=await f.makeNextDayDb(changed===30?{requests:2000,statements:10000}:undefined);
    const native=canonicalJson([...f.index]),writing=await claimMutationOwnership(f.db,scope,{phase:'writing',ownerReference:'future-day',operationKey:sha256('future-day')}),cursor={current:writing};
    const previous=await reconstructPermanentSnapshot(f.db,writing,seal);same(previous,r.snapshot);const changes=[];
    if(changed){const store=createD1CatalogMaintenanceStore({db:f.db,owner:writing,ownerCursor:cursor,runId:'future-day',catalogRevision:'future-day',
      intent:()=>({reviewedDeleteReference:'Synthetic genuine curation duplicate review, never elapsed expiry'})});
      for(let index=11;index<11+changed;index++){
        await store.markCatalogDuplicate(`B${String(index).padStart(9,'0')}`,'B000000001','Synthetic explicit duplicate review');
        const event=f.sql.prepare("SELECT sequence FROM vector_sync_outbox WHERE source_revision='future-day' AND status='pending' ORDER BY sequence LIMIT 1").get();
        for(let n=0;n<2;n++){const delivered=await deliverOwnedOutboxEvent({db:f.db,owner:cursor.current,sequence:event.sequence,catalogRevision:'future-day',adapters:f.adapters,loadPayload:e=>loadMaintenanceVectorPayload(f.db,e)});
          cursor.current=delivered.owner;if(delivered.state==='complete')break;}
        const product={...f.sql.prepare('SELECT * FROM products WHERE public_id=?').get(uuid(index))},operation=f.sql.prepare("SELECT * FROM catalog_maintenance_operations WHERE run_id='future-day' ORDER BY next_epoch DESC LIMIT 1").get();
        changes.push({publicId:uuid(index),operationId:operation.operation_id,inputSha256:operation.input_sha256,productSha256:sha256(canonicalJson(product)),displaySha256:sha256(product.public_display_json??'null')});}}
    await releaseMutationOwnership(f.db,cursor.current);
    const approval={schemaVersion:1,runId:'future-day',catalogRevision:'future-day',changes},approvalSha256=sha256(canonicalJson(approval));
    const request={scope,codeSha:'8'.repeat(40),previous,approval,approvalSha256,context:{...f.request.context,envelopeSha256:sha256(`${JSON.stringify(createSealedSnapshotEnvelope(previous))}\n`),
      snapshotSha256:r.packet.receipt.snapshot_sha256,projectionSha256:r.packet.receipt.projection_sha256,sourceExportSha256:r.sourceDigest,vectorSyncWatermark:0,
      cutoff:new Date(f.now().getTime()+3600000).toISOString(),
      publicationReceiptWatermark:3,priorPublication:{releaseId:intent.releaseId,receiptSha256:sha256(canonicalJson(receipt))}}};
    const owner=await claimMutationOwnership(f.db,scope,{phase:'freezing',ownerReference:'future-day',operationKey:approvedCohortOperationKey(request)});
    const proof=await readPermanentCatalogPrior({db:f.db,owner,seal,approval,approvalSha256,adapters:f.adapters});assert.equal(proof.state,'verified');
    assert.equal(proof.preservedIds.length,8);assert.deepEqual(proof.changedIds,changes.map(c=>c.publicId));
    assert.equal(OWNED_VECTOR_PROOF_LIMIT,20);
    if(changed===30){const beyond={...approval,changes:[...changes,{...changes[0],publicId:uuid(41)}]};
      await assert.rejects(readPermanentCatalogPrior({db:f.db,owner,seal,approval:beyond,approvalSha256:sha256(canonicalJson(beyond)),adapters:f.adapters}));
      await assert.rejects(readHistoricalNativePreservation({db:f.db,owner,native:r.nativePreservation,current:r.sourceRows,
        changedIds:beyond.changes.map(c=>c.publicId),adapters:f.adapters}),/vector_preserved_input_invalid/);}
    const daily=await prepareApprovedCohort(f.db,owner,request);assert.equal(daily.revision.snapshot.products.length,count-2-changed);
    assert.ok(daily.revision.snapshot.products.every(p=>p.eligibleUntil===null));assert.doesNotMatch(JSON.stringify(daily.revision.snapshot),/example\.invalid|supplier\.invalid/);
    assert.equal(daily.revision.snapshot.heldProducts.length,2+changed);assert.equal(approvedCohortVectorPlan(daily.revision).products.length,0);
    assert.ok(Object.is(f.index.get(uuid(1)).values[0],-0));assert.equal(canonicalJson([...f.index]),native);
    for(const mutate of [s=>s.inventory[0].productSha256='0'.repeat(64),s=>s.control.native.source.deliverySha256='0'.repeat(64),s=>s.publication.receiptSha256='0'.repeat(64)]){
      const bad=structuredClone(seal);mutate(bad);await assert.rejects(readPermanentCatalogPrior({db:f.db,owner:daily.owner,seal:bad,approval,approvalSha256,adapters:f.adapters}));}
    if(!changed){const observe=()=>readPermanentCatalogPrior({db:f.db,owner:daily.owner,seal,approval,approvalSha256,adapters:f.adapters});
      const held=f.sql.prepare('SELECT tags FROM products WHERE public_id=?').get(uuid(9));
      f.sql.prepare("UPDATE products SET tags='unapproved held drift' WHERE public_id=?").run(uuid(9));await assert.rejects(observe());
      f.sql.prepare('UPDATE products SET tags=? WHERE public_id=?').run(held.tags,uuid(9));
      f.sql.prepare('UPDATE catalog_maintenance_products SET version=version+1 WHERE product_id=?').run('B000000001');await assert.rejects(observe());
      f.sql.prepare('UPDATE catalog_maintenance_products SET version=version-1 WHERE product_id=?').run('B000000001');
      const build=f.sql.prepare("SELECT request_id,version_reference FROM catalog_build_requests WHERE release_id='permanent-release'").get();
      f.sql.prepare('UPDATE catalog_build_requests SET version_reference=? WHERE request_id=?').run('fixture:unapproved-version',build.request_id);await assert.rejects(observe());
      f.sql.prepare('UPDATE catalog_build_requests SET version_reference=? WHERE request_id=?').run(build.version_reference,build.request_id);
      f.index.get(uuid(1)).values[0]=0;await assert.rejects(observe());f.index.get(uuid(1)).values[0]=-0;
      assert.equal((await observe()).state,'verified');}
    assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'freezing');
  });
});
