import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createStaticRoutes } from '../static-site/lib/asset-routes.ts';
import { createSiteWorker } from '../workers/site/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'static-site/out');
const input = path.join(root, 'build/stupid-gifts/catalog.snapshot.json');
const built = fs.existsSync(input) && fs.existsSync(path.join(output, 'index.html'));

test('actual exported HTML, RSC and JSON all become safe after expiry without database access', { skip: !built }, async () => {
  const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
  const inventory = fs.readdirSync(output, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => `/${path.relative(output, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')}`);
  const routes = createStaticRoutes(snapshot, inventory);
  let now = Date.parse(snapshot.generatedAt);
  const worker = createSiteWorker({ snapshot, manifest: { catalogRevision: snapshot.catalogRevision, routes }, now: () => now });
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
  assert.ok(timed.length > 0, 'This check requires a catalog with expiring content');
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
  now = Math.max(...timed.map(([, route]) => Date.parse(route.eligibleUntil))) + 1;
  const sitemap = await (await request('/sitemap.xml')).text();
  for (const product of snapshot.products) assert.equal(sitemap.includes(`/gifts/${product.slug}`), false);
  assert.equal(databaseReads, 0);
  assert.equal((await worker.fetch(new Request('https://staging.invalid/'), env)).status, 401);
});
