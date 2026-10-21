import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createD1CatalogMaintenanceStore, loadMaintenanceVectorPayload } from '../scripts/catalog/maintenance-d1.ts';
import { maintenanceEmbeddingText, maintenanceSlugs, maintenanceTextArray } from '../scripts/catalog/maintenance-state.ts';
import { canonicalJson, canonicalTimestamp, convertSourceRow, sha256 } from '../scripts/catalog/migration.ts';
import { mergeCatalogMaintenanceUpsert } from '../scripts/ops/catalog-maintenance-merge.mjs';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { claimMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { getProductsByPublicIds } from '../lib/catalog/storage/d1.ts';
import { drainVectorOutbox } from '../scripts/catalog/vector-outbox.ts';
import { executeCatalog, parseArgs } from '../scripts/ops/prefetch-catalog.mjs';

// Entirely owned synthetic fixtures: no merchant/source calls, fixture publication,
// current product claims, or embedding generation. The UUIDs/ASINs are test data.
const NOW = '2026-10-20T07:00:00.123Z';
const OLD = '2026-07-01T00:00:00.000Z';
const id = n => `B${String(n).padStart(9,'0')}`;
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const vectors = Array(1536).fill(Math.fround(.1)); vectors[1] = Math.fround(1e-45);
const writeup = Array(50).fill('Synthetic crab button fixture factual editorial paragraph.').join(' ')+'\n\n'
  +Array(50).fill('Owned test copy for exact SQL migration behavior only.').join(' ');
function input(n=1,values={}) {
  return { id:id(n),title:`TEST ONLY Crab Button ${n}`,price:'19.99',currency:'USD',imageUrl:'https://example.invalid/crab.jpg',
    affiliateUrl:`https://www.amazon.com/dp/${id(n)}?tag=fixture-20`,source:'amazon',sourceQuery:'test fixture',
    humorTags:['synthetic','crab'],punnyTitle:'Synthetic crab button',wittyDescription:'Owned synthetic fixture description.',
    qualityScore:'0.8500',rating:'4.50',reviewCount:12,isActive:true,editorialWriteup:writeup,sourceFacts:{fixture:true,quantity:1},
    availabilityStatus:'IN_STOCK',editorialStatus:'generated_ready',editorialQualityScore:'0.9500',
    editorialModel:'fixture-model',editorialPromptVersion:'fixture-v1',editorialGeneratedAt:OLD,editorialBlockReason:null,
    duplicateOfProductId:null,remotelyVerified:true,...values };
}
const snake = key => key.replace(/[A-Z]/g,letter => `_${letter.toLowerCase()}`);
function rawProduct(n=1,values={}) {
  const product = input(n,values);
  return { ...Object.fromEntries(Object.entries(product).filter(([key]) => !['remotelyVerified','embedding'].includes(key)).map(([key,value]) => [snake(key),
    key === 'humorTags' ? `{${value.map(v => v === null ? 'NULL' : `"${String(v).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`).join(',')}}`
      : key === 'sourceFacts' ? JSON.stringify(value) : value])),public_id:uuid(n),slug:`test-fixture-${n}`,
    source_facts_hash:editorialSourceHash(product),editorial_source_hash:editorialSourceHash(product),
    availability_checked_at:OLD,last_verified_at:OLD,created_at:null,updated_at:OLD,content_updated_at:OLD,
    embedding:null };
}
const rights = p => Object.fromEntries(Object.entries({ title:p.title,description:p.wittyDescription,imageUrl:p.imageUrl,
  affiliateUrl:p.affiliateUrl,punnyTitle:p.punnyTitle,wittyDescription:p.wittyDescription,editorialWriteup:p.editorialWriteup,
  humorTags:JSON.stringify(p.humorTags) }).map(([key,value]) => [key,{basis:'owned',reference:'test-only-owned-fixture',value}]));
async function setup({products=[],presence={},intent,revision='r-new'}={}) {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = (await readdir(new URL('../migrations/d1/',import.meta.url))).filter(name => /^00\d\d_.*\.sql$/.test(name)).sort();
  for (const name of migrations) sqlite.exec(await readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  let clock=NOW;
  sqlite.function('strftime',(format,instant) => {assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(instant,'now');return clock;});
  let beforeBatch; let afterBatch; let queries=0; let batches=0;
  const db = { prepare(sql) { let params=[]; return {sql,get params(){return params;},bind(...values){ params=values;return this;},
    async all(){ queries++;return {results:sqlite.prepare(sql).all(...params).map(row => ({...row}))}; },
    async run(){ queries++;return sqlite.prepare(sql).run(...params); } }; },async batch(statements) {
      beforeBatch?.(statements); batches++;sqlite.exec('BEGIN');
      try { for (const statement of statements) {assert.ok(statement.params.length <= 100);sqlite.prepare(statement.sql).all(...statement.params);}sqlite.exec('COMMIT'); }
      catch(error){sqlite.exec('ROLLBACK');throw error;}
      afterBatch?.();
    } };
  for (const raw of products) {
    const timestamps=Object.fromEntries(['created_at','updated_at'].filter(key => raw[key] === null).map(key => [`products.${key}`,
      {timezone:'unresolved',evidence:'Test-only unresolved historical instant retained raw'}]));
    const row=convertSourceRow('products',raw,{catalogRevision:'r-archive',archiveId:'test-archive',timestamps,now:new Date(NOW)});
    const keys=Object.keys(row);sqlite.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(key => row[key]));
  }
  sqlite.prepare(`INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES('staging','fixture-index')`).run();
  const owner = await claimMutationOwnership(db,{environment:'staging',indexName:'fixture-index'},
    {phase:'writing',ownerReference:'test/maintenance',operationKey:'c'.repeat(64)});
  assert.ok(owner);
  let nextId=100;
  const options = {db,owner,runId:'test-run',catalogRevision:revision,newPublicId:() => uuid(nextId++),
    historical:{archiveSha256:'d'.repeat(64),embeddingPresence:Object.fromEntries(products.filter(p => p.public_id in presence).map(p => {
      const row={...p};delete row.embedding;
      return [p.public_id,{present:presence[p.public_id],sourceRecordSha256:sha256(canonicalJson(row))}];
    }))},
    intent:intent || (() => ({reviewedDeleteReference:'test/exact-maintenance-review'}))};
  const store=createD1CatalogMaintenanceStore(options);
  return {sqlite,db,owner,options,store,close:() => sqlite.close(),setClock(value){clock=value;},
    hookBefore(fn){beforeBatch=fn;},hookAfter(fn){afterBatch=fn;},counts:() => ({queries,batches}),
    row:n => ({...sqlite.prepare('SELECT * FROM products WHERE id=?').get(id(n))}),
    state:n => {const r=sqlite.prepare('SELECT * FROM catalog_maintenance_products WHERE product_id=?').get(id(n));return r ? {...r,product:JSON.parse(r.semantic_json)} : null;},
    events:() => sqlite.prepare('SELECT * FROM vector_sync_outbox ORDER BY sequence').all().map(row => ({...row})),
    epoch:() => sqlite.prepare('SELECT mutation_epoch FROM catalog_mutation_scopes').get().mutation_epoch};
}

test('all11 methods are usable via explicit D1 construction; immutable archive/identity and private versus public separation',async () => {
  const original=rawProduct(1);const f=await setup({products:[original],presence:{[uuid(1)]:true}});
  try {
    assert.equal(Object.keys(f.store).length,11);assert.ok(Object.isFrozen(f.store));
    const archived=f.row(1).source_record_json; const p=input(1,{editorialStatus:'pending',editorialWriteup:null,price:0,rating:0,reviewCount:0,humorTags:[],embedding:null});
    const hash=editorialSourceHash(p);
    assert.deepEqual(await f.store.upsertProduct(p,hash),{inserted:false,slug:original.slug});
    assert.equal(f.row(1).public_id,uuid(1));assert.equal(f.row(1).source_record_json,archived);
    assert.equal(f.state(1).product.editorialWriteup,original.editorial_writeup);assert.equal(f.state(1).product.price,'0.00');
    assert.equal(f.state(1).product.rating,null);assert.equal(f.state(1).product.reviewCount,null);
    assert.equal(f.state(1).embedding_present,1);assert.equal(f.state(1).embedding_native_base64,null);
    assert.equal(f.row(1).title,'');assert.equal(f.row(1).public_display_json,null);assert.equal(f.row(1).embedding_text_hash,null);
    const identities=await f.store.getActiveCatalogIdentities();assert.equal(identities[0].title,p.title);assert.equal(identities[0].sourceFacts,null);
    assert.deepEqual(await f.store.getExistingEditorialWriteups([]),[original.editorial_writeup]);
    assert.deepEqual(await f.store.getExistingEditorialWriteups([id(1)]),[]);
    assert.deepEqual(await f.store.getAffiliateUrlMismatches('other-20'),[{id:id(1),affiliate_url:p.affiliateUrl}]);
    assert.equal(await f.store.updateAmazonAffiliateUrl(id(1),p.affiliateUrl+'&extra=1'),1);
    assert.equal(await f.store.updateAmazonAffiliateUrl(id(999),p.affiliateUrl),0);
    assert.deepEqual(await f.store.getProductsForRevalidation({limit:50,staleDays:30,publishedStaleDays:21,publishedSlots:40,legacySlots:10}),[]);
    assert.equal((await f.store.getProductsNeedingEnrichment(25,[id(1)]))[0].slug,original.slug);
    await f.store.recordEditorialEvent({runId:'test-run',productId:id(1),eventType:'test',status:'pending',details:{fixture:true}});
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM catalog_editorial_events').get().n,1);
    assert.deepEqual(await f.store.markConfirmedMissingUnavailable([id(1),id(999)]),[id(1)]);
    assert.deepEqual(await f.store.deactivateConfirmedMissing([id(1)],90),[]); // Newly verified earlier in this run.
    await f.store.markCatalogDuplicate(id(1),'test-winner','test-only-duplicate');
    assert.equal(f.state(1).product.duplicateOfProductId,'test-winner');assert.equal(f.row(1).editorial_status,'duplicate');
    assert.equal(f.row(1).source_record_json,archived);assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    f.sqlite.prepare(`INSERT INTO products_fts(products_fts,rank) VALUES('integrity-check',1)`).run();
    assert.equal(f.events().length,1);assert.equal(f.events()[0].operation,'delete');
    assert.ok(f.sqlite.prepare('SELECT count(*) n FROM catalog_maintenance_vector_payloads').get().n > f.events().length);
    assert.throws(() => f.sqlite.prepare('UPDATE products SET source_record_json=? WHERE id=?').run('{}',id(1)),/immutable/);
    assert.throws(() => f.sqlite.prepare('UPDATE products SET public_id=? WHERE id=?').run(uuid(9),id(1)),/immutable/);
    assert.throws(() => f.sqlite.prepare('UPDATE products SET slug=? WHERE id=?').run('rename-not-authorized',id(1)),/slugs/);
  } finally {f.close();}
});

test('proven current embeddings and exact owned rights alone can produce a ready projection and immutable native payload',async () => {
  const p=input(1,{embedding:vectors,editorialSourceHash:null});const hash=editorialSourceHash(p);p.editorialSourceHash=hash;
  const evidence={rightsById:{[p.id]:rights(p)},verificationById:{[p.id]:{reference:'test/real-fixture-observation',observedAt:NOW,sourceFactsHash:hash}},
    embeddingById:{[p.id]:{reference:'test/embedding-response',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:hash}}};
  const f=await setup({intent:() => evidence});
  try {
    const result=await f.store.upsertProduct(p,hash);assert.equal(result.inserted,true);
    const row=f.row(1);assert.equal(row.public_id,uuid(100));assert.equal(row.price_minor,1999);assert.equal(row.source_facts_hash,hash);
    const ready=await getProductsByPublicIds(f.db,[uuid(100)],new Date(NOW),'r-new');assert.equal(ready.length,1);
    assert.equal(ready[0].price,0);assert.equal(row.embedding_text_hash,sha256(maintenanceEmbeddingText(p)));
    const event=f.events()[0];assert.equal(event.operation,'upsert');
    const payload=await loadMaintenanceVectorPayload(f.db,{sequence:event.sequence});
    const native=Buffer.from(encodePgvectorSendBase64(vectors),'base64');
    assert.equal(payload.vectorBytesSha256,createHash('sha256').update(native).digest('hex'));
    assert.equal(payload.vectorBytesSha256,JSON.parse(f.state(1).embedding_provenance_json).vectorBytesSha256);
    assert.deepEqual(payload.values,vectors);assert.equal(payload.sequence,event.sequence);
    const before=f.counts().batches;assert.deepEqual(await f.store.upsertProduct(p,hash),result);assert.equal(f.counts().batches,before);
    assert.equal(f.events().length,1);assert.equal(f.state(1).version,1);
    assert.equal(JSON.parse(row.timestamp_provenance_json).fields.last_verified_at.state,'evidenced');
    let providerCalls=0;
    const forbidden=async () => {providerCalls++;throw new Error('provider-must-not-run');};
    await assert.rejects(drainVectorOutbox({db:f.db,catalogRevision:'r-new',adapters:{loadPayload:forbidden,readback:forbidden,upsert:forbidden,delete:forbidden}}),/mutation_ownership_required/);
    assert.equal(providerCalls,0);
  } finally {f.close();}
});

test('immutable native payload preserves signed zero and refuses ambiguous or mismatched bytes',async()=>{
  const original=[...vectors];original[0]=-0;
  const p=input(1,{embedding:original});const hash=editorialSourceHash(p);p.editorialSourceHash=hash;
  const evidence={rightsById:{[p.id]:rights(p)},verificationById:{[p.id]:{reference:'test/fresh-observation',observedAt:NOW,sourceFactsHash:hash}},
    embeddingById:{[p.id]:{reference:'test/original-embedding',model:'text-embedding-3-small',text:maintenanceEmbeddingText(p),sourceFactsHash:hash}}};
  const f=await setup({intent:()=>evidence});try{
    await f.store.upsertProduct(p,hash);const event=f.events()[0];
    const stored=JSON.parse(f.sqlite.prepare('SELECT payload_json FROM catalog_maintenance_vector_payloads WHERE sequence=?').get(event.sequence).payload_json);
    assert.equal(typeof stored.nativeBase64,'string');assert.equal('values'in stored,false);
    const payload=await loadMaintenanceVectorPayload(f.db,event);assert.deepEqual(payload.values,original);assert.ok(Object.is(payload.values[0],-0));
    for(const bad of [{...stored,values:original},{...stored,vectorBytesSha256:'0'.repeat(64)},{...stored,nativeBase64:'invalid'}]){
      const malformed={prepare(){return{bind(){return this;},async all(){return{results:[{payload_json:JSON.stringify(bad)}]};}};}};
      await assert.rejects(loadMaintenanceVectorPayload(malformed,event));
    }
  }finally{f.close();}
});

test('unknown rights/facts/hash/observation remain held, no deadline or hash invented and no blanket legacy regeneration',async () => {
  const p=input(1,{embedding:vectors,editorialSourceHash:'a'.repeat(64)});const f=await setup();
  try {
    await f.store.upsertProduct(p,'a'.repeat(64));
    assert.equal(f.row(1).public_display_json,null);assert.equal(f.row(1).eligible_until,null);assert.equal(f.row(1).embedding_text_hash,null);
    assert.equal(f.state(1).embedding_present,1);assert.equal(f.state(1).embedding_native_base64,encodePgvectorSendBase64(vectors));
    assert.equal(JSON.parse(f.state(1).embedding_provenance_json).input,'unverified');assert.equal(f.events().length,0);
    assert.equal(JSON.parse(f.row(1).timestamp_provenance_json).fields.last_verified_at.state,'unverified_claim');
  } finally {f.close();}
  const original=rawProduct(1);const g=await setup({products:[original]});
  try {
    await assert.rejects(g.store.getProductsNeedingEnrichment(25),/presence_unproven/);
    await g.store.updateAmazonAffiliateUrl(id(1),input().affiliateUrl+'&test=1');
    assert.equal(g.state(1).embedding_present,null);assert.equal(g.state(1).embedding_native_base64,null);
  } finally {g.close();}
});

test('lost committed response/restart replays exact prior result/time/UUID, changed intent is distinct, immutable receipt tampering fails',async () => {
  const f=await setup();
  try {
    const operationTime='2026-10-20T08:00:00.456Z';f.setClock(operationTime);assert.equal(f.owner.capturedAt,NOW);
    let once=true;f.hookAfter(() => {if(once){once=false;throw new Error('lost-response');}});
    const p=input();const hash=editorialSourceHash(p);const result=await f.store.upsertProduct(p,hash);
    assert.equal(result.inserted,true);const original=f.row(1);assert.equal(f.epoch(),1);
    assert.equal(original.updated_at,operationTime);assert.equal(original.last_verified_at,operationTime);
    assert.equal(f.sqlite.prepare('SELECT database_time FROM catalog_maintenance_operations').get().database_time,operationTime);
    f.setClock('2026-10-20T09:00:00.000Z');
    const restarted=createD1CatalogMaintenanceStore({...f.options,newPublicId:() => {throw new Error('No second identity');}});
    assert.deepEqual(await restarted.upsertProduct({...p,availabilityCheckedAt:new Date('2026-10-21T01:00:00Z'),slug:'ignored-input-slug'},hash),result);
    assert.deepEqual(f.row(1),original);assert.equal(f.epoch(),1);
    await restarted.upsertProduct({...p,price:'20.00'},hash);assert.equal(f.state(1).product.price,'20.00');assert.equal(f.epoch(),2);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,2);
    assert.throws(() => f.sqlite.prepare(`UPDATE catalog_maintenance_operations SET result_json='null'`).run(),/immutable/);
    assert.throws(() => f.sqlite.prepare('DELETE FROM catalog_maintenance_operations').run(),/retained/);
  } finally {f.close();}
});

