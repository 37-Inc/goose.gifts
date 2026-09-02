import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('gift pages use one impression and distinct tracked retailer placements', async () => {
  const page = await readFile(new URL('../app/gifts/[slug]/page.tsx', import.meta.url), 'utf8');
  const button = await readFile(new URL('../components/ProductClickButton.tsx', import.meta.url), 'utf8');
  const sticky = await readFile(new URL('../components/MobileStickyRetailerCta.tsx', import.meta.url), 'utf8');

  assert.match(page, /clickSource="gift_page_price"/);
  assert.match(page, /clickSource="gift_page_editorial"/);
  assert.match(page, /<MobileStickyRetailerCta/);
  assert.match(page, /id="gift-retailer-primary"/);
  assert.match(page, /id="gift-retailer-editorial"/);
  assert.match(page, /trackImpression=\{false\}/);

  assert.match(button, /trackImpression = true/);
  assert.match(button, /if \(!trackImpression\)/);
  assert.match(sticky, /clickSource="gift_page_sticky"/);
  assert.match(sticky, /trackImpression=\{false\}/);
  assert.match(sticky, /document\.querySelector\('footer'\)/);
  assert.match(sticky, /primaryHasPassed/);
  assert.match(sticky, /!isInViewport\(editorialCta\)/);
  assert.match(sticky, /!isInViewport\(footer\)/);
});
