import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHomeItemListSchema } from '../lib/home-item-list-schema.ts';

function product(overrides = {}) {
  return {
    id: 'product-1',
    title: 'Silly Gift',
    price: 0,
    currency: 'USD',
    imageUrl: 'https://example.com/gift.jpg',
    affiliateUrl: 'https://example.com/gift',
    source: 'amazon',
    ...overrides,
  };
}

test('omits products that cannot produce valid Google product snippets', () => {
  const schema = buildHomeItemListSchema([
    product({ id: 'missing-signals' }),
    product({ id: 'with-offer', price: 12.99 }),
    product({ id: 'with-rating', rating: 4.5, reviewCount: 18 }),
  ], 'https://www.goose.gifts');

  assert.equal(schema.numberOfItems, 2);
  assert.equal(schema.itemListElement.length, 2);
  assert.equal(schema.itemListElement[0].position, 1);
  assert.ok(schema.itemListElement[0].item.offers);
  assert.ok(schema.itemListElement[1].item.aggregateRating);
});

test('caps eligible product markup at 24 items', () => {
  const products = Array.from({ length: 30 }, (_, index) => (
    product({ id: `product-${index}`, price: index + 1 })
  ));

  const schema = buildHomeItemListSchema(products, 'https://www.goose.gifts');

  assert.equal(schema.numberOfItems, 24);
  assert.equal(schema.itemListElement.length, 24);
  assert.equal(schema.itemListElement.at(-1).position, 24);
});