test('CAS and epoch conflicts roll back product, current private state, outbox, receipt and epoch together',async () => {
  const f=await setup({products:[rawProduct(1)],presence:{[uuid(1)]:true}});
  try {
    const before=f.row(1);let once=true;
    f.hookBefore(() => {if(once){once=false;f.sqlite.prepare("UPDATE products SET editorial_status='manual_locked' WHERE id=?").run(id(1));}});
    await assert.rejects(f.store.upsertProduct(input(1,{title:'Attempted stale overwrite'}),'b'.repeat(64)),/conflict/);
    assert.equal(f.row(1).editorial_status,'manual_locked');assert.equal(f.row(1).source_record_json,before.source_record_json);
    assert.equal(f.state(1),null);assert.equal(f.events().length,0);assert.equal(f.epoch(),0);
    f.hookBefore(null);
    const competing=createD1CatalogMaintenanceStore(f.options);
    await competing.updateAmazonAffiliateUrl(id(1),input().affiliateUrl+'&winner=1');
    await assert.rejects(f.store.updateAmazonAffiliateUrl(id(1),input().affiliateUrl+'&stale=1'),/fenced/);
    assert.match(f.state(1).product.affiliateUrl,/winner=1/);assert.equal(f.epoch(),1);
  } finally {f.close();}
});

