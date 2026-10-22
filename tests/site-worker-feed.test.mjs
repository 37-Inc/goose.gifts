import assert from 'node:assert/strict';
import test from 'node:test';
import { createStaticFeedPlan, prepareStaticFeed } from '../workers/site/feed.ts';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const DEADLINE = NOW + 60_000;
const product = (id, type = 'gizmo', overrides = {}) => ({ id, publicId: `uuid-${id}`, slug: id, title: `Funny alpha${id} beta${id} ${type}`, description: 'An absurd object.', imageUrl: '/brand/object.svg', affiliateUrl: 'https://www.amazon.com/dp/B123456789?tag=test-20', source: 'amazon', currency: 'USD', price: 0, isActive: true, qualityScore: 0.8, eligibleUntil: new Date(DEADLINE).toISOString(), ...overrides });
const DIGEST = 'a'.repeat(64);
const snapshot = (products) => ({ schemaVersion: 1, dataKind: 'synthetic_fixture', catalogRevision: 'r1', generatedAt: new Date(NOW).toISOString(), products, heldProducts: [], slugHistory: [] });
function prepared(products) {
  const catalog = snapshot(products);
  return prepareStaticFeed(catalog, createStaticFeedPlan(catalog, DIGEST, NOW), DIGEST);
}
const select = (feed, seed = 'daily', limit = 24, excluded = []) => feed.select(seed, limit, new Set(excluded), NOW);

test('persistent feed keeps exact identities and cleared bytes before/after supplier expiry',()=>{
  const base=product('base','gizmo',{title:'Independent desk object',eligibleUntil:null,indexable:false});
  const outer={...base,title:'SUPPLIER ONLY PHOTO TITLE',imageUrl:'https://example.invalid/supplier.jpg',eligibleUntil:new Date(DEADLINE).toISOString(),persistent:base};
  const feed=prepared([outer,product('legacy')]);
  for(const clock of [NOW,DEADLINE,DEADLINE+40*86400_000]){
    const result=feed.select('daily',24,new Set(),clock);
    assert.ok(result.products.some(p=>p.id==='base'));assert.deepEqual(result.products.find(p=>p.id==='base'),base);
    assert.doesNotMatch(JSON.stringify(result),/SUPPLIER|supplier\.jpg|persistent/);
    if(clock>=DEADLINE)assert.deepEqual(result.products,[base]);
  }
  assert.deepEqual(feed.select('daily',24,new Set(['base','legacy']),DEADLINE).products,[]);
});

test('prepared feed keeps quality/eligibility and one stable representative per family', () => {
  const good = product('good');
  const feed = prepared([
    product('weak', 'gizmo', { qualityScore: 0.3 }), product('inactive', 'gizmo', { isActive: false }),
    product('generic', 'gizmo', { title: 'Generic plain object' }),
    product('worse-variant', 'gizmo', { title: `${good.title} blue`, qualityScore: 0.7 }), good,
  ]);
  assert.deepEqual(select(feed).products.map(({ id }) => id), ['good']);
  assert.equal(select(feed).hasMore, false);
  assert.equal(select(feed, 'daily', 24, ['not-in-pool']).hasMore, false);
  assert.deepEqual(select(feed, 'daily', 24, ['good']).products, []);
});

test('seed rotation is deterministic and preserves the ranked tail beyond the leading window', () => {
  const products = Array.from({ length: 40 }, (_, index) => product(String(index).padStart(3, '0')));
  const feed = prepared(products);
  const first = select(feed, 'one', 36);
  assert.deepEqual(select(feed, 'one', 36), first);
  assert.notDeepEqual(select(feed, 'two', 36).products.slice(0, 12), first.products.slice(0, 12));
  assert.deepEqual(first.products.slice(12).map(({ id }) => id), products.slice(12, 36).map(({ id }) => id));
  assert.equal(first.hasMore, true);
  const higherQuality = prepared([product('low', 'hat', { qualityScore: 0.55 }), product('high', 'mug', { qualityScore: 1 })]);
  assert.equal(select(higherQuality, 'daily', 1).products[0].id, 'high');
});

