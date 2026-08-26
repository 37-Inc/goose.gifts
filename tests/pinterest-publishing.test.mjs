import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPinterestAccount,
  findExistingPin,
  findOwnerApproval,
  hasUnresolvedPublication,
  validateDraftPackage,
  validatePinReadback,
} from '../scripts/ops/pinterest-publishing.mjs';
import {
  selectPinterestSourceCandidates,
  usedPinterestProductIds,
  usedPinterestProductTitles,
} from '../scripts/ops/pinterest-candidates.mts';

const draft = {
  id: 'cand-test-package',
  candidateId: 'cand-test',
  approvalEventId: 'evt-test-approved',
  board: 'Weird Kitchen Gadgets',
  assetPath: 'docs/example.png',
  targetPage: 'https://www.goose.gifts/gifts/funny-pizza-saw',
  trackingUrl: 'https://www.goose.gifts/gifts/funny-pizza-saw?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_editorial_v3&utm_content=pizza_saw',
  title: 'A Circular Saw for Pizza Night',
  description: 'A kitchen scene built around the exact pizza cutter. AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.',
  altText: 'Circular-saw-shaped pizza cutter beside a sliced pizza.',
  disclosure: 'AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.',
};

test('publishing package requires owner approval metadata, tracking, and visible disclosures', () => {
  assert.equal(validateDraftPackage(draft), draft);
  assert.throws(
    () => validateDraftPackage({ ...draft, approvalEventId: '' }),
    /approvalEventId/,
  );
  assert.throws(
    () => validateDraftPackage({ ...draft, description: 'Affiliate disclosure: included.' }),
    /AI-modified/,
  );
  assert.throws(
    () => validateDraftPackage({ ...draft, trackingUrl: draft.targetPage }),
    /utm_source/,
  );
  assert.throws(
    () => validateDraftPackage({
      ...draft,
      targetPage: 'https://www.goose.gifts/random-gift?gift=B001XSFW42',
      trackingUrl: 'https://www.goose.gifts/random-gift?gift=B005UGWDAE&utm_source=pinterest&utm_medium=organic_social&utm_campaign=x&utm_content=y',
    }),
    /preserve targetPage query parameter gift/,
  );
});

test('approval guard accepts only Cameron approval for the exact candidate', () => {
  const events = [{
    eventId: 'evt-test-approved',
    type: 'candidate.status_changed',
    actor: 'cameron',
    data: { candidateId: 'cand-test', to: 'approved' },
  }];
  assert.equal(findOwnerApproval(events, draft), events[0]);
  assert.throws(
    () => findOwnerApproval([{ ...events[0], actor: 'codex' }], draft),
    /not Cameron's approval/,
  );
});

test('duplicate preflight and readback compare the exact tracked destination', () => {
  const pin = {
    id: '123',
    board_id: '456',
    title: draft.title,
    description: draft.description,
    alt_text: draft.altText,
    link: draft.trackingUrl,
    media: { media_type: 'image' },
  };
  assert.equal(findExistingPin([pin], draft), pin);
  assert.equal(validatePinReadback(pin, draft, '456'), pin);
  assert.throws(() => validatePinReadback({ ...pin, board_id: '999' }, draft, '456'), /board_id/);
});

test('production account guard fails closed', () => {
  assert.doesNotThrow(() => assertPinterestAccount({ username: 'goosegifts', account_type: 'BUSINESS' }));
  assert.throws(() => assertPinterestAccount({ username: 'someone-else', account_type: 'BUSINESS' }), /Refusing/);
});

test('an unterminated publication receipt blocks a blind retry', () => {
  const receipts = [
    { draftId: 'other', type: 'publication.started', receiptId: 'receipt-other' },
    { draftId: draft.id, type: 'publication.started', receiptId: 'receipt-pending' },
  ];
  assert.equal(hasUnresolvedPublication(receipts, draft.id).receiptId, 'receipt-pending');
  assert.equal(
    hasUnresolvedPublication([...receipts, { draftId: draft.id, type: 'publication.failed' }], draft.id),
    null,
  );
});