test('unsent repeated updates coalesce into one newest event but retain immutable history; attempted/dispatched events fence all changes',async () => {
  const f=await setup({products:[rawProduct(1)],presence:{[uuid(1)]:true}});
  try {
    await f.store.markConfirmedMissingUnavailable([id(1)]);const first=f.events()[0];
    await f.store.markCatalogDuplicate(id(1),'winner','reviewed-duplicate');const second=f.events()[0];
    assert.equal(f.events().length,1);assert.ok(second.sequence > first.sequence);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM catalog_maintenance_vector_payloads').get().n,2);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM vector_delete_mutations').get().n,2);
    f.sqlite.prepare('UPDATE vector_sync_outbox SET attempts=1,mutation_reference=? WHERE sequence=?').run('provider-accepted',second.sequence);
    const before=f.row(1);const state=f.state(1);const epoch=f.epoch();
    await assert.rejects(f.store.updateAmazonAffiliateUrl(id(1),input().affiliateUrl+'&rejected=1'),/conflict/);
    assert.deepEqual(f.row(1),before);assert.deepEqual(f.state(1),state);assert.equal(f.epoch(),epoch);
    assert.equal(f.events()[0].mutation_reference,'provider-accepted');
  } finally {f.close();}
});

test('new identity allocation matches PG fallback order and atomically respects live/history collisions',async () => {
  const f=await setup({products:[rawProduct(1,{punnyTitle:'same test title'})],presence:{[uuid(1)]:false}});
  try {
    const p=input(2,{punnyTitle:'same test title'});
    f.sqlite.prepare('UPDATE products SET title=? WHERE id=?').run('',id(1)); // Private source title still preserved.
    f.sqlite.prepare(`INSERT INTO product_slug_history(slug,product_id,created_at,source_record_json) VALUES(?,?,?,'{}')`).run('same-test-title',id(1),NOW);
    f.sqlite.prepare(`INSERT INTO product_slug_history(slug,product_id,created_at,source_record_json) VALUES(?,?,?,'{}')`).run('same-test-title-00000000',id(1),NOW);
    const result=await f.store.upsertProduct(p,editorialSourceHash(p));
    assert.equal(result.slug,'same-test-title-000000000000');assert.equal(f.row(2).public_id,uuid(100));
    await f.store.upsertProduct({...p,punnyTitle:'A different candidate title'},editorialSourceHash(p));assert.equal(f.row(2).slug,result.slug);
    assert.deepEqual(maintenanceSlugs({title:'É & Café',punnyTitle:null},uuid(1)).slice(0,2),['caf','caf-00000000']);
    assert.equal(maintenanceSlugs({title:'🦀',punnyTitle:null},uuid(1))[0],'ridiculous-gift');
    assert.equal(maintenanceSlugs({title:'a'.repeat(119)+' b'},uuid(1))[0],'a'.repeat(119)+'-'); // Actual trigger truncates AFTER trimming.
    const before=f.epoch();let once=true;
    f.hookBefore(() => {if(once){once=false;f.sqlite.prepare(`INSERT INTO product_slug_history(slug,product_id,created_at,source_record_json) VALUES(?,?,?,'{}')`)
      .run('new-race-title',id(1),NOW);}});
    await assert.rejects(f.store.upsertProduct(input(3,{punnyTitle:'new race title'}),editorialSourceHash(input(3))),/conflict/);
    assert.equal(f.row(3).id,undefined);assert.equal(f.epoch(),before);assert.equal(f.state(3),null);
  } finally {f.close();}
});

