import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import type { CatalogSnapshot, ProductRights, PublicCatalogProduct } from '../../lib/catalog/types.ts';
import { createProjectionPacket } from '../../lib/catalog/d1.ts';
import { canonicalTime, EDITORIAL_MAX_AGE_MS, publicProductRightsExpiry,
  validateCatalogSnapshot, validatePublicCatalogProduct } from '../../lib/catalog/snapshot.ts';
import { isPurchasableAvailability } from '../../lib/gift-slugs.ts';
import { suppressNearDuplicateProducts } from '../../lib/db/product-scoring.ts';
import { canonicalJson, canonicalTimestamp, sha256 } from './migration.ts';

/** The sealed header/held/history/order are not versioned in D1. Supply these
 * from an independently reviewed, hash-pinned artifact, not mutable current rows.
 * Property order is retained because the existing snapshot digest hashes JSON bytes.
 */
export type SealedSnapshotEnvelope = Omit<CatalogSnapshot, 'products'> & { products: string[] };
export interface SnapshotReadContext {
  envelopeSha256: string; snapshotSha256: string; projectionSha256: string; sourceExportSha256: string;
  vectorSyncWatermark: number; publicationReceiptWatermark: number; cutoff: string;
  /** Hash of canonicalJson of the exact five-column publication_receipts row.
   * The workflow supplies the correct environment/database; receipts lack an env column.
   */
  priorPublication: { releaseId: string; receiptSha256: string } | null;
}
export type SnapshotReadResult = { status: 'ready'; snapshot: CatalogSnapshot; observedAt: string }
  | { status: 'held'; reason: string; requiresNewRevision: boolean };
export const SNAPSHOT_READ_LIMITS = Object.freeze({ ready: 5000, held: 10000, slugs: 20000,
  identities: 10000, rowBytes: 128 * 1024, resultBytes: 32 * 1024 * 1024, outboxSequence: 100000 });
type Row = Record<string, unknown>;
type CaptureRow = { kind: string; identity: string; data: string };
const HASH = /^[a-f0-9]{64}$/;
const KEY = /^[a-zA-Z0-9._-]{1,200}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PROJECTION = ['catalog_revision', 'public_id', 'product_id', 'slug', 'title', 'description', 'tags',
  'source_facts_hash', 'eligible_until', 'public_display_json', 'display_sha256'];
const CURRENT = ['id', 'public_id', 'slug', 'source', 'quality_score', 'is_active', 'duplicate_of_product_id',
  'editorial_status', 'availability_status', 'availability_checked_at', 'last_verified_at', 'source_facts_hash',
  'editorial_source_hash', 'eligible_until', 'public_display_json', 'rights_json', 'timestamp_provenance_json'];
const jsonColumns = (alias: string, columns: string[], extra: Record<string, string> = {}) =>
  `json_object(${[...columns.map((key) => `'${key}',${alias}.${key}`), ...Object.entries(extra).map(([key, expression]) => `'${key}',${expression}`)].join(',')})`;
const ARCHIVE_TIMES = Object.fromEntries(['id', 'public_id', 'source', 'availability_checked_at', 'last_verified_at']
  .map((key) => [`archived_${key}`, `json_extract(p.source_record_json,'$.${key}')`]));

/** One statement, bounded row-per-product output, not a giant aggregate JSON cell.
 * json_each of one bounded ID array avoids D1's100-parameter ceiling. Outbox
 * inspection has an explicit global sequence ceiling until a separate indexed
 * revision-watermark reader is justified; exceeding it is held, never truncated.
 */
