import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { prepareOperationalPacket } from '../scripts/catalog/prepare-operational.ts';
import { prepareOwnedOperationalImport, applyOwnedOperationalImport, normalizeOwnedImportSequences } from '../scripts/catalog/owned-operational-import.ts';
import { canonicalJson, convertSourceRow, sha256 } from '../scripts/catalog/migration.ts';
import { D1_RECOVERY_TABLES } from '../scripts/catalog/recovery-delta.ts';
import { claimMutationOwnership, readMutationOwner } from '../lib/catalog/mutation-fence.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { createProjectionPacket, importPublicProjection } from '../lib/catalog/d1.ts';
import { createCatalogD1Rest, CATALOG_D1_REST_LIMITS } from '../scripts/catalog/d1-write-rest.ts';

const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Live network is forbidden in owned import tests');};
test.after(()=>{globalThis.fetch=originalFetch;});

const AT='2026-10-21T12:00:00.000Z',naive='2026-10-20 10:00:00';
const scope={environment:'production',indexName:'controlled-import-index'};
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const native=encodePgvectorSendBase64([-0,...Array(1535).fill(Math.fround(.1))]);
const original=encodePgvectorSendBase64(Array(1536).fill(Math.fround(.2)));
const hashRows=rows=>sha256(canonicalJson(rows));
function sourceProduct(n){return{id:`B0${String(n).padStart(8,'0')}`,public_id:uuid(n),slug:`controlled-product-${n}`,source:'amazon',
  title:`Controlled catalog object ${n}`,description:'Controlled private source description.',price:'19.99',currency:'USD',quality_score:'0.80',is_active:true,
  editorial_status:'generated_ready',availability_status:'IN_STOCK',source_facts_hash:'a'.repeat(64),editorial_source_hash:'a'.repeat(64),embedding_text_hash:null,
  duplicate_of_product_id:null,created_at:naive,updated_at:naive,last_verified_at:naive,availability_checked_at:naive,embedding:original};}
function table(name,rows){const raw=rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':'');
  return{definition:{schema:'public',name,rowCount:rows.length,sha256:sha256(raw),columns:(name==='catalog_runs'?['started_at','completed_at']
    :name==='catalog_run_items'?['created_at']:[]).map(name=>({name,type:'timestamp with time zone'}))},rows,raw};}