test('published/legacy revalidation retains40/10 lanes, overdue published pages, NULL-first and fallback order',async () => {
  const products=[];const presence={};
  for(let n=1;n<=55;n++){const p=rawProduct(n);p.availability_checked_at=OLD;p.last_verified_at=OLD;products.push(p);presence[p.public_id]=true;}
  for(let n=101;n<=115;n++){const p=rawProduct(n,{editorialStatus:'pending'});p.last_verified_at=null;p.updated_at=null;products.push(p);presence[p.public_id]=true;}
  const f=await setup({products,presence});
  try {
    const selection={limit:50,staleDays:30,publishedStaleDays:21,publishedSlots:40,legacySlots:10};
    const rows=await f.store.getProductsForRevalidation(selection);
    assert.deepEqual(rows.slice(0,40).map(row => row.id),Array.from({length:40},(_,i) => id(i+1)));
    assert.deepEqual(rows.slice(40).map(row => row.id),Array.from({length:10},(_,i) => id(i+101)));
    const small=await f.store.getProductsForRevalidation({limit:100,staleDays:30,publishedStaleDays:21,publishedSlots:80,legacySlots:20});
    assert.equal(small.length,70);assert.equal(small.filter(row => row.editorial_status === 'generated_ready').length,55);
    assert.deepEqual(await f.store.deactivateConfirmedMissing([id(101)],90),[]); // Both historical instants unknown.
    assert.deepEqual(await f.store.deactivateConfirmedMissing([id(1)],90),[id(1)]);
  } finally {f.close();}
});