const CAPTURE_SQL = `WITH ids AS (SELECT value FROM json_each(?)),
  projection AS (SELECT * FROM catalog_public_products WHERE catalog_revision=? LIMIT ${SNAPSHOT_READ_LIMITS.ready + 1}),
  vectors AS (SELECT sequence,source_revision,status FROM vector_sync_outbox WHERE sequence BETWEEN 1 AND ${SNAPSHOT_READ_LIMITS.outboxSequence}),
  prior AS (SELECT release_id,catalog_revision,code_sha,completed_at,manifest_json FROM publication_receipts WHERE release_id=?),
  captured AS (
  SELECT 'header' kind,'' identity,json_object('observedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    'revision',c.revision,'revisionStatus',c.status,'sourceDigest',c.source_export_sha256,
    'receipt',${jsonColumns('r', ['catalog_revision', 'snapshot_sha256', 'projection_sha256', 'source_export_sha256', 'product_count', 'created_at'])},
    'watermark',(SELECT coalesce(max(sequence),0) FROM vectors WHERE source_revision=?),
    'pending',(SELECT count(*) FROM vectors WHERE source_revision=? AND status!='complete'),
    'outboxOverflow',EXISTS(SELECT 1 FROM vector_sync_outbox WHERE sequence>${SNAPSHOT_READ_LIMITS.outboxSequence} LIMIT 1),
    'publicationWatermark',(SELECT coalesce(max(rowid),0) FROM publication_receipts),
    'prior',${jsonColumns('prior', ['release_id', 'catalog_revision', 'code_sha', 'completed_at', 'manifest_json'])}) data
    FROM (SELECT 1) LEFT JOIN catalog_revisions c ON c.revision=?
    LEFT JOIN catalog_projection_receipts r ON r.catalog_revision=c.revision LEFT JOIN prior ON 1
  UNION ALL SELECT 'projection',v.public_id,${jsonColumns('v', PROJECTION)} FROM projection v
  UNION ALL SELECT 'current',p.public_id,${jsonColumns('p', CURRENT, ARCHIVE_TIMES)} FROM ids CROSS JOIN products p ON p.public_id=ids.value),
  sized AS (SELECT *,length(CAST(data AS BLOB)) row_bytes,
    sum(length(CAST(data AS BLOB))) OVER (ORDER BY kind,identity) total_bytes FROM captured)
  SELECT kind,identity,CASE WHEN row_bytes>${SNAPSHOT_READ_LIMITS.rowBytes} OR total_bytes>${SNAPSHOT_READ_LIMITS.resultBytes}
    THEN '{"readBoundsExceeded":true}' ELSE data END data FROM sized ORDER BY kind,identity`;

