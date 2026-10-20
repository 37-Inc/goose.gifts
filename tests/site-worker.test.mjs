import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteWorker } from '../workers/site/index.ts';
import { createStaticFeedPlan } from '../workers/site/feed.ts';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const DEADLINE = new Date(NOW + 2400).toISOString();
const ready = (path, overrides = {}) => ({ assetPath: `${path === '/' ? '/index' : path}.html`, safeAssetPath: '/safe.html', eligibleUntil: DEADLINE, state: 'ready', ...overrides });
const product = (overrides = {}) => ({ id: 'asin-1', publicId: 'uuid-1', slug: 'fart-button', title: 'Funny Fart Button', description: 'An absurd button.', imageUrl: '/brand/button.svg', affiliateUrl: 'https://www.amazon.com/dp/B123456789?tag=test-20', source: 'amazon', currency: 'USD', price: 0, isActive: true, qualityScore: 0.8, eligibleUntil: DEADLINE, ...overrides });

function setup(overrides = {}) {
  let clock = NOW;
  const calls = [];
  const snapshot = { schemaVersion: 1, dataKind: 'synthetic_fixture', catalogRevision: 'r1', generatedAt: new Date(NOW).toISOString(), products: [product()], heldProducts: [], slugHistory: [{ slug: 'old-button', canonicalSlug: 'fart-button', publicId: 'uuid-1' }] };
  const routes = {
    '/': ready('/'), '/gifts': ready('/gifts'), '/gifts/page/2': ready('/gifts/page/2'),
    '/gifts/fart-button': ready('/gifts/fart-button'), '/gift-guides/office-pranks': ready('/gift-guides/office-pranks'),
    '/gifts/held': ready('/gifts/held', { state: 'held', eligibleUntil: null }),
    '/gifts/fart-button.txt': ready('/gifts/fart-button', { assetPath: '/gifts/fart-button.txt', safeAssetPath: '/safe.txt' }),
    '/catalog/feed-1.json': ready('/catalog/feed-1', { assetPath: '/catalog/feed-1.json', safeAssetPath: '/safe.json' }),
    '/random-gift': ready('/random-gift'),
    '/howie': ready('/howie', { indexable: false }),
  };
  const digest = 'a'.repeat(64);
  const manifest = { schemaVersion: 1, releaseId: 'test', codeSha: 'test', catalogRevision: 'r1', catalogSnapshotSha256: digest, generatedAt: snapshot.generatedAt, nextExpiry: DEADLINE, productCount: 1, slugCount: 1, vectorSyncWatermark: 1, priorReleaseId: null, checksums: {}, dataKind: snapshot.dataKind, routes };
  const env = { ENVIRONMENT: 'production', ASSETS: { async fetch(request) { calls.push(request); return new Response(new URL(request.url).pathname, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable', ETag: 'asset-tag', Age: '99' } }); } } };
  const worker = createSiteWorker({ manifest, snapshot, feedPlan: createStaticFeedPlan(snapshot, digest, NOW), now: () => clock, ...overrides });
  return { env, calls, worker, advance(ms) { clock += ms; }, request: (path, init) => worker.fetch(new Request(`https://preview.example${path}`, init), env) };
}

test('ready assets, aliases and cache lifetimes are guarded without database access', async () => {
  const fixture = setup();
  for (const path of ['/', '/gifts/fart-button', '/gifts/fart-button.html', '/gifts/fart-button.txt', '/catalog/feed-1.json']) {
    const response = await fixture.request(path, { headers: { 'If-None-Match': 'old' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Cache-Control'), /max-age=2, s-maxage=2, must-revalidate/);
    assert.equal(response.headers.get('Age'), null);
    assert.equal(fixture.calls.at(-1).headers.get('If-None-Match'), null);
  }
  fixture.advance(2400);
  for (const path of ['/', '/gifts/fart-button', '/gifts/fart-button.html', '/gifts/fart-button.txt', '/catalog/feed-1.json']) {
    const response = await fixture.request(path);
    assert.match(await response.text(), /^\/safe\./);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  }
});

test('held assets are safe and query roots are noindex', async () => {
  const fixture = setup();
  assert.equal(await (await fixture.request('/gifts/held')).text(), '/safe.html');
  assert.equal((await fixture.request('/?q=fart')).headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal((await fixture.request('/')).headers.get('X-Robots-Tag'), null);
  const neutral = await fixture.request('/howie');
  assert.equal(await neutral.text(), '/howie.html');
  assert.equal(neutral.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal(await (await fixture.request('/', { method: 'HEAD' })).text(), '');
});

test('expiry during an asset lookup replaces the body before responding', async () => {
  const fixture = setup();
  fixture.env.ASSETS.fetch = async (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/index.html') fixture.advance(2400);
    return new Response(path);
  };
  assert.equal(await (await fixture.request('/')).text(), '/safe.html');
});

test('sitemap excludes held and expired routes, with both maintained sitemap paths', async () => {
  const fixture = setup();
  for (const path of ['/sitemap.xml', '/sitemap/0.xml']) {
    const response = await fixture.request(path);
    const xml = await response.text();
    assert.match(xml, /https:\/\/preview.example\/<\/loc>/);
    assert.match(xml, /fart-button<\/loc>/);
    assert.doesNotMatch(xml, /held|howie|\.txt|\.json/);
    assert.match(response.headers.get('Cache-Control'), /max-age=2/);
  }
  fixture.advance(2400);
  assert.doesNotMatch(await (await fixture.request('/sitemap.xml')).text(), /<url>/);
});

test('explicit compatibility redirects preserve queries and reject pagination bounds', async () => {
  const fixture = setup();
  assert.equal((await fixture.request('/search?q=%20crab%20')).headers.get('Location'), '/?q=crab');
  assert.equal((await fixture.request('/search')).headers.get('Location'), '/');
  assert.equal((await fixture.request('/gifts/old-button?utm_source=show')).headers.get('Location'), '/gifts/fart-button?utm_source=show');
  assert.equal((await fixture.request('/gifts/old-button?utm_campaign=episode_2026_10_19&token=private&redirect=https://evil.test')).headers.get('Location'), '/gifts/fart-button?utm_campaign=episode_2026_10_19');
  assert.equal((await fixture.request('/gifts?page=2&utm_source=show')).headers.get('Location'), '/gifts/page/2?utm_source=show');
  assert.equal((await fixture.request('/gifts?page=1')).headers.get('Location'), '/gifts');
  for (const page of ['0', '-1', 'junk', '1.5', '1e2', 'Infinity', '1'.repeat(129)]) assert.equal((await fixture.request(`/gifts?page=${page}`)).status, 404);
  for (const page of ['3', '999999999999999999999999999999']) {
    assert.equal((await fixture.request(`/gifts?page=${page}`)).headers.get('Location'), '/gifts/page/2');
    assert.equal((await fixture.request(`/gifts/page/${page}`)).headers.get('Location'), '/gifts/page/2');
  }
  assert.equal((await fixture.request('/gifts/page/1?utm_source=show')).headers.get('Location'), '/gifts?utm_source=show');
  assert.equal((await fixture.request('/gifts/page/2')).status, 200);
});

test('retired, unknown HTML/data and missing routes never fall back to the homepage', async () => {
  const fixture = setup();
  for (const path of ['/old-gift-bundle', '/bundles/foo', '/admin', '/api/og/random-gift?gift=id', '/api/admin/products', '/random-gift?gift=id', '/gifts/missing', '/rogue.html', '/secret.json', '/_next/other.txt']) {
    assert.equal((await fixture.request(path)).status, 404, path);
  }
  assert.equal(fixture.calls.length, 0);
  assert.equal((await fixture.request('/_next/static/app.js')).status, 200);
});

test('timeless privacy companions and owned illustrations remain available', async () => {
  const fixture = setup();
  fixture.advance(2400);
  for (const path of ['/privacy', '/privacy.html', '/privacy.txt', '/privacy/__next._full.txt', '/illustrations/button.svg']) {
    assert.equal((await fixture.request(path)).status, 200, path);
  }
  assert.equal(new URL(fixture.calls[0].url).pathname, '/privacy.html');
});

test('POST feed preserves products/hasMore, bounds input, and fails clearly after expiry', async () => {
  const fixture = setup();
  const response = await fixture.request('/api/catalog-feed', { method: 'POST', body: JSON.stringify({ seed: 'test', limit: 1 }) });
  assert.deepEqual(Object.keys(await response.json()).sort(), ['hasMore', 'products']);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const excluded = await fixture.request('/api/catalog-feed', { method: 'POST', body: JSON.stringify({ excludeIds: ['asin-1', 'unknown-id'] }) });
  assert.deepEqual(await excluded.json(), { products: [], hasMore: false });
  assert.equal((await fixture.request('/api/catalog-feed', { method: 'POST', body: 'x'.repeat(64001) })).status, 413);
  assert.equal((await fixture.request('/api/catalog-feed')).status, 405);
  fixture.advance(2400);
  assert.equal((await fixture.request('/api/catalog-feed', { method: 'POST', body: '{}' })).status, 503);
});

test('missing or incompatible feed plans fail closed without affecting guarded browsing', async () => {
  for (const feedPlan of [undefined, {}, { schemaVersion: 1, catalogRevision: 'other', catalogSnapshotSha256: 'a'.repeat(64), entries: [] }]) {
    const fixture = setup({ feedPlan });
    assert.equal((await fixture.request('/api/catalog-feed', { method: 'POST', body: '{}' })).status, 503);
    assert.equal((await fixture.request('/')).status, 200);
  }
});

test('staging is fail-closed, protected, noindex and blocks production analytics transport', async () => {
  const fixture = setup();
  fixture.env.ENVIRONMENT = 'staging';
  assert.equal((await fixture.request('/')).status, 503);
  fixture.env.STAGING_AUTH_SECRET = 'test-secret-at-least-sixteen';
  assert.equal((await fixture.request('/')).status, 401);
  assert.equal(fixture.calls.length, 0);
  const response = await fixture.request('/', { headers: { Authorization: `Basic ${btoa('staging:test-secret-at-least-sixteen')}` } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.match(response.headers.get('Content-Security-Policy'), /connect-src 'self'/);
  assert.doesNotMatch(response.headers.get('Content-Security-Policy'), /google-analytics|posthog/);
});