test('daily selection prioritizes explicit featured then current published ahead of arbitrarily old legacy; no writes',async () => {
  const products=[...Array.from({length:15},(_,n)=>rawProduct(n+1)),...Array.from({length:15},(_,n)=>rawProduct(n+100,{editorialStatus:'pending'}))];
  products[0].availability_checked_at=NOW;
  products[20].availability_checked_at=NOW;
  const inactive=rawProduct(999,{isActive:false});products.push(inactive);
  const f=await setup({products,presence:Object.fromEntries(products.map(p=>[p.public_id,true]))});
  try{
    const before=f.epoch();
    const rows=await f.store.getProductsForRevalidation({daily:true,limit:10,featuredIds:[products[20].id]});
    assert.equal(rows.length,10);assert.equal(rows[0].id,products[20].id);
    assert.deepEqual(rows.slice(1).map(r=>r.id),Array.from({length:9},(_,n)=>id(n+2)));
    assert.equal(f.epoch(),before);
    assert.equal((await f.store.getActiveCatalogIdentities()).some(p=>p.id===inactive.id),false);
    assert.equal((await f.store.getActiveCatalogIdentities({includeInactive:true})).some(p=>p.id===inactive.id),true);
  }finally{f.close();}
});

test('manual_locked, stale, numeric defaults and nullable fields retain the native-PG-reviewed pure merge semantics',async () => {
  const cases=[
    [{editorialStatus:'manual_locked'}, {editorialStatus:'generated_ready',editorialWriteup:'Replacement rejected by manual lock',editorialSourceHash:'b'.repeat(64)}],
    [{editorialStatus:'generated_ready'}, {editorialStatus:'pending',editorialWriteup:null,title:'Changed current listing facts'}],
    [{editorialStatus:'stale'}, {editorialStatus:'needs_review',editorialWriteup:'Incomplete candidate draft'}],
    [{editorialStatus:'pending'}, {editorialStatus:'generated_ready',editorialWriteup:'Reviewed replacement',price:'-1.005',rating:'0',reviewCount:'0',editorialQualityScore:'0'}],
    [{editorialStatus:'generated_ready'}, {editorialStatus:'pending',price:0,rating:0,reviewCount:0,qualityScore:0,remotelyVerified:false,imageUrl:null}],
  ];
  for(const [oldValues,newValues] of cases){
    const raw=rawProduct(1,oldValues);const f=await setup({products:[raw],presence:{[uuid(1)]:true}});
    try {
      const before=(await f.store.getProductsForRevalidation({limit:50,staleDays:30,publishedStaleDays:21,publishedSlots:40,legacySlots:10}))[0];
      const p=input(1,newValues);const hash=editorialSourceHash(p);
      await f.store.upsertProduct(p,hash);const actual=f.state(1).product;
      const existing=Object.fromEntries(Object.entries(raw).map(([key,value]) => [key.replace(/_([a-z])/g,(_,letter) => letter.toUpperCase()),value]));
      Object.assign(existing,{humorTags:['synthetic','crab'],sourceFacts:JSON.parse(raw.source_facts),embedding:null,createdAt:null,
        availabilityCheckedAt:canonicalTimestamp(raw.availability_checked_at),lastVerifiedAt:canonicalTimestamp(raw.last_verified_at),updatedAt:canonicalTimestamp(raw.updated_at)});
      const expected=mergeCatalogMaintenanceUpsert(existing,p,{sourceFactsHash:hash,databaseTime:NOW}).product;
      for(const key of ['title','price','rating','reviewCount','qualityScore','punnyTitle','wittyDescription','editorialWriteup','editorialStatus',
        'editorialSourceHash','editorialQualityScore','editorialModel','editorialGeneratedAt','contentUpdatedAt','availabilityCheckedAt','lastVerifiedAt','createdAt','updatedAt'])
        assert.deepEqual(actual[key],expected[key],`${oldValues.editorialStatus}/${newValues.editorialStatus}: ${key}`);
      if(oldValues.editorialStatus === 'manual_locked'){
        await f.store.markCatalogDuplicate(id(1),'winner','not-allowed');assert.equal(f.row(1).editorial_status,'manual_locked');
      }
      assert.ok(before);
    } finally {f.close();}
  }
});

