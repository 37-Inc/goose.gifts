import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areNearDuplicateTitles,
  isHomepageEligibleProduct,
  productArchetypeKey,
  productFamilyFingerprint,
  scoreProductForTrending,
  suppressNearDuplicateProducts,
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

test('distinctive merchant-title evidence can qualify without spammy title keywords', () => {
  assert.equal(isHomepageEligibleProduct(product({
    title: 'Red Crab Silicone Spoon Rest',
    sourceQuery: 'weird kitchen gadgets',
  })), true);
});

test('automated discovery fields cannot manufacture homepage relevance', () => {
  assert.equal(isHomepageEligibleProduct(product({
    title: 'The Book of Unusual Knowledge: Fascinating Facts for Trivia Buffs',
    sourceQuery: 'funny gifts for dads',
    humorTags: ['dad-joke', 'weird', 'novelty'],
    punnyTitle: 'Fact Around and Find Out',
    wittyDescription: 'A weirdly wonderful gift.',
  })), false);
});

test('commodity formats stay off the homepage despite merchant SEO language', () => {
  assert.equal(isHomepageEligibleProduct(product({
    title: 'Funny Gift Pack for Women - Hilarious Gag Makeup Travel Bag',
    sourceQuery: 'prank gifts for friends',
  })), false);
  assert.equal(isHomepageEligibleProduct(product({
    title: 'Cat Butts Pole Dance Show: Funny Coloring Book',
  })), false);
  assert.equal(isHomepageEligibleProduct(product({
    title: "Buggin' Out! A Hilarious Insect Coloring Adventure",
  })), false);
});

test('physical novelty book sets remain eligible', () => {
  assert.equal(isHomepageEligibleProduct(product({
    title: 'The Screaming Goat (Book & Figure)',
  })), true);
});

test('inactive and low-quality products never qualify', () => {
  assert.equal(isHomepageEligibleProduct(product({ title: 'Funny Mug', isActive: false })), false);
  assert.equal(isHomepageEligibleProduct(product({ title: 'Funny Mug', qualityScore: 0.4 })), false);
});

test('expired year-specific products do not re-enter the live catalog', () => {
  const currentYear = new Date().getUTCFullYear();
  assert.equal(isHomepageEligibleProduct(product({ title: 'Funny Goat 2022 Calendar' })), false);
  assert.equal(isHomepageEligibleProduct(product({ title: `Funny Goat ${currentYear} Calendar` })), true);
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

test('generated tags and discovery query do not inflate brand-fit scoring', () => {
  const generatedScore = scoreProductForTrending(product({
    title: 'Plain Ceramic Storage Jar',
    sourceQuery: 'weird kitchen gadgets',
    humorTags: ['weird', 'novelty', 'gag'],
  }));
  const originalTitleScore = scoreProductForTrending(product({
    title: 'Funny Fart Button Gag Gift',
  }));

  assert.ok(originalTitleScore > generatedScore, `${originalTitleScore} should be greater than ${generatedScore}`);
});

test('product family fingerprints ignore listing order and minor variants', () => {
  const first = productFamilyFingerprint('Funny Black Belly Fanny Pack for Adults - Large');
  const second = productFamilyFingerprint('Large Fanny Belly Pack, Black Novelty Gift for Men');
  assert.equal(first, second);
});

test('near-duplicate matching collapses SEO variants but preserves distinct objects', () => {
  assert.equal(areNearDuplicateTitles(
    'Personal Alarm Keychain with LED Light and Safety Siren, Pink',
    'Pink Safety Siren Personal Alarm Keychain with LED Flashing Light for Women'
  ), true);
  assert.equal(areNearDuplicateTitles(
    'Chicken Legs Bucket Hat Funny Sun Cap',
    'Funny Chicken Leg Sun Bucket Hat for Adults - Blue'
  ), true);
  assert.equal(areNearDuplicateTitles(
    'Red Crab Silicone Spoon Rest for Kitchen Counter',
    'Red Crab Pen Holder for Desk'
  ), false);
  assert.equal(areNearDuplicateTitles('Funny Cat Mug', 'Funny Dog Mug'), false);
  assert.equal(areNearDuplicateTitles('Funny Mug', 'Silly Mug'), false);
  assert.equal(areNearDuplicateTitles('Funny Mug', 'Funny Mug'), true);
});

test('known marketplace archetypes collapse visually repetitive product families', () => {
  assert.equal(productArchetypeKey(
    'Funny Shart Survival Kit with Wipes and Disposable Underwear'
  ), 'bodily-survival-kit');
  assert.equal(areNearDuplicateTitles(
    'Funny Shart Survival Kit with Wipes and Disposable Underwear',
    'Funny Survival Set Includes Disposable Underwear, Potty Humor and Wet Wipe'
  ), true);
  assert.equal(areNearDuplicateTitles(
    'Prank-O Roto Wipe Prank Gift Box',
    'Prank-O My First Fire Empty Gag Gift Box'
  ), true);
  assert.equal(areNearDuplicateTitles(
    'Middle Finger Keychain, 2 Pcs Funny Key Chain',
    'Stainless Steel Middle Finger Keychain for Friends'
  ), true);
  assert.equal(areNearDuplicateTitles(
    'The Screaming Goat Desk Toy',
    'Goat Squeak Button with Sheep Sound for Office Desk'
  ), true);
});

test('duplicate suppression keeps the highest-ranked representative and fills the limit', () => {
  const ranked = [
    product({ id: 'belly-1', title: 'Funny Belly Fanny Pack Hairy Dad Body' }),
    product({ id: 'belly-2', title: 'Hairy Dad Body Belly Fanny Pack Novelty Gift - Black' }),
    product({ id: 'crab', title: 'Red Crab Silicone Spoon Rest' }),
    product({ id: 'goat', title: 'The Screaming Goat (Book & Figure)' }),
  ];

  assert.deepEqual(
    suppressNearDuplicateProducts(ranked, 3).map(({ id }) => id),
    ['belly-1', 'crab', 'goat']
  );
});
