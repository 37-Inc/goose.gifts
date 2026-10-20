import { randomUUID } from 'node:crypto';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { getProductsByPublicIds } from '../../lib/catalog/storage/d1.ts';
import { mutationAdvance, mutationAssertion, mutationFenceQuery, readMutationOwner } from '../../lib/catalog/mutation-fence.ts';
import type { MutationOwner, MutationScope } from '../../lib/catalog/mutation-fence.ts';
import type { ActivationPermit } from '../../lib/catalog/build-requests.ts';
import { pruneExistingRevision, prunedVectorPlan } from '../../lib/catalog/prune-existing-revision.ts';
import type { PrunedRevision, PrunedVectorObservation } from '../../lib/catalog/prune-existing-revision.ts';
import { prepareApprovedCohort } from '../../lib/catalog/freeze-approved-cohort.ts';
import type { ApprovedCohortRevision } from '../../lib/catalog/freeze-approved-cohort.ts';
import { loadMaintenanceVectorPayload } from './maintenance-d1.ts';
import { canonicalJson, sha256 } from './migration.ts';
import { decodePgvectorSendBase64, encodePgvectorSendBase64 } from './pgvector-binary.ts';
import { pruningCurrentQueries } from './export-d1-snapshot.ts';
import { nativeHash, payloadVector, visible } from './vector-outbox.ts';
import type { ImmutableVectorPayload, SyncVector, VectorEvent } from './vector-outbox.ts';

type Row = Record<string, unknown>;
type Code = 'provider_failed' | 'not_visible' | 'mutation_unknown' | 'attempts_exhausted';
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const HASH = /^[a-f0-9]{64}$/;
const REF = /^[a-zA-Z0-9._:/-]{1,200}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/** Current bounded protected-cohort proof, NOT full-catalog provider headroom.
 * Large catalogs need a reviewed batched/chunked readback proof before activation.
 */
export const OWNED_VECTOR_PROOF_LIMIT = 20;

export interface VectorDispatch {
  deliveryId: string; attempt: number; publicId: string; vector: SyncVector | null;
}
/** Provider-neutral, OFF by default. A real REST adapter must use exact-ID
 * getByIds and prove the known mutation processed (e.g. info's exact mutationId
 * under exclusive ownership). Never order opaque mutation IDs or use a clock.
 * Unknown responses have NO automatic replay. An optional independent resolver
 * can recover a reference or conclusively prove this attempt was not submitted.
 */
export interface OwnedVectorAdapters extends MutationScope {
  /** Immutable account/index identity, checked again when recovering a journal. */
  providerIdentity: string;
  dispatch(input: Readonly<VectorDispatch>, signal: AbortSignal): Promise<{ reference: string }>;
  resolve(input: Readonly<{ deliveryId: string; attempt: number; reference: string | null }>, signal: AbortSignal): Promise<
    { state: 'pending' } | { state: 'settled' | 'not_submitted'; reference: string }>;
  readback(publicId: string, signal: AbortSignal): Promise<SyncVector | null>;
}
/** The hash is independently reviewed immutable input, not a checksum invented
 * from a provider read. Legacy migration payloads keep their input hash NULL.
 */
