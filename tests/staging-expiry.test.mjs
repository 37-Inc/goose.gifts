import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createSiteWorker } from '../workers/site/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'static-site/out');
const input = path.join(root, 'build/stupid-gifts/catalog.snapshot.json');
const built = fs.existsSync(input) && fs.existsSync(path.join(output, 'index.html'));

test('actual finite exports expire safely while cleared permanent pages survive, without database access', { skip: !built }, async () => {
  const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
  // Exercise the actual sealed policies, including production OG identity and
  // compacted RSC aliases, not a second default-preview route reconstruction.
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build/stupid-gifts/asset-manifest.json'), 'utf8'));
  const {routes} = manifest;
  let now = Date.parse(snapshot.generatedAt);
  const worker = createSiteWorker({ snapshot, manifest, now: () => now });
  const secret = 'synthetic-test-secret-not-a-provider-credential';
  let databaseReads = 0;
  const env = {
    ENVIRONMENT: 'staging',
    STAGING_AUTH_SECRET: secret,
    get DB() { databaseReads++; throw new Error('Static requests must not read D1'); },
    ASSETS: {
      async fetch(request) {
        const file = path.join(output, new URL(request.url).pathname);
        return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('Not found', { status: 404 });
      },
    },
  };
  const headers = { Authorization: `Basic ${btoa(`staging:${secret}`)}`, 'If-None-Match': '"previous-release"' };
  const request = pathname => worker.fetch(new Request(`https://staging.invalid${pathname}`, { headers }), env);
  const timed = Object.entries(routes).filter(([, route]) => route.eligibleUntil !== null);
  assert.ok(timed.length > 0 || snapshot.products.every(p => p.eligibleUntil === null),
    'Finite products must have timed route policies; permanent catalogs need no invented expiry');
  for (const [pathname, route] of timed) {
    now = Date.parse(route.eligibleUntil);
    let response = await request(pathname);
    if (response.status === 308) {
      const target = response.headers.get('Location');
      assert.ok(target && routes[target], `Redirect stays on a guarded route: ${pathname}`);
      response = await request(target);
    }
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store', pathname);
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/, pathname);
    const body = await response.text();
    assert.equal(body, fs.readFileSync(path.join(output, route.safeAssetPath), 'utf8'), pathname);
    for (const product of snapshot.products) {
      assert.equal(body.includes(product.imageUrl), false, `Expired image on ${pathname}`);
      assert.equal(body.includes(product.affiliateUrl), false, `Expired merchant link on ${pathname}`);
    }
  }
  now = Math.max(Date.parse(snapshot.generatedAt) + 2 * 86400000,
    ...timed.map(([, route]) => Date.parse(route.eligibleUntil) + 1));
  const sitemap = await (await request('/sitemap.xml')).text();
  for (const product of snapshot.products.filter(p => p.eligibleUntil !== null))
    assert.equal(sitemap.includes(`/gifts/${product.slug}`), false);
  const permanent = snapshot.products.filter(p => p.eligibleUntil === null);
  for (const product of [permanent[0], permanent[Math.floor(permanent.length / 2)], permanent.at(-1)].filter(Boolean)) {
    const route = routes[`/gifts/${product.slug}`];
    assert.equal(route.eligibleUntil, null);
    const response = await request(`/gifts/${product.slug}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), fs.readFileSync(path.join(output, route.assetPath), 'utf8'));
  }
  assert.equal(databaseReads, 0);
  assert.equal((await worker.fetch(new Request('https://staging.invalid/'), env)).status, 401);
});
