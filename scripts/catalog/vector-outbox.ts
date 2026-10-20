import { createHash, randomUUID } from 'node:crypto';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { assertLegacyMutationAllowed, legacyMutationGuard } from '../../lib/catalog/mutation-fence.ts';
import { getProductsByPublicIds } from '../../lib/catalog/storage/d1.ts';
import { canonicalJson, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, sha256 } from './migration.ts';
import { encodePgvectorSendBase64 } from './pgvector-binary.ts';
import { validateReviewedVectorDelete } from './vector-delete.ts';
import type { ReviewedVectorDelete } from './vector-delete.ts';

/** OFFLINE/UNACTIVATED: a real adapter needs one serialized writer for the entire index,
 * not just one revision. Stable UUID replacement can make old releases use keyword fallback.
 * Rollback must restore and verify original prior vectors before claiming semantic parity.
 * D1 fencing cannot undo an external mutation accepted before a concurrent product change.
 */
type EventIdentity = { sequence: number; publicId: string; catalogRevision: string };
type VerifiedEvent = EventIdentity & { embeddingTextHash: string; operation: 'upsert' | 'delete'; deleteMutationSha256?: never };
type ReviewedDeleteEvent = EventIdentity & { embeddingTextHash: null; operation: 'delete'; deleteMutationSha256: string };
export type VectorEvent = VerifiedEvent | ReviewedDeleteEvent;
export type ImmutableVectorPayload = VerifiedEvent & {
  model: typeof EMBEDDING_MODEL; embeddingText: string; sourceFactsHash: string | null;
} & ({ operation: 'upsert'; values: number[]; vectorBytesSha256: string } | { operation: 'delete' })
  | ReviewedDeleteEvent & { mutation: ReviewedVectorDelete };
export interface SyncVector { id: string; values: number[]; metadata: Record<string, string | boolean>; namespace?: string }
export interface VectorSyncAdapters {
  /** Read a reviewed immutable payload; no embedding generation or legacy hash invention. */
  loadPayload(event: Readonly<VectorEvent>, signal: AbortSignal): Promise<ImmutableVectorPayload>;
  upsert(vector: SyncVector, signal: AbortSignal): Promise<{ reference: string }>;
  delete(id: string, signal: AbortSignal): Promise<{ reference: string }>;
  /** Exact ID lookup including values/metadata. null means verified absence, never a filtered query miss. */
  readback(id: string, signal: AbortSignal): Promise<SyncVector | null>;
}
type Pending = { sequence: number; public_id: string; source_revision: string; embedding_text_hash: string | null;
  operation: 'upsert' | 'delete'; delete_mutation_sha256: string | null };
type Code = 'payload_invalid' | 'current_state_changed' | 'provider_failed' | 'not_visible' | 'timeout' | 'fenced';
class Failure extends Error {
  readonly code: Code;
  constructor(code: Code) { super(code); this.code = code; }
}
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const LEASE_MS = 60_000;
const RETRY_MS = 5000;

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeout: number): Promise<T> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Failure('timeout')); controller.abort(); }, timeout);
    })]);
  } finally { clearTimeout(timer); }
}
function nativeHash(values: number[]): string {
  return createHash('sha256').update(Buffer.from(encodePgvectorSendBase64(values), 'base64')).digest('hex');
}
function validValues(values: unknown): values is number[] {
  return Array.isArray(values) && values.length === EMBEDDING_DIMENSIONS
    && Array.from(values).every((value) => typeof value === 'number' && Number.isFinite(value));
}

