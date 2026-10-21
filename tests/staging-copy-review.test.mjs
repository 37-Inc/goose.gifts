import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareCohort } from '../scripts/staging/prepare-cohort.mts';
import { prepareImport } from '../scripts/staging/prepare-import.mts';
import { originalReviewCopy, readCopyReview, reviewedCopyHash } from '../scripts/staging/copy-review.mts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { createCatalogSnapshot } from '../lib/catalog/snapshot.ts';

const NOW = new Date('2026-10-21T22:25:00.000Z');
const OBSERVED = '2026-10-21T22:18:10.044Z';
const REVIEWED = '2026-10-21T22:24:00.000Z';
const TAG = 'synthetic-20';
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');
const persisted = value => JSON.parse(JSON.stringify(value));
const titles = ['Funny Fart Sound Button', 'Red Crab Spoon Rest', 'Mystic Pickle Fortune Teller', 'Sheep Toilet Roll Holder',
  'Grumpy Frog Desk Statue', 'Medieval Cat Wall Tapestry', 'Fake Beer Belly Waist Pack', 'Vampire Garlic Crusher',
  'Platypus Jar Spatula', 'Screaming Goat Desk Toy'];
function fixture(count = 1) {
  const items = titles.slice(0, count).map((title, index) => ({ id: `B${String(index + 1).padStart(9, '0')}`, title: `Funny ${title}`,
    source: 'amazon', remotelyVerified: true, availabilityStatus: 'IN_STOCK',
    imageUrl: `https://m.media-amazon.com/images/I/synthetic${index}.jpg`,
    affiliateUrl: `https://www.amazon.com/dp/B${String(index + 1).padStart(9, '0')}?tag=untrusted-20`,
    sourceFacts: { features: ['A physical novelty for a carefully chosen recipient.', 'The deliberately ridiculous object has a colourful finish.'],
      color: `colourful${index}`, itemDimensions: { height: '6 inches' } } }));
  const rows = items.map((item, index) => {
    const word = titleWord(index);
    return { id: item.id, public_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      slug: `synthetic-gift-${index}`, title: item.title, image_url: item.imageUrl, affiliate_url: item.affiliateUrl,
      source: 'amazon', currency: 'USD', price: '19.99', quality_score: '0.80', is_active: true, duplicate_of_product_id: null,
      source_facts: JSON.stringify(item.sourceFacts), source_facts_hash: editorialSourceHash(item), editorial_source_hash: editorialSourceHash(item),
      editorial_status: 'generated_ready', editorial_quality_score: '0.88', editorial_model: 'historical-model',
      editorial_prompt_version: 'historical-prompt', editorial_generated_at: '2026-10-01 12:00:00',
      punny_title: `${word} With A Twist`, witty_description: 'A physical novelty for a carefully chosen recipient.',
      editorial_writeup: `${`This ${word} novelty is a deliberately ridiculous physical object with a colourful finish, intended for a carefully chosen recipient who enjoys an unusual joke. `.repeat(4)}\n\n${`Consider where the ${word} belongs before giving it to someone, and choose a recipient who welcomes the distinctive ${word} humour in their daily surroundings. `.repeat(3)}`,
      humor_tags: '{prank}', availability_status: 'IN_STOCK', availability_checked_at: '2026-10-01 12:00:00',
      last_verified_at: '2026-10-01 12:00:00', created_at: '2026-10-01 12:00:00', updated_at: '2026-10-01 12:00:00',
      embedding: `[${Array(1536).fill('0.1').join(',')}]` };
  });
  for (const item of items) item.sourceFacts.itemDimensions.height = '6 Inches';
  return { rows, fresh: { observedAt: OBSERVED, reference: 'Synthetic original provider receipt, not live evidence', items } };
}
function titleWord(index) { return ['button', 'crab', 'pickle', 'sheep', 'frog', 'tapestry', 'bellypack', 'vampire', 'platypus', 'goat'][index]; }
function reviewFor(rows, fresh, mutate = () => {}) {
  const freshBytes = Buffer.from(`${JSON.stringify(fresh, null, 2)}\n`);
  const document = { schemaVersion: 1, kind: 'prospective-copy-review', freshReceiptSha256: byteHash(freshBytes),
    reviewedAt: REVIEWED, reference: 'Synthetic prospective factual/copy review; no new model approval',
    entries: rows.map(row => {
      const copy = originalReviewCopy(row); copy.punnyTitle = null;
      return { id: row.id, sourceRowSha256: sha256(JSON.stringify(row)),
        sourceFactsHash: editorialSourceHash(fresh.items.find(item => item.id === row.id)),
        originalCopySha256: reviewedCopyHash(originalReviewCopy(row)), copy, copySha256: reviewedCopyHash(copy),
        reason: 'Explicitly reviewed the unit capitalization and final copy against this exact fresh observation.', imageReview: 'unchanged' };
    }) };
  mutate(document);
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  return { bytes, sha256: byteHash(bytes), freshBytes };
}
function prepare(rows, fresh, copyReview, options = {}) {
  return prepareCohort(rows, fresh, { ids: rows.map(row => row.id), catalogRevision: 'synthetic-reviewed-r1',
    affiliateTag: TAG, now: NOW, copyReview, ...options });
}
const cohortFor = result => ({ snapshot: result.snapshot, rights: result.rightsById,
  inputs: { products: result.inputs, sourceRowSha256ById: result.sourceRowSha256ById, ...(result.copyReview ? { copyReview: result.copyReview } : {}) } });
