import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteWorker } from '../workers/site/index.ts';

function fixture({ sealed = true, assetStatus = 200, throws = false } = {}) {
  const calls = [];
  const snapshot = { schemaVersion: 1, dataKind: 'synthetic_fixture', catalogRevision: '404-proof', generatedAt: '2026-10-26T00:00:00Z', products: [], heldProducts: [], slugHistory: [] };
  const manifest = { catalogRevision: snapshot.catalogRevision, routes: {}, checksums: sealed ? { '/404.html': 'a'.repeat(64) } : {} };
  const worker = createSiteWorker({ manifest, snapshot, canonicalOrigin: 'https://stupid.gifts' });
  const env = { ENVIRONMENT: 'production', ASSETS: { async fetch(request) {
    calls.push(new URL(request.url).pathname);
    if (throws) throw Error('missing');
    return new Response('<h1>Gift not found</h1><a href="/">Browse gifts</a>', { status: assetStatus, headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=31536000', ETag: 'old', Age: '12',
    } });
  } } };
  return { calls, env, request: (path, init = {}, origin = 'https://stupid.gifts') => worker.fetch(new Request(origin + path, init), env) };
}
test('sealed error document serves native HTML navigation with real 404 and no caching/indexing', async () => {
  const f = fixture();
  for (const path of ['/gifts', '/gifts/missing', '/unknown', '/weird-gift-index']) {
    const response = await f.request(path, { headers: { Accept: 'text/html,application/xhtml+xml', 'Sec-Fetch-Dest': 'document' } });
    assert.equal(response.status, 404); assert.match(await response.text(), /Gift not found/);
    assert.match(response.headers.get('Content-Type'), /^text\/html/);
    for (const header of ['Cache-Control', 'Cloudflare-CDN-Cache-Control', 'CDN-Cache-Control']) assert.equal(response.headers.get(header), 'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    for (const header of ['ETag', 'Age', 'Location']) assert.equal(response.headers.get(header), null);
  }
  const head = await f.request('/gifts', { method: 'HEAD', headers: { Accept: 'text/html' } });
  assert.equal(head.status, 404); assert.equal(await head.text(), '');
  assert.deepEqual(f.calls, Array(5).fill('/404.html'));
});
test('API, assets, malformed paths, writes, RSC and unaccepted representations remain JSON', async () => {
  for (const [path, init] of [
    ['/api/missing', {}], ['/api', {}], ['/api/admin/products', {}], ['/og/missing', {}], ['/safe/missing', {}], ['/gifts.txt', {}], ['/gifts/missing.png', {}],
    ['/gifts/%2fhidden', {}], ['/gifts/%00', {}], ['/gifts/%ZZ', {}], ['/gifts', { method: 'POST' }],
    ['/gifts', { headers: { Accept: 'application/json' } }], ['/gifts', { headers: { Accept: '*/*' } }],
    ['/gifts', { headers: { Accept: 'text/html;q=0,*/*;q=1' } }],
    ['/gifts', { headers: { Accept: 'text/html', RSC: '1' } }],
    ['/gifts', { headers: { Accept: 'text/html', 'Next-Router-Prefetch': '1' } }],
    ['/gifts', { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'script' } }],
  ]) {
    const f = fixture(), response = await f.request(path, { headers: { Accept: 'text/html' }, ...init });
    assert.equal(response.status, 404, path); assert.match(response.headers.get('Content-Type'), /application\/json/);
    assert.equal(f.calls.length, 0);
  }
  for (const origin of ['https://evil.invalid', 'https://www.stupid.gifts']) {
    const f = fixture(), response = await f.request('/gifts', { headers: { Accept: 'text/html' } }, origin);
    assert.equal(response.status, 404); assert.match(response.headers.get('Content-Type'), /application\/json/); assert.equal(f.calls.length, 0);
  }
});
test('missing/unavailable error asset falls back safely; staging auth still runs first', async () => {
  for (const options of [{ sealed: false }, { assetStatus: 404 }, { throws: true }]) {
    const f = fixture(options), response = await f.request('/gifts', { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'Not found' });
  }
  const f = fixture(); f.env.ENVIRONMENT = 'staging'; f.env.STAGING_AUTH_SECRET = 'synthetic-local-only';
  const denied = await f.request('/gifts', { headers: { Accept: 'text/html' } });
  assert.equal(denied.status, 401); assert.equal(f.calls.length, 0);
  const response = await f.request('/gifts', { headers: { Accept: 'text/html', Authorization: `Basic ${btoa('staging:synthetic-local-only')}` } });
  assert.equal(response.status, 404); assert.match(await response.text(), /Gift not found/);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
