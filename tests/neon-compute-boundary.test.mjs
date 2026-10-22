import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('product views stay in client analytics instead of waking Neon', async () => {
  const [grid, button] = await Promise.all([
    readSource('../components/ProductGrid.tsx'),
    readSource('../components/ProductClickButton.tsx'),
  ]);

  assert.match(grid, /captureViewItemList/);
  assert.doesNotMatch(grid, /\/api\/track-impression/);
  assert.doesNotMatch(button, /\/api\/track-impression/);
  await assert.rejects(
    access(new URL('../app/api/track-impression/route.ts', import.meta.url)),
    { code: 'ENOENT' }
  );
});

test('public catalog reads share the one-day cache policy', async () => {
  const [policy, homepage, giftPages, randomGift, giftGuides, sitemap] = await Promise.all([
    readSource('../lib/catalog-cache-policy.ts'),
    readSource('../lib/db/operations.ts'),
    readSource('../lib/db/gift-pages.ts'),
    readSource('../lib/db/random-gift.ts'),
    readSource('../lib/gift-guides.ts'),
    readSource('../app/sitemap.ts'),
  ]);

  assert.match(policy, /PUBLIC_CATALOG_CACHE_SECONDS = 86_400/);
  for (const source of [homepage, giftPages, randomGift, giftGuides]) {
    assert.match(source, /PUBLIC_CATALOG_CACHE_SECONDS/);
  }
  assert.match(giftGuides, /unstable_cache\([\s\S]*tags: \['catalog-products'\]/);
  assert.match(sitemap, /export const revalidate = 86_400/);
});

test('raw database search diagnostics are retired while product clicks keep the explicit provider adapter', async () => {
  const [grid, button, searchRoute] = await Promise.all([
    readSource('../components/ProductGrid.tsx'),
    readSource('../components/ProductClickButton.tsx'),
    readSource('../app/api/search-products/route.ts'),
  ]);

  for (const source of [grid, button]) {
    assert.match(source, /captureSelectItem/);
    assert.match(source, /captureOutboundProductClick/);
    assert.doesNotMatch(source, /\/api\/track-click/);
  }
  await assert.rejects(access(new URL('../app/api/track-click/route.ts', import.meta.url)), { code: 'ENOENT' });
  assert.match(searchRoute, /searchCatalogProducts\(query, limit\)/);
  assert.doesNotMatch(searchRoute, /searchQueries|db\.insert|@\/lib\/db['"]/);
});

async function searchHandler(searchCatalogProducts) {
  const source = await readSource('../app/api/search-products/route.ts');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } });
  const commonJs = { exports: {} };
  const dependencies = [], errors = [];
  // Execute the actual handler body. The only application capability is the
  // stubbed search function: importing a DB client or any other dependency fails.
  vm.runInNewContext(outputText, {
    module: commonJs, exports: commonJs.exports,
    console: { error: (...args) => errors.push(args) },
    require(name) {
      dependencies.push(name);
      if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      if (name === '@/lib/db/product-search') return { searchCatalogProducts };
      throw new Error(`Unexpected persistence/runtime dependency: ${name}`);
    },
  });
  assert.deepEqual(dependencies, ['next/server', '@/lib/db/product-search']);
  return { get: commonJs.exports.GET, errors };
}
const searchRequest = (query, limit) => ({ nextUrl: new URL(`https://example.invalid/api/search-products?${new URLSearchParams({
  q: query, ...(limit === undefined ? {} : { limit }),
})}`) });

test('actual nonempty search handler preserves results, trimming and limits with no persistence capability', async () => {
  const calls = [], results = [{ id: 'test-only-product', title: 'Test crab', similarity: 0.8 }];
  const handler = await searchHandler(async (...args) => { calls.push(args); return results; });
  for (const [limit, expected] of [[undefined, 36], ['invalid', 36], ['0', 1], ['-7', 1], ['100', 60], ['5', 5], ['2.5', 2]]) {
    const response = await handler.get(searchRequest('  desk  crab  ', limit));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { searchId: null, results });
    assert.deepEqual(calls.at(-1), ['desk  crab', expected]);
  }
  assert.equal(calls.length, 7); assert.deepEqual(handler.errors, []);
});

test('actual empty and short search requests make no search or persistence call', async () => {
  const handler = await searchHandler(async () => { throw new Error('Short query must not search'); });
  for (const query of ['', ' ', 'x', ' x ']) {
    const response = await handler.get(searchRequest(query));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { results: [], searchId: null });
  }
  assert.deepEqual(handler.errors, []);
  const empty = await searchHandler(async () => []);
  assert.deepEqual(await (await empty.get(searchRequest('no matches'))).json(), { searchId: null, results: [] });
});

test('actual search failure keeps the existing error response without persistence', async () => {
  const failure = new Error('Test-only search failure');
  const handler = await searchHandler(async () => { throw failure; });
  const response = await handler.get(searchRequest('desk crab'));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Search failed' });
  assert.deepEqual(handler.errors, [['Product search API error:', failure]]);
});

test('obsolete admin reports are retired while the bearer-authenticated catalog cache remains', async () => {
  for (const path of ['admin/layout.tsx', 'api/admin/products/route.ts', 'api/admin/stats/route.ts', 'api/admin/auth/login/route.ts']) {
    await assert.rejects(access(new URL(`../app/${path}`, import.meta.url)), { code: 'ENOENT' });
  }
  assert.match(await readSource('../app/api/admin/catalog-cache/route.ts'), /hasValidCatalogCacheSecret/);
});

test('retired gift-ID shares cannot bypass the cached random pool', async () => {
  const [page, storage, preview] = await Promise.all([
    readSource('../app/random-gift/page.tsx'),
    readSource('../lib/db/random-gift.ts'),
    readSource('../app/api/og/random-gift/route.tsx'),
  ]);
  for (const source of [page, storage, preview]) {
    assert.doesNotMatch(source, /getProductById/);
  }
  assert.match(page, /export const metadata: Metadata/);
  assert.doesNotMatch(page, /params\.gift|random-gift\?gift=/);
  assert.match(page, /if \('gift' in params\) notFound\(\)/);
  assert.match(page, /const sharePath = getGiftPath\(product\.slug\)/);
  assert.match(storage, /Boolean\(product\.slug\) && isCatalogDisplayEligibleProduct/);
  assert.match(preview, /searchParams\.has\('gift'\)[\s\S]*status: 404/);
  assert.match(preview, /await getGiftPageBySlug\(slug\)/);
});