function insert(sql,table,row){const columns=Object.keys(row);sql.prepare(`INSERT INTO ${table}(${columns}) VALUES(${columns.map(()=>'?')})`).run(...Object.values(row));}
async function fixture(t,{products=43,items=3,events=2,searches=2,runs=1,largeDescriptions=false}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(new URL('../migrations/d1/',import.meta.url)).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort())
    sql.exec(readFileSync(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  sql.function('strftime',()=>AT);const metrics={requests:0,statements:0,maxRequest:0,maxResponse:0};
  const mode={};const db={prepare(query){let params=[];const statement={query,bind(...values){params=values;return this;},
    async all(){metrics.requests++;metrics.statements++;const results=sql.prepare(query).all(...params).map(r=>({...r}));
      metrics.maxResponse=Math.max(metrics.maxResponse,Buffer.byteLength(JSON.stringify(results)));return{results};},
    async run(){metrics.requests++;metrics.statements++;return sql.prepare(query).run(...params);},
    execute(){return{success:true,results:sql.prepare(query).all(...params).map(r=>({...r}))};},
    wire(){return{sql:query,params};}};return statement;},
    async batch(statements){metrics.requests++;metrics.statements+=statements.length;
      const bytes=Buffer.byteLength(JSON.stringify(statements.map(s=>s.wire())));metrics.maxRequest=Math.max(metrics.maxRequest,bytes);
      assert.ok(bytes<512*1024);assert.ok(statements.length<=50);assert.ok(statements.every(s=>s.wire().params.length<=100));
      sql.exec('BEGIN');let result;try{result=statements.map((s,i)=>{const value=s.execute();if(mode.late&&s.query.startsWith('INSERT INTO migration_imports')){
        mode.late=false;sql.prepare("UPDATE catalog_mutation_scopes SET owner_token='foreign' WHERE index_name=?").run(scope.indexName);}void i;return value;});sql.exec('COMMIT');}
      catch(error){sql.exec('ROLLBACK');throw error;}
      if(mode.lose&&statements.some(s=>s.query.startsWith('INSERT INTO migration_imports'))){mode.lose=false;throw new Error('Owned lost acknowledgement');}
      return result;
    }};
  const sources=Array.from({length:products},(_,i)=>sourceProduct(i+1));
  if(largeDescriptions)for(const p of sources.slice(10))p.description='"\\🦆'.repeat(4000);
  const legacyRuns=Array.from({length:runs},(_,i)=>({id:`legacy-run-${i}`,status:'completed',mode:'weekly',dry_run:false,started_at:AT,completed_at:AT}));
  const legacyItems=Array.from({length:items},(_,i)=>({id:`legacy-item-${i}`,sequence:String(i+1),run_id:legacyRuns[i%runs].id,
    product_id:sources[i%products].id,external_id:sources[i%products].id,decision:'held',requires_manual_review:false,created_at:AT}));
  const archive={summary:{manifestSha256:sha256('CONTROLLED FULL SOURCE')},tables:[table('products',sources),table('product_slug_history',[]),
    table('catalog_runs',legacyRuns),table('catalog_run_items',legacyItems),table('catalog_editorial_events',Array.from({length:events},(_,i)=>({
      id:`legacy-event-${i}`,run_id:legacyRuns[i%runs].id,product_id:sources[i%products].id,event_type:'reviewed',status:'ready',created_at:naive}))),
    table('search_queries',Array.from({length:searches},(_,i)=>({id:`legacy-search-${i}`,query:'CONTROLLED PRIVATE QUERY',clicked_bundle_id:null,clicked_bundle_slug:null,created_at:naive}))) ]};
  const originalArchiveHash=hashRows(archive.tables.map(t=>({raw:t.raw,sha256:t.definition.sha256})));
  const preserved=[];const displays=[];
  for(const [i,p] of sources.slice(0,10).entries()){
    const display={id:p.id,publicId:p.public_id,slug:p.slug,title:`Current reviewed object ${i}`,description:'Controlled owned current description.',
      imageUrl:'/owned.svg',affiliateUrl:`https://www.amazon.com/dp/${p.id}?tag=controlled-20`,source:'amazon',currency:'USD',price:0,
      isActive:true,qualityScore:.8,eligibleUntil:'2026-10-22T12:00:00.000Z'};
    const rights=Object.fromEntries(['title','description','imageUrl','affiliateUrl'].map(c=>[c,{basis:'owned',reference:'Controlled fixture only',value:display[c]}]));
    const timestamps=Object.fromEntries(['availability_checked_at','last_verified_at','created_at','updated_at'].map(c=>[`products.${c}`,{timezone:'UTC',evidence:'Controlled UTC writer'}]));
    const row=convertSourceRow('products',p,{catalogRevision:'current',archiveId:archive.summary.manifestSha256,timestamps,
      ...(i<8?{rights,publicDisplay:display,now:new Date(AT)}:{})});insert(sql,'products',row);preserved.push(row);
    if(i<8){displays.push(display);insert(sql,'catalog_maintenance_products',{product_id:p.id,version:1,
      semantic_json:JSON.stringify({controlledCurrent:true,title:display.title,sourceFactsHash:'a'.repeat(64)}),embedding_present:1,
      embedding_native_base64:native,embedding_provenance_json:'{"kind":"controlled-native-fixture","verified":false}'});}
  }
  insert(sql,'catalog_revisions',{revision:'current',created_at:AT,source_export_sha256:'a'.repeat(64),status:'reconciled'});
  await importPublicProjection(db,await createProjectionPacket({schemaVersion:1,dataKind:'catalog',catalogRevision:'current',generatedAt:AT,
    products:displays,heldProducts:[],slugHistory:[]},Object.fromEntries(displays.map(p=>[p.publicId,'a'.repeat(64)])),'a'.repeat(64),new Date(AT)));
  insert(sql,'publication_receipts',{release_id:'native-release',catalog_revision:'current',code_sha:'b'.repeat(40),completed_at:AT,manifest_json:'{"controlled":"immutable receipt"}'});
  const nativeRun={id:'native-run',status:'completed',mode:'daily',dry_run:0,started_at:AT,completed_at:AT,source_record_json:'{"id":"native-run","status":"running"}'};
  insert(sql,'catalog_runs',nativeRun);insert(sql,'catalog_run_telemetry',{run_id:'native-run',start_json:'{"id":"native-run","status":"running"}',finish_json:'{"status":"completed","counts":{"refreshed":8}}'});
  for(let i=1;i<=10;i++)insert(sql,'catalog_run_items',{sequence:i,id:`native-item-${i}`,run_id:'native-run',product_id:sources[0].id,
    external_id:sources[0].id,decision:'refreshed',requires_manual_review:0,created_at:AT,source_record_json:JSON.stringify({id:`native-item-${i}`,sequence:i,controlled:true})});
  insert(sql,'catalog_editorial_events',{id:'native-event',run_id:'native-run',product_id:sources[0].id,event_type:'reviewed',status:'ready',created_at:AT,
    source_record_json:'{"controlled":"native editorial evidence"}',timestamp_provenance_json:'{}'});
  insert(sql,'search_history',{id:'native-history',created_at:null,legacy_bundle_id:null,legacy_bundle_slug:null,archive_reference:null,
    source_record_json:'{"controlled":"native history"}',timestamp_provenance_json:'{}'});
  insert(sql,'catalog_mutation_scopes',{environment:scope.environment,index_name:scope.indexName});
  const owner=await claimMutationOwnership(db,scope,{phase:'writing',ownerReference:'controlled-owned-import',operationKey:'d'.repeat(64)});assert.ok(owner);
  const capture={schemaVersion:1,scope:'application-logical-tables-through-0012',provenance:{kind:'synthetic-fixture',reference:'Controlled in-memory SQLite only',barrierEvidence:null},
    tables:Object.fromEntries(D1_RECOVERY_TABLES.map(table=>[table,sql.prepare(`SELECT * FROM ${table}`).all().map(r=>({...r}))]))};
  capture.inventory=D1_RECOVERY_TABLES.map(table=>({table,rows:capture.tables[table].length,sha256:hashRows(capture.tables[table])}));
  const packet=prepareOperationalPacket(archive,{importedAt:AT,unresolvedEvidence:'Controlled unresolved original wall times',preserve:{rows:preserved,
    rowsFileSha256:hashRows(preserved),evidenceSha256:sha256('Controlled target capture'),evidenceReference:'test-only/captured-target'}});
  const input={packet,capture,captureSha256:hashRows(capture),owner};const prepared=prepareOwnedOperationalImport(input);
  metrics.requests=0;metrics.statements=0;metrics.maxRequest=0;metrics.maxResponse=0;
  const cursor={current:owner};const apply=(extra={})=>applyOwnedOperationalImport({db,plan:prepared.plan,planSha256:prepared.sha256,ownerCursor:cursor,...extra});
  return{sql,db,mode,archive,originalArchiveHash,input,...prepared,cursor,apply,metrics};
}

test('full3383 source union preserves ten current products/eight native vectors/publications/native history',async t=>{
  const f=await fixture(t,{products:3383,items:3750,events:601,searches:340,runs:17});
  const result=await f.apply();assert.equal(result.state,'reconciled');assert.equal(result.barrierVerified,false);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM products').get().n,3383);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_run_items').get().n,3760);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_runs').get().n,18);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_products').get().n,8);
  assert.equal(f.plan.sequenceMapping.length,3750);assert.equal(f.plan.sequenceMapping[0].targetSequence,11);
  assert.equal(f.sql.prepare("SELECT sequence FROM catalog_run_items WHERE id='native-item-1'").get().sequence,1);
  assert.equal(f.sql.prepare("SELECT seq FROM sqlite_sequence WHERE name='catalog_run_items'").get().seq,3760);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM products WHERE id NOT IN(SELECT product_id FROM catalog_maintenance_products) AND public_display_json IS NOT NULL").get().n,0);
  assert.equal(hashRows(f.archive.tables.map(t=>({raw:t.raw,sha256:t.definition.sha256}))),f.originalArchiveHash);
  assert.ok(f.metrics.maxRequest<512*1024);assert.ok(f.metrics.maxResponse<512*1024);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_mutation_scopes').get().n,1);
  const firstMetrics={...f.metrics};
  const before=hashRows(f.sql.prepare('SELECT * FROM migration_imports').all().map(r=>({...r})));
  assert.equal((await f.apply()).state,'reconciled');assert.equal(hashRows(f.sql.prepare('SELECT * FROM migration_imports').all().map(r=>({...r}))),before);
  console.log(JSON.stringify({fixture:'synthetic-full-union-not-provider',batches:f.plan.batches.length,initial:firstMetrics,
    replay:{requests:f.metrics.requests-firstMetrics.requests,statements:f.metrics.statements-firstMetrics.statements}}));
});

