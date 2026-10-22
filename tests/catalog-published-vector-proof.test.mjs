import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createProjectionPacket, projectionQueries } from '../lib/catalog/d1.ts';
import { validateCatalogSnapshot } from '../lib/catalog/snapshot.ts';
import { claimMutationOwnership, releaseMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { approvedCohortOperationKey, approvedCohortVectorPlan, prepareApprovedCohort } from '../lib/catalog/freeze-approved-cohort.ts';
import { enqueueBuildRequest, claimBuildRequest, beginBuildActivation, resolveBuildActivation } from '../lib/catalog/build-requests.ts';
import { enqueuePublication, claimPublication, recordPublicationDispatch, completePublication, completeActivatedPublication } from '../lib/catalog/publication.ts';
import { createD1CatalogMaintenanceStore, loadMaintenanceVectorPayload } from '../scripts/catalog/maintenance-d1.ts';
import { maintenanceEmbeddingText } from '../scripts/catalog/maintenance-state.ts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { createSealedSnapshotEnvelope } from '../scripts/catalog/export-d1-snapshot.ts';
import { executePublication } from '../scripts/catalog/publish-release.ts';
import { openRunWorkspace } from '../scripts/catalog/run-workspace.ts';
import { createCatalogD1Rest } from '../scripts/catalog/d1-write-rest.ts';
import { accountedPublicationFetch, accountedPublicationReadFetch } from '../scripts/catalog/publication-read-fetch.ts';
import { accountedPublicationUploadCommand } from '../scripts/catalog/publication-upload-command.ts';
import { createVectorizeRestAdapters } from '../scripts/catalog/vectorize-rest.ts';
import { createReleaseIdentity } from '../scripts/staging/release-identity.mts';
import { siteIdentityBytes } from '../scripts/staging/build.mts';
import { assembleReleaseAssets } from '../scripts/staging/retention.mts';
import { createStaticFeedPlan } from '../workers/site/feed.ts';
import { createBrowseRelease } from '../static-site/lib/browse.ts';
import { createOgRelease } from '../static-site/lib/og.ts';
import { siteIdentityFor } from '../static-site/lib/site-identity.ts';
import { guides } from '../static-site/lib/guides.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import safeCatalogPayload from '../static-site/public/safe/catalog.json' with {type:'json'};
import { deliverOwnedOutboxEvent, reuseOwnedApprovedCohortVectorProof, settleOwnedApprovedCohortVectorProof,
  publishedCatalogOperationKey, readPublishedCatalogVectors, readActivatedCatalogVectors } from '../scripts/catalog/owned-vector-delivery.ts';

const AT=Date.parse('2026-10-20T12:00:00.000Z'),at=ms=>new Date(AT+ms).toISOString();
const scope={environment:'staging',indexName:'published-proof'},source='b'.repeat(64),uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const names=['Brass lobster desk bell','Velvet mushroom reading lamp','Cosmic pickle kayak anchor','Glass cactus snow globe',
  'Rubber flamingo bath mat','Wooden octopus pencil stand','Ceramic rocket flower vase','Copper hedgehog book holder'];
const values=Array(1536).fill(Math.fround(.1));values[0]=-0;
function product(n,fresh=false){return{id:`B${String(n).padStart(9,'0')}`,title:names[n-1]??`Held fixture ${n}`,price:19.99,currency:'USD',source:'amazon',
  imageUrl:`https://example.invalid/owned-${n}.jpg`,affiliateUrl:`https://www.amazon.com/dp/B${String(n).padStart(9,'0')}?tag=fixture-20`,
  humorTags:[`fixture${n}`],punnyTitle:null,wittyDescription:`Synthetic description ${n}.`,sourceQuery:'synthetic',sourceFacts:{fixture:n,fresh},
  isActive:n<=8,qualityScore:.85,availabilityStatus:'IN_STOCK',remotelyVerified:true,editorialStatus:'generated_ready',editorialQualityScore:.95,
  editorialWriteup:Array(2).fill(Array(55).fill(`Specific useful owned editorial ${n}`).join(' ')).join('\n\n'),embedding:n<=8?[...values]:null};}
const rights=p=>Object.fromEntries(Object.entries({title:p.title,description:p.wittyDescription,imageUrl:p.imageUrl,affiliateUrl:p.affiliateUrl,
  wittyDescription:p.wittyDescription,editorialWriteup:p.editorialWriteup,humorTags:JSON.stringify(p.humorTags)})
  .map(([k,value])=>[k,{basis:'owned',reference:`test-only/${p.id}/${k}`,value}]));
async function setup(t,{providerIdentity='fixture:published-index',codeSha='f'.repeat(40),originalVersion}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');
  for(const name of(await readdir(new URL('../migrations/d1/',import.meta.url))).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort())
    sql.exec(await readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  let clock=AT,proofOnly=false;const metrics={statements:0,maxParams:0,maxRequest:0,maxResponse:0};
  sql.function('strftime',(format,instant)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(instant,'now');return new Date(clock).toISOString();});
  const db={prepare(query){let params=[];return{query,wire(){return{sql:query,params};},bind(...args){assert.ok(args.length<=100);metrics.maxParams=Math.max(metrics.maxParams,args.length);params=args;return this;},
    execute(){if(proofOnly)assert.match(query,/^SELECT /);metrics.statements++;
      metrics.maxRequest=Math.max(metrics.maxRequest,Buffer.byteLength(JSON.stringify({sql:query,params})));
      const rows=sql.prepare(query).all(...params).map(r=>({...r}));metrics.maxResponse=Math.max(metrics.maxResponse,Buffer.byteLength(JSON.stringify(rows)));return rows;},
    async all({signal}={}){signal?.throwIfAborted();return{results:this.execute()};},
    async run(){if(proofOnly)assert.fail('proof attempted mutation');const result=sql.prepare(query).run(...params);return{success:true,meta:{changes:Number(result.changes)}};}};},
    async batch(statements,{signal}={}){signal?.throwIfAborted();assert.ok(statements.length<=50);
      const bytes=Buffer.byteLength(JSON.stringify({batch:statements.map(s=>s.wire())}));metrics.maxRequest=Math.max(metrics.maxRequest,bytes);assert.ok(bytes<512*1024);sql.exec('BEGIN');
      try{const results=statements.map(s=>({results:s.execute()}));const size=Buffer.byteLength(JSON.stringify(results));assert.ok(size<512*1024);
        metrics.maxResponse=Math.max(metrics.maxResponse,size);sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const index=new Map();let dispatches=0,mode={runId:'seed',catalogRevision:'prior'},cursor={current:await claimMutationOwnership(db,scope,
    {phase:'writing',ownerReference:'seed',operationKey:'a'.repeat(64)})};
  const adapters={...scope,providerIdentity,async dispatch(input){assert.equal(proofOnly,false);dispatches++;
    if(input.vector)index.set(input.publicId,structuredClone(input.vector));else index.delete(input.publicId);return{reference:`fixture:${dispatches}`};},
    async resolve(input){return{state:'settled',reference:input.reference};},async readback(id,signal){signal.throwIfAborted();return structuredClone(index.get(id)??null);}};
  async function upsert(p){const hash=editorialSourceHash(p);p.editorialSourceHash=hash;const store=createD1CatalogMaintenanceStore({db,...mode,
    owner:cursor.current,ownerCursor:cursor,newPublicId:()=>uuid(Number(sql.prepare('SELECT count(*) n FROM products').get().n)+1),
    intent(){return{rightsById:{[p.id]:rights(p)},verificationById:{[p.id]:{reference:'fixture:observation',observedAt:at(-3600000),sourceFactsHash:hash}},
      ...(p.embedding?{embeddingById:{[p.id]:{reference:'fixture:embedding',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:hash}}}:{})};}});
    await store.upsertProduct(p,hash);}
  async function drain(){for(const r of sql.prepare("SELECT sequence FROM vector_sync_outbox WHERE status='pending' ORDER BY sequence").all()){
    const options={db,owner:cursor.current,sequence:r.sequence,catalogRevision:mode.catalogRevision,loadPayload:e=>loadMaintenanceVectorPayload(db,e),adapters};
    let result=await deliverOwnedOutboxEvent(options);cursor.current=result.owner;
    if(result.state==='pending')result=await deliverOwnedOutboxEvent({...options,owner:cursor.current});cursor.current=result.owner;assert.equal(result.state,'complete');}}
  for(let n=1;n<=10;n++)await upsert(product(n));await drain();
  const rows=sql.prepare('SELECT * FROM products ORDER BY public_id').all();
  const previous=validateCatalogSnapshot({schemaVersion:1,dataKind:'catalog',catalogRevision:'prior',generatedAt:at(0),
    products:rows.filter(r=>r.public_display_json).map(r=>JSON.parse(r.public_display_json)),heldProducts:rows.filter(r=>!r.public_display_json).map(r=>({
      id:r.id,publicId:r.public_id,slug:r.slug,path:`/gifts/${r.slug}`,title:'Gift currently unavailable',
      description:'This gift is not currently available in the curated catalog. Browse other gifts instead.',reason:'inactive'})),slugHistory:[]},new Date(clock));
  const packet=await createProjectionPacket(previous,Object.fromEntries(rows.map(r=>[r.public_id,r.source_facts_hash])),source,new Date(clock));
  sql.prepare("INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,'published')").run('prior',at(0),source);
  for(const q of projectionQueries(packet))sql.prepare(q.sql).run(...q.params);
  const priorIntent={releaseId:'prior-release',catalogRevision:'prior',codeSha:'c'.repeat(40),catalogSnapshotSha256:packet.receipt.snapshot_sha256,
    manifestSha256:'f'.repeat(64),vectorSyncWatermark:8,priorReleaseId:null,nextExpiry:previous.products[0].eligibleUntil};
  const prior={release_id:'prior-release',catalog_revision:'prior',code_sha:priorIntent.codeSha,completed_at:at(0),manifest_json:JSON.stringify(priorIntent)};
  sql.prepare('INSERT INTO publication_receipts VALUES(?,?,?,?,?)').run(...Object.values(prior));
  const context={envelopeSha256:sha256(`${JSON.stringify(createSealedSnapshotEnvelope(previous))}\n`),snapshotSha256:packet.receipt.snapshot_sha256,
    projectionSha256:packet.receipt.projection_sha256,sourceExportSha256:source,vectorSyncWatermark:8,publicationReceiptWatermark:1,cutoff:at(6*3600000),
    priorPublication:{releaseId:prior.release_id,receiptSha256:sha256(canonicalJson(prior))}};
  await releaseMutationOwnership(db,cursor.current);clock+=1000;mode={runId:'maintained',catalogRevision:'maintained'};
  cursor={current:await claimMutationOwnership(db,scope,{phase:'writing',ownerReference:'maintained',operationKey:'d'.repeat(64)})};
  for(let n=1;n<=8;n++)await upsert(product(n,true));await drain();
  const changes=Array.from({length:8},(_,i)=>{const row={...sql.prepare('SELECT * FROM products WHERE public_id=?').get(uuid(i+1))};
    const op=sql.prepare("SELECT * FROM catalog_maintenance_operations WHERE run_id='maintained' AND EXISTS(SELECT 1 FROM json_each(changes_json) c WHERE json_extract(c.value,'$.productId')=?)").get(row.id);
    return{publicId:row.public_id,operationId:op.operation_id,inputSha256:op.input_sha256,productSha256:sha256(canonicalJson(row)),displaySha256:sha256(row.public_display_json)};});
  const approval={schemaVersion:1,...mode,changes},request={previous,context,scope,codeSha:'e'.repeat(40),approval,approvalSha256:sha256(canonicalJson(approval))};
  await releaseMutationOwnership(db,cursor.current);const owner=await claimMutationOwnership(db,scope,
    {phase:'freezing',ownerReference:'original-publish',operationKey:approvedCohortOperationKey(request)});
  const prepared=await prepareApprovedCohort(db,owner,request),revision=prepared.revision;
  const reused=await reuseOwnedApprovedCohortVectorProof({db,owner:prepared.owner,revision,adapters});assert.equal(reused.state,'complete');
  const queued=await settleOwnedApprovedCohortVectorProof({db,owner:reused.owner,revision,adapters});
  const build=await claimBuildRequest(db,queued.requestId,'fixture:original-build',new Date(clock));
  const f={sql,db,index,adapters,revision,metrics,now:()=>new Date(clock),advance(ms){clock+=ms;},dispatches:()=>dispatches,
    async readonly(fn){const before=sql.prepare('SELECT total_changes() n').get().n;proofOnly=true;try{return await fn();}
      finally{proofOnly=false;assert.equal(sql.prepare('SELECT total_changes() n').get().n,before);}},
    async activate(build,owner,releaseId,prior){const intent={releaseId,catalogRevision:revision.snapshot.catalogRevision,codeSha:build.request.codeSha,
      catalogSnapshotSha256:revision.packet.receipt.snapshot_sha256,manifestSha256:'a'.repeat(64),vectorSyncWatermark:revision.vectorSyncWatermark,
      priorReleaseId:build.request.priorReleaseId,nextExpiry:revision.snapshot.products[0].eligibleUntil};
      await enqueuePublication(db,revision.snapshot,intent,new Date(clock));const publication=await claimPublication(db,revision.snapshot,releaseId,new Date(clock));
      await recordPublicationDispatch(db,revision.snapshot,publication,'fixture:dispatch',new Date(clock));
      const permit=await beginBuildActivation(db,build,revision.snapshot,publication,originalVersion??`fixture:version-${releaseId}`,
        async()=>({environment:scope.environment,settled:true,active:{...prior,versionReference:'fixture:prior-version'}}),new Date(clock),owner);
      return{intent,publication,permit};},
    async finish(active,read){await completePublication(db,revision.snapshot,active.intent.releaseId,active.publication.token,async()=>{
      await read();return active.intent;},()=>new Date(clock),active.permit.mutationOwner);
      assert.equal(await resolveBuildActivation(db,active.permit,async()=>{await read();return{environment:scope.environment,settled:true,
        active:{...active.intent,versionReference:active.permit.versionReference}};}),'resolved');}};
  const original=await f.activate(build,queued.owner,'original-release',priorIntent);
  const plan=approvedCohortVectorPlan(revision),control={catalogRevision:plan.catalogRevision,planSha256:sha256(canonicalJson(plan)),ids:plan.products.map(p=>p.publicId)};
  await f.finish(original,()=>readActivatedCatalogVectors(db,original.permit,control,adapters));
  const receipt={...sql.prepare("SELECT * FROM publication_receipts WHERE release_id='original-release'").get()},delivery={...sql.prepare('SELECT * FROM catalog_vector_deliveries WHERE delivery_id=?').get(reused.deliveryId)};
  const published={source:{releaseId:'original-release',receiptSha256:sha256(canonicalJson(receipt)),deliveryId:reused.deliveryId,
    deliverySha256:sha256(canonicalJson(delivery))},revision,request:{schemaVersion:1,environment:scope.environment,sourceRevision:revision.snapshot.catalogRevision,
    sourceDigest:revision.packet.receipt.snapshot_sha256,codeSha,priorReleaseId:'original-release',capturedAt:revision.snapshot.generatedAt,cutoff:context.cutoff}};
  f.owner=await claimMutationOwnership(db,scope,{phase:'freezing',ownerReference:'new-code',operationKey:publishedCatalogOperationKey(published)});
  f.published=published;f.control=control;f.original=original;f.options={db,owner:f.owner,published,adapters};return f;
}
test('published eight+two proof is read-only, preserves signed zero and settles a new normal code-only build exactly once',async t=>{
  const f=await setup(t),before=f.sql.prepare('SELECT * FROM products ORDER BY id').all(),dispatches=f.dispatches();
  assert.equal(f.revision.snapshot.products.length,8);assert.equal(f.revision.snapshot.heldProducts.length,2);
  const journals=f.sql.prepare('SELECT * FROM catalog_vector_deliveries ORDER BY delivery_id').all();
  const read=()=>f.readonly(()=>readPublishedCatalogVectors(f.options));
  try{assert.equal((await read()).settled,true);}catch(error){t.diagnostic(JSON.stringify(f.metrics));throw error;}assert.deepEqual(await read(),await read());
  assert.ok(Object.is(f.index.get(uuid(1)).values[0],-0));
  const queued=await enqueueBuildRequest(f.db,f.published.request),build=await claimBuildRequest(f.db,queued.requestId,'fixture:new-build',f.now());
  const active=await f.activate(build,f.owner,'new-code-release',f.original.intent);
  const observed=()=>f.readonly(()=>readActivatedCatalogVectors(f.db,active.permit,f.control,f.adapters,{published:f.published}));
  await assert.rejects(readActivatedCatalogVectors(f.db,active.permit,f.control,f.adapters)); // No implicit historical fallback.
  await f.finish(active,observed);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='new-code-release'").get().n,1);
  assert.deepEqual(f.sql.prepare('SELECT * FROM products ORDER BY id').all(),before);assert.deepEqual(f.sql.prepare('SELECT * FROM catalog_vector_deliveries ORDER BY delivery_id').all(),journals);
  assert.equal(f.dispatches(),dispatches);assert.ok(f.metrics.maxRequest<512*1024);assert.ok(f.metrics.maxResponse<512*1024);
});
test('same-owner final CAS refuses source, held, projection, prior, native, expiry and ABA drift',async t=>{
  for(const fault of ['source','held','held_full_row','held_native','projection','prior','native','metadata','expiry','aba','captured_time']){
    const f=await setup(t),before=f.dispatches();let once=false;
    const adapters={...f.adapters,async readback(id,signal){const value=fault==='held_native'&&id===uuid(9)?structuredClone(f.index.get(uuid(1))):await f.adapters.readback(id,signal);
      if(id===uuid(1)&&fault==='native')value.values[0]=0;
      if(id===uuid(1)&&fault==='metadata')value.metadata.catalogRevision='other';
      if(!once){once=true;if(fault==='source')f.sql.prepare("UPDATE products SET rights_json='{}' WHERE public_id=?").run(uuid(1));
        if(fault==='held')f.sql.prepare("UPDATE products SET source_facts_hash=? WHERE public_id=?").run('0'.repeat(64),uuid(10));
        if(fault==='held_full_row')f.sql.prepare("UPDATE products SET source_query='changed held private column' WHERE public_id=?").run(uuid(10));
        if(fault==='projection')f.sql.prepare('DELETE FROM catalog_public_products WHERE catalog_revision=? AND public_id=?').run('maintained',uuid(1));
        if(fault==='prior')f.sql.prepare("UPDATE publication_receipts SET completed_at=? WHERE release_id='original-release'").run(at(5));
        if(fault==='expiry')f.advance(24*3600000);
        if(fault==='captured_time')f.sql.prepare('UPDATE catalog_mutation_scopes SET captured_at=?').run(at(20));
        if(fault==='aba'){await releaseMutationOwnership(f.db,f.owner);await claimMutationOwnership(f.db,scope,
          {phase:'freezing',ownerReference:f.owner.ownerReference,operationKey:f.owner.operationKey});}}
      return value;}};
    await assert.rejects(readPublishedCatalogVectors({...f.options,adapters}),undefined,fault);assert.equal(f.dispatches(),before,fault);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='new-code-release'").get().n,0);
  }
});
test('altered historical inputs/approval and new permit cannot substitute for original proof',async t=>{
  const f=await setup(t);for(const fault of ['receipt','journal','approval','snapshot','request','code']){
    const changed=structuredClone(f.published);
    if(fault==='receipt')changed.source.receiptSha256='0'.repeat(64);if(fault==='journal')changed.source.deliverySha256='0'.repeat(64);
    if(fault==='approval')changed.revision.request.approval.runId='invented';if(fault==='snapshot')changed.revision.snapshot.heldProducts.pop();
    if(fault==='request')changed.request.sourceRevision='other';if(fault==='code')changed.request.codeSha=f.original.intent.codeSha;
    await assert.rejects(readPublishedCatalogVectors({...f.options,published:changed}),undefined,fault);
  }
  const queued=await enqueueBuildRequest(f.db,f.published.request),build=await claimBuildRequest(f.db,queued.requestId,'fixture:new-build',f.now());
  const active=await f.activate(build,f.owner,'new-code-release',f.original.intent);
  for(const field of ['token','runReference','versionReference','releaseId','requestId'])await assert.rejects(readActivatedCatalogVectors(f.db,
    {...active.permit,[field]:'wrong'},f.control,f.adapters,{published:f.published}),undefined,field);
});
test('abort and failed native siblings drain before return, retain ownership and permit exact retry',async t=>{
  const f=await setup(t),controller=new AbortController();controller.abort();let calls=0,cleaned=0;
  await assert.rejects(readPublishedCatalogVectors({...f.options,signal:controller.signal}));
  const adapters={...f.adapters,async readback(id,signal){calls++;if(id===uuid(1))return null;
    await new Promise(resolve=>signal.addEventListener('abort',()=>setTimeout(()=>{cleaned++;resolve();},20),{once:true}));signal.throwIfAborted();}};
  await assert.rejects(readPublishedCatalogVectors({...f.options,adapters}),/vector_not_visible/);
  assert.equal(calls,10);assert.equal(cleaned,9);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls,10);assert.equal(cleaned,9);
  assert.equal((await f.readonly(()=>readPublishedCatalogVectors(f.options))).settled,true);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'freezing');
});
test('matching claim cannot authorize unchanged code or a repinned false historical receipt',async t=>{
  for(const fault of ['same_code','false_receipt']){
    const f=await setup(t),published=structuredClone(f.published);
    if(fault==='same_code')published.request.codeSha=f.original.intent.codeSha;else published.source.receiptSha256='0'.repeat(64);
    await releaseMutationOwnership(f.db,f.owner);const owner=await claimMutationOwnership(f.db,scope,
      {phase:'freezing',ownerReference:'exact-rejected-input',operationKey:publishedCatalogOperationKey(published)});
    await assert.rejects(f.readonly(()=>readPublishedCatalogVectors({...f.options,owner,published})),
      fault==='same_code'?/vector_published_code_unchanged/:/vector_published_receipt_changed/);
  }
});

// This composition replaces only build/upload/HTTP with owned synthetic output.
// The actual executor, sealed package validation, normal D1 claims/permit/receipt,
// protected upload bridge and ALL durable transport accounting remain real.
async function composition(t){
  const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'published-catalog-release-')));
  let workspace;t.after(async()=>{await workspace?.close();await fs.rm(directory,{recursive:true,force:true});});
  const sourceRoot=path.join(directory,'source');await fs.mkdir(sourceRoot,{mode:0o700});
  const put=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,value,{mode:0o600});};
  const git=(...args)=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8',env:{PATH:process.env.PATH,HOME:directory,
    GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
  git('init','-q');await put(path.join(sourceRoot,'.gitignore'),'build/\nstatic-site/out/\n');git('add','.gitignore');
  git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Owned code-only fixture');const codeSha=git('rev-parse','HEAD');
  const accountId='a'.repeat(32),databaseId=uuid(70),version=uuid(71),priorVersion=uuid(72),deployment=uuid(73);
  const f=await setup(t,{codeSha,providerIdentity:`cloudflare:${accountId}:${scope.indexName}`,originalVersion:priorVersion});
  await releaseMutationOwnership(f.db,f.owner); // End fixture setup at the genuine prior idle state.
  const frozenProducts=canonicalJson(f.sql.prepare('SELECT * FROM products ORDER BY id').all());
  const frozenJournals=canonicalJson(f.sql.prepare('SELECT * FROM catalog_vector_deliveries ORDER BY delivery_id').all());
  const native=()=>canonicalJson([...f.index].map(([id,v])=>({id,native:encodePgvectorSendBase64(v.values),metadata:v.metadata})));
  const frozenNative=native(),sourceDispatches=f.dispatches(),deadline=f.revision.snapshot.products[0].eligibleUntil;
  const config={schemaVersion:1,...scope,accountId,workerName:'published-fixture-worker',database:{id:databaseId,name:'published-fixture-db'},
    codeSha,sourceMode:'preview',sourceRoot,releaseId:'published-new-code',identityOrigin:'https://published-fixture.example.invalid',
    compatibilityDate:'2026-10-20',prior:{directory:null,manifestSha256:f.original.intent.manifestSha256,releaseId:f.original.intent.releaseId,versionReference:priorVersion}};
  const wsOptions={directory:path.join(directory,'private'),repository:sourceRoot,mode:'create',runId:'published-new-code',codeSha,
    configSha256:sha256(canonicalJson(config)),scope:{...scope,accountId,databaseId,databaseName:config.database.name,workerName:config.workerName},
    retention:{reviewReference:'test-only/original-window',rules:Object.fromEntries(['amazon-observation','embedding-response','phase','publication','checkpoint']
      .map(kind=>[kind,{maxAgeMs:24*3600000,notAfter:deadline}]))},budgetCaps:{httpRequests:800,sqlStatements:1200},now:()=>f.now().toISOString()};
  workspace=await openRunWorkspace(wsOptions);
  const counts={http:0,sql:0,nativeReads:0,nativeWrites:0,uploads:0,activations:0,builds:0,uploadHttp:0},wire={request:0,response:0,params:0,statements:0};
  const mode={};let manifest,uploaded=false,active=false,uploadedConfig;
  const response=result=>Response.json({success:true,result});
  const checkpoint=async()=>(await workspace.readCheckpoint({controlOnly:true}))?.checkpoint;
  const base=`https://api.cloudflare.com/client/v4/accounts/${accountId}`,worker=`${base}/workers/scripts/${config.workerName}`;
  const raw=async(url,init={})=>{
    counts.http++;init.signal?.throwIfAborted();const u=new URL(url);
    if(url===`${base}/d1/database/${databaseId}`)return response({uuid:databaseId,name:config.database.name,read_replication:{mode:'disabled'}});
    if(url===`${base}/d1/database/${databaseId}/query`){
      const batch=JSON.parse(init.body).batch;wire.request=Math.max(wire.request,Buffer.byteLength(init.body));
      wire.statements=Math.max(wire.statements,batch.length);assert.ok(batch.length<=50);const result=[];f.sql.exec('BEGIN');
      try{for(const q of batch){counts.sql++;wire.params=Math.max(wire.params,q.params.length);assert.ok(q.params.length<=100);
        const before=f.sql.prepare('SELECT total_changes() n').get().n,rows=f.sql.prepare(q.sql).all(...q.params).map(r=>({...r}));
        // Readback corruption only: immutable source journals are NEVER edited.
        if(mode.journalDrift&&q.sql==='SELECT * FROM catalog_vector_deliveries WHERE delivery_id=?'&&rows[0])rows[0].completed_at=at(20);
        if(mode.receiptDrift&&q.sql==='SELECT * FROM publication_receipts WHERE release_id=?'&&rows[0])rows[0].completed_at=at(20);
        const changes=f.sql.prepare('SELECT total_changes() n').get().n-before;
        result.push({success:true,results:rows,meta:{served_by_primary:true,rows_read:rows.length,rows_written:changes,changes}});
      }f.sql.exec('COMMIT');}catch(error){f.sql.exec('ROLLBACK');throw error;}
      const body=JSON.stringify({success:true,result});wire.response=Math.max(wire.response,Buffer.byteLength(body));
      assert.ok(wire.request<=512*1024);assert.ok(wire.response<=512*1024);return new Response(body);
    }
    if(u.origin===config.identityOrigin){
      if(active&&mode.identityFailure){delete mode.identityFailure;throw new Error('Synthetic lost read acknowledgement');}
      const intent=active?(await checkpoint()).control.publication.intent:f.original.intent;
      return Response.json({release_id:intent.releaseId,code_sha:intent.codeSha,catalog_revision:intent.catalogRevision,
        catalog_snapshot_sha256:intent.catalogSnapshotSha256,manifest_sha256:intent.manifestSha256});
    }
    if(url===`${base}/vectorize/v2/indexes/${scope.indexName}`)return response({name:scope.indexName,config:{dimensions:1536,metric:'cosine'}});
    if(u.pathname.endsWith('/get_by_ids')){counts.nativeReads++;const ids=JSON.parse(init.body).ids;
      const result=ids.flatMap(id=>{const v=f.index.get(id);return v?[`{"id":${JSON.stringify(id)},"values":[${v.values.map(n=>Object.is(n,-0)?'-0':n).join(',')}],"metadata":${JSON.stringify(v.metadata)}}`]:[];});
      return new Response(`{"success":true,"result":[${result.join(',')}]}`);}
    if(u.pathname.includes('/vectorize/')){counts.nativeWrites++;assert.fail('Same-catalog publication must not mutate native state');}
    const c=(await checkpoint())?.control?.publication;
    if(url===`${worker}/assets-upload-session`||u.pathname===`/client/v4/accounts/${accountId}/workers/assets/upload`){counts.uploadHttp++;return response({jwt:'fixture-only',buckets:[]});}
    if(u.pathname.endsWith('/versions')&&init.method==='POST'){counts.uploadHttp++;uploaded=true;return response({id:version});}
    if(u.pathname.endsWith('/versions'))return response({items:uploaded?[{id:version}]:[]});
    if(url===`${worker}/versions/${version}`)return response({id:version,annotations:{'workers/tag':c.uploadMarker,'workers/message':`package:${c.packageSha256}`},
      resources:{script_runtime:{compatibility_date:config.compatibilityDate},bindings:[{name:'DB',type:'d1',id:databaseId},
        {name:'VECTORIZE',type:'vectorize',index_name:scope.indexName},{name:'ASSETS',type:'assets'},{name:'STAGING_AUTH_SECRET',type:'secret_text'},
        ...Object.entries(uploadedConfig.vars).map(([name,text])=>({name,type:'plain_text',text}))]}});
    if(url===`${worker}/deployments`){
      if(init.method==='POST'){counts.activations++;assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'activating');active=true;return response({id:deployment});}
      return response({deployments:[{id:active?deployment:uuid(74),versions:[{version_id:active?version:priorVersion,percentage:100}],
        annotations:{'workers/message':active?c.deploymentMarker:'fixture:original'}}]});
    }assert.fail('Unexpected local provider-mock route');
  };
  const fetchScope={accountId,workerName:config.workerName,indexName:scope.indexName,databaseId,identityOrigin:config.identityOrigin};
  const transports=async()=>{
    const db=await createCatalogD1Rest({accountId,databaseId,databaseName:config.database.name,token:'FIXTURE_ONLY',fetch:raw,
      limits:{requests:800,statements:1200},accounting:{scope:{accountId,databaseId,databaseName:config.database.name},
        initial:await workspace.budget(),reserve:input=>workspace.reserveBudget(input),settle:(id,value)=>workspace.settleBudget(id,value)}});
    return{db,fetch:accountedPublicationFetch(workspace,raw,fetchScope),observationFetch:accountedPublicationReadFetch(workspace,raw,fetchScope)};
  };
  let io=await transports();const owner=await claimMutationOwnership(io.db,scope,
    {phase:'freezing',ownerReference:'published-new-code',operationKey:publishedCatalogOperationKey(f.published)});
  const nativeAdapter=createVectorizeRestAdapters({...scope,accountId,token:'FIXTURE_ONLY',fetch:io.observationFetch});
  await readPublishedCatalogVectors({db:io.db,owner,published:f.published,adapters:nativeAdapter});
  const queued=await enqueueBuildRequest(io.db,f.published.request);
  await workspace.writeCheckpoint(null,{phase:'freezing',owner,state:{driverState:'preserved'},pins:{},phaseComplete:null,control:{}});
  const build=async command=>{
    if(command.args.includes('scripts/staging/build.mts')){
      counts.builds++;const snapshot=JSON.parse(await fs.readFile(command.env.CATALOG_SNAPSHOT_PATH));assert.deepEqual(snapshot,f.revision.snapshot);
      const context=JSON.parse(await fs.readFile(command.env.CATALOG_RELEASE_CONTEXT_PATH)),bytes=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
      const pages=['/','/gifts','/gifts/page/1','/random-gift','/gift-guides','/howie','/preview/presentation',...guides.map(g=>`/gift-guides/${g.slug}`),...snapshot.products.map(p=>`/gifts/${p.slug}`)];
      const assets=new Map(pages.map(p=>[p==='/'?'/index.html':`${p}.html`,bytes('Owned synthetic HTML')]));
      for(const n of ['/safe/catalog.html','/safe/product.html','/safe/howie.html','/safe/presentation.html','/safe/asset.txt'])assets.set(n,bytes('Owned unavailable'));
      assets.set('/safe/catalog.json',bytes(safeCatalogPayload));for(const s of ['.txt','/__next._full.txt','/__next._tree.txt','/__next.safe.product.__PAGE__.txt'])assets.set(`/safe/product${s}`,bytes('Owned safe RSC'));
      for(const shard of createBrowseRelease(snapshot).shards)assets.set(shard.path,bytes(shard.payload));
      for(const name of createOgRelease(snapshot,siteIdentityFor(context.sourceMode)).byPath.keys())assets.set(name,bytes('Owned PNG fixture'));
      const assembled=assembleReleaseAssets(snapshot,assets,context,null),rest={...context};delete rest.retainedManifestSha256;
      manifest={...rest,dataKind:'catalog',siteIdentitySha256:sha256(siteIdentityBytes(context.sourceMode)),nextExpiry:deadline,productCount:8,slugCount:8,
        checksums:Object.fromEntries([...assembled.assets].map(([p,b])=>[p,sha256(b)])),routes:assembled.routes,retention:assembled.retention};
      const manifestBytes=bytes(`${JSON.stringify(manifest,null,2)}\n`),outputs={'asset-manifest.json':manifestBytes,'catalog.snapshot.json':bytes(`${JSON.stringify(snapshot)}\n`),
        'release-context.json':bytes(`${JSON.stringify(context)}\n`),'release-identity.json':bytes(createReleaseIdentity(manifestBytes)),
        'site-identity.json':bytes(siteIdentityBytes(context.sourceMode)),'feed-plan.json':bytes(createStaticFeedPlan(snapshot,context.catalogSnapshotSha256))};
      for(const [n,b]of Object.entries(outputs))await put(path.join(sourceRoot,'build/stupid-gifts',n),b);
      for(const [n,b]of assembled.assets)await put(path.join(sourceRoot,'static-site/out',n.slice(1)),b);
    }else if(command.args.includes('upload')){
      counts.uploads++;assert.equal(command.file,'/usr/bin/sandbox-exec');uploadedConfig=JSON.parse(await fs.readFile(command.args[command.args.indexOf('--config')+1]));
      assert.equal(uploadedConfig.name,config.workerName);assert.equal(uploadedConfig.routes,undefined);assert.ok((await checkpoint()).pins.publicationUploadPending);
      const endpoint=command.env.CLOUDFLARE_API_BASE_URL;assert.equal(new URL(endpoint).hostname,'127.0.0.1');
      for(const route of [`/accounts/${accountId}/workers/scripts/${config.workerName}/assets-upload-session`,
        `/accounts/${accountId}/workers/assets/upload?base64=true`,`/accounts/${accountId}/workers/scripts/${config.workerName}/versions?bindings_inherit=strict`]){
        const reply=await fetch(`${endpoint}${route}`,{method:'POST',body:'{}'});assert.equal(reply.status,200);await reply.arrayBuffer();}
    }
  };
  const command=()=>accountedPublicationUploadCommand({workspace,scope:{accountId,workerName:config.workerName},send:raw,command:build});
  return{...f,counts,wire,mode,async execute(){const cp=await checkpoint();return executePublication({db:io.db,owner:cp.owner,revision:f.revision,published:f.published,
    requestId:queued.requestId,runReference:'published-new-code',workspace,config,credentials:{cloudflareToken:'FIXTURE_ONLY',identityAuthorization:'Basic FIXTURE_ONLY'},
    dependencies:{fetch:io.fetch,observationFetch:io.observationFetch,command:command(),now:f.now}});},
    async reopen(){const expectedManifestSha256=workspace.manifestSha256;await workspace.close();workspace=await openRunWorkspace({...wsOptions,mode:'resume',expectedManifestSha256});io=await transports();},
    async rejectCompletion(binding,revision=f.revision){const c=(await checkpoint()).control.publication;let reads=0;
      await assert.rejects(completeActivatedPublication(io.db,revision,c.publication,c.permit,async()=>{reads++;return c.intent;},f.now,binding),/publication_activation_fenced/);
      assert.equal(reads,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='published-new-code'").get().n,0);},
    budget:()=>workspace.budget(),checkpoint,
    unchanged(){assert.equal(canonicalJson(f.sql.prepare('SELECT * FROM products ORDER BY id').all()),frozenProducts);
      assert.equal(canonicalJson(f.sql.prepare('SELECT * FROM catalog_vector_deliveries ORDER BY delivery_id').all()),frozenJournals);
      assert.equal(native(),frozenNative);assert.equal(f.dispatches(),sourceDispatches);assert.equal(counts.nativeWrites,0);}};
}
for(const fault of ['none','read','expired'])test(`actual accounted same-catalog publisher ${fault==='expired'?'resumes after expired publication lease':fault==='read'?'restarts after lost read ACK':'publishes'} without source/native writes`,{skip:process.platform!=='darwin'},async t=>{
  const f=await composition(t);if(fault!=='none')f.mode.identityFailure=true;
  const originalRevisionSha=sha256(canonicalJson(f.revision));
  let result=await f.execute();if(fault!=='none'){assert.equal(result.state,'pending');assert.equal(f.counts.activations,1);assert.equal(f.counts.uploads,1);
    f.unchanged();if(fault==='expired'){
      f.advance(16*60000);const c=(await f.checkpoint()).control.publication;
      assert.ok(c.publication.leaseUntil<f.now().toISOString());assert.ok(f.revision.snapshot.products.every(p=>p.eligibleUntil>f.now().toISOString()));
      assert.notEqual(f.revision.operationKey,c.permit.mutationOwner.operationKey);
    }
    const before={...f.counts};await f.reopen();assert.equal(f.counts.http,before.http+2);
    if(fault==='expired'){
      // Default completion still refuses the original/new ownership mismatch.
      await f.rejectCompletion(undefined);
      for(const change of [b=>{b.source.deliverySha256='0'.repeat(64);},b=>{b.request.cutoff=at(5*3600000);}]){
        const binding=structuredClone(f.published);change(binding);await f.rejectCompletion(binding);
      }
      for(const drift of ['journalDrift','receiptDrift']){f.mode[drift]=true;await f.rejectCompletion(f.published);delete f.mode[drift];}
      await f.rejectCompletion(f.published,{...f.revision,operationKey:(await f.checkpoint()).owner.operationKey});
    }
    result=await f.execute();}
  assert.equal(result.state,'published',JSON.stringify(result));assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='published-new-code'").get().n,1);f.unchanged();
  const counts={...f.counts};assert.equal((await f.execute()).state,'published');assert.equal(f.counts.uploads,counts.uploads);assert.equal(f.counts.activations,counts.activations);
  assert.equal(sha256(canonicalJson(f.revision)),originalRevisionSha);
  const budget=await f.budget();assert.equal(budget.httpRequests,f.counts.http);assert.equal(budget.sqlStatements,f.counts.sql);assert.equal(budget.unconfirmedRequests,fault==='none'?0:1);
  assert.ok(budget.httpRequests<=800);assert.ok(budget.sqlStatements<=1200);assert.equal(f.counts.uploadHttp,3);assert.equal(f.counts.builds,1);
  t.diagnostic(JSON.stringify({scope:'LOCAL same-catalog actual executor/accounting/protected-upload MOCK only',...budget,wire:f.wire,...f.counts}));
});
