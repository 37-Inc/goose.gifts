import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createProjectionPacket, getRevisionProductsByPublicIds, importPublicProjection,
  keywordSearchRevision, projectionQueries, rollbackPreflight } from '../lib/catalog/d1.ts';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const HASH = 'a'.repeat(64);
const PUBLIC_ID = '00000000-0000-4000-8000-000000000001';
function snapshot(revision, witty = 'A funny red button for a desk.') {
  return { schemaVersion: 1, dataKind: 'catalog', catalogRevision: revision, generatedAt: NOW.toISOString(),
    products: [{ id: 'B000000001', publicId: PUBLIC_ID, slug: 'funny-button', title: 'Funny Red Sound Button', description: witty,
      wittyDescription: witty, imageUrl: 'https://m.media-amazon.com/images/I/button.jpg', affiliateUrl: 'https://www.amazon.com/dp/B000000001?tag=test-20',
      source: 'amazon', currency: 'USD', price: 0, isActive: true, qualityScore: 0.8, eligibleUntil: new Date(NOW.getTime() + 86400_000).toISOString() }], heldProducts: [], slugHistory: [] };
}
async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../migrations/d1/0001_catalog.sql', import.meta.url), 'utf8'));
  sqlite.exec(await readFile(new URL('../migrations/d1/0002_public_projections.sql', import.meta.url), 'utf8'));
  sqlite.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,
    availability_status,source_facts_hash,editorial_source_hash,catalog_revision,eligible_until,rights_json,source_record_json,updated_at,public_display_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('B000000001', PUBLIC_ID, 'funny-button', 'amazon', 'current operational title', 'USD', .8, 1,
      'generated_ready', 'IN_STOCK', HASH, HASH, 'operational-newer', new Date(NOW.getTime() + 2 * 86400_000).toISOString(), '{}', '{}', NOW.toISOString(), JSON.stringify(snapshot('operational').products[0]));
  const db = { prepare(sql) { let values = []; return {
    bind(...parameters) { values = parameters; return this; },
    async all() { return { results: sqlite.prepare(sql).all(...values).map((row) => ({ ...row })) }; },
    async run() { return sqlite.prepare(sql).run(...values); },
  }; }, async batch(statements) { sqlite.exec('BEGIN'); try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, db, close: () => sqlite.close() };
}
const packet = (value) => createProjectionPacket(value, { [PUBLIC_ID]: HASH }, 'b'.repeat(64), NOW);

test('old and new immutable public revisions coexist independently of mutable operational revision', async () => {
  const fixture = await setup();
  try {
    const old = snapshot('r1', 'Old approved button description.'); const newer = snapshot('r2', 'New approved button description.');
    await importPublicProjection(fixture.db, await packet(old));
    await importPublicProjection(fixture.db, await packet(newer));
    for (const expected of [old, newer]) {
      assert.deepEqual(await getRevisionProductsByPublicIds(fixture.db, [PUBLIC_ID], NOW, expected.catalogRevision), expected.products);
      assert.deepEqual(await keywordSearchRevision(fixture.db, 'button', 60, NOW, expected.catalogRevision), expected.products);
      assert.deepEqual(await rollbackPreflight(fixture.db, expected, NOW), { ok: true, reason: 'eligible_revision_compatible' });
    }
    assert.equal(fixture.sqlite.prepare('SELECT count(*) n FROM catalog_public_products').get().n, 2);
    const plan = fixture.sqlite.prepare('EXPLAIN QUERY PLAN SELECT public_display_json FROM catalog_public_products WHERE catalog_revision=? AND public_id=?').all('r1', PUBLIC_ID);
    assert.match(JSON.stringify(plan), /INDEX/);
  } finally { fixture.close(); }
});