test('lost committed acknowledgement recovers only exact receipt/next epoch and preserves replay',async t=>{
  const f=await fixture(t);f.mode.lose=true;assert.equal((await f.apply()).state,'reconciled');
  assert.equal(f.cursor.current.epoch,f.input.owner.epoch+f.plan.batches.length);assert.equal((await f.apply()).state,'reconciled');
});

test('escaped multibyte rows are repacked and byte-paginated without truncating identities or source fields',async t=>{
  const f=await fixture(t,{largeDescriptions:true});assert.equal((await f.apply()).state,'reconciled');
  for(const row of f.sql.prepare('SELECT id,source_record_json FROM products').all())
    assert.equal(JSON.parse(row.source_record_json).description,f.archive.tables[0].rows.find(p=>p.id===row.id).description);
  assert.ok(f.metrics.maxRequest<512*1024);assert.ok(f.metrics.maxResponse<512*1024);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM products').get().n,43);
  const g=await fixture(t);g.sql.exec('ALTER TABLE catalog_maintenance_products ADD COLUMN _cursor TEXT');
  await assert.rejects(g.apply(),/owned_import_schema/);assert.equal(g.sql.prepare('SELECT count(*) n FROM migration_imports').get().n,0);
});

test('late owner drift rolls back rows/receipt/epoch; baseline/native and receipt drift refuse',async t=>{
  const f=await fixture(t);f.mode.late=true;await assert.rejects(f.apply(),/owned_import_batch_unconfirmed/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM products').get().n,10);assert.equal(f.sql.prepare('SELECT count(*) n FROM migration_imports').get().n,0);
  assert.deepEqual(await readMutationOwner(f.db,scope),f.input.owner);
  f.sql.prepare("UPDATE catalog_maintenance_products SET embedding_provenance_json='{}' WHERE product_id=?").run(sourceProduct(1).id);
  await assert.rejects(f.apply(),/baseline_drift/);
  const g=await fixture(t);await g.apply();g.sql.prepare("UPDATE migration_imports SET batch_sha256=? WHERE batch_number=0").run('f'.repeat(64));
  await assert.rejects(g.apply(),/baseline_drift/);
});

test('checkpoint loss permits only the exact one-epoch own receipt, not ABA/phase or skipped epochs',async t=>{
  const f=await fixture(t);await assert.rejects(f.apply({checkpoint:async()=>{throw new Error('Owned checkpoint loss');}}),/checkpoint loss/);
  const old={...f.input.owner};f.cursor.current=old;assert.equal((await f.apply()).state,'reconciled');
  const g=await fixture(t);g.cursor.current={...g.cursor.current,token:'foreign'};await assert.rejects(g.apply(),/owned_import_owner/);
  const h=await fixture(t);h.sql.prepare("UPDATE catalog_mutation_scopes SET generation=generation+1 WHERE index_name=?").run(scope.indexName);
  await assert.rejects(h.apply(),/owned_import_owner/);
});

test('tampered plans, unverified real capture and oversized escaped rows refuse before mutation',async t=>{
  const f=await fixture(t);f.plan.batches[0].rows[0].status='modified';await assert.rejects(f.apply(),/owned_import_plan/);
  const g=await fixture(t);g.input.capture.provenance.kind='unverified-capture';g.input.captureSha256=hashRows(g.input.capture);
  const real=prepareOwnedOperationalImport(g.input);await assert.rejects(g.apply({plan:real.plan,planSha256:real.sha256}),/capture_unverified/);
  const h=await fixture(t);const product=h.input.packet.batches.find(b=>b.table==='products').rows[0];
  product.source_record_json=JSON.stringify({id:product.id,body:'"\\'.repeat(200_000)});
  assert.throws(()=>prepareOwnedOperationalImport(h.input),/owned_import_row_bounds/);
  assert.equal(g.sql.prepare('SELECT count(*) n FROM migration_imports').get().n,0);
});

test('rollback mapping proves receipts/full rows, restores original legacy sequence and retains exact native input',async t=>{
  const f=await fixture(t);await f.apply();
  const input=structuredClone(f.input.capture);
  input.tables=Object.fromEntries(D1_RECOVERY_TABLES.map(table=>[table,f.sql.prepare(`SELECT * FROM ${table}`).all().map(r=>({...r}))]));
  input.inventory=D1_RECOVERY_TABLES.map(table=>({table,rows:input.tables[table].length,sha256:hashRows(input.tables[table])}));
  const before=canonicalJson(input),source=f.archive.tables.find(t=>t.definition.name==='catalog_run_items').rows;
  const normalized=normalizeOwnedImportSequences(f.plan,f.sha256,input,source);
  assert.equal(canonicalJson(input),before);assert.equal(normalized.input.tables.catalog_run_items.find(r=>r.id==='legacy-item-0').sequence,1);
  assert.equal(normalized.proof.nativeSequences.find(m=>m.id==='native-item-1').from,1);
  assert.ok(normalized.proof.nativeSequences.every(m=>m.to>10));
  assert.equal(new Set(normalized.input.tables.catalog_run_items.map(r=>r.sequence)).size,13);
  const bad=structuredClone(input);bad.tables.catalog_run_items.find(r=>r.id==='legacy-item-0').decision='changed';
  bad.inventory.find(i=>i.table==='catalog_run_items').sha256=hashRows(bad.tables.catalog_run_items);
  assert.throws(()=>normalizeOwnedImportSequences(f.plan,f.sha256,bad,source),/rollback_mapping/);
  const receipt=structuredClone(input);receipt.tables.migration_imports[0].batch_sha256='f'.repeat(64);
  receipt.inventory.find(i=>i.table==='migration_imports').sha256=hashRows(receipt.tables.migration_imports);
  assert.throws(()=>normalizeOwnedImportSequences(f.plan,f.sha256,receipt,source),/rollback_receipt/);
  const inventory=structuredClone(input);inventory.inventory[0].rows++;
  assert.throws(()=>normalizeOwnedImportSequences(f.plan,f.sha256,inventory,source),/rollback_input/);
});

async function restAdapter(f,{lose=false}={}){
  const config={accountId:'a'.repeat(32),databaseId:uuid(901),databaseName:'owned-import-fixture',token:'LOCAL_FIXTURE_ONLY'};
  const base=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;
  const charges=[];const settled=new Set();let sends=0;
  const accounting={scope:{accountId:config.accountId,databaseId:config.databaseId,databaseName:config.databaseName},
    initial:{httpRequests:0,sqlStatements:0,knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:0},
    async reserve(input){charges.push(input);},async settle(id){assert.ok(!settled.has(id));settled.add(id);}};
  const db=await createCatalogD1Rest({...config,accounting,fetch:async(url,init)=>{
    sends++;assert.equal(init.redirect,'error');
    if(url===base)return Response.json({success:true,result:{uuid:config.databaseId,name:config.databaseName,read_replication:{mode:'disabled'}}});
    assert.equal(url,`${base}/query`);const {batch}=JSON.parse(init.body);const result=[];f.sql.exec('BEGIN');
    try{for(const q of batch){
      const before=f.sql.prepare('SELECT total_changes() n').get().n;
      const results=f.sql.prepare(q.sql).all(...q.params).map(r=>({...r}));
      const writes=f.sql.prepare('SELECT total_changes() n').get().n-before;
      result.push({success:true,results,meta:{served_by_primary:true,rows_read:results.length,rows_written:writes}});
    }f.sql.exec('COMMIT');}
    catch{f.sql.exec('ROLLBACK');return Response.json({success:false},{status:400});}
    if(lose&&batch.some(q=>q.sql.startsWith('INSERT INTO migration_imports'))){lose=false;throw new Error('Local post-commit response loss');}
    return Response.json({success:true,result});
  }});
  return{db,charges,settled,sends:()=>sends};
}

test('actual REST transport retains unknown charges while own receipt recovery avoids duplicate inserts',async t=>{
  const f=await fixture(t),transport=await restAdapter(f,{lose:true});const {db}=transport;
  assert.equal((await f.apply({db})).state,'reconciled');
  const receipts=hashRows(f.sql.prepare('SELECT * FROM migration_imports').all().map(r=>({...r})));
  assert.equal(db.metrics().unconfirmedRequests,1);
  assert.equal((await f.apply({db})).state,'reconciled');assert.equal(db.metrics().unconfirmedRequests,1);
  assert.equal(hashRows(f.sql.prepare('SELECT * FROM migration_imports').all().map(r=>({...r}))),receipts);
  assert.equal(transport.sends(),transport.charges.length);assert.equal(transport.settled.size,transport.charges.length);
});

test('actual REST adapter defaults refuse a full import without resetting accounting or dispatching beyond caps',async t=>{
  const f=await fixture(t,{products:3383,items:3750,events:601,searches:340,runs:17});
  const transport=await restAdapter(f),{db,charges,settled,sends}=transport;
  await assert.rejects(f.apply({db}),/catalog_d1_(?:budget_exhausted|reported_usage_exceeded)/);
  const metrics=db.metrics(),receipts=f.sql.prepare('SELECT count(*) n FROM migration_imports').get().n;
  const actualEpoch=f.sql.prepare('SELECT mutation_epoch n FROM catalog_mutation_scopes').get().n;
  assert.equal(receipts,actualEpoch-f.input.owner.epoch);assert.ok(receipts<f.plan.batches.length);
  assert.ok(actualEpoch-f.cursor.current.epoch===0||actualEpoch-f.cursor.current.epoch===1);
  assert.ok(metrics.requests<=CATALOG_D1_REST_LIMITS.requests);assert.ok(metrics.statements<=CATALOG_D1_REST_LIMITS.statements);
  assert.equal(metrics.unconfirmedRequests,0);assert.equal(sends(),charges.length);assert.equal(settled.size,charges.length);
  const stopped=sends();await assert.rejects(f.apply({db}),/catalog_d1_budget_exhausted/);assert.equal(sends(),stopped);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_products').get().n,8);
  console.log(JSON.stringify({fixture:'local-REST-default-cap-refusal-not-provider',completedBatches:receipts,metrics}));
});
