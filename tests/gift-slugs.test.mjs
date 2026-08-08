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
  assert.equal(hasIndexableGiftEditorial({ editorialWriteup: 'Too short.' }), false);
  assert.equal(hasIndexableGiftEditorial({ editorialWriteup: 'x'.repeat(499) }), false);
  assert.equal(hasIndexableGiftEditorial({ editorialWriteup: 'x'.repeat(500) }), true);
});
