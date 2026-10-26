import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile,readdir } from 'node:fs/promises';
import { canonicalJson } from '../scripts/catalog/migration.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { claimMutationOwnership,readMutationOwner } from '../lib/catalog/mutation-fence.ts';
import { prepareUnsentNativeReconciliation } from '../scripts/catalog/unsent-native-recovery.ts';

// Full real migration schema, but entirely synthetic local records. No provider.
async function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const name of(await readdir(new URL('../migrations/d1/',import.meta.url))).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort())
    sql.exec(await readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  const db={prepare(query){let params=[];return{bind(...p){params=p;return this;},
    async all(){return{results:sql.prepare(query).all(...params).map(r=>({...r}))};},async run(){return sql.prepare(query).run(...params);}};}};
  const runId='fixture-failed-run',publicId='00000000-0000-4000-8000-000000000001',productId='B000000001';
  sql.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,is_active,editorial_status,catalog_revision,rights_json,source_record_json,updated_at)
    VALUES(?,?,?,'amazon','Synthetic preserved gift','USD',1,'generated_ready',?,'{}','{}','2026-10-26T15:00:00.000Z')`)
    .run(productId,publicId,'synthetic-gift',runId);
  const nativeBase64=encodePgvectorSendBase64(Array(1536).fill(Math.fround(.01))),provenanceJson=canonicalJson({input:'verified',model:'text-embedding-3-small'});
  sql.prepare(`INSERT INTO catalog_maintenance_products VALUES(?,1,'{}',1,?,?)`).run(productId,nativeBase64,provenanceJson);
  sql.prepare("INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES('staging','fixture-index')").run();
  const owner=await claimMutationOwnership(db,{environment:'staging',indexName:'fixture-index'},
    {phase:'writing',ownerReference:runId,operationKey:'a'.repeat(64)});
  const sourceOperationId='d'.repeat(64),payloadJson=canonicalJson({sequence:9,publicId,catalogRevision:runId,operation:'delete'});
  sql.prepare(`INSERT INTO catalog_maintenance_operations VALUES(?,?,?,?,'staging','fixture-index',?,0,1,'2026-10-26T15:00:00.000Z','null','[]')`)
    .run(sourceOperationId,'e'.repeat(64),runId,runId,owner.generation);
  sql.prepare('UPDATE catalog_mutation_scopes SET mutation_epoch=1').run();owner.epoch=1;
  sql.prepare(`INSERT INTO vector_sync_outbox(sequence,public_id,source_revision,embedding_text_hash,operation,created_at)
    VALUES(9,?,?,?,'delete','2026-10-26T15:00:00.000Z')`).run(publicId,runId,'f'.repeat(64));
  sql.prepare('INSERT INTO catalog_maintenance_vector_payloads VALUES(?,?,?)').run(9,sourceOperationId,payloadJson);
  const input={owner,runId,configSha256:'a'.repeat(64),checkpointSha256:'b'.repeat(64),journalSha256:'c'.repeat(64),
    reviewReference:'fixture/offline-preparation-not-live-authority',queueRow:{...sql.prepare('SELECT * FROM vector_sync_outbox').get()},
    sourceOperationId,payloadJson,productId,nativeBase64,provenanceJson};
  const apply=plan=>{sql.exec('BEGIN');try{for(const q of plan.queries){assert.ok(q.params.length<=100);sql.prepare(q.sql).all(...q.params);}sql.exec('COMMIT');}
    catch(error){sql.exec('ROLLBACK');throw error;}};
  return{sql,db,input,apply};
}

test('prepared CAS retains original native/product/payload/history and owner identity; only removes UNSENT queue work',async t=>{
  const f=await fixture(t),before={...f.sql.prepare('SELECT * FROM products').get()},plan=prepareUnsentNativeReconciliation(f.input);
  assert.equal(plan.executionAuthorized,false);assert.equal(plan.queries.length,12);f.apply(plan);
  assert.deepEqual({...f.sql.prepare('SELECT * FROM products').get()},before);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM vector_sync_outbox').get().n,0);
  assert.equal(f.sql.prepare('SELECT payload_json FROM catalog_maintenance_vector_payloads').get().payload_json,f.input.payloadJson);
  assert.equal(f.sql.prepare('SELECT embedding_native_base64 FROM catalog_maintenance_products').get().embedding_native_base64,f.input.nativeBase64);
  const operation=f.sql.prepare('SELECT * FROM catalog_maintenance_operations WHERE operation_id=?').get(plan.operationId);
  assert.equal(operation.changes_json,'[]'); // Do not replace the last real product-mutation proof.
  assert.deepEqual(JSON.parse(operation.result_json).reconciliation.queueRow,f.input.queueRow);
  assert.equal(JSON.parse(operation.result_json).providerDispatches,0);
  const owner=await readMutationOwner(f.db,f.input.owner);
  assert.equal(owner.phase,'writing');assert.equal(owner.token,f.input.owner.token);assert.equal(owner.generation,f.input.owner.generation);
  assert.equal(owner.epoch,2);assert.equal(f.sql.prepare("SELECT seq FROM sqlite_sequence WHERE name='vector_sync_outbox'").get().seq,9);
  assert.throws(()=>f.apply(plan)); // Lost-response recovery must inspect the exact receipt, not replay blindly.
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,2);
});

test('stale owner, native/payload drift or ANY extra pending work fails atomically',async t=>{
  for(const mutate of [f=>f.sql.prepare('UPDATE catalog_mutation_scopes SET mutation_epoch=2').run(),
    f=>f.sql.prepare("UPDATE catalog_maintenance_products SET embedding_provenance_json='{}'").run(),
    f=>f.sql.prepare('INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at) VALUES(?,?,?,\'upsert\',?)')
      .run(f.input.queueRow.public_id,'other-run','f'.repeat(64),'2026-10-26T15:00:00.000Z')]) {
    const f=await fixture(t),plan=prepareUnsentNativeReconciliation(f.input);mutate(f);
    assert.throws(()=>f.apply(plan));
    assert.equal(f.sql.prepare('SELECT count(*) n FROM vector_sync_outbox WHERE sequence=9').get().n,1);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,1);
  }
});

test('late failure rolls back queue retirement, receipt and epoch together',async t=>{
  const f=await fixture(t),plan=prepareUnsentNativeReconciliation(f.input);
  plan.queries[plan.queries.length-1]={sql:"SELECT json('deliberate-fixture-failure')",params:[]};
  assert.throws(()=>f.apply(plan));assert.equal(f.sql.prepare('SELECT count(*) n FROM vector_sync_outbox').get().n,1);
  assert.equal((await readMutationOwner(f.db,f.input.owner)).epoch,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n,1);
});

test('dispatched/leased/upsert/foreign queue records or an altered payload cannot produce a transaction',async t=>{
  const f=await fixture(t);
  for(const patch of [{attempts:1},{lease_token:'leased'},{lease_until:'2026-10-26T16:00:00.000Z'},
    {mutation_reference:'provider-mutation'},{source_revision:'foreign-run'},{operation:'upsert'}])
    assert.throws(()=>prepareUnsentNativeReconciliation({...f.input,queueRow:{...f.input.queueRow,...patch}}),/recovery_input/);
  assert.throws(()=>prepareUnsentNativeReconciliation({...f.input,payloadJson:'{}'}),/recovery_payload/);
});