test('invalid proofs/naive new editorial times/missing delete review or editorial parent fail before any write',async () => {
  const f=await setup({products:[rawProduct(1)],presence:{[uuid(1)]:true},intent:() => ({})});
  try {
    const before=f.row(1);
    await assert.rejects(f.store.updateAmazonAffiliateUrl(id(1),'https://www.amazon.com/dp/'+id(1)+'?tag=new-20'),/delete_review_required/);
    await assert.rejects(f.store.upsertProduct(input(2,{editorialGeneratedAt:'2026-10-20 00:00:00'}),null),/utc_required/);
    await assert.rejects(f.store.recordEditorialEvent({runId:'test-run',productId:id(999),eventType:'fixture',status:'pending',details:{}}),/conflict/);
    assert.deepEqual(f.row(1),before);assert.equal(f.row(2).id,undefined);assert.equal(f.epoch(),0);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,0);
  } finally {f.close();}
  const p=input(1,{embedding:vectors});const hash=editorialSourceHash(p);
  const g=await setup({intent:() => ({embeddingById:{[p.id]:{reference:'fixture',model:'text-embedding-3-small',text:'wrong text',sourceFactsHash:hash}}})});
  try {await assert.rejects(g.store.upsertProduct(p,hash),/embedding_proof/);assert.equal(g.epoch(),0);}finally{g.close();}
});

test('private text-array decoding preserves native NULL/empty/quotes/backslashes instead of coercing absence',() => {
  assert.equal(maintenanceTextArray(null),null);assert.deepEqual(maintenanceTextArray('{}'),[]);
  assert.deepEqual(maintenanceTextArray('{NULL,"NULL","","comma,tag","quote\\\"tag","slash\\\\tag"}'),[null,'NULL','','comma,tag','quote"tag','slash\\tag']);
  for(const value of ['{"unterminated}','{{nested}}','{tag,}','not-array'])assert.throws(() => maintenanceTextArray(value));
});

test('new verified native vector binding is preserved without regeneration; changed facts invalidate binding and queue reviewed delete',async () => {
  const p=input(1,{embedding:vectors});const hash=editorialSourceHash(p);p.editorialSourceHash=hash;
  const f=await setup({intent:(method,args) => {
    const current=args[0];const sourceHash=args[1];
    return {reviewedDeleteReference:'test/reviewed-current-mutation',rightsById:{[p.id]:rights(p)},
      ...(method === 'upsertProduct' ? {verificationById:{[p.id]:{reference:'test/observed',observedAt:NOW,sourceFactsHash:sourceHash}},
        ...(current.embedding?.length ? {embeddingById:{[p.id]:{reference:'test/generated-exact-input',model:'text-embedding-3-small',text:maintenanceEmbeddingText(current),sourceFactsHash:sourceHash}}} : {})} : {})};
  }});
  try {
    await f.store.upsertProduct(p,hash);const native=f.state(1).embedding_native_base64;
    await f.store.upsertProduct({...p,embedding:undefined,price:'21.00'},hash);
    assert.equal(f.state(1).embedding_native_base64,native);assert.equal(f.row(1).embedding_text_hash,sha256(maintenanceEmbeddingText(p)));
    assert.equal(f.events().length,1);assert.equal(f.events()[0].operation,'upsert');
    const changed={...p,embedding:undefined,title:'TEST ONLY Changed crab listing facts',editorialStatus:'pending'};
    await f.store.upsertProduct(changed,editorialSourceHash(changed));
    assert.equal(f.state(1).embedding_native_base64,native);assert.equal(f.row(1).embedding_text_hash,null);
    assert.equal(f.row(1).public_display_json,null);assert.equal(f.row(1).editorial_status,'stale');
    assert.equal(f.events().length,1);assert.equal(f.events()[0].operation,'delete');
    assert.equal(JSON.parse(f.state(1).embedding_provenance_json).sourceFactsHash,hash);
  } finally {f.close();}
});

