import { createHash } from 'node:crypto';
import { canonicalJson } from './migration.ts';
import { decodePgvectorSendBase64, encodePgvectorSendBase64 } from './pgvector-binary.ts';

const MODEL_DIMENSIONS = { 'text-embedding-3-small': 1536, 'text-embedding-3-large': 3072 } as const;
type EmbeddingModel = keyof typeof MODEL_DIMENSIONS;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const HASH = /^[a-f0-9]{64}$/;

export interface EmbeddingReceipt {
  schemaVersion: 1; kind: 'embedding-response'; observedAt: string; model: string;
  products: Array<{ id: string; sourceFactsHash: string; text: string; nativeBase64: string; vectorBytesSha256: string }>;
}

/** OFFLINE projection only. The caller must pin an authentic retained receipt,
 * not infer a model from vector length or the current generator's default.
 * Original pgvector bytes and native maintenance's 1536-d contract stay intact.
 * https://developers.openai.com/api/docs/guides/embeddings#reducing-embedding-dimensions
 */
export function projectReceiptEmbedding(input: {
  receipt: EmbeddingReceipt; receiptSha256: string; receiptReference: string;
  productId: string; expectedInput: string; expectedSourceFactsHash: string;
  expectedNativeSha256: string; dimensions: number;
}) {
  const receipt = input.receipt;
  if (!receipt || receipt.schemaVersion !== 1 || receipt.kind !== 'embedding-response'
    || Object.keys(receipt).sort().join(',') !== 'kind,model,observedAt,products,schemaVersion'
    || typeof receipt.observedAt !== 'string' || !receipt.observedAt.endsWith('Z') || !Number.isFinite(Date.parse(receipt.observedAt))
    || !HASH.test(input.receiptSha256) || !input.receiptReference?.trim()
    || input.receiptReference.length > 512 || hash(canonicalJson(receipt)) !== input.receiptSha256)
    throw new Error('search_embedding_receipt_mismatch');
  if (!Object.hasOwn(MODEL_DIMENSIONS, receipt.model)) throw new Error('search_embedding_model_unsupported');
  const model = receipt.model as EmbeddingModel, sourceDimensions = MODEL_DIMENSIONS[model];
  if (!Number.isSafeInteger(input.dimensions) || input.dimensions < 1 || input.dimensions > 1536
    || input.dimensions > sourceDimensions) throw new Error('search_embedding_dimensions');
  if (!Array.isArray(receipt.products) || receipt.products.length < 1 || receipt.products.length > 20
    || receipt.products.some(product => !product || Object.keys(product).sort().join(',')
      !== 'id,nativeBase64,sourceFactsHash,text,vectorBytesSha256')
    || new Set(receipt.products.map(product => product.id)).size !== receipt.products.length)
    throw new Error('search_embedding_receipt_products');
  const product = receipt.products.find(product => product.id === input.productId);
  if (!product || !input.expectedInput || product.text !== input.expectedInput
    || !HASH.test(input.expectedSourceFactsHash) || product.sourceFactsHash !== input.expectedSourceFactsHash
    || !HASH.test(input.expectedNativeSha256) || product.vectorBytesSha256 !== input.expectedNativeSha256)
    throw new Error('search_embedding_input_mismatch');
  const native = decodePgvectorSendBase64(product.nativeBase64, sourceDimensions);
  if (hash(Buffer.from(product.nativeBase64, 'base64')) !== product.vectorBytesSha256)
    throw new Error('search_embedding_native_mismatch');
  const prefix = native.slice(0, input.dimensions), magnitude = Math.hypot(...prefix);
  if (!Number.isFinite(magnitude) || magnitude === 0) throw new Error('search_embedding_zero_norm');
  const values = prefix.map(value => Math.fround(value / magnitude));
  if (Math.abs(Math.hypot(...values) - 1) > 1e-6) throw new Error('search_embedding_normalization');
  return {
    model, dimensions: input.dimensions, values,
    provenance: {
      sourceDimensions, originalNativeSha256: product.vectorBytesSha256,
      inputSha256: hash(product.text), sourceFactsHash: product.sourceFactsHash,
      receiptSha256: input.receiptSha256, receiptReference: input.receiptReference,
      observedAt: receipt.observedAt, transform: 'prefix-l2-float32-v1' as const,
      derivedNativeSha256: hash(Buffer.from(encodePgvectorSendBase64(values), 'base64')),
    },
  };
}

/** Planning arithmetic, NOT a fresh account usage observation or spending grant.
 * Includes writes because Vectorize charges inserted/upserted dimensions too.
 */
export function derivedSearchCapacity(input: {
  products: number; dimensions: number; existingStoredDimensions: number;
  existingQueriedDimensions: number; maximumNewQueries: number; storageReserveDimensions: number;
}) {
  if (Object.values(input).some(value => !Number.isSafeInteger(value) || value < 0)
    || input.dimensions < 1 || input.dimensions > 1536) throw new Error('search_capacity_input');
  const derivedStoredDimensions = input.products * input.dimensions;
  const totalStoredDimensions = input.existingStoredDimensions + derivedStoredDimensions;
  const totalQueriedDimensions = input.existingQueriedDimensions
    + (input.products + input.maximumNewQueries) * input.dimensions;
  const untouchedStoredDimensions = 5_000_000 - totalStoredDimensions;
  if (![derivedStoredDimensions, totalStoredDimensions, totalQueriedDimensions].every(Number.isSafeInteger))
    throw new Error('search_capacity_input');
  return { derivedStoredDimensions, totalStoredDimensions, totalQueriedDimensions, untouchedStoredDimensions,
    storageFits: untouchedStoredDimensions >= input.storageReserveDimensions,
    queriesFit: totalQueriedDimensions <= 30_000_000,
    modelSpendingAuthorized: false as const, retrievalQualityAccepted: false as const };
}
