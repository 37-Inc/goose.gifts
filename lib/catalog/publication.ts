import type { CatalogReleaseManifest, CatalogSnapshot } from './types.ts';
import type { CatalogD1, D1Statement, D1ReadOptions } from './storage/d1.ts';
import { earliestDisplayExpiry } from './display.ts';
import { canonicalTime } from './snapshot.ts';
import { rollbackPreflight, visibleRevisionCountQuery } from './d1.ts';
import { legacyMutationBatch, mutationAssertion, mutationFenceQuery } from './mutation-fence.ts';
import type { MutationOwner } from './mutation-fence.ts';
import type { ActivationPermit, CatalogBuildRequest } from './build-requests.ts';
import { encodeBuildRequest } from './build-requests.ts';
import type { PrunedRevision } from './prune-existing-revision.ts';
import { pruningCurrentQueries, CATALOG_IDENTITY_LIMITS } from './pruning-current.ts';

/** Compact identity of an independently verified immutable package, not another release registry. */
export type PublicationIntent = Pick<CatalogReleaseManifest, 'releaseId' | 'codeSha' | 'catalogRevision'
  | 'vectorSyncWatermark' | 'priorReleaseId' | 'nextExpiry'> & { catalogSnapshotSha256: string; manifestSha256: string };
export interface PublicationClaim { intentId: string; token: string; leaseUntil: string; intent: PublicationIntent }
type Outbox = { intent_id: string; release_id: string; intent_json: string; state: string; lease_token: string | null;
  lease_until: string | null; attempts: number; dispatch_reference: string | null; error_code: string | null };
const KEY = /^[a-zA-Z0-9._-]{1,200}$/;
const DATABASE_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Explicit historical source + NEW code request; never an arbitrary owner-key
 * override. Fixed canonical order is shared with the Node proof reader. */
