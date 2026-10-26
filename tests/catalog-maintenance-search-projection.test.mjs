import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../scripts/catalog/migration.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { derivedSearchCapacity, projectReceiptEmbedding } from '../scripts/catalog/search-vector-projection.ts';

// All receipts/vectors here are SYNTHETIC. These prove contracts and arithmetic,
// never actual provider provenance or real full-catalog query quality.
const sha = value => createHash('sha256').update(value).digest('hex');
function fixture(model = 'text-embedding-3-small', dimensions = 1536) {
  const values = Array.from({ length: dimensions }, (_, i) => Math.fround((i % 11 - 5) / 100));
  values[1] = -0; values[2] = Math.fround(1e-45);
  const nativeBase64 = encodePgvectorSendBase64(values), vectorBytesSha256 = sha(Buffer.from(nativeBase64, 'base64'));
  const receipt = { schemaVersion: 1, kind: 'embedding-response', model, observedAt: '2026-10-26T15:34:00.000Z',
    products: [{ id: 'B000000001', sourceFactsHash: 'a'.repeat(64), text: 'SYNTHETIC goose fixture', nativeBase64, vectorBytesSha256 }] };
  return { receipt, receiptSha256: sha(canonicalJson(receipt)), receiptReference: 'fixture/provider-response',
    productId: 'B000000001', expectedInput: receipt.products[0].text,
    expectedSourceFactsHash: 'a'.repeat(64), expectedNativeSha256: vectorBytesSha256, dimensions: 1024 };
}

test('v3-small prefixes/normalizes to1024 and preserves exact original native bytes and input', () => {
  const input = fixture(), before = structuredClone(input), result = projectReceiptEmbedding(input);
  assert.deepEqual(input, before);
  assert.equal(result.model, 'text-embedding-3-small'); assert.equal(result.dimensions, 1024);
  assert.equal(result.values.length, 1024); assert.ok(Math.abs(Math.hypot(...result.values) - 1) < 1e-6);
  assert.ok(result.values.every(value => Object.is(Math.fround(value), value)));
  assert.equal(result.provenance.originalNativeSha256, input.expectedNativeSha256);
  assert.equal(result.provenance.observedAt, input.receipt.observedAt);
  assert.equal(result.provenance.inputSha256, sha(input.expectedInput));
  assert.deepEqual(projectReceiptEmbedding(input), result);
});

test('model-specific original dimensions: v3-large3072 is supported; mislabeled1536 is rejected', () => {
  const result = projectReceiptEmbedding(fixture('text-embedding-3-large', 3072));
  assert.equal(result.provenance.sourceDimensions, 3072); assert.equal(result.values.length, 1024);
  assert.throws(() => projectReceiptEmbedding(fixture('text-embedding-3-large', 1536)), /dimensions/);
});

test('unknown, legacy ada and inherited model names cannot masquerade as v3 because of1536 dimensions', () => {
  for (const model of ['', 'text-embedding-ada-002', 'unknown', 'toString', '__proto__'])
    assert.throws(() => projectReceiptEmbedding(fixture(model)), /model_unsupported/);
  assert.throws(() => projectReceiptEmbedding({ ...fixture(), receipt: null }), /receipt_mismatch/);
});

test('receipt identity, expected exact input/facts/native and product identity are all bound', () => {
  for (const patch of [{ receiptSha256: 'b'.repeat(64) }, { receiptReference: '' }, { productId: 'B000000002' },
    { expectedInput: 'new text' }, { expectedSourceFactsHash: 'b'.repeat(64) }, { expectedNativeSha256: 'c'.repeat(64) }])
    assert.throws(() => projectReceiptEmbedding({ ...fixture(), ...patch }), /mismatch/);
  const input = fixture(); input.receipt.products[0].nativeBase64 = encodePgvectorSendBase64(Array(1536).fill(Math.fround(.2)));
  input.receiptSha256 = sha(canonicalJson(input.receipt));
  assert.throws(() => projectReceiptEmbedding(input), /native_mismatch/);
});

test('dimensions, duplicate products, zero norm and malformed native transport fail before any output', () => {
  for (const dimensions of [0, -1, 1024.5, 1537, Infinity, NaN])
    assert.throws(() => projectReceiptEmbedding({ ...fixture(), dimensions }), /dimensions/);
  const input = fixture(); input.receipt.products.push({ ...input.receipt.products[0] });
  input.receiptSha256 = sha(canonicalJson(input.receipt));
  assert.throws(() => projectReceiptEmbedding(input), /receipt_products/);
  const zero = fixture(); zero.receipt.products[0].nativeBase64 = encodePgvectorSendBase64(Array(1536).fill(0));
  zero.expectedNativeSha256 = zero.receipt.products[0].vectorBytesSha256 = sha(Buffer.from(zero.receipt.products[0].nativeBase64, 'base64'));
  zero.receiptSha256 = sha(canonicalJson(zero.receipt));
  assert.throws(() => projectReceiptEmbedding(zero), /zero_norm/);
});

test('Free capacity includes retained original index, storage reserve and upsert/query dimensions', () => {
  const input = { products: 3352, dimensions: 1024, existingStoredDimensions: 12288,
    existingQueriedDimensions: 0, maximumNewQueries: 50 * 31, storageReserveDimensions: 500000 };
  const result = derivedSearchCapacity(input);
  assert.equal(result.derivedStoredDimensions, 3432448); assert.equal(result.totalStoredDimensions, 3444736);
  assert.equal(result.totalQueriedDimensions, (3352 + 1550) * 1024); assert.equal(result.storageFits, true);
  assert.equal(result.queriesFit, true); assert.equal(result.modelSpendingAuthorized, false);
  assert.equal(result.retrievalQualityAccepted, false);
  assert.equal(derivedSearchCapacity({ ...input, dimensions: 1536 }).storageFits, false);
  assert.equal(derivedSearchCapacity({ ...input, existingQueriedDimensions: 30000000 }).queriesFit, false);
  for (const bad of [-1, NaN, Number.MAX_SAFE_INTEGER])
    assert.throws(() => derivedSearchCapacity({ ...input, products: bad }), /capacity_input/);
});
