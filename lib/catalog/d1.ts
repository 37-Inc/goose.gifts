import type { CatalogSnapshot, PublicCatalogProduct } from './types.ts';
import type { CatalogD1 } from './storage/d1.ts';
import { validateCatalogSnapshot, validatePublicCatalogProduct } from './snapshot.ts';
import { legacyMutationBatch } from './mutation-fence.ts';

type Row = Record<string, string | number>;
export interface ProjectionReceipt extends Row {
  catalog_revision: string; snapshot_sha256: string; projection_sha256: string;
  source_export_sha256: string; product_count: number; created_at: string;
}
export interface ProjectionPacket {
  rows: Row[]; receipt: ProjectionReceipt;
}
export interface ProjectionQuery { sql: string; params: unknown[] }
const CURRENT_READY = `p.is_active=1 AND p.duplicate_of_product_id IS NULL AND p.quality_score>=0.55
  AND COALESCE(p.availability_checked_at,p.last_verified_at) IS NOT NULL
  AND upper(p.availability_status) IN ('IN_STOCK','IN_STOCK_SCARCE','INSTOCKSCARCE','AVAILABLE_DATE','LEADTIME','PREORDER')
  AND p.editorial_status IN ('generated_ready','manual_locked')
  AND p.source_facts_hash IS NOT NULL AND p.source_facts_hash=p.editorial_source_hash
  AND p.public_display_json IS NOT NULL AND p.eligible_until>?`;
