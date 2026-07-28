import assert from 'node:assert/strict';
import test from 'node:test';
import amazonCreators from '../lib/amazon-creators.js';
import { parseCsvRows } from '../scripts/ops/amazon-creators-env.mjs';
import { formatReport, parseFinalJson } from '../scripts/ops/catalog-weekly.mjs';
import {
  auditGuideProducts,
  extractGuideProducts,
  extractGuideUrls,
} from '../scripts/ops/audit-gift-guides.mjs';

import {
  areNearDuplicateTitles,
  amazonAffiliateUrl,
  deduplicateAgainstCatalog,
  deduplicateCandidates,
  isHighQualityDiscoveryCandidate,
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

test('Creators API item mapping reads lowerCamelCase offersV2 data', () => {
  const product = amazonCreators.mapItem({
    asin: 'B012345678',
    detailPageURL: 'https://www.amazon.com/dp/B012345678?tag=example-20',
    images: { primary: { large: { url: 'https://images.example/product.jpg' } } },
    itemInfo: { title: { displayValue: 'Ridiculous Desk Chicken' } },
    offersV2: { listings: [{ price: { money: { amount: 19.95, currency: 'USD' } } }] },
    customerReviews: { starRating: { value: 4.6 }, count: 123 },
  });

  assert.deepEqual(product, {
    id: 'B012345678',
    title: 'Ridiculous Desk Chicken',
    price: 19.95,
    currency: 'USD',
    imageUrl: 'https://images.example/product.jpg',
    affiliateUrl: 'https://www.amazon.com/dp/B012345678?tag=example-20',
    source: 'amazon',
    remotelyVerified: true,
    rating: 4.6,
    reviewCount: 123,
  });
});

test('local Creators credential CSV parsing handles quoted commas without exposing values', () => {
  const rows = parseCsvRows(
    'Application,Application Id,Credential Id,Secret,Version\n'
    + '"Goose, Gifts",app-id,credential-id,"secret,with,commas",3.1\n'
  );

  assert.deepEqual(rows, [
    ['Application', 'Application Id', 'Credential Id', 'Secret', 'Version'],
    ['Goose, Gifts', 'app-id', 'credential-id', 'secret,with,commas', '3.1'],
  ]);
});

test('weekly catalog reporting parses command output and includes owner-facing stats', () => {
  assert.deepEqual(parseFinalJson('progress\n{\n  "inserted": 2\n}\n'), { inserted: 2 });
  const report = formatReport({
    discoveredCandidates: 60,
    qualityRejected: 24,
    duplicatesFiltered: 14,
    candidates: 22,
    inserted: 2,
    updated: 20,
    backfilled: 3,
    themes: ['weird kitchen gadgets'],
    reviewCandidates: Array.from({ length: 7 }, (_, index) => ({
      title: `Candidate ${index + 1}`,
      imageUrl: `https://images.example/${index + 1}.jpg`,
      affiliateUrl: `https://shop.example/${index + 1}`,
    })),
  }, {
    selected: 50,
    refreshed: 49,
    confirmedMissing: 1,
    deactivated: 0,
    throttled: false,
  });

  assert.match(report, /60 fetched, 24 quality-rejected, 14 duplicates filtered/);
  assert.match(report, /2 inserted, 20 refreshed, 3 older products enriched/);
  assert.match(report, /50 checked, 49 refreshed, 1 confirmed missing/);
  assert.match(report, /Visual spot-check \(5\):/);
  assert.match(report, /Candidate 5/);
  assert.doesNotMatch(report, /Candidate 6/);

  const dryRunReport = formatReport({
    dryRun: true,
    discoveredCandidates: 10,
    qualityRejected: 3,
    duplicatesFiltered: 2,
    candidates: [{ id: 'one' }, { id: 'two' }],
    themes: ['novelty desk toys'],
  }, {
    selected: 0,
    refreshed: 0,
    confirmedMissing: 0,
    deactivated: 0,
    throttled: false,
  });
  assert.match(dryRunReport, /2 retained/);
  assert.match(dryRunReport, /dry run; no products changed/);
});

test('gift guide audit reads rendered products and identifies thin distinct inventory', () => {
  const rendered = [
    {
      id: 'good',
      title: 'Red Crab Silicone Spoon Rest',
      punnyTitle: 'Crab-tivating Counter Help',
      qualityScore: 0.8,
      isActive: true,
      imageUrl: 'https://example.com/crab.jpg',
      affiliateUrl: 'https://example.com/crab',
    },
    {
      id: 'weak',
      title: 'Luxury Ramen Bowl Set',
      punnyTitle: 'Ramen Ready',
      qualityScore: 0.5,
      isActive: true,
      imageUrl: 'https://example.com/bowl.jpg',
      affiliateUrl: 'https://example.com/bowl',
    },
  ].map((product) => JSON.stringify(product).replaceAll('"', '\\"')).join(',');
  const html = `<script>self.__next_f.push([1,"${rendered}"])</script>`;
  const products = extractGuideProducts(html);

  assert.equal(products.length, 2);
  assert.deepEqual(auditGuideProducts(products, 2), {
    raw: 2,
    eligible: 1,
    distinct: 1,
    rejected: 1,
    duplicates: 0,
    underfilled: true,
  });
});

test('gift guide audit discovers only canonical guide detail URLs from the sitemap', () => {
  const sitemap = [
    '<urlset>',
    '<url><loc>https://www.goose.gifts/</loc></url>',
    '<url><loc>https://www.goose.gifts/gift-guides/weird-kitchen-gadgets</loc></url>',
    '<url><loc>https://www.goose.gifts/gift-guides/weird-kitchen-gadgets</loc></url>',
    '<url><loc>https://www.goose.gifts/gift-guides</loc></url>',
    '<url><loc>https://example.com/gift-guides/not-ours</loc></url>',
    '</urlset>',
  ].join('');

  assert.deepEqual(extractGuideUrls(sitemap), [
    'https://www.goose.gifts/gift-guides/weird-kitchen-gadgets',
  ]);
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

test('product-family deduplication catches marketplace variants with different SEO titles', () => {
  assert.equal(areNearDuplicateTitles(
    'Funny Shart Survival Kit with Wipes and Disposable Underwear',
    'Funny Survival Set Includes Disposable Underwear, Potty Humor and Wet Wipe'
  ), true);
  assert.equal(areNearDuplicateTitles(
    'Golf Pen Set with Mini Desktop Putting Green Game',
    'Tabletop Wooden Mini Bowling Alley Desk Toy'
  ), false);
  assert.equal(areNearDuplicateTitles(
    'Golf Pen Set with Mini Desktop Putting Green Game',
    'Desktop Golf Pen Putting Game for Coworkers'
  ), true);
});

test('discovery quality gate keeps distinctive gag objects and rejects generic merchandise', () => {
  const base = {
    price: 15,
    imageUrl: 'https://example.com/image.jpg',
    affiliateUrl: 'https://example.com/product',
    isActive: true,
    qualityScore: 0.75,
  };

  assert.equal(isHighQualityDiscoveryCandidate({
    ...base,
    title: 'The Original Nessie Loch Ness Monster Soup Ladle',
  }), true);
  assert.equal(isHighQualityDiscoveryCandidate({
    ...base,
    title: 'Funny Sandalwood Scented Candle for Dad',
  }), false);
  assert.equal(isHighQualityDiscoveryCandidate({
    ...base,
    title: 'Sarcastic Candles for Coworkers',
  }), false);
  assert.equal(isHighQualityDiscoveryCandidate({
    ...base,
    title: 'Funny Cocktail Socks and Party Stockings',
  }), false);
  assert.equal(isHighQualityDiscoveryCandidate({
    ...base,
    title: "I'm Gay Rainbow Heat Change Mug Prank Gift",
  }), false);
  assert.equal(isHighQualityDiscoveryCandidate({
    ...base,
    title: 'Fullstar Pro Original Vegetable Chopper and Spiralizer',
  }), false);
  assert.equal(isHighQualityDiscoveryCandidate({
    ...base,
    title: 'The Screaming Goat Book and Figure',
  }), true);
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

test('affiliate URL repair can run without product revalidation', () => {
  const options = parseArgs(['--repair-affiliate-urls-only', '--dry-run']);

  assert.equal(options.repairAffiliateUrlsOnly, true);
  assert.equal(options.dryRun, true);
  assert.equal(options.revalidate, false);
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
