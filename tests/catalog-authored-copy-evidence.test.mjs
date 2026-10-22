import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { mapAuthoredCopyEvidence } from '../scripts/catalog/authored-copy-evidence.ts';
import { editorialSourceHash, editorialWordCount, validateEditorialDraft } from '../scripts/ops/catalog-editorial-core.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = 'a'.repeat(64);
const writeup = `The clockwork brass goose is a desk paperweight with a winding key and a weighted green base. Its compact bird shape gives the ordinary job of holding papers a more theatrical presence. The brass body and green base are the concrete details that distinguish this goose from a soft toy or a kitchen ornament. The winding key is a visible part of the design, not evidence that the bird walks, sings, or performs any other mechanical trick. Treat it as a paperweight unless the retailer supplies additional information about a working mechanism.

This goose makes sense for someone who enjoys an odd object on an otherwise sensible desk. A stationery enthusiast, a bird watcher, or a colleague with a collection of animal ornaments could give the small interruption a place beside their notebooks. The joke is the contrast between a serious paperweight and a goose that appears ready for a tiny clockwork adventure. Check the retailer for dimensions and package details before choosing a spot for it. Nothing in this description promises an exact size, a particular weight, or extra accessories.`;

function product(overrides = {}) {
  const source = { title: 'Clockwork Brass Goose Desk Paperweight', imageUrl: 'https://supplier.invalid/old-photo.jpg',
    sourceFacts: { material: 'brass', color: 'green', features: ['Winding key', 'Weighted green base'] } };
  assert.equal(validateEditorialDraft(source, writeup).approved, true);
  const sourceHash = editorialSourceHash(source);
  return { id: 'B000000001', public_id: '00000000-0000-4000-8000-000000000001', slug: 'clockwork-goose', source: 'amazon',
    title: source.title, image_url: source.imageUrl, source_facts: JSON.stringify(source.sourceFacts), source_facts_hash: sourceHash,
    editorial_source_hash: sourceHash, punny_title: 'A Goose With a Desk Job', witty_description: 'A brass bird for serious paperwork.',
    editorial_writeup: writeup, editorial_status: 'generated_ready', editorial_quality_score: '0.91', editorial_model: 'gpt-4o-mini',
    editorial_prompt_version: 'catalog-editorial-v2', editorial_generated_at: '2026-08-07 12:34:56.123456', editorial_block_reason: null,
    source_query: 'peculiar desk gifts', is_active: true, duplicate_of_product_id: null, quality_score: '0.72',
    price: '99.99', affiliate_url: 'https://supplier.invalid/old-api-link', embedding: 'AAAAAIAAAAA=', ...overrides };
}
function event(row, overrides = {}) {
  return { id: `event-${row.id}`, product_id: row.id, status: 'generated_ready', event_type: 'enriched',
    details: JSON.stringify({ sourceFactsHash: row.editorial_source_hash, editorialSourceHash: row.editorial_source_hash, model: row.editorial_model,
      promptVersion: row.editorial_prompt_version, finalWordCount: editorialWordCount(row.editorial_writeup) }), ...overrides };
}
function table(name, rows) {
  const raw = rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  return { definition: { schema: 'public', name, rowCount: rows.length, sha256: hash(raw),
    columns: Object.keys(rows[0] || {}).map(name => ({ name })) }, raw, rows };
}
function setup(rows = [product()], eventRows = rows.map(row => event(row))) {
  const tables = [table('products', rows), table('catalog_editorial_events', eventRows)];
  const archive = { summary: { manifestSha256: manifest, tables: tables.map(t => ({ schema: 'public', name: t.definition.name,
    sourceSha256: t.definition.sha256, rowCount: t.definition.rowCount })) }, tables };
  const raw = JSON.stringify({ products: [{ id: rows[0].id, punnyTitle: rows[0].punny_title, wittyDescription: rows[0].witty_description }] });
  const options = { expectedManifestSha256: manifest, archiveReference: 'private:synthetic-authoring-fixture',
    canonicalAffiliateTag: 'fixture-20', seeds: [{ reference: 'repo:synthetic-seed', raw, expectedSha256: hash(raw) }] };
  return { archive, options, run: () => mapAuthoredCopyEvidence(archive, options) };
}