const timestamps = Object.fromEntries(['availability_checked_at', 'last_verified_at', 'created_at', 'updated_at']
  .map(column => [`products.${column}`, { timezone: 'UTC', evidence: 'Synthetic source is explicitly UTC, not production evidence.' }]));
function importOptions(rows, copyReview) {
  return { sourceSha256: sha256(`${rows.map(JSON.stringify).join('\n')}\n`), archiveId: 'synthetic-source', embeddingEncoding: 'postgres-text',
    timestamps, now: NOW, copyReview, affiliateTag: TAG };
}

test('prospective review supports exact ten while preserving original generation, quality and 24h expiry', () => {
  const { rows, fresh } = fixture(10); const original = structuredClone({ rows, fresh });
  assert.equal(prepare(rows, fresh).report.ready, 0, 'strict default still holds unit-only changes');
  const review = reviewFor(rows, fresh); const result = prepare(rows, fresh, review);
  assert.equal(result.report.ready, 10, JSON.stringify(result.report)); assert.equal(result.report.held, 0);
  assert.equal(result.report.reasonCounts.fresh_prospectively_reviewed_copy, 10);
  assert.deepEqual({ rows, fresh }, original);
  for (const [index, product] of result.inputs.entries()) {
    assert.equal(product.editorialSourceHash, editorialSourceHash(product));
    assert.notEqual(product.editorialSourceHash, rows[index].editorial_source_hash);
    assert.equal(product.editorialStatus, 'generated_ready');
    assert.equal(product.editorialGeneratedAt, rows[index].editorial_generated_at);
    assert.equal(product.editorialModel, 'historical-model'); assert.equal(product.editorialPromptVersion, 'historical-prompt');
    assert.equal(product.editorialQualityScore, 0.88); assert.equal(product.punnyTitle, undefined);
  }
  for (const product of result.snapshot.products) assert.equal(product.eligibleUntil, '2026-10-22T22:18:10.044Z');
  for (const rights of Object.values(result.rightsById)) for (const right of Object.values(rights)) {
    assert.equal(right.basis, 'merchant'); assert.equal(right.observedAt, OBSERVED);
    assert.equal(right.expiresAt, '2026-10-22T22:18:10.044Z'); assert.match(right.reference, /prospective copy review/);
    assert.doesNotMatch(right.reference, /unchanged source/);
  }
  assert.doesNotMatch(JSON.stringify(result.snapshot), /prospective|sourceRowSha256|reviewedAt|historical-model/);
});

test('reviewed import independently reconstructs full inputs and persists original history plus explicit private provenance', () => {
  const { rows, fresh } = fixture(); const copyReview = reviewFor(rows, fresh);
  const result = prepare(rows, fresh, copyReview); const cohort = persisted(cohortFor(result));
  const packet = prepareImport(rows, cohort, importOptions(rows, copyReview));
  const source = { ...rows[0] }; delete source.embedding;
  assert.equal(packet.expectedRows[0].source_record_json, canonicalJson(source));
  assert.equal(packet.expectedRows[0].source_facts_hash, result.inputs[0].sourceFactsHash);
  assert.equal(packet.expectedRows[0].editorial_source_hash, result.inputs[0].sourceFactsHash);
  assert.equal(JSON.parse(packet.expectedRows[0].source_record_json).editorial_source_hash, rows[0].editorial_source_hash);
  assert.equal(packet.expectedRows[0].editorial_status, 'generated_ready');
  assert.equal(packet.copyReview.reviewSha256, copyReview.sha256);
  assert.deepEqual(packet.copyReview, result.copyReview); assert.equal(packet.summary.copyReviewSha256, copyReview.sha256);
  assert.equal(packet.summary.semanticInputCurrencyProven, false);
  assert.throws(() => prepareImport(rows, cohort, importOptions(rows)), /matching_copy_review_required/);
  delete cohort.inputs.copyReview;
  assert.throws(() => prepareImport(rows, cohort, importOptions(rows, copyReview)), /matching_copy_review_required/);
});