export interface PublishedCatalogBinding {
  source:{releaseId:string;receiptSha256:string;deliveryId:string;deliverySha256:string}; request:CatalogBuildRequest;
}
export function encodePublishedCatalogBinding({source,request}:PublishedCatalogBinding):string {
  if(!source||typeof source.releaseId!=='string'||!KEY.test(source.releaseId)
    ||Object.keys(source).sort().join(',')!=='deliveryId,deliverySha256,receiptSha256,releaseId'
    ||![source.receiptSha256,source.deliveryId,source.deliverySha256]
    .every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw new Error('invalid_published_catalog_binding');
  return JSON.stringify({kind:'published-catalog-read',request:encodeBuildRequest(request),schemaVersion:1,
    source:{deliveryId:source.deliveryId,deliverySha256:source.deliverySha256,receiptSha256:source.receiptSha256,releaseId:source.releaseId}});
}

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
async function row(db: CatalogD1, releaseId: string, options?: D1ReadOptions): Promise<Outbox | undefined> {
  return (await db.prepare('SELECT * FROM publication_outbox WHERE release_id=?').bind(releaseId).all<Outbox>(options)).results[0];
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
/** Same predicates for the explicit reviewed, original-token activation CAS. */
export { gate as publicationActivationGate };
async function preflight(db: CatalogD1, snapshot: CatalogSnapshot, intent: PublicationIntent, now: Date): Promise<void> {
  const earliest = earliestDisplayExpiry(snapshot.products);
  if (snapshot.dataKind !== 'catalog' || snapshot.catalogRevision !== intent.catalogRevision || intent.nextExpiry !== earliest
    || !(await rollbackPreflight(db, snapshot, now)).ok) throw new Error('publication_preflight_failed');
  const check = gate(snapshot, intent);
  if (!(await db.prepare(`SELECT 1 WHERE ${check.sql}`).bind(...check.params).all()).results.length) throw new Error('publication_preflight_failed');
}
function owned(value: Outbox | undefined, token: string, now: Date, state?: string): value is Outbox {
  return Boolean(value && value.lease_token === token && value.lease_until! > now.toISOString()
    && (state ? value.state === state : ['claimed', 'dispatched'].includes(value.state)));
}
function completionStatements(db: CatalogD1, snapshot: CatalogSnapshot, value: Outbox, token: string, at: Date, requireLease: boolean): D1Statement[] {
  const intent = intentFrom(value), check = gate(snapshot, intent);
  return [
    db.prepare(`INSERT INTO publication_receipts(release_id,catalog_revision,code_sha,completed_at,manifest_json)
      SELECT ?,?,?,${DATABASE_NOW},? WHERE EXISTS(SELECT 1 FROM publication_outbox WHERE intent_id=? AND lease_token=?
        AND state='dispatched' ${requireLease ? `AND lease_until>${DATABASE_NOW}` : ''}) AND ${check.sql}`)
      .bind(value.release_id, intent.catalogRevision, intent.codeSha, value.intent_json, value.intent_id, token, ...check.params),
    db.prepare(`UPDATE catalog_revisions SET status='published' WHERE revision=? AND EXISTS(
      SELECT 1 FROM publication_receipts WHERE release_id=? AND manifest_json=?)`).bind(intent.catalogRevision, value.release_id, value.intent_json),
    db.prepare(`UPDATE publication_outbox SET state='verified',completed_token=?,lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=?
      WHERE intent_id=? AND lease_token=? AND state='dispatched' AND EXISTS(
        SELECT 1 FROM publication_receipts WHERE release_id=? AND manifest_json=?)`)
      .bind(token, at.toISOString(), value.intent_id, token, value.release_id, value.intent_json),
  ];
}
async function completed(db: CatalogD1, value: Outbox, token: string): Promise<void> {
  const result = await db.prepare('SELECT completed_token FROM publication_outbox WHERE intent_id=?')
    .bind(value.intent_id).all<{ completed_token: string | null }>();
  if (result.results[0]?.completed_token !== token || (await publicationStatus(db, value.release_id)).state !== 'published')
    throw new Error('publication_fenced_or_preflight_changed');
}

/** Historical completion state, not a claim that this release is still active/fresh. */
export async function publicationStatus(db: CatalogD1, releaseId: string, options?: D1ReadOptions) {
  options?.signal?.throwIfAborted();
  const value = await row(db, releaseId, options);
  options?.signal?.throwIfAborted();
  const receipt = (await db.prepare('SELECT code_sha,catalog_revision,manifest_json FROM publication_receipts WHERE release_id=?')
    .bind(releaseId).all<{ code_sha: string; catalog_revision: string; manifest_json: string }>(options)).results[0];
  options?.signal?.throwIfAborted();
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
  const statements = completionStatements(db, snapshot, value, token, at, true);
  if (mutationOwner) await db.batch([mutationAssertion(db, mutationOwner, ['activating']),
    db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes s JOIN catalog_build_requests b
      ON b.request_id=s.activation_request_id WHERE s.environment=? AND s.index_name=? AND b.environment=s.environment
      AND b.state='activating' AND b.release_id=?) THEN 'true' ELSE 'mutation_fenced' END)`)
      .bind(mutationOwner.environment, mutationOwner.indexName, releaseId), ...statements]);
  else await legacyMutationBatch(db, statements);
  await completed(db, value, token);
}

/** Settle ONLY an already independently observed original activation. Activation
 * ownership does not expire: elapsed build/publication leases grant neither a
 * takeover nor another deployment. This bounded path renews no lease or rights;
 * fresh original package/current-source/native proof is still mandatory. */
async function completeActivated(db: CatalogD1, revision: PrunedRevision, publication: PublicationClaim, permit: ActivationPermit,
  readDeployed: (intent: PublicationIntent) => Promise<PublicationIntent>, now: () => Date, published?:PublishedCatalogBinding,bulk=false): Promise<void> {
  ({ revision, publication, permit, published } = structuredClone({ revision, publication, permit, published }));
  const owner = permit.mutationOwner, snapshot = revision.snapshot, intent = publication.intent;
  const operationKey=published?await digest(encodePublishedCatalogBinding(published)):revision.operationKey;
  if (!owner || owner.phase !== 'activating' || permit.releaseId !== intent.releaseId || snapshot.products.length > (bulk?CATALOG_IDENTITY_LIMITS.ready:10)
    || revision.sourceRows.length > (bulk?CATALOG_IDENTITY_LIMITS.identities:20)
    ||bulk&&(!revision.nativePreservation||published||snapshot.products.length+snapshot.heldProducts.length!==revision.sourceRows.length)
    || new Set(revision.sourceRows.map(row => row.public_id)).size !== revision.sourceRows.length
    || [...snapshot.products, ...snapshot.heldProducts].some(product => !revision.sourceRows.some(row => row.public_id === product.publicId))
    || revision.request.scope.environment !== owner.environment || revision.request.scope.indexName !== owner.indexName
    || operationKey !== owner.operationKey || !Number.isSafeInteger(revision.globalVectorWatermark) || revision.globalVectorWatermark < 0)
    throw new Error('publication_activation_fenced');
  mutationFenceQuery(owner, ['activating']); // Validate the full owner before any provider read.
  const value = await row(db, intent.releaseId);
  if (!value || value.state !== 'dispatched' || value.lease_token !== publication.token || value.lease_until !== publication.leaseUntil
    || value.intent_id !== publication.intentId || value.intent_json !== encode(intent) || await digest(value.intent_json) !== value.intent_id
    || value.dispatch_reference !== `version:${permit.versionReference}`) throw new Error('publication_activation_fenced');
  const build = (await db.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').bind(permit.requestId).all<Record<string, unknown>>()).results[0];
  const request = build && JSON.parse(String(build.request_json)) as CatalogBuildRequest;
  if (!build || encodeBuildRequest(request) !== build.request_json || await digest(String(build.request_json)) !== permit.requestId
    || request.environment !== owner.environment || request.sourceRevision !== intent.catalogRevision || request.sourceDigest !== intent.catalogSnapshotSha256
    || request.codeSha !== intent.codeSha || request.priorReleaseId !== intent.priorReleaseId) throw new Error('publication_activation_fenced');
  const assertion = (sql: string, params: unknown[]) => db.prepare(`SELECT json(CASE WHEN ${sql} THEN 'true' ELSE 'publication_activation_fenced' END)`).bind(...params);
  const historical:D1Statement[]=[];
  if(published||bulk){
    if(published&&encodeBuildRequest(published.request)!==build.request_json)throw new Error('publication_activation_fenced');
    const binding=published?.source??revision.nativePreservation!.source;
    encodePublishedCatalogBinding({source:binding,request}); // Same exact bounded source identity.
    const journal=(await db.prepare('SELECT * FROM catalog_vector_deliveries WHERE delivery_id=?').bind(binding.deliveryId)
      .all<Record<string,unknown>>()).results;
    const receipts=(await db.prepare('SELECT * FROM publication_receipts WHERE release_id=?').bind(binding.releaseId)
      .all<Record<string,unknown>>()).results;
    if(journal.length!==1||receipts.length!==1)throw new Error('publication_activation_fenced');
    const prior=journal[0],receipt=receipts[0],captured=JSON.parse(String(prior.owner_json)),proof=JSON.parse(String(prior.request_json));
    // These are flat D1 control rows. Hash/compare exact original bytes without
    // importing Node code or rewriting the original captured revision.
    const canonicalRow=(r:Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b))));
    const oldCatalog=bulk?revision.nativePreservation!.plan.catalogRevision:snapshot.catalogRevision;
    if(await digest(canonicalRow(prior))!==binding.deliverySha256||await digest(canonicalRow(receipt))!==binding.receiptSha256
      ||prior.status!=='complete'||prior.disposition!=='verified'||proof.kind!=='approved-cohort-reuse'
      ||proof.catalogRevision!==oldCatalog||prior.environment!==owner.environment||prior.index_name!==owner.indexName
      ||!bulk&&captured.operationKey!==revision.operationKey||captured.environment!==owner.environment||captured.indexName!==owner.indexName
      ||captured.generation!==prior.generation||Number(prior.generation)>=owner.generation
      ||receipt.catalog_revision!==oldCatalog||!bulk&&receipt.code_sha!==revision.request.codeSha
      ||bulk&&(proof.revisionSha256!==revision.nativePreservation!.revisionSha256
        ||JSON.parse(String(receipt.manifest_json)).catalogSnapshotSha256!==revision.nativePreservation!.plan.snapshotSha256))
      throw new Error('publication_activation_fenced');
    for(const [table,r]of [['catalog_vector_deliveries',prior],['publication_receipts',receipt]] as const){
      const keys=Object.keys(r);if(keys.length>65||keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k)))throw new Error('publication_activation_fenced');
      historical.push(assertion(`EXISTS(SELECT 1 FROM ${table} WHERE ${keys.map(k=>`${k} IS ?`).join(' AND ')})`,keys.map(k=>r[k])));
    }
    // Mandatory readDeployed below must still verify the exact original captured
    // revision/current sources/native proof under the NEW permit before writes.
  }
  const check = gate(snapshot, intent), receipt = revision.packet.receipt;
  if (receipt.catalog_revision !== intent.catalogRevision || receipt.snapshot_sha256 !== intent.catalogSnapshotSha256
    || receipt.source_export_sha256 !== revision.sourceDigest || receipt.product_count !== snapshot.products.length
    || revision.packet.rows.length !== receipt.product_count || new Set(revision.packet.rows.map(row => row.public_id)).size !== receipt.product_count
    || snapshot.products.some(product => !revision.packet.rows.some(row => row.public_id === product.publicId)))
    throw new Error('publication_activation_fenced');
  const receiptColumns = ['catalog_revision','snapshot_sha256','projection_sha256','source_export_sha256','product_count','created_at'] as const;
  const projectionColumns = ['catalog_revision','public_id','product_id','slug','title','description','tags','source_facts_hash','eligible_until','public_display_json','display_sha256'];
  const assertions = () => [mutationAssertion(db, owner, ['activating']),...historical,
    assertion(`EXISTS(SELECT 1 FROM catalog_mutation_scopes s JOIN catalog_build_requests b ON b.request_id=s.activation_request_id
      WHERE s.environment=? AND s.index_name=? AND s.captured_at=? AND s.activation_request_id=? AND b.environment=s.environment AND b.state='activating'
      AND b.lease_token=? AND b.lease_until IS ? AND b.run_reference=? AND b.release_id=? AND b.version_reference=? AND b.request_json=? AND b.source_revision=?)
      AND EXISTS(SELECT 1 FROM publication_outbox WHERE intent_id=? AND intent_json=? AND state='dispatched' AND lease_token=? AND lease_until=? AND dispatch_reference=?)
      AND (SELECT coalesce(max(sequence),0) FROM vector_sync_outbox)=? AND NOT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE status!='complete')
      AND EXISTS(SELECT 1 FROM catalog_projection_receipts WHERE ${receiptColumns.map(key => `${key} IS ?`).join(' AND ')})
      AND (SELECT count(*) FROM catalog_public_products WHERE catalog_revision=?)=?
      ${bulk?`AND (SELECT count(*) FROM products)=? AND EXISTS(SELECT 1 FROM publication_receipts WHERE release_id=? AND catalog_revision=?
        AND code_sha=? AND completed_at IS ? AND manifest_json=?) AND (SELECT coalesce(max(rowid),0) FROM publication_receipts)=?`
        :`AND (SELECT count(*) FROM json_each(?) e JOIN catalog_public_products p ON p.catalog_revision=? AND p.public_id=json_extract(e.value,'$.public_id')
        WHERE ${projectionColumns.map(key => `p.${key} IS json_extract(e.value,'$.${key}')`).join(' AND ')})=?`} AND ${check.sql}`,
    [owner.environment, owner.indexName, owner.capturedAt, permit.requestId, permit.token, build.lease_until, permit.runReference, permit.releaseId, permit.versionReference, build.request_json, request.sourceRevision,
      value.intent_id, value.intent_json, publication.token, publication.leaseUntil, value.dispatch_reference, revision.globalVectorWatermark,
      ...receiptColumns.map(key => receipt[key]), intent.catalogRevision, receipt.product_count,
      ...(bulk?[revision.sourceRows.length,...['release_id','catalog_revision','code_sha','completed_at','manifest_json'].map(k=>revision.priorRow[k]),revision.request.context.publicationReceiptWatermark]
        :[JSON.stringify(revision.packet.rows),intent.catalogRevision,receipt.product_count]),...check.params]),
    ...(!bulk?pruningCurrentQueries(revision.sourceRows).map(query => assertion(`(${query.sql})=?`, [...query.params, query.count])):[])];
  const fullRows=async()=>{
    const queries=pruningCurrentQueries(revision.sourceRows).map(q=>({sql:`(${q.sql})=?`,params:[...q.params,q.count]}));
    const add=(rows:typeof revision.packet.rows)=>{
      const q={sql:`(SELECT count(*) FROM json_each(?) e JOIN catalog_public_products p ON p.catalog_revision=?
        AND p.public_id=json_extract(e.value,'$.public_id') WHERE ${projectionColumns.map(k=>`p.${k} IS json_extract(e.value,'$.${k}')`).join(' AND ')})=?`,
        params:[JSON.stringify(rows),intent.catalogRevision,rows.length]};
      if(new TextEncoder().encode(JSON.stringify(q)).length>384*1024){if(rows.length<2)throw new Error('publication_activation_fenced');
        const n=Math.floor(rows.length/2);add(rows.slice(0,n));add(rows.slice(n));}else queries.push(q);
    };
    for(let i=0;i<revision.packet.rows.length;i+=20)add(revision.packet.rows.slice(i,i+20));
    // Same cooperative owner excludes application writers between bounded pages
    // and final compact receipt CAS. Privileged out-of-band SQL is not a barrier.
    let batch:typeof queries=[],bytes=0;
    const flush=async()=>{await db.batch([...assertions(),...batch.map(q=>assertion(q.sql,q.params)),mutationAssertion(db,owner,['activating'])]);batch=[];bytes=0;};
    for(const q of queries){const n=new TextEncoder().encode(JSON.stringify(q)).length;if(batch.length>=40||bytes+n>400*1024)await flush();batch.push(q);bytes+=n;}
    if(batch.length)await flush();
  };
  // Owner/source assertions run before the trusted provider read and again in
  // the final receipt transaction. There is no upload/activate/claim callback.
  if(bulk)await fullRows();else await db.batch(assertions());
  let deployed: PublicationIntent;
  try { deployed = await readDeployed(intent); } catch { throw new Error('publication_readback_failed'); }
  if (encode(deployed) !== value.intent_json) throw new Error('publication_readback_mismatch');
  const at = now(); await preflight(db, snapshot, intent, at);
  if(bulk)await fullRows();
  await db.batch([...assertions(), ...completionStatements(db, snapshot, value, publication.token, at, false)]);
  await completed(db, value, publication.token);
}
export function completeActivatedPublication(db:CatalogD1,revision:PrunedRevision,publication:PublicationClaim,permit:ActivationPermit,
  readDeployed:(intent:PublicationIntent)=>Promise<PublicationIntent>,now:()=>Date=()=>new Date(),published?:PublishedCatalogBinding){
  return completeActivated(db,revision,publication,permit,readDeployed,now,published);
}
/** One-time permanent catalog only; original native proof and all full rows are
 * independently rechecked. This is not a larger recurring change allowance. */
export function completeActivatedPermanentPublication(db:CatalogD1,revision:PrunedRevision,publication:PublicationClaim,permit:ActivationPermit,
  readDeployed:(intent:PublicationIntent)=>Promise<PublicationIntent>,now:()=>Date=()=>new Date()){
  return completeActivated(db,revision,publication,permit,readDeployed,now,undefined,true);
}
