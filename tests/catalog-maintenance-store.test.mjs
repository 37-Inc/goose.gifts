import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import amazonCreators from '../lib/amazon-creators.js';
import { createPostgresCatalogMaintenanceStore } from '../scripts/ops/catalog-maintenance-postgres.mjs';
import { executeCatalog, getProductsForRevalidation, parseArgs } from '../scripts/ops/prefetch-catalog.mjs';

// Exact runtime SQL before the mechanical move, baseline bb03f6 / runner SHA
// 66dfd052bb2766c75784989768588b9ba656fbebffc4958e41eb8dea7a918c62.
// Deliberate policy/SQL changes must review these guards, not silently bless drift.
const SQL = {
  upsertProduct: '35fbed58e1180b34a874a01cbf9347164442a9dce0ff501ef394d9664ded02ba',
  getActiveCatalogIdentities: 'eed8994eb0c40125895262b7ab6e76f247310e7e60a886c37dd10615308d2e8c',
  getExistingEditorialWriteups: '693d48f1e24cc0c37822ff4f9149c5f4afe251b8466a6daf7de7ae2e4b1bf0d5',
  getAffiliateUrlMismatches: '07818e39ed066798474a009988e3f1c890044d9a90180fb379f9ac9e33b9cd70',
  updateAmazonAffiliateUrl: '157a152f229ac02bf32b3a674161c9e55b49d070d9ee4f20f5c2f8f4e396b840',
  getProductsForRevalidation: 'e4bf5eef52925a81576ae841e17cb2345459ccc024df3623e1e418154dfd7bdd',
  deactivateConfirmedMissing: 'a3a20a710d75a4ae1083e0a214f6b4f980fd8a1c67a5f83a849370b88549da22',
  markConfirmedMissingUnavailable: '57227ce3000762f8a49c5be634e0b189d6d59f065fc8c9027884247d39064125',
  getProductsNeedingEnrichment: 'b2f60f3381b4fc75378173edab1a549d87278a4438ecdcebe8139429f3dc09cd',
  recordEditorialEvent: '63633994befc9818e41a4fb53674619568913aa46182479e6f1f9cff855285c5',
  markCatalogDuplicate: '3ab4cc95a44b12fab55bc06b54376bb6621524eb53fb94ef8187e380e0c5eaa3',
};
const hash = (text) => createHash('sha256').update(text).digest('hex');
const id = 'B000000001';
function product() {
  return { id, slug: 'test-only-gift', title: 'TEST ONLY fixture', price: 19.99, currency: 'USD',
    imageUrl: 'https://example.invalid/test.jpg', affiliateUrl: 'https://example.invalid/test', sourceQuery: 'synthetic',
    humorTags: ['quoted"tag', 'slash\\tag'], qualityScore: .8, isActive: true, remotelyVerified: false,
    editorialStatus: 'manual_locked', editorialGeneratedAt: new Date('2026-10-19T12:00:00.123Z'), sourceFacts: { fixture: true } };
}

