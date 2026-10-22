import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { createCatalogD1Rest } from '../scripts/catalog/d1-write-rest.ts';
import { createD1CatalogMaintenanceStore, loadMaintenanceVectorPayload } from '../scripts/catalog/maintenance-d1.ts';
import { maintenanceEmbeddingText } from '../scripts/catalog/maintenance-state.ts';
import { claimMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { convertSourceRow, sha256 } from '../scripts/catalog/migration.ts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { nativeHash } from '../scripts/catalog/vector-outbox.ts';

const NOW='2026-10-20T12:00:00.000Z';
const config={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001',databaseName:'test-only-scan',token:'TEST_ONLY'};
const base=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;
const id=n=>`B${String(n).padStart(9,'0')}`;
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const vectors=Array(1536).fill(Math.fround(.1));vectors[0]=-0;
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live network is forbidden');};
test.after(()=>{globalThis.fetch=originalFetch;});
function product(n,padding=0){return{id:id(n),title:`Owned Synthetic Object ${n}`,price:'19.99',currency:'USD',source:'amazon',
  imageUrl:`https://example.invalid/owned-${n}.jpg`,affiliateUrl:`https://www.amazon.com/dp/${id(n)}?tag=test-20`,
  sourceQuery:'owned fixture',humorTags:[`fixture${n}`],punnyTitle:`Synthetic Object ${n}`,wittyDescription:`Owned test description ${n}.`,
  qualityScore:.85,isActive:true,availabilityStatus:'IN_STOCK',remotelyVerified:true,editorialStatus:'generated_ready',editorialQualityScore:.95,
  editorialWriteup:Array(2).fill(Array(55).fill(`Specific owned synthetic editorial ${n}`).join(' ')).join('\n\n'),
  sourceFacts:{fixture:n,...(padding?{privatePadding:'x'.repeat(padding)}:{})},embedding:[...vectors]};}
const rights=p=>Object.fromEntries(Object.entries({title:p.title,description:p.wittyDescription,imageUrl:p.imageUrl,affiliateUrl:p.affiliateUrl,
  punnyTitle:p.punnyTitle,wittyDescription:p.wittyDescription,editorialWriteup:p.editorialWriteup,humorTags:JSON.stringify(p.humorTags)})
  .map(([key,value])=>[key,{basis:'owned',reference:'test-only-owned',value}]));
async function fixture(t,{count=100,padding=0,legacy=0,legacyPadding=0}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const name of (await readdir(new URL('../migrations/d1/',import.meta.url))).filter(name=>/^\d{4}.*\.sql$/.test(name)).sort())
    sql.exec(await readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  let clock=NOW;
  sql.function('strftime',(format,instant)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(instant,'now');return clock;});
  const local={prepare(query){let params=[];return{bind(...args){assert.ok(args.length<=100);params=args;return this;},
    async all(){return{results:sql.prepare(query).all(...params).map(row=>({...row}))};},async run(){return sql.prepare(query).run(...params);},
    execute(){return sql.prepare(query).all(...params);}};},async batch(statements){sql.exec('BEGIN');
    try{for(const s of statements)s.execute();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const scope={environment:'staging',indexName:'test-only-scan-index'};
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const owner=await claimMutationOwnership(local,scope,{phase:'writing',ownerReference:'scan-fixture',operationKey:'b'.repeat(64)});
  const cursor={current:owner};let next=0;
  const options={owner,ownerCursor:cursor,runId:'scan-run',catalogRevision:'scan-revision',newPublicId:()=>uuid(++next),
    intent:(_method,args)=>{if(_method!=='upsertProduct')return{reviewedDeleteReference:'test-only-delete'};
      const p=args[0];return{rightsById:{[p.id]:rights(p)},verificationById:{[p.id]:{reference:'owned-observation',observedAt:NOW,sourceFactsHash:args[1]}},
      embeddingById:{[p.id]:{reference:'owned-original-native',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:args[1]}}};}};
  const seed=createD1CatalogMaintenanceStore({...options,db:local});
  for(let n=1;n<=count;n++){const p=product(n,padding);const hash=editorialSourceHash(p);p.editorialSourceHash=hash;await seed.upsertProduct(p,hash);}
  const presence={};
  for(let n=count+1;n<=count+legacy;n++){
    const p=product(n);const hash=editorialSourceHash(p);const raw={...Object.fromEntries(Object.entries(p).filter(([key])=>!['remotelyVerified','embedding'].includes(key))
      .map(([key,value])=>[key.replace(/[A-Z]/g,l=>'_'+l.toLowerCase()),key==='sourceFacts'?JSON.stringify(value):value])),
      humor_tags:'{legacy}',public_id:uuid(n),slug:`legacy-fixture-${n}`,source_facts_hash:hash,editorial_source_hash:hash,
      availability_checked_at:NOW,last_verified_at:NOW,created_at:null,updated_at:NOW,embedding:null,
      private_legacy_archive:'x'.repeat(legacyPadding)};
    const row=convertSourceRow('products',raw,{catalogRevision:'archive',archiveId:'test-only',
      timestamps:{'products.created_at':{timezone:'unresolved',evidence:'Synthetic historical creation time is unknown'}},now:new Date(NOW)});
    const keys=Object.keys(row);sql.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));
    presence[uuid(n)]={present:true,sourceRecordSha256:sha256(String(row.source_record_json))};
  }
  clock='2026-12-01T12:00:00.000Z'; // Structural lane selection, not freshness renewal.
  const readOptions={...options,owner:cursor.current,ownerCursor:undefined,historical:{archiveSha256:'c'.repeat(64),embeddingPresence:presence}};
  const calls=[];let change;
  const fetch=async(url,init)=>{
    assert.equal(init.headers.Authorization,`Bearer ${config.token}`);assert.equal(init.redirect,'error');
    if(url===base)return new Response(JSON.stringify({success:true,result:{uuid:config.databaseId,name:config.databaseName,read_replication:{mode:'disabled'}}}));
    assert.equal(url,`${base}/query`);const body=JSON.parse(init.body);const results=[];
    sql.exec('BEGIN');try{for(const query of body.batch){assert.ok(query.params.length<=100);const before=sql.prepare('SELECT total_changes() n').get().n;
      const rows=sql.prepare(query.sql).all(...query.params).map(row=>({...row}));const written=sql.prepare('SELECT total_changes() n').get().n-before;
      calls.push({sql:query.sql,params:query.params,rows});results.push({success:true,results:rows,meta:{served_by_primary:true,rows_read:rows.length,rows_written:written,changes:written}});
    }sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
    change?.(body);return new Response(JSON.stringify({success:true,result:results}));
  };
  const db=await createCatalogD1Rest({...config,fetch});
  return{sql,db,calls,store:createD1CatalogMaintenanceStore({...readOptions,db}),direct:createD1CatalogMaintenanceStore({...readOptions,db:local}),
    change(fn){change=fn;},changes:()=>sql.prepare('SELECT total_changes() n').get().n};
}
const scans=f=>f.calls.filter(call=>/WHERE p\.id>\? ORDER BY p\.id LIMIT \?/.test(call.sql)&&/NULL maintenance_native/.test(call.sql));
test('100 actual maintained native vectors fit bounded REST catalog pages; all five views preserve selection and do no writes',async t=>{
  const f=await fixture(t);const before=f.changes();
  const cases=[['getActiveCatalogIdentities',[]],['getExistingEditorialWriteups',[[id(1)]]],['getAffiliateUrlMismatches',['wrong-20']],
    ['getProductsForRevalidation',[{limit:50,staleDays:30,publishedStaleDays:21,publishedSlots:40,legacySlots:10}]],['getProductsNeedingEnrichment',[25]]];
  for(const [method,args] of cases)assert.deepEqual(await f.store[method](...args),await f.direct[method](...args));
  const identities=await f.store.getActiveCatalogIdentities();assert.equal(identities.length,100);assert.equal(new Set(identities.map(p=>p.id)).size,100);
  assert.equal(f.changes(),before);assert.equal(f.db.metrics().reportedRowsWritten,0);assert.equal(f.db.metrics().unconfirmedRequests,0);
  assert.ok(scans(f).length>=11);assert.ok(scans(f).every(call=>call.params[1]===10&&call.rows.every(row=>row.maintenance_native===null&&row.maintenance_provenance===null)));
  const event=f.sql.prepare('SELECT sequence FROM vector_sync_outbox ORDER BY sequence LIMIT 1').get();
  const payload=await loadMaintenanceVectorPayload(f.db,event);assert.ok(Object.is(payload.values[0],-0));assert.equal(nativeHash(payload.values),nativeHash(vectors));
});
test('oversized full-reader pages shrink10→5→2 without advancing/skipping, stay reduced for the scan, and retain unknown usage',async t=>{
  const f=await fixture(t,{padding:50000});const before=f.changes();
  const values=await f.store.getAffiliateUrlMismatches('wrong-20');assert.deepEqual(values,await f.direct.getAffiliateUrlMismatches('wrong-20'));assert.equal(values.length,100);
  const attempts=scans(f);assert.deepEqual(attempts.slice(0,3).map(call=>call.params),[['',10],['',5],['',2]]);
  assert.ok(attempts.slice(2).every(call=>call.params[1]===2));assert.equal(attempts.at(-1).rows.length,0);
  assert.equal(f.changes(),before);assert.equal(f.db.metrics().unconfirmedRequests,2);assert.equal(f.db.metrics().reportedRowsRead,null);assert.equal(f.db.metrics().reportedRowsWritten,null);
});
test('legacy archive/presence checks survive large pages and byte fallback; one oversized row fails, never returns an empty clean catalog',async t=>{
  const f=await fixture(t,{count:0,legacy:10,legacyPadding:300000});const before=f.changes();
  assert.deepEqual(await f.store.getProductsNeedingEnrichment(25),await f.direct.getProductsNeedingEnrichment(25));
  assert.deepEqual(scans(f).slice(0,4).map(call=>call.params),[['',10],['',5],['',2],['',1]]);
  assert.equal((await f.store.getActiveCatalogIdentities()).length,10);assert.equal(f.changes(),before);
  const big=await fixture(t,{count:0,legacy:1,legacyPadding:600000});
  await assert.rejects(big.store.getProductsNeedingEnrichment(25),/^Error: catalog_d1_result_unknown$/);
  assert.deepEqual(scans(big).map(call=>call.params),[['',10],['',5],['',2],['',1]]);
  assert.equal(big.db.metrics().unconfirmedRequests,4);
  // Identity projection intentionally omits the unrelated private archive.
  assert.equal((await big.store.getActiveCatalogIdentities()).length,1);
  f.sql.prepare("UPDATE products SET updated_at=NULL WHERE id=?").run(id(1));
  assert.equal((await f.store.getActiveCatalogIdentities()).length,10); // Existing nullable historical semantics unchanged.
});
test('catalog fence drift refuses the result, and only the exact safe read error may shrink',async t=>{
  const f=await fixture(t);let changed=false;
  f.change(body=>{if(!changed&&body.batch.some(q=>/WHERE p\.id>\?/.test(q.sql))){changed=true;f.sql.exec('UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1');}});
  await assert.rejects(f.store.getActiveCatalogIdentities(),/maintenance_fenced/);
  const g=await fixture(t);const prepare=g.db.prepare.bind(g.db);let reads=0;
  const db={...g.db,prepare(sql){if(/WHERE p\.id>\?/.test(sql)){reads++;throw new Error('private unrelated diagnostic');}return prepare(sql);}};
  const owner={...g.sql.prepare('SELECT * FROM catalog_mutation_scopes').get()};
  const current={environment:'staging',indexName:owner.index_name,token:owner.owner_token,generation:owner.generation,epoch:owner.mutation_epoch,
    phase:'writing',ownerReference:owner.owner_reference,operationKey:owner.operation_key,capturedAt:owner.captured_at};
  const store=createD1CatalogMaintenanceStore({db,owner:current,runId:'read-failure',catalogRevision:'read-failure'});
  await assert.rejects(store.getActiveCatalogIdentities(),/^Error: private unrelated diagnostic$/);assert.equal(reads,1);
});
test('later exact point-load mutation retains native/provenance/CAS instead of reusing stripped catalog rows',async t=>{
  const f=await fixture(t);await f.store.getActiveCatalogIdentities();
  const before={...f.sql.prepare('SELECT embedding_native_base64,embedding_provenance_json FROM catalog_maintenance_products WHERE product_id=?').get(id(1))};
  assert.equal(await f.store.updateAmazonAffiliateUrl(id(1),`https://www.amazon.com/dp/${id(1)}?tag=test-20&source=test-only`),1);
  const after={...f.sql.prepare('SELECT embedding_native_base64,embedding_provenance_json FROM catalog_maintenance_products WHERE product_id=?').get(id(1))};
  assert.deepEqual(after,before);
  const point=f.calls.find(call=>/WHERE p\.id=\?/.test(call.sql)&&/embedding_native_base64/.test(call.sql));
  assert.ok(point?.rows[0].maintenance_native);assert.equal(point.rows[0].maintenance_provenance,before.embedding_provenance_json);
});
