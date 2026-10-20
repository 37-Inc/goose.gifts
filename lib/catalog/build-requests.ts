import type { CatalogSnapshot } from './types.ts';
import type { CatalogD1 } from './storage/d1.ts';
import type { PublicationClaim, PublicationIntent } from './publication.ts';
import { publicationStatus } from './publication.ts';
import { rollbackPreflight, visibleRevisionCountQuery } from './d1.ts';
import { canonicalTime } from './snapshot.ts';
import { legacyMutationBatch, legacyMutationGuard, mutationAssertion, mutationFenceQuery } from './mutation-fence.ts';
import type { MutationOwner } from './mutation-fence.ts';
import type { D1Statement } from './storage/d1.ts';

/** Immutable build inputs, not a guessed future release manifest. cutoff is the
 * pruning horizon: a build may retain only products eligible strictly beyond it.
 */
export interface CatalogBuildRequest {
  schemaVersion: 1; environment: 'staging' | 'production'; sourceRevision: string; sourceDigest: string;
  codeSha: string; priorReleaseId: string | null; capturedAt: string; cutoff: string;
}
export interface CatalogBuildClaim {
  requestId: string; token: string; runReference: string; leaseUntil: string; request: CatalogBuildRequest;
}
export interface DeploymentIdentity {
  releaseId: string; codeSha: string; catalogRevision: string; catalogSnapshotSha256: string; manifestSha256: string;
  versionReference: string;
}
/** Trusted external adapter, never an HTTP body asserting success. settled means
 * the serialized deployment owner has independently ruled out in-flight activation.
 * null is verified absence, not a failed read. No provider mutation is injected here.
 */
export interface DeploymentObservation {
  environment: CatalogBuildRequest['environment']; settled: boolean; active: DeploymentIdentity | null;
}
export interface ActivationPermit { requestId: string; token: string; runReference: string; releaseId: string; versionReference: string; mutationOwner?: MutationOwner }
type BuildRow = { request_id: string; environment: string; source_revision: string; request_json: string; state: string;
  lease_token: string | null; lease_until: string | null; attempts: number; dispatch_reference: string | null;
  run_reference: string | null; release_id: string | null; version_reference: string | null };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const KEY = /^[a-zA-Z0-9._-]{1,200}$/;
const HASH = /^[a-f0-9]{64}$/;
const REFERENCE = /^[a-zA-Z0-9._:/-]{1,200}$/;

