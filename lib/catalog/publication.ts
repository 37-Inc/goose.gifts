import type { CatalogReleaseManifest, CatalogSnapshot } from './types.ts';
import type { CatalogD1 } from './storage/d1.ts';
import { canonicalTime } from './snapshot.ts';
import { rollbackPreflight, visibleRevisionCountQuery } from './d1.ts';
import { legacyMutationBatch, mutationAssertion } from './mutation-fence.ts';
import type { MutationOwner } from './mutation-fence.ts';

/** Compact identity of an independently verified immutable package, not another release registry. */
export type PublicationIntent = Pick<CatalogReleaseManifest, 'releaseId' | 'codeSha' | 'catalogRevision'
  | 'vectorSyncWatermark' | 'priorReleaseId' | 'nextExpiry'> & { catalogSnapshotSha256: string; manifestSha256: string };
export interface PublicationClaim { intentId: string; token: string; leaseUntil: string; intent: PublicationIntent }
type Outbox = { intent_id: string; release_id: string; intent_json: string; state: string; lease_token: string | null;
  lease_until: string | null; attempts: number; dispatch_reference: string | null; error_code: string | null };
const KEY = /^[a-zA-Z0-9._-]{1,200}$/;
const DATABASE_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

function encode(intent: PublicationIntent): string {
  if (!intent || typeof intent.releaseId !== 'string' || !KEY.test(intent.releaseId)
    || typeof intent.catalogRevision !== 'string' || !KEY.test(intent.catalogRevision)
    || typeof intent.codeSha !== 'string' || !/^[a-f0-9]{40}$/.test(intent.codeSha)
    || typeof intent.catalogSnapshotSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(intent.catalogSnapshotSha256)
    || typeof intent.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(intent.manifestSha256)
    || !Number.isSafeInteger(intent.vectorSyncWatermark) || intent.vectorSyncWatermark < 0
    || intent.priorReleaseId !== null && (typeof intent.priorReleaseId !== 'string' || !KEY.test(intent.priorReleaseId))) throw new Error('invalid_publication_intent');
  if (intent.nextExpiry !== null) canonicalTime(intent.nextExpiry);
  return JSON.stringify({ releaseId: intent.releaseId, codeSha: intent.codeSha, catalogRevision: intent.catalogRevision,
    catalogSnapshotSha256: intent.catalogSnapshotSha256, manifestSha256: intent.manifestSha256,
    vectorSyncWatermark: intent.vectorSyncWatermark, priorReleaseId: intent.priorReleaseId, nextExpiry: intent.nextExpiry });
}
// Preserve the original persisted wire order across private checkpoint codecs.
// Do not substitute canonicalJson or rewrite historical outbox/receipt bytes.
export { encode as encodePublicationIntent };
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function row(db: CatalogD1, releaseId: string): Promise<Outbox | undefined> {
  return (await db.prepare('SELECT * FROM publication_outbox WHERE release_id=?').bind(releaseId).all<Outbox>()).results[0];
}
function intentFrom(value: Outbox): PublicationIntent {
  const intent = JSON.parse(value.intent_json) as PublicationIntent;
  if (encode(intent) !== value.intent_json || intent.releaseId !== value.release_id) throw new Error('publication_intent_corrupt');
  return intent;
}
/** All mutable readiness predicates also run within the final receipt transaction. */
function gate(snapshot: CatalogSnapshot, intent: PublicationIntent) {
  const visible = visibleRevisionCountQuery(intent.catalogRevision);
  return { sql: `EXISTS(SELECT 1 FROM catalog_revisions c JOIN catalog_projection_receipts r
      ON r.catalog_revision=c.revision AND r.source_export_sha256=c.source_export_sha256
      WHERE c.revision=? AND c.status IN ('reconciled','published') AND r.snapshot_sha256=? AND r.product_count=?)
    AND (${visible.sql})=?
    AND (SELECT coalesce(max(sequence),0) FROM vector_sync_outbox WHERE source_revision=?)=?
    AND NOT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE source_revision=? AND status!='complete')
    AND (? IS NULL OR ?>${DATABASE_NOW})
    AND (? IS NULL OR EXISTS(SELECT 1 FROM publication_receipts WHERE release_id=?))`, params: [intent.catalogRevision, intent.catalogSnapshotSha256, snapshot.products.length,
      ...visible.params, snapshot.products.length, intent.catalogRevision, intent.vectorSyncWatermark,
      intent.catalogRevision, intent.nextExpiry, intent.nextExpiry, intent.priorReleaseId, intent.priorReleaseId] };
}
async function preflight(db: CatalogD1, snapshot: CatalogSnapshot, intent: PublicationIntent, now: Date): Promise<void> {
  const earliest = snapshot.products.reduce<string | null>((deadline, product) => deadline === null || product.eligibleUntil < deadline ? product.eligibleUntil : deadline, null);
  if (snapshot.dataKind !== 'catalog' || snapshot.catalogRevision !== intent.catalogRevision || intent.nextExpiry !== earliest
    || !(await rollbackPreflight(db, snapshot, now)).ok) throw new Error('publication_preflight_failed');
  const check = gate(snapshot, intent);
  if (!(await db.prepare(`SELECT 1 WHERE ${check.sql}`).bind(...check.params).all()).results.length) throw new Error('publication_preflight_failed');
}
function owned(value: Outbox | undefined, token: string, now: Date, state?: string): value is Outbox {
  return Boolean(value && value.lease_token === token && value.lease_until! > now.toISOString()
    && (state ? value.state === state : ['claimed', 'dispatched'].includes(value.state)));
}