export interface OriginalVector {
  publicId: string; catalogRevision: string; sourceFactsHash: string; embeddingTextHash: string | null;
  values: number[]; vectorBytesSha256: string;
}
export interface OriginalVectorSource {
  sha256: string;
  load(signal: AbortSignal): Promise<OriginalVector>;
}
interface Request {
  kind: 'outbox' | 'prune'; publicId: string; catalogRevision: string; vector: SyncVector | null;
  event: VectorEvent | null; payloadSha256: string | null; planSha256: string | null;
  globalWatermark: number | null; projectionReceipt: Row | null; eligibleUntil: string | null; pruneCurrent: Row | null;
  providerIdentity: string;
}
interface Journal extends Row {
  delivery_id: string; owner_json: string; request_json: string; product_json: string;
  status: 'pending' | 'complete'; attempts: number; dispatch_token: string | null;
  mutation_reference: string | null; evidence_json: string;
  disposition: 'verified' | 'expired' | 'expired_unsubmitted' | null;
}
export interface DeliveryResult {
  deliveryId: string; owner: MutationOwner; state: 'complete' | 'pending' | 'expired'; errorCode: Code | null;
}
function assertion(db: CatalogD1, sql: string, params: unknown[] = []) {
  return db.prepare(`SELECT json(CASE WHEN (${sql}) THEN 'true' ELSE 'vector_delivery_fenced' END)`).bind(...params);
}
function gate(owner: MutationOwner, pending: boolean) {
  const query = mutationFenceQuery(owner, ['writing','freezing']);
  // Same authoritative scope/token/epoch predicate; only the external marker
  // differs while this journal's durable dispatch intent is unresolved.
  return { sql: query.sql, params: [...query.params.slice(0,-1), pending ? 1 : 0] };
}
function owned(db: CatalogD1, owner: MutationOwner, pending: boolean) {
  const query = gate(owner, pending); return assertion(db, query.sql, query.params);
}
async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeout: number): Promise<T> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('vector_provider_timeout')); }, timeout);
  })]); } finally { clearTimeout(timer); }
}
function timeoutOf(value?: number): number {
  // Explicit background maintenance only; request-time search has its own caps.
  if (value !== undefined && (!Number.isInteger(value) || value < 10 || value > 30_000)) throw new Error('invalid_vector_timeout');
  return value ?? 10_000;
}
function adapterScope(owner: MutationOwner, adapters: Pick<OwnedVectorAdapters,'environment'|'indexName'|'providerIdentity'>) {
  if (adapters.environment !== owner.environment || adapters.indexName !== owner.indexName
    || typeof adapters.providerIdentity !== 'string' || !REF.test(adapters.providerIdentity)) throw new Error('vector_provider_scope_mismatch');
}
function productAssertion(db: CatalogD1, product: Row, request: Request, requireFresh = true) {
  const columns = Object.keys(product);
  if (!columns.length || columns.length > 65 || columns.some(key => !/^[a-z_]+$/.test(key))) throw new Error('vector_product_changed');
  return assertion(db, `EXISTS(SELECT 1 FROM products WHERE ${columns.map(key => `${key} IS ?`).join(' AND ')}
    ${request.vector && requireFresh ? `AND eligible_until>${NOW} AND ?>${NOW}` : ''})`,
  [...columns.map(key => product[key]), ...(request.vector && requireFresh ? [request.eligibleUntil] : [])]);
}
function encodeRequest(request: Request): string {
  // JSON cannot preserve float32 negative zero. Persist the native vector_send
  // payload, then restore exact float32 bits before dispatch/readback comparison.
  return canonicalJson({ ...request, vector:request.vector ? { id:request.vector.id,metadata:request.vector.metadata,
    nativeBase64:encodePgvectorSendBase64(request.vector.values) } : null });
}
function decodeRequest(bytes: string): Request {
  const request = JSON.parse(bytes);
  if (request.vector) request.vector = { id:request.vector.id,metadata:request.vector.metadata,
    values:decodePgvectorSendBase64(request.vector.nativeBase64) };
  return request;
}
function requestAssertions(db: CatalogD1, request: Request) {
  if (request.event) {
    const event = request.event;
    return [assertion(db, `EXISTS(SELECT 1 FROM vector_sync_outbox WHERE sequence=? AND public_id=? AND source_revision=?
      AND embedding_text_hash IS ? AND operation=? AND delete_mutation_sha256 IS ? AND status='pending')`,
    [event.sequence, event.publicId, event.catalogRevision, event.embeddingTextHash, event.operation, event.deleteMutationSha256 ?? null])];
  }
  const receipt = request.projectionReceipt!;
  return [...pruningCurrentQueries([request.pruneCurrent!]).map(query => assertion(db, `(${query.sql})=?`, [...query.params,query.count])),
  assertion(db, `EXISTS(SELECT 1 FROM catalog_projection_receipts WHERE catalog_revision=? AND snapshot_sha256=?
    AND projection_sha256=?) AND (SELECT coalesce(max(sequence),0) FROM vector_sync_outbox)=?
    AND NOT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE status!='complete')`,
  [request.catalogRevision, receipt.snapshot_sha256, receipt.projection_sha256, request.globalWatermark])];
}
async function journal(db: CatalogD1, id: string): Promise<Journal | undefined> {
  return (await db.prepare('SELECT * FROM catalog_vector_deliveries WHERE delivery_id=?').bind(id).all<Journal>()).results[0];
}
function idFor(owner: MutationOwner, identity: unknown): string {
  mutationFenceQuery(owner, ['writing','freezing']);
  return sha256(canonicalJson({ environment: owner.environment, indexName: owner.indexName,
    generation: owner.generation, operationKey: owner.operationKey, identity }));
}
async function recoveredOwner(db: CatalogD1, input: MutationOwner, row: Journal): Promise<MutationOwner> {
  const base = JSON.parse(row.owner_json) as MutationOwner;
  const actual = await readMutationOwner(db, input);
  const expected = { ...base, epoch: base.epoch + (row.status === 'complete' ? 2 : 1) };
  const completedCurrent = row.status === 'complete' && actual && input.epoch === actual.epoch && actual.epoch >= expected.epoch;
  const ownCompletion = row.status === 'complete' && input.epoch === base.epoch + 1 && actual?.epoch === base.epoch + 2;
  if (canonicalJson({ ...input, epoch: base.epoch }) !== canonicalJson(base)
    || !actual || canonicalJson({ ...actual,epoch:expected.epoch }) !== canonicalJson(expected)
    || input.epoch !== base.epoch && input.epoch !== actual.epoch && !ownCompletion
    || actual.epoch !== expected.epoch && !completedCurrent) throw new Error('vector_owner_changed');
  await db.batch([owned(db, actual, row.status === 'pending')]);
  return actual;
}
async function pendingResult(db: CatalogD1, input: MutationOwner, row: Journal, errorCode: Code): Promise<DeliveryResult> {
  return { deliveryId: row.delivery_id, owner: await recoveredOwner(db, input, row), state: 'pending', errorCode };
}
async function execute(options: { db: CatalogD1; owner: MutationOwner; id: string; adapters: OwnedVectorAdapters; timeout: number;
  expectedPayloadSha256?: string | null;
  prepare(): Promise<{ request: Omit<Request,'providerIdentity'>; product: Row }> }): Promise<DeliveryResult> {
  const { db, owner: input, id, adapters, timeout } = options;
  adapterScope(input,adapters);
  let row = await journal(db, id);
  if (!row) {
    await db.batch([mutationAssertion(db, input, ['writing','freezing'])]);
    const prepared = await options.prepare(); const product = prepared.product;
    const request: Request = { ...prepared.request,providerIdentity:adapters.providerIdentity };
    const requestBytes = encodeRequest(request); const productBytes = canonicalJson(product);
    if (Buffer.byteLength(requestBytes) > 200_000 || Buffer.byteLength(productBytes) > 768_000) throw new Error('vector_payload_bound');
    const owner = { ...input, epoch: input.epoch + 1 }; const query = gate(input, false);
    try {
      await db.batch([owned(db, input, false), productAssertion(db, product, request), ...requestAssertions(db, request),
        ...(request.event ? [assertion(db, `EXISTS(SELECT 1 FROM vector_sync_outbox WHERE sequence=? AND attempts=0
          AND lease_token IS NULL AND lease_until IS NULL AND mutation_reference IS NULL)`, [request.event.sequence]),
        db.prepare('UPDATE vector_sync_outbox SET lease_token=? WHERE sequence=?').bind(id, request.event.sequence)] : []),
        db.prepare(`INSERT INTO catalog_vector_deliveries(delivery_id,environment,index_name,generation,prior_epoch,owner_json,request_json,product_json)
          VALUES(?,?,?,?,?,?,?,?)`).bind(id, input.environment, input.indexName, input.generation, input.epoch,
          canonicalJson(input), requestBytes, productBytes),
        db.prepare(`UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1,external_pending=1
          WHERE environment=? AND index_name=? AND ${query.sql}`).bind(input.environment, input.indexName, ...query.params),
        owned(db, owner, true),
      ]);
    } catch { /* Recover only exact committed intent; never infer a failed batch succeeded. */ }
    row = await journal(db, id);
    if (!row || row.request_json !== requestBytes || row.product_json !== productBytes) throw new Error('vector_intent_unconfirmed');
  }
  let owner = await recoveredOwner(db, input, row);
  const saved = decodeRequest(row.request_json);
  if (saved.providerIdentity !== adapters.providerIdentity) throw new Error('vector_provider_scope_mismatch');
  if (options.expectedPayloadSha256 !== undefined && saved.payloadSha256 !== options.expectedPayloadSha256)
    throw new Error('vector_original_changed');
  if (row.status === 'complete') return { deliveryId: id, owner, state: row.disposition === 'verified' ? 'complete' : 'expired', errorCode: null };
  const request = decodeRequest(row.request_json); const product = JSON.parse(row.product_json) as Row;
  // A clock crossing alone must never prevent observing an already-dispatched
  // mutation. Freshness is checked separately immediately BEFORE dispatch.
  const checks = () => [owned(db, owner, true), productAssertion(db, product, request, false), ...requestAssertions(db, request),
    ...(request.event ? [assertion(db, `EXISTS(SELECT 1 FROM vector_sync_outbox WHERE sequence=? AND lease_token=? AND attempts=?)`,
      [request.event.sequence,id,row!.attempts])] : [])];
  await db.batch(checks());
  let settled = false;
  if (row.dispatch_token) {
    let observation;
    try { observation = await bounded(signal => adapters.resolve({ deliveryId: id, attempt: row!.attempts,
      reference: row!.mutation_reference }, signal), timeout); }
    catch { return pendingResult(db, input, row, 'provider_failed'); }
    if (observation.state === 'pending') return pendingResult(db, input, row, 'mutation_unknown');
    if (!REF.test(observation.reference) || (observation.state === 'settled' && row.mutation_reference
      && observation.reference !== row.mutation_reference)) throw new Error('vector_resolution_invalid');
    if (observation.state === 'not_submitted') {
      if (row.mutation_reference) throw new Error('vector_resolution_invalid');
      // This is independent conclusive evidence, NOT an HTTP exception/timeout.
      // Retain all bounded attempt evidence and retry only on a subsequent call.
      const evidence = canonicalJson([...JSON.parse(row.evidence_json), { attempt: row.attempts, state: 'not_submitted', reference: observation.reference }]);
      await db.batch([...checks(), db.prepare(`UPDATE catalog_vector_deliveries SET dispatch_token=NULL,mutation_reference=NULL,evidence_json=?
        WHERE delivery_id=? AND dispatch_token=? AND evidence_json=?`).bind(evidence, id, row.dispatch_token, row.evidence_json),
      assertion(db, 'EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE delivery_id=? AND dispatch_token IS NULL AND evidence_json=?)', [id, evidence])]);
      return pendingResult(db, input, (await journal(db,id))!, row.attempts >= 3 ? 'attempts_exhausted' : 'mutation_unknown');
    }
    settled = true;
    // Recovered unknown reference is retained before visibility/finalization.
    await db.batch([...checks(), db.prepare(`UPDATE catalog_vector_deliveries SET mutation_reference=?
      WHERE delivery_id=? AND dispatch_token=? AND mutation_reference IS ?`).bind(observation.reference, id, row.dispatch_token, row.mutation_reference),
    ...(request.event ? [db.prepare('UPDATE vector_sync_outbox SET mutation_reference=? WHERE sequence=? AND lease_token=?')
      .bind(observation.reference,request.event.sequence,id)] : []),
    assertion(db, 'EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE delivery_id=? AND mutation_reference=?)', [id, observation.reference])]);
    row = (await journal(db,id))!;
  }
  let actual: SyncVector | null;
  try { actual = await bounded(signal => adapters.readback(request.publicId, signal), timeout); }
  catch { return pendingResult(db, input, row, 'provider_failed'); }
  const isVisible = visible(request.vector, actual);
  const fresh = !request.vector || (await db.prepare(`SELECT ?>${NOW} fresh`).bind(request.eligibleUntil).all<{ fresh:number }>()).results[0].fresh === 1;
  if (!isVisible && !row.dispatch_token && fresh) {
    if (row.attempts >= 3) return pendingResult(db, input, row, 'attempts_exhausted');
    const token = randomUUID();
    // Persist the unique dispatch marker BEFORE external code. Only its winning
    // live caller may send; a restarted/concurrent caller can only resolve it.
    await db.batch([...checks(),productAssertion(db,product,request), db.prepare(`UPDATE catalog_vector_deliveries SET dispatch_token=?,attempts=attempts+1
      WHERE delivery_id=? AND dispatch_token IS NULL AND attempts=?`).bind(token,id,row.attempts),
    assertion(db, 'EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE delivery_id=? AND dispatch_token=?)', [id,token]),
    ...(request.event ? [db.prepare('UPDATE vector_sync_outbox SET attempts=attempts+1 WHERE sequence=? AND lease_token=?')
      .bind(request.event.sequence,id)] : [])]);
    row = (await journal(db,id))!;
    let accepted;
    try { accepted = await bounded(signal => adapters.dispatch({ deliveryId: id, attempt: row!.attempts,
      publicId: request.publicId, vector: structuredClone(request.vector) }, signal), timeout); }
    catch { return pendingResult(db, input, row, 'mutation_unknown'); }
    if (!accepted || !REF.test(accepted.reference)) return pendingResult(db, input, row, 'mutation_unknown');
    // A lost D1 response here leaves the persisted dispatch token, so retry still
    // resolves and NEVER blindly sends again.
    try {
      await db.batch([...checks(), db.prepare(`UPDATE catalog_vector_deliveries SET mutation_reference=?
        WHERE delivery_id=? AND dispatch_token=? AND mutation_reference IS NULL`).bind(accepted.reference,id,token),
      ...(request.event ? [db.prepare('UPDATE vector_sync_outbox SET mutation_reference=? WHERE sequence=? AND lease_token=?')
        .bind(accepted.reference,request.event.sequence,id)] : []),
      assertion(db, 'EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE delivery_id=? AND mutation_reference=?)', [id,accepted.reference])]);
    } catch { /* Exact journal readback below; unknown acceptance remains owned. */ }
    row = (await journal(db,id))!;
    return pendingResult(db, input, row, 'mutation_unknown'); // Acceptance is never completion.
  }
  if (row.dispatch_token && !settled) return pendingResult(db, input, row, 'mutation_unknown');
  if (!isVisible && (row.dispatch_token || fresh)) return pendingResult(db, input, row, 'not_visible');
  const unsentExpired = !isVisible && !row.dispatch_token && !fresh;
  if(unsentExpired){const history=JSON.parse(row.evidence_json);
    if(!Array.isArray(history)||history.length!==row.attempts||history.some((item,i)=>item.state!=='not_submitted'||item.attempt!==i+1))
      throw new Error('vector_non_submission_unproven');}
  const next = { ...owner, epoch: owner.epoch + 1 }; const query = gate(owner, true);
  const evidence = canonicalJson([...JSON.parse(row.evidence_json), { attempt: row.attempts,
    state: unsentExpired ? 'expired_unsubmitted' : row.dispatch_token ? 'settled_visible' : 'already_visible', reference: row.mutation_reference }]);
  try {
    await db.batch([...checks(),
      ...(request.event && !unsentExpired ? [db.prepare(`UPDATE vector_sync_outbox SET status='complete',completed_at=${NOW},lease_until=NULL,error_code=NULL
        WHERE sequence=? AND status='pending' AND lease_token=?`).bind(request.event.sequence,id),
      assertion(db, "EXISTS(SELECT 1 FROM vector_sync_outbox WHERE sequence=? AND status='complete' AND lease_token=?)", [request.event.sequence,id])]
        :request.event ? [db.prepare(`UPDATE vector_sync_outbox SET lease_token=NULL WHERE sequence=? AND status='pending'
          AND lease_token=? AND attempts=? AND mutation_reference IS NULL`).bind(request.event.sequence,id,row.attempts),
        assertion(db,"EXISTS(SELECT 1 FROM vector_sync_outbox WHERE sequence=? AND status='pending' AND attempts=? AND lease_token IS NULL)",
          [request.event.sequence,row.attempts])] : []),
      db.prepare(`UPDATE catalog_vector_deliveries SET status='complete',completed_at=${NOW},evidence_json=?,
        disposition=CASE WHEN ? THEN 'expired_unsubmitted' WHEN ? AND ?<=${NOW} THEN 'expired' ELSE 'verified' END
        WHERE delivery_id=? AND status='pending' AND dispatch_token IS ? AND evidence_json=?`)
        .bind(evidence,unsentExpired?1:0,request.vector?1:0,request.eligibleUntil,id,row.dispatch_token,row.evidence_json),
      assertion(db, "EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE delivery_id=? AND status='complete' AND evidence_json=?)", [id,evidence]),
      db.prepare(`UPDATE catalog_mutation_scopes SET external_pending=0,mutation_epoch=mutation_epoch+1
        WHERE environment=? AND index_name=? AND ${query.sql}`).bind(owner.environment,owner.indexName,...query.params),
      owned(db,next,false),
    ]);
  } catch { /* Exact completion/owner reconciliation, including response loss. */ }
  row = (await journal(db,id))!; owner = await recoveredOwner(db,input,row);
  return { deliveryId: id, owner, state: row.status === 'complete' ? row.disposition === 'verified' ? 'complete' : 'expired' : 'pending',
    errorCode: row.status === 'complete' ? null : 'not_visible' };
}

