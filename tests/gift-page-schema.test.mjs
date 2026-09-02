import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGiftPageSchema,
  hasUsableRetailerDestination,
} from '../lib/gift-page-schema.ts';

const canonicalUrl = 'https://www.goose.gifts/gifts/the-screaming-goat';
const siteUrl = 'https://www.goose.gifts';
const now = new Date('2026-08-14T16:30:00Z');

function product(overrides = {}) {
  return {
    id: 'product-1',
    publicId: 'goose-product-1',
    slug: 'the-screaming-goat',
    title: 'The Screaming Goat',
    punnyTitle: 'The Screaming Goat',
    wittyDescription: 'A tiny goat for a desk with a loud sense of humor.',
    price: 0,
    currency: 'USD',
    imageUrl: 'https://example.com/goat.jpg',
    affiliateUrl: 'https://example.com/goat',
    source: 'amazon',
    availabilityStatus: 'IN_STOCK',
    availabilityCheckedAt: '2026-08-14T16:00:00Z',
    ...overrides,
  };
}

function graphTypes(schema) {
  return schema['@graph'].map((item) => item['@type']);
}

test('uses WebPage and breadcrumbs without an invalid Product rich-result claim when no fresh offer is present', () => {
  const schema = buildGiftPageSchema(
    product({ rating: 4.8, reviewCount: 120 }),
    canonicalUrl,
    'The Screaming Goat',
    'A tiny goat for a desk with a loud sense of humor.',
    siteUrl,
    now
  );

  assert.deepEqual(graphTypes(schema), ['WebPage', 'BreadcrumbList']);
  assert.equal(schema['@graph'][0].mainEntity, undefined);
});

test('includes Product markup only when it carries a current visible offer', () => {
  const schema = buildGiftPageSchema(
    product({ price: 12.99 }),
    canonicalUrl,
    'The Screaming Goat',
    'A tiny goat for a desk with a loud sense of humor.',
    siteUrl,
    now
  );
  const productSchema = schema['@graph'][2];

  assert.deepEqual(graphTypes(schema), ['WebPage', 'BreadcrumbList', 'Product']);
  assert.deepEqual(schema['@graph'][0].mainEntity, { '@id': `${canonicalUrl}#product` });
  assert.equal(productSchema.offers.price, '12.99');
  assert.equal(productSchema.offers.availability, 'https://schema.org/InStock');
  assert.equal(productSchema.aggregateRating, undefined);
});

test('omits Product markup when the offer snapshot is stale', () => {
  const schema = buildGiftPageSchema(
    product({ price: 12.99, availabilityCheckedAt: '2026-08-14T14:00:00Z' }),
    canonicalUrl,
    'The Screaming Goat',
    'A tiny goat for a desk with a loud sense of humor.',
    siteUrl,
    now
  );

  assert.deepEqual(graphTypes(schema), ['WebPage', 'BreadcrumbList']);
});

test('retailer destinations fail closed when the affiliate URL is blank or unsafe', () => {
  assert.equal(hasUsableRetailerDestination(product({ affiliateUrl: '' })), false);
  assert.equal(hasUsableRetailerDestination(product({ affiliateUrl: '   ' })), false);
  assert.equal(hasUsableRetailerDestination(product({ affiliateUrl: 'http://example.com/goat' })), false);
  assert.equal(hasUsableRetailerDestination(product()), true);

  const schema = buildGiftPageSchema(
    product({ price: 12.99, affiliateUrl: '   ' }),
    canonicalUrl,
    'The Screaming Goat',
    'A tiny goat for a desk with a loud sense of humor.',
    siteUrl,
    now
  );

  assert.deepEqual(graphTypes(schema), ['WebPage', 'BreadcrumbList']);
});
