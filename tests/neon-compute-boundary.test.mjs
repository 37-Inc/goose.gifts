import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

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
  const [policy, homepage, giftPages, randomGift, giftGuides, weirdIndex, sitemap] = await Promise.all([
    readSource('../lib/catalog-cache-policy.ts'),
    readSource('../lib/db/operations.ts'),
    readSource('../lib/db/gift-pages.ts'),
    readSource('../lib/db/random-gift.ts'),
    readSource('../lib/gift-guides.ts'),
    readSource('../lib/weird-gift-index.ts'),
    readSource('../app/sitemap.ts'),
  ]);

  assert.match(policy, /PUBLIC_CATALOG_CACHE_SECONDS = 86_400/);
  for (const source of [homepage, giftPages, randomGift, giftGuides, weirdIndex]) {
    assert.match(source, /PUBLIC_CATALOG_CACHE_SECONDS/);
  }
  assert.match(giftGuides, /unstable_cache\([\s\S]*tags: \['catalog-products'\]/);
  assert.match(weirdIndex, /tags: \['catalog-products', 'weird-gift-index'\]/);
  assert.match(sitemap, /export const revalidate = 86_400/);
});

test('meaningful searches and clicks still use the database', async () => {
  const [clickRoute, searchRoute] = await Promise.all([
    readSource('../app/api/track-click/route.ts'),
    readSource('../app/api/search-products/route.ts'),
  ]);

  assert.match(clickRoute, /db\s*\.update\(products\)/);
  assert.match(clickRoute, /db\.insert\(productClicks\)/);
  assert.match(searchRoute, /searchCatalogProducts\(query, limit\)/);
  assert.match(searchRoute, /db\.insert\(searchQueries\)/);
});
