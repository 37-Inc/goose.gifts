import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {planClearedBaseRecovery,applyClearedBaseRecovery,recoveredBaseLink} from '../scripts/catalog/cleared-base-recovery.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';

function fixture(){
  const publicId='00000000-0000-4000-8000-000000000001',id='B000000001',at='2026-10-30T18:00:00.000Z';
  const base={id,publicId,slug:'funny-pickle',title:'Funny pickle',description:'A pickle that tells fortunes.',
    imageUrl:'https://example.invalid/pickle.jpg',affiliateUrl:'https://www.amazon.com/dp/'+id+'?tag=fixture-20',
    source:'amazon',currency:'USD',price:0,isActive:true,qualityScore:.85,eligibleUntil:null,indexable:false,punnyTitle:'Pickle me amused'};
  const grants=Object.fromEntries(['title','description','imageUrl','affiliateUrl','punnyTitle'].map(k=>[k,{basis:'owned',reference:'fixture-original-license',value:base[k]}]));
  const semantic={id,publicId,slug:base.slug,source:'amazon',sourceFacts:{itemDimensions:{weight:'1 pounds'}},qualityScore:.86};
  const {punnyTitle:unused,...degraded}=base;void unused;
  const before={id,public_id:publicId,slug:base.slug,source:'amazon',is_active:1,duplicate_of_product_id:null,
    quality_score:.86,public_display_json:canonicalJson({...degraded,qualityScore:.86}),eligible_until:null,
    rights_json:canonicalJson({persistent:grants}),source_record_json:canonicalJson({source_facts:{itemDimensions:{weight:'1 Pounds'}}}),
    source_facts_hash:'a'.repeat(64),editorial_source_hash:'b'.repeat(64),editorial_status:'stale'};
  const state={product_id:id,version:1,semantic_json:canonicalJson(semantic),embedding_present:1,
    embedding_native_base64:'original-native',embedding_provenance_json:'{"input":"verified"}'};
  const operation={operation_id:'1'.repeat(64),input_sha256:'2'.repeat(64),run_id:'old-failed',catalog_revision:'old-failed',
    environment:'staging',index_name:'fixture',generation:23,prior_epoch:1,next_epoch:2,database_time:at,result_json:'{}',
    changes_json:canonicalJson([{productId:id,beforeSha256:'3'.repeat(64),afterSha256:sha256(canonicalJson(before))}])};
  const owner={environment:'staging',indexName:'fixture',token:'fixture-token',generation:25,epoch:3,phase:'freezing',
    ownerReference:'today:freeze',operationKey:'4'.repeat(64),capturedAt:at};
  const previous={schemaVersion:1,dataKind:'catalog',catalogRevision:'prior',generatedAt:at,products:[base],heldProducts:[],slugHistory:[]};
  const seal={persistent:{generation:21,inventory:[{publicId,productSha256:'3'.repeat(64)}]},projectionReceipt:{catalog_revision:'prior'},
    snapshotSha256:sha256(JSON.stringify(previous)+'\n'),publication:{receiptSha256:'5'.repeat(64)}};
  const input={seal,previous,products:[before],maintenance:[state],operations:[operation],owner,runId:'today',catalogRevision:'today',now:at};
  return{input,plan:()=>planClearedBaseRecovery(input),base,before,state,operation,owner};
}
function database(t,f){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const [table,row]of [['products',f.before],['catalog_maintenance_products',f.state],['catalog_maintenance_operations',f.operation]]){
    const cols=Object.keys(row);sql.exec(`CREATE TABLE ${table}(${cols.map(k=>`${k} ${typeof row[k]==='number'?'REAL':'TEXT'}`).join(',')})`);
    sql.prepare(`INSERT INTO ${table} VALUES(${cols.map(()=>'?')})`).run(...Object.values(row));
  }
  sql.exec('CREATE TABLE catalog_mutation_scopes(environment TEXT,index_name TEXT,owner_token TEXT,generation INTEGER,mutation_epoch INTEGER,phase TEXT,owner_reference TEXT,operation_key TEXT,external_pending INTEGER)');
  sql.prepare('INSERT INTO catalog_mutation_scopes VALUES(?,?,?,?,?,?,?,?,0)').run(f.owner.environment,f.owner.indexName,f.owner.token,
    f.owner.generation,f.owner.epoch,f.owner.phase,f.owner.ownerReference,f.owner.operationKey);
  const db={prepare(query){let params=[];return{bind(...v){params=v;return this;},async all(){return{results:sql.prepare(query).all(...params).map(r=>({...r}))};},execute(){return sql.prepare(query).all(...params);}};},
    async batch(statements){sql.exec('BEGIN');try{for(const s of statements)s.execute();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
  return{sql,db};
}
test('restores only exact licensed base and equivalent facts, leaving source/rights/native untouched',()=>{
  const f=fixture(),plan=f.plan(),c=plan.changes[0];
  assert.deepEqual(JSON.parse(c.after.public_display_json),f.base);
  for(const key of Object.keys(f.before).filter(k=>!['quality_score','public_display_json'].includes(k)))assert.equal(c.after[key],f.before[key]);
  assert.equal(c.nextState.embedding_native_base64,f.state.embedding_native_base64);
  for(const mutate of [x=>x.products[0].is_active=0,x=>x.products[0].rights_json='{}',x=>x.maintenance[0].semantic_json='{"sourceFacts":{"changed":true}}',
    x=>x.operations[0].changes_json='[]',x=>x.seal.snapshotSha256='0'.repeat(64)]){
    const bad=fixture();mutate(bad.input);assert.throws(bad.plan);
  }
});
test('atomic fenced repair is idempotent, preserves original receipt/native, and proves exact carry-forward only',async t=>{
  const f=fixture(),{sql,db}=database(t,f),plan=f.plan(),first=await applyClearedBaseRecovery(db,plan);
  assert.equal(sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,2);
  assert.equal(sql.prepare('SELECT embedding_native_base64 FROM catalog_maintenance_products').get().embedding_native_base64,'original-native');
  assert.deepEqual(await applyClearedBaseRecovery(db,plan),first);
  const operations=sql.prepare('SELECT * FROM catalog_maintenance_operations').all().map(r=>({...r})),after=sql.prepare('SELECT * FROM products').get();
  const input={publicId:f.base.publicId,productId:f.base.id,productSha256:sha256(canonicalJson(after)),priorProductSha256:'3'.repeat(64),
    priorReceiptSha256:'5'.repeat(64),priorSnapshotSha256:f.input.seal.snapshotSha256,priorGeneration:21,owner:first.owner,runId:'today'};
  assert.equal(recoveredBaseLink(operations,input).operation_id,first.operationId);
  for(const key of ['productSha256','priorProductSha256','priorReceiptSha256','priorSnapshotSha256'])assert.equal(recoveredBaseLink(operations,{...input,[key]:'0'.repeat(64)}),null);
  assert.equal(recoveredBaseLink(operations,{...input,runId:'wrong'}),null);
  assert.deepEqual(operations.find(o=>o.operation_id===f.operation.operation_id),f.operation);
});
test('source or owner drift rolls back the entire repair without an epoch or receipt',async t=>{
  for(const kind of ['source','owner'])await t.test(kind,async t=>{
    const f=fixture(),{sql,db}=database(t,f),plan=f.plan();
    sql.exec(kind==='source'?"UPDATE products SET quality_score=.3":"UPDATE catalog_mutation_scopes SET mutation_epoch=4");
    await assert.rejects(applyClearedBaseRecovery(db,plan));
    assert.equal(sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,1);
    assert.equal(sql.prepare('SELECT version FROM catalog_maintenance_products').get().version,1);
  });
});
