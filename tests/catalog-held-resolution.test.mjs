import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { prepareHeldCatalogResolution, captureHeldCatalogResolution, applyHeldCatalogResolution, exactHeldListingTitle, HELD_CATALOG_EXCLUSIONS } from '../scripts/catalog/held-catalog-resolution.ts';
import { canonicalJson, convertSourceRow, sha256 } from '../scripts/catalog/migration.ts';
import { createCatalogSnapshot, createPersistentCatalogProduct, validatePublicCatalogProduct } from '../lib/catalog/snapshot.ts';
import { EXACT_DUPLICATE_LISTINGS } from '../lib/catalog/duplicate-listings.ts';
import { cleanAmazonImageUrl } from '../lib/image-utils.ts';
import { checkCurrent } from '../scripts/catalog/export-d1-snapshot.ts';
import { maintenanceState } from '../scripts/catalog/maintenance-state.ts';
import { createProjectionPacket, projectionQueries, getListedRevisionProductsByPublicIds, getRevisionProductsByPublicIds, visibleRevisionCountQuery } from '../lib/catalog/d1.ts';

const NOW = '2026-10-25T05:00:00.000Z';
const hash = x => sha256(canonicalJson(x));
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const grant = value => ({ basis: 'licensed', value, reference: 'Synthetic fixture exact owned permission' });

async function fixture(t, { falseDuplicate = false, reviewedDuplicate = null, promotedKeeper = false } = {}) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const file of (await readdir(new URL('../migrations/d1/', import.meta.url))).filter(n => /^00\d\d_.*\.sql$/.test(n)).sort())
    sql.exec(await readFile(new URL('../migrations/d1/' + file, import.meta.url), 'utf8'));
  const owner = { environment: 'staging', indexName: 'held-fixture', token: 'fixture-owner', generation: 18, epoch: 0,
    phase: 'writing', ownerReference: 'held-fixture', operationKey: 'a'.repeat(64), capturedAt: NOW };
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name,owner_token,generation,mutation_epoch,phase,owner_reference,operation_key,captured_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(owner.environment, owner.indexName, owner.token, owner.generation, owner.epoch, owner.phase, owner.ownerReference, owner.operationKey, owner.capturedAt);
  const raw = (id, n, extra = {}) => ({ id, public_id: uuid(n), slug: 'fixture-gift-' + n, source: 'amazon', currency: 'USD', title: 'Funny plastic desk object ' + n,
    image_url: 'https://example.invalid/image-' + n + '.jpg', affiliate_url: `https://www.amazon.com/dp/${id}?tag=goose-gifts-37-20`, price: '0.00',
    witty_description: 'The original concise description ' + n + '.', punny_title: null, humor_tags: '{}', source_query: 'fixture',
    quality_score: '0.5000', is_active: true, editorial_status: 'pending', availability_status: null, source_facts: null,
    source_facts_hash: null, editorial_source_hash: null, editorial_writeup: null, editorial_quality_score: null,
    editorial_model: null, editorial_prompt_version: null, editorial_generated_at: null, editorial_block_reason: null,
    duplicate_of_product_id: null, availability_checked_at: null, last_verified_at: null, created_at: NOW, updated_at: NOW, ...extra });
  const source = [raw('B000000001', 1, { quality_score: '.35', editorial_status: 'manual_locked' }),
    raw('B000000002', 2, { editorial_status: 'needs_review', editorial_block_reason: 'Unsupported long draft', editorial_writeup: 'Do not publish this unsupported long draft.' }),
    raw('B000000003', 3, { is_active: false, availability_status: 'OUT_OF_STOCK' }),
    raw('B000000004', 4, { duplicate_of_product_id: 'B000000099', editorial_status: 'duplicate', title: falseDuplicate ? 'Different printed novelty object' : 'Existing object' }),
    raw('B0764HS4SL', 5, { editorial_status: 'blocked', editorial_block_reason: 'off_brand' })];
  if (reviewedDuplicate) {
    source[promotedKeeper ? 1 : 0].id = reviewedDuplicate;
    if (promotedKeeper) source[0].id = EXACT_DUPLICATE_LISTINGS[reviewedDuplicate];
  }
  const insert = (table, row) => sql.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  for (const p of source) insert('products', convertSourceRow('products', p, { catalogRevision: 'old', archiveId: 'b'.repeat(64), timestamps: {} }));
  const first = { ...sql.prepare('SELECT * FROM products WHERE id=?').get(source[0].id) };
  insert('catalog_maintenance_products', { product_id: first.id, version: 3, semantic_json: canonicalJson(maintenanceState(first)),
    embedding_present: 1, embedding_native_base64: 'EXACT_NATIVE_BYTES', embedding_provenance_json: '{"original":true}' });
  const publicId = reviewedDuplicate && !promotedKeeper ? EXACT_DUPLICATE_LISTINGS[reviewedDuplicate] : 'B000000099';
  const publicProduct = { id: publicId, publicId: uuid(99), slug: 'public-existing', title: 'Existing object', description: 'Existing short description.',
    imageUrl: 'https://example.invalid/public.jpg', affiliateUrl: `https://www.amazon.com/dp/${publicId}?tag=goose-gifts-37-20`, source: 'amazon', currency: 'USD',
    qualityScore: .8, isActive: true, price: 0, eligibleUntil: null, indexable: false };
  const baseline = { schemaVersion: 1, dataKind: 'catalog', catalogRevision: 'old', generatedAt: NOW, products: [publicProduct],
    heldProducts: source.map(p => ({ id: p.id, publicId: p.public_id, slug: p.slug, path: '/gifts/' + p.slug,
      title: 'Gift currently unavailable', description: 'This gift is not currently available in the curated catalog. Browse other gifts instead.',
      reason: p.duplicate_of_product_id ? 'duplicate' : p.is_active ? 'editorial_hold' : 'inactive' })), slugHistory: [] };
  let batches = 0, loseAck = false, beforeBatch;
  const db = { prepare(sqlText) { const prepared = { sql: sqlText, args: [], bind(...args) { this.args = args; return this; },
    async all() { return { results: sql.prepare(sqlText).all(...this.args).map(x => ({ ...x })) }; }, async run() { return sql.prepare(sqlText).run(...this.args); } }; return prepared; },
    async batch(statements) { batches++; beforeBatch?.(); beforeBatch = null;
      assert.ok(statements.length <= 50); assert.ok(Buffer.byteLength(JSON.stringify(statements.map(s => ({ sql: s.sql, params: s.args })))) <= 512 * 1024);
      sql.exec('BEGIN'); try { for (const stmt of statements) { assert.ok(stmt.args.length <= 100); sql.prepare(stmt.sql).all(...stmt.args); } sql.exec('COMMIT'); }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
      if (loseAck) { loseAck = false; throw Error('synthetic committed ACK loss'); }
    } };
  const rows = await captureHeldCatalogResolution(db, owner, source.map(p => p.id));
  const plan = prepareHeldCatalogResolution({ baseline, rows, owner, now: NOW, reference: 'Synthetic owner approves these original listings without extra fetch' });
  const cursor = { current: owner };
  const apply = () => applyHeldCatalogResolution({ db, plan, planSha256: hash(plan), ownerCursor: cursor });
  return { sql, source, owner, baseline, rows, plan, apply, cursor, db, batches: () => batches, loseAck() { loseAck = true; }, before(fn) { beforeBatch = fn; } };
}