/** One explicit immutable event. No provider mutation is attempted for a legacy
 * attempted/leased event lacking an owned journal: its overlap needs review.
 */
async function outboxDelivery(options: { db: CatalogD1; owner: MutationOwner; sequence: number; catalogRevision: string;
  loadPayload(event: Readonly<VectorEvent>, signal: AbortSignal): Promise<ImmutableVectorPayload>;
  adapters: OwnedVectorAdapters; timeoutMs?: number }): Promise<DeliveryResult> {
  const { db, owner, sequence, catalogRevision } = options; const timeout = timeoutOf(options.timeoutMs);
  if (owner.phase !== 'writing' || !Number.isSafeInteger(sequence) || sequence < 1 || typeof catalogRevision !== 'string'
    || !catalogRevision.trim() || Buffer.byteLength(catalogRevision) > 64) throw new Error('invalid_owned_vector_event');
  const id = idFor(owner,{ kind:'outbox', sequence,catalogRevision });
  return execute({ ...options, id, timeout, async prepare() {
    const eventRow = (await db.prepare('SELECT * FROM vector_sync_outbox WHERE sequence=?').bind(sequence).all()).results[0];
    if (!eventRow || eventRow.status !== 'pending' || eventRow.source_revision !== catalogRevision
      || !UUID.test(String(eventRow.public_id))) throw new Error('vector_event_changed');
    const event: VectorEvent = { sequence, publicId: String(eventRow.public_id), catalogRevision: String(eventRow.source_revision),
      ...(eventRow.embedding_text_hash === null ? { embeddingTextHash:null, operation:'delete' as const, deleteMutationSha256:String(eventRow.delete_mutation_sha256) }
        : { embeddingTextHash:String(eventRow.embedding_text_hash), operation:eventRow.operation as 'upsert'|'delete' }) };
    const product = (await db.prepare('SELECT * FROM products WHERE public_id=?').bind(event.publicId).all()).results[0];
    if (!product || product.catalog_revision !== event.catalogRevision || product.embedding_text_hash !== event.embeddingTextHash
      || event.embeddingTextHash !== null && !HASH.test(event.embeddingTextHash)) throw new Error('vector_product_changed');
    const now = (await db.prepare(`SELECT ${NOW} now`).all<{ now:string }>()).results[0].now;
    const eligible = await getProductsByPublicIds(db,[event.publicId],new Date(now),event.catalogRevision);
    if ((event.operation === 'upsert') !== Boolean(eligible.length)) throw new Error('vector_product_changed');
    const payload = await bounded(signal => options.loadPayload(event,signal),timeout);
    const review = event.embeddingTextHash === null ? (await db.prepare('SELECT mutation_json FROM vector_delete_mutations WHERE mutation_sha256=? AND public_id=? AND source_revision=?')
      .bind(event.deleteMutationSha256,event.publicId,event.catalogRevision).all<{ mutation_json:string }>()).results[0]?.mutation_json : undefined;
    const vector = payloadVector(event,payload,product,review,Date.parse(now));
    return { product, request: { kind:'outbox',publicId:event.publicId,catalogRevision:event.catalogRevision,vector,event,
      payloadSha256:sha256(canonicalJson(payload)),planSha256:null,globalWatermark:null,projectionReceipt:null,
      eligibleUntil:eligible[0]?.eligibleUntil ?? null,pruneCurrent:null } };
  } });
}

