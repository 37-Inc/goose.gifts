import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decodeTextArray, prepareCohort } from '../scripts/staging/prepare-cohort.mts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const OBSERVED = new Date(NOW.getTime() - 60_000).toISOString();
const TAG = 'test-canonical-20';
function fixture(number = 1, rowOverrides = {}, itemOverrides = {}) {
  const id = `B${String(number).padStart(9, '0')}`;
  const item = { id, title: 'Funny Fart Button Gag Gift', imageUrl: 'https://m.media-amazon.com/images/I/button.jpg',
    affiliateUrl: `https://www.amazon.com/dp/${id}?tag=untrusted-20&tracking=imported`, source: 'amazon',
    remotelyVerified: true, availabilityStatus: 'IN_STOCK', price: 19.99, currency: 'USD',
    sourceFacts: { features: ['A physical sound button.', 'The button sits on a desk.'], color: 'red' }, ...itemOverrides };
  const hash = editorialSourceHash(item);
  const row = { id, public_id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`, slug: `fart-button-${number}`,
    title: item.title, image_url: item.imageUrl, affiliate_url: item.affiliateUrl, source: 'amazon', is_active: true,
    quality_score: '0.80', editorial_quality_score: '0.90', editorial_status: 'generated_ready',
    editorial_source_hash: hash, source_facts_hash: hash, source_facts: JSON.stringify(item.sourceFacts),
    humor_tags: '{prank,"office-safe"}', punny_title: 'Meeting Adjourned', witty_description: 'A red button that makes a deliberately ridiculous desk gift.',
    editorial_writeup: `${'This red button sits on a desk and makes a ridiculous sound for a carefully chosen recipient. '.repeat(8)}\n\n${'The physical button is a deliberately silly object and the recipient can decide whether the joke belongs on their desk. '.repeat(7)}`,
    editorial_generated_at: '2026-10-01 17:20:00', price: '19.99', currency: 'USD', duplicate_of_product_id: null,
    ...rowOverrides };
  return { row, item };
}
function prepare(cohort, { receipt = {}, ...options } = {}) {
  return prepareCohort(cohort.map(({ row }) => row), { observedAt: OBSERVED, reference: 'protected getItems test receipt',
    items: cohort.map(({ item }) => item), ...receipt }, { ids: cohort.map(({ row }) => row.id),
    catalogRevision: 'staging-test-r1', affiliateTag: TAG, now: NOW, ...options });
}

test('unchanged fresh cohort preserves identity and grants only value-specific merchant rights for at most 24h', () => {
  const input = fixture(); const original = structuredClone(input);
  const result = prepare([input]);
  assert.deepEqual(input, original);
  assert.deepEqual({ ready: result.report.ready, held: result.report.held }, { ready: 1, held: 0 });
  const publicProduct = result.snapshot.products[0];
  assert.equal(publicProduct.id, input.row.id);
  assert.equal(publicProduct.publicId, input.row.public_id);
  assert.equal(publicProduct.slug, input.row.slug);
  assert.equal(publicProduct.price, 0);
  assert.equal(new URL(publicProduct.affiliateUrl).search, `?tag=${TAG}`);
  assert.equal(publicProduct.eligibleUntil, new Date(Date.parse(OBSERVED) + 24 * 3600_000).toISOString());
  assert.equal(result.inputs[0].editorialGeneratedAt, input.row.editorial_generated_at);
  assert.match(result.sourceRowSha256ById[input.row.id], /^[a-f0-9]{64}$/);
  for (const [field, right] of Object.entries(result.rightsById[input.row.id])) {
    assert.equal(right.basis, 'merchant');
    assert.equal(right.observedAt, OBSERVED);
    assert.equal(Date.parse(right.expiresAt) - Date.parse(right.observedAt), 24 * 3600_000);
    assert.match(right.reference, /protected getItems test receipt; unchanged source/);
    assert.equal(right.value, field === 'humorTags' ? JSON.stringify(publicProduct[field]) : publicProduct[field]);
  }
  assert.doesNotMatch(JSON.stringify(result.snapshot), /sourceFacts|editorialSourceHash|sourceRowSha|19\.99|untrusted-20/);
  assert.doesNotMatch(JSON.stringify(result), /"basis":"(?:owned|licensed)"|19\.99/);
});

test('the inherited editorial is held for any factual hash change, even manual_locked', () => {
  for (const editorial_status of ['generated_ready', 'manual_locked']) {
    const input = fixture(1, { editorial_status });
    input.item.sourceFacts.features.push('A materially changed listing fact.');
    const result = prepare([input]);
    assert.equal(result.report.ready, 0);
    assert.equal(result.report.decisions[0].reason, 'source_facts_changed');
    assert.equal(result.snapshot.heldProducts[0].publicId, input.row.public_id);
    assert.doesNotMatch(JSON.stringify(result.snapshot), /red button|imageUrl|affiliateUrl|editorialWriteup/);
  }
  const missingHash = prepare([fixture(1, { editorial_status: 'manual_locked', editorial_source_hash: null })]);
  assert.equal(missingHash.report.ready, 0);
});

test('missing fresh title, image, exact destination or listing facts fails closed without old-field fallback', () => {
  for (const patch of [
    { title: '' }, { imageUrl: '' }, { imageUrl: 'https://evil.test/image.jpg' },
    { affiliateUrl: '' }, { affiliateUrl: 'https://www.amazon.com/dp/B999999999?tag=wrong-20' },
    { sourceFacts: null }, { remotelyVerified: false },
  ]) {
    const input = fixture(); Object.assign(input.item, patch);
    const result = prepare([input]);
    assert.equal(result.report.ready, 0, JSON.stringify(patch));
    assert.equal(result.report.decisions[0].reason, 'incomplete_fresh_content');
    assert.deepEqual(result.rightsById[input.row.id], {});
  }
  assert.equal(prepare([fixture()], { receipt: { items: [] } }).report.decisions[0].reason, 'missing_fresh_item');
});

test('availability, source holds, quality and duplicate families remain hard gates', () => {
  for (const [row, item, reason] of [
    [{ is_active: false }, {}, 'inactive'], [{ duplicate_of_product_id: 'original-winner' }, {}, 'duplicate'],
    [{ quality_score: '0.30' }, {}, 'catalog_ineligible'], [{ editorial_quality_score: '0.70' }, {}, 'editorial_hold'],
    [{ editorial_status: 'needs_review' }, {}, 'editorial_hold'], [{}, { availabilityStatus: 'OUT_OF_STOCK' }, 'unavailable'],
  ]) {
    const result = prepare([fixture(1, row, item)]);
    assert.equal(result.report.ready, 0);
    assert.equal(result.report.decisions[0].reason, reason);
  }
  const duplicateFamily = prepare([fixture(2), fixture(1)]);
  assert.equal(duplicateFamily.report.ready, 1);
  assert.equal(duplicateFamily.report.held, 1);
  assert.equal(duplicateFamily.report.decisions.find((item) => item.status === 'held').reason, 'duplicate_family');
  assert.equal(duplicateFamily.snapshot.products[0].id, 'B000000001');
});

test('inherited offer/price language is held even when the factual source hash is unchanged', () => {
  for (const witty_description of ['A ridiculous button for only $19.99.', 'A 20 dollar desk joke.', 'Now EUR 15.']) {
    const result = prepare([fixture(1, { witty_description })]);
    assert.equal(result.report.ready, 0);
    assert.equal(result.report.decisions[0].reason, 'price_claim_in_copy');
    assert.doesNotMatch(JSON.stringify(result.snapshot), /19\.99|20 dollar|EUR 15/);
  }
});

test('old or future receipts cannot refresh merchant content; bounds and duplicate identities refuse', () => {
  const expired = prepare([fixture()], { receipt: { observedAt: new Date(NOW.getTime() - 24 * 3600_000).toISOString() } });
  assert.equal(expired.report.ready, 0);
  assert.equal(expired.report.decisions[0].reason, 'expired_receipt');
  assert.throws(() => prepare([fixture()], { receipt: { observedAt: new Date(NOW.getTime() + 1).toISOString() } }), /future/);
  assert.throws(() => prepare([fixture()], { receipt: { observedAt: '2026-10-19 11:59:00' } }), /canonical UTC/);
  assert.throws(() => prepare([fixture()], { affiliateTag: '' }), /configuration/);
  assert.throws(() => prepare([fixture(), fixture()]), /unique/);
  assert.throws(() => prepare(Array.from({ length: 11 }, (_, index) => fixture(index + 1))), /1\.\.10/);
  assert.throws(() => prepare([fixture()], { receipt: { items: [fixture().item, fixture().item] } }), /duplicate fresh/);
});

test('Postgres text arrays preserve quotes and escaped commas, refusing malformed source tags', () => {
  assert.deepEqual(decodeTextArray('{prank,"office-safe"}'), ['prank', 'office-safe']);
  assert.deepEqual(decodeTextArray(String.raw`{"a,b","quote\"tag","back\\slash"}`), ['a,b', 'quote"tag', 'back\\slash']);
  assert.deepEqual(decodeTextArray('{}'), []);
  for (const value of ['{a,}', '{NULL}', '{{nested}}', '{"unterminated}', '{"a"junk}', 'not-an-array']) assert.throws(() => decodeTextArray(value));
});

test('CLI writes only a new protected offline package, preserving input bytes and rejecting public input modes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'stupid-gifts-cohort-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const current = new Date();
  const input = fixture();
  const productsPath = join(directory, 'products.ndjson'); const freshPath = join(directory, 'fresh.json');
  const productsText = `${JSON.stringify(input.row)}\n`;
  await writeFile(productsPath, productsText, { mode: 0o600 });
  await writeFile(freshPath, JSON.stringify({ observedAt: current.toISOString(), reference: 'private fixture receipt', items: [input.item] }), { mode: 0o600 });
  const output = join(directory, 'cohort');
  const script = resolve('scripts/staging/prepare-cohort.mts');
  const args = ['--experimental-strip-types', script, '--products', productsPath, '--fresh', freshPath, '--ids', input.row.id, '--revision', 'test-private-release', '--output', output];
  const run = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, AMAZON_ASSOCIATE_TAG: TAG } }));
  assert.equal(run.ready, 1);
  assert.equal((await stat(output)).mode & 0o777, 0o700);
  for (const file of ['catalog.snapshot.json', 'rights.json', 'inputs.json', 'report.json']) assert.equal((await stat(join(output, file))).mode & 0o777, 0o600);
  assert.equal(await readFile(productsPath, 'utf8'), productsText);
  assert.notEqual(spawnSync(process.execPath, args, { env: { ...process.env, AMAZON_ASSOCIATE_TAG: TAG } }).status, 0, 'must not overwrite an existing package');
  const unsafe = join(directory, 'unsafe.json');
  await writeFile(unsafe, await readFile(freshPath), { mode: 0o644 });
  const unsafeArgs = args.map((value) => value === freshPath ? unsafe : value === output ? join(directory, 'unsafe-output') : value);
  assert.notEqual(spawnSync(process.execPath, unsafeArgs, { env: { ...process.env, AMAZON_ASSOCIATE_TAG: TAG } }).status, 0);
});
