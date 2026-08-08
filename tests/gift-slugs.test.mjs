import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getGiftPath,
  getLegacyGiftRedirectPath,
  hasIndexableGiftEditorial,
  slugifyGiftTitle,
} from '../lib/gift-slugs.ts';

test('creates a readable stable slug without retailer identifiers', () => {
  assert.equal(
    slugifyGiftTitle('Mug of Mischief: Custom Cartoon Hippo!'),
    'mug-of-mischief-custom-cartoon-hippo'
  );
  assert.equal(getGiftPath('mug-of-mischief-custom-cartoon-hippo'), '/gifts/mug-of-mischief-custom-cartoon-hippo');
});

test('legacy Pinterest links retain campaign attribution but drop retailer and spin parameters', () => {
  assert.equal(
    getLegacyGiftRedirectPath('mug-of-mischief-custom-cartoon-hippo', {
      gift: 'B0F9DZMQBL',
      spin: 'old-seed',
      utm_source: 'pinterest',
      utm_medium: 'organic_social',
      utm_campaign: 'pinterest_editorial_v2',
      utm_content: 'hippo_mug_desk',
      unexpected: 'discard-me',
    }),
    '/gifts/mug-of-mischief-custom-cartoon-hippo?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_editorial_v2&utm_content=hippo_mug_desk'
  );
});

test('only substantive reviewed editorial is indexable', () => {
  const now = new Date('2026-08-07T12:00:00Z');
  const editorial = `${'specific product fact '.repeat(55).trim()}.\n\n${'honest gift guidance '.repeat(50).trim()}.`;
  const eligible = {
    isActive: true,
    editorialWriteup: editorial,
    editorialStatus: 'generated_ready',
    editorialQualityScore: 0.9,
    availabilityStatus: 'IN_STOCK',
    availabilityCheckedAt: '2026-08-06T12:00:00Z',
    sourceFactsHash: 'same',
    editorialSourceHash: 'same',
  };

  assert.equal(hasIndexableGiftEditorial({ ...eligible, editorialWriteup: 'Too short.' }, now), false);
  assert.equal(hasIndexableGiftEditorial(eligible, now), true);
  assert.equal(hasIndexableGiftEditorial({ ...eligible, editorialStatus: 'needs_review' }, now), false);
  assert.equal(hasIndexableGiftEditorial({ ...eligible, availabilityStatus: 'UNAVAILABLE' }, now), false);
  assert.equal(hasIndexableGiftEditorial({ ...eligible, availabilityCheckedAt: '2026-06-01T12:00:00Z' }, now), false);
  assert.equal(hasIndexableGiftEditorial({ ...eligible, editorialSourceHash: 'stale' }, now), false);
  assert.equal(hasIndexableGiftEditorial({ ...eligible, duplicateOfProductId: 'winner' }, now), false);
});