/** One UUID from the strict prune plan. Its deletion authority is the sealed
 * removed-ID plan, not an invented legacy embedding hash or manual approval.
 * Upserts replace ONLY metadata while preserving reviewed original float32s.
 */
async function pruneDelivery(options: { db: CatalogD1; owner: MutationOwner; revision: PrunedRevision;
  publicId: string; original?: OriginalVectorSource; adapters: OwnedVectorAdapters; timeoutMs?: number }, approved = false): Promise<DeliveryResult> {
  const { db,owner,revision,publicId } = options; const timeout = timeoutOf(options.timeoutMs);
  const plan = prunedVectorPlan(revision); const planHash = sha256(canonicalJson(plan));
  const member = plan.products.find(product => product.publicId === publicId); const absent = plan.absentIds.includes(publicId);
  if (plan.products.length + plan.absentIds.length > OWNED_VECTOR_PROOF_LIMIT) throw new Error('vector_plan_invalid');
  if (owner.phase !== 'freezing' || !UUID.test(publicId) || (!member && !absent) || (member && !HASH.test(options.original?.sha256 ?? ''))
    || (absent && options.original)) throw new Error('invalid_owned_prune_vector');
  const id = idFor(owner,{ kind:'prune',planHash,publicId });
  return execute({ ...options,id,timeout,expectedPayloadSha256:options.original?.sha256 ?? null, async prepare() {
    const rebuilt = approved ? await prepareApprovedCohort(db,owner,(revision as ApprovedCohortRevision).request)
      : await pruneExistingRevision(db,owner,revision.request);
    if (rebuilt.state === 'unchanged' || canonicalJson(rebuilt.revision) !== canonicalJson(revision)) throw new Error('vector_prune_changed');
    const captured = revision.sourceRows.find(row => row.public_id === publicId)!;
    // Captured rows also have archived_* JSON aliases, not physical columns.
    // Bind those through the canonical pruning predicate and separately capture
    // the complete operational row for the delivery's final exact-row CAS.
    const product = (await db.prepare('SELECT * FROM products WHERE public_id=?').bind(publicId).all()).results[0];
    if (!captured || !product) throw new Error('vector_product_changed');
    let vector: SyncVector | null = null;
    if (member) {
      const original = await bounded(signal => options.original!.load(signal),timeout);
      if (sha256(canonicalJson(original)) !== options.original!.sha256 || original.publicId !== publicId
        || original.catalogRevision !== (approved && (revision as ApprovedCohortRevision).request.approval.changes.some(change=>change.publicId===publicId)
          ? revision.snapshot.catalogRevision : revision.request.previous.catalogRevision)
        || original.sourceFactsHash !== member.sourceFactsHash || original.embeddingTextHash !== member.embeddingTextHash
        || !Array.isArray(original.values) || original.values.length !== 1536
        || !Array.from(original.values).every(value => typeof value === 'number' && Number.isFinite(value))
        || !HASH.test(original.vectorBytesSha256) || nativeHash(original.values) !== original.vectorBytesSha256)
        throw new Error('vector_original_unproven');
      vector = { id:publicId,values:[...original.values],metadata:{ catalogRevision:plan.catalogRevision,eligible:true,
        sourceFactsHash:member.sourceFactsHash,vectorBytesSha256:original.vectorBytesSha256,
        ...(member.embeddingTextHash === null ? { legacyInputProvenance:'unverified' } :
          { embeddingTextHash:member.embeddingTextHash,embeddingModel:'text-embedding-3-small' }) } };
    }
    return { product,request:{ kind:'prune',publicId,catalogRevision:plan.catalogRevision,vector,event:null,
      payloadSha256:options.original?.sha256 ?? null,planSha256:planHash,globalWatermark:plan.globalWatermark,
      projectionReceipt:revision.packet.receipt,pruneCurrent:captured,
      eligibleUntil:revision.snapshot.products.find(value => value.publicId === publicId)?.eligibleUntil ?? null } };
  } });
}