test('unresolved historical verification instants remain original evidence while fresh reviewed fields support the display', () => {
  const { rows, fresh } = fixture(); const review = reviewFor(rows, fresh);
  const cohort = persisted(cohortFor(prepare(rows, fresh, review)));
  const unresolved = Object.fromEntries(Object.keys(timestamps).map(key => [key,
    { timezone: 'unresolved', evidence: 'Synthetic old wall-clock timezone is not known; do not infer UTC.' }]));
  const packet = prepareImport(rows, cohort, { ...importOptions(rows, review), timestamps: unresolved });
  const current = packet.expectedRows[0]; const original = JSON.parse(current.source_record_json);
  assert.equal(current.created_at, null); assert.equal(current.updated_at, null);
  assert.equal(current.last_verified_at, '2026-10-21T22:18:10.044000Z');
  assert.equal(current.availability_checked_at, current.last_verified_at);
  assert.equal(original.last_verified_at, rows[0].last_verified_at);
  assert.equal(original.availability_checked_at, rows[0].availability_checked_at);
  const provenance = JSON.parse(current.timestamp_provenance_json);
  assert.equal(provenance.fields.last_verified_at.state, 'unresolved');
  assert.equal(provenance.fields.availability_checked_at.state, 'unresolved');
  assert.equal(JSON.parse(current.public_display_json).eligibleUntil, '2026-10-22T22:18:10.044Z');
  const plain = fixture(); plain.fresh.items[0].sourceFacts.itemDimensions.height = '6 inches';
  const originalCohort = cohortFor(prepare(plain.rows, plain.fresh));
  assert.equal(prepareImport(plain.rows, originalCohort, { ...importOptions(plain.rows), timestamps: unresolved }).summary.ready, 1,
    'the fresh transformation is not exclusive to the review lane');
});

test('review checksums, exact IDs, original row/copy/source, fresh facts and final copy all fail closed', () => {
  const mutations = [
    review => { review.entries[0].sourceRowSha256 = '0'.repeat(64); },
    review => { review.entries[0].originalCopySha256 = '0'.repeat(64); },
    review => { review.entries[0].sourceFactsHash = '0'.repeat(64); },
    review => { review.entries[0].copySha256 = '0'.repeat(64); },
    review => { review.entries[0].copy.wittyDescription = 'Unpinned edited copy'; },
    review => { review.entries[0].copy.title = 'A forbidden source-field override'; },
    review => { review.entries[0].id = 'B999999999'; },
    review => { review.entries = []; },
    review => { review.entries.push(structuredClone(review.entries[0])); },
    review => { review.freshReceiptSha256 = '0'.repeat(64); },
    review => { review.reference = ''; },
  ];
  for (const mutate of mutations) {
    const { rows, fresh } = fixture();
    assert.throws(() => prepare(rows, fresh, reviewFor(rows, fresh, mutate)), /Copy review blocked/);
  }
  const { rows, fresh } = fixture(2);
  assert.throws(() => prepare(rows, fresh, reviewFor(rows, fresh, review => { review.entries[1] = structuredClone(review.entries[0]); })), /entry_or_identity/);
  const review = reviewFor(rows, fresh); review.bytes = Buffer.concat([review.bytes, Buffer.from(' ')]);
  assert.throws(() => prepare(rows, fresh, review), /review_checksum/);
  const receipt = reviewFor(rows, fresh); receipt.freshBytes = Buffer.concat([receipt.freshBytes, Buffer.from(' ')]);
  assert.throws(() => prepare(rows, fresh, receipt), /receipt_or_schema/);
  const mismatchedFresh = reviewFor(rows, fresh); fresh.items[0].title += ' Changed again';
  assert.throws(() => prepare(rows, fresh, mismatchedFresh), /fresh_receipt_changed/);
  const original = fixture(); original.rows[0].source_facts_hash = original.rows[0].editorial_source_hash = '0'.repeat(64);
  assert.throws(() => prepare(original.rows, original.fresh, reviewFor(original.rows, original.fresh)), /original_source_hash/);
});

