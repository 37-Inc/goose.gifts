import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { prepareCohort } from '../scripts/staging/prepare-cohort.mts';
import { prepareImport, vectorNdjson } from '../scripts/staging/prepare-import.mts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { canonicalJson, exportLegacyVector, sha256 } from '../scripts/catalog/migration.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const timestamps = Object.fromEntries(['availability_checked_at', 'last_verified_at', 'created_at', 'updated_at']
  .map((column) => [`products.${column}`, { timezone: 'UTC', evidence: 'Synthetic test fixture explicitly written in UTC; not evidence about production rows.' }]));
function setup(count = 2) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `B${String(index + 1).padStart(9, '0')}`,
    title: index ? 'Funny Red Crab Silicone Spoon Rest' : 'Funny Fart Sound Button',
    imageUrl: `https://m.media-amazon.com/images/I/item${index}.jpg`,
    affiliateUrl: `https://www.amazon.com/dp/B${String(index + 1).padStart(9, '0')}?tag=test-20`,
    source: 'amazon', remotelyVerified: true, availabilityStatus: 'IN_STOCK',
    sourceFacts: { features: ['A physical item.', 'An intentionally ridiculous gift.'], color: 'red' } }));
  const rows = items.map((item, index) => ({ id: item.id, public_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `gift-${index + 1}`, source: 'amazon', title: item.title, image_url: item.imageUrl, affiliate_url: item.affiliateUrl,
    currency: 'USD', price: '19.99', quality_score: '0.80', is_active: true, duplicate_of_product_id: null,
    editorial_status: 'generated_ready', editorial_quality_score: '0.90',
    source_facts_hash: editorialSourceHash(item), editorial_source_hash: editorialSourceHash(item),
    source_facts: JSON.stringify(item.sourceFacts), humor_tags: '{prank}',
    witty_description: 'A physical novelty for a carefully chosen recipient.',
    editorial_writeup: `${'This physical novelty has a red finish and offers a deliberately ridiculous gift for a carefully chosen recipient. '.repeat(7)}\n\n${'Consider the recipient and their desk before selecting this intentionally silly object as a humorous gift. '.repeat(7)}`,
    availability_status: 'IN_STOCK', availability_checked_at: '2026-10-01 12:00:00', last_verified_at: '2026-10-01 12:00:00',
    created_at: '2026-10-01 12:00:00', updated_at: '2026-10-01 12:00:00', embedding: `[${Array(1536).fill('0.1').join(',')}]` }));
  if (items[1]) items[1].sourceFacts.color = 'blue'; // Second inherited editorial is held.
  const result = prepareCohort(rows, { observedAt: NOW.toISOString(), reference: 'Synthetic receipt', items }, {
    ids: rows.map((row) => row.id), catalogRevision: 'staging-test-r1', affiliateTag: 'test-20', now: NOW,
  });
  const cohort = { snapshot: result.snapshot, rights: result.rightsById,
    inputs: { products: result.inputs, sourceRowSha256ById: result.sourceRowSha256ById } };
  const options = { sourceSha256: sha256(`${rows.map(JSON.stringify).join('\n')}\n`), archiveId: 'synthetic-source-receipt',
    embeddingEncoding: 'postgres-text', timestamps, now: NOW };
  return { rows, cohort, options };
}

test('packet preserves original source, fresh operational state and ready/held separation', () => {
  const { rows, cohort, options } = setup();
  const packet = prepareImport(rows, cohort, options);
  assert.equal(packet.summary.ready, 1); assert.equal(packet.summary.held, 1);
  assert.equal(packet.vectors.length, 1); assert.equal(packet.archiveVectors.length, 2);
  assert.equal(packet.expectedRows[0].availability_checked_at, '2026-10-19T12:00:00.000000Z');
  assert.equal(packet.expectedRows[1].is_active, 0);
  assert.equal(packet.expectedRows[1].public_display_json, null);
  assert.notEqual(packet.expectedRows[1].source_facts_hash, rows[1].source_facts_hash);
  for (const [index, expected] of packet.expectedRows.entries()) {
    const raw = { ...rows[index] }; delete raw.embedding;
    assert.equal(expected.source_record_json, canonicalJson(raw));
    assert.equal(expected.embedding_text_hash, null);
    assert.equal(expected.id, rows[index].id); assert.equal(expected.public_id, rows[index].public_id);
  }
  assert.equal(packet.vectors[0].metadata.legacyInputProvenance, 'unverified');
  assert.equal(packet.summary.semanticInputCurrencyProven, false);
  assert.equal(packet.summary.imported, false); assert.equal(packet.summary.published, false);
  assert.ok(!('embeddingTextHash' in packet.vectors[0].metadata));
});