/** Historical completion state, not a claim that this release is still active/fresh. */
export async function publicationStatus(db: CatalogD1, releaseId: string) {
  const value = await row(db, releaseId);
  const receipt = (await db.prepare('SELECT code_sha,catalog_revision,manifest_json FROM publication_receipts WHERE release_id=?')
    .bind(releaseId).all<{ code_sha: string; catalog_revision: string; manifest_json: string }>()).results[0];
  if (receipt) {
    if (!value || receipt.manifest_json !== value.intent_json || receipt.code_sha !== intentFrom(value).codeSha
      || receipt.catalog_revision !== intentFrom(value).catalogRevision) throw new Error('publication_receipt_mismatch');
    return { state: 'published', attempts: value.attempts, leaseUntil: null, errorCode: null };
  }
  if (value?.state === 'verified') throw new Error('publication_receipt_missing');
  return { state: value?.state || 'missing', attempts: value?.attempts || 0, leaseUntil: value?.lease_until || null, errorCode: value?.error_code || null };
}
export async function enqueuePublication(db: CatalogD1, snapshot: CatalogSnapshot, intent: PublicationIntent, now = new Date()): Promise<string> {
  const bytes = encode(intent); const id = await digest(bytes);
  await preflight(db, snapshot, intent, now);
  await db.prepare(`INSERT INTO publication_outbox(intent_id,release_id,catalog_revision,intent_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(release_id) DO NOTHING`)
    .bind(id, intent.releaseId, intent.catalogRevision, bytes, now.toISOString(), now.toISOString()).run();
  const value = await row(db, intent.releaseId);
  if (!value || value.intent_id !== id || value.intent_json !== bytes) throw new Error('publication_intent_conflict');
  return id;
}
export async function claimPublication(db: CatalogD1, snapshot: CatalogSnapshot, releaseId: string, now = new Date(), leaseMs = 600_000): Promise<PublicationClaim | null> {
  const value = await row(db, releaseId);
  if (!value) throw new Error('publication_intent_missing');
  const intent = intentFrom(value);
  await preflight(db, snapshot, intent, now);
  const token = crypto.randomUUID();
  const leaseUntil = new Date(Math.min(now.getTime() + Math.max(1000, Math.min(leaseMs, 900_000)), intent.nextExpiry === null ? Infinity : Date.parse(intent.nextExpiry))).toISOString();
  const check = gate(snapshot, intent);
  await db.batch([
    db.prepare(`UPDATE publication_outbox SET state='pending',lease_token=NULL,lease_until=NULL,updated_at=?
      WHERE catalog_revision=? AND state IN ('claimed','dispatched') AND lease_until<=${DATABASE_NOW}`).bind(now.toISOString(), intent.catalogRevision),
    db.prepare(`UPDATE publication_outbox SET state='claimed',lease_token=?,lease_until=?,attempts=attempts+1,
      dispatch_reference=NULL,error_code=NULL,updated_at=? WHERE intent_id=? AND state IN ('pending','failed') AND attempts<3
      AND NOT EXISTS(SELECT 1 FROM publication_outbox active WHERE active.catalog_revision=? AND active.state IN ('claimed','dispatched'))
      AND ?>${DATABASE_NOW} AND ${check.sql}`).bind(token, leaseUntil, now.toISOString(), value.intent_id, intent.catalogRevision, leaseUntil, ...check.params),
  ]);
  const claimed = await row(db, releaseId);
  return owned(claimed, token, now, 'claimed') ? { intentId: value.intent_id, token, leaseUntil, intent } : null;
}
export async function failPublication(db: CatalogD1, releaseId: string, token: string, now: Date): Promise<void> {
  await db.prepare(`UPDATE publication_outbox SET state='failed',lease_token=NULL,lease_until=NULL,error_code='dispatch_failed',updated_at=?
    WHERE release_id=? AND lease_token=? AND state='claimed' AND lease_until>${DATABASE_NOW}`)
    .bind(now.toISOString(), releaseId, token).run();
}
export async function recordPublicationDispatch(db: CatalogD1, snapshot: CatalogSnapshot, claim: PublicationClaim, reference: string, now: Date): Promise<void> {
  if (!/^[a-zA-Z0-9._:/-]{1,200}$/.test(reference)) throw new Error('invalid_dispatch_reference');
  const check = gate(snapshot, claim.intent);
  await db.prepare(`UPDATE publication_outbox SET state='dispatched',dispatch_reference=?,updated_at=?
    WHERE intent_id=? AND lease_token=? AND intent_json=? AND state='claimed' AND lease_until>${DATABASE_NOW} AND ${check.sql}`)
    .bind(reference, now.toISOString(), claim.intentId, claim.token, encode(claim.intent), ...check.params).run();
  if (!owned(await row(db, claim.intent.releaseId), claim.token, now, 'dispatched')) throw new Error('publication_fenced');
}