/** Concrete read-only proof callback for settlePrunedRevision. Invoke only after
 * every planned UUID completed under THIS ownership generation. Current source
 * and publication CAS are still enforced by settlePrunedRevision, not this read.
 * Stable-ID transition makes old semantic search use keyword fallback; rollback
 * requires owned restoration + exact proof of prior original vectors first.
 */
async function readPrunedVectors(db: CatalogD1, owner: MutationOwner, revision: PrunedRevision,
  adapters: Pick<OwnedVectorAdapters,'readback'|'environment'|'indexName'|'providerIdentity'>): Promise<PrunedVectorObservation> {
  adapterScope(owner,adapters);
  const plan = prunedVectorPlan(revision); const hash = sha256(canonicalJson(plan));
  if (owner.phase !== 'freezing' || plan.environment !== owner.environment || plan.indexName !== owner.indexName
    || plan.products.length + plan.absentIds.length > OWNED_VECTOR_PROOF_LIMIT) throw new Error('vector_plan_invalid');
  await db.batch([mutationAssertion(db,owner,['freezing'])]);
  const rows = (await db.prepare(`SELECT * FROM catalog_vector_deliveries WHERE environment=? AND index_name=? AND generation=?
    AND json_extract(request_json,'$.kind')='prune' AND json_extract(request_json,'$.planSha256')=? LIMIT 21`)
    .bind(owner.environment,owner.indexName,owner.generation,hash).all<Journal>()).results;
  const ids = [...plan.products.map(product => product.publicId),...plan.absentIds];
  const requests = new Map(rows.map(row => [String(decodeRequest(row.request_json).publicId),decodeRequest(row.request_json)]));
  if (rows.length !== ids.length || requests.size !== ids.length || rows.some(row => row.status !== 'complete' || row.disposition !== 'verified')
    || ids.some(id => !requests.has(id) || requests.get(id)!.providerIdentity !== adapters.providerIdentity)) throw new Error('vector_plan_incomplete');
  await bounded(async signal => {
    for (let offset=0;offset<ids.length;offset+=10) await Promise.all(ids.slice(offset,offset+10).map(async id => {
      if (signal.aborted || !visible(requests.get(id)!.vector,await adapters.readback(id,signal))) throw new Error('vector_not_visible');
    }));
  },3000);
  await db.batch([mutationAssertion(db,owner,['freezing'])]);
  return { environment:owner.environment,indexName:owner.indexName,settled:true,planSha256:hash,
    reference:`owned-vectors:${sha256(canonicalJson(rows.map(row => row.delivery_id).sort()))}` };
}
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    throw new Error(error instanceof Error && /^(vector_[a-z_]+|invalid_owned_[a-z_]+|invalid_vector_timeout)$/.test(error.message)
      ? error.message : 'vector_delivery_failed');
  }
}
export function deliverOwnedOutboxEvent(options: Parameters<typeof outboxDelivery>[0]): Promise<DeliveryResult> {
  return safe(() => outboxDelivery(options));
}
export function deliverOwnedPrunedVector(options: Parameters<typeof pruneDelivery>[0]): Promise<DeliveryResult> {
  return safe(() => pruneDelivery(options));
}
/** Same sealed-plan journal/expiry recovery as pruning (the persisted kind stays
 * "prune" for compatibility). Changed products MUST use their immutable owned
 * maintenance payload, never a caller-supplied replacement or regenerated vector.
 * Unchanged legacy products still require independently pinned original bytes.
 */
