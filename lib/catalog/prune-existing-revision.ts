import type { CatalogD1 } from './storage/d1.ts';
import type { CatalogSnapshot, SafeHeldProduct } from './types.ts';
import type { ProjectionPacket } from './d1.ts';
import { createProjectionPacket, projectionQueries } from './d1.ts';
import { canonicalTime, validateCatalogSnapshot } from './snapshot.ts';
import { encodeBuildRequest } from './build-requests.ts';
import type { CatalogBuildRequest } from './build-requests.ts';
import { mutationAdvance, mutationAssertion, mutationFenceQuery, unabandonedImportsQuery } from './mutation-fence.ts';
import type { MutationOwner, MutationScope } from './mutation-fence.ts';
import { checkCurrent, assertPruningCurrent, readOwnedProjection, readPruningSource } from '../../scripts/catalog/export-d1-snapshot.ts';
import type { SnapshotReadContext } from '../../scripts/catalog/export-d1-snapshot.ts';
import { canonicalJson, sha256 } from '../../scripts/catalog/migration.ts';
import { suppressNearDuplicateProducts } from '../db/product-scoring.ts';

type Row = Record<string, unknown>;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
/** Private workflow input/output. Never include the captured rights/state rows
 * in a public asset. Daily pruning cannot approve/promote any formerly-held row.
 */
export interface PruneRequest {
  previous: CatalogSnapshot; context: SnapshotReadContext; scope: MutationScope; codeSha: string;
}
export interface PrunedRevision {
  request: PruneRequest; snapshot: CatalogSnapshot; packet: ProjectionPacket; sourceRows: Row[];
  priorRow: Row; sourceDigest: string; globalVectorWatermark: number; vectorSyncWatermark: number; operationKey: string;
  /** Explicit approved-cohort candidates excluded by current policy/dedup. */
  additionalAbsentIds?: string[];
}
export interface PrunedVectorPlan extends MutationScope {
  catalogRevision: string; snapshotSha256: string; globalWatermark: number;
  products: Array<{ publicId: string; sourceFactsHash: string; embeddingTextHash: string | null }>;
  absentIds: string[];
}
/** Trusted read-only orchestration, not an HTTP body asserting success. It must
 * prove all in-flight index writers settled, exact UUID coverage, target revision
 * metadata, original float32 bytes from immutable payloads, and removed-ID absence.
 * Unknown legacy input hashes stay unknown. No vector mutation occurs here.
 */
export interface PrunedVectorObservation extends MutationScope {
  settled: true; planSha256: string; reference: string;
}
export function pruneOperationKey(request: PruneRequest): string {
  if (!/^[a-f0-9]{40}$/.test(request.codeSha) || !['staging','production'].includes(request.scope.environment)
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.scope.indexName)) throw new Error('invalid_prune_request');
  canonicalTime(request.context.cutoff);
  return sha256(canonicalJson({ schemaVersion: 1, kind: 'prune-existing-revision', scope: request.scope,
    snapshotSha256: sha256(`${JSON.stringify(request.previous)}\n`), context: request.context, codeSha: request.codeSha }));
}
function matchesOwner(owner: MutationOwner, request: PruneRequest): void {
  if (owner.phase !== 'freezing' || owner.environment !== request.scope.environment || owner.indexName !== request.scope.indexName
    || owner.operationKey !== pruneOperationKey(request)) throw new Error('prune_owner_mismatch');
}
function assertion(db: CatalogD1, sql: string, params: unknown[] = []) {
  return db.prepare(`SELECT json(CASE WHEN (${sql}) THEN 'true' ELSE 'prune_fenced' END)`).bind(...params);
}
function priorAssertion(db: CatalogD1, request: PruneRequest, globalWatermark: number, prior: Row) {
  const columns = ['release_id','catalog_revision','code_sha','completed_at','manifest_json'];
  return assertion(db, `(SELECT coalesce(max(rowid),0) FROM publication_receipts)=?
    AND (SELECT coalesce(max(sequence),0) FROM vector_sync_outbox)=?
    AND NOT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE status!='complete')
    AND (? IS NULL OR EXISTS(SELECT 1 FROM publication_receipts WHERE ${columns.map(key => `${key} IS ?`).join(' AND ')}))
    AND ?>${NOW}`, [request.context.publicationReceiptWatermark, globalWatermark, request.context.priorPublication?.releaseId ?? null,
      ...columns.map(key => prior[key]), request.context.cutoff]);
}
function held(value: { id: string; publicId: string; slug: string }, reason: SafeHeldProduct['reason']): SafeHeldProduct {
  return { id: value.id, publicId: value.publicId, slug: value.slug, path: `/gifts/${value.slug}`,
    title: 'Gift currently unavailable', description: 'This gift is not currently available in the curated catalog. Browse other gifts instead.', reason };
}
async function storedProjection(db: CatalogD1, owner: MutationOwner, packet: ProjectionPacket): Promise<void> {
  const rows = await readOwnedProjection(db,owner,packet.receipt.catalog_revision,packet.rows.map(row=>String(row.public_id)).sort());
  rows.sort((a,b) => String(a.public_id).localeCompare(String(b.public_id)));
  if (canonicalJson(rows) !== canonicalJson(packet.rows)) throw new Error('prune_projection_changed');
}
/** Executable no-Amazon daily path. Caller acquires shared freezing ownership
 * using pruneOperationKey first. Retried claims use persisted capturedAt and the
 * same request; source drift refuses rather than silently producing a new seal.
 * No products/catalog_revision update, vector rewrite, generation, or dispatch.
 */
