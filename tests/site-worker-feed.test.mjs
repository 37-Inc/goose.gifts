import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareStaticFeed } from '../workers/site/feed.ts';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const DEADLINE = NOW + 60_000;
const product = (id, type = 'gizmo', overrides = {}) => ({ id, publicId: `uuid-${id}`, slug: id, title: `Funny alpha${id} beta${id} ${type}`, description: 'An absurd object.', imageUrl: '/brand/object.svg', affiliateUrl: 'https://www.amazon.com/dp/B123456789?tag=test-20', source: 'amazon', currency: 'USD', price: 0, isActive: true, qualityScore: 0.8, eligibleUntil: new Date(DEADLINE).toISOString(), ...overrides });
const select = (feed, seed = 'daily', limit = 24, excluded = []) => feed.select(seed, limit, new Set(excluded), NOW);

test('prepared feed keeps quality/eligibility and one stable representative per family', () => {
  const good = product('good');
  const feed = prepareStaticFeed([
    product('weak', 'gizmo', { qualityScore: 0.3 }), product('inactive', 'gizmo', { isActive: false }),
    product('expired', 'gizmo', { eligibleUntil: new Date(NOW).toISOString() }),
    product('generic', 'gizmo', { title: 'Generic plain object' }),
    product('worse-variant', 'gizmo', { title: `${good.title} blue`, qualityScore: 0.7 }), good,
  ], NOW);
  assert.deepEqual(select(feed).products.map(({ id }) => id), ['good']);
  assert.equal(select(feed).hasMore, false);
  assert.equal(select(feed, 'daily', 24, ['not-in-pool']).hasMore, false);
  assert.deepEqual(select(feed, 'daily', 24, ['good']).products, []);
});

test('seed rotation is deterministic and preserves the ranked tail beyond the leading window', () => {
  const products = Array.from({ length: 40 }, (_, index) => product(String(index).padStart(3, '0')));
  const feed = prepareStaticFeed(products, NOW);
  const first = select(feed, 'one', 36);
  assert.deepEqual(select(feed, 'one', 36), first);
  assert.notDeepEqual(select(feed, 'two', 36).products.slice(0, 12), first.products.slice(0, 12));
  assert.deepEqual(first.products.slice(12).map(({ id }) => id), products.slice(12, 36).map(({ id }) => id));
  assert.equal(first.hasMore, true);
  const higherQuality = prepareStaticFeed([product('low', 'hat', { qualityScore: 0.55 }), product('high', 'mug', { qualityScore: 1 })], NOW);
  assert.equal(select(higherQuality, 'daily', 1).products[0].id, 'high');
});

test('type diversity is bounded while hasMore includes variants deferred to the next page', () => {
  const products = Array.from({ length: 10 }, (_, index) => product(`m${index}`, 'mug'));
  const feed = prepareStaticFeed(products, NOW);
  const first = select(feed, 'daily', 36);
  assert.equal(first.products.length, 4);
  assert.equal(first.hasMore, true);
  const second = select(feed, 'daily', 36, first.products.map(({ id }) => id));
  assert.equal(second.products.length, 4);
  assert.equal(second.hasMore, true);
  const excluded = [...first.products, ...second.products].map(({ id }) => id);
  const last = select(feed, 'daily', 36, [...excluded, 'unknown']);
  assert.equal(last.products.length, 2);
  assert.equal(last.hasMore, false);
});

test('selection work is bounded by exclusions + limit + at most eight queue heads', () => {
  const types = ['gizmo', 'mug', 'socks', 'desk sign', 'candle', 't shirt', 'hat', 'keychain'];
  const products = Array.from({ length: 3180 }, (_, index) => product(`x${String(index).padStart(4, '0')}`, types[index % types.length]));
  const feed = prepareStaticFeed(products, NOW);
  const excluded = products.slice(0, 1200).map(({ id }) => id);
  for (let index = 0; index < 100; index++) {
    const result = select(feed, `arbitrary-${index}`, 36, excluded);
    assert.ok(result.inspected <= excluded.length + 36 + 8, `${result.inspected} inspections`);
    assert.equal(result.products.length, 36);
    assert.equal(result.hasMore, true);
    assert.ok(result.products.every(({ id }) => !excluded.includes(id)));
  }
});

test('prepared feed fails closed at the earliest existing content deadline', () => {
  const feed = prepareStaticFeed([product('soon'), product('later', 'gizmo', { eligibleUntil: new Date(DEADLINE + 60_000).toISOString() })], NOW);
  assert.ok(feed.select('daily', 24, new Set(), DEADLINE - 1));
  assert.equal(feed.select('daily', 24, new Set(), DEADLINE), null);
  assert.deepEqual(select(prepareStaticFeed([], NOW)).products, []);
});
