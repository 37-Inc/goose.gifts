import assert from 'node:assert/strict';
import test from 'node:test';
import { isPersistentImagePath } from '../lib/catalog/persistent-image.ts';
import { createPersistentCatalogProduct, publicProductRightsExpiry } from '../lib/catalog/snapshot.ts';
import { createBrowseRelease } from '../static-site/lib/browse.ts';
import { validateCardShard } from '../static-site/lib/card-shard.ts';
import { resolvePublicProduct } from '../lib/catalog/display.ts';

test('owner-cleared existing imagery supports HTTPS and local raster files without an invented supplier lease', () => {
  for (const imageUrl of ['https://images.example.invalid/existing.jpg?size=large', '/images/existing.jpg',
    '/images/existing.png', '/images/existing.webp', '/images/gift-placeholder.svg']) {
    const product = { id: 'B000000001', publicId: '00000000-0000-4000-8000-000000000001', slug: 'existing-gift',
      title: 'Existing gift', description: 'Existing description', imageUrl, source: 'amazon', currency: 'USD', price: 0,
      affiliateUrl: 'https://www.amazon.com/dp/B000000001?tag=fixture-20', isActive: true, qualityScore: .8, editorialStatus: 'pending' };
    const rights = Object.fromEntries(['title', 'description', 'imageUrl', 'affiliateUrl'].map(field => [field,
      { basis: 'licensed', value: product[field], reference: 'Owner-confirmed existing dataset; synthetic fixture only' }]));
    const at = new Date('2026-10-22T12:00:00.000Z'), display = createPersistentCatalogProduct({ product, rights }, at);
    assert.equal(display.imageUrl, imageUrl);
    assert.equal(publicProductRightsExpiry(display, rights, at), Infinity);
    assert.equal(resolvePublicProduct(display, new Date('2027-01-01T00:00:00.000Z')).imageUrl, imageUrl);
    const snapshot = { schemaVersion: 1, dataKind: 'catalog', catalogRevision: 'restored-test', generatedAt: at.toISOString(),
      products: [display], heldProducts: [], slugHistory: [] };
    const browse = createBrowseRelease(snapshot), shard = browse.shards.find(s => s.payload.kind === 'random');
    assert.equal(validateCardShard(shard.payload, { catalogRevision: snapshot.catalogRevision, version: browse.version,
      kind: 'random', now: at.getTime() }).products[0].imageUrl, imageUrl);
    delete rights.imageUrl;
    assert.equal(createPersistentCatalogProduct({ product, rights }, at), null);
  }
});

test('unsafe image schemes, credentials, fragments and local traversal remain rejected', () => {
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,abc', '//example.invalid/photo.jpg',
    'http://example.invalid/photo.jpg', 'https://user:secret@example.invalid/photo.jpg', 'https://example.invalid/photo.jpg#fragment',
    '/../private.jpg', '/images/../private.jpg', '/images/./private.jpg', '/images/a.jpg?private=1', undefined])
    assert.equal(isPersistentImagePath(value), false);
});