async function prune(db: CatalogD1, owner: MutationOwner, request: PruneRequest): Promise<
  { state: 'unchanged'; allHeld: boolean } | { state: 'prepared' | 'all_held'; revision: PrunedRevision; owner: MutationOwner }
> {
  owner = structuredClone(owner); request = structuredClone(request);
  matchesOwner(owner, request);
  await db.batch([mutationAssertion(db, owner, ['freezing'])]);
  const source = await readPruningSource(db, request.previous, request.context, owner);
  const now = new Date(source.observedAt); const cutoff = Date.parse(request.context.cutoff);
  if (cutoff <= now.getTime() || cutoff - Date.parse(owner.capturedAt) > 26 * 3600000) throw new Error('prune_window_elapsed');
  const current = new Map(source.current.map(row => [String(row.public_id), row]));
  const projections = new Map(source.projection.map(row => [String(row.public_id), row]));
  const products = []; const removed: SafeHeldProduct[] = [];
  for (const product of source.snapshot.products) {
    try {
      checkCurrent(product, projections.get(product.publicId)!, current.get(product.publicId)!, now);
      if (Date.parse(product.eligibleUntil) <= cutoff) throw new Error('expired');
      products.push(product); // Exact previous deadline and display bytes: no renewal.
    } catch { removed.push(held(product, Date.parse(product.eligibleUntil) <= cutoff ? 'expired' : 'editorial_hold')); }
  }
  const unique = new Set(suppressNearDuplicateProducts(products).map(product => product.publicId));
  const ready = products.filter(product => {
    if (unique.has(product.publicId)) return true;
    removed.push(held(product, 'duplicate')); return false;
  });
  const safeHeld = source.snapshot.heldProducts.map(value => {
    const safe = { ...value };
    if (safe.affiliateUrl) {
      const right = JSON.parse(String(current.get(safe.publicId)!.rights_json)).affiliateUrl;
      if (!right || !['owned','licensed'].includes(right.basis) || right.expiresAt || !right.reference?.trim()
        || right.value !== safe.affiliateUrl) delete safe.affiliateUrl;
    }
    return safe;
  });
  if (!removed.length && canonicalJson(safeHeld) === canonicalJson(source.snapshot.heldProducts))
    return { state: 'unchanged', allHeld: !ready.length };
  const revision = `p-${owner.operationKey.slice(0,62)}`;
  const existing = (await db.prepare('SELECT * FROM catalog_revisions WHERE revision=?').bind(revision).all()).results[0];
  if (existing?.abandonment_delivery_id) throw new Error('prune_revision_abandoned');
  const generatedAt = existing ? canonicalTime(existing.created_at) : owner.capturedAt;
  const snapshot = validateCatalogSnapshot({ ...source.snapshot, catalogRevision: revision, generatedAt,
    products: ready, heldProducts: [...safeHeld, ...removed] }, now);
  const globalVectorWatermark = Number(source.header.globalWatermark);
  const sourceDigest = sha256(canonicalJson({ operationKey: owner.operationKey, generatedAt,
    globalVectorWatermark, current: source.current, prior: source.header.prior }));
  const packet = await createProjectionPacket(snapshot, source.facts, sourceDigest, now);
  const sealed = await sealCapturedRevision(db, owner, { request, snapshot, packet, sourceRows: source.current,
    priorRow: source.header.prior as Row, sourceDigest, globalVectorWatermark, vectorSyncWatermark: 0, operationKey: owner.operationKey });
  return { state: ready.length ? 'prepared' : 'all_held', ...sealed };
}
/** Shared seal transaction only. Policy stays in the subset pruner or explicit
 * approved-cohort caller; this helper never selects or approves product rows.
 */
