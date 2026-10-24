import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdtemp,writeFile,chmod,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareEditorialRepair,applyEditorialRepair,captureEditorialRepair,editorialRepairSha256 as hash} from '../scripts/catalog/editorial-recovery.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';
import {createPersistentCatalogProduct} from '../lib/catalog/snapshot.ts';
import {maintenanceProjection} from '../scripts/catalog/maintenance-state.ts';
import {editorialSourceHash} from '../scripts/ops/catalog-editorial-core.mjs';
import {createCatalogD1Rest} from '../scripts/catalog/d1-write-rest.ts';
import {reviewEditorialRecoveryFiles} from '../scripts/catalog/editorial-recovery-offline.mts';

const NOW='2026-10-24T15:40:00.000Z',cutoff='2026-10-24T17:32:15.176Z',runId='daily-fixture';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const article=Array(18).fill('This plastic button fixture clicks on a synthetic desk for an entirely owned test.').join(' ')+'\n\n'
  +Array(18).fill('Original commentary stays intact while provider metadata changes in this local fixture.').join(' ');
const scope={accountId:'a'.repeat(32),databaseId:uuid(999),databaseName:'fixture-only',workerName:'fixture-only',indexName:'fixture-index',environment:'staging'};
async function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  let dbClock=NOW;sql.function('strftime',(format,instant)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(instant,'now');return dbClock;});
  for(const file of (await readdir(new URL('../migrations/d1/',import.meta.url))).filter(n=>/^00\d\d_.*\.sql$/.test(n)).sort())sql.exec(await readFile(new URL('../migrations/d1/'+file,import.meta.url),'utf8'));
  const owner={environment:'staging',indexName:scope.indexName,token:'fixture-owner',generation:17,epoch:441,phase:'writing',ownerReference:runId,operationKey:'a'.repeat(64),capturedAt:NOW};
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name,owner_token,generation,mutation_epoch,phase,owner_reference,operation_key,captured_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(owner.environment,owner.indexName,owner.token,owner.generation,owner.epoch,owner.phase,owner.ownerReference,owner.operationKey,owner.capturedAt);
  const baseline=[],rows=[],operations=[],changes=[];
  const insert=(table,row)=>sql.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
  for(let n=1;n<=10;n++){
    const p={id:'B'+String(n).padStart(9,'0'),publicId:uuid(n),slug:'fixture-'+n,title:'Original plastic button '+n,
      imageUrl:'https://example.invalid/old.jpg',description:'Owned fixture description.',wittyDescription:'Owned fixture description.',
      affiliateUrl:'https://www.amazon.com/dp/B'+String(n).padStart(9,'0')+'?tag=fixture-20',currency:'USD',source:'amazon',price:'19.99',
      sourceQuery:'synthetic fixture',humorTags:[],punnyTitle:null,qualityScore:'0.8500',isActive:true,embedding:null,rating:null,reviewCount:null,
      editorialWriteup:article,sourceFacts:{material:'plastic',behavior:'clicking button fixture',itemDimensions:{height:'4 inches'}},
      editorialStatus:'generated_ready',editorialQualityScore:'0.9500',editorialModel:'fixture',editorialPromptVersion:'fixture',editorialGeneratedAt:NOW,
      editorialBlockReason:null,duplicateOfProductId:null,contentUpdatedAt:NOW,availabilityStatus:'IN_STOCK',availabilityCheckedAt:NOW,lastVerifiedAt:NOW,createdAt:NOW,updatedAt:NOW};
    p.sourceFactsHash=editorialSourceHash(p);p.editorialSourceHash=p.sourceFactsHash;
    const rights=Object.fromEntries(['title','description','wittyDescription','imageUrl','affiliateUrl','editorialWriteup'].map(k=>[k,{basis:'owned',reference:'synthetic-owned-fixture',value:p[k]}]));
    const base=createPersistentCatalogProduct({product:{...p,qualityScore:.85,editorialQualityScore:.95},rights},new Date(NOW));assert.ok(base?.indexable);
    baseline.push(base);
    const raw=Object.fromEntries(Object.entries(p).filter(([k])=>k!=='embedding').map(([k,v])=>[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),k==='sourceFacts'?JSON.stringify(v):v]));
    const current=n<=8?{...p,...(n<=2?{title:'Changed supplier title '+n}:{}),
      ...(n===1?{imageUrl:'https://example.invalid/new.jpg'}:{sourceFacts:{...p.sourceFacts,itemDimensions:{height:'4 Inches'}}}),editorialStatus:'stale'}
      :{...p,...(n===10?{availabilityStatus:'UNAVAILABLE'}:{})};
    current.sourceFactsHash=editorialSourceHash(current);
    const old={row:{rights_json:canonicalJson(rights),public_display_json:canonicalJson(base)},product:p};
    const projection=maintenanceProjection(current,rights,runId,NOW,false,null,old),bad=JSON.parse(projection.row.public_display_json);
    if(n<=8){delete bad.editorialWriteup;bad.indexable=false;}
    const row={...projection.row,public_display_json:canonicalJson(bad),embedding_text_hash:null,timestamp_provenance_json:'{}',source_record_json:canonicalJson(raw)};
    insert('products',row);
    const sidecar={product_id:p.id,version:1,semantic_json:canonicalJson({...current,persistentBase:bad}),embedding_present:1,embedding_native_base64:'EXACT_FIXTURE_BYTES',embedding_provenance_json:'{"original":"unchanged"}'};
    insert('catalog_maintenance_products',sidecar);
    const actual={...sql.prepare('SELECT * FROM products WHERE id=?').get(p.id)},operationId=sha256('old-operation-'+n),inputSha256=sha256('old-input-'+n);
    const op={operation_id:operationId,input_sha256:inputSha256,run_id:runId,catalog_revision:runId,environment:owner.environment,index_name:owner.indexName,generation:owner.generation,prior_epoch:400+n,next_epoch:401+n,database_time:NOW,result_json:'{}',changes_json:canonicalJson([{productId:p.id,afterSha256:hash(actual)}])};
    insert('catalog_maintenance_operations',op);operations.push(op);rows.push({row:actual,sidecar});
    changes.push({publicId:p.publicId,operationId,inputSha256,productSha256:hash(actual),displaySha256:sha256(actual.public_display_json)});
  }
  const originalProposal={schemaVersion:1,runId,catalogRevision:runId,changes};
  const baselineSnapshotJson=JSON.stringify({schemaVersion:1,dataKind:'catalog',catalogRevision:'prior',generatedAt:NOW,products:baseline,heldProducts:[],slugHistory:[]})+'\n';
  const binding={runId,configSha256:'b'.repeat(64),sourceSha:'c'.repeat(40),manifestSha256:'d'.repeat(64),checkpointSha256:'e'.repeat(64),reservationSha256:'f'.repeat(64),journal:{sequence:416,sha256:'1'.repeat(64)},scope,cutoff,notAfter:'2026-10-25T15:32:15.176Z',owner,baselineSnapshotSha256:sha256(baselineSnapshotJson),minimumBudget:{httpRequests:199,sqlStatements:348,knownRowsRead:24112,knownRowsWritten:225,unconfirmedRequests:0}};
  const context={schemaVersion:1,binding,checkpoint:{phase:'phases_complete',owner,state:{},pins:{},phaseComplete:null},originalProposal,originalProposalSha256:sha256(JSON.stringify(originalProposal)+'\n'),affectedIds:baseline.slice(0,8).map(p=>p.id),baseline,baselineSnapshotJson};
  const initial={httpRequests:199,sqlStatements:348,knownRowsRead:24112,knownRowsWritten:225,unconfirmedRequests:0};
  const capture={schemaVersion:1,binding,observedAt:NOW,budget:initial,rows,operations};
  let checkpoint={sha256:binding.checkpointSha256,checkpoint:structuredClone(context.checkpoint)},clock=NOW,loseAck=false,failCheckpoint=false,before;
  const ledger=new Map();let batches=0,afterQuery;
  const totals=()=>({httpRequests:initial.httpRequests+ledger.size,sqlStatements:initial.sqlStatements+[...ledger.values()].reduce((n,x)=>n+x.units.sqlStatements,0),knownRowsRead:initial.knownRowsRead+[...ledger.values()].reduce((n,x)=>n+(x.settlement?.usage?.rowsRead||0),0),knownRowsWritten:initial.knownRowsWritten+[...ledger.values()].reduce((n,x)=>n+(x.settlement?.usage?.rowsWritten||0),0),unconfirmedRequests:[...ledger.values()].filter(x=>x.settlement?.status!=='known').length});
  async function makeDb(){return createCatalogD1Rest({...scope,token:'FIXTURE_ONLY',limits:{requests:5000,statements:12000,reportedRowsRead:1500000,reportedRowsWritten:30000},accounting:{scope:{accountId:scope.accountId,databaseId:scope.databaseId,databaseName:scope.databaseName},initial:totals(),async reserve(r){ledger.set(r.id,{...r});},async settle(id,s){assert.equal(ledger.get(id).settlement,undefined);ledger.get(id).settlement=s;}},fetch:async(url,init)=>{
    assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+scope.accountId+'/d1/database/'+scope.databaseId));
    if(init.method==='GET')return Response.json({success:true,result:{uuid:scope.databaseId,name:scope.databaseName,read_replication:{mode:'disabled'}}});
    const {batch}=JSON.parse(init.body);assert.ok(batch.length<=50);assert.ok(Buffer.byteLength(init.body)<=512*1024);
    if(batch.some(q=>q.sql.startsWith('UPDATE products'))){batches++;before?.();before=null;}
    sql.exec('BEGIN');let result;
    try{result=batch.map(q=>{assert.ok(q.params.length<=100);const prior=sql.prepare('SELECT total_changes() n').get().n;
      const r={success:true,results:sql.prepare(q.sql).all(...q.params).map(x=>({...x})),meta:{served_by_primary:true,rows_read:1,rows_written:sql.prepare('SELECT total_changes() n').get().n-prior}};afterQuery?.(q);return r;});sql.exec('COMMIT');}catch{sql.exec('ROLLBACK');throw Error('synthetic SQL refusal');}
    if(loseAck&&batch.some(q=>q.sql.startsWith('UPDATE products'))){loseAck=false;throw Error('synthetic committed ACK loss');}
    return Response.json({success:true,result});}});}
  const plan=prepareEditorialRepair(context,capture,NOW);
  const apply=async(db,overrides={})=>applyEditorialRepair({db:db??await makeDb(),plan,planSha256:hash(plan),contextSha256:hash(context),now:()=>clock,checkpoint:{async read(){return structuredClone(checkpoint);},async write(expected,value){assert.equal(expected,checkpoint.sha256);checkpoint={sha256:hash(value),checkpoint:structuredClone(value)};if(failCheckpoint){failCheckpoint=false;throw Error('synthetic checkpoint ACK loss');}}},...overrides});
  return{sql,context,capture,plan,apply,makeDb,totals,ledger,batches:()=>batches,checkpoint:()=>checkpoint,
    setClock(v){clock=v;},setDbClock(v){dbClock=v;},loseAck(){loseAck=true;},loseCheckpoint(){failCheckpoint=true;},beforeBatch(fn){before=fn;},afterQuery(fn){afterQuery=fn;}};
}