function hold(reason: string, requiresNewRevision = false): SnapshotReadResult { return { status: 'held', reason, requiresNewRevision }; }
function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_object');
  return value as Row;
}
export function createSealedSnapshotEnvelope(input: CatalogSnapshot): SealedSnapshotEnvelope {
  const snapshot = validateCatalogSnapshot(input, new Date(canonicalTime(input.generatedAt)));
  return { ...snapshot, products: snapshot.products.map((product) => product.publicId) };
}
function inputs(envelope: SealedSnapshotEnvelope, context: SnapshotReadContext): void {
  if (Object.keys(envelope).sort().join(',') !== 'catalogRevision,dataKind,generatedAt,heldProducts,products,schemaVersion,slugHistory'
    || envelope.schemaVersion !== 1 || envelope.dataKind !== 'catalog' || !KEY.test(envelope.catalogRevision)
    || !Array.isArray(envelope.products) || !Array.isArray(envelope.heldProducts) || !Array.isArray(envelope.slugHistory)
    || envelope.products.length > SNAPSHOT_READ_LIMITS.ready || envelope.heldProducts.length > SNAPSHOT_READ_LIMITS.held
    || envelope.slugHistory.length > SNAPSHOT_READ_LIMITS.slugs
    || envelope.products.length + envelope.heldProducts.length > SNAPSHOT_READ_LIMITS.identities
    || envelope.products.some((id) => typeof id !== 'string' || !UUID.test(id))
    || new Set(envelope.products).size !== envelope.products.length
    || ![context.envelopeSha256, context.snapshotSha256, context.projectionSha256, context.sourceExportSha256].every((hash) => typeof hash === 'string' && HASH.test(hash))
    || !Number.isSafeInteger(context.vectorSyncWatermark) || context.vectorSyncWatermark < 0 || context.vectorSyncWatermark > SNAPSHOT_READ_LIMITS.outboxSequence
    || !Number.isSafeInteger(context.publicationReceiptWatermark) || context.publicationReceiptWatermark < 0
    || context.priorPublication !== null && (typeof context.priorPublication.releaseId !== 'string' || !KEY.test(context.priorPublication.releaseId)
      || typeof context.priorPublication.receiptSha256 !== 'string' || !HASH.test(context.priorPublication.receiptSha256))) throw new Error('invalid_context');
  canonicalTime(envelope.generatedAt); canonicalTime(context.cutoff);
  validateCatalogSnapshot({ ...envelope, products: [], slugHistory: [] }, new Date(envelope.generatedAt));
  if (Buffer.byteLength(JSON.stringify(envelope)) > SNAPSHOT_READ_LIMITS.resultBytes) throw new Error('read_bounds');
  if (sha256(`${JSON.stringify(envelope)}\n`) !== context.envelopeSha256) throw new Error('envelope_digest');
}
async function capture(db: CatalogD1, envelope: SealedSnapshotEnvelope, context: SnapshotReadContext) {
  const ids = [...envelope.products, ...envelope.heldProducts.map((product) => product.publicId)];
  const results = (await db.prepare(CAPTURE_SQL).bind(JSON.stringify(ids), envelope.catalogRevision, context.priorPublication?.releaseId ?? null,
    envelope.catalogRevision, envelope.catalogRevision, envelope.catalogRevision).all<CaptureRow>()).results;
  if (!Array.isArray(results) || results.length > 1 + SNAPSHOT_READ_LIMITS.ready + 1 + SNAPSHOT_READ_LIMITS.identities) throw new Error('read_bounds');
  let bytes = 0;
  const groups = { header: [] as Row[], projection: [] as Row[], current: [] as Row[] };
  for (const row of results) {
    if (!['header', 'projection', 'current'].includes(row.kind) || typeof row.data !== 'string') throw new Error('invalid_capture');
    const size = Buffer.byteLength(row.data); bytes += size;
    if (size > SNAPSHOT_READ_LIMITS.rowBytes || bytes > SNAPSHOT_READ_LIMITS.resultBytes) throw new Error('read_bounds');
    const parsed = object(JSON.parse(row.data));
    if (parsed.readBoundsExceeded) throw new Error('read_bounds');
    groups[row.kind as keyof typeof groups].push(parsed);
  }
  if (groups.header.length !== 1) throw new Error('invalid_capture');
  return { header: groups.header[0], projection: groups.projection, current: groups.current };
}
function verificationTime(current: Row, rights: ProductRights): number {
  const column = current.availability_checked_at !== null ? 'availability_checked_at' : 'last_verified_at';
  const raw = current[column];
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(raw)) throw new Error('verification_utc_unproven');
  canonicalTimestamp(raw); // Validates calendar/microseconds without assigning UTC to naive history.
  const provenance = object(JSON.parse(String(current.timestamp_provenance_json)));
  const fields = provenance.fields ? object(provenance.fields) : undefined;
  const evidence = fields?.[column] ? object(fields[column]) : undefined;
  let migrationEvidence = Boolean(provenance.schemaVersion === 1 && typeof provenance.sourceArchive === 'string' && provenance.sourceArchive.trim()
    && evidence && evidence.state === 'evidenced' && ['explicit_offset', 'documented_utc_writer'].includes(String(evidence.basis))
    && typeof evidence.evidence === 'string' && evidence.evidence.trim()
    && current.archived_id === current.id && current.archived_public_id === current.public_id && current.archived_source === current.source);
  if (migrationEvidence) {
    try {
      const decision = evidence!.basis === 'documented_utc_writer' ? { timezone: 'UTC' as const, evidence: String(evidence!.evidence) } : undefined;
      migrationEvidence = canonicalTimestamp(current[`archived_${column}`], decision) === canonicalTimestamp(raw);
    } catch { migrationEvidence = false; }
  }
  const receipt = rights.imageUrl;
  const freshEvidence = receipt?.basis === 'merchant' && receipt.reference.trim() && receipt.observedAt
    && canonicalTimestamp(receipt.observedAt) === canonicalTimestamp(raw);
  if (!migrationEvidence && !freshEvidence || evidence && evidence.state !== 'evidenced') throw new Error('verification_utc_unproven');
  return Date.parse(raw);
}
function checkCurrent(product: PublicCatalogProduct, projection: Row, current: Row, now: Date): void {
  if (!current || current.id !== product.id || current.public_id !== product.publicId || current.slug !== product.slug || current.source !== product.source
    || current.is_active !== 1 || current.duplicate_of_product_id !== null || typeof current.quality_score !== 'number' || current.quality_score < .55
    || !isPurchasableAvailability(String(current.availability_status)) || !['generated_ready', 'manual_locked'].includes(String(current.editorial_status))
    || current.source_facts_hash !== projection.source_facts_hash || current.source_facts_hash !== current.editorial_source_hash
    || typeof current.public_display_json !== 'string') throw new Error('current_hold_or_factual_drift');
  const approved = validatePublicCatalogProduct(JSON.parse(current.public_display_json), now);
  if (approved.id !== product.id || approved.publicId !== product.publicId || approved.slug !== product.slug) throw new Error('current_hold_or_factual_drift');
  const rights = object(JSON.parse(String(current.rights_json))) as ProductRights;
  const deadline = publicProductRightsExpiry(product, rights, now);
  const verified = verificationTime(current, rights);
  const until = Date.parse(canonicalTime(current.eligible_until));
  if (deadline === null || Date.parse(product.eligibleUntil) > deadline) throw new Error('current_rights_incompatible');
  if (verified > now.getTime() || verified + EDITORIAL_MAX_AGE_MS <= now.getTime()
    || Date.parse(product.eligibleUntil) > Math.min(until, verified + EDITORIAL_MAX_AGE_MS)) throw new Error('current_deadline_incompatible');
}

