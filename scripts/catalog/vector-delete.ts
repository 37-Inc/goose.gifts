import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { getProductsByPublicIds } from '../../lib/catalog/storage/d1.ts';
import { canonicalJson, canonicalTimestamp, sha256 } from './migration.ts';

export interface ReviewedVectorDelete {
  schemaVersion: 1; operation: 'delete'; publicId: string; catalogRevision: string;
  productId: string; productStateSha256: string; reviewedAt: string; reviewReference: string;
}
const FIELDS = ['schemaVersion','operation','publicId','catalogRevision','productId','productStateSha256','reviewedAt','reviewReference'];
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
type ProductRow = Record<string, unknown>;

/** The caller supplies a real review reference, not an automatically inferred approval.
 * Bind every current field so a later hold/identity/verification change fences deletion.
 */
export function createReviewedVectorDelete(product: ProductRow, review: {
  reviewedAt: string; reviewReference: string;
}): ReviewedVectorDelete {
  const mutation: ReviewedVectorDelete = { schemaVersion: 1, operation: 'delete', publicId: String(product.public_id),
    catalogRevision: String(product.catalog_revision), productId: String(product.id),
    productStateSha256: sha256(canonicalJson(product)), ...review };
  validateReviewedVectorDelete(mutation, product);
  return Object.freeze(mutation);
}

export function validateReviewedVectorDelete(input: ReviewedVectorDelete, product: ProductRow): void {
  if (!input || Object.keys(input).length !== FIELDS.length || Object.keys(input).some(key => !FIELDS.includes(key))
    || input.schemaVersion !== 1 || input.operation !== 'delete' || !UUID.test(input.publicId)
    || typeof input.catalogRevision !== 'string' || !input.catalogRevision.trim() || input.catalogRevision.length > 64
    || typeof input.productId !== 'string' || !input.productId || input.productId.length > 255
    || !HASH.test(input.productStateSha256) || typeof input.reviewReference !== 'string'
    || !input.reviewReference.trim() || input.reviewReference.length > 200
    || typeof input.reviewedAt !== 'string' || !input.reviewedAt.endsWith('Z')
    || input.publicId !== product.public_id || input.catalogRevision !== product.catalog_revision
    || input.productId !== product.id || product.embedding_text_hash !== null
    || input.productStateSha256 !== sha256(canonicalJson(product))) throw new Error('invalid_vector_delete_review');
  canonicalTimestamp(input.reviewedAt);
}

/** Queue only an already-held, hash-unknown historical product. No product update,
 * provider call, invented input/hash, or fall back to PostgreSQL occurs here.
 * OFFLINE/UNACTIVATED: the product review is read before the receipt/outbox batch,
 * not atomically fenced with it. A concurrent product change can queue permanently
 * stale pending work; the drainer refuses it. A serialized writer barrier is
 * required before any activation. This is not the new weekly writer transaction.
 */
export async function queueReviewedVectorDelete(db: CatalogD1, mutation: ReviewedVectorDelete, now = new Date()): Promise<void> {
  const product = (await db.prepare('SELECT * FROM products WHERE public_id=?').bind(mutation.publicId).all()).results[0];
  if (!product) throw new Error('invalid_vector_delete_review');
  validateReviewedVectorDelete(mutation, product);
  if (!Number.isFinite(now.getTime()) || Date.parse(mutation.reviewedAt) > now.getTime()
    || (await getProductsByPublicIds(db, [mutation.publicId], now, mutation.catalogRevision)).length) throw new Error('invalid_vector_delete_review');
  const bytes = canonicalJson(mutation); const digest = sha256(bytes);
  await db.batch([
    db.prepare(`INSERT INTO vector_delete_mutations(mutation_sha256,public_id,source_revision,mutation_json)
      VALUES(?,?,?,?) ON CONFLICT(mutation_sha256) DO NOTHING`).bind(digest, mutation.publicId, mutation.catalogRevision, bytes),
    db.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at,delete_mutation_sha256)
      VALUES(?,?,NULL,'delete',?,(SELECT mutation_sha256 FROM vector_delete_mutations WHERE mutation_sha256=? AND mutation_json=?))
      ON CONFLICT(public_id,source_revision,operation) DO UPDATE SET
      public_id=CASE WHEN vector_sync_outbox.delete_mutation_sha256=excluded.delete_mutation_sha256
        AND vector_sync_outbox.embedding_text_hash IS NULL THEN vector_sync_outbox.public_id ELSE NULL END,
      delete_mutation_sha256=CASE WHEN vector_sync_outbox.delete_mutation_sha256=excluded.delete_mutation_sha256
        AND vector_sync_outbox.embedding_text_hash IS NULL THEN excluded.delete_mutation_sha256 ELSE NULL END`)
      .bind(mutation.publicId, mutation.catalogRevision, mutation.reviewedAt, digest, bytes),
  ]);
  const receipt = (await db.prepare('SELECT mutation_json FROM vector_delete_mutations WHERE mutation_sha256=?')
    .bind(digest).all<{ mutation_json: string }>()).results[0];
  const event = (await db.prepare(`SELECT embedding_text_hash,delete_mutation_sha256 FROM vector_sync_outbox
    WHERE public_id=? AND source_revision=? AND operation='delete'`).bind(mutation.publicId, mutation.catalogRevision)
    .all<{ embedding_text_hash: string | null; delete_mutation_sha256: string | null }>()).results[0];
  if (receipt?.mutation_json !== bytes || event?.embedding_text_hash !== null || event.delete_mutation_sha256 !== digest) throw new Error('invalid_vector_delete_review');
}