export async function sealCapturedRevision(db: CatalogD1, owner: MutationOwner, input: PrunedRevision) {
  owner = structuredClone(owner); input = structuredClone(input);
  const { request, snapshot, packet, sourceRows, sourceDigest, globalVectorWatermark, priorRow } = input;
  if (owner.phase !== 'freezing' || owner.operationKey !== input.operationKey || owner.environment !== request.scope.environment
    || owner.indexName !== request.scope.indexName || snapshot.catalogRevision === request.previous.catalogRevision) throw new Error('prune_owner_mismatch');
  const revision = snapshot.catalogRevision;
  const generatedAt = snapshot.generatedAt;
  const existing = (await db.prepare('SELECT * FROM catalog_revisions WHERE revision=?').bind(revision).all()).results[0];
  if (existing?.abandonment_delivery_id) throw new Error('prune_revision_abandoned');
  if (existing && (existing.source_export_sha256 !== sourceDigest || !['importing','reconciled'].includes(String(existing.status))))
    throw new Error('prune_retry_source_changed');
  const imports = await unabandonedImportsQuery(db,owner.environment,revision);
  await assertPruningCurrent(db, owner, sourceRows);
  const start = [mutationAssertion(db, owner, ['freezing']), priorAssertion(db, request, globalVectorWatermark, priorRow),
    assertion(db, imports.sql, imports.params)];
  await db.batch([...start, db.prepare(`INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status)
    VALUES(?,?,?,'importing') ON CONFLICT(revision) DO NOTHING`).bind(revision, generatedAt, sourceDigest)]);
  const receipt = (await db.prepare('SELECT * FROM catalog_projection_receipts WHERE catalog_revision=?').bind(revision).all()).results[0];
  const partial = await readOwnedProjection(db,owner,revision,packet.rows.map(row=>String(row.public_id)).sort());
  const expected = new Map(packet.rows.map(row => [row.public_id, row]));
  if (partial.some(row => canonicalJson(row) !== canonicalJson(expected.get(String(row.public_id))))) throw new Error('prune_projection_changed');
  const present = new Set(partial.map(row => row.public_id)); const missing = packet.rows.filter(row => !present.has(row.public_id));
  if (receipt && missing.length) throw new Error('prune_projection_changed');
  // Chunks are restartable while visibility remains held behind the final seal.
  const gate = mutationFenceQuery(owner, ['freezing']);
  const guard = {sql:`SELECT json(CASE WHEN ${gate.sql} THEN 'true' ELSE 'mutation_fenced' END)`,params:gate.params};
  for (let offset = 0; offset < missing.length;) {
    let queries: ReturnType<typeof projectionQueries> = []; let inserted = 0;
    for (const row of missing.slice(offset,offset+35)) {
      const next = projectionQueries({...packet,rows:[row]}).slice(0,-1);
      if (queries.length+next.length >= 50 || Buffer.byteLength(JSON.stringify({batch:[guard,...queries,...next]})) > 512*1024) break;
      queries = [...queries,...next]; inserted++;
    }
    if (!queries.length) throw new Error('prune_projection_bound');
    await db.batch([mutationAssertion(db, owner, ['freezing']), ...queries.map(query =>
      db.prepare(query.sql).bind(...query.params))]);
    offset += inserted;
  }
  await storedProjection(db, owner, packet);
  let nextOwner = owner;
  if (receipt) {
    if (canonicalJson(receipt) !== canonicalJson(packet.receipt)) throw new Error('prune_receipt_changed');
  } else {
    const query = projectionQueries(packet).at(-1)!;
    nextOwner = { ...owner, epoch: owner.epoch + 1 };
    const receiptPredicate = { sql: 'SELECT 1 FROM catalog_projection_receipts WHERE catalog_revision=? AND snapshot_sha256=? AND projection_sha256=?',
      params: [revision, packet.receipt.snapshot_sha256, packet.receipt.projection_sha256] };
    await assertPruningCurrent(db, owner, sourceRows);
    await db.batch([mutationAssertion(db, owner, ['freezing']), priorAssertion(db, request, globalVectorWatermark, priorRow),
      db.prepare(query.sql).bind(...query.params), mutationAdvance(db, owner, receiptPredicate), mutationAssertion(db, nextOwner, ['freezing'])]);
  }
  // An empty target has no per-revision events; global settlement is separately
  // bound above. Neither zero nor a projection receipt proves index promotion.
  const vectorSyncWatermark = (await db.prepare('SELECT coalesce(max(sequence),0) n FROM vector_sync_outbox WHERE source_revision=?')
    .bind(revision).all<{ n: number }>()).results[0].n;
  return { owner: nextOwner, revision: { ...input, vectorSyncWatermark } };
}
function safeFailure(error: unknown): Error {
  const message = error instanceof Error && /^prune_[a-z_]+$/.test(error.message) ? error.message : 'prune_failed';
  return new Error(message);
}
export async function pruneExistingRevision(db: CatalogD1, owner: MutationOwner, request: PruneRequest) {
  try { return await prune(db, owner, request); } catch (error) { throw safeFailure(error); }
}
export function prunedVectorPlan(revision: PrunedRevision): PrunedVectorPlan {
  const rows = new Map(revision.sourceRows.map(row => [row.public_id, row]));
  const ready = new Set(revision.snapshot.products.map(product => product.publicId));
  const absent = revision.request.previous.products.filter(product => !ready.has(product.publicId)).map(product => product.publicId);
  if (revision.snapshot.products.some(product => {
    const value = rows.get(product.publicId)?.embedding_text_hash;
    return value !== null && (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value));
  })) throw new Error('prune_embedding_hash_unproven');
  return { ...revision.request.scope, catalogRevision: revision.snapshot.catalogRevision,
    snapshotSha256: revision.packet.receipt.snapshot_sha256, globalWatermark: revision.globalVectorWatermark,
    products: revision.snapshot.products.map(product => ({ publicId: product.publicId,
      sourceFactsHash: String(rows.get(product.publicId)!.source_facts_hash),
      embeddingTextHash: typeof rows.get(product.publicId)!.embedding_text_hash === 'string' ? String(rows.get(product.publicId)!.embedding_text_hash) : null })),
    absentIds: [...absent, ...(revision.additionalAbsentIds || []).filter(id => !absent.includes(id))] };
}
/** Only independent settled index readback permits reconciling the new revision
 * and queuing its real build request. Stable-UUID promotion can temporarily force
 * the old release to keyword fallback. Rollback requires restoring/verifying old
 * vectors; flipping an old Worker alone never restores semantic parity.
 */