/** Reconstruction of an EXISTING seal, not a new-revision freshness freezer.
 * Inject a primary/first-primary session (or an authoritative writer bookmark),
 * not an unconstrained possibly-stale replica. Two stable
 * captures detect observed drift, not a lock against later writes/ABA or proof of
 * external Vectorize visibility. Workflow writer barriers + activation preflight
 * and independent deployed/vector readback remain mandatory after this returns.
 * No queries, raw source records, private rights, or adapter errors are returned.
 */
export async function reconstructD1Snapshot(db: CatalogD1, envelopeInput: SealedSnapshotEnvelope, contextInput: SnapshotReadContext): Promise<SnapshotReadResult> {
  try {
    const envelope = structuredClone(envelopeInput); const context = structuredClone(contextInput);
    inputs(envelope, context);
    const first = await capture(db, envelope, context); const { header, projection, current } = first;
    const now = new Date(canonicalTime(header.observedAt));
    if (header.revision !== envelope.catalogRevision || !['reconciled', 'published'].includes(String(header.revisionStatus))
      || header.sourceDigest !== context.sourceExportSha256) return hold('revision_not_reconciled');
    const receipt = object(header.receipt);
    if (receipt.catalog_revision !== envelope.catalogRevision || receipt.snapshot_sha256 !== context.snapshotSha256
      || receipt.projection_sha256 !== context.projectionSha256 || receipt.source_export_sha256 !== context.sourceExportSha256
      || receipt.product_count !== envelope.products.length || receipt.created_at !== envelope.generatedAt
      || projection.length !== envelope.products.length) return hold('projection_receipt_mismatch');
    if (header.outboxOverflow || header.watermark !== context.vectorSyncWatermark || header.pending !== 0) return hold('vector_watermark_unreconciled');
    const prior = object(header.prior);
    if (header.publicationWatermark !== context.publicationReceiptWatermark || (context.priorPublication === null ? prior.release_id !== null
      : prior.release_id !== context.priorPublication.releaseId || sha256(canonicalJson(prior)) !== context.priorPublication.receiptSha256)) return hold('publication_prior_changed');
    const byId = new Map(projection.map((row) => [row.public_id, row]));
    if (byId.size !== projection.length) return hold('projection_bytes_mismatch');
    const products = envelope.products.map((id) => JSON.parse(String(byId.get(id)?.public_display_json)) as PublicCatalogProduct);
    const snapshot = validateCatalogSnapshot({ ...envelope, products }, new Date(envelope.generatedAt));
    const facts = Object.fromEntries(projection.map((row) => [String(row.public_id), String(row.source_facts_hash)]));
    const packet = await createProjectionPacket(snapshot, facts, context.sourceExportSha256, new Date(envelope.generatedAt));
    const sortedProjection = [...projection].sort((a, b) => String(a.public_id).localeCompare(String(b.public_id)));
    if (canonicalJson(packet.rows) !== canonicalJson(sortedProjection) || canonicalJson(packet.receipt) !== canonicalJson(receipt)) return hold('projection_bytes_mismatch');
    if (snapshot.products.some((product) => Date.parse(product.eligibleUntil) <= Math.max(now.getTime(), Date.parse(context.cutoff)))) return hold('expiry_requires_new_revision', true);
    if (now.toISOString() >= context.cutoff) return hold('capture_window_elapsed');
    if (suppressNearDuplicateProducts(snapshot.products).length !== snapshot.products.length) return hold('duplicates_require_new_revision', true);
    validateCatalogSnapshot(snapshot, now);
    const operational = new Map(current.map((row) => [row.public_id, row]));
    if (operational.size !== current.length || current.length !== envelope.products.length + envelope.heldProducts.length) return hold('current_identity_missing');
    for (const product of snapshot.products) checkCurrent(product, byId.get(product.publicId)!, operational.get(product.publicId)!, now);
    for (const held of snapshot.heldProducts) {
      const row = operational.get(held.publicId)!;
      if (row.id !== held.id || row.slug !== held.slug) return hold('current_identity_changed');
      if (held.affiliateUrl) {
        const right = (object(JSON.parse(String(row.rights_json))) as ProductRights).affiliateUrl;
        if (!right || !['owned', 'licensed'].includes(right.basis) || right.expiresAt || right.value !== held.affiliateUrl || !right.reference?.trim()) return hold('held_link_rights_incompatible', true);
      }
    }
    const final = await capture(db, envelope, context);
    const stable = (value: typeof first) => canonicalJson({ ...value, header: { ...value.header, observedAt: null } });
    if (stable(first) !== stable(final)) return hold('source_changed_during_read');
    const observedAt = canonicalTime(final.header.observedAt);
    if (observedAt < now.toISOString()) return hold('database_clock_regressed');
    if (snapshot.products.some((product) => product.eligibleUntil <= observedAt)) return hold('expiry_requires_new_revision', true);
    if (observedAt >= context.cutoff) return hold('capture_window_elapsed');
    return snapshot.products.length ? { status: 'ready', snapshot, observedAt } : hold('all_held');
  } catch (error) {
    // Fixed codes only: provider errors can contain SQL, source content or credentials.
    const safe = new Set(['current_hold_or_factual_drift', 'current_rights_incompatible', 'current_deadline_incompatible', 'verification_utc_unproven', 'read_bounds']);
    const reason = error instanceof Error && safe.has(error.message) ? error.message : 'snapshot_reconstruction_failed';
    return hold(reason, ['current_rights_incompatible', 'current_deadline_incompatible'].includes(reason));
  }
}
