import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  catalogCacheBearerToken,
  hasValidCatalogCacheSecret,
} from '../lib/catalog-cache-auth.ts';
import {
  canonicalCatalogSiteUrl,
  invalidateCatalogCaches,
} from '../scripts/ops/catalog-cache-invalidation.mjs';

test('catalog cache endpoint authentication is exact and bearer-only', () => {
  assert.equal(catalogCacheBearerToken('Bearer exact-secret'), 'exact-secret');
  assert.equal(catalogCacheBearerToken('Basic exact-secret'), null);
  assert.equal(hasValidCatalogCacheSecret('exact-secret', 'exact-secret'), true);
  assert.equal(hasValidCatalogCacheSecret('wrong-secret', 'exact-secret'), false);
  assert.equal(hasValidCatalogCacheSecret(null, 'exact-secret'), false);
  assert.equal(hasValidCatalogCacheSecret('exact-secret', undefined), false);
});

test('catalog jobs request one authenticated public cache invalidation', async () => {
  let request;
  const result = await invalidateCatalogCaches({
    secret: 'exact-secret',
    siteUrl: 'https://www.goose.gifts/',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, revalidated: ['/sitemap.xml'] }),
      };
    },
  });

  assert.equal(request.url, 'https://www.goose.gifts/api/admin/catalog-cache');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer exact-secret');
  assert.deepEqual(result, { ok: true, status: 200, revalidated: ['/sitemap.xml'] });
});

test('catalog invalidation resolves the configured apex to the canonical host before auth', () => {
  assert.equal(canonicalCatalogSiteUrl('https://goose.gifts/'), 'https://www.goose.gifts');
  assert.equal(canonicalCatalogSiteUrl('https://www.goose.gifts/path?q=ignored'), 'https://www.goose.gifts');
});

test('catalog cache invalidation stays observable when configuration or delivery fails', async () => {
  assert.deepEqual(await invalidateCatalogCaches({ secret: '' }), {
    ok: false,
    reason: 'cache_revalidation_not_configured',
  });
  assert.deepEqual(await invalidateCatalogCaches({
    secret: 'exact-secret',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    }),
  }), {
    ok: false,
    reason: 'cache_revalidation_failed',
    status: 503,
  });
});

test('cache invalidation covers every crawler-facing catalog surface', () => {
  const route = fs.readFileSync(
    new URL('../app/api/admin/catalog-cache/route.ts', import.meta.url),
    'utf8'
  );
  assert.match(route, /revalidateTag\('catalog-products', 'max'\)/);
  assert.match(route, /revalidateTag\('gift-pages', 'max'\)/);
  assert.match(route, /revalidatePath\('\/gifts\/\[slug\]', 'page'\)/);
  assert.match(route, /revalidatePath\('\/sitemap\.xml'\)/);
});