const VISIBLE = `v.eligible_until>? AND ${CURRENT_READY} AND v.source_facts_hash=p.source_facts_hash`;
// Start with revision/FTS candidates, then inspect each current product by its
// unique identity. Do not let the planner start with all active products.
const JOIN = `CROSS JOIN products p ON p.id=v.product_id AND p.public_id=v.public_id
  JOIN catalog_projection_receipts r ON r.catalog_revision=v.catalog_revision`;

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function createProjectionPacket(snapshotInput: CatalogSnapshot, factsByPublicId: Record<string, string>, sourceSha256: string, now = new Date()): Promise<ProjectionPacket> {
  const snapshot = validateCatalogSnapshot(snapshotInput, now);
  if (snapshot.dataKind !== 'catalog' || !/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error('A real validated snapshot and source checksum are required');
  const rows = await Promise.all([...snapshot.products].sort((a, b) => a.publicId.localeCompare(b.publicId)).map(async (product) => {
    const factsHash = factsByPublicId[product.publicId];
    if (!/^[a-f0-9]{64}$/.test(factsHash || '')) throw new Error('Missing projection factual hash');
    const display = JSON.stringify(product);
    return { catalog_revision: snapshot.catalogRevision, public_id: product.publicId, product_id: product.id,
      slug: product.slug, title: product.title, description: product.description, tags: product.humorTags?.join(' ') || '',
      source_facts_hash: factsHash, eligible_until: product.eligibleUntil, public_display_json: display, display_sha256: await hash(display) };
  }));
  return { rows, receipt: { catalog_revision: snapshot.catalogRevision,
    // Same normalized bytes as the static build's catalogSnapshotSha256.
    snapshot_sha256: await hash(`${JSON.stringify(snapshot)}\n`), projection_sha256: await hash(JSON.stringify(rows)),
    source_export_sha256: sourceSha256, product_count: rows.length, created_at: snapshot.generatedAt } };
}
export function projectionPreflight(packet: ProjectionPacket): ProjectionQuery {
  return { sql: 'SELECT * FROM catalog_projection_receipts WHERE catalog_revision=?', params: [packet.receipt.catalog_revision] };
}
export function projectionQueries(packet: ProjectionPacket): ProjectionQuery[] {
  const insert = (table: string, row: Row): ProjectionQuery => {
    const columns = Object.keys(row);
    if (columns.some((column) => !/^[a-z_][a-z0-9_]*$/.test(column)) || columns.length > 100) throw new Error('Invalid projection columns');
    return { sql: `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, params: columns.map((column) => row[column]) };
  };
  return [...packet.rows.map((row) => insert('catalog_public_products', row)), insert('catalog_projection_receipts', packet.receipt)];
}
function receiptMatches(actual: ProjectionReceipt, expected: ProjectionReceipt): boolean {
  return Object.keys(expected).every((key) => actual[key] === expected[key]);
}
async function assertStoredProjection(db: CatalogD1, packet: ProjectionPacket): Promise<void> {
  const result = await db.prepare('SELECT * FROM catalog_public_products WHERE catalog_revision=?')
    .bind(packet.receipt.catalog_revision).all<Row>();
  const stored = new Map(result.results.map((row) => [row.public_id, row]));
  if (result.results.length !== packet.rows.length || packet.rows.some((expected) => {
    const actual = stored.get(expected.public_id);
    return !actual || Object.keys(actual).length !== Object.keys(expected).length
      || Object.keys(expected).some((key) => actual[key] !== expected[key]);
  })) throw new Error('Stored public projection is incomplete or changed');
}
/** All projection rows and their visibility receipt become available together. */
export async function importPublicProjection(db: CatalogD1, packet: ProjectionPacket): Promise<'imported' | 'already_imported'> {
  if (packet.rows.length !== packet.receipt.product_count
    || await hash(JSON.stringify(packet.rows)) !== packet.receipt.projection_sha256
    || packet.rows.some((row) => row.catalog_revision !== packet.receipt.catalog_revision)) throw new Error('Projection packet checksum mismatch');
  const query = projectionPreflight(packet);
  const existing = await db.prepare(query.sql).bind(...query.params).all<ProjectionReceipt>();
  if (existing.results.length) {
    if (!receiptMatches(existing.results[0], packet.receipt)) throw new Error('Revision already exists with different projection bytes');
    await assertStoredProjection(db, packet);
    return 'already_imported';
  }
  const queries = projectionQueries(packet);
  // Publication command chunks large catalogs separately before one final receipt;
  // this helper deliberately handles one small atomic proof packet only.
  if (queries.length > 40) throw new Error('Atomic projection proof packet exceeds 39 products');
  await legacyMutationBatch(db, queries.map((item) => db.prepare(item.sql).bind(...item.params)));
  await assertStoredProjection(db, packet);
  return 'imported';
}
function publicRows(rows: { public_display_json: string }[], now: Date): PublicCatalogProduct[] {
  return rows.flatMap((row) => { try { return [validatePublicCatalogProduct(JSON.parse(row.public_display_json), now)]; } catch { return []; } });
}
/** Reused inside fenced publication SQL; omission uses the database execution clock. */
export function visibleRevisionCountQuery(revision: string, now?: Date): ProjectionQuery {
  const visible = now ? VISIBLE : VISIBLE.replaceAll('>?', ">strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  return { sql: `SELECT count(*) FROM catalog_public_products v ${JOIN}
    WHERE v.catalog_revision=? AND ${visible}`, params: [revision, ...(now ? [now.toISOString(), now.toISOString()] : [])] };
}
export async function getRevisionProductsByPublicIds(db: CatalogD1, ids: string[], now: Date, revision: string): Promise<PublicCatalogProduct[]> {
  if (!revision || ids.length > 240) throw new Error('Revision and bounded product IDs required');
  const unique = [...new Set(ids)]; const found = new Map<string, PublicCatalogProduct>();
  for (let offset = 0; offset < unique.length; offset += 80) {
    const chunk = unique.slice(offset, offset + 80);
    const result = await db.prepare(`WITH requested(public_id) AS (VALUES ${chunk.map(() => '(?)').join(',')})
      SELECT v.public_display_json FROM requested
      CROSS JOIN catalog_public_products v ON v.public_id=requested.public_id AND v.catalog_revision=? ${JOIN}
      WHERE ${VISIBLE}`)
      .bind(...chunk, revision, now.toISOString(), now.toISOString()).all<{ public_display_json: string }>();
    for (const product of publicRows(result.results, now)) found.set(product.publicId, product);
  }
  return unique.flatMap((id) => found.has(id) ? [found.get(id)!] : []);
}
export async function keywordSearchRevision(db: CatalogD1, query: string, limit: number, now: Date, revision: string): Promise<PublicCatalogProduct[]> {
  const normalized = query.normalize('NFKC').trim();
  if (!revision || !Number.isInteger(limit) || limit < 1 || limit > 240) throw new Error('Revision and 1..240 candidate limit required');
  if (normalized.length < 2 || normalized.length > 200) return [];
  const words = normalized.match(/[\p{L}\p{N}]+/gu)?.slice(0, 20) || [];
  if (!words.length) return [];
  const result = await db.prepare(`SELECT v.public_display_json FROM catalog_public_products_fts
    CROSS JOIN catalog_public_products v ON v.rowid=catalog_public_products_fts.rowid ${JOIN}
    WHERE catalog_public_products_fts MATCH ? AND v.catalog_revision=? AND ${VISIBLE}
    ORDER BY bm25(catalog_public_products_fts),v.public_id LIMIT ?`)
    .bind(words.map((word) => `"${word}"`).join(' OR '), revision, now.toISOString(), now.toISOString(), limit)
    .all<{ public_display_json: string }>();
  return publicRows(result.results, now);
}
/** Rollback is an explicit compatibility check, never a blind old-Worker flip. */
export async function rollbackPreflight(db: CatalogD1, snapshot: CatalogSnapshot, now = new Date()): Promise<{ ok: boolean; reason: string }> {
  if (snapshot.products.some((product) => !(Date.parse(product.eligibleUntil) > now.getTime()))) return { ok: false, reason: 'release_expired' };
  try { validateCatalogSnapshot(snapshot, now); } catch { return { ok: false, reason: 'release_invalid' }; }
  const receipt = await db.prepare('SELECT * FROM catalog_projection_receipts WHERE catalog_revision=?')
    .bind(snapshot.catalogRevision).all<ProjectionReceipt>();
  if (receipt.results.length !== 1) return { ok: false, reason: 'projection_receipt_missing' };
  if (receipt.results[0].snapshot_sha256 !== await hash(`${JSON.stringify(snapshot)}\n`)
    || receipt.results[0].product_count !== snapshot.products.length) return { ok: false, reason: 'release_digest_mismatch' };
  const expected = new Map(snapshot.products.map((product) => [product.publicId, JSON.stringify(product)]));
  let visible = 0;
  for (let offset = 0; offset < snapshot.products.length; offset += 240) {
    const products = await getRevisionProductsByPublicIds(db, snapshot.products.slice(offset, offset + 240).map((product) => product.publicId), now, snapshot.catalogRevision);
    if (products.some((product) => expected.get(product.publicId) !== JSON.stringify(product))) return { ok: false, reason: 'projection_bytes_incompatible' };
    visible += products.length;
  }
  if (visible !== snapshot.products.length) return { ok: false, reason: 'current_hold_or_factual_incompatibility' };
  return { ok: true, reason: 'eligible_revision_compatible' };
}