test('positive fields are exact, independently hashed evidence; source/native bytes and old times remain unchanged', () => {
  const fixture = setup(); const before = structuredClone(fixture.archive);
  const packet = fixture.run(), value = packet.products[0];
  assert.deepEqual(fixture.archive, before);
  assert.equal(value.sourceRowSha256, hash(JSON.stringify(before.tables[0].rows[0])));
  assert.equal(value.fields.title.value, 'Clockwork goose');
  assert.equal(value.fields.title.kind, 'slug_identity_label');
  assert.equal(value.fields.punnyTitle.kind, 'committed_seed_exact');
  assert.equal(value.fields.description.kind, 'committed_seed_exact');
  assert.equal(value.fields.editorialWriteup.value, writeup);
  assert.equal(value.fields.editorialWriteup.kind, 'recorded_generation');
  assert.equal(value.fields.editorialWriteup.references.some(ref => ref.includes('/catalog_editorial_events/')), true);
  assert.equal(value.authoring.generatedAtRaw, '2026-08-07 12:34:56.123456');
  assert.equal(value.fields.retailerUrl.value, 'https://www.amazon.com/dp/B000000001?tag=fixture-20');
  assert.deepEqual(value.image, { kind: 'local_svg_placeholder' });
  for (const field of Object.values(value.fields)) assert.equal(field.sha256, hash(field.value));
  const encoded = JSON.stringify(packet);
  for (const excluded of ['old-photo.jpg', '99.99', 'old-api-link', 'AAAAAIAAAAA=', 'rights', 'observedAt', 'expiresAt', 'eligibleUntil'])
    assert.equal(encoded.includes(excluded), false);
  // Mutating parsed .rows cannot launder different text past the pinned raw table.
  fixture.archive.tables[0].rows[0].witty_description = 'unbound changed copy';
  assert.deepEqual(fixture.run(), packet);
});

test('exact local fallback is positive construction evidence; merchant-title truncation is not authored title', () => {
  const row = product({ punny_title: 'Clockwork Brass Goose Desk Paperweight',
    witty_description: 'Found while hunting for peculiar desk gifts.' });
  assert.equal(setup([row]).run().products[0].fields.punnyTitle, undefined); // Even a seed is not a rights shortcut for copied listing titles.
  const fixture = setup([row]); fixture.options.seeds = [];
  const value = fixture.run().products[0];
  assert.equal(value.fields.punnyTitle, undefined);
  assert.equal(value.fields.description.kind, 'local_fallback_exact');
  assert.equal(value.fields.description.references.some(ref => ref.includes('#fallbackWittyDescription:sha256:')), true);
  const unknown = setup([product({ witty_description: 'Unproven short copy.' })]); unknown.options.seeds = [];
  assert.equal(unknown.run().products[0].fields.description, undefined);
});

test('manifest/table/seed bytes, row coverage and all identities fail closed without logging bodies', () => {
  for (const mutate of [
    f => { f.options.expectedManifestSha256 = 'b'.repeat(64); },
    f => { f.archive.tables[0].raw = f.archive.tables[0].raw.replace('99.99', '98.99'); },
    f => { f.archive.summary.tables[0].sourceSha256 = 'b'.repeat(64); },
    f => { f.archive.tables[0].definition.rowCount++; },
    f => { f.options.seeds[0].raw += ' '; },
    f => { f.options.canonicalAffiliateTag = 'tag&injected=yes'; },
  ]) { const fixture = setup(); mutate(fixture); assert.throws(fixture.run, /^Error: authored_copy_/); }
  for (const change of [{ id: 'not-an-asin' }, { source: 'etsy' }, { slug: '../escape' }, { public_id: 'not-a-uuid' }]) {
    const fixture = setup([product(change)]); fixture.options.seeds = [];
    assert.throws(fixture.run, /product_identity/);
  }
  assert.throws(setup([product(), product()]).run, /event_identity|product_identity/);
  assert.throws(setup([product()], [event(product(), { product_id: 'B999999999' })]).run, /event_product_missing/);
  for (const quality_score of ['', '0x1', '-.5', '1.1']) assert.throws(setup([product({ quality_score })]).run, /curation_invalid/);
});

test('generation metadata alone, stale facts, wrong event, quality/curation status and mutable claims cannot approve long copy', () => {
  for (const change of [
    { editorial_model: 'human-editor', editorial_prompt_version: 'manual-v1' },
    { editorial_model: 'unrecognized-model' }, { editorial_prompt_version: 'future-prompt' },
    { editorial_generated_at: null }, { editorial_generated_at: '2026-02-31 00:00:00' }, { editorial_status: 'stale' }, { editorial_status: 'blocked' },
    { editorial_quality_score: '0.79' }, { source_facts_hash: 'b'.repeat(64) },
    { source_facts: JSON.stringify({ material: 'plastic' }) },
    { editorial_writeup: `${writeup}\n\nCurrently available for USD 10.` },
  ]) assert.equal(setup([product(change)]).run().products[0].fields.editorialWriteup, undefined);
  for (const change of [{ sourceFactsHash: 'b'.repeat(64) }, { editorialSourceHash: 'b'.repeat(64) }, { model: 'other' }, { promptVersion: 'other' }, { finalWordCount: 1 }]) {
    const row = product(); const original = event(row); original.details = JSON.stringify({ ...JSON.parse(original.details), ...change });
    assert.equal(setup([row], [original]).run().products[0].fields.editorialWriteup, undefined);
  }
  assert.equal(setup([product()], []).run().products[0].fields.editorialWriteup, undefined);
});

