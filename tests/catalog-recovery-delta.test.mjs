import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat,readdir,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getTableConfig} from 'drizzle-orm/pg-core';
import {DatabaseSync} from 'node:sqlite';
import {products,catalogRuns,catalogRunItems,productSlugHistory,catalogEditorialEvents,searchQueries} from '../lib/db/schema.ts';
import {canonicalJson,convertSourceRow,sha256} from '../scripts/catalog/migration.ts';
import {validateRecoveryArchive} from '../scripts/catalog/recovery-archive.ts';
import {encodePgvectorSendBase64} from '../scripts/catalog/pgvector-binary.ts';
import {maintenanceState} from '../scripts/catalog/maintenance-state.ts';
import {D1_RECOVERY_TABLES,prepareRollbackPacket,writeRollbackPacket,readRollbackFixture} from '../scripts/catalog/recovery-delta.ts';
import {runNativeRecovery} from '../scripts/catalog/recovery-native.ts';
import {createD1CatalogTelemetryStore} from '../scripts/catalog/telemetry-d1.ts';
import {createD1CatalogMaintenanceStore} from '../scripts/catalog/maintenance-d1.ts';
import {claimMutationOwnership} from '../lib/catalog/mutation-fence.ts';

const AT='2026-10-21T12:00:00.123456Z';const LATER='2026-10-21T12:01:00.654321Z';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const native=encodePgvectorSendBase64([-0,Math.fround(1.401298464324817e-45),Math.fround(-.1),...Array(1533).fill(1)]);
const replacement=encodePgvectorSendBase64([Math.fround(.123),...Array(1535).fill(-2)]);
const seq={schemaname:'public',sequencename:'catalog_run_items_sequence_seq',data_type:'bigint',increment_by:'1',min_value:'1',
  max_value:'9223372036854775807',start_value:'1',cache_size:'1',cycle:false,last_value:'3'};
