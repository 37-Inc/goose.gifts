import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isHomepageEligibleProduct,
  scoreProductForTrending,
} from '../lib/db/product-scoring.ts';

function product(overrides = {}) {
  return {
    id: 'test',
    title: 'Generic product',
    qualityScore: 0.8,
    price: 20,
    currency: 'USD',
    imageUrl: 'https://example.com/image.jpg',
    affiliateUrl: 'https://example.com/product',
    source: 'amazon',
    isActive: true,
    ...overrides,
  };
}

test('explicit gag gifts are eligible while generic legacy gifts are not', () => {
  assert.equal(isHomepageEligibleProduct(product({ title: 'Funny Fart Button Gag Gift' })), true);
  assert.equal(isHomepageEligibleProduct(product({ title: 'Luxury Vanilla Bath Bomb Gift Set' })), false);
});

test('curated discovery products can qualify without spammy title keywords', () => {
  assert.equal(isHomepageEligibleProduct(product({
    title: 'Red Crab Silicone Spoon Rest',
    sourceQuery: 'weird kitchen gadgets',
  })), true);
});

test('inactive and low-quality products never qualify', () => {
  assert.equal(isHomepageEligibleProduct(product({ title: 'Funny Mug', isActive: false })), false);
  assert.equal(isHomepageEligibleProduct(product({ title: 'Funny Mug', qualityScore: 0.4 })), false);
});

test('brand-fit scoring favors a genuine gag gift over a generic beauty item', () => {
  const gagScore = scoreProductForTrending(product({
    title: 'Bullshit Button Funny Gag Gift',
    sourceQuery: 'prank gifts for friends',
    humorTags: ['prank', 'gag'],
  }));
  const genericScore = scoreProductForTrending(product({
    title: 'Luxury Skincare Bath Bomb Gift Basket',
    qualityScore: 0.95,
  }));

  assert.ok(gagScore > genericScore, `${gagScore} should be greater than ${genericScore}`);
});
