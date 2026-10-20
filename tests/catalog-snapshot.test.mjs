import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogSnapshot, validateCatalogSnapshot, validatePublicCatalogProduct } from '../lib/catalog/snapshot.ts';

const now = new Date('2026-10-19T12:00:00.000Z');
const editorial = `${'This is explicitly synthetic test product editorial, not a real product claim. '.repeat(14)}\n\n${'The fixture exists only to test the publishing contract and carries no merchant endorsement. '.repeat(10)}`;
function product(overrides = {}) {
  return { id: 'TEST-FIXTURE-1', publicId: '00000000-0000-4000-8000-000000000001', slug: 'synthetic-test-object',
    title: 'Synthetic funny test object', description: 'Clearly labeled invented test fixture.', imageUrl: '/test-fixture.svg',
    affiliateUrl: 'https://example.invalid/fixture', currency: 'USD', price: 123.45, source: 'amazon',
    qualityScore: 0.9, isActive: true, availabilityStatus: 'IN_STOCK', availabilityCheckedAt: '2026-10-18T12:00:00.000Z',
    editorialStatus: 'manual_locked', editorialWriteup: editorial, editorialQualityScore: 0.9,
    sourceFactsHash: 'same', editorialSourceHash: 'same', sourceFacts: { private: 'not-public' },
    embedding: [1, 2, 3], editorialBlockReason: 'private internal notes', ...overrides };
}
function rights(p) {
  return Object.fromEntries(['title','description','imageUrl','affiliateUrl','editorialWriteup'].map((field) => [field,
    { basis: 'owned', reference: 'Synthetic test fixture authored solely for unit tests', value: p[field] }]));
}
function snapshot(p = product(), grants = rights(p)) {
  return createCatalogSnapshot([p], { [p.id]: grants }, { catalogRevision: 'test-only', dataKind: 'synthetic_fixture', now });
}

test('projects only approved display fields, immutable and explicitly synthetic/price-free', () => {
  const result = snapshot();
  assert.equal(result.dataKind, 'synthetic_fixture');
  assert.equal(result.products[0].price, 0);
  assert.equal(result.products[0].eligibleUntil, '2026-11-22T12:00:00.000Z');
  for (const field of ['sourceFacts','sourceFactsHash','embedding','editorialBlockReason']) assert.equal(field in result.products[0], false);
  assert.equal(JSON.stringify(result).includes('not-public'), false);
  assert.throws(() => { result.products.push({}); }, TypeError);
  assert.throws(() => { result.products[0].title = 'mutated'; }, TypeError);
});

test('missing, unrecognized, or mismatched rights fail closed and never emit merchant content', () => {
  for (const grants of [{}, { ...rights(product()), title: { basis: 'owned', reference: 'proof', value: 'wrong' } }]) {
    const result = snapshot(product(), grants);
    assert.equal(result.products.length, 0);
    assert.equal(result.heldProducts[0].reason, 'rights_unverified');
    assert.equal(result.heldProducts[0].title, 'Gift currently unavailable');
    assert.equal('imageUrl' in result.heldProducts[0], false);
    assert.equal('editorialWriteup' in result.heldProducts[0], false);
  }
});

test('merchant expiry is independent of 35-day editorial eligibility and capped at 24h', () => {
  const p = product(); const grants = rights(p);
  grants.imageUrl = { ...grants.imageUrl, basis: 'merchant', observedAt: now.toISOString(), expiresAt: '2026-10-19T13:00:00.000Z' };
  assert.equal(snapshot(p, grants).products[0].eligibleUntil, '2026-10-19T13:00:00.000Z');
  grants.imageUrl.expiresAt = '2026-10-21T12:00:00.000Z';
  assert.equal(snapshot(p, grants).heldProducts[0].reason, 'rights_unverified');
  delete grants.imageUrl.expiresAt;
  assert.equal(snapshot(p, grants).heldProducts[0].reason, 'rights_unverified');
});

test('optional copy with no permission is omitted, not copied from a source record', () => {
  const p = product({ punnyTitle: 'Private derivative', humorTags: ['private'] });
  const result = snapshot(p);
  assert.equal('punnyTitle' in result.products[0], false);
  assert.equal('humorTags' in result.products[0], false);
});

test('normal ready publication requires permission for its substantive editorial, not only the merchant tile', () => {
  const p = product(); const grants = rights(p); delete grants.editorialWriteup;
  assert.equal(snapshot(p, grants).heldProducts[0].reason, 'rights_unverified');
});

test('inactive, duplicate, expired, future-verified and editorial holds are safe', () => {
  for (const [overrides, reason] of [[{ isActive: false }, 'inactive'], [{ duplicateOfProductId: 'other' }, 'duplicate'],
    [{ editorialStatus: 'pending' }, 'editorial_hold'], [{ availabilityCheckedAt: '2026-09-14T12:00:00.000Z' }, 'expired'],
    [{ availabilityCheckedAt: '2026-10-20T12:00:00.000Z' }, 'expired']]) {
    assert.equal(snapshot(product(overrides)).heldProducts[0].reason, reason);
  }
});

test('snapshot validation rejects hidden fields, duplicate IDs, broken aliases and expired releases', () => {
  const good = JSON.parse(JSON.stringify(snapshot()));
  assert.throws(() => validateCatalogSnapshot({ ...good, secret: 'bad' }, now), /unexpected public field/);
  assert.throws(() => validatePublicCatalogProduct({ ...good.products[0], sourceFacts: {} }, now, true), /unexpected public field/);
  assert.throws(() => validateCatalogSnapshot({ ...good, products: [...good.products, ...good.products] }, now), /duplicate/);
  assert.throws(() => validateCatalogSnapshot({ ...good, slugHistory: [{ slug: 'old', canonicalSlug: 'missing', publicId: good.products[0].publicId }] }, now), /slug history/);
  assert.throws(() => validateCatalogSnapshot(good, new Date('2026-12-01T00:00:00.000Z')), /expired/);
  assert.deepEqual(good, JSON.parse(JSON.stringify(snapshot()))); // validation did not mutate caller data
});

test('fixture retailer links cannot enter an actual catalog release', () => {
  const good = JSON.parse(JSON.stringify(snapshot()));
  assert.throws(() => validateCatalogSnapshot({ ...good, dataKind: 'catalog' }, now), /display fields/);
});

test('safe held pages only retain non-expiring owned/licensed retailer links', () => {
  const p = product({ isActive: false }); const grants = rights(p);
  grants.affiliateUrl = { ...grants.affiliateUrl, basis: 'merchant', observedAt: now.toISOString(), expiresAt: '2026-10-19T13:00:00.000Z' };
  assert.equal('affiliateUrl' in snapshot(p, grants).heldProducts[0], false);
  assert.equal(snapshot(p).heldProducts[0].affiliateUrl, 'https://example.invalid/fixture');
});
