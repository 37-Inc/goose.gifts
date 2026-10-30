import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './helpers/published-vector-fixture.mjs';
import {withdrawUnpublishedCohort} from '../scripts/catalog/withdraw-unpublished-cohort.ts';
import {unabandonedImportsQuery} from '../lib/catalog/mutation-fence.ts';
import {approvedCohortOperationKey} from '../lib/catalog/freeze-approved-cohort.ts';
import {createProjectionPacket,projectionQueries} from '../lib/catalog/d1.ts';
import {enqueueBuildRequest} from '../lib/catalog/build-requests.ts';

async function fixture(t){
  const f=await setup(t),packet=await createProjectionPacket({...f.revision.snapshot,catalogRevision:'bad-unpublished'},
    Object.fromEntries(f.revision.packet.rows.map(r=>[r.public_id,r.source_facts_hash])),f.revision.sourceDigest,f.now()),receipt=packet.receipt;
  f.sql.prepare("INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,'importing')")
    .run(receipt.catalog_revision,receipt.created_at,receipt.source_export_sha256);
  for(const q of projectionQueries(packet))f.sql.prepare(q.sql).run(...q.params);
  const input={catalogRevision:receipt.catalog_revision,projectionReceipt:receipt,cutoff:new Date(f.now().getTime()-1).toISOString(),approvalReference:'a'.repeat(64)};
  return{f,input};
}
test('expired unpublished plan withdraws as control only, preserving all projections and old journals',async t=>{
  const {f,input}=await fixture(t),before=f.sql.prepare('SELECT count(*) n FROM catalog_public_products').get().n;
  const old=f.sql.prepare('SELECT request_json FROM catalog_vector_deliveries ORDER BY rowid').all();
  const owner=await withdrawUnpublishedCohort(f.db,f.owner,input);
  assert.equal(owner.epoch,f.owner.epoch+1);assert.deepEqual(await withdrawUnpublishedCohort(f.db,f.owner,input),owner);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_public_products').get().n,before);
  assert.deepEqual(f.sql.prepare('SELECT request_json FROM catalog_vector_deliveries ORDER BY rowid LIMIT ?').all(old.length),old);
  const last=f.sql.prepare('SELECT * FROM catalog_vector_deliveries ORDER BY rowid DESC LIMIT 1').get();
  assert.equal(last.attempts,0);assert.equal(last.dispatch_token,null);assert.equal(JSON.parse(last.request_json).kind,'catalog-withdrawal');
  const q=await unabandonedImportsQuery(f.db,f.owner.environment);
  assert.equal(f.sql.prepare('SELECT '+q.sql+' ok').get(...q.params).ok,1);
});
test('future window, changed receipt, stale owner or existing build cannot be withdrawn',async t=>{
  for(const fault of ['future','receipt','owner','build'])await t.test(fault,async t=>{
    const {f,input}=await fixture(t),owner={...f.owner};
    if(fault==='future')input.cutoff=new Date(f.now().getTime()+1000).toISOString();
    if(fault==='receipt')input.projectionReceipt.source_export_sha256='0'.repeat(64);
    if(fault==='owner')owner.epoch++;
    if(fault==='build'){
      f.sql.prepare("UPDATE catalog_revisions SET status='reconciled' WHERE revision=?").run(input.catalogRevision);
      await enqueueBuildRequest(f.db,{...f.published.request,sourceRevision:input.catalogRevision,sourceDigest:input.projectionReceipt.snapshot_sha256});
    }
    const before=f.sql.prepare('SELECT total_changes() n').get().n;
    await assert.rejects(withdrawUnpublishedCohort(f.db,owner,input));
    assert.equal(f.sql.prepare('SELECT total_changes() n FROM catalog_revisions WHERE abandonment_delivery_id IS NOT NULL').all().length,0);
    assert.ok(f.sql.prepare('SELECT total_changes() n').get().n>=before);
  });
});
test('recovery target revision is explicitly bound without relabeling original ingestion approvals',async t=>{
  const f=await setup(t),request=f.revision.request,original=structuredClone(request.approval);
  const key=approvedCohortOperationKey(request);
  assert.notEqual(approvedCohortOperationKey({...request,publicationRevision:'publication-recovery'}),key);
  assert.deepEqual(request.approval,original);
  for(const revision of [request.previous.catalogRevision,request.approval.catalogRevision,'bad target','x'.repeat(65)])
    assert.throws(()=>approvedCohortOperationKey({...request,publicationRevision:revision}));
});
