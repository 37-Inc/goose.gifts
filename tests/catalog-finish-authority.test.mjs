import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicationFinishAuthority} from '../lib/catalog/build-requests.ts';
import {approvedCatalogPlanChecks} from '../scripts/catalog/owned-vector-delivery.ts';
const cutoff='2026-10-24T23:00:00.000Z',version='97aedc42-2321-416c-b349-014e13dba563';
const good={authorizationSha256:'a'.repeat(64),reviewedAt:'2026-10-25T05:00:00.000Z',activationDeadline:'2026-10-25T07:00:00.000Z',versionReference:version};
test('fresh finish authority keeps original cutoff while binding canonical two-hour deadline and same immutable version',()=>{
  assert.equal(validatePublicationFinishAuthority(good,cutoff,version),good.activationDeadline);
  for(const change of [{authorizationSha256:'unapproved'},{reviewedAt:'not-a-date'},{activationDeadline:'not-a-date'},
    {activationDeadline:'2026-10-25T07:00:00Z'},{reviewedAt:'2026-10-24T22:00:00.000Z'},
    {activationDeadline:'2026-10-25T07:00:00.001Z'},{activationDeadline:good.reviewedAt},{versionReference:'other'},{extra:true}])
    assert.throws(()=>validatePublicationFinishAuthority({...good,...change},cutoff,version));
});
test('separately authorized proof deadline changes only the temporal read predicate, never historic request or policy',()=>{
  const owner={environment:'production',indexName:'fixture',token:'owner',generation:1,epoch:1,phase:'freezing',ownerReference:'fixture',operationKey:'b'.repeat(64),capturedAt:cutoff};
  const revision={packet:{receipt:{catalog_revision:'fixture'}},priorRow:{},snapshot:{catalogRevision:'fixture'},sourceDigest:'c'.repeat(64),globalVectorWatermark:8,
    request:{context:{publicationReceiptWatermark:7,priorPublication:null,cutoff}}};
  const db={prepare(sql){return{bind(...params){return{sql,params};}};}},before=JSON.stringify(revision);
  const old=approvedCatalogPlanChecks(db,owner,revision),fresh=approvedCatalogPlanChecks(db,owner,revision,good.activationDeadline);
  assert.deepEqual(old[0],fresh[0]);assert.equal(old[1].sql,fresh[1].sql);
  assert.deepEqual(old[1].params.slice(0,-1),fresh[1].params.slice(0,-1));
  assert.equal(old[1].params.at(-1),cutoff);assert.equal(fresh[1].params.at(-1),good.activationDeadline);
  assert.equal(JSON.stringify(revision),before);assert.ok(fresh.every(q=>/^SELECT\b/.test(q.sql)));
});