test('Postgres store is lazy, immutable, and moves every SQL statement byte-for-byte with parameter ordering intact', async () => {
  const calls = []; let rows = [{ inserted: true, slug: 'stored-slug' }];
  const store = createPostgresCatalogMaintenanceStore({ query: async (text, params) => { calls.push({ text, params }); return { rows, rowCount: 2 }; } });
  assert.equal(calls.length, 0); assert.ok(Object.isFrozen(store)); assert.deepEqual(Object.keys(store), Object.keys(SQL));
  const seen = new Set();
  const check = (name, params) => {
    const call = calls.at(-1); assert.equal(hash(call.text), SQL[name], name);
    assert.deepEqual(call.params, params, name); seen.add(name);
  };
  const p = product(); assert.deepEqual(await store.upsertProduct(p, 'test-hash'), { inserted: true, slug: 'stored-slug' });
  check('upsertProduct', [id, p.title, 19.99, 'USD', p.imageUrl, p.affiliateUrl, 'amazon', 'synthetic',
    '{"quoted\\"tag","slash\\\\tag"}', null, null, .8, null, null, true, null, false, null,
    '{"fixture":true}', 'test-hash', 'test-hash', null, 'manual_locked', null, null, null, p.editorialGeneratedAt, null, null]);
  const originalDate = p.editorialGeneratedAt;
  assert.equal(calls[0].params[26], originalDate); // No parser, timezone guess or new Date.
  assert.match(calls[0].text, /embedding = COALESCE\(EXCLUDED.embedding, products.embedding\)/);
  assert.match(calls[0].text, /WHEN products.editorial_status = 'manual_locked' THEN products.editorial_status/);
  rows = [{ lastVerifiedAt: originalDate }]; assert.equal(await store.getActiveCatalogIdentities(), rows);
  check('getActiveCatalogIdentities', undefined);
  rows = [{ editorial_writeup: 'Synthetic approved copy' }, { editorial_writeup: '' }, { editorial_writeup: null }];
  assert.deepEqual(await store.getExistingEditorialWriteups([id]), ['Synthetic approved copy']); check('getExistingEditorialWriteups', [[id]]);
  rows = [{ id, affiliate_url: 'https://example.invalid' }]; assert.equal(await store.getAffiliateUrlMismatches('test-20'), rows); check('getAffiliateUrlMismatches', ['test-20']);
  assert.equal(await store.updateAmazonAffiliateUrl(id, 'url'), 2); check('updateAmazonAffiliateUrl', [id, 'url']);
  assert.equal(await store.getProductsForRevalidation({ limit: 50, staleDays: 30, publishedStaleDays: 21, publishedSlots: 40, legacySlots: 10 }), rows);
  check('getProductsForRevalidation', [50, 30, 21, 40, 10]);
  assert.deepEqual(await store.deactivateConfirmedMissing([id], 90), [id]); check('deactivateConfirmedMissing', [[id], 90]);
  assert.deepEqual(await store.markConfirmedMissingUnavailable([id]), [id]); check('markConfirmedMissingUnavailable', [[id]]);
  assert.equal(await store.getProductsNeedingEnrichment(25, []), rows); check('getProductsNeedingEnrichment', [25, null]);
  await store.recordEditorialEvent({ runId: 'test-run', productId: id, eventType: 'test-event', status: 'pending', details: { fixture: true } });
  check('recordEditorialEvent', ['test-run', id, 'test-event', 'pending', '{"fixture":true}']);
  await store.markCatalogDuplicate(id, 'winner', 'duplicate_of:winner'); check('markCatalogDuplicate', [id, 'winner', 'duplicate_of:winner']);
  assert.equal(seen.size, 11);
});

test('legacy null/vector/slug behavior and persistence errors are not rewritten or hidden', async () => {
  const calls = []; const store = createPostgresCatalogMaintenanceStore({ query: async (text, params) => { calls.push({ text, params }); return { rows: [] }; } });
  const p = { ...product(), embedding: [0.125, -0.25], editorialSourceHash: 'reviewed', remotelyVerified: undefined };
  assert.deepEqual(await store.upsertProduct(p, 'facts'), { inserted: false, slug: p.slug });
  assert.equal(calls[0].params[15], '[0.125,-0.25]'); assert.equal(calls[0].params[16], true); assert.equal(calls[0].params[20], 'reviewed');
  assert.equal(await store.updateAmazonAffiliateUrl(id, 'url'), 0);
  const error = new Error('Synthetic driver failure');
  const broken = createPostgresCatalogMaintenanceStore({ query: async () => { throw error; } });
  await assert.rejects(broken.getActiveCatalogIdentities(), (actual) => actual === error);
  assert.throws(() => createPostgresCatalogMaintenanceStore({ query: null }), /function/);
});

test('explicit store selection keeps existing revalidation bounds and published/legacy lane policy', async () => {
  for (const limit of [1, 2, 5, 25, 50, 100]) {
    let selection;
    const expected = [{ fixture: true }];
    const rows = await getProductsForRevalidation(limit, 30, { getProductsForRevalidation: async (value) => { selection = value; return expected; } });
    const legacy = limit > 1 ? Math.max(1, Math.floor(limit / 5)) : 0;
    assert.equal(rows, expected); assert.deepEqual(selection, { limit, staleDays: 30, publishedStaleDays: 21, publishedSlots: limit - legacy, legacySlots: legacy });
  }
});