export function encodeBuildRequest(value: CatalogBuildRequest): string {
  if (!value || Object.keys(value).sort().join(',') !== 'capturedAt,codeSha,cutoff,environment,priorReleaseId,schemaVersion,sourceDigest,sourceRevision'
    || value.schemaVersion !== 1 || !['staging', 'production'].includes(value.environment)
    || typeof value.sourceRevision !== 'string' || !KEY.test(value.sourceRevision)
    || typeof value.sourceDigest !== 'string' || !HASH.test(value.sourceDigest)
    || typeof value.codeSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.codeSha)
    || value.priorReleaseId !== null && (typeof value.priorReleaseId !== 'string' || !KEY.test(value.priorReleaseId))) throw new Error('invalid_build_request');
  const captured = Date.parse(canonicalTime(value.capturedAt)); const cutoff = Date.parse(canonicalTime(value.cutoff));
  if (cutoff <= captured || cutoff - captured > 26 * 3600000) throw new Error('invalid_build_request_horizon');
  return JSON.stringify({ schemaVersion: 1, environment: value.environment, sourceRevision: value.sourceRevision,
    sourceDigest: value.sourceDigest, codeSha: value.codeSha, priorReleaseId: value.priorReleaseId,
    capturedAt: value.capturedAt, cutoff: value.cutoff });
}
async function digest(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function row(db: CatalogD1, id: string): Promise<BuildRow | undefined> {
  return (await db.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').bind(id).all<BuildRow>()).results[0];
}
function input(value: BuildRow): CatalogBuildRequest {
  const request = JSON.parse(value.request_json) as CatalogBuildRequest;
  if (encodeBuildRequest(request) !== value.request_json || request.environment !== value.environment
    || request.sourceRevision !== value.source_revision) throw new Error('build_request_corrupt');
  return request;
}
function sourceGate(request: CatalogBuildRequest) {
  return { sql: `EXISTS(SELECT 1 FROM catalog_revisions c JOIN catalog_projection_receipts p ON p.catalog_revision=c.revision
      AND p.source_export_sha256=c.source_export_sha256 WHERE c.revision=? AND c.status IN ('reconciled','published') AND p.snapshot_sha256=?)
    AND ?<=${NOW} AND ?>${NOW}
    AND (? IS NULL OR EXISTS(SELECT 1 FROM publication_receipts WHERE release_id=?))`,
  params: [request.sourceRevision, request.sourceDigest, request.capturedAt, request.cutoff, request.priorReleaseId, request.priorReleaseId] };
}

/** Only the confirmed creator may dispatch. Unknown/lost writes require explicit
 * dispatch reconciliation; blindly repeating an external dispatch is not safe.
 */
export async function enqueueBuildRequest(db: CatalogD1, request: CatalogBuildRequest) {
  const bytes = encodeBuildRequest(request); const requestId = await digest(bytes); const gate = sourceGate(request);
  const result = await db.prepare(`INSERT INTO catalog_build_requests(request_id,environment,source_revision,request_json)
    SELECT ?,?,?,? WHERE ${gate.sql} ON CONFLICT(request_id) DO NOTHING`)
    .bind(requestId, request.environment, request.sourceRevision, bytes, ...gate.params).run() as { success?: boolean; meta?: { changes?: number } };
  const stored = await row(db, requestId);
  if (!stored || stored.request_json !== bytes) throw new Error('build_source_unavailable_or_expired');
  return { requestId, created: result.success === true && result.meta?.changes === 1 };
}
export async function recordBuildDispatch(db: CatalogD1, requestId: string, reference: string | null): Promise<void> {
  if (reference !== null && (typeof reference !== 'string' || !REFERENCE.test(reference))) throw new Error('invalid_build_reference');
  await db.prepare(`UPDATE catalog_build_requests SET dispatch_reference=?,error_code=? WHERE request_id=?
    AND dispatch_reference IS NULL AND state IN ('pending','building')`)
    .bind(reference, reference === null ? 'dispatch_unconfirmed' : null, requestId).run();
}
/** Queue wait consumes no lease. A protected workflow claims only when it starts.
 * Expired building owners may retry at most3 times; activating owners never expire.
 */
export async function claimBuildRequest(db: CatalogD1, requestId: string, runReference: string, now = new Date(), leaseMs = 600000): Promise<CatalogBuildClaim | null> {
  if (typeof runReference !== 'string' || !REFERENCE.test(runReference)) throw new Error('invalid_build_reference');
  const stored = await row(db, requestId); if (!stored) throw new Error('build_request_missing');
  const request = input(stored); const gate = sourceGate(request); const token = crypto.randomUUID();
  const leaseUntil = new Date(Math.min(now.getTime() + Math.max(1000, Math.min(leaseMs, 900000)), Date.parse(request.cutoff))).toISOString();
  await db.batch([
    db.prepare(`UPDATE catalog_build_requests SET state='failed',lease_token=NULL,lease_until=NULL,error_code='build_failed'
      WHERE environment=? AND source_revision=? AND state='building' AND lease_until<=${NOW}`).bind(request.environment, request.sourceRevision),
    db.prepare(`UPDATE catalog_build_requests SET state='building',lease_token=?,lease_until=?,run_reference=?,attempts=attempts+1,
      release_id=NULL,version_reference=NULL,error_code=NULL WHERE request_id=? AND state IN ('pending','failed') AND attempts<3
      AND NOT EXISTS(SELECT 1 FROM catalog_build_requests WHERE environment=? AND
        (state='activating' OR (source_revision=? AND state='building')))
      AND ?>${NOW} AND ${gate.sql}`)
      .bind(token, leaseUntil, runReference, requestId, request.environment, request.sourceRevision, leaseUntil, ...gate.params),
  ]);
  const claimed = await row(db, requestId);
  return claimed?.state === 'building' && claimed.lease_token === token
    ? { requestId, token, runReference, leaseUntil, request } : null;
}
export async function failBuildRequest(db: CatalogD1, claim: CatalogBuildClaim): Promise<void> {
  await db.prepare(`UPDATE catalog_build_requests SET state='failed',lease_token=NULL,lease_until=NULL,error_code='build_failed'
    WHERE request_id=? AND lease_token=? AND run_reference=? AND state='building' AND lease_until>${NOW}`)
    .bind(claim.requestId, claim.token, claim.runReference).run();
}
async function observe(adapter: (signal: AbortSignal) => Promise<DeploymentObservation>): Promise<DeploymentObservation> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([adapter(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('deployment_observation_failed')); controller.abort(); }, 3000);
    })]);
  } catch { throw new Error('deployment_observation_failed'); } finally { clearTimeout(timer); }
}
function matches(active: DeploymentIdentity, intent: PublicationIntent) {
  return active.releaseId === intent.releaseId && active.codeSha === intent.codeSha && active.catalogRevision === intent.catalogRevision
    && active.catalogSnapshotSha256 === intent.catalogSnapshotSha256 && active.manifestSha256 === intent.manifestSha256
    && typeof active.versionReference === 'string' && REFERENCE.test(active.versionReference);
}
async function priorMatches(db: CatalogD1, request: CatalogBuildRequest, active: DeploymentIdentity | null): Promise<boolean> {
  if (request.priorReleaseId === null) return active === null;
  const prior = (await db.prepare('SELECT code_sha,catalog_revision,manifest_json FROM publication_receipts WHERE release_id=?')
    .bind(request.priorReleaseId).all<{ code_sha: string; catalog_revision: string; manifest_json: string }>()).results[0];
  if (!active || !prior) return false;
  const intent = JSON.parse(prior.manifest_json) as PublicationIntent;
  return intent.releaseId === request.priorReleaseId && intent.codeSha === prior.code_sha
    && intent.catalogRevision === prior.catalog_revision && matches(active, intent);
}

