import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareFailedRunRecovery } from '../scripts/catalog/failed-run-recovery-plan.ts';

const NOW = '2026-10-26T19:30:00.000Z';
function fixture() {
  const owner = { environment:'staging',indexName:'fixture-index',token:'fixture-owner',generation:23,epoch:530,
    phase:'writing',ownerReference:'fixture-run',operationKey:'a'.repeat(64),capturedAt:'2026-10-26T15:33:09.324Z' };
  const servingIdentity = { release_id:'fixture-web',code_sha:'a'.repeat(40),catalog_revision:'accepted-fixture',
    catalog_snapshot_sha256:'a'.repeat(64),manifest_sha256:'b'.repeat(64) };
  return { runId:'fixture-run',configSha256:'a'.repeat(64),checkpointSha256:'b'.repeat(64),journalSha256:'c'.repeat(64),
    checkpointPhase:'phase_failed',errorCode:'maintenance_delete_review_required',owner,
    originalDeadline:'2026-10-26T17:32:48.257Z',originalRetentionDeadline:'2026-10-27T15:32:48.257Z',
    usage:{httpRequests:204,sqlStatements:324,knownRowsRead:47897,knownRowsWritten:173,unconfirmedRequests:1},servingIdentity,
    requiredUnsentSequences:[9],requiredAccountReadHeadroom:350000,
    observation:{at:NOW,owner:structuredClone(owner),externalPending:0,pendingDeliveries:0,pendingBuilds:0,pendingOutboxCount:1,remainingAccountReads:400000,
      servingIdentity:structuredClone(servingIdentity),unsentWork:[{sequence:9,publicId:'fixture-public-id',sourceRevision:'fixture-run',
        operation:'delete',status:'pending',attempts:0,leaseToken:null,leaseUntil:null,mutationReference:null,
        rowSha256:'a'.repeat(64),payloadSha256:'b'.repeat(64),sourceOperationRunId:'fixture-run',retainedNativeSha256:'c'.repeat(64)}]} };
}

test('preparation preserves owner evidence, original deadlines, uncertain charges and actual independent web release', () => {
  const input=fixture(), before=structuredClone(input), plan=prepareFailedRunRecovery(input,NOW);
  assert.deepEqual(input,before); assert.equal(plan.completeFreshCapture,true); assert.deepEqual(plan.proposedSequences,[9]);
  assert.equal(plan.executionAuthorized,false); assert.equal(plan.catalogPublication,false); assert.equal(plan.dailyRefreshEnabled,false);
  assert.deepEqual(plan.retained.usage,input.usage); assert.deepEqual(plan.retained.servingIdentity,input.servingIdentity);
  assert.equal(plan.retained.originalDeadline,input.originalDeadline); assert.equal(plan.providerCalls,0);
  assert.doesNotMatch(JSON.stringify(plan),/fixture-owner|"sql"|"token"/);
});

test('old metadata and a known sequence are not a complete fresh fenced capture', () => {
  const input=fixture(); delete input.observation;
  const plan=prepareFailedRunRecovery(input,NOW);
  assert.deepEqual(plan.blockers,['fresh_fenced_capture_required']); assert.deepEqual(plan.proposedSequences,[]);
  input.observation=fixture().observation; input.observation.at='2026-10-26T19:29:00.000Z';
  assert.ok(prepareFailedRunRecovery(input,NOW).blockers.includes('capture_stale'));
});

test('owner takeover/epoch change, external work, changed release and low/unknown headroom block', () => {
  for (const patch of [o=>o.owner.epoch++,o=>o.owner.token='other-owner',o=>o.externalPending=1,
    o=>o.pendingDeliveries=1,o=>o.pendingBuilds=1,o=>o.servingIdentity.release_id='newer-web',
    o=>o.remainingAccountReads=349999,o=>o.remainingAccountReads=NaN]) {
    const input=fixture();patch(input.observation);
    const plan=prepareFailedRunRecovery(input,NOW);assert.ok(plan.blockers.length);assert.deepEqual(plan.proposedSequences,[]);
  }
});

test('any dispatched, leased, foreign, unproven or duplicate queue work blocks; no skipped rows', () => {
  for (const patch of [r=>r.attempts=1,r=>r.leaseToken='lease',r=>r.leaseUntil=NOW,r=>r.mutationReference='provider-reference',
    r=>r.sourceRevision='other-run',r=>r.sourceOperationRunId='other-run',r=>r.payloadSha256='',r=>r.retainedNativeSha256='',
    r=>r.status='complete',r=>r.operation='guess']) {
    const input=fixture();patch(input.observation.unsentWork[0]);
    assert.ok(prepareFailedRunRecovery(input,NOW).blockers.includes('queue_not_complete_proven_unsent_original_run'));
  }
  const input=fixture();input.observation.unsentWork.push({...input.observation.unsentWork[0]});
  assert.equal(prepareFailedRunRecovery(input,NOW).completeFreshCapture,false);
  const omitted=fixture();omitted.observation.unsentWork=[];
  assert.equal(prepareFailedRunRecovery(omitted,NOW).completeFreshCapture,false);
  const missed=fixture();missed.observation.pendingOutboxCount=2;
  assert.equal(prepareFailedRunRecovery(missed,NOW).completeFreshCapture,false);
});

test('wrong terminal phase, mismatched original run or invalid original pins cannot create a recovery plan', () => {
  for (const patch of [{checkpointPhase:'phases_running'},{errorCode:'different-error'},{runId:'different-run'},
    {configSha256:''},{originalDeadline:'unknown'}])
    assert.throws(()=>prepareFailedRunRecovery({...fixture(),...patch},NOW),/failed_recovery_input/);
});
