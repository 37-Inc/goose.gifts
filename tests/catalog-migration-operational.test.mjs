import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, lstat, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson, convertSourceRow, importBatch, sha256, upsertProductAndQueueVector } from '../scripts/catalog/migration.ts';
import { prepareOperationalPacket, reconcileOperationalPacket, writeOperationalPacket } from '../scripts/catalog/prepare-operational.ts';
import { getProductsByPublicIds } from '../lib/catalog/storage/d1.ts';
import { createProjectionPacket, getRevisionProductsByPublicIds, importPublicProjection } from '../lib/catalog/d1.ts';
import { validateRecoveryArchive } from '../scripts/catalog/recovery-archive.ts';

const NOW = new Date('2026-10-20T06:30:00.000Z'); const at = '2026-10-19 12:34:56.123456';
const sql = (name) => readFileSync(new URL(`../migrations/d1/${name}`, import.meta.url), 'utf8');
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_catalog.sql', '0002_public_projections.sql', '0003_publication_outbox.sql']) sqlite.exec(sql(name));
  return { sqlite, prepare(text) { let values = []; return {
    bind(...args) { values = args; return this; }, async all() { return { results: sqlite.prepare(text).all(...values).map((r) => ({ ...r })) }; },
    async run() { return sqlite.prepare(text).run(...values); },
  }; }, async batch(statements) { sqlite.exec('BEGIN'); try { for (const s of statements) await s.run(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
}
function migrate(db) { db.sqlite.exec('BEGIN'); db.sqlite.exec(sql('0005_historical_timestamps.sql')); db.sqlite.exec('COMMIT'); }
function insert(db, table, row) { const keys = Object.keys(row); db.sqlite.prepare(`INSERT INTO ${table}(${keys}) VALUES(${keys.map(() => '?')})`).run(...keys.map((key) => row[key])); }
const unresolved = { timezone: 'unresolved', evidence: 'SYNTHETIC historical session timezone explicitly unproven' };
function product(index = 0) {
  return { id: `B${String(index + 1).padStart(9, '0')}`, public_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `test-only-button-${index}`, source: 'amazon', title: 'PRIVATE TEST MERCHANT COPY', currency: 'USD', price: '19.99',
    quality_score: '0.8', is_active: true, editorial_status: 'manual_locked', availability_status: 'IN_STOCK', duplicate_of_product_id: null,
    availability_checked_at: index ? null : at, last_verified_at: at, created_at: at, updated_at: at,
    source_facts_hash: 'a'.repeat(64), editorial_source_hash: 'a'.repeat(64), embedding: 'ORIGINAL-PRIVATE-ARCHIVE-VECTOR' };
}
function display(row) {
  return { id: row.id, publicId: row.public_id, slug: row.slug, source: 'amazon', currency: 'USD', price: 0,
    title: 'TEST ONLY funny button', description: 'Synthetic test copy, not a real product claim.', imageUrl: '/test.svg',
    affiliateUrl: `https://www.amazon.com/dp/${row.id}?tag=test-only`, qualityScore: .8, isActive: true, eligibleUntil: '2026-10-21T00:00:00.000Z' };
}
const columns = (table) => (table === 'products' ? ['availability_checked_at', 'last_verified_at', 'created_at', 'updated_at'] : ['created_at'])
  .map((name) => ({ name, type: 'timestamp without time zone', nullable: true }));
function table(name, rows, cols = columns(name)) {
  const raw = rows.map((row) => ` ${JSON.stringify(row)} `).join('\n') + (rows.length ? '\n' : '');
  return { definition: { schema: 'public', name, file: 'synthetic.ndjson', columns: cols, rowCount: rows.length, sha256: sha256(raw) }, raw, rows };
}
function archive(count = 43) {
  const aware = (name) => ({ name, type: 'timestamp with time zone', nullable: true });
  return { summary: { manifestSha256: sha256('TEST-ONLY-ARCHIVE') }, tables: [
    table('products', Array.from({ length: count }, (_, index) => product(index))), table('product_slug_history', []),
    table('catalog_runs', [{ id: 'run', status: 'done', mode: 'test', dry_run: false, started_at: '2026-10-19 12:00:00.123456+00', completed_at: null }], [aware('started_at'), aware('completed_at')]),
    table('catalog_run_items', [{ id: 'item', sequence: '88', run_id: 'run', product_id: null, external_id: 'test', decision: 'held', requires_manual_review: false, created_at: '2026-10-19 12:01:00.654321+00' }], [aware('created_at')]),
    table('catalog_editorial_events', [{ id: 'event', run_id: 'run', product_id: product().id, event_type: 'held', status: 'test', created_at: at }]),
    table('search_queries', [{ id: 'search', created_at: at, query: 'PRIVATE SYNTHETIC QUERY', clicked_bundle_id: 'archived-test-bundle', clicked_bundle_slug: 'archived-test' }]),
  ] };
}
function preserved(source = product()) {
  const timestamps = Object.fromEntries(columns('products').map((c) => [`products.${c.name}`, { timezone: 'UTC', evidence: 'TEST ONLY UTC fixture writer' }]));
  const row = convertSourceRow('products', source, { timestamps, catalogRevision: 'fresh-test', archiveId: 'old-test-archive', publicDisplay: display(source), now: NOW });
  delete row.timestamp_provenance_json; // Model exact rows imported before 0005.
  return { rows: [row], rowsFileSha256: sha256('PINNED TEST ROW FILE'), evidenceSha256: sha256('PINNED TEST READBACK'), evidenceReference: '/private/test-readback.json' };
}
function packet(a = archive(), preserve = preserved()) { return prepareOperationalPacket(a, { importedAt: NOW.toISOString(), unresolvedEvidence: unresolved.evidence, preserve }); }

test('populated 0005 preserves rowids, exact rows, references, FTS and immutable projections atomically', async () => {
  const db = database();
  try {
    const row = preserved().rows[0]; insert(db, 'products', row);
    insert(db, 'product_slug_history', { slug: 'test-old-slug', product_id: row.id, created_at: NOW.toISOString(), source_record_json: '{"raw":"test"}' });
    insert(db, 'catalog_editorial_events', { id: 'old-event', run_id: 'run', product_id: row.id, event_type: 'test', status: 'ok', created_at: NOW.toISOString(), source_record_json: '{"test":"exact raw"}' });
    insert(db, 'search_history', { id: 'old-search', created_at: NOW.toISOString(), legacy_bundle_id: 'archive', archive_reference: 'private/archive', source_record_json: '{"test":"exact raw"}' });
    const snapshot = { schemaVersion: 1, dataKind: 'catalog', catalogRevision: 'r1', generatedAt: NOW.toISOString(), products: [display(product())], heldProducts: [], slugHistory: [] };
    await importPublicProjection(db, await createProjectionPacket(snapshot, { [row.public_id]: row.source_facts_hash }, sha256('test-source'), NOW));
    const before = ['products', 'product_slug_history', 'catalog_editorial_events', 'search_history', 'catalog_public_products', 'catalog_projection_receipts']
      .map((table) => [table, db.sqlite.prepare(`SELECT rowid,* FROM ${table}`).all().map((r) => ({ ...r }))]);
    migrate(db);
    for (const [table, values] of before) {
      const expected = values.map((value) => ['products', 'catalog_editorial_events', 'search_history'].includes(table) ? { ...value, timestamp_provenance_json: '{}' } : value);
      assert.deepEqual(db.sqlite.prepare(`SELECT rowid,* FROM ${table}`).all().map((r) => ({ ...r })), expected);
    }
    assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.sqlite.prepare("SELECT count(*) n FROM products_fts WHERE products_fts MATCH 'button'").get().n, 1);
    assert.equal(db.sqlite.prepare("SELECT count(*) n FROM catalog_public_products_fts WHERE catalog_public_products_fts MATCH 'button'").get().n, 1);
    assert.equal((await getProductsByPublicIds(db, [row.public_id], NOW)).length, 1);
    assert.equal((await getRevisionProductsByPublicIds(db, [row.public_id], NOW, 'r1')).length, 1);
    db.sqlite.exec('UPDATE products SET updated_at=NULL,availability_checked_at=NULL,last_verified_at=NULL');
    assert.deepEqual(await getProductsByPublicIds(db, [row.public_id], NOW), []);
    assert.deepEqual(await getRevisionProductsByPublicIds(db, [row.public_id], NOW, 'r1'), []);
    assert.throws(() => db.sqlite.exec("UPDATE catalog_public_products SET title='changed'"), /immutable/);
    db.sqlite.prepare('UPDATE products SET title=?').run('test-after-migration');
    assert.equal(db.sqlite.prepare("SELECT count(*) n FROM products_fts WHERE products_fts MATCH 'after'").get().n, 1);
    assert.equal(db.sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  } finally { db.sqlite.close(); }
});

test('provenance distinguishes NULL, unresolved and evidenced without normalizing unknown wall time', () => {
  const row = product(); row.availability_checked_at = null; row.last_verified_at = '2026-10-19T12:34:56.123456Z';
  const result = convertSourceRow('products', row, { catalogRevision: 'test', archiveId: 'pinned-test', timestamps: {
    'products.created_at': unresolved, 'products.updated_at': unresolved,
  } });
  const provenance = JSON.parse(result.timestamp_provenance_json);
  assert.equal(provenance.fields.availability_checked_at.state, 'source_null');
  assert.equal(provenance.fields.updated_at.state, 'unresolved');
  assert.equal(provenance.fields.last_verified_at.basis, 'explicit_offset');
  assert.equal(provenance.sourceArchive, 'pinned-test');
  assert.equal(result.updated_at, null); assert.equal(result.last_verified_at, row.last_verified_at);
  assert.equal(JSON.parse(result.source_record_json).updated_at, at);
  for (const value of ['not-a-time', '2026-02-30 12:00:00', '2026-10-19 24:00:00', '2026-10-19T12:00:00Z'])
    assert.throws(() => convertSourceRow('products', { ...product(), created_at: value }, { catalogRevision: 'test', archiveId: 'test',
      timestamps: Object.fromEntries(columns('products').map((c) => [`products.${c.name}`, unresolved])) }));
  assert.throws(() => convertSourceRow('products', product(), { catalogRevision: 'test', archiveId: 'test', now: NOW,
    publicDisplay: display(product()), timestamps: Object.fromEntries(columns('products').map((c) => [`products.${c.name}`, unresolved])) }), /evidenced verification/);
});

test('the forward migration rolls back as one unit when a later statement fails', () => {
  const db = database();
  try {
    insert(db, 'products', preserved().rows[0]);
    const original = db.sqlite.prepare('SELECT rowid,* FROM products').all();
    db.sqlite.exec('BEGIN');
    assert.throws(() => { db.sqlite.exec(sql('0005_historical_timestamps.sql')); db.sqlite.exec("INSERT INTO product_slug_history VALUES('bad','missing','2026-10-20T00:00:00Z','{}')"); }, /FOREIGN KEY/);
    db.sqlite.exec('ROLLBACK');
    assert.deepEqual(db.sqlite.prepare('SELECT rowid,* FROM products').all(), original);
    assert(!db.sqlite.prepare('PRAGMA table_info(products)').all().some((column) => column.name === 'timestamp_provenance_json'));
    assert.equal(db.sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  } finally { db.sqlite.close(); }
});

test('full packet includes every source identity exactly once, holds unknown products and pins explicit preserved rows', async () => {
  const a = archive(); const p = packet(a); const db = database();
  try {
    assert.equal(p.summary.preservedRows, 1); assert.equal(p.summary.sourceIdentityCount, 47);
    assert(p.batches.every((b) => b.rows.length <= 40)); assert.equal(p.summary.vectorWorkEmitted, 0);
    assert.equal(canonicalJson(p), canonicalJson(packet(a)));
    for (const r of p.batches.filter((b) => b.table === 'products').flatMap((b) => b.rows)) {
      assert.equal(r.created_at, null); assert.equal(r.updated_at, null); assert.equal(r.last_verified_at, null);
      assert.equal(r.public_display_json, null); assert.equal(r.eligible_until, null); assert.equal(r.title, '');
      assert.equal(JSON.parse(r.source_record_json).last_verified_at, at);
      assert(!Object.hasOwn(JSON.parse(r.source_record_json), 'embedding'));
    }
    insert(db, 'products', preserved().rows[0]); migrate(db);
    for (const b of p.batches) assert.equal(await importBatch(db, b), 'imported');
    for (const b of p.batches) assert.equal(await importBatch(db, b), 'already_imported');
    assert.deepEqual((await reconcileOperationalPacket(db, p)).map((r) => r.rows), [1, 43, 0, 1, 1, 1]);
    assert.equal(db.sqlite.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get('catalog_run_items').seq, 88);
    assert.equal((await getProductsByPublicIds(db, [product().public_id, product(1).public_id], NOW)).length, 1);
    for (const name of ['catalog_editorial_events', 'search_queries']) {
      const b = p.batches.find((b) => b.table === (name === 'search_queries' ? 'search_history' : name));
      assert.equal(b.rows[0].source_record_json, a.tables.find((t) => t.definition.name === name).raw.slice(0, -1));
      assert.equal(b.rows[0].created_at, null);
    }
    db.sqlite.prepare('UPDATE products SET quality_score=.1 WHERE id=?').run(product().id);
    await assert.rejects(reconcileOperationalPacket(db, p), /full-field mismatch/);
  } finally { db.sqlite.close(); }
});

test('preservation refuses omitted evidence, duplicate/absent identities or genuine source deltas', () => {
  const a = archive();
  for (const change of [p => { p.evidenceSha256 = ''; }, p => { p.rows.push(p.rows[0]); }, p => { p.rows[0].id = 'missing'; },
    p => { const raw = JSON.parse(p.rows[0].source_record_json); raw.updated_at = '2026-10-19 12:00:00'; p.rows[0].source_record_json = JSON.stringify(raw); }]) {
    const p = preserved(); change(p); assert.throws(() => packet(a, p));
  }
  const p = prepareOperationalPacket(a, { importedAt: NOW.toISOString(), unresolvedEvidence: unresolved.evidence });
  assert.equal(p.summary.preservedRows, 0); assert.equal(p.summary.importedRows, 47);
});

test('future mutation requires explicit real UTC update/event instants; historical unknowns are not backfilled', async () => {
  const db = database(); migrate(db);
  try {
    const row = { ...preserved().rows[0], created_at: null };
    const event = { publicId: row.public_id, revision: row.catalog_revision, embeddingTextHash: sha256('test'), operation: 'upsert', createdAt: NOW.toISOString() };
    for (const value of [null, at, '2026-10-19T12:00:00-07:00']) await assert.rejects(upsertProductAndQueueVector(db, { ...row, updated_at: value }, event), /explicit UTC/);
    await assert.rejects(upsertProductAndQueueVector(db, row, { ...event, createdAt: at }), /explicit UTC/);
    await assert.rejects(upsertProductAndQueueVector(db, row, event), /new products require UTC creation/);
    insert(db, 'products', row);
    await upsertProductAndQueueVector(db, row, event);
    assert.equal(db.sqlite.prepare('SELECT created_at FROM products').get().created_at, null);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM vector_sync_outbox').get().n, 1);
  } finally { db.sqlite.close(); }
});

test('protected packet output is checksummed, private, bounded and never overwrites', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'sg-operational-test-')); const output = join(parent, 'packet');
  try {
    const result = await writeOperationalPacket(output, packet()); const raw = await readFile(join(output, 'manifest.json'), 'utf8');
    assert.equal(sha256(raw), result.manifestSha256); const manifest = JSON.parse(raw);
    assert.equal((await lstat(output)).mode & 511, 0o700);
    for (const file of [...manifest.files, manifest.preserved]) {
      assert.equal((await lstat(join(output, file.file))).mode & 511, 0o600);
      assert.equal(sha256(await readFile(join(output, file.file), 'utf8')), file.sha256); assert(file.bytes <= 1_000_000);
    }
    assert(!raw.includes('PRIVATE SYNTHETIC QUERY')); assert(!raw.includes('PRIVATE TEST MERCHANT COPY'));
    await assert.rejects(writeOperationalPacket(output, packet()));
  } finally { await rm(parent, { recursive: true, force: true }); }
});

// Opt-in, local-only evidence drill. Never opens a D1/provider connection.
test('pinned full private source: populated migration, all identities, historical replay and preserved projection proof', {
  skip: !process.env.CATALOG_OPERATIONAL_PROOF_BASE,
}, async () => {
  const base = process.env.CATALOG_OPERATIONAL_PROOF_BASE;
  const output = join(base, 'operational-packet-2026-10-20-first');
  const manifestRaw = await readFile(join(output, 'manifest.json'), 'utf8');
  assert.equal(sha256(manifestRaw), process.env.CATALOG_OPERATIONAL_PACKET_SHA);
  const manifest = JSON.parse(manifestRaw);
  const a = await validateRecoveryArchive(join(base, 'export-2026-10-20-first'), {
    expectedManifestSha256: '6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076',
  });
  const sourceProductsRaw = await readFile(join(base, 'import-2026-10-20-first/expected-products.json'), 'utf8');
  assert.equal(sha256(sourceProductsRaw), '10647d792ae49e20c3edda7a6a2d96c09ce928f8d4b0193b8b84492819471891');
  const sampleRaw = await readFile(join(base, 'import-2026-10-20-first/import-batch.json'), 'utf8');
  assert.equal(sha256(sampleRaw), 'ab34af2358c826da4684f5f9dc9c6cdce6d9000fc8596880b32336cec999e055');
  const evidence = await readFile(join(base, 'd1-operational-replay-receipt.json'), 'utf8');
  assert.equal(sha256(evidence), manifest.preserveEvidence.evidenceSha256);
  const p = prepareOperationalPacket(a, { importedAt: manifest.importedAt, unresolvedEvidence: manifest.unresolvedEvidence,
    preserve: { rows: JSON.parse(sourceProductsRaw), ...manifest.preserveEvidence } });
  for (const [i, file] of manifest.files.entries()) {
    const raw = await readFile(join(output, file.file), 'utf8'); assert.equal(sha256(raw), file.sha256);
    assert.equal(canonicalJson(JSON.parse(raw)), canonicalJson(p.batches[i]));
  }
  assert.equal(canonicalJson(JSON.parse(await readFile(join(output, manifest.preserved.file), 'utf8'))), canonicalJson(p.preservedRows));
  const db = database();
  try {
    await importBatch(db, JSON.parse(sampleRaw));
    for (const batch of p.batches.filter((b) => ['catalog_runs', 'catalog_run_items'].includes(b.table))) await importBatch(db, batch);
    const products = p.preservedRows.filter((row) => row.public_display_json).map((row) => JSON.parse(row.public_display_json));
    const snapshot = { schemaVersion: 1, dataKind: 'catalog', catalogRevision: 'local-preserved-proof', generatedAt: p.summary.importedAt, products, heldProducts: [], slugHistory: [] };
    const asOf = new Date(p.summary.importedAt);
    await importPublicProjection(db, await createProjectionPacket(snapshot,
      Object.fromEntries(p.preservedRows.map((row) => [row.public_id, row.source_facts_hash])), JSON.parse(sampleRaw).exportSha256, asOf));
    const projections = canonicalJson(db.sqlite.prepare('SELECT rowid,* FROM catalog_public_products').all().map((row) => ({ ...row })));
    const receipts = canonicalJson(db.sqlite.prepare('SELECT * FROM catalog_projection_receipts').all().map((row) => ({ ...row })));
    migrate(db);
    const first = { imported: 0, already_imported: 0 };
    for (const batch of p.batches) first[await importBatch(db, batch)]++;
    let replays = 0; for (const batch of p.batches) { assert.equal(await importBatch(db, batch), 'already_imported'); replays++; }
    const tables = await reconcileOperationalPacket(db, p);
    assert.deepEqual(tables.map((row) => row.rows), [17, 3383, 0, 3750, 601, 340]);
    assert.equal(canonicalJson(db.sqlite.prepare('SELECT rowid,* FROM catalog_public_products').all().map((row) => ({ ...row }))), projections);
    assert.equal(canonicalJson(db.sqlite.prepare('SELECT * FROM catalog_projection_receipts').all().map((row) => ({ ...row }))), receipts);
    assert.equal((await getRevisionProductsByPublicIds(db, products.map((row) => row.publicId), asOf, 'local-preserved-proof')).length, products.length);
    const held = Number(db.sqlite.prepare('SELECT count(*) n FROM products WHERE availability_checked_at IS NULL AND last_verified_at IS NULL AND public_display_json IS NULL AND eligible_until IS NULL').get().n);
    assert.equal(held, 3373);
    assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    for (const fts of ['products_fts', 'catalog_public_products_fts']) db.sqlite.exec(`INSERT INTO ${fts}(${fts},rank) VALUES('integrity-check',1)`);
    const highWater = db.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='catalog_run_items'").get().seq;
    db.sqlite.exec('BEGIN');
    db.sqlite.prepare(`INSERT INTO catalog_run_items(id,run_id,external_id,decision,requires_manual_review,created_at,source_record_json)
      SELECT 'local-sequence-probe',id,'synthetic','test',0,?,'{}' FROM catalog_runs LIMIT 1`).run(p.summary.importedAt);
    assert.equal(db.sqlite.prepare("SELECT sequence FROM catalog_run_items WHERE id='local-sequence-probe'").get().sequence, highWater + 1);
    db.sqlite.exec('ROLLBACK');
    const implementations = {};
    for (const name of ['scripts/catalog/migration.ts', 'scripts/catalog/prepare-operational.ts', 'migrations/d1/0005_historical_timestamps.sql', 'lib/catalog/d1.ts', 'lib/catalog/storage/d1.ts', 'tests/catalog-migration-operational.test.mjs'])
      implementations[name] = sha256(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
    const receipt = { schemaVersion: 1, mode: 'local-sqlite-operational-migration-proof', generatedAt: new Date().toISOString(),
      sourceManifestSha256: a.summary.manifestSha256, packetManifestSha256: sha256(manifestRaw), implementations,
      tables, identityCount: tables.reduce((n, row) => n + row.rows, 0), preservedProducts: p.preservedRows.length,
      preservedReadyProjections: products.length, first, exactReplays: replays, unknownHeldProducts: held,
      sequenceMaximum: highWater, sequenceProbeRolledBack: true, foreignKeys: 'ok', integrity: 'ok', ftsIntegrity: 'ok',
      sourceVectorsValidated: a.tables.reduce((n, t) => n + t.vectorCount, 0), embeddingsRegenerated: 0, providerCalls: 0,
      limitations: ['Local SQLite proof is not remote D1 execution or cutover acceptance.', 'Historical unresolved normalized instants remain NULL; original raw wall times/provenance and vectors are preserved.'] };
    const raw = `${canonicalJson(receipt)}\n`; const receiptFile = `local-verification-${randomUUID()}.json`;
    await writeFile(join(output, receiptFile), raw, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ localOnly: true, tables: tables.map(({ table, rows }) => ({ table, rows })), first, replays, receiptFile, receiptSha256: sha256(raw) }));
  } finally { db.sqlite.close(); }
});