test('old actual observations cannot become fresh when persisted now; recent observations cap deadline across later same-facts writes',async () => {
  for(const observedAt of ['2026-07-01T00:00:00.000Z','2026-10-19T04:00:00.000Z']){
    const p=input(1,{embedding:vectors});const hash=editorialSourceHash(p);p.editorialSourceHash=hash;
    const f=await setup({intent:(method,args) => ({rightsById:{[p.id]:rights(p)},
      ...(method === 'upsertProduct' ? {verificationById:{[p.id]:{reference:'test/actual-observation',observedAt,sourceFactsHash:hash}},
        embeddingById:{[p.id]:{reference:'test/exact-input',model:'text-embedding-3-small',text:maintenanceEmbeddingText(args[0]),sourceFactsHash:hash}}} : {})})});
    try {
      await f.store.upsertProduct(p,hash);
      assert.equal(f.state(1).product.lastVerifiedAt,NOW);assert.equal(f.row(1).availability_checked_at,NOW);
      assert.equal(JSON.parse(f.row(1).timestamp_provenance_json).fields.availability_checked_at.observedAt,observedAt);
      const expired=observedAt.startsWith('2026-07');
      const deadline=expired ? null : '2026-11-23T04:00:00.000Z';
      assert.equal(f.row(1).eligible_until,deadline);assert.equal(Boolean(f.row(1).public_display_json),!expired);
      f.setClock('2026-10-21T09:00:00.000Z');
      await f.store.updateAmazonAffiliateUrl(p.id,p.affiliateUrl);
      assert.equal(f.row(1).eligible_until,deadline);assert.equal(Boolean(f.row(1).public_display_json),!expired);
      assert.equal(f.state(1).product.lastVerifiedAt,NOW);
    } finally {f.close();}
  }
});

test('microsecond thresholds and equal instants with3/6 fractions preserve exact due ordering',async () => {
  const early=rawProduct(1,{editorialStatus:'pending'});early.last_verified_at='2026-09-20T07:00:00.123000Z';
  const late=rawProduct(2,{editorialStatus:'pending'});late.last_verified_at='2026-09-20T07:00:00.123001Z';
  const equal=rawProduct(3,{editorialStatus:'pending'});equal.last_verified_at='2026-09-20T07:00:00.123Z';
  const f=await setup({products:[early,late,equal],presence:{[uuid(1)]:true,[uuid(2)]:true,[uuid(3)]:true}});
  try {
    const rows=await f.store.getProductsForRevalidation({limit:50,staleDays:30,publishedStaleDays:21,publishedSlots:40,legacySlots:10});
    assert.deepEqual(rows.map(row => row.id),[id(1),id(3)]);
    const bad=createD1CatalogMaintenanceStore({...f.options,historical:{archiveSha256:'d'.repeat(64),embeddingPresence:{[uuid(1)]:{present:false,sourceRecordSha256:'0'.repeat(64)}}}});
    await assert.rejects(bad.getProductsNeedingEnrichment(25),/inventory_mismatch/);
  } finally {f.close();}
});

test('a retained real observation of old facts cannot verify changed facts through a new embedding alone',async () => {
  for(const merchantImage of [false,true]){
  const p=input(1,{embedding:vectors});const hash=editorialSourceHash(p);p.editorialSourceHash=hash;
  const f=await setup({intent:(_method,args) => {
    const current=args[0];const currentHash=args[1];
    const grants=rights(current);
    if(merchantImage)grants.imageUrl={basis:'merchant',reference:'test/same-image-observation',value:p.imageUrl,observedAt:NOW,expiresAt:'2026-10-21T07:00:00.123Z'};
    return {rightsById:{[p.id]:grants},embeddingById:{[p.id]:{reference:'test/new-exact-input',model:'text-embedding-3-small',text:maintenanceEmbeddingText(current),sourceFactsHash:currentHash}},
      ...(current.remotelyVerified !== false ? {verificationById:{[p.id]:{reference:'test/actual-observation',observedAt:NOW,sourceFactsHash:currentHash}}} : {})};
  }});
  try {
    await f.store.upsertProduct(p,hash);assert.ok(f.row(1).public_display_json);
    const changed={...p,title:'TEST ONLY new current facts',remotelyVerified:false};const changedHash=editorialSourceHash(changed);changed.editorialSourceHash=changedHash;
    await f.store.upsertProduct(changed,changedHash);
    assert.equal(f.row(1).public_display_json,null);assert.equal(f.row(1).eligible_until,null);
    assert.equal(JSON.parse(f.row(1).timestamp_provenance_json).fields.availability_checked_at.sourceFactsHash,hash);
    assert.equal(f.row(1).source_facts_hash,changedHash);
  } finally {f.close();}
  }
});