function definition(table,index){
  const config=getTableConfig(table);const key=config.name==='product_slug_history'?'slug':'id';
  const columns=config.columns.map(c=>({name:c.name,nullable:!c.notNull,
    type:c.getSQLType().replace(/^varchar/,'character varying').replace(/^timestamp$/,'timestamp without time zone').replace(/^bigserial$/,'bigint').replace(/, /g,','),
    default:config.name==='catalog_run_items'&&c.name==='sequence'?"nextval('catalog_run_items_sequence_seq'::regclass)":typeof c.default==='number'?String(c.default):null}));
  return {schema:'public',name:config.name,file:`${String(index).padStart(3,'0')}.ndjson`,rowCount:0,sha256:'',columns,
    columnEncodings:Object.fromEntries(columns.map(c=>[c.name,c.type==='vector(1536)'?'pgvector-send-base64-v1':c.type==='boolean'?'json-boolean':'postgres-text'])),
    constraints:[{name:`${config.name}_pkey`,definition:`PRIMARY KEY (${key})`}],
    indexes:[{name:`${config.name}_pkey`,definition:`CREATE UNIQUE INDEX ${config.name}_pkey ON public.${config.name} USING btree (${key})`}]};
}
function empty(def){return Object.fromEntries(def.columns.map(c=>[c.name,c.nullable?null:c.type==='boolean'?false:c.type==='jsonb'?'{}':c.type.startsWith('timestamp')?'2026-10-20 10:00:00'+(c.type.endsWith('with time zone')?'+00':''):'TEST']));}
function inventory(input){input.inventory=D1_RECOVERY_TABLES.map(table=>({table,rows:input.tables[table].length,sha256:sha256(canonicalJson(input.tables[table]))}));return input;}
async function fixture(){
  const parent=await mkdtemp(join(process.env.CATALOG_RECOVERY_TEST_EVIDENCE_PARENT||tmpdir(),'sg-delta-fixture-'));
  const directory=join(parent,'baseline');await mkdir(directory,{mode:0o700});
  const tables=[products,catalogRuns,catalogRunItems,productSlugHistory,catalogEditorialEvents,searchQueries].map(definition);
  for(let i=tables.length;i<13;i++)tables.push({schema:'public',name:`retired_fixture_${i}`,file:`${String(i).padStart(3,'0')}.ndjson`,
    columns:[{name:'id',type:'text',nullable:false,default:null},{name:'detail',type:'text',nullable:true,default:null}],
    columnEncodings:{id:'postgres-text',detail:'postgres-text'},constraints:[{name:`retired_fixture_${i}_pkey`,definition:'PRIMARY KEY (id)'}],
    indexes:[{name:`retired_fixture_${i}_pkey`,definition:`CREATE UNIQUE INDEX retired_fixture_${i}_pkey ON public.retired_fixture_${i} USING btree (id)`}]});
  const p=n=>({...empty(tables[0]),id:`TEST-${n}`,public_id:uuid(n),slug:`fixture-${n}`,title:`HISTORICAL TEST TITLE ${n}`,price:'19.99',currency:'USD',source:'amazon',
    affiliate_url:'https://example.test/fixture',quality_score:'0.8000',is_active:true,editorial_status:'pending',embedding:native,click_count:'7',impression_count:'11'});
  const run={...empty(tables[1]),id:uuid(20),telemetry_version:'test-v1',mode:'daily',trigger:'fixture',status:'completed',dry_run:false,config:'{}',counts:'{}',timings_ms:'{}',usage:'{}',warnings:'[]'};
  const item={...empty(tables[2]),id:uuid(30),sequence:'3',run_id:run.id,phase:'refresh',stage:'selection',decision:'selected',external_id:'TEST-1',requires_manual_review:false,details:'{}'};
  const data=[[p(1),p(2)],[run],[item],[],[],[],...tables.slice(6).map((_,i)=>[{id:`OLD-${i}`,detail:'SYNTHETIC PRIVATE RETIRED HISTORY'}])];
  let totalBytes=0;
  for(const [i,t]of tables.entries()){const raw=data[i].map(JSON.stringify).join('\n')+(data[i].length?'\n':'');t.rowCount=data[i].length;t.sha256=sha256(raw);totalBytes+=Buffer.byteLength(raw);await writeFile(join(directory,t.file),raw,{mode:0o600});}
  const functions=['assign_product_public_identity','preserve_product_slug_history'].map(proname=>({schema_name:'public',proname,arguments:'',
    definition:`CREATE OR REPLACE FUNCTION public.${proname}()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n RETURN NEW;\nEND;\n$function$\n`}));
  const triggers=[{schema_name:'public',relname:'products',tgname:'products_assign_public_identity',definition:'CREATE TRIGGER products_assign_public_identity BEFORE INSERT OR UPDATE OF slug ON public.products FOR EACH ROW EXECUTE FUNCTION assign_product_public_identity()'},
    {schema_name:'public',relname:'products',tgname:'products_preserve_slug_history',definition:'CREATE TRIGGER products_preserve_slug_history BEFORE UPDATE OF slug ON public.products FOR EACH ROW EXECUTE FUNCTION preserve_product_slug_history()'}];
  const settings={database:'test-only',snapshot:'fixture-only',observedAt:'2026-10-21T11:00:00Z',serverVersion:'17.11 (fixture)',serverVersionNum:'170011',isolation:'repeatable read',readOnly:'on'};
  const metadata={schemaVersion:1,binding:{kind:'same-transaction',archiveManifestSha256:null,archiveSnapshot:settings.snapshot,archiveObservedAt:settings.observedAt},source:settings,
    sequences:[{schema:'public',name:seq.sequencename,lastValue:'3',isCalled:true,configuration:Object.fromEntries(Object.entries(seq).filter(([k])=>!['schemaname','sequencename','last_value'].includes(k))),ownedBy:[{schema:'public',table:'catalog_run_items',column:'sequence',dependency:'a'}]}],
    triggers:triggers.map(t=>({schema:'public',table:'products',name:t.tgname,definition:t.definition,enabled:'O'})),
    aclEvidence:{database:{acl:null},schemas:[],relations:[],columns:[],functions:[],defaultPrivileges:[]},settingsEvidence:{session:{TimeZone:'GMT'},databaseRole:[]},sequenceConsistency:'nontransactional-observations-not-a-write-barrier'};
  const manifest={schemaVersion:1,mode:'https-repeatable-read-single-transaction',settings,totalBytes,tables,sequences:[seq],recoveryMetadata:metadata};
  const text=JSON.stringify(manifest)+'\n',baselineSha256=sha256(text);
  await writeFile(join(directory,'manifest.json'),text,{mode:0o600});await writeFile(join(directory,'manifest.sha256'),baselineSha256+'  manifest.json\n',{mode:0o600});
  const audit={readOnly:true,isolation:'repeatable read',policies:[],tables:tables.map(t=>({schema_name:t.schema,relname:t.name,relkind:'r',can_select:true,active_rls_for_export_role:false,
    relrowsecurity:false,relforcerowsecurity:false,relispartition:false,relhassubclass:false,inherits_from_parent:false})),functions,triggers,
    extensions:[{extname:'vector',extversion:'0.8.0',schema_name:'public'},{extname:'plpgsql',extversion:'1.0',schema_name:'pg_catalog'}]};
  const auditText=JSON.stringify(audit)+'\n',auditPath=join(parent,'audit.json');await writeFile(auditPath,auditText,{mode:0o600});
  const input={schemaVersion:1,scope:'application-logical-tables-through-0012',provenance:{kind:'synthetic-fixture',reference:'controlled fixture only',barrierEvidence:null},tables:Object.fromEntries(D1_RECOVERY_TABLES.map(t=>[t,[]])),inventory:[]};
  for(const [i,table]of tables.slice(0,6).entries()){
    const timestamps=Object.fromEntries(table.columns.filter(c=>c.type==='timestamp without time zone').map(c=>[`${table.name}.${c.name}`,{timezone:'unresolved',evidence:'fixture historical timezone unknown'}]));
    input.tables[table.name==='search_queries'?'search_history':table.name]=data[i].map(r=>convertSourceRow(table.name,r,{catalogRevision:'fixture-base',archiveId:baselineSha256,timestamps}));
  }
  function maintain(row,old,newId){
    const semantic=maintenanceState(row);if(newId){semantic.id=newId;semantic.publicId=uuid(3);semantic.slug='fixture-3';semantic.createdAt=AT;}
    semantic.title='CURRENT D1 TITLE, NOT HISTORICAL JSON';semantic.price='23.45';semantic.updatedAt=LATER;
    const current={...row,id:semantic.id,public_id:semantic.publicId,slug:semantic.slug,price_minor:2345,created_at:semantic.createdAt,updated_at:semantic.updatedAt};
    if(!old)current.source_record_json=canonicalJson({kind:'maintenance_creation',id:semantic.id,public_id:semantic.publicId,slug:semantic.slug});
    current.timestamp_provenance_json=canonicalJson({fields:{created_at:{state:newId?'evidenced':'unresolved'},updated_at:{state:'evidenced'}}});
    const m={product_id:semantic.id,version:1,semantic_json:canonicalJson(semantic),embedding_present:1,embedding_native_base64:old?replacement:native,embedding_provenance_json:'{}'};
    input.tables.catalog_maintenance_products.push(m);return current;
  }
  input.tables.products[0]=maintain(input.tables.products[0],true);
  input.tables.products.push(maintain(input.tables.products[1],false,'TEST-3'));
  // Exercise the actual writer's raw/start/finish JSON, casing, defaults,
  // sequence allocation and typed overrides rather than hand-authoring them.
  const sqlite=new DatabaseSync(':memory:');
  try{
    for(const name of (await readdir(new URL('../migrations/d1/',import.meta.url))).filter(n=>/^00\d\d_.*\.sql$/.test(n)).sort())
      sqlite.exec(await readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
    let clock='2026-10-21T12:00:00.123Z';sqlite.function('strftime',{varargs:true},()=>clock);
    const db={prepare(sql){let params=[];return{sql,get params(){return params;},bind(...p){params=p;return this;},
      async all(){return{results:sqlite.prepare(sql).all(...params).map(r=>({...r}))};},async run(){return sqlite.prepare(sql).run(...params);}};},
      async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)sqlite.prepare(s.sql).all(...s.params);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
    for(const name of ['products','catalog_runs','catalog_run_items'])for(const row of input.tables[name]){
      const keys=Object.keys(row);sqlite.prepare(`INSERT INTO ${name}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>row[k]));
    }
    sqlite.exec("INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES('staging','fixture-index')");
    const owner=await claimMutationOwnership(db,{environment:'staging',indexName:'fixture-index'},{phase:'writing',ownerReference:'test/rollback',operationKey:'c'.repeat(64)});
    const options={db,owner,ownerCursor:{current:owner},runId:uuid(21),catalogRevision:'fixture-current'};
    const store=createD1CatalogTelemetryStore(options);const maintenance=createD1CatalogMaintenanceStore(options);
    await store.startCatalogRun({id:uuid(21),mode:'daily',trigger:'fixture',config:{},gitSha:null});
    await store.insertCatalogRunItems(uuid(21),[{id:uuid(31),phase:'refresh',stage:'selection',decision:'selected',productId:'TEST-3',externalId:'TEST-1',requiresManualReview:false,details:{fixture:true}}]);
    await maintenance.recordEditorialEvent({runId:uuid(21),productId:'TEST-3',eventType:'draft_reviewed',status:'generated_ready',details:{fixture:true}});
    clock='2026-10-21T12:01:00.654Z';await store.finishCatalogRun(uuid(21),{status:'completed',counts:{refreshed:1},usage:{inputTokens:2,estimatedCostUsd:.000001}});
    for(const name of ['catalog_runs','catalog_run_items','catalog_editorial_events','catalog_run_telemetry','catalog_mutation_scopes','catalog_maintenance_operations','sqlite_sequence'])
      input.tables[name]=sqlite.prepare(`SELECT * FROM ${name}`).all().map(r=>({...r}));
  }finally{sqlite.close();}
  input.tables.search_diagnostics.push({id:uuid(99),query_hash:'a'.repeat(64),query_length:2,result_count:1,top_similarity:null,
    match_type:'keyword',outcome:'ok',created_at:AT,expires_at:'2026-11-20T12:00:00.123456Z'});
  inventory(input);
  const archive=await validateRecoveryArchive(directory,{expectedManifestSha256:baselineSha256});
  return{parent,directory,archive,manifest,input,baselineSha256,auditPath,auditSha256:sha256(auditText),
    plan(data=input){inventory(data);return prepareRollbackPacket(archive,manifest,data,sha256(canonicalJson(data)));},
    async packet(){const bytes=canonicalJson(input)+'\n',path=join(parent,'input.json');await writeFile(path,bytes,{mode:0o600});return writeRollbackPacket({archive:directory,baselineSha256,input:path,inputSha256:sha256(bytes),output:join(parent,'packet')});}};
}

test('offline packet restores current product state and finalized telemetry, retaining untouched baseline and native vectors',async()=>{
  const f=await fixture();try{const packet=f.plan();assert.equal(packet.changes.length,5);
    const changed=packet.changes.find(c=>c.table==='products'&&c.key==='TEST-1');assert.equal(changed.after.title,'CURRENT D1 TITLE, NOT HISTORICAL JSON');
    assert.equal(changed.before.title,'HISTORICAL TEST TITLE 1');assert.equal(changed.after.embedding,replacement);assert.equal(changed.after.price,'23.45');
    assert.equal(changed.after.created_at,changed.before.created_at);assert.equal(changed.after.click_count,'7');
    assert.equal(packet.changes.some(c=>c.key==='TEST-2'),false);assert.equal(packet.expectedTables.find(t=>t.table==='products').rows,3);
    const added=packet.changes.find(c=>c.key==='TEST-3');assert.equal(added.after.embedding,native);assert.equal(added.after.click_count,'0');
    const run=packet.changes.find(c=>c.table==='catalog_runs');assert.equal(run.after.status,'completed');assert.deepEqual(JSON.parse(run.after.counts),{refreshed:1});
    const event=packet.changes.find(c=>c.table==='catalog_editorial_events');assert.equal(event.after.event_type,'draft_reviewed');assert.deepEqual(JSON.parse(event.after.details),{fixture:true});
    assert.equal(packet.sequence.nextValue,'5');assert.equal(packet.barrierVerified,false);
    const real=structuredClone(f.input);real.provenance.kind='unverified-capture';assert.equal(f.plan(real).provenance.kind,'unverified-capture');
    // Actual naive PG source syntax may have a documented UTC writer. Reuse its
    // per-field evidence, while retaining raw wall time rather than rewriting it.
    const proven=structuredClone(f.input);const original=f.archive.tables[0].rows[1];const row=proven.tables.products[1];
    const times=JSON.parse(row.timestamp_provenance_json);
    for(const key of ['created_at','updated_at']){row[key]=original[key].replace(' ','T')+'.000000Z';times.fields[key]={state:'evidenced',basis:'documented_utc_writer',evidence:'Controlled fixture UTC writer'};}
    row.timestamp_provenance_json=canonicalJson(times);assert.equal(f.plan(proven).changes.some(c=>c.key==='TEST-2'),false);
    times.fields.created_at={state:'unresolved',evidence:'No UTC writer proof'};row.timestamp_provenance_json=canonicalJson(times);assert.throws(()=>f.plan(proven));
    const written=await f.packet();assert.equal((await lstat(join(written.directory,'rollback.json'))).mode&0o077,0);
    assert.equal(sha256(await readFile(join(written.directory,'d1-sidecar.json'),'utf8')),written.packet.inputSha256);
    assert.equal(JSON.parse(await readFile(join(written.directory,'d1-sidecar.json'),'utf8')).tables.search_diagnostics.length,1);
    await readRollbackFixture(written.directory,written.packetSha256,f.archive,f.manifest);
  }finally{await rm(f.parent,{recursive:true,force:true});}
});

test('incomplete input, stale typed drift, unknown vectors, unproven time, unsupported history and provider barrier claims refuse',async()=>{
  const f=await fixture();try{
    for(const change of [
      i=>{delete i.tables.search_diagnostics;},i=>{i.tables.products.pop();},
      i=>{i.tables.products[1].editorial_status='stale';},i=>{i.tables.products[1].price_minor=999;},
      i=>{i.tables.catalog_runs[0].completed_at=AT;},i=>{i.tables.catalog_maintenance_products[0].embedding_present=null;},
      i=>{i.tables.catalog_maintenance_products[0].embedding_native_base64='not-vector';},
      i=>{const m=i.tables.catalog_maintenance_products[0],p=JSON.parse(m.semantic_json);p.updatedAt='2026-10-21 12:00:00';m.semantic_json=canonicalJson(p);i.tables.products[0].updated_at=p.updatedAt;},
      i=>{i.tables.catalog_run_telemetry[0].finish_json=null;},i=>{i.tables.catalog_run_items[1].decision='different';},
      i=>{i.tables.catalog_editorial_events[0].status='tampered';},
      i=>{i.tables.product_slug_history.push({slug:'new-slug',product_id:'TEST-1',source_record_json:'{}'});},
      i=>{i.provenance.kind='provider-barrier-capture';},i=>{i.provenance.barrierEvidence='unverified assertion';},
    ]){const input=structuredClone(f.input);change(input);assert.throws(()=>f.plan(input));}
    const input=structuredClone(f.input);input.inventory[0].rows++;assert.throws(()=>prepareRollbackPacket(f.archive,f.manifest,input,'a'.repeat(64)));
    const written=await f.packet();const bytes=await readFile(join(written.directory,'rollback.json'),'utf8');
    const source=join(f.parent,'input.json'),linked=join(f.parent,'linked.json');await symlink(source,linked);
    await assert.rejects(writeRollbackPacket({archive:f.directory,baselineSha256:f.baselineSha256,input:linked,inputSha256:written.packet.inputSha256,output:join(f.parent,'refused-symlink')}));
    const invalid=Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d]);const invalidPath=join(f.parent,'invalid-utf8.json');await writeFile(invalidPath,invalid,{mode:0o600});
    await assert.rejects(writeRollbackPacket({archive:f.directory,baselineSha256:f.baselineSha256,input:invalidPath,inputSha256:createHash('sha256').update(invalid).digest('hex'),output:join(f.parent,'refused-utf8')}));
    await writeFile(join(written.directory,'rollback.json'),bytes+' ',{mode:0o600});
    await assert.rejects(readRollbackFixture(written.directory,written.packetSha256,f.archive,f.manifest));
  }finally{await rm(f.parent,{recursive:true,force:true});}
});

test('owned network-none PG17 fixture applies new D1 writes, rolls back late failure/allocator and identically replays',
  {skip:process.env.CATALOG_RECOVERY_TEST_NATIVE!=='1'},async()=>{
    const f=await fixture();let passed=false;try{const written=await f.packet();
      const result=await runNativeRecovery({archive:f.directory,expectedManifestSha256:f.baselineSha256,audit:f.auditPath,expectedAuditSha256:f.auditSha256,workParent:f.parent,
        rollbackFixture:{directory:written.directory,expectedPacketSha256:written.packetSha256}});
      assert.equal(result.receipt.status,'passed');assert.equal(result.receipt.resourcesRemoved,true);
      assert.equal(result.receipt.recoveryMetadata.binding.kind,'same-transaction');
      assert.equal(result.receipt.rollbackFixture.fullFieldTables.length,13);assert.equal(result.receipt.rollbackFixture.changes,5);
      assert.equal(result.receipt.rollbackFixture.lateFailureAtomic,true);assert.equal(result.receipt.rollbackFixture.identicalReplay,true);
      assert.equal(result.receipt.rollbackFixture.nextSequenceVerified,true);assert.equal(result.receipt.rollbackFixture.barrierVerified,false);
      assert.doesNotMatch(JSON.stringify(result.receipt),/CURRENT D1 TITLE|HISTORICAL TEST TITLE|SYNTHETIC PRIVATE/);
      passed=true;if(process.env.CATALOG_RECOVERY_TEST_KEEP==='1')console.log(JSON.stringify({deltaFixtureEvidence:f.parent,receipt:result.receiptPath}));
    }finally{if(passed&&process.env.CATALOG_RECOVERY_TEST_KEEP!=='1')await rm(f.parent,{recursive:true,force:true});}
  });