export function deliverOwnedApprovedCohortVector(options: Omit<Parameters<typeof pruneDelivery>[0],'revision'> & { revision:ApprovedCohortRevision }): Promise<DeliveryResult> {
  return safe(async()=>{
    const change=options.revision.request.approval.changes.find(value=>value.publicId===options.publicId);
    const plan=prunedVectorPlan(options.revision);
    if(plan.products.length+plan.absentIds.length>OWNED_VECTOR_PROOF_LIMIT)throw new Error('vector_plan_invalid');
    if(!change || !plan.products.some(value=>value.publicId===options.publicId)) return pruneDelivery(options,true);
    if(options.original)throw new Error('vector_original_unproven');
    const rows=(await options.db.prepare(`SELECT o.* FROM catalog_maintenance_vector_payloads p CROSS JOIN vector_sync_outbox o
      ON o.sequence=p.sequence WHERE p.operation_id=? AND o.public_id=? AND o.source_revision=? AND o.status='complete' AND o.operation='upsert' LIMIT 2`)
      .bind(change.operationId,options.publicId,options.revision.snapshot.catalogRevision).all()).results;
    if(rows.length!==1)throw new Error('vector_original_unproven');
    const row=rows[0];const event:VectorEvent={sequence:Number(row.sequence),publicId:String(row.public_id),catalogRevision:String(row.source_revision),
      embeddingTextHash:String(row.embedding_text_hash),operation:'upsert'};
    const payload=await loadMaintenanceVectorPayload(options.db,event);
    const product=(await options.db.prepare('SELECT * FROM products WHERE public_id=?').bind(options.publicId).all()).results[0];
    if(!product||sha256(canonicalJson(product))!==change.productSha256)throw new Error('vector_product_changed');
    // Decoding an existing immutable payload is not an embedding/model call.
    const vector=payloadVector(event,payload,product,undefined,Date.parse(options.revision.snapshot.generatedAt));
    if(!vector)throw new Error('vector_original_unproven');
    const original:OriginalVector={publicId:options.publicId,catalogRevision:event.catalogRevision,
      sourceFactsHash:String(product.source_facts_hash),embeddingTextHash:event.embeddingTextHash,values:vector.values,
      vectorBytesSha256:nativeHash(vector.values)};
    return pruneDelivery({...options,original:{sha256:sha256(canonicalJson(original)),async load(){return original;}}},true);
  });
}
export function readOwnedPrunedVectors(...args: Parameters<typeof readPrunedVectors>): Promise<PrunedVectorObservation> {
  return safe(() => readPrunedVectors(...args));
}
export function readOwnedApprovedCohortVectors(db:CatalogD1,owner:MutationOwner,revision:ApprovedCohortRevision,
  adapters:Pick<OwnedVectorAdapters,'readback'|'environment'|'indexName'|'providerIdentity'>):Promise<PrunedVectorObservation> {
  return safe(()=>readPrunedVectors(db,owner,revision,adapters));
}
/** Control-only readback after activation. No delivery, expiry renewal, watermark
 * or ownership write is permitted here. Fresh publication still requires the
 * separate current-rights/lease predicates in completePublication. This small
 * plan may survive content-artifact expiry for read-only reconciliation.
 */