test('eight-row repair uses actual atomic REST/SQLite contract; preserves originals/native/history and all ten approval entries',async t=>{
  const f=await fixture(t),before=f.capture.rows.map(p=>structuredClone(p));const result=await f.apply();assert.equal(result.owner.epoch,442);assert.equal(f.batches(),1);
  assert.equal(result.proposal.changes.length,10);assert.deepEqual(result.proposal.changes.slice(8),f.context.originalProposal.changes.slice(8));
  for(let i=0;i<10;i++){const row=f.sql.prepare('SELECT * FROM products WHERE id=?').get(before[i].row.id),side=f.sql.prepare('SELECT * FROM catalog_maintenance_products WHERE product_id=?').get(row.id),display=JSON.parse(row.public_display_json);
    assert.equal(display.editorialWriteup,article);assert.equal(display.indexable,i>=8);
    assert.deepEqual({...row,public_display_json:before[i].row.public_display_json},before[i].row);
    assert.equal(side.embedding_native_base64,before[i].sidecar.embedding_native_base64);assert.equal(side.embedding_provenance_json,before[i].sidecar.embedding_provenance_json);
    assert.equal(side.version,i<8?2:1);}
  await f.apply();assert.equal(f.batches(),1);assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,11);
  assert.ok(f.totals().httpRequests>199);assert.ok(f.totals().sqlStatements>348);assert.equal(f.totals().unconfirmedRequests,0);
});
test('committed HTTP ACK loss retains unknown charge; restart reconciles without applying twice',async t=>{
  const f=await fixture(t);f.loseAck();assert.equal((await f.apply()).state,'repaired');assert.equal(f.batches(),1);assert.equal(f.totals().unconfirmedRequests,1);
  const reserved=f.totals();await f.apply();assert.equal(f.batches(),1);assert.equal(f.totals().unconfirmedRequests,1);assert.ok(f.totals().httpRequests>reserved.httpRequests);
});
test('checkpoint ACK loss reuses exact receipt and poststate, never replaying repair',async t=>{
  const f=await fixture(t);f.loseCheckpoint();await assert.rejects(f.apply(),/checkpoint ACK/);await f.apply();assert.equal(f.batches(),1);assert.equal(f.checkpoint().checkpoint.owner.epoch,442);
});
test('bounded current capture retains all charges and refuses changed owner, checkpoint or budget reset',async t=>{
  const f=await fixture(t),db=await f.makeDb(),options={db,context:f.context,checkpoint:async()=>f.checkpoint(),budget:async()=>f.totals(),now:()=>NOW};
  const c=await captureEditorialRepair(options);assert.equal(c.rows.length,10);assert.equal(f.batches(),0);
  assert.ok(c.budget.httpRequests>199);assert.equal(prepareEditorialRepair(f.context,c,NOW).patches.length,8);
  await assert.rejects(captureEditorialRepair({...options,checkpoint:async()=>({...f.checkpoint(),sha256:'0'.repeat(64)})}),/checkpoint/);
  const reset=structuredClone(c);reset.budget.httpRequests=0;assert.throws(()=>prepareEditorialRepair(f.context,reset,NOW),/accounting_reset/);
  const missing=structuredClone(c);delete missing.budget.knownRowsRead;missing.budget.notACharge=1;assert.throws(()=>prepareEditorialRepair(f.context,missing,NOW),/budget/);
  await assert.rejects(captureEditorialRepair({...options,db:{...db,providerIdentity:'cloudflare:wrong:database'}}),/database/);
});
test('database cutoff crossing after local check aborts atomic repair without a partial write or release',async t=>{
  const f=await fixture(t);f.beforeBatch(()=>f.setDbClock(cutoff));await assert.rejects(f.apply());
  assert.equal(f.sql.prepare('SELECT mutation_epoch n FROM catalog_mutation_scopes').get().n,441);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,10);
});
test('terminal database cutoff check rolls back even after all updates and receipt insert',async t=>{
  const f=await fixture(t);f.afterQuery(q=>{if(q.sql.startsWith('INSERT INTO catalog_maintenance_operations'))f.setDbClock(cutoff);});await assert.rejects(f.apply());
  assert.equal(f.sql.prepare('SELECT mutation_epoch n FROM catalog_mutation_scopes').get().n,441);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,10);
});
test('late before-row or sidecar CAS drift rolls back every repair and leaves original owner',async t=>{
  for(const kind of ['product','sidecar','unaffected','owner'])await t.test(kind,async t=>{const f=await fixture(t);
    f.beforeBatch(()=>{if(kind==='product'||kind==='unaffected')f.sql.prepare('UPDATE products SET description=? WHERE id=?').run('changed',f.capture.rows[kind==='unaffected'?9:3].row.id);
      else if(kind==='sidecar')f.sql.prepare('UPDATE catalog_maintenance_products SET version=version+1 WHERE product_id=?').run(f.capture.rows[3].row.id);
      else f.sql.prepare('UPDATE catalog_mutation_scopes SET captured_at=?').run('2026-10-24T15:40:01.000Z');});
    await assert.rejects(f.apply());assert.equal(f.sql.prepare('SELECT mutation_epoch n FROM catalog_mutation_scopes').get().n,441);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,10);
    assert.equal(JSON.parse(f.sql.prepare('SELECT public_display_json p FROM products WHERE id=?').get(f.capture.rows[0].row.id).p).editorialWriteup,undefined);
  });
});
test('changed binding/plan, elapsed cutoff, substantive facts and wrong article/grants cannot produce repair authority',async t=>{
  const f=await fixture(t);
  for(const field of ['runId','configSha256','sourceSha','manifestSha256','checkpointSha256','reservationSha256']){
    const c=structuredClone(f.capture);c.binding[field]='wrong';assert.throws(()=>prepareEditorialRepair(f.context,c,NOW));}
  assert.throws(()=>prepareEditorialRepair(f.context,f.capture,cutoff),/expired/);f.setClock(cutoff);await assert.rejects(f.apply(),/expired/);assert.equal(f.batches(),0);
  for(const patch of [p=>{p.sourceFacts.material='metal';},p=>{p.editorialWriteup='Different article';},p=>{p.sourceFacts.itemDimensions.height='5 inches';},
    p=>{p.sourceFacts.color='blue';},p=>{p.sourceFacts.quantity=2;},p=>{delete p.sourceFacts.itemDimensions;},p=>{p.sourceFacts.features=['different claim'];}]){
    const c=structuredClone(f.capture),ctx=structuredClone(f.context),p=JSON.parse(c.rows[0].sidecar.semantic_json);patch(p);p.sourceFactsHash=editorialSourceHash(p);c.rows[0].sidecar.semantic_json=canonicalJson(p);c.rows[0].row.source_facts_hash=p.sourceFactsHash;
    const ch=ctx.originalProposal.changes[0];ch.productSha256=hash(c.rows[0].row);ctx.originalProposalSha256=sha256(JSON.stringify(ctx.originalProposal)+'\n');c.operations[0].changes_json=canonicalJson([{productId:p.id,afterSha256:ch.productSha256}]);
    assert.throws(()=>prepareEditorialRepair(ctx,c,NOW));
  }
});