test('a multi-product CAS failure cannot partially update the first product or advance its receipt/epoch',async () => {
  const f=await setup({products:[rawProduct(1),rawProduct(2)],presence:{[uuid(1)]:true,[uuid(2)]:true}});
  try {
    const before=f.row(1);let once=true;
    f.hookBefore(() => {if(once){once=false;f.sqlite.prepare("UPDATE products SET is_active=0 WHERE id=?").run(id(2));}});
    await assert.rejects(f.store.markConfirmedMissingUnavailable([id(1),id(2)]),/conflict/);
    assert.deepEqual(f.row(1),before);assert.equal(f.state(1),null);assert.equal(f.state(2),null);assert.equal(f.events().length,0);assert.equal(f.epoch(),0);
  } finally {f.close();}
});

test('nonfinite source numerics and sparse arrays cannot turn into nullable defaults during receipt serialization',async () => {
  const f=await setup();
  try {
    for(const values of [{qualityScore:Infinity},{price:NaN},{reviewCount:Infinity},{rating:-Infinity},{humorTags:new Array(2)}])
      await assert.rejects(f.store.upsertProduct(input(1,values),null),/nonfinite|tag_array/);
    assert.equal(f.epoch(),0);assert.equal(f.row(1).id,undefined);
    const p=input(1,{humorTags:[null,undefined,''],remotelyVerified:false});
    await f.store.upsertProduct(p,editorialSourceHash(p));assert.deepEqual(f.state(1).product.humorTags,['null','undefined','']);
    assert.equal(f.row(1).last_verified_at,null);
  } finally {f.close();}
});

test('existing executeCatalog explicitly consumes the real D1 store for affiliate-only execution, not a second default backend',async t => {
  const previous=process.env.AMAZON_ASSOCIATE_TAG;process.env.AMAZON_ASSOCIATE_TAG='fixture-20';
  t.after(() => {if(previous === undefined)delete process.env.AMAZON_ASSOCIATE_TAG;else process.env.AMAZON_ASSOCIATE_TAG=previous;});
  const raw=rawProduct(1,{affiliateUrl:`https://www.amazon.com/dp/${id(1)}?tag=wrong-20`});
  const f=await setup({products:[raw],presence:{[uuid(1)]:false}});
  try {
    const output=await executeCatalog(parseArgs(['--repair-affiliate-urls-only']),undefined,undefined,f.store);
    assert.deepEqual(output.affiliateAudit,{mismatched:1,repaired:1});
    assert.equal(f.state(1).product.affiliateUrl,`https://www.amazon.com/dp/${id(1)}?tag=fixture-20`);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,1);
  } finally {f.close();}
});

test('0010 is additive on populated FK/FTS/projection/history/outbox rows and preserves original rowids/sequences',async () => {
  const sqlite=new DatabaseSync(':memory:');
  try {
    const names=(await readdir(new URL('../migrations/d1/',import.meta.url))).filter(name => /^00\d\d_.*\.sql$/.test(name)).sort();
    for(const name of names.filter(name => !name.startsWith('0010_')))sqlite.exec(await readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
    const row=convertSourceRow('products',rawProduct(1),{catalogRevision:'r-archive',archiveId:'test',timestamps:{'products.created_at':{timezone:'unresolved',evidence:'fixture unresolved creation'}},now:new Date(NOW)});
    row.title='Synthetic searchable fixture';const keys=Object.keys(row);
    sqlite.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(key => row[key]));
    sqlite.prepare(`INSERT INTO product_slug_history(slug,product_id,created_at,source_record_json) VALUES('previous-fixture',?,?,'{}')`).run(id(1),NOW);
    sqlite.prepare(`INSERT INTO catalog_public_products(catalog_revision,public_id,product_id,slug,title,description,tags,source_facts_hash,eligible_until,public_display_json,display_sha256)
      VALUES('r-archive',?,?,?,?,?,?,?,?,?,?)`).run(uuid(1),id(1),row.slug,'Synthetic fixture','Owned fixture','fixture',row.source_facts_hash,NOW,'{}','a'.repeat(64));
    sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at) VALUES(?,'r-archive',?,'upsert',?)`).run(uuid(1),'b'.repeat(64),NOW);
    const tables=['products','product_slug_history','catalog_public_products','vector_sync_outbox'];
    const before=Object.fromEntries(tables.map(table => [table,canonicalJson(sqlite.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all())]));
    sqlite.exec('BEGIN');sqlite.exec(await readFile(new URL('../migrations/d1/0010_catalog_maintenance.sql',import.meta.url),'utf8'));sqlite.exec('COMMIT');
    for(const table of tables)assert.equal(canonicalJson(sqlite.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all()),before[table]);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    for(const table of ['products_fts','catalog_public_products_fts'])sqlite.prepare(`INSERT INTO ${table}(${table},rank) VALUES('integrity-check',1)`).run();
    assert.equal(sqlite.prepare(`SELECT seq FROM sqlite_sequence WHERE name='vector_sync_outbox'`).get().seq,1);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,0);
  } finally {sqlite.close();}
});