/** Returns permission to activate exactly one already-uploaded version, NOT proof
 * of activation. The real workflow must hold environment-wide GitHub concurrency;
 * all writers must honor importing/activating barriers. There is no cross-system
 * atomicity: after this CAS, unknown provider outcomes stay fenced until resolved.
 */
export async function beginBuildActivation(db: CatalogD1, claim: CatalogBuildClaim, snapshot: CatalogSnapshot,
  publication: PublicationClaim, versionReference: string, readDeployment: (signal: AbortSignal) => Promise<DeploymentObservation>, now = new Date(), mutationOwner?: MutationOwner): Promise<ActivationPermit> {
  if (typeof versionReference !== 'string' || !REFERENCE.test(versionReference)) throw new Error('invalid_build_reference');
  const stored = await row(db, claim.requestId);
  if (!stored || stored.state !== 'building' || stored.lease_token !== claim.token
    || stored.request_json !== encodeBuildRequest(claim.request) || stored.run_reference !== claim.runReference) throw new Error('build_fenced');
  const request = input(stored); const intent = publication.intent;
  if (mutationOwner && mutationOwner.environment !== request.environment) throw new Error('build_fenced');
  const mutation = mutationOwner ? mutationFenceQuery(mutationOwner, ['freezing']) : await legacyMutationGuard(db);
  // Receipts are append-only in this protocol; reject publication completed during readback.
  const receiptEpoch = (await db.prepare('SELECT coalesce(max(rowid),0) epoch FROM publication_receipts')
    .all<{ epoch: number }>()).results[0].epoch;
  const observed = await observe(readDeployment);
  if (observed.environment !== request.environment || observed.settled !== true || !(await priorMatches(db, request, observed.active))) throw new Error('build_prior_deployment_changed');
  const earliest = snapshot.products.map(product => product.eligibleUntil).sort()[0] || null;
  if (intent.codeSha !== request.codeSha || intent.priorReleaseId !== request.priorReleaseId || snapshot.catalogRevision !== intent.catalogRevision
    || intent.nextExpiry !== earliest || snapshot.products.some(product => product.eligibleUntil <= request.cutoff)
    || !(await rollbackPreflight(db, snapshot, now)).ok) throw new Error('build_publication_unready');
  const gate = sourceGate(request); const visible = visibleRevisionCountQuery(intent.catalogRevision);
  const statement = db.prepare(`UPDATE catalog_build_requests SET state='activating',lease_until=NULL,release_id=?,version_reference=?
    WHERE request_id=? AND request_json=? AND lease_token=? AND run_reference=? AND state='building' AND lease_until>${NOW}
      AND ${gate.sql}
      AND NOT EXISTS(SELECT 1 FROM catalog_build_requests WHERE environment=? AND state='activating')
      AND (SELECT coalesce(max(rowid),0) FROM publication_receipts)=?
      AND NOT EXISTS(SELECT 1 FROM catalog_revisions WHERE status='importing')
      AND EXISTS(SELECT 1 FROM publication_outbox WHERE intent_id=? AND release_id=? AND intent_json=? AND lease_token=?
        AND state='dispatched' AND lease_until>${NOW})
      AND EXISTS(SELECT 1 FROM catalog_projection_receipts p JOIN catalog_revisions c ON c.revision=p.catalog_revision
        AND c.source_export_sha256=p.source_export_sha256 WHERE p.catalog_revision=? AND p.snapshot_sha256=? AND p.product_count=?
        AND c.status IN ('reconciled','published'))
      AND (${visible.sql})=?
      AND (SELECT coalesce(max(sequence),0) FROM vector_sync_outbox WHERE source_revision=?)=?
      AND NOT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE source_revision=? AND status!='complete')
      AND (? IS NULL OR ?>${NOW}) AND ${mutation.sql}`)
    .bind(intent.releaseId, versionReference, claim.requestId, stored.request_json, claim.token, claim.runReference,
      ...gate.params, request.environment, receiptEpoch, publication.intentId, intent.releaseId, JSON.stringify(intent), publication.token,
      intent.catalogRevision, intent.catalogSnapshotSha256, snapshot.products.length, ...visible.params, snapshot.products.length,
      intent.catalogRevision, intent.vectorSyncWatermark, intent.catalogRevision, intent.nextExpiry, intent.nextExpiry, ...mutation.params);
  if (mutationOwner) {
    const activeOwner: MutationOwner = { ...mutationOwner, phase: 'activating' };
    await db.batch([mutationAssertion(db, mutationOwner, ['freezing']), statement,
      db.prepare(`UPDATE catalog_mutation_scopes SET phase='activating',external_pending=1,activation_request_id=?
        WHERE environment=? AND index_name=? AND ${mutation.sql} AND EXISTS(SELECT 1 FROM catalog_build_requests
          WHERE request_id=? AND state='activating' AND lease_token=? AND run_reference=? AND version_reference=?)`)
        .bind(claim.requestId, mutationOwner.environment, mutationOwner.indexName, ...mutation.params,
          claim.requestId, claim.token, claim.runReference, versionReference), mutationAssertion(db, activeOwner, ['activating'])]);
    return { requestId: claim.requestId, token: claim.token, runReference: claim.runReference, releaseId: intent.releaseId, versionReference, mutationOwner: activeOwner };
  }
  const result = await statement.run() as { success?: boolean; meta?: { changes?: number } };
  if (result.success !== true || result.meta?.changes !== 1) throw new Error('build_fenced_or_preflight_changed');
  return { requestId: claim.requestId, token: claim.token, runReference: claim.runReference, releaseId: intent.releaseId, versionReference };
}

