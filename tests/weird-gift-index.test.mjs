import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeWeirdGiftCatalog,
  normalizeTitle,
  titleMatchesAny,
} from '../lib/weird-gift-index-analysis.ts';

function row(title, overrides = {}) {
  return {
    title,
    price: '0.00',
    source: 'amazon',
    updatedAt: '2026-07-12T12:00:00.000Z',
    ...overrides,
  };
}

test('normalization preserves exact word and phrase matching', () => {
  assert.equal(normalizeTitle("S'mores & Hot-Dog Gift"), ' s mores hot dog gift ');
  assert.equal(titleMatchesAny('Funny cat mug', ['cat']), true);
  assert.equal(titleMatchesAny('A cathedral-shaped mug', ['cat']), false);
  assert.equal(titleMatchesAny("S'mores kit", ['s more']), false);
  assert.equal(titleMatchesAny("S'mores kit", ['s mores']), true);
});
test('analysis counts overlapping motifs without treating categories as exclusive', () => {
  const result = analyzeWeirdGiftCatalog([
    row('Funny farting dog prank toy'),
    row('Novelty cat coffee mug'),
    row('Plain desk organizer', { price: '19.99' }),
  ]);

  assert.equal(result.totalProducts, 3);
  assert.equal(result.humorSignalCount, 2);
  assert.equal(result.knownPriceCount, 1);
  assert.equal(result.motifs.find((motif) => motif.id === 'animals')?.count, 2);
  assert.equal(result.motifs.find((motif) => motif.id === 'bathroom')?.count, 1);
  assert.equal(result.motifs.find((motif) => motif.id === 'pranks')?.count, 1);
  assert.equal(result.crossovers.animalsWithHumorSignal, 2);
  assert.equal(result.crossovers.animalsWithBathroomHumor, 1);
});

test('analysis uses the newest catalog timestamp and handles an empty dataset', () => {
  const result = analyzeWeirdGiftCatalog([
    row('Funny mug', { updatedAt: '2026-07-10T12:00:00.000Z' }),
    row('Weird mug', { updatedAt: '2026-07-12T12:00:00.000Z' }),
  ]);
  const empty = analyzeWeirdGiftCatalog([]);

  assert.equal(result.catalogUpdatedAt, '2026-07-12T12:00:00.000Z');
  assert.equal(result.titleSignals.find((signal) => signal.term === 'funny')?.count, 1);
  assert.equal(result.titleSignals.find((signal) => signal.term === 'weird')?.count, 1);
  assert.equal(empty.totalProducts, 0);
  assert.equal(empty.motifs.every((motif) => motif.percentage === 0), true);
});