test('identical replay succeeds and changed bytes/revision mutation are rejected', async () => {
  const fixture = await setup();
  try {
    const original = await packet(snapshot('r1'));
    assert.equal(await importPublicProjection(fixture.db, original), 'imported');
    assert.equal(await importPublicProjection(fixture.db, original), 'already_imported');
    await assert.rejects(importPublicProjection(fixture.db, await packet(snapshot('r1', 'Different bytes.'))), /different projection bytes/);
    assert.throws(() => fixture.sqlite.prepare('UPDATE catalog_public_products SET title=?').run('oops'), /immutable/);
    assert.throws(() => fixture.sqlite.prepare('UPDATE catalog_projection_receipts SET product_count=0').run(), /immutable/);
    fixture.sqlite.prepare('DELETE FROM catalog_public_products WHERE catalog_revision=?').run('r1');
    await assert.rejects(importPublicProjection(fixture.db, original), /incomplete or changed/);
    assert.equal((await rollbackPreflight(fixture.db, snapshot('r1'), NOW)).ok, false);
    const insert = projectionQueries(original)[0];
    assert.throws(() => fixture.sqlite.prepare(insert.sql).run(...insert.params), /sealed/);
  } finally { fixture.close(); }
});

test('a receipt cannot hide tampered projection bytes on replay or rollback', async () => {
  const fixture = await setup();
  try {
    const value = snapshot('r1'); const original = await packet(value);
    await importPublicProjection(fixture.db, original);
    fixture.sqlite.exec('DROP TRIGGER catalog_public_immutable'); // Deliberate corruption fixture.
    fixture.sqlite.prepare('UPDATE catalog_public_products SET public_display_json=?').run(JSON.stringify(snapshot('r1', 'Corrupted public copy.').products[0]));
    await assert.rejects(importPublicProjection(fixture.db, original), /incomplete or changed/);
    assert.equal((await rollbackPreflight(fixture.db, value, NOW)).reason, 'projection_bytes_incompatible');
  } finally { fixture.close(); }
});

test('operational timestamp/revision advancement alone does not invalidate compatible rollback', async () => {
  const fixture = await setup();
  try {
    const value = snapshot('r1'); await importPublicProjection(fixture.db, await packet(value));
    fixture.sqlite.prepare('UPDATE products SET catalog_revision=?,updated_at=?').run('r99', '2026-10-19T12:00:01.000Z');
    assert.equal((await rollbackPreflight(fixture.db, value, NOW)).ok, true);
  } finally { fixture.close(); }
});

test('partial projection stays invisible and an incomplete receipt cannot activate it', async () => {
  const fixture = await setup();
  try {
    const value = await packet(snapshot('r1'));
    const [insert] = projectionQueries(value);
    fixture.sqlite.prepare(insert.sql).run(...insert.params);
    assert.deepEqual(await keywordSearchRevision(fixture.db, 'button', 60, NOW, 'r1'), []);
    assert.deepEqual(await rollbackPreflight(fixture.db, snapshot('r1'), NOW), { ok: false, reason: 'projection_receipt_missing' });
    fixture.sqlite.prepare('DELETE FROM catalog_public_products').run();
    const receipt = projectionQueries(value).at(-1);
    assert.throws(() => fixture.sqlite.prepare(receipt.sql).run(...receipt.params), /Incomplete/);
  } finally { fixture.close(); }
});

test('current operational holds, factual changes and deadline expiry override both revisions', async () => {
  for (const update of ["is_active=0", "duplicate_of_product_id='winner'", "availability_status='OUT_OF_STOCK'",
    "quality_score=0.1", "editorial_status='stale'", "public_display_json=NULL", `source_facts_hash='${'c'.repeat(64)}',editorial_source_hash='${'c'.repeat(64)}'`]) {
    const fixture = await setup();
    try {
      const value = snapshot('r1'); await importPublicProjection(fixture.db, await packet(value));
      fixture.sqlite.exec(`UPDATE products SET ${update}`);
      assert.deepEqual(await keywordSearchRevision(fixture.db, 'button', 60, NOW, 'r1'), []);
      assert.equal((await rollbackPreflight(fixture.db, value, NOW)).ok, false);
    } finally { fixture.close(); }
  }
  const fixture = await setup();
  try {
    const value = snapshot('r1'); await importPublicProjection(fixture.db, await packet(value));
    const expired = new Date(NOW.getTime() + 86400_000);
    assert.deepEqual(await getRevisionProductsByPublicIds(fixture.db, [PUBLIC_ID], expired, 'r1'), []);
    assert.deepEqual(await rollbackPreflight(fixture.db, value, expired), { ok: false, reason: 'release_expired' });
    const tampered = snapshot('r1', 'Edited after publication.');
    assert.equal((await rollbackPreflight(fixture.db, tampered, NOW)).reason, 'release_digest_mismatch');
  } finally { fixture.close(); }
});