test('short evidence is per field and exact after only the documented writer transform; price/offer copy is excluded', () => {
  const fixture = setup();
  const seed = JSON.parse(fixture.options.seeds[0].raw); seed.products[0].wittyDescription = 'different description';
  fixture.options.seeds[0].raw = JSON.stringify(seed); fixture.options.seeds[0].expectedSha256 = hash(fixture.options.seeds[0].raw);
  const fields = fixture.run().products[0].fields;
  assert.equal(fields.punnyTitle.kind, 'committed_seed_exact'); assert.equal(fields.description, undefined);
  for (const description of ['Only $10 today.', 'Now in stock.', 'Available now.', 'In stock.', 'Found while hunting for USD 20 gifts.']) {
    const row = product({ witty_description: description, source_query: 'USD 20 gifts' });
    assert.equal(setup([row]).run().products[0].fields.description, undefined);
  }
  const title = setup([product({ slug: 'goose-now-in-stock' })]).run().products[0].fields.title;
  assert.equal(title.kind, 'id_identity_label'); assert.equal(title.value, 'Catalog gift B000000001');
});

test('all identities survive independent of original inactive/duplicate/low-quality holds, with no fake readiness', () => {
  const rows = [product(), product({ id: 'B000000002', public_id: '00000000-0000-4000-8000-000000000002', slug: 'held-goose', is_active: false }),
    product({ id: 'B000000003', public_id: '00000000-0000-4000-8000-000000000003', slug: 'duplicate-goose', duplicate_of_product_id: 'B000000001' }),
    product({ id: 'B000000004', public_id: '00000000-0000-4000-8000-000000000004', slug: 'low-score-goose', quality_score: '0.54' })];
  const packet = setup(rows).run();
  assert.equal(packet.counts.identities, 4); assert.equal(packet.counts.activeNonduplicateQuality055, 1);
  assert.deepEqual(packet.products.map(p => p.curation.isActive), [true, false, true, true]);
  assert.equal(packet.products[2].curation.duplicateOfProductId, 'B000000001');
  assert.equal(packet.products[3].curation.qualityScore, .54);
  assert.equal(JSON.stringify(packet).includes('ready: true'), false);
});

test('UTF-8 field hashes and historical fallback truncation are byte-exact, never whitespace-normalized afterward', () => {
  const query = 'café ' + 'peculiar '.repeat(30);
  const raw = `Found while hunting for ${query}.`.replace(/\s+/g, ' ').trim();
  const fallback = `${raw.slice(0, 147).trim()}...`;
  const fixture = setup([product({ source_query: query, witty_description: fallback })]); fixture.options.seeds = [];
  const field = fixture.run().products[0].fields.description;
  assert.equal(field.value, fallback); assert.equal(field.sha256, hash(fallback));
});

test('historical recipe/validator references pin the actual reviewed source, rather than unversioned future behavior', () => {
  const fixture = setup([product({ witty_description: 'Found while hunting for peculiar desk gifts.' })]); fixture.options.seeds = [];
  const fields = fixture.run().products[0].fields;
  for (const [field, file, symbol] of [[fields.description, 'prefetch-catalog.mjs', 'fallbackWittyDescription'],
    [fields.editorialWriteup, 'catalog-editorial-core.mjs', 'validateEditorialDraft']]) {
    const ref = field.references.find(ref => ref.includes(`/${file}#${symbol}:sha256:`));
    assert.ok(ref);
    const match = /^repo:([a-f0-9]{40})\/(scripts\/ops\/[^#]+)#([^:]+):sha256:([a-f0-9]{64})$/.exec(ref);
    assert.ok(match);
    assert.equal(match[1], '7223ead2619eb3f5937d5a826639603f50a13fdf');
    assert.equal(match[2], `scripts/ops/${file}`);assert.equal(match[3], symbol);
    // Compare the immutable reviewed blob, not unrelated future edits to the
    // current checkout. Never relabel a historical recipe to make a test green.
    const bytes = execFileSync('git', ['show', `${match[1]}:${match[2]}`], { cwd: new URL('../', import.meta.url) });
    assert.equal(hash(bytes), match[4]);
    assert.match(bytes.toString(), new RegExp(`function ${symbol}\\b`));
  }
});