test('type diversity is bounded while hasMore includes variants deferred to the next page', () => {
  const products = Array.from({ length: 10 }, (_, index) => product(`m${index}`, 'mug'));
  const feed = prepared(products);
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
  const feed = prepared(products);
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
  const feed = prepared([product('soon'), product('later', 'gizmo', { eligibleUntil: new Date(DEADLINE + 60_000).toISOString() })]);
  assert.ok(feed.select('daily', 24, new Set(), DEADLINE - 1));
  assert.equal(feed.select('daily', 24, new Set(), DEADLINE), null);
  assert.deepEqual(select(prepared([])).products, []);
});

test('plan bytes contain only revision/digest and ranked index/type tuples, and runtime never reads titles', () => {
  const catalog = snapshot([product('first'), product('mug', 'mug')]);
  const plan = createStaticFeedPlan(catalog, DIGEST, NOW);
  assert.deepEqual(Object.keys(plan).sort(), ['catalogRevision', 'catalogSnapshotSha256', 'entries', 'schemaVersion']);
  assert.equal(plan.entries.length, 2);
  assert.ok(plan.entries.every(([index, type]) => Number.isInteger(index) && [0, 1].includes(type)));
  assert.doesNotMatch(JSON.stringify(plan), /Funny|amazon|uuid|imageUrl/);
  for (const item of catalog.products) Object.defineProperty(item, 'title', { get() { throw new Error('runtime_title_read'); } });
  const feed = prepareStaticFeed(catalog, plan, DIGEST);
  assert.equal(select(feed).products.length, 2);
});

test('runtime refuses wrong revisions/digests, duplicate or invalid indices and unknown type codes', () => {
  const catalog = snapshot([product('first'), product('second')]);
  const plan = createStaticFeedPlan(catalog, DIGEST, NOW);
  for (const invalid of [null, [], {}, { ...plan, schemaVersion: 2 }, { ...plan, catalogRevision: 'r2' },
    { ...plan, catalogSnapshotSha256: 'b'.repeat(64) }, { ...plan, entries: [[0, 0], [0, 0]] },
    { ...plan, entries: [[2, 0]] }, { ...plan, entries: [[-1, 0]] }, { ...plan, entries: [[0.5, 0]] },
    { ...plan, entries: [[0, 8]] }, { ...plan, entries: [[0, -1]] }, { ...plan, entries: [[0, 0, 1]] }]) {
    assert.equal(prepareStaticFeed(catalog, invalid, DIGEST), null);
  }
  assert.equal(prepareStaticFeed(catalog, plan, undefined), null);
  assert.throws(() => createStaticFeedPlan(catalog, 'invalid', NOW), /digest/);
});

test('an expired-all plan cannot turn the original catalog into a successful empty response', () => {
  const catalog = snapshot([product('expired', 'gizmo', { eligibleUntil: new Date(NOW - 1).toISOString() })]);
  const plan = createStaticFeedPlan(catalog, DIGEST, NOW);
  assert.deepEqual(plan.entries, []);
  const feed = prepareStaticFeed(catalog, plan, DIGEST);
  assert.equal(select(feed), null);
});

test('default build-plan time replays identically from December into January', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-12-31T23:00:00Z') });
  const catalog = snapshot([product('calendar', 'gizmo', { title: 'Funny 2026 Calendar', eligibleUntil: '2027-01-01T22:00:00.000Z' })]);
  catalog.generatedAt = '2026-12-31T23:00:00.000Z';
  const plan = createStaticFeedPlan(catalog, DIGEST);
  assert.equal(plan.entries.length, 1);
  context.mock.timers.setTime(Date.parse('2027-01-01T01:00:00Z'));
  assert.deepEqual(createStaticFeedPlan(catalog, DIGEST), plan);
});