export interface ActivatedVectorPlan { catalogRevision:string; planSha256:string; ids:string[] }
export function readActivatedCatalogVectors(db:CatalogD1,permit:ActivationPermit,plan:ActivatedVectorPlan,
  adapters:Pick<OwnedVectorAdapters,'readback'|'environment'|'indexName'|'providerIdentity'>):Promise<PrunedVectorObservation> {
  return safe(async()=>{
    const owner=permit.mutationOwner;
    if(!owner||owner.phase!=='activating'||!HASH.test(plan.planSha256)||!plan.ids.every(id=>UUID.test(id))
      ||plan.ids.length>OWNED_VECTOR_PROOF_LIMIT||new Set(plan.ids).size!==plan.ids.length)throw new Error('vector_plan_invalid');
    adapterScope(owner,adapters);
    const check=()=>db.batch([mutationAssertion(db,owner,['activating']),assertion(db,`EXISTS(
      SELECT 1 FROM catalog_mutation_scopes s JOIN catalog_build_requests b ON b.request_id=s.activation_request_id
      WHERE s.environment=? AND s.index_name=? AND b.environment=s.environment AND b.state='activating'
      AND b.request_id=? AND b.lease_token=? AND b.run_reference=? AND b.release_id=? AND b.version_reference=?
      AND json_extract(b.request_json,'$.sourceRevision')=?)`,[owner.environment,owner.indexName,
      permit.requestId,permit.token,permit.runReference,permit.releaseId,permit.versionReference,plan.catalogRevision])]);
    await check();
    // Do not filter on caller plan hash: doing so could hide a missing/subset
    // proof. Bind ALL of this generation's target-revision journals, and the
    // immutable target/prior projections, before accepting any provider read.
    const rows=(await db.prepare(`SELECT * FROM catalog_vector_deliveries WHERE environment=? AND index_name=? AND generation=?
      AND json_extract(request_json,'$.kind')='prune' AND json_extract(request_json,'$.catalogRevision')=? LIMIT 21`)
      .bind(owner.environment,owner.indexName,owner.generation,plan.catalogRevision).all<Journal>()).results;
    const projections=(await db.prepare(`SELECT public_id,catalog_revision,source_facts_hash FROM catalog_public_products WHERE catalog_revision=? OR catalog_revision=(
      SELECT p.catalog_revision FROM catalog_build_requests b JOIN publication_receipts p
      ON p.release_id=json_extract(b.request_json,'$.priorReleaseId') WHERE b.request_id=?) LIMIT 41`)
      .bind(plan.catalogRevision,permit.requestId).all<{public_id:string;catalog_revision:string;source_facts_hash:string}>()).results;
    const receipt=(await db.prepare(`SELECT p.* FROM catalog_projection_receipts p JOIN catalog_build_requests b
      ON b.source_revision=p.catalog_revision AND json_extract(b.request_json,'$.sourceDigest')=p.snapshot_sha256 WHERE b.request_id=?`)
      .bind(permit.requestId).all<Row>()).results[0];
    const ready=new Map(projections.filter(row=>row.catalog_revision===plan.catalogRevision).map(row=>[row.public_id,row]));
    const requests=new Map(rows.map(row=>[decodeRequest(row.request_json).publicId,decodeRequest(row.request_json)]));
    if(rows.length!==plan.ids.length||requests.size!==plan.ids.length||rows.some(row=>row.status!=='complete'||row.disposition!=='verified')
      ||!receipt||projections.length>40||projections.some(row=>!plan.ids.includes(row.public_id))
      ||plan.ids.some(id=>!requests.has(id)||requests.get(id)!.catalogRevision!==plan.catalogRevision
        ||requests.get(id)!.planSha256!==plan.planSha256||requests.get(id)!.providerIdentity!==adapters.providerIdentity
        ||canonicalJson(requests.get(id)!.projectionReceipt)!==canonicalJson(receipt)
        ||(ready.has(id)?!requests.get(id)!.vector||requests.get(id)!.vector!.id!==id
          ||requests.get(id)!.vector!.metadata.catalogRevision!==plan.catalogRevision
          ||requests.get(id)!.vector!.metadata.sourceFactsHash!==ready.get(id)!.source_facts_hash:requests.get(id)!.vector!==null)))throw new Error('vector_plan_incomplete');
    await bounded(async signal=>{
      for(let offset=0;offset<plan.ids.length;offset+=10)await Promise.all(plan.ids.slice(offset,offset+10).map(async id=>{
        if(signal.aborted||!visible(requests.get(id)!.vector,await adapters.readback(id,signal)))throw new Error('vector_not_visible');
      }));
    },3000);
    await check();
    return{environment:owner.environment,indexName:owner.indexName,settled:true,planSha256:plan.planSha256,
      reference:`owned-vectors:${sha256(canonicalJson(rows.map(row=>row.delivery_id).sort()))}`};
  });
}
/** Explicit revision, at most10 events and one uncertain external intent. A
 * pending/expired outcome stops this invocation; caller keeps the returned owner.
 */
