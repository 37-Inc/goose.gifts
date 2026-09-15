import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('gift pages use distinct tracked retailer placements without database impressions', async () => {
  const page = await readFile(new URL('../app/gifts/[slug]/page.tsx', import.meta.url), 'utf8');
  const button = await readFile(new URL('../components/ProductClickButton.tsx', import.meta.url), 'utf8');
  const sticky = await readFile(new URL('../components/MobileStickyRetailerCta.tsx', import.meta.url), 'utf8');

  assert.match(page, /clickSource="gift_page_price"/);
  assert.match(page, /clickSource="gift_page_editorial"/);
  assert.match(page, /<MobileStickyRetailerCta/);
  assert.match(page, /id="gift-retailer-primary"/);
  assert.match(page, /id="gift-retailer-editorial"/);
  assert.doesNotMatch(page, /trackImpression/);

  assert.doesNotMatch(button, /track-impression/);
  assert.match(button, /\/api\/track-click/);
  assert.match(sticky, /clickSource="gift_page_sticky"/);
  assert.doesNotMatch(sticky, /trackImpression/);
  assert.match(sticky, /document\.querySelector\('footer'\)/);
  assert.match(sticky, /primaryHasPassed/);
  assert.match(sticky, /!isInViewport\(editorialCta\)/);
  assert.match(sticky, /!isInViewport\(footer\)/);
});

test('the product-first landing keeps the exact image and retailer exit ahead of editorial', async () => {
  const page = await readFile(new URL('../app/gifts/[slug]/page.tsx', import.meta.url), 'utf8');
  const image = page.indexOf('<ProductImage');
  const heading = page.indexOf('<h1');
  const primary = page.indexOf('id="gift-retailer-primary"');
  const disclosure = page.indexOf('As an Amazon Associate');
  const editorial = page.indexOf('Why it works as a gift');

  assert.ok(image >= 0 && image < heading && heading < primary);
  assert.ok(primary < disclosure && disclosure < editorial);
  assert.match(page, /imageUrl=\{product.imageUrl\}/);
  assert.match(page, /alt=\{product.title\}/);
  assert.match(page, /className="object-contain"/);
  assert.match(page, /View on \{retailerLabel\}/);
  assert.match(page, /hasRetailerDestination \? \(/);
  assert.match(page, /if \(!hasFreshGiftOffer\(product\)\)/);
  assert.match(page, /editorialParagraphs\.length > 0 \? editorialParagraphs : \[fallbackParagraph\]/);
  assert.doesNotMatch(page, /PageHero/);
});