test('review time must be after the observation, no later than now, and cannot renew expired merchant evidence', () => {
  for (const reviewedAt of [OBSERVED, '2026-10-21T22:18:00.000Z', '2026-10-21T22:26:00.000Z', '2026-10-21 22:24:00']) {
    const { rows, fresh } = fixture();
    assert.throws(() => prepare(rows, fresh, reviewFor(rows, fresh, review => { review.reviewedAt = reviewedAt; })), /review_time|canonical UTC/);
  }
  const { rows, fresh } = fixture();
  assert.throws(() => prepare(rows, fresh, reviewFor(rows, fresh), { now: new Date('2026-10-22T22:18:10.044Z') }), /expired_receipt/);
  rows[0].is_active = false; const review = reviewFor(rows, fresh);
  const held = persisted(cohortFor(prepare(rows, fresh, review)));
  assert.throws(() => prepareImport(rows, held, { ...importOptions(rows, review), now: new Date('2026-10-22T22:18:10.044Z') }),
    /expired_receipt/, 'even an all-held import must not present an expired prospective review as current');
});

test('new image requires explicit prospective image review; factual validator and ordinary holds remain effective', () => {
  const { rows, fresh } = fixture(); fresh.items[0].imageUrl = 'https://m.media-amazon.com/images/I/new-asset.jpg';
  assert.throws(() => prepare(rows, fresh, reviewFor(rows, fresh)), /current_facts_or_image/);
  assert.equal(prepare(rows, fresh, reviewFor(rows, fresh, review => { review.entries[0].imageReview = 'reviewed_fresh_image'; })).report.ready, 1);
  const invalid = fixture();
  assert.throws(() => prepare(invalid.rows, invalid.fresh, reviewFor(invalid.rows, invalid.fresh, review => {
    review.entries[0].copy.editorialWriteup = 'Too short.'; review.entries[0].copySha256 = reviewedCopyHash(review.entries[0].copy);
  })), /editorial_validation/);
  for (const [rowPatch, itemPatch, expected] of [
    [{ quality_score: '0.3' }, {}, 'catalog_ineligible'], [{ editorial_quality_score: '0.7' }, {}, 'editorial_hold'],
    [{ editorial_status: 'needs_review' }, {}, 'editorial_hold'], [{ is_active: false }, {}, 'inactive'],
    [{ duplicate_of_product_id: 'other' }, {}, 'duplicate'], [{}, { availabilityStatus: 'OUT_OF_STOCK' }, 'unavailable'],
  ]) {
    const value = fixture(); Object.assign(value.rows[0], rowPatch); Object.assign(value.fresh.items[0], itemPatch);
    const result = prepare(value.rows, value.fresh, reviewFor(value.rows, value.fresh));
    assert.equal(result.report.ready, 0); assert.equal(result.report.decisions[0].reason, expected);
  }
  const price = fixture();
  const result = prepare(price.rows, price.fresh, reviewFor(price.rows, price.fresh, review => {
    review.entries[0].copy.wittyDescription = 'Only $19.99'; review.entries[0].copySha256 = reviewedCopyHash(review.entries[0].copy);
  }));
  assert.equal(result.report.decisions[0].reason, 'price_claim_in_copy');
});

test('editing consistent prepared JSON, model history or review provenance cannot replace independent reconstruction', () => {
  for (const mutate of [
    cohort => { cohort.inputs.products[0].wittyDescription = 'Unreviewed replacement copy'; },
    cohort => { cohort.inputs.products[0].editorialModel = 'invented-new-model'; },
    cohort => { cohort.inputs.products[0].editorialGeneratedAt = REVIEWED; },
    cohort => { cohort.inputs.products[0].editorialStatus = 'manual_locked'; },
    cohort => { cohort.inputs.copyReview.review.reference += '-changed'; },
    cohort => { cohort.rights[cohort.inputs.products[0].id].title.expiresAt = '2026-10-22T22:24:00.000Z'; },
  ]) {
    const { rows, fresh } = fixture(); const review = reviewFor(rows, fresh); const cohort = persisted(cohortFor(prepare(rows, fresh, review)));
    mutate(cohort);
    assert.throws(() => prepareImport(rows, cohort, importOptions(rows, review)), /changed|disagree|Invalid catalog/);
  }
  const { rows, fresh } = fixture(); const review = reviewFor(rows, fresh); const cohort = persisted(cohortFor(prepare(rows, fresh, review)));
  const input = cohort.inputs.products[0]; input.wittyDescription = 'A consistently forged prepared description'; input.description = input.wittyDescription;
  for (const key of ['wittyDescription', 'description']) cohort.rights[input.id][key].value = input.wittyDescription;
  cohort.snapshot = createCatalogSnapshot(cohort.inputs.products, cohort.rights, { catalogRevision: cohort.snapshot.catalogRevision, now: NOW });
  assert.throws(() => prepareImport(rows, cohort, importOptions(rows, review)), /reviewed_cohort_changed/);
  const plain = fixture(); plain.fresh.items[0].sourceFacts.itemDimensions.height = '6 inches';
  const unreviewed = persisted(cohortFor(prepare(plain.rows, plain.fresh))); const product = unreviewed.inputs.products[0];
  product.punnyTitle = 'An unreviewed edited pun'; unreviewed.rights[product.id].punnyTitle.value = product.punnyTitle;
  unreviewed.snapshot = createCatalogSnapshot(unreviewed.inputs.products, unreviewed.rights, { catalogRevision: unreviewed.snapshot.catalogRevision, now: NOW });
  assert.throws(() => prepareImport(plain.rows, unreviewed, importOptions(plain.rows)), /unreviewed_copy_transformation/);
});

