import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assembleReleaseAssets, verifyRetainedAssets } from '../scripts/staging/retention.mts';
import { createBrowseRelease } from '../static-site/lib/browse.ts';
import { createOgRelease } from '../static-site/lib/og.ts';
import { guides } from '../static-site/lib/guides.ts';
import { siteIdentityFor } from '../static-site/lib/site-identity.ts';
import { assetSha256 } from '../static-site/lib/retention.ts';
import { createSiteWorker } from '../workers/site/index.ts';

// Policy proof only. Actual browser hydration/network receipts are separate.
const encode = text => new TextEncoder().encode(text);
function fixture() {
  const snapshot = JSON.parse(fs.readFileSync(new URL('../static-site/fixtures/catalog.snapshot.json', import.meta.url)));
  snapshot.heldProducts = []; snapshot.slugHistory = [];
  const context = { sourceMode: 'preview', priorReleaseId: null, retainedManifestSha256: null, generatedAt: snapshot.generatedAt };
  const pages = ['/', '/random-gift', '/gift-guides', '/howie', '/preview/presentation',
    ...guides.map(g => `/gift-guides/${g.slug}`), ...snapshot.products.map(p => `/gifts/${p.slug}`)];
  const assets = new Map(pages.map(p => [p === '/' ? '/index.html' : `${p}.html`, encode('original HTML')]));
  for (const p of ['/safe/catalog.html', '/safe/product.html', '/safe/howie.html', '/safe/presentation.html', '/safe/catalog.txt', '/safe/product.txt']) assets.set(p, encode('safe fallback'));
  assets.set('/safe/catalog.json', encode('{}'));
  for (const shard of createBrowseRelease(snapshot).shards) assets.set(shard.path, encode(JSON.stringify(shard.payload)));
  for (const p of createOgRelease(snapshot, siteIdentityFor('preview')).byPath.keys()) assets.set(p, encode('PNG'));
  return { snapshot, context, assets };
}
function sealed(f, compact, flight) {
  const assets = new Map(f.assets);
  if (flight) for (const p of ['/index.txt', '/__next._full.txt']) assets.set(p, encode('same Flight bytes'));
  const built = assembleReleaseAssets(f.snapshot, assets, f.context, null, compact);
  const manifest = { catalogRevision: f.snapshot.catalogRevision, routes: built.routes, retention: built.retention,
    checksums: Object.fromEntries([...built.assets].map(([p,b]) => [p, assetSha256(b)])),
    ...(compact ? { assetAliases: built.assetAliases } : {}) };
  return { ...built, manifest };
}
test('HTML-only, historical unaliased and aliased packages all retain independent mandatory route verification', () => {
  const f = fixture();
  for (const [compact, flight] of [[true,false], [false,true], [true,true]]) {
    const release = sealed(f, compact, flight);
    assert.doesNotThrow(() => verifyRetainedAssets(f.snapshot, release.assets, release.manifest, f.context, null));
    const missing = new Map(release.assets); missing.delete('/index.html');
    assert.throws(() => verifyRetainedAssets(f.snapshot, missing, release.manifest, f.context, null));
    const wrongPolicy = structuredClone(release.manifest); wrongPolicy.routes['/'].safeAssetPath = '/safe/product.html';
    assert.throws(() => verifyRetainedAssets(f.snapshot, release.assets, wrongPolicy, f.context, null));
    const wrongAlias = structuredClone(release.manifest); wrongAlias.assetAliases = { '/invented.txt': '/missing.txt' };
    assert.throws(() => verifyRetainedAssets(f.snapshot, release.assets, wrongAlias, f.context, null));
  }
});
test('HTML-only Worker still switches finite pages to their bound safe fallback', async () => {
  const f = fixture(), release = sealed(f, true, false);
  release.manifest.routes['/'].eligibleUntil = '2026-01-01T00:00:00.000Z';
  const worker = createSiteWorker({ manifest: release.manifest, snapshot: f.snapshot, now: () => Date.parse('2026-10-26T00:00:00Z') });
  const response = await worker.fetch(new Request('https://local.invalid/'), { ENVIRONMENT: 'production', ASSETS: { async fetch(request) {
    return new Response(release.assets.get(new URL(request.url).pathname));
  } } });
  assert.equal(await response.text(), 'safe fallback');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
});
