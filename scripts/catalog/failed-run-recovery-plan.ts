import { canonicalJson, sha256 } from './migration.ts';
import { mutationFenceQuery } from '../../lib/catalog/mutation-fence.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import type { BudgetTotals } from './run-workspace.ts';

const HASH = /^[a-f0-9]{64}$/;
interface ServingIdentity {
  release_id: string; code_sha: string; catalog_revision: string;
  catalog_snapshot_sha256: string; manifest_sha256: string;
}
interface UnsentWork {
  sequence: number; publicId: string; sourceRevision: string; operation: 'upsert' | 'delete';
  status: 'pending'; attempts: number; leaseToken: string | null; leaseUntil: string | null;
  mutationReference: string | null; rowSha256: string; payloadSha256: string;
  sourceOperationRunId: string; retainedNativeSha256: string;
}
export interface FailedRunRecoveryInput {
  runId: string; configSha256: string; checkpointSha256: string; journalSha256: string;
  checkpointPhase: string; errorCode: string; owner: MutationOwner;
  originalDeadline: string; originalRetentionDeadline: string; usage: BudgetTotals;
  /** From the retained incident and existing reviewed capacity policy. */
  requiredUnsentSequences: number[]; requiredAccountReadHeadroom: number;
  servingIdentity: ServingIdentity;
  /** Future exact read-only capture, not an old report or guessed queue list. */
  observation?: {
    at: string; owner: MutationOwner; externalPending: number;
    pendingDeliveries: number; pendingBuilds: number; pendingOutboxCount: number; unsentWork: UnsentWork[];
    servingIdentity: ServingIdentity; remainingAccountReads: number;
  };
}

/** OFFLINE preparation only: no DB/HTTP, ownership claim/release, counter change,
 * provider dispatch or executable SQL. A future reviewed executor must enforce
 * every captured row/native/payload and original owner fence atomically.
 * Failure recovery is NOT successful catalog publication or daily-job approval.
 */
export function prepareFailedRunRecovery(input: FailedRunRecoveryInput, evaluatedAt: string) {
  if (!input || !input.runId || input.owner?.ownerReference !== input.runId
    || input.checkpointPhase !== 'phase_failed' || input.errorCode !== 'maintenance_delete_review_required'
    || input.owner.phase !== 'writing'
    || ![input.configSha256,input.checkpointSha256,input.journalSha256].every(value => HASH.test(value))
    || ![evaluatedAt,input.originalDeadline,input.originalRetentionDeadline].every(value => Number.isFinite(Date.parse(value)))
    || !Number.isSafeInteger(input.requiredAccountReadHeadroom) || input.requiredAccountReadHeadroom < 1
    || !Array.isArray(input.requiredUnsentSequences) || !input.requiredUnsentSequences.length
    || input.requiredUnsentSequences.some(value => !Number.isSafeInteger(value) || value < 1)
    || Object.values(input.usage).some(value => !Number.isSafeInteger(value) || value < 0))
    throw new Error('failed_recovery_input');
  mutationFenceQuery(input.owner); // Validate the existing owner, never create one.
  const blockers: string[] = [], observation = input.observation;
  if (!observation) blockers.push('fresh_fenced_capture_required');
  else {
    const age = Date.parse(evaluatedAt) - Date.parse(observation.at);
    if (!Number.isFinite(age) || age < 0 || age > 30_000) blockers.push('capture_stale');
    if (canonicalJson(observation.owner) !== canonicalJson(input.owner) || observation.externalPending !== 0)
      blockers.push('original_owner_changed_or_external_effect_pending');
    if (observation.pendingDeliveries !== 0 || observation.pendingBuilds !== 0) blockers.push('pending_external_work');
    if (canonicalJson(observation.servingIdentity) !== canonicalJson(input.servingIdentity)) blockers.push('public_release_changed');
    if (!Number.isSafeInteger(observation.remainingAccountReads) || observation.remainingAccountReads < input.requiredAccountReadHeadroom)
      blockers.push('free_read_headroom_unavailable');
    const work = observation.unsentWork;
    if (!Array.isArray(work) || work.length > 20 || !Number.isSafeInteger(observation.pendingOutboxCount)
      || observation.pendingOutboxCount !== work.length || new Set(work.map(row => row.sequence)).size !== work.length
      || input.requiredUnsentSequences.some(sequence => !work.some(row => row.sequence === sequence))
      || work.some(row => !Number.isSafeInteger(row.sequence) || row.sequence < 1 || !row.publicId
        || row.sourceRevision !== input.runId || row.sourceOperationRunId !== input.runId
        || !['upsert','delete'].includes(row.operation) || row.status !== 'pending' || row.attempts !== 0
        || row.leaseToken !== null || row.leaseUntil !== null || row.mutationReference !== null
        || ![row.rowSha256,row.payloadSha256,row.retainedNativeSha256].every(value => HASH.test(value))))
      blockers.push('queue_not_complete_proven_unsent_original_run');
  }
  const retained = {
    runId: input.runId, configSha256: input.configSha256, checkpointSha256: input.checkpointSha256,
    journalSha256: input.journalSha256, ownerSha256: sha256(canonicalJson(input.owner)),
    requiredUnsentSequences: [...input.requiredUnsentSequences], requiredAccountReadHeadroom: input.requiredAccountReadHeadroom,
    originalDeadline: input.originalDeadline, originalRetentionDeadline: input.originalRetentionDeadline,
    usage: structuredClone(input.usage), servingIdentity: structuredClone(input.servingIdentity),
  };
  return {
    kind: 'failed-run-recovery-preparation' as const, retained, blockers,
    completeFreshCapture: blockers.length === 0, executionAuthorized: false as const,
    steps: [
      'Keep the existing job paused; validate original config/checkpoint/journal and all charges.',
      'Capture exact owner, ALL pending work, immutable payloads/native hashes and fresh Free headroom.',
      'Review a same-run CAS reconciliation retaining complete queue-row/payload history and every native vector.',
      'Supersede only proven UNSENT original-run queue work; never dispatch, mark provider success or restart phases.',
      'Independently verify retained product/native history, terminal failed telemetry and no remaining pending work.',
      'Release ONLY the exact original owner through the established fenced helper; retain generation and monotonic receipt-backed epochs.',
      'Append a failed/partial recovery checkpoint; retain old checkpoints, charges and consumed supplier allowance.',
      'Verify the public web release is unchanged; do not claim a publication receipt or enable daily refresh.',
    ],
    proposedSequences: blockers.length ? [] : observation!.unsentWork.map(row => row.sequence),
    providerCalls: 0, catalogPublication: false, dailyRefreshEnabled: false,
  };
}