test('both CLIs round-trip the pinned review, null optional copy, private evidence and exact original bytes', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'stupid-gifts-copy-review-'))); t.after(() => rm(directory, { recursive: true, force: true }));
  const { rows, fresh } = fixture(); fresh.observedAt = new Date(Date.now() - 120_000).toISOString();
  const review = reviewFor(rows, fresh, document => { document.reviewedAt = new Date(Date.now() - 60_000).toISOString(); });
  const productsPath = join(directory, 'products.ndjson'), freshPath = join(directory, 'fresh.json'), reviewPath = join(directory, 'review.json');
  const sourceBytes = `${rows.map(JSON.stringify).join('\n')}\n`;
  for (const [file, bytes] of [[productsPath, sourceBytes], [freshPath, review.freshBytes], [reviewPath, review.bytes], [join(directory, 'timestamps.json'), JSON.stringify(timestamps)]]) {
    await writeFile(file, bytes, { mode: 0o600 });
  }
  const cohortPath = join(directory, 'cohort'), packetPath = join(directory, 'packet');
  const env = { ...process.env, AMAZON_ASSOCIATE_TAG: TAG };
  const prepareArgs = ['--experimental-strip-types', resolve('scripts/staging/prepare-cohort.mts'), '--products', productsPath,
    '--fresh', freshPath, '--ids', rows[0].id, '--revision', 'synthetic-cli-review', '--output', cohortPath, '--review', reviewPath, '--review-sha256', review.sha256];
  assert.equal(JSON.parse(execFileSync(process.execPath, prepareArgs, { encoding: 'utf8', env })).ready, 1);
  const importArgs = ['--experimental-strip-types', resolve('scripts/staging/prepare-import.mts'), '--products', productsPath,
    '--cohort', cohortPath, '--timestamps', join(directory, 'timestamps.json'), '--archive-id', 'synthetic-cli-source',
    '--embedding-encoding', 'postgres-text', '--output', packetPath, '--review', reviewPath, '--review-sha256', review.sha256, '--fresh', freshPath];
  assert.equal(JSON.parse(execFileSync(process.execPath, importArgs, { encoding: 'utf8', env })).ready, 1);
  assert.equal((await stat(join(packetPath, 'copy-review-provenance.json'))).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(join(packetPath, 'copy-review-provenance.json'), 'utf8')).reviewSha256, review.sha256);
  const imported = JSON.parse(await readFile(join(packetPath, 'expected-products.json'), 'utf8'));
  const original = { ...rows[0] }; delete original.embedding;
  assert.equal(imported[0].source_record_json, canonicalJson(original));
  assert.equal(await readFile(productsPath, 'utf8'), sourceBytes);
  assert.deepEqual(await readFile(freshPath), review.freshBytes); assert.deepEqual(await readFile(reviewPath), review.bytes);
  for (const args of [prepareArgs, importArgs]) {
    const tampered = args.map(value => value === review.sha256 ? '0'.repeat(64) : value === cohortPath && args === prepareArgs ? join(directory, 'bad-cohort') : value === packetPath ? join(directory, 'bad-packet') : value);
    assert.notEqual(spawnSync(process.execPath, tampered, { env }).status, 0);
  }
  const read = () => readCopyReview(reviewPath, review.sha256, freshPath, resolve('.'));
  await chmod(reviewPath, 0o644); await assert.rejects(read, /private_input/); await chmod(reviewPath, 0o600);
  const link = join(directory, 'review-link.json'); await symlink(reviewPath, link);
  await assert.rejects(() => readCopyReview(link, review.sha256, freshPath, resolve('.')));
  const invalid = Buffer.from([0x7b, 0xff, 0x7d]); await writeFile(reviewPath, invalid, { mode: 0o600 });
  await assert.rejects(() => readCopyReview(reviewPath, byteHash(invalid), freshPath, resolve('.')), /invalid_utf8/);
});
