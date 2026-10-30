import test from 'node:test';
import assert from 'node:assert/strict';
import {permanentCatalogFixture} from './helpers/permanent-catalog-fixture.mjs';
import {restoreOwnedHistoricalVector} from '../scripts/catalog/owned-vector-delivery.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';
import {nativeHash} from '../scripts/catalog/vector-outbox.ts';

async function fixture(t){
  const f=await permanentCatalogFixture(t),publicId=f.request.productOrder[0];
  const original={...f.sql.prepare(`SELECT * FROM catalog_vector_deliveries WHERE status='complete' AND disposition='verified'
    AND json_extract(request_json,'$.publicId')=? AND json_type(request_json,'$.vector')='object'
    ORDER BY generation DESC,prior_epoch DESC LIMIT 1`).get(publicId)};
  assert.ok(original.delivery_id);const vector=structuredClone(f.index.get(publicId));
  const deletion={...original,delivery_id:sha256('synthetic-confirmed-wrong-delete'),generation:f.owner.generation,
    owner_json:canonicalJson(f.owner),request_json:canonicalJson({...JSON.parse(original.request_json),kind:'prune',vector:null,event:null}),
    attempts:1,dispatch_token:'synthetic-delete',mutation_reference:'synthetic-delete-confirmed',
    evidence_json:canonicalJson([{attempt:1,state:'settled_visible',reference:'synthetic-delete-confirmed'}])};
  const keys=Object.keys(deletion);f.sql.prepare(`INSERT INTO catalog_vector_deliveries(${keys}) VALUES(${keys.map(()=>'?')})`).run(...keys.map(k=>deletion[k]));
  f.index.delete(publicId);
  const options={db:f.db,owner:f.owner,publicId,originalDeliveryId:original.delivery_id,originalSha256:sha256(canonicalJson(original)),
    deletionDeliveryId:deletion.delivery_id,deletionSha256:sha256(canonicalJson(deletion)),adapters:f.adapters};
  return{f,options,original,deletion,vector};
}
test('restores exact historical bits and metadata once, without renewing source or changing public data/history',async t=>{
  const {f,options,original,deletion,vector}=await fixture(t),before=f.dispatches();
  const product={...f.sql.prepare('SELECT * FROM products WHERE public_id=?').get(options.publicId)};
  let result=await restoreOwnedHistoricalVector(options);assert.equal(result.state,'pending');
  result=await restoreOwnedHistoricalVector({...options,owner:result.owner});assert.equal(result.state,'complete');
  assert.equal((await restoreOwnedHistoricalVector({...options,owner:result.owner})).state,'complete');
  assert.equal(f.dispatches(),before+1);assert.deepEqual(f.index.get(options.publicId).metadata,vector.metadata);
  assert.equal(nativeHash(f.index.get(options.publicId).values),nativeHash(vector.values));
  assert.deepEqual({...f.sql.prepare('SELECT * FROM products WHERE public_id=?').get(options.publicId)},product);
  for(const row of [original,deletion])assert.deepEqual({...f.sql.prepare('SELECT * FROM catalog_vector_deliveries WHERE delivery_id=?').get(row.delivery_id)},row);
  assert.equal(f.sql.prepare('SELECT external_pending FROM catalog_mutation_scopes').get().external_pending,0);
});
test('wrong source/deletion hashes cannot dispatch restoration',async t=>{
  const {f,options}=await fixture(t),before=f.dispatches();
  for(const field of ['originalSha256','deletionSha256'])await assert.rejects(restoreOwnedHistoricalVector({...options,[field]:'0'.repeat(64)}));
  assert.equal(f.dispatches(),before);
});
test('unknown restoration acceptance stays owned and is never dispatched twice',async t=>{
  const {f,options}=await fixture(t);let calls=0;
  const adapters={...options.adapters,async dispatch(input,signal){calls++;await options.adapters.dispatch(input,signal);throw Error('lost acceptance');},
    async resolve(){return{state:'pending'};}};
  let r=await restoreOwnedHistoricalVector({...options,adapters});assert.equal(r.state,'pending');
  r=await restoreOwnedHistoricalVector({...options,owner:r.owner,adapters});assert.equal(r.state,'pending');assert.equal(calls,1);
  assert.equal(f.sql.prepare('SELECT external_pending FROM catalog_mutation_scopes').get().external_pending,1);
});
