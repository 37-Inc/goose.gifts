import assert from 'node:assert/strict';
import test from 'node:test';

import {
  amazonAffiliateUrl,
  deduplicateAgainstCatalog,
  deduplicateCandidates,
  parseArgs,
  revalidatedProduct,
  selectRotatingThemes,
  titleSimilarity,
} from '../scripts/ops/prefetch-catalog.mjs';

test('daily theme selection rotates deterministically across the full pool', () => {
  const themes = Array.from({ length: 12 }, (_, index) => `theme-${index}`);
  const first = selectRotatingThemes(themes, 6, new Date('2026-07-14T01:00:00Z'));
  const sameDay = selectRotatingThemes(themes, 6, new Date('2026-07-14T23:00:00Z'));
  const nextDay = selectRotatingThemes(themes, 6, new Date('2026-07-15T12:00:00Z'));

  assert.deepEqual(first, sameDay);
  assert.equal(new Set([...first, ...nextDay]).size, 12);
});

test('near-identical discovery titles are filtered while distinct products remain', () => {
  const products = [
    { id: 'B000000001', title: 'Dad Bag Belly Fanny Pack Funny Beer Belly Waist Pack' },
    { id: 'B000000002', title: 'Funny Dad Bag Belly Fanny Pack Beer Belly Waist Pack Gift' },
    { id: 'B000000003', title: 'Desktop Mini Wacky Waving Inflatable Tube Guy' },
  ];

  assert.ok(titleSimilarity(products[0].title, products[1].title) >= 0.82);
  const result = deduplicateCandidates(products);
  assert.deepEqual(result.products.map((product) => product.id), ['B000000001', 'B000000003']);
  assert.equal(result.duplicates, 1);
});

test('a different ASIN duplicating the active catalog is filtered without blocking an update', () => {
  const catalog = [{ id: 'B000000001', title: 'Dad Bag Belly Fanny Pack Funny Beer Belly Waist Pack' }];
  const discoveries = [
    { id: 'B000000001', title: 'Dad Bag Belly Fanny Pack Funny Beer Belly Waist Pack' },
    { id: 'B000000002', title: 'Funny Dad Bag Belly Fanny Pack Beer Belly Waist Pack Gift' },
  ];
  const result = deduplicateAgainstCatalog(discoveries, catalog);

  assert.deepEqual(result.products.map((product) => product.id), ['B000000001']);
  assert.equal(result.duplicates, 1);
});

test('Amazon affiliate URLs are canonical and encode the associate tag', () => {
  assert.equal(
    amazonAffiliateUrl('B012345678', 'riley+test-20'),
    'https://www.amazon.com/dp/B012345678?tag=riley%2Btest-20'
  );
});

test('revalidation arguments stay bounded and support audit-only behavior', () => {
  const options = parseArgs([
    '--revalidate',
    '--revalidate-limit', '25',
    '--stale-days', '14',
    '--deactivate-after-days', '120',
    '--no-deactivate',
  ]);

  assert.equal(options.revalidate, true);
  assert.equal(options.revalidateLimit, 25);
  assert.equal(options.staleDays, 14);
  assert.equal(options.deactivateAfterDays, 120);
  assert.equal(options.deactivateMissing, false);

  const clamped = parseArgs(['--revalidate-limit', '500', '--deactivate-after-days', '2']);
  assert.equal(clamped.revalidateLimit, 100);
  assert.equal(clamped.deactivateAfterDays, 60);
});

test('revalidation preserves a known price when Amazon omits offer data', () => {
  const result = revalidatedProduct({
    id: 'B012345678',
    title: 'Funny Existing Product',
    price: '29.99',
    currency: 'CAD',
    image_url: 'https://example.com/existing.jpg',
    source_query: 'funny gifts',
    humor_tags: ['funny'],
    punny_title: 'Existing pun',
    witty_description: 'Existing description',
    quality_score: '0.75',
    rating: '4.5',
    review_count: 100,
    embedding: null,
  }, {
    id: 'B012345678',
    title: 'Funny Existing Product',
    price: 0,
    currency: 'USD',
    imageUrl: 'https://example.com/current.jpg',
    affiliateUrl: 'https://www.amazon.com/dp/B012345678?tag=test-20',
    source: 'amazon',
  }, {
    minPrice: 5,
    maxPrice: 150,
  });

  assert.equal(result.price, 29.99);
  assert.equal(result.currency, 'CAD');
  assert.equal(result.isActive, true);
  assert.equal(result.imageUrl, 'https://example.com/current.jpg');
});