async function settle(db: CatalogD1, owner: MutationOwner, revision: PrunedRevision,
  readVectors: (plan: PrunedVectorPlan, signal: AbortSignal) => Promise<PrunedVectorObservation>) {
  matchesOwner(owner, revision.request);
  // Recompute the exact deterministic plan; a caller cannot relabel a projection
  // or sneak a newly approved/held product into a serialized retry payload.
  const rebuilt = await pruneExistingRevision(db, owner, revision.request);
  if (rebuilt.state === 'unchanged' || canonicalJson(rebuilt.revision) !== canonicalJson(revision)) throw new Error('prune_packet_changed');
  return settleCapturedRevision(db, owner, revision, readVectors);
}
/** Queue an already independently rebuilt exact seal. The policy-specific
 * entrypoints MUST reconstruct and compare it before calling this transaction.
 */
export async function settleCapturedRevision(db: CatalogD1, owner: MutationOwner, revision: PrunedRevision,
  readVectors: (plan: PrunedVectorPlan, signal: AbortSignal) => Promise<PrunedVectorObservation>) {
  owner = structuredClone(owner); revision = structuredClone(revision);
  if (owner.phase !== 'freezing' || owner.operationKey !== revision.operationKey || owner.environment !== revision.request.scope.environment
    || owner.indexName !== revision.request.scope.indexName) throw new Error('prune_owner_mismatch');
  const plan = prunedVectorPlan(revision); let observed: PrunedVectorObservation;
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    observed = await Promise.race([readVectors(structuredClone(plan), controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('prune_vectors_unconfirmed')); }, 3000);
    })]);
  } catch { throw new Error('prune_vectors_unconfirmed'); } finally { clearTimeout(timer); }
  if (!observed || observed.settled !== true || observed.environment !== owner.environment || observed.indexName !== owner.indexName
    || observed.planSha256 !== sha256(canonicalJson(plan)) || typeof observed.reference !== 'string'
    || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(observed.reference)) throw new Error('prune_vectors_unconfirmed');
  const request: CatalogBuildRequest = { schemaVersion: 1, environment: owner.environment,
    sourceRevision: revision.snapshot.catalogRevision, sourceDigest: revision.packet.receipt.snapshot_sha256,
    codeSha: revision.request.codeSha, priorReleaseId: revision.request.context.priorPublication?.releaseId ?? null,
    capturedAt: revision.snapshot.generatedAt, cutoff: revision.request.context.cutoff };
  const bytes = encodeBuildRequest(request); const requestId = sha256(bytes);
  const existingRequest = (await db.prepare('SELECT request_json FROM catalog_build_requests WHERE request_id=?').bind(requestId).all()).results[0];
  await assertPruningCurrent(db, owner, revision.sourceRows);
  // The barrier excludes supported source writers between streamed validation
  // and this compact atomic transaction. Never split receipt/queue/epoch writes.
  await storedProjection(db, owner, revision.packet);
  const sealedReceipt = (await db.prepare('SELECT * FROM catalog_projection_receipts WHERE catalog_revision=?')
    .bind(revision.snapshot.catalogRevision).all()).results[0];
  if (canonicalJson(sealedReceipt) !== canonicalJson(revision.packet.receipt)) throw new Error('prune_receipt_changed');
  const receiptColumns = ['catalog_revision','snapshot_sha256','projection_sha256','source_export_sha256','product_count','created_at'] as const;
  const receiptAssertion = () => assertion(db, `EXISTS(SELECT 1 FROM catalog_projection_receipts WHERE ${receiptColumns.map(key=>`${key} IS ?`).join(' AND ')})`,
    receiptColumns.map(key=>revision.packet.receipt[key]));
  if (existingRequest) {
    if (existingRequest.request_json !== bytes) throw new Error('prune_build_request_changed');
    await db.batch([mutationAssertion(db, owner, ['freezing']), receiptAssertion(),
      priorAssertion(db, revision.request, revision.globalVectorWatermark, revision.priorRow)]);
    return { state: 'existing' as const, requestId, owner };
  }
  const gate = mutationFenceQuery(owner, ['freezing']); const nextOwner = { ...owner, epoch: owner.epoch + 1 };
  await db.batch([mutationAssertion(db, owner, ['freezing']), receiptAssertion(),
    priorAssertion(db, revision.request, revision.globalVectorWatermark, revision.priorRow),
    assertion(db, `NOT EXISTS(SELECT 1 FROM catalog_public_products WHERE catalog_revision=? AND eligible_until<=${NOW})`, [revision.snapshot.catalogRevision]),
    db.prepare(`UPDATE catalog_revisions SET status='reconciled' WHERE revision=? AND source_export_sha256=?
      AND status IN ('importing','reconciled') AND ${gate.sql}`).bind(revision.snapshot.catalogRevision, revision.sourceDigest, ...gate.params),
    assertion(db, "EXISTS(SELECT 1 FROM catalog_revisions WHERE revision=? AND source_export_sha256=? AND status='reconciled')",
      [revision.snapshot.catalogRevision, revision.sourceDigest]),
    db.prepare(`INSERT INTO catalog_build_requests(request_id,environment,source_revision,request_json)
      VALUES(?,?,?,?) ON CONFLICT(request_id) DO NOTHING`).bind(requestId, owner.environment, revision.snapshot.catalogRevision, bytes),
    assertion(db, 'EXISTS(SELECT 1 FROM catalog_build_requests WHERE request_id=? AND request_json=?)', [requestId, bytes]),
    mutationAdvance(db, owner, { sql: 'SELECT 1 FROM catalog_build_requests WHERE request_id=? AND request_json=?', params: [requestId, bytes] }),
    mutationAssertion(db, nextOwner, ['freezing']),
  ]);
  return { state: revision.snapshot.products.length ? 'build_queued' as const : 'all_held_build_queued' as const, requestId, owner: nextOwner };
}
export async function settlePrunedRevision(db: CatalogD1, owner: MutationOwner, revision: PrunedRevision,
  readVectors: (plan: PrunedVectorPlan, signal: AbortSignal) => Promise<PrunedVectorObservation>) {
  try { return await settle(db, owner, revision, readVectors); } catch (error) { throw safeFailure(error); }
}