function payloadVector(event: VectorEvent, input: ImmutableVectorPayload, product: Record<string, unknown>, reviewBytes: string | undefined, now: number): SyncVector | null {
  if (event.embeddingTextHash === null) {
    if (!input || input.embeddingTextHash !== null || input.operation !== 'delete' || input.sequence !== event.sequence
      || input.publicId !== event.publicId || input.catalogRevision !== event.catalogRevision
      || input.deleteMutationSha256 !== event.deleteMutationSha256
      || Object.keys(input).some(key => !['sequence','publicId','catalogRevision','embeddingTextHash','operation','deleteMutationSha256','mutation'].includes(key))) throw new Failure('payload_invalid');
    validateReviewedVectorDelete(input.mutation, product);
    const bytes = canonicalJson(input.mutation);
    if (bytes !== reviewBytes || sha256(bytes) !== event.deleteMutationSha256
      || Date.parse(input.mutation.reviewedAt) > now) throw new Failure('payload_invalid');
    return null;
  }
  if (!input || input.embeddingTextHash === null || 'deleteMutationSha256' in input) throw new Failure('payload_invalid');
  if (!input || input.sequence !== event.sequence || input.publicId !== event.publicId || input.catalogRevision !== event.catalogRevision
    || input.operation !== event.operation || input.embeddingTextHash !== event.embeddingTextHash || input.model !== EMBEDDING_MODEL
    || typeof input.embeddingText !== 'string' || !input.embeddingText.trim() || Buffer.byteLength(input.embeddingText) > 64_000
    || sha256(input.embeddingText) !== event.embeddingTextHash || input.sourceFactsHash !== product.source_facts_hash
    || input.sourceFactsHash !== null && !HASH.test(input.sourceFactsHash)) throw new Failure('payload_invalid');
  if (input.operation === 'delete') {
    if ('values' in input || 'vectorBytesSha256' in input) throw new Failure('payload_invalid');
    return null;
  }
  if (!validValues(input.values) || !HASH.test(input.vectorBytesSha256)
    || input.sourceFactsHash === null || nativeHash(input.values) !== input.vectorBytesSha256) throw new Failure('payload_invalid');
  return { id: event.publicId, values: [...input.values], metadata: { catalogRevision: event.catalogRevision, eligible: true,
    embeddingTextHash: event.embeddingTextHash, embeddingModel: EMBEDDING_MODEL, sourceFactsHash: input.sourceFactsHash,
    vectorBytesSha256: input.vectorBytesSha256 } };
}
function visible(expected: SyncVector | null, actual: SyncVector | null): boolean {
  if (expected === null) return actual === null;
  try {
    return Boolean(actual && actual.id === expected.id && !actual.namespace && validValues(actual.values)
      && nativeHash(actual.values.map(Math.fround)) === expected.metadata.vectorBytesSha256
      && canonicalJson(actual.metadata) === canonicalJson(expected.metadata));
  } catch { return false; }
}
function stateFence(event: VectorEvent, product: Record<string, unknown>, eligibleUntil: string | null) {
  const columns = Object.keys(product);
  if (!columns.length || columns.length > 60 || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new Failure('current_state_changed');
  return { sql: `public_id=? AND source_revision=? AND embedding_text_hash IS ? AND operation=? AND delete_mutation_sha256 IS ? AND EXISTS(
      SELECT 1 FROM products p WHERE ${columns.map((column) => `p.${column} IS ?`).join(' AND ')}
      ${event.operation === 'upsert' ? `AND p.eligible_until>${NOW} AND ?>${NOW}` : ''})`,
    params: [event.publicId, event.catalogRevision, event.embeddingTextHash, event.operation, event.deleteMutationSha256 || null,
      ...columns.map((column) => product[column]), ...(event.operation === 'upsert' ? [eligibleUntil] : [])] };
}

/** One explicit revision, 1..10 events, max3 attempts/event, no polling or regeneration.
 * Pending accepted mutations are read back on retry without sending another mutation.
 * Complete lease_token is retained as the completion fence; it is not an active lease.
 */
export async function drainVectorOutbox(options: {
  db: CatalogD1; catalogRevision: string; adapters: VectorSyncAdapters;
  maxEvents?: number; timeoutMs?: number; now?: () => number;
}) {
  const { db, adapters, catalogRevision } = options;
  const maxEvents = options.maxEvents ?? 5;
  if (typeof catalogRevision !== 'string' || !catalogRevision.trim() || Buffer.byteLength(catalogRevision) > 64
    || !Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 10) throw new Error('invalid_vector_drain_bound');
  const timeout = Math.max(10, Math.min(Number.isFinite(options.timeoutMs) ? options.timeoutMs! : 1500, 3000));
  const now = options.now || Date.now;
  // The enabled ownership protocol has no implicit legacy provider writer.
  // Installing/enabling0009 requires stopping in-flight old/manual adapters first.
  await assertLegacyMutationAllowed(db);
  const legacy = await legacyMutationGuard(db);
  const outcomes: Array<{ sequence: number; outcome: 'complete' | 'pending' | 'skipped'; errorCode: Code | null }> = [];
  let rows: Pending[];
  try {
    rows = (await db.prepare(`SELECT sequence,public_id,source_revision,embedding_text_hash,operation,delete_mutation_sha256 FROM vector_sync_outbox
      WHERE source_revision=? AND status='pending' AND attempts<3 AND (lease_until IS NULL OR lease_until<=${NOW})
      ORDER BY sequence LIMIT ?`).bind(catalogRevision, maxEvents).all<Pending>()).results.slice(0, maxEvents);
  } catch { throw new Error('vector_outbox_unavailable'); }
  for (const row of rows) {
    const token = randomUUID(); let claimed = false;
    if (row.embedding_text_hash === null && (row.operation !== 'delete' || !HASH.test(row.delete_mutation_sha256 || ''))) throw new Error('vector_outbox_unavailable');
    const event: VectorEvent = Object.freeze({ sequence: row.sequence, publicId: row.public_id, catalogRevision: row.source_revision,
      ...(row.embedding_text_hash === null ? { embeddingTextHash: null, operation: 'delete' as const, deleteMutationSha256: row.delete_mutation_sha256! }
        : { embeddingTextHash: row.embedding_text_hash, operation: row.operation }) });
    try {
      const leaseUntil = new Date(now() + LEASE_MS).toISOString();
      await db.prepare(`UPDATE vector_sync_outbox SET lease_token=?,lease_until=?,attempts=attempts+1,error_code=NULL
        WHERE sequence=? AND status='pending' AND attempts<3 AND (lease_until IS NULL OR lease_until<=${NOW})
        AND public_id=? AND source_revision=? AND embedding_text_hash IS ? AND operation=? AND delete_mutation_sha256 IS ? AND ?>${NOW} AND ${legacy.sql}`)
        .bind(token, leaseUntil, event.sequence, event.publicId, event.catalogRevision,
          event.embeddingTextHash, event.operation, event.deleteMutationSha256 || null, leaseUntil).run();
      const owner = (await db.prepare(`SELECT mutation_reference FROM vector_sync_outbox WHERE sequence=? AND lease_token=?
        AND status='pending' AND lease_until>${NOW}`).bind(event.sequence, token).all<{ mutation_reference: string | null }>()).results[0];
      if (!owner) throw new Failure('fenced');
      claimed = true;
      if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || !UUID.test(event.publicId)
        || (event.embeddingTextHash !== null && !HASH.test(event.embeddingTextHash))
        || !['upsert', 'delete'].includes(event.operation) || event.catalogRevision !== catalogRevision) throw new Failure('payload_invalid');
      const product = (await db.prepare('SELECT * FROM products WHERE public_id=?').bind(event.publicId).all()).results[0];
      if (!product || product.catalog_revision !== catalogRevision || product.embedding_text_hash !== event.embeddingTextHash) throw new Failure('current_state_changed');
      const eligible = await getProductsByPublicIds(db, [event.publicId], new Date(now()), catalogRevision);
      if ((event.operation === 'upsert') !== Boolean(eligible.length)) throw new Failure('current_state_changed');
      let input: ImmutableVectorPayload;
      try { input = await bounded((signal) => adapters.loadPayload(event, signal), timeout); }
      catch (error) { throw error instanceof Failure ? error : new Failure('payload_invalid'); }
      let vector: SyncVector | null;
      try {
        const review = event.embeddingTextHash === null ? (await db.prepare(`SELECT mutation_json FROM vector_delete_mutations
          WHERE mutation_sha256=? AND public_id=? AND source_revision=?`).bind(event.deleteMutationSha256, event.publicId, event.catalogRevision)
          .all<{ mutation_json: string }>()).results[0] : undefined;
        if (event.embeddingTextHash === null && !review) throw new Failure('payload_invalid');
        vector = payloadVector(event, input, product, review?.mutation_json, now());
      }
      catch { throw new Failure('payload_invalid'); }
      const fence = stateFence(event, product, eligible[0]?.eligibleUntil || null);
      const ownedSql = `sequence=? AND lease_token=? AND status='pending' AND lease_until>${NOW} AND ${fence.sql}`;
      const params = [event.sequence, token, ...fence.params];
      const check = async () => {
        if (!(await db.prepare(`SELECT 1 FROM vector_sync_outbox WHERE ${ownedSql}`).bind(...params).all()).results.length) throw new Failure('current_state_changed');
      };
      let actual = await bounded((signal) => adapters.readback(event.publicId, signal), timeout);
      if (!visible(vector, actual)) {
        await check(); // Never dispatch a payload made stale while loading/reading it.
        if (!owner.mutation_reference) {
          const accepted = await bounded((signal) => vector ? adapters.upsert(structuredClone(vector), signal) : adapters.delete(event.publicId, signal), timeout);
          if (!accepted || typeof accepted.reference !== 'string' || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(accepted.reference)) throw new Failure('provider_failed');
          await db.prepare(`UPDATE vector_sync_outbox SET mutation_reference=? WHERE ${ownedSql} AND ${legacy.sql}`)
            .bind(accepted.reference, ...params).run();
          await check();
          actual = await bounded((signal) => adapters.readback(event.publicId, signal), timeout);
        }
        if (!visible(vector, actual)) throw new Failure('not_visible');
      }
      await db.prepare(`UPDATE vector_sync_outbox SET status='complete',completed_at=${NOW},lease_until=NULL,error_code=NULL WHERE ${ownedSql} AND ${legacy.sql}`)
        .bind(...params).run();
      const complete = (await db.prepare('SELECT status,lease_token FROM vector_sync_outbox WHERE sequence=?').bind(event.sequence)
        .all<{ status: string; lease_token: string | null }>()).results[0];
      if (complete?.status !== 'complete' || complete.lease_token !== token) throw new Failure('current_state_changed');
      outcomes.push({ sequence: event.sequence, outcome: 'complete', errorCode: null });
    } catch (error) {
      const code: Code = error instanceof Failure ? error.code : 'provider_failed';
      if (claimed) try {
        await db.prepare(`UPDATE vector_sync_outbox SET lease_token=NULL,lease_until=?,error_code=?
          WHERE sequence=? AND lease_token=? AND status='pending' AND lease_until>${NOW} AND ${legacy.sql}`)
          .bind(new Date(now() + RETRY_MS).toISOString(), code, event.sequence, token).run();
      } catch { /* Remains pending/leased; expiry permits recovery. Never log provider errors. */ }
      outcomes.push({ sequence: event.sequence, outcome: code === 'fenced' ? 'skipped' : 'pending', errorCode: code });
    }
  }
  try {
    const remaining = (await db.prepare(`SELECT count(*) pending,sum(CASE WHEN attempts>=3 THEN 1 ELSE 0 END) exhausted
      FROM vector_sync_outbox WHERE source_revision=? AND status='pending'`).bind(catalogRevision).all<{ pending: number; exhausted: number | null }>()).results[0];
    return { outcomes, pending: remaining.pending, exhausted: remaining.exhausted || 0 };
  } catch { throw new Error('vector_outbox_unavailable'); }
}