test('parameterized batch executes atomically locally and reconciliation includes the exact receipt', async () => {
  const { rows, cohort, options } = setup(); const packet = prepareImport(rows, cohort, options);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(await readFile(new URL('../migrations/d1/0001_catalog.sql', import.meta.url), 'utf8'));
    assert.deepEqual(db.prepare(packet.preflight.sql).all(...packet.preflight.params), []);
    db.exec('BEGIN');
    for (const query of packet.queries) {
      assert.ok(query.params.length <= 100);
      assert.doesNotMatch(query.sql, /amazon\.com|Funny|19\.99/);
      db.prepare(query.sql).run(...query.params);
    }
    db.exec('COMMIT');
    assert.equal(db.prepare('SELECT count(*) AS count FROM products').get().count, 2);
    assert.deepEqual({ ...db.prepare(packet.preflight.sql).get(...packet.preflight.params) }, packet.summary.expectedReceipt);
    assert.equal(db.prepare('SELECT public_display_json FROM products WHERE id=?').get(rows[1].id).public_display_json, null);
    // ImportBatch semantics: exact matching receipt skips all writes; no upsert.
    assert.throws(() => db.prepare(packet.queries[0].sql).run(...packet.queries[0].params), /UNIQUE/);
  } finally { db.close(); }
});

test('unknown naive timestamps require explicit reviewed decisions, never current host defaults', () => {
  const { rows, cohort, options } = setup();
  assert.throws(() => prepareImport(rows, cohort, { ...options, timestamps: {} }), /Naive timestamp lacks/);
  const missingCreated = { ...timestamps }; delete missingCreated['products.created_at'];
  assert.throws(() => prepareImport(rows, cohort, { ...options, timestamps: missingCreated }), /Naive timestamp lacks/);
});

test('explicit unresolved product creation time stays NULL while original history remains exact', () => {
  const { rows, cohort, options } = setup();
  const packet = prepareImport(rows, cohort, { ...options, timestamps: { ...timestamps,
    'products.created_at': { timezone: 'unresolved', evidence: 'Synthetic historical session timezone deliberately unknown.' },
  } });
  assert.ok(packet.expectedRows.every((row) => row.created_at === null));
  assert.equal(JSON.parse(packet.expectedRows[0].source_record_json).created_at, rows[0].created_at);
  assert.throws(() => prepareImport(rows, cohort, { ...options, timestamps: { ...timestamps,
    'products.updated_at': { timezone: 'unresolved', evidence: 'Unknown operational timezone is not permitted.' },
  } }), /unresolved|Unresolved/);
});

test('source, identity, factual hash and missing ready vectors block instead of silently importing', () => {
  for (const patch of [{ title: 'altered original row' }, { public_id: 'different' }, { source_facts_hash: 'different' }]) {
    const { rows, cohort, options } = setup(); Object.assign(rows[0], patch);
    assert.throws(() => prepareImport(rows, cohort, options), /blocked/);
  }
  const { rows, cohort, options } = setup(); rows[0].embedding = null;
  cohort.inputs.sourceRowSha256ById[rows[0].id] = sha256(JSON.stringify(rows[0]));
  assert.throws(() => prepareImport(rows, cohort, options), /ready_original_vector_missing/);
});

test('unknown encoding and mismatched snapshot rights fail closed', () => {
  const { rows, cohort, options } = setup();
  assert.throws(() => prepareImport(rows, cohort, { ...options, embeddingEncoding: 'guess' }), /encoding_configuration/);
  delete cohort.rights[rows[0].id].title;
  assert.throws(() => prepareImport(rows, cohort, options), /snapshot_rights_inputs_disagree/);
});

test('legacy vector NDJSON preserves float32 values and negative zero, with no fabricated text hash', () => {
  const row = { public_id: '00000000-0000-4000-8000-000000000001', embedding: `[-0,${Array(1535).fill('0.1').join(',')}]` };
  const vector = exportLegacyVector(row, { catalogRevision: 'r1', eligible: true }, 'postgres-text');
  const reparsed = JSON.parse(vectorNdjson([vector]));
  assert.ok(Object.is(reparsed.values[0], -0));
  const restored = exportLegacyVector({ ...row, embedding: encodePgvectorSendBase64(reparsed.values) }, { catalogRevision: 'r1', eligible: true }, 'pgvector-send-base64-v1');
  assert.equal(restored.metadata.vectorBytesSha256, vector.metadata.vectorBytesSha256);
  assert.ok(!('embeddingTextHash' in reparsed.metadata));
});