test('affiliate-only execution uses the injected store, keeps URL correction/order and honors dry run', async (t) => {
  const previous = process.env.AMAZON_ASSOCIATE_TAG; process.env.AMAZON_ASSOCIATE_TAG = 'fixture-20';
  t.after(() => { if (previous === undefined) delete process.env.AMAZON_ASSOCIATE_TAG; else process.env.AMAZON_ASSOCIATE_TAG = previous; });
  const mismatches = [{ id, affiliate_url: `https://www.amazon.com/gp/product/${id}?tag=old&ref_=fixture` },
    { id: 'B000000002', affiliate_url: 'not-a-url' }];
  const updates = []; const store = { getAffiliateUrlMismatches: async (tag) => { assert.equal(tag, 'fixture-20'); return mismatches; },
    updateAmazonAffiliateUrl: async (...args) => { updates.push(args); return 1; } };
  const options = parseArgs(['--repair-affiliate-urls-only']);
  assert.deepEqual(await executeCatalog({ ...options, dryRun: true }, undefined, undefined, store), { dryRun: true, repairAffiliateUrlsOnly: true, affiliateAudit: { mismatched: 2, repaired: 0 } });
  assert.deepEqual(updates, []);
  const result = await executeCatalog(options, undefined, undefined, store);
  assert.deepEqual(result.affiliateAudit, { mismatched: 2, repaired: 2 });
  assert.deepEqual(updates, [[id, `https://www.amazon.com/gp/product/${id}?tag=fixture-20&ref_=fixture`], ['B000000002', 'https://www.amazon.com/dp/B000000002?tag=fixture-20']]);
});

test('revalidation routes all maintenance to the injected store without changing confirmation or dry-run behavior', async (t) => {
  const present = { ...product(), title: 'TEST ONLY funny desk button', humor_tags: [], last_verified_at: null };
  const missing = { ...present, id: 'B000000002' }; const calls = [];
  t.mock.method(amazonCreators, 'getItems', async (ids) => { calls.push(['remote-fixture', ids]); return ids.includes(id) ? [{ ...product(), availabilityStatus: 'IN_STOCK', remotelyVerified: true }] : []; });
  const store = {
    getAffiliateUrlMismatches: async () => [], getProductsForRevalidation: async () => [present, missing],
    upsertProduct: async (value, sourceHash) => { calls.push(['upsert', value.id]); assert.equal(value.remotelyVerified, true); assert.equal(typeof sourceHash, 'string'); return { inserted: false, slug: 'retained-slug' }; },
    markConfirmedMissingUnavailable: async (ids) => { calls.push(['unavailable', ids]); return ids; },
    deactivateConfirmedMissing: async (ids, days) => { calls.push(['deactivate', ids, days]); return ids; },
  };
  const telemetry = { items: { record() {}, async flush() {} }, timingsMs: {}, warnings: [] };
  const result = await executeCatalog(parseArgs(['--revalidate']), undefined, telemetry, store);
  assert.equal(result.refreshed, 1); assert.equal(result.confirmedMissing, 1); assert.equal(result.deactivated, 1);
  assert.deepEqual(calls, [['remote-fixture', [id, missing.id]], ['remote-fixture', [missing.id]], ['upsert', id], ['unavailable', [missing.id]], ['deactivate', [missing.id], 90]]);
  calls.length = 0;
  const dry = await executeCatalog({ ...parseArgs(['--revalidate']), dryRun: true }, undefined, telemetry, store);
  assert.equal(dry.confirmedMissing, 1); assert.equal(dry.markedUnavailable, 1); assert.equal(dry.deactivated, 0);
  assert.deepEqual(calls, [['remote-fixture', [id, missing.id]], ['remote-fixture', [missing.id]]]);
});

test('empty enrichment execution uses the supplied store and never binds default persistence/providers', async () => {
  let selections = 0;
  const store = { getProductsNeedingEnrichment: async (limit, ids) => { selections++; assert.equal(limit, 25); assert.equal(ids, undefined); return []; } };
  const telemetry = { items: { record() {}, async flush() {} }, timingsMs: {}, warnings: [] };
  const result = await executeCatalog(parseArgs(['--enrich-only']), undefined, telemetry, store);
  assert.equal(result.enrichOnly, true); assert.equal(result.backfill.selected, 0); assert.equal(selections, 1);
});
