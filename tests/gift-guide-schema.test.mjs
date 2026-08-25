import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGuideSchema } from '../lib/gift-guide-schema.ts';

const guide = {
  slug: 'weird-kitchen-gadgets',
  title: 'Weird Kitchen Gadgets',
  h1: 'Funny kitchen gadgets that earn drawer space',
  description: 'Useful kitchen oddities.',
  intro: 'Pick a useful oddity.',
  keywords: ['kitchen'],
};

function product(overrides = {}) {
  return {
    id: 'B001XSFW42',
    title: 'Pizza Boss 3000',
    punnyTitle: 'Pizza Boss 3000',
    wittyDescription: 'A circular-saw-shaped pizza wheel.',
    price: 0,
    currency: 'USD',
    imageUrl: 'https://example.com/pizza.jpg',
    affiliateUrl: 'https://www.amazon.com/dp/B001XSFW42?tag=goosegifts-20',
    source: 'amazon',
    tags: ['kitchen'],
    isActive: true,
    impressionCount: 0,
    clickCount: 0,
    createdAt: new Date('2026-08-25T00:00:00Z'),
    updatedAt: new Date('2026-08-25T00:00:00Z'),
    ...overrides,
  };
}

test('gift-guide ItemList links to products without claiming unsupported Product snippets', () => {
  const schema = buildGuideSchema(
    [product({ slug: 'pizza-boss-3000' })],
    guide,
    'https://www.goose.gifts/gift-guides/weird-kitchen-gadgets',
  );
  const serialized = JSON.stringify(schema);
  const itemList = schema['@graph'].find((item) => item['@type'] === 'ItemList');

  assert.ok(itemList);
  assert.equal(itemList.itemListElement[0]['@type'], 'ListItem');
  assert.equal(itemList.itemListElement[0].url, 'https://www.goose.gifts/gifts/pizza-boss-3000');
  assert.doesNotMatch(serialized, /"@type":"Product"/);
  assert.doesNotMatch(serialized, /"availability":"https:\/\/schema.org\/InStock"/);
});

test('gift-guide ItemList preserves a truthful retailer fallback for legacy products', () => {
  const schema = buildGuideSchema(
    [product()],
    guide,
    'https://www.goose.gifts/gift-guides/weird-kitchen-gadgets',
  );
  const itemList = schema['@graph'].find((item) => item['@type'] === 'ItemList');

  assert.equal(
    itemList.itemListElement[0].url,
    'https://www.amazon.com/dp/B001XSFW42?tag=goosegifts-20',
  );
});