/** readDeployed is trusted orchestration, not an HTTP body claiming a deploy succeeded.
 * It must independently verify deployed package identity AND Vectorize visibility at the watermark.
 * Real workflows must also check their lease before activation; fencing D1 cannot undo an external deploy.
 */
export async function completePublication(db: CatalogD1, snapshot: CatalogSnapshot, releaseId: string, token: string,
  readDeployed: (intent: PublicationIntent) => Promise<PublicationIntent>, now: () => Date = () => new Date(), mutationOwner?: MutationOwner): Promise<void> {
  const value = await row(db, releaseId);
  if (!owned(value, token, now(), 'dispatched')) throw new Error('publication_fenced');
  const intent = intentFrom(value);
  let deployed: PublicationIntent;
  try { deployed = await readDeployed(intent); }
  catch { throw new Error('publication_readback_failed'); } // Leave dispatched/retryable, never log adapter errors.
  if (encode(deployed) !== value.intent_json) throw new Error('publication_readback_mismatch');
  const at = now();
  await preflight(db, snapshot, intent, at);
  const check = gate(snapshot, intent);
  const statements = [
    db.prepare(`INSERT INTO publication_receipts(release_id,catalog_revision,code_sha,completed_at,manifest_json)
      SELECT ?,?,?,${DATABASE_NOW},? WHERE EXISTS(SELECT 1 FROM publication_outbox WHERE intent_id=? AND lease_token=?
        AND state='dispatched' AND lease_until>${DATABASE_NOW}) AND ${check.sql}`)
      .bind(releaseId, intent.catalogRevision, intent.codeSha, value.intent_json, value.intent_id, token, ...check.params),
    db.prepare(`UPDATE catalog_revisions SET status='published' WHERE revision=? AND EXISTS(
      SELECT 1 FROM publication_receipts WHERE release_id=? AND manifest_json=?)`).bind(intent.catalogRevision, releaseId, value.intent_json),
    db.prepare(`UPDATE publication_outbox SET state='verified',completed_token=?,lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=?
      WHERE intent_id=? AND lease_token=? AND state='dispatched' AND EXISTS(
        SELECT 1 FROM publication_receipts WHERE release_id=? AND manifest_json=?)`)
      .bind(token, at.toISOString(), value.intent_id, token, releaseId, value.intent_json),
  ];
  if (mutationOwner) await db.batch([mutationAssertion(db, mutationOwner, ['activating']),
    db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes s JOIN catalog_build_requests b
      ON b.request_id=s.activation_request_id WHERE s.environment=? AND s.index_name=? AND b.environment=s.environment
      AND b.state='activating' AND b.release_id=?) THEN 'true' ELSE 'mutation_fenced' END)`)
      .bind(mutationOwner.environment, mutationOwner.indexName, releaseId), ...statements]);
  else await legacyMutationBatch(db, statements);
  const completed = await db.prepare('SELECT completed_token FROM publication_outbox WHERE intent_id=?')
    .bind(value.intent_id).all<{ completed_token: string | null }>();
  if (completed.results[0]?.completed_token !== token) throw new Error('publication_fenced_or_preflight_changed');
  if ((await publicationStatus(db, releaseId)).state !== 'published') throw new Error('publication_fenced_or_preflight_changed');
}