test('resolves old pending/default-score, manual and stock holds without approving long drafts or changing original scores', async t => {
  const f = await fixture(t), before = f.rows.map(x => structuredClone(x));
  assert.equal(f.plan.promotions.length, 3); assert.equal(f.plan.exclusions.length, 2);
  const result = await f.apply(); assert.equal(result.promoted, 3); assert.equal(result.snapshot.products.length, 4); assert.equal(result.snapshot.heldProducts.length, 2);
  assert.deepEqual(result.snapshot.products[0], f.baseline.products[0]);
  for (const p of f.plan.promotions) {
    const original = before.find(x => x.row.id === p.id).row, actual = { ...f.sql.prepare('SELECT * FROM products WHERE id=?').get(p.id) };
    const display = JSON.parse(actual.public_display_json);
    assert.equal(actual.source_record_json, original.source_record_json); assert.equal(actual.quality_score, original.quality_score);
    for (const k of ['source_facts_hash', 'editorial_source_hash', 'availability_status', 'last_verified_at', 'eligible_until', 'created_at', 'updated_at']) assert.equal(actual[k], original[k]);
    assert.ok(display.title); assert.ok(display.imageUrl); assert.ok(display.description); assert.equal(display.editorialWriteup, undefined); assert.equal(display.indexable, false);
    assert.equal(display.qualityScore, original.quality_score); checkCurrent(display, { source_facts_hash: actual.source_facts_hash }, actual, new Date(NOW));
  }
  const side = f.sql.prepare('SELECT * FROM catalog_maintenance_products WHERE product_id=?').get('B000000001');
  assert.equal(side.version, 4); assert.equal(side.embedding_native_base64, 'EXACT_NATIVE_BYTES'); assert.equal(side.embedding_provenance_json, '{"original":true}');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM vector_sync_outbox').get().n, 0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM products').get().n, f.rows.length);
  assert.equal(f.sql.prepare('SELECT is_active FROM products WHERE id=?').get('B000000004').is_active, 1);
  await f.apply(); assert.equal(f.batches(), 1);
});
test('committed ACK loss reconciles same immutable receipt once without duplicate mutation', async t => {
  const f = await fixture(t); f.loseAck(); await f.apply(); assert.equal(f.batches(), 1); await f.apply(); assert.equal(f.batches(), 1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n, 1);
});
test('changed source/sidecar or owner aborts transaction before promoting anything', async t => {
  for (const kind of ['source', 'sidecar', 'owner']) await t.test(kind, async t => {
    const f = await fixture(t); f.before(() => { if (kind === 'source') f.sql.prepare('UPDATE products SET description=? WHERE id=?').run('changed', 'B000000001');
      else if (kind === 'sidecar') f.sql.prepare('UPDATE catalog_maintenance_products SET version=version+1 WHERE product_id=?').run('B000000001');
      else f.sql.prepare('UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1').run(); });
    await assert.rejects(f.apply()); assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_maintenance_operations').get().n, 0);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM products WHERE public_display_json IS NOT NULL').get().n, 0);
  });
});
test('partial row capture, invalid identity or modified plan is refused', async t => {
  const f = await fixture(t), input = { baseline: f.baseline, rows: f.rows, owner: f.owner, now: NOW, reference: 'Synthetic original permission' };
  assert.throws(() => prepareHeldCatalogResolution({ ...input, rows: input.rows.slice(1) }), /identities/);
  const changed = structuredClone(input); changed.rows[0].row.slug = 'other'; assert.throws(() => prepareHeldCatalogResolution(changed), /identity/);
  const plan = structuredClone(f.plan); plan.promotions[0].after.row.source_record_json = '{}';
  await assert.rejects(applyHeldCatalogResolution({ db: f.db, plan, planSha256: hash(plan), ownerCursor: f.cursor }), /plan/);
});
test('low ranking score can list only with exact permanent field approval; supplier and explicit blocks still refuse', () => {
  const product = { id: 'B000000001', publicId: uuid(1), slug: 'fixture', source: 'amazon', currency: 'USD', title: 'Funny object',
    description: 'A factual original short description.', imageUrl: 'https://example.invalid/item.jpg',
    affiliateUrl: 'https://www.amazon.com/dp/B000000001?tag=goose-gifts-37-20', price: 0, qualityScore: .35, isActive: true, editorialStatus: 'pending' };
  const rights = Object.fromEntries(['title', 'description', 'imageUrl', 'affiliateUrl'].map(k => [k, grant(product[k])]));
  const display = createPersistentCatalogProduct({ product, rights }, new Date(NOW)); assert.ok(display); assert.equal(display.qualityScore, .35);
  assert.equal(createPersistentCatalogProduct({ product: { ...product, editorialStatus: 'blocked' }, rights }, new Date(NOW)), null);
  assert.equal(createPersistentCatalogProduct({ product: { ...product, isActive: false }, rights }, new Date(NOW)), null);
  assert.equal(createPersistentCatalogProduct({ product, rights: {} }, new Date(NOW)), null);
  assert.throws(() => validatePublicCatalogProduct({ ...display, eligibleUntil: '2026-10-26T05:00:00.000Z' }, new Date(NOW)), /display fields/);
  assert.equal(Object.keys(HELD_CATALOG_EXCLUSIONS).length, 24);
  for (const id of ['B01N300JXK', '0063074958', '1523524332', 'B0BK7M32FG', 'B009SQQB6O', 'B0CC8JYF1Z']) assert.equal(HELD_CATALOG_EXCLUSIONS[id], undefined);
});
test('exact listing matcher retains different brands, sizes and novelty formats', () => {
  assert.equal(exactHeldListingTitle('Novelty Mug — 11 Oz!'), exactHeldListingTitle('NOVELTY MUG 11 oz'));
  assert.notEqual(exactHeldListingTitle('Guittard Semi Sweet Chocolate Chips'), exactHeldListingTitle('Ghirardelli Semi Sweet Chocolate Chips'));
  assert.notEqual(exactHeldListingTitle('LookHUMAN Alien Mug 11oz'), exactHeldListingTitle('LookHUMAN Alien Mug 15oz'));
  assert.notEqual(exactHeldListingTitle('Screaming goat figure'), exactHeldListingTitle('Yodeling goat figure'));
});
test('photo review uses the existing Amazon cleaner without treating a composite canvas as a product identity', () => {
  const composite = id => `https://m.media-amazon.com/images/I/01UwfHrld%2BL._TSa%7Csize%3A1910%2C1000%7Cpi-src%3A${id}.jpg%7Cpi-pos%3A1000%2C100%2C840%2C840.json`;
  assert.equal(cleanAmazonImageUrl(composite('51gVurwR6LL')), 'https://m.media-amazon.com/images/I/51gVurwR6LL.jpg');
  assert.notEqual(cleanAmazonImageUrl(composite('51gVurwR6LL')), cleanAmazonImageUrl(composite('61O0AYDh71L')));
  assert.equal(cleanAmazonImageUrl('https://m.media-amazon.com/images/I/514qcaUyEcL.jpg_BO30,255,255,255_UF900,850_SR1910,1000,0,C_QL100_.jpg'),
    'https://m.media-amazon.com/images/I/514qcaUyEcL.jpg');
});
test('confirmed exact duplicate exclusions survive future persistent and supplier snapshot rebuilds', () => {
  assert.equal(Object.keys(EXACT_DUPLICATE_LISTINGS).length, 6);
  for (const [id, representative] of Object.entries(EXACT_DUPLICATE_LISTINGS)) {
    const product = { id, publicId: uuid(1), slug: 'confirmed-duplicate', source: 'amazon', currency: 'USD',
      title: 'Exact duplicate fixture', description: 'Original factual description.', imageUrl: 'https://example.invalid/duplicate.jpg',
      affiliateUrl: `https://www.amazon.com/dp/${id}?tag=goose-gifts-37-20`, price: 0, qualityScore: .8,
      isActive: true, editorialStatus: 'pending' };
    const rights = Object.fromEntries(['title', 'description', 'imageUrl', 'affiliateUrl'].map(k => [k, grant(product[k])]));
    assert.equal(createPersistentCatalogProduct({ product, rights }, new Date(NOW)), null);
    const snapshot = createCatalogSnapshot([product], { [id]: rights }, { catalogRevision: 'registry-check', now: new Date(NOW),
      persistentById: { [id]: { product, rights } } });
    assert.equal(snapshot.products.length, 0); assert.equal(snapshot.heldProducts[0].reason, 'duplicate');
    const publicFields = { ...product }; delete publicFields.editorialStatus;
    assert.throws(() => validatePublicCatalogProduct({ ...publicFields, eligibleUntil: null, indexable: false }, new Date(NOW)), /confirmed duplicate/);
    const kept = { ...product, id: representative, affiliateUrl: `https://www.amazon.com/dp/${representative}?tag=goose-gifts-37-20` };
    const keptRights = { ...rights, affiliateUrl: grant(kept.affiliateUrl) };
    assert.ok(createPersistentCatalogProduct({ product: kept, rights: keptRights }, new Date(NOW)));
  }
});
test('reviewed photo/model duplicates stay held even with different titles, without deleting source or native history', async t => {
  for (const id of ['B0F45GMFH3', 'B0F912SZ4M']) await t.test(id, async t => {
    const f = await fixture(t, { reviewedDuplicate: id });
    assert.equal(f.plan.exclusions.find(p => p.id === id)?.duplicateOfProductId, EXACT_DUPLICATE_LISTINGS[id]);
    const original = f.rows.find(p => p.row.id === id), result = await f.apply();
    assert.equal(result.snapshot.products.some(p => p.id === id), false);
    assert.equal(result.snapshot.heldProducts.find(p => p.id === id)?.reason, 'duplicate');
    assert.equal(result.snapshot.products.some(p => p.id === EXACT_DUPLICATE_LISTINGS[id]), true);
    assert.deepEqual({ ...f.sql.prepare('SELECT * FROM products WHERE id=?').get(id) }, original.row);
    assert.equal(f.sql.prepare('SELECT embedding_native_base64 FROM catalog_maintenance_products WHERE product_id=?').get(id).embedding_native_base64, 'EXACT_NATIVE_BYTES');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM products').get().n, 5);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM vector_sync_outbox').get().n, 0);
  });
});
test('a reviewed duplicate cannot hide a listing without keeping its public representative', async t => {
  const f = await fixture(t, { reviewedDuplicate: 'B0F45GMFH3' });
  const input = { baseline: structuredClone(f.baseline), rows: f.rows, owner: f.owner, now: NOW, reference: 'Synthetic original permission' };
  input.baseline.products[0].id = 'B000000099';
  input.baseline.products[0].affiliateUrl = 'https://www.amazon.com/dp/B000000099?tag=goose-gifts-37-20';
  assert.throws(() => prepareHeldCatalogResolution(input), /duplicate_representative/);
  for (const id of ['B0CCDC2HYT', 'B0CDPKSMQK', 'B0CFFJRD8W', 'B0BQ9LZNXN']) assert.equal(EXACT_DUPLICATE_LISTINGS[id], undefined);
});
test('a held crown keeper can be promoted in the same plan as its duplicate exclusion', async t => {
  const f = await fixture(t, { reviewedDuplicate: 'B0F45GMFH3', promotedKeeper: true });
  assert.equal(f.plan.promotions.some(p => p.id === 'B0DJ8QSZZ7'), true);
  assert.equal(f.plan.promotions.some(p => p.id === 'B0F45GMFH3'), false);
  const result = await f.apply();
  assert.equal(result.snapshot.products.some(p => p.id === 'B0DJ8QSZZ7'), true);
  assert.equal(result.snapshot.heldProducts.find(p => p.id === 'B0F45GMFH3')?.reason, 'duplicate');
});
test('new exact-title duplicate stays held, without deleting either source identity', async t => {
  const f = await fixture(t), input = { baseline: structuredClone(f.baseline), rows: f.rows, owner: f.owner, now: NOW, reference: 'Synthetic original permission' };
  input.baseline.products[0].title = 'FUNNY plastic desk object 1';
  const plan = prepareHeldCatalogResolution(input);
  assert.equal(plan.promotions.length, 3);
  assert.equal(plan.exclusions.find(p => p.id === 'B000000001').duplicateOfProductId, 'B000000099');
  const result = await applyHeldCatalogResolution({ db: f.db, plan, planSha256: hash(plan), ownerCursor: f.cursor });
  assert.equal(result.snapshot.heldProducts.find(p => p.id === 'B000000001').reason, 'duplicate');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM products').get().n, 5);
});
test('old broad-family duplicate pointer is cleared for a distinct original listing, not treated as evidence', async t => {
  const f = await fixture(t, { falseDuplicate: true });
  assert.equal(f.plan.promotions.length, 4); assert.equal(f.plan.clearedLegacyDuplicateFlags.length, 1);
  const old = f.rows.find(p => p.row.id === 'B000000004').row.source_record_json;
  await f.apply(); const p = f.sql.prepare('SELECT * FROM products WHERE id=?').get('B000000004');
  assert.equal(p.duplicate_of_product_id, null); assert.equal(p.editorial_status, 'pending'); assert.equal(p.source_record_json, old);
  assert.equal(JSON.parse(p.source_record_json).duplicate_of_product_id, 'B000000099');
  assert.ok(JSON.parse(p.public_display_json).description);
});
test('actual SQL publication gate lists low-score cleared records without admitting them to supplier semantic search', async t => {
  const f = await fixture(t); await f.apply();
  const products = f.plan.promotions.map(p => p.display), snapshot = { ...f.baseline, catalogRevision: 'resolved-listings', products, heldProducts: [] };
  const facts = Object.fromEntries(products.map(p => [p.publicId, null]));
  const packet = await createProjectionPacket(snapshot, facts, 'b'.repeat(64), new Date(NOW));
  for (const q of projectionQueries(packet)) f.sql.prepare(q.sql).run(...q.params);
  const count = visibleRevisionCountQuery(snapshot.catalogRevision, new Date(NOW));
  assert.equal(Object.values(f.sql.prepare(count.sql).get(...count.params))[0], 3);
  assert.equal((await getListedRevisionProductsByPublicIds(f.db, products.map(p => p.publicId), new Date(NOW), snapshot.catalogRevision)).length, 3);
  assert.equal((await getRevisionProductsByPublicIds(f.db, products.map(p => p.publicId), new Date(NOW), snapshot.catalogRevision)).length, 0);
  f.sql.prepare('UPDATE products SET quality_score=? WHERE id=?').run(.1, products[0].id);
  assert.equal((await getListedRevisionProductsByPublicIds(f.db, products.map(p => p.publicId), new Date(NOW), snapshot.catalogRevision)).length, 2);
});