test('forged plan or replaced proposal, source snapshot, or unknown original quality cannot authorize repair',async t=>{
  const f=await fixture(t);
  const bad=structuredClone(f.plan);bad.proposal.changes[0].productSha256='0'.repeat(64);
  await assert.rejects(f.apply(undefined,{plan:bad,planSha256:hash(bad)}),/plan/);assert.equal(f.batches(),0);
  const ctx=structuredClone(f.context);ctx.baselineSnapshotJson=ctx.baselineSnapshotJson.replace('Original plastic button 1','Different baseline');
  assert.throws(()=>prepareEditorialRepair(ctx,f.capture,NOW),/snapshot/);
  const capture=structuredClone(f.capture),context=structuredClone(f.context),raw=JSON.parse(capture.rows[0].row.source_record_json);
  raw.editorial_quality_score='unknown';capture.rows[0].row.source_record_json=canonicalJson(raw);
  context.originalProposal.changes[0].productSha256=hash(capture.rows[0].row);context.originalProposalSha256=sha256(JSON.stringify(context.originalProposal)+'\n');
  capture.operations[0].changes_json=canonicalJson([{productId:capture.rows[0].row.id,afterSha256:context.originalProposal.changes[0].productSha256}]);
  assert.throws(()=>prepareEditorialRepair(context,capture,NOW),/original_editorial/);
});
test('post-commit drift refuses retry without automatic rollback, another batch or owner release',async t=>{
  const f=await fixture(t);await f.apply();f.sql.prepare('UPDATE products SET description=? WHERE id=?').run('different',f.capture.rows[0].row.id);
  await assert.rejects(f.apply(),/after_drift/);assert.equal(f.batches(),1);assert.equal(f.checkpoint().checkpoint.owner.phase,'writing');
});
test('failed receipt insertion rolls back all preceding updates, while unknown request cost stays charged',async t=>{
  const f=await fixture(t);f.sql.exec("CREATE TRIGGER synthetic_repair_refusal BEFORE INSERT ON catalog_maintenance_operations BEGIN SELECT RAISE(ABORT,'fixture refusal'); END");
  await assert.rejects(f.apply());assert.equal(f.sql.prepare('SELECT mutation_epoch n FROM catalog_mutation_scopes').get().n,441);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,10);assert.equal(f.totals().unconfirmedRequests,1);
});
test('unwritten checkpoint failure resumes exact committed repair without rewriting products',async t=>{
  const f=await fixture(t);await assert.rejects(f.apply(undefined,{checkpoint:{read:async()=>f.checkpoint(),write:async()=>{throw Error('fixture unwritten checkpoint');}}}),/unwritten/);
  assert.equal(f.checkpoint().checkpoint.owner.epoch,441);await f.apply();assert.equal(f.batches(),1);assert.equal(f.checkpoint().checkpoint.owner.epoch,442);
});
test('oversized exact native before-state refuses REST batch before any write, without increasing limits',async t=>{
  const f=await fixture(t),capture=structuredClone(f.capture);capture.rows[0].sidecar.embedding_native_base64='X'.repeat(300000);
  f.sql.prepare('UPDATE catalog_maintenance_products SET embedding_native_base64=? WHERE product_id=?').run(capture.rows[0].sidecar.embedding_native_base64,capture.rows[0].row.id);
  const plan=prepareEditorialRepair(f.context,capture,NOW);await assert.rejects(f.apply(undefined,{plan,planSha256:hash(plan)}));
  assert.equal(f.batches(),0);assert.equal(f.sql.prepare('SELECT mutation_epoch n FROM catalog_mutation_scopes').get().n,441);
});
test('offline CLI byte-authenticates private saved files, reports hashes only and cannot backdate or dispatch',async t=>{
  const f=await fixture(t),root=await realpath(await mkdtemp(join(tmpdir(),'stupid-editorial-offline-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const c=join(root,'context.json'),p=join(root,'capture.json'),cBytes=JSON.stringify(f.context)+'\n',pBytes=JSON.stringify(f.capture)+'\n';
  await writeFile(c,cBytes,{mode:0o600});await writeFile(p,pBytes,{mode:0o600});
  const args=['--context',c,'--context-sha256',sha256(cBytes),'--capture',p,'--capture-sha256',sha256(pBytes)];
  const report=await reviewEditorialRecoveryFiles(args,()=>NOW);assert.equal(report.liveApproval,false);assert.equal(report.repaired,8);
  assert.doesNotMatch(JSON.stringify(report),/synthetic desk|EXACT_FIXTURE_BYTES|fixture-owner/);
  await assert.rejects(reviewEditorialRecoveryFiles(args,()=>cutoff),/expired/);
  await assert.rejects(reviewEditorialRecoveryFiles([...args,'--live','true'],()=>NOW),/arguments/);
  const bad=[...args];bad[3]='0'.repeat(64);await assert.rejects(reviewEditorialRecoveryFiles(bad,()=>NOW),/digest/);
  await chmod(c,0o644);await assert.rejects(reviewEditorialRecoveryFiles(args,()=>NOW),/private_file/);
  assert.equal(f.batches(),0);
});