/** No timeout/takeover shortcut for an uncertain activation. The injected adapter
 * must prove settled provider/run state; a target identity alone is not a receipt.
 */
export async function resolveBuildActivation(db: CatalogD1, permit: ActivationPermit,
  readDeployment: (signal: AbortSignal) => Promise<DeploymentObservation>): Promise<'awaiting_receipt' | 'resolved' | 'not_activated'> {
  const stored = await row(db, permit.requestId);
  if (!stored || stored.state !== 'activating' || stored.lease_token !== permit.token || stored.run_reference !== permit.runReference
    || stored.release_id !== permit.releaseId || stored.version_reference !== permit.versionReference) throw new Error('build_fenced');
  const request = input(stored); const observed = await observe(readDeployment);
  if (observed.environment !== request.environment || observed.settled !== true) throw new Error('activation_still_uncertain');
  const finish = async (statement: D1Statement) => {
    if (!permit.mutationOwner) {
      await legacyMutationBatch(db, [statement]);
      const resolved = await row(db, permit.requestId);
      return { success: true, meta: { changes: resolved && ['resolved','failed'].includes(resolved.state) ? 1 : 0 } };
    }
    const owner = permit.mutationOwner; const gate = mutationFenceQuery(owner, ['activating']);
    if (owner.environment !== request.environment) throw new Error('build_fenced');
    await db.batch([mutationAssertion(db, owner, ['activating']), statement,
      db.prepare(`UPDATE catalog_mutation_scopes SET phase='idle',owner_token=NULL,owner_reference=NULL,operation_key=NULL,
        captured_at=NULL,external_pending=0,activation_request_id=NULL WHERE environment=? AND index_name=? AND activation_request_id=?
        AND ${gate.sql} AND EXISTS(SELECT 1 FROM catalog_build_requests WHERE request_id=? AND state IN ('resolved','failed'))`)
        .bind(owner.environment, owner.indexName, permit.requestId, ...gate.params, permit.requestId),
      db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE environment=? AND index_name=?
        AND phase='idle' AND generation=? AND mutation_epoch=?) THEN 'true' ELSE 'mutation_fenced' END)`)
        .bind(owner.environment, owner.indexName, owner.generation, owner.epoch)]);
    return { success: true, meta: { changes: 1 } };
  };
  const outbox = (await db.prepare('SELECT intent_json FROM publication_outbox WHERE release_id=?').bind(permit.releaseId)
    .all<{ intent_json: string }>()).results[0];
  if (!outbox) throw new Error('build_publication_missing');
  if (observed.active && matches(observed.active, JSON.parse(outbox.intent_json)) && observed.active.versionReference === permit.versionReference) {
    const receipt = (await db.prepare('SELECT manifest_json FROM publication_receipts WHERE release_id=?').bind(permit.releaseId)
      .all<{ manifest_json: string }>()).results[0];
    if (!receipt) return 'awaiting_receipt';
    if (receipt.manifest_json !== outbox.intent_json || (await publicationStatus(db, permit.releaseId)).state !== 'published') throw new Error('build_receipt_mismatch');
    const expected = JSON.parse(outbox.intent_json) as PublicationIntent;
    const result = await finish(db.prepare(`UPDATE catalog_build_requests SET state='resolved' WHERE request_id=? AND lease_token=? AND state='activating'
      AND EXISTS(SELECT 1 FROM publication_receipts WHERE release_id=? AND manifest_json=? AND code_sha=? AND catalog_revision=?)`)
      .bind(permit.requestId, permit.token, permit.releaseId, outbox.intent_json, expected.codeSha, expected.catalogRevision)
    );
    if (result.success !== true || result.meta?.changes !== 1) throw new Error('build_fenced');
    return 'resolved';
  }
  if (!(await priorMatches(db, request, observed.active))) throw new Error('activation_resolution_mismatch');
  const result = await finish(db.prepare(`UPDATE catalog_build_requests SET state='failed',lease_token=NULL,error_code='activation_not_applied'
    WHERE request_id=? AND lease_token=? AND state='activating'`).bind(permit.requestId, permit.token));
  if (result.success !== true || result.meta?.changes !== 1) throw new Error('build_fenced');
  return 'not_activated';
}