export function drainOwnedVectorOutbox(options: Omit<Parameters<typeof outboxDelivery>[0],'sequence'> & { maxEvents?:number }) {
  return safe(async () => {
    const max=options.maxEvents??5;
    if(!Number.isInteger(max)||max<1||max>10||typeof options.catalogRevision!=='string'
      ||!options.catalogRevision.trim()||Buffer.byteLength(options.catalogRevision)>64)throw new Error('invalid_owned_vector_bound');
    const rows=(await options.db.prepare(`SELECT sequence FROM vector_sync_outbox WHERE source_revision=? AND status='pending'
      ORDER BY sequence LIMIT ?`).bind(options.catalogRevision,max).all<{sequence:number}>()).results;
    if(!rows.length)await options.db.batch([mutationAssertion(options.db,options.owner,['writing'])]);
    let owner=options.owner;const outcomes:DeliveryResult[]=[];
    for(const row of rows){const result=await outboxDelivery({...options,owner,sequence:row.sequence});
      outcomes.push(result);owner=result.owner;if(result.state!=='complete')break;}
    return{owner,outcomes};
  });
}
/** Explicit recovery, never automatic timeout/takeover. Retain the importing
 * revision and its sealed evidence; mark it abandoned ONLY after this owner's
 * expired vector delivery settled. No pending external work/build/publication
 * may exist. A subsequent daily request must have a NEW operation key/cutoff.
 */
export function abandonExpiredPrunedRevision(db:CatalogD1,owner:MutationOwner,revision:PrunedRevision) {
  return safe(async()=>{
    if(owner.phase!=='freezing'||owner.operationKey!==revision.operationKey
      ||revision.request.scope.environment!==owner.environment||revision.request.scope.indexName!==owner.indexName)
      throw new Error('vector_abandonment_invalid');
    const planHash=sha256(canonicalJson(prunedVectorPlan(revision)));const target=revision.snapshot.catalogRevision;
    const rows=(await db.prepare(`SELECT * FROM catalog_vector_deliveries WHERE environment=? AND index_name=? AND generation=?
      AND status='complete' AND disposition IN('expired','expired_unsubmitted')
      AND json_extract(request_json,'$.kind')='prune' AND json_extract(request_json,'$.planSha256')=? ORDER BY prior_epoch LIMIT 1`)
      .bind(owner.environment,owner.indexName,owner.generation,planHash).all<Journal>()).results;
    const evidence=rows[0];if(!evidence)throw new Error('vector_abandonment_unproven');
    const request=decodeRequest(evidence.request_json);
    if(request.catalogRevision!==target||canonicalJson(request.projectionReceipt)!==canonicalJson(revision.packet.receipt))
      throw new Error('vector_abandonment_unproven');
    const actual=await readMutationOwner(db,owner);
    const stored=(await db.prepare('SELECT * FROM catalog_revisions WHERE revision=?').bind(target).all()).results[0];
    if(stored?.abandonment_delivery_id){
      const ownCommit=actual?.epoch===stored.abandonment_epoch && owner.epoch===Number(stored.abandonment_epoch)-1;
      if(stored.abandonment_delivery_id!==evidence.delivery_id||!actual
        ||canonicalJson({...actual,epoch:owner.epoch})!==canonicalJson(owner)
        ||actual.epoch<Number(stored.abandonment_epoch)||actual.epoch!==owner.epoch&&!ownCommit)throw new Error('vector_owner_changed');
      await db.batch([mutationAssertion(db,actual,['freezing'])]);return{owner:actual,state:'abandoned' as const};
    }
    const next={...owner,epoch:owner.epoch+1};
    const receipt={sql:'SELECT 1 FROM catalog_revisions WHERE revision=? AND abandonment_delivery_id=? AND abandonment_epoch=?',
      params:[target,evidence.delivery_id,next.epoch]};
    try{await db.batch([mutationAssertion(db,owner,['freezing']),
      assertion(db,`EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE delivery_id=? AND request_json=? AND status='complete'
        AND disposition IN('expired','expired_unsubmitted')) AND NOT EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE status='pending')
        AND NOT EXISTS(SELECT 1 FROM catalog_build_requests WHERE source_revision=?)
        AND NOT EXISTS(SELECT 1 FROM publication_receipts WHERE catalog_revision=?)`,[evidence.delivery_id,evidence.request_json,target,target]),
      db.prepare(`UPDATE catalog_revisions SET abandonment_delivery_id=?,abandonment_epoch=? WHERE revision=? AND source_export_sha256=?
        AND status='importing' AND abandonment_delivery_id IS NULL`).bind(evidence.delivery_id,next.epoch,target,revision.sourceDigest),
      assertion(db,`EXISTS(${receipt.sql})`,receipt.params),mutationAdvance(db,owner,receipt),mutationAssertion(db,next,['freezing']),
    ]);}catch{/* Reconcile only this exact abandonment marker + one epoch advance. */}
    const current=await readMutationOwner(db,owner);
    const saved=(await db.prepare(receipt.sql).bind(...receipt.params).all()).results.length;
    if(!saved||!current||canonicalJson(current)!==canonicalJson(next))throw new Error('vector_abandonment_unconfirmed');
    return{owner:current,state:'abandoned' as const};
  });
}