test('candidate selector uses verified enriched catalog rows and excludes published products', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const base = {
    slug: 'pizza-boss',
    title: 'Funny Pizza Boss Circular Saw Pizza Cutter',
    price: '18.00',
    currency: 'USD',
    image_url: 'https://example.com/image.jpg',
    affiliate_url: 'https://amazon.com/dp/B001XSFW42',
    source: 'amazon',
    source_query: 'weird kitchen gadget',
    humor_tags: ['funny', 'kitchen'],
    rating: '4.7',
    review_count: 1000,
    quality_score: '0.95',
    is_active: true,
    click_count: 2,
    impression_count: 10,
    source_facts: { features: ['circular saw shape'] },
    source_facts_hash: 'abc',
    editorial_source_hash: 'abc',
    availability_status: 'IN_STOCK',
    availability_checked_at: '2026-08-24T12:00:00Z',
    last_verified_at: '2026-08-24T12:00:00Z',
    editorial_status: 'generated_ready',
    editorial_quality_score: '0.92',
    editorial_generated_at: '2026-08-24T12:00:00Z',
    duplicate_of_product_id: null,
  };
  const rows = [
    { ...base, id: 'B001XSFW42' },
    { ...base, id: 'B005UGWDAE', slug: 'used', title: 'Funny Alligator Oven Mitt' },
    { ...base, id: 'B000000001', slug: 'stale', availability_checked_at: '2026-06-01T12:00:00Z' },
  ];
  const selected = selectPinterestSourceCandidates(rows, new Set(['B005UGWDAE']), 20, now);
  assert.deepEqual(selected.map((item) => item.id), ['B001XSFW42']);
});

test('latest weekly-run products receive a bounded ranking bonus', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const makeRow = (id, title, quality) => ({
    id,
    slug: id.toLowerCase(),
    title,
    price: '20.00',
    image_url: 'https://example.com/image.jpg',
    affiliate_url: `https://amazon.com/dp/${id}`,
    source: 'amazon',
    source_query: 'funny gift',
    humor_tags: ['funny'],
    quality_score: quality,
    is_active: true,
    source_facts_hash: id,
    editorial_source_hash: id,
    availability_status: 'IN_STOCK',
    availability_checked_at: '2026-08-24T12:00:00Z',
    editorial_status: 'generated_ready',
    editorial_quality_score: '0.90',
    editorial_generated_at: '2026-08-24T12:00:00Z',
    duplicate_of_product_id: null,
  });
  const selected = selectPinterestSourceCandidates(
    [
      makeRow('B000000001', 'Funny Pizza Saw Cutter', '0.90'),
      makeRow('B000000002', 'Weird Raw Chicken Vase', '0.85'),
    ],
    new Set(),
    20,
    now,
    [],
    new Set(['B000000002']),
  );
  assert.equal(selected[0].id, 'B000000002');
});

test('published product ids are read from live manifest records and published creative events', () => {
  const ids = usedPinterestProductIds({
    manifest: { pins: [
      { livePinUrl: 'https://pinterest.com/pin/1', trackingUrl: 'https://www.goose.gifts/gifts/x?gift=B001XSFW42' },
      { livePinUrl: 'https://pinterest.com/pin/2', publicationStatus: 'deleted', trackingUrl: 'https://www.goose.gifts/gifts/y?gift=B005UGWDAE' },
    ] },
    events: [
      { type: 'candidate.created', data: { candidateId: 'cand-goat', product: { name: 'Goat ASIN 0762459816' } } },
      { type: 'candidate.status_changed', data: { candidateId: 'cand-goat', from: 'shortlisted', to: 'approved', rationale: 'Verified exact ASIN 0762459816.' } },
      { type: 'candidate.status_changed', data: { candidateId: 'cand-goat', to: 'published' } },
    ],
  });
  assert.deepEqual([...ids].sort(), ['0762459816', 'B001XSFW42']);
});

test('published product-family titles suppress alternate retailer listings', () => {
  const events = [
    { type: 'candidate.created', data: { candidateId: 'cand-goat', product: { name: 'Screaming goat desk figurine' } } },
    { type: 'candidate.status_changed', data: { candidateId: 'cand-goat', to: 'published' } },
  ];
  const titles = usedPinterestProductTitles(events);
  const row = {
    id: 'B0FZDRNRH4',
    slug: 'another-goat',
    title: 'The Screaming Goat Desk Toy - Funny Gag Gift',
    price: '15.00',
    image_url: 'https://example.com/goat.jpg',
    affiliate_url: 'https://amazon.com/dp/B0FZDRNRH4',
    source: 'amazon',
    source_query: 'funny desk toy',
    humor_tags: ['funny'],
    quality_score: '0.90',
    is_active: true,
    source_facts_hash: 'hash',
    editorial_source_hash: 'hash',
    availability_status: 'IN_STOCK',
    availability_checked_at: '2026-08-24T00:00:00Z',
    editorial_status: 'generated_ready',
    editorial_quality_score: '0.90',
    duplicate_of_product_id: null,
  };
  assert.deepEqual(
    selectPinterestSourceCandidates([row], new Set(), 20, new Date('2026-08-25T00:00:00Z'), titles),
    [],
  );
});
