import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { createCatalogD1Rest } from '../scripts/catalog/d1-write-rest.ts';
import { createD1CatalogMaintenanceStore, loadMaintenanceVectorPayload } from '../scripts/catalog/maintenance-d1.ts';
import { createD1CatalogTelemetryStore } from '../scripts/catalog/telemetry-d1.ts';
import { maintenanceEmbeddingText, maintenanceRow, maintenanceState, maintenanceTimeOrder, publishedMaintenanceProduct } from '../scripts/catalog/maintenance-state.ts';
import { deliverOwnedOutboxEvent } from '../scripts/catalog/owned-vector-delivery.ts';
import { claimMutationOwnership, readMutationOwner, releaseMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { convertSourceRow } from '../scripts/catalog/migration.ts';
import { deduplicateAgainstCatalog } from '../scripts/ops/prefetch-catalog.mjs';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { nativeHash } from '../scripts/catalog/vector-outbox.ts';

// Capacity regression, NOT execution of the weekly runner or provider billing
// evidence. Setup is outside the measured client:75 maintained +3308 archived
// synthetic rows, all independently owned. The measured workload uses ONE REST
// client/counter and owner cursor:7 complete catalog views,50 revalidations,
//25 backfills,20 additions,45 editorial events,270 telemetry items and95 exact
// owned outbox settlements. Merchant/model calls, dedup supersessions, affiliate
// repairs, target-revision promotion/build/upload/readback, retained assets and
// CI/resume/bootstrap are deliberately absent.95 is NOT a worst-case write cap:
// discovery updates/supersessions/repairs can exceed it and must stop at budget.
// Mock rows_read counts returned rows (NOT SQLite/provider scanned/index rows);
// rows_written uses SQLite total_changes (including triggers), NOT D1 billing.
const NOW='2026-10-20T12:00:00.123Z';
const OLD='2026-09-01T12:00:00.123Z';
const TOTAL=3383;
const RUN='test-only-budget-week';
const REVISION='test-only-budget-revision';
const scope={environment:'staging',indexName:'test-only-budget-index'};
const config={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001',databaseName:'test-only-budget',token:'TEST_ONLY'};
const base=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;
const id=n=>`B${String(n).padStart(9,'0')}`;
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const vectors=Array(1536).fill(Math.fround(.1));vectors[0]=-0;vectors[1]=Math.fround(1e-45);
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live network is forbidden');};
test.after(()=>{globalThis.fetch=originalFetch;});
function product(n,{pending=false,quality=.85}={}) {
  return{id:id(n),title:`TEST ONLY owned fixture object ${n}`,price:'19.99',currency:'USD',source:'amazon',
    imageUrl:`https://example.invalid/fixture-${n}.jpg`,affiliateUrl:`https://www.amazon.com/dp/${id(n)}?tag=fixture-20`,
    sourceQuery:'test only fixture',humorTags:[`fixture${n}`],punnyTitle:`Owned fixture ${n}`,wittyDescription:`Owned synthetic fixture description ${n}.`,
    qualityScore:quality,isActive:true,availabilityStatus:'IN_STOCK',remotelyVerified:true,
    editorialStatus:pending?'pending':'generated_ready',editorialQualityScore:.95,
    editorialWriteup:Array(2).fill(Array(22).fill(`Specific owned synthetic fixture ${n} editorial.`).join(' ')).join('\n\n'),
    sourceFacts:{fixture:n,material:'synthetic'},embedding:[...vectors]};
}
const rights=p=>Object.fromEntries(Object.entries({title:p.title,description:p.wittyDescription,imageUrl:p.imageUrl,affiliateUrl:p.affiliateUrl,
  punnyTitle:p.punnyTitle,wittyDescription:p.wittyDescription,editorialWriteup:p.editorialWriteup,humorTags:JSON.stringify(p.humorTags)})
  .map(([key,value])=>[key,{basis:'owned',reference:'test-only-owned-fixture',value}]));

async function fixture(t,limits={requests:10000,statements:25000},{longRows=false}={}) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');
  for(const file of (await readdir(new URL('../migrations/d1/',import.meta.url))).filter(name=>/^\d{4}.*\.sql$/.test(name)).sort())
    sql.exec(await readFile(new URL(`../migrations/d1/${file}`,import.meta.url),'utf8'));
  let clock=OLD;
  sql.function('strftime',(format,instant)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(instant,'now');return clock;});
  const local={prepare(query){let params=[];return{bind(...values){assert.ok(values.length<=100);params=values;return this;},
    async all(){return{results:sql.prepare(query).all(...params).map(row=>({...row}))};},
    async run(){return sql.prepare(query).run(...params);},
    execute(){return sql.prepare(query).all(...params);}};},async batch(statements){sql.exec('BEGIN');
    try{for(const statement of statements)statement.execute();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const intent=(method,args)=>{
    if(method!=='upsertProduct')return{reviewedDeleteReference:'test-only-reviewed-delete'};
    const p=args[0];return{rightsById:{[p.id]:rights(p)},verificationById:{[p.id]:{reference:'test-only-observation',observedAt:clock,sourceFactsHash:args[1]}},
      embeddingById:{[p.id]:{reference:'test-only-original-native',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:args[1]}}};
  };
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const seedCursor={current:await claimMutationOwnership(local,scope,{phase:'writing',ownerReference:'test-only/seed',operationKey:'a'.repeat(64)})};
  let next=0;
  const seed=createD1CatalogMaintenanceStore({db:local,owner:seedCursor.current,ownerCursor:seedCursor,runId:'test-only-seed',
    catalogRevision:'test-only-seed',newPublicId:()=>uuid(++next),intent});
  for(let n=1;n<=75;n++){
    if(n===51)clock=NOW;
    const p=product(n,{pending:n>40});const hash=editorialSourceHash(p);p.editorialSourceHash=hash;await seed.upsertProduct(p,hash);
  }
  await releaseMutationOwnership(local,seedCursor.current);
  sql.exec('BEGIN');
  try{for(let n=76;n<=TOTAL;n++){
    const p=product(n,{pending:true,quality:.5});
    if(longRows&&[80,1500,3300].includes(n)){
      p.title+=' quote"\\\n😀'.repeat(500);p.imageUrl+='?escaped='+encodeURIComponent('"\\😀'.repeat(200));
      p.sourceFacts.largeUnused='not-needed-for-selection-or-dedup'.repeat(2000);
      if(n===80)p.isActive=false;
    }
    const raw={...Object.fromEntries(Object.entries(p).filter(([key])=>!['remotelyVerified','embedding'].includes(key))
      .map(([key,value])=>[key.replace(/[A-Z]/g,l=>'_'+l.toLowerCase()),key==='sourceFacts'?JSON.stringify(value):value])),
      humor_tags:'{synthetic}',public_id:uuid(n),slug:`test-only-archive-${n}`,source_facts_hash:editorialSourceHash(p),
      editorial_source_hash:editorialSourceHash(p),availability_checked_at:NOW,last_verified_at:NOW,created_at:null,updated_at:NOW,embedding:null};
    const row=convertSourceRow('products',raw,{catalogRevision:'test-only-archive',archiveId:'test-only-archive',now:new Date(NOW),
      timestamps:{'products.created_at':{timezone:'unresolved',evidence:'Synthetic historical creation is deliberately unknown'}}});
    const keys=Object.keys(row);sql.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));
  }sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
  next=TOTAL;clock=NOW;
  const count={http:0,statements:0,mockRowsRead:0,sqliteRowsWritten:0,batches:0,pages:0,projectedPages:0,maxRequestBytes:0,maxResponseBytes:0};
  let loseBatch=false;
  const fetch=async(url,init)=>{
    count.http++;assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,`Bearer ${config.token}`);
    if(url===base){assert.equal(init.method,'GET');return Response.json({success:true,result:{uuid:config.databaseId,name:config.databaseName,read_replication:{mode:'disabled'}}});}
    assert.equal(url,`${base}/query`);assert.equal(init.method,'POST');count.maxRequestBytes=Math.max(count.maxRequestBytes,Buffer.byteLength(init.body));
    const queries=JSON.parse(init.body).batch;assert.ok(queries.length<=50);count.statements+=queries.length;if(queries.length>1)count.batches++;
    const results=[];sql.exec('BEGIN');
    try{for(const query of queries){
      assert.ok(query.params.length<=100);const before=sql.prepare('SELECT total_changes() n').get().n;
      const rows=sql.prepare(query.sql).all(...query.params).map(row=>({...row}));
      const writes=sql.prepare('SELECT total_changes() n').get().n-before;
      count.mockRowsRead+=rows.length;count.sqliteRowsWritten+=writes;
      if(/WHERE p\.id>\? ORDER BY p\.id LIMIT \?/.test(query.sql)){
        count.pages++;
        if(query.sql.startsWith('WITH candidates')){
          count.projectedPages++;assert.ok(query.params[1]>=1&&query.params[1]<=128);
          for(const row of rows){
            assert.deepEqual(Object.keys(row),['data']);const view=JSON.parse(row.data);
            assert.equal('source_facts' in (view.archive||{}),false);assert.equal('embedding' in (view.semantic||{}),false);
            assert.equal('rights_json' in view,false);assert.equal('maintenance_native' in view,false);
          }
        }else assert.equal(query.params[1],10);
      }
      results.push({success:true,results:rows,meta:{served_by_primary:true,rows_read:rows.length,rows_written:writes,changes:writes}});
    }sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
    const bytes=JSON.stringify({success:true,result:results});count.maxResponseBytes=Math.max(count.maxResponseBytes,Buffer.byteLength(bytes));
    if(loseBatch&&queries.length>1){loseBatch=false;throw new Error('TEST ONLY consumed committed response');}
    return new Response(bytes);
  };
  const db=await createCatalogD1Rest({...config,limits,fetch});
  const cursor={current:await claimMutationOwnership(db,scope,{phase:'writing',ownerReference:'test-only/week',operationKey:'b'.repeat(64)})};
  const store=createD1CatalogMaintenanceStore({db,owner:cursor.current,ownerCursor:cursor,runId:RUN,catalogRevision:REVISION,newPublicId:()=>uuid(++next),intent});
  const telemetry=createD1CatalogTelemetryStore({db,owner:cursor.current,ownerCursor:cursor,runId:RUN,catalogRevision:REVISION});
  return{sql,db,cursor,store,telemetry,count,loseNextBatch(){loseBatch=true;},
    changes:()=>sql.prepare('SELECT total_changes() n').get().n};
}

test('one finite shared REST budget covers the explicit 3383-row/95-write simulated week without resets',async t=>{
  const f=await fixture(t);await f.telemetry.startCatalogRun({id:RUN,mode:'catalog',trigger:'test-only'});
  assert.deepEqual(await f.store.getAffiliateUrlMismatches('fixture-20'),[]);
  const selected=await f.store.getProductsForRevalidation({limit:50,staleDays:30,publishedStaleDays:21,publishedSlots:40,legacySlots:10});
  assert.deepEqual(selected.map(p=>p.id),Array.from({length:50},(_,i)=>id(i+1)));
  async function upsert(n){const p=product(n);const hash=editorialSourceHash(p);p.editorialSourceHash=hash;return f.store.upsertProduct(p,hash);}
  for(let n=1;n<=50;n++)assert.equal((await upsert(n)).inserted,false);
  const backfill=await f.store.getProductsNeedingEnrichment(25);
  assert.deepEqual(backfill.map(p=>p.id),Array.from({length:25},(_,i)=>id(i+51)));
  assert.equal((await f.store.getActiveCatalogIdentities()).length,TOTAL);
  assert.equal((await f.store.getExistingEditorialWriteups(backfill.map(p=>p.id))).length,50);
  for(let n=51;n<=75;n++)assert.equal((await upsert(n)).inserted,false);
  assert.equal((await f.store.getActiveCatalogIdentities()).length,TOTAL);
  const additions=Array.from({length:20},(_,i)=>TOTAL+i+1);
  assert.equal((await f.store.getExistingEditorialWriteups(additions.map(id))).length,75);
  for(const n of additions)assert.equal((await upsert(n)).inserted,true);
  for(const n of [...Array.from({length:25},(_,i)=>i+51),...additions])
    await f.store.recordEditorialEvent({runId:RUN,productId:id(n),eventType:'test-only-enriched',status:'generated_ready',details:{simulated:true}});
  await f.telemetry.insertCatalogRunItems(RUN,Array.from({length:270},(_,i)=>({id:uuid(10000+i),phase:i<100?'revalidation':'discovery',
    stage:'test-only-capacity',decision:'observed',externalId:id(i%75+1),source:'amazon',details:{simulated:true}})));
  const events=f.sql.prepare("SELECT sequence FROM vector_sync_outbox WHERE status='pending' ORDER BY sequence").all();assert.equal(events.length,95);
  const index=new Map();let dispatches=0;
  const adapters={...scope,providerIdentity:'test-only:budget-index',async dispatch(input){
    dispatches++;assert.ok(input.vector);index.set(input.publicId,structuredClone(input.vector));return{reference:`test-only/mutation-${dispatches}`};
  },async resolve(input){return{state:'settled',reference:input.reference};},async readback(publicId){return structuredClone(index.get(publicId)||null);}};
  for(const event of events){
    const options={db:f.db,sequence:event.sequence,catalogRevision:REVISION,adapters,loadPayload:e=>loadMaintenanceVectorPayload(f.db,e)};
    const first=await deliverOwnedOutboxEvent({...options,owner:f.cursor.current});assert.equal(first.state,'pending');f.cursor.current=first.owner;
    const done=await deliverOwnedOutboxEvent({...options,owner:f.cursor.current});assert.equal(done.state,'complete');f.cursor.current=done.owner;
  }
  assert.equal(dispatches,95);assert.equal(index.size,95);assert.ok([...index.values()].every(v=>nativeHash(v.values)===nativeHash(vectors)));
  // No published/build receipt exists: this test intentionally stops before the
  // separate<=20 cohort proof/approval/build/deployment contracts.
  await f.telemetry.finishCatalogRun(RUN,{status:'partial',counts:{simulatedWrites:95,publication:null}});
  const saved=await f.telemetry.loadCatalogRun(RUN);assert.equal(saved.run.status,'partial');assert.equal(saved.items.length,270);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM vector_sync_outbox WHERE status='pending'").get().n,0);
  assert.equal(f.count.pages-f.count.projectedPages,3*Math.ceil(TOTAL/10));
  assert.ok(f.count.projectedPages>0&&f.count.pages<7*Math.ceil(TOTAL/10));
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  const metrics=f.db.metrics();assert.equal(metrics.requests,f.count.http);assert.equal(metrics.statements,f.count.statements);
  assert.equal(metrics.reportedRowsRead,f.count.mockRowsRead);assert.equal(metrics.reportedRowsWritten,f.count.sqliteRowsWritten);
  assert.equal(metrics.unconfirmedRequests,0);assert.ok(metrics.requests>600&&metrics.requests<10000&&metrics.statements>1200&&metrics.statements<25000);
  assert.ok(metrics.reportedRowsRead<1000000&&metrics.reportedRowsWritten<10000);
  assert.ok(f.count.maxRequestBytes<512*1024&&f.count.maxResponseBytes<512*1024);
  t.diagnostic(`SIMULATED clean workload ${JSON.stringify({...metrics,pages:f.count.pages,maxRequestBytes:f.count.maxRequestBytes,maxResponseBytes:f.count.maxResponseBytes})}`);

  // SAME client: lose one already-committed write response. Exact receipt
  // reconciliation succeeds without replaying its mutation; costs stay unknown
  // through later read/replay operations. Never create a new budget/client.
  const event={runId:RUN,productId:id(1),eventType:'test-only-response-loss',status:'generated_ready',details:{simulated:true}};
  f.loseNextBatch();await f.store.recordEditorialEvent(event);
  const writes=f.changes();const batches=f.count.batches;await f.store.recordEditorialEvent(event);
  assert.equal(f.changes(),writes);assert.equal(f.count.batches,batches);
  assert.equal((await f.telemetry.loadRecentCatalogRuns(1)).length,1);
  assert.equal(f.db.metrics().unconfirmedRequests,1);assert.equal(f.db.metrics().reportedRowsRead,null);assert.equal(f.db.metrics().reportedRowsWritten,null);
  assert.deepEqual(await readMutationOwner(f.db,scope),f.cursor.current);
  t.diagnostic(`SIMULATED after response loss ${JSON.stringify(f.db.metrics())}`);
});

test('finite request/statement exhaustion stops a full-catalog scan with no skipped result, write or new budget',async t=>{
  for(const limits of [{requests:40},{requests:600,statements:40}]){
    const f=await fixture(t,limits);const before=f.changes();const owner=structuredClone(f.cursor.current);
    const priorWrites=f.db.metrics().reportedRowsWritten; // Explicit ownership claim precedes the read-only scan.
    assert.equal((await f.store.getActiveCatalogIdentities()).length,TOTAL);
    await assert.rejects(f.store.getActiveCatalogIdentities(),/^Error: catalog_d1_budget_exhausted$/);
    const stopped={...f.count};const metrics=f.db.metrics();
    assert.equal(limits.statements?metrics.statements:metrics.requests,limits.statements||limits.requests);
    await assert.rejects(f.db.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)')
      .bind('staging','test-only-must-not-write').run(),/^Error: catalog_d1_budget_exhausted$/);
    assert.deepEqual(f.count,stopped);assert.equal(f.changes(),before);assert.deepEqual(f.cursor.current,owner);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM products').get().n,TOTAL);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM catalog_mutation_scopes WHERE index_name='test-only-must-not-write'").get().n,0);
    assert.equal(metrics.unconfirmedRequests,0);assert.equal(metrics.reportedRowsWritten,priorWrites);
  }
});

test('3383-row daily and Monday views match the old full reader with bounded REST bytes and fresh post-write identities',async t=>{
  const f=await fixture(t,{requests:600,statements:1200},{longRows:true});
  const legacy=()=>f.sql.prepare(`SELECT p.*,s.semantic_json maintenance_semantic FROM products p
    LEFT JOIN catalog_maintenance_products s ON s.product_id=p.id ORDER BY p.id`).all().map(row=>maintenanceState({...row}));
  const identities=products=>products.map(p=>Object.fromEntries(['id','slug','title','imageUrl','affiliateUrl','qualityScore',
    'availabilityStatus','availabilityCheckedAt','lastVerifiedAt','editorialStatus','reviewCount'].map(key=>[key,p[key]]))).map(p=>({...p,sourceFacts:null}));
  const measured=async(name,action)=>{
    const before={...f.count};const result=await action();const calls=f.count.http-before.http;const statements=f.count.statements-before.statements;
    t.diagnostic(`${name}: ${calls} HTTP/${statements} SQL, ${f.count.projectedPages-before.projectedPages} projected pages (old full scan:339 pages)`);
    assert.ok(calls<100);return result;
  };
  const featured=[id(3300),id(20)];const prior=legacy();
  const lane=p=>featured.includes(p.id)?0:publishedMaintenanceProduct(p)?1:2;
  const choose=products=>products.filter(p=>p.source==='amazon'&&p.isActive&&/^B\d{9}$/.test(p.id))
    .sort((a,b)=>lane(a)-lane(b)||maintenanceTimeOrder(a.availabilityCheckedAt||a.lastVerifiedAt,b.availabilityCheckedAt||b.lastVerifiedAt,true)
      ||maintenanceTimeOrder(a.updatedAt,b.updatedAt,false)||a.id.localeCompare(b.id)).slice(0,10);
  const selected=choose(prior);
  const daily=await measured('daily selection',()=>f.store.getProductsForRevalidation({daily:true,limit:10,featuredIds:featured}));
  assert.deepEqual(daily,selected.map(p=>({...maintenanceRow(p),has_embedding:Number(p.id.slice(1))<=75?true:null})));
  const before=await measured('Monday include-inactive identity dedup',()=>f.store.getActiveCatalogIdentities({includeInactive:true}));
  assert.deepEqual(before,identities(prior));assert.equal(before.length,TOTAL);
  const writeups=await measured('Monday editorial comparison',()=>f.store.getExistingEditorialWriteups([id(1)]));
  assert.deepEqual(writeups,prior.filter(p=>['generated_ready','manual_locked'].includes(p.editorialStatus)&&p.id!==id(1)&&p.editorialWriteup!==null)
    .map(p=>p.editorialWriteup).filter(Boolean));
  const updated={...product(3300),title:'TEST ONLY updated unusually specific whistling kettle'};
  const added={...product(TOTAL+1),title:'TEST ONLY discovered paper moon fan'};
  for(const p of [updated,added]){const hash=editorialSourceHash(p);p.editorialSourceHash=hash;await f.store.upsertProduct(p,hash);}
  await f.store.markCatalogDuplicate(added.id,id(1),'test-only-duplicate');
  const after=await measured('fresh post-write identity dedup',()=>f.store.getActiveCatalogIdentities({includeInactive:true}));
  assert.deepEqual(after,identities(legacy()));assert.equal(after.length,TOTAL+1);
  assert.equal(after.find(p=>p.id===updated.id).title,updated.title);
  assert.ok(after.some(p=>p.id===added.id));
  assert.equal((await f.store.getActiveCatalogIdentities()).some(p=>p.id===id(80)),false);
  const candidates=[product(80),added,{...updated,id:id(99990)},{...product(99991),title:'TEST ONLY inflatable lunar crater umbrella'}];
  const result=deduplicateAgainstCatalog(structuredClone(candidates),after,.8,true);
  assert.deepEqual(result,deduplicateAgainstCatalog(structuredClone(candidates),identities(legacy()),.8,true));
  assert.ok(result.rejected.some(p=>p.id===id(80)));assert.ok(result.rejected.some(p=>p.id===added.id));
  assert.ok(result.rejected.some(p=>p.id===id(99990)));
  assert.deepEqual(deduplicateAgainstCatalog(structuredClone(candidates),after,.8,false),
    deduplicateAgainstCatalog(structuredClone(candidates),identities(legacy()),.8,false));
  const presence=new Map(f.sql.prepare('SELECT product_id,embedding_present FROM catalog_maintenance_products').all().map(row=>[row.product_id,row.embedding_present===1]));
  const freshDaily=await measured('fresh post-write daily selection',()=>f.store.getProductsForRevalidation({daily:true,limit:10,featuredIds:featured}));
  assert.deepEqual(freshDaily,choose(legacy()).map(p=>({...maintenanceRow(p),has_embedding:presence.get(p.id)??null})));
  assert.ok(f.count.maxRequestBytes<512*1024&&f.count.maxResponseBytes<512*1024);
  assert.equal(f.db.metrics().unconfirmedRequests,0);
  t.diagnostic(`Measured complete synthetic read/write fixture: ${JSON.stringify({...f.count,metrics:f.db.metrics()})}`);
});
