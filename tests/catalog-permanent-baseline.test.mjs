import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { assemblePermanentBaseline } from '../scripts/catalog/permanent-baseline.ts';
import { mapAuthoredCopyEvidence } from '../scripts/catalog/authored-copy-evidence.ts';
import { canonicalJson } from '../scripts/catalog/migration.ts';
import { createPersistentCatalogProduct } from '../lib/catalog/snapshot.ts';
import { editorialSourceHash, editorialWordCount } from '../scripts/ops/catalog-editorial-core.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const now = new Date('2026-10-22T00:00:00.000Z'), path = '/images/gift-placeholder.svg';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="none"><rect width="640" height="640" rx="32" fill="#f5efe6"/><g stroke="#bd6434" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><rect x="180" y="278" width="280" height="74" rx="8"/><path d="M204 352v150h232V352M320 278v224"/><path d="M320 278c-24-94-114-112-114-54 0 44 73 54 114 54Zm0 0c24-94 114-112 114-54 0 44-73 54-114 54Z"/></g></svg>\n';
assert.equal(hash(svg), '028719ab3af0595f0648f5288942fe813ed0d2a819c65f2d14e1d042a72a3f9d');
const article = `The clockwork brass goose is a desk paperweight with a winding key and a weighted green base. Its compact bird shape gives the ordinary job of holding papers a more theatrical presence. The brass body and green base are the concrete details that distinguish this goose from a soft toy or a kitchen ornament. The winding key is a visible part of the design, not evidence that the bird walks, sings, or performs any other mechanical trick. Treat it as a paperweight unless the retailer supplies additional information about a working mechanism.

This goose makes sense for someone who enjoys an odd object on an otherwise sensible desk. A stationery enthusiast, a bird watcher, or a colleague with a collection of animal ornaments could give the small interruption a place beside their notebooks. The joke is the contrast between a serious paperweight and a goose that appears ready for a tiny clockwork adventure. Check the retailer for dimensions and package details before choosing a spot for it. Nothing in this description promises an exact size, a particular weight, or extra accessories.`;
function fixture(count = 2) {
  const rows = Array.from({ length: count }, (_, n) => {
    const id = `B0${String(n).padStart(8, '0')}`, source = { title: n ? `Merchant listing ${id}` : 'Clockwork Brass Goose Desk Paperweight',
      imageUrl: `https://supplier.invalid/archived-${id}.jpg`, sourceFacts: { material: 'brass', color: 'green', features: ['Winding key', 'Weighted green base'] } };
    const factualHash = editorialSourceHash(source);
    return { id, public_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, slug: `catalog-object-${n}`, source: 'amazon',
      title: source.title, image_url: source.imageUrl, source_facts: JSON.stringify(source.sourceFacts), source_facts_hash: factualHash,
      editorial_source_hash: factualHash, source_query: 'synthetic fixtures', punny_title: n ? source.title : 'A Goose With a Desk Job',
      witty_description: n ? 'Found while hunting for synthetic fixtures.' : 'A brass bird for serious paperwork.',
      editorial_writeup: n ? '' : article, editorial_model: n ? null : 'gpt-4o-mini', editorial_prompt_version: n ? null : 'catalog-editorial-v2',
      editorial_generated_at: n ? null : '2026-08-07 12:34:56.123456', editorial_quality_score: n ? null : '.91',
      editorial_status: n ? 'pending' : 'generated_ready', editorial_block_reason: null,
      is_active: true, duplicate_of_product_id: null, quality_score: '0.80', currency: 'USD', price: '99.99', embedding: 'native-bytes-marker' };
  });
  const events = [{ id: 'synthetic-event', product_id: rows[0].id, details: JSON.stringify({ sourceFactsHash: rows[0].source_facts_hash,
    editorialSourceHash: rows[0].editorial_source_hash, model: rows[0].editorial_model, promptVersion: rows[0].editorial_prompt_version,
    finalWordCount: editorialWordCount(article) }) }];
  const tables = [['products', rows], ['catalog_editorial_events', events]].map(([name, data]) => {
    const raw = data.map(row => JSON.stringify(row)).join('\n') + '\n';
    return { raw, rows: data, definition: { schema: 'public', name, sha256: hash(raw), rowCount: data.length,
      columns: Object.keys(data[0]).map(name => ({ name })) } };
  });
  const manifest = 'a'.repeat(64), seed = JSON.stringify({ products: [{ id: rows[0].id,
    punnyTitle: rows[0].punny_title, wittyDescription: rows[0].witty_description }] });
  const evidence = mapAuthoredCopyEvidence({ tables, summary: { manifestSha256: manifest,
    tables: tables.map(t => ({ schema: 'public', name: t.definition.name, sourceSha256: t.definition.sha256, rowCount: t.rows.length })) } },
  { expectedManifestSha256: manifest, archiveReference: 'private:synthetic-fixture', canonicalAffiliateTag: 'fixture-20',
    seeds: [{ reference: 'repo:synthetic-seed', raw: seed, expectedSha256: hash(seed) }] });
  const current = rows.map(row => ({ id: row.id, publicId: row.public_id, slug: row.slug, source: row.source, currency: row.currency,
    title: row.title, imageUrl: row.image_url, affiliateUrl: 'https://supplier.invalid/old-api-link', price: 99.99,
    punnyTitle: row.punny_title, wittyDescription: row.witty_description, editorialWriteup: row.editorial_writeup,
    editorialModel: row.editorial_model, editorialPromptVersion: row.editorial_prompt_version, editorialQualityScore: Number(row.editorial_quality_score),
    sourceFacts: JSON.parse(row.source_facts), sourceFactsHash: row.source_facts_hash, editorialSourceHash: row.editorial_source_hash,
    editorialStatus: row.editorial_status, isActive: true, qualityScore: .8, embedding: row.embedding }));
  // These are explicit synthetic ROOT approvals, not approvals emitted by the assembler.
  const grant = value => ({ basis: 'owned', value, reference: 'Synthetic root-supplied exact-value approval; not real product rights' });
  const approvedRightsById = Object.fromEntries(evidence.products.map(p => [p.id, {
    title: grant(p.fields.title.value), description: grant(p.fields.title.value), imageUrl: grant(path), affiliateUrl: grant(p.fields.retailerUrl.value),
  }]));
  const options = { expectedEvidenceSha256: hash(canonicalJson(evidence)), approvedRightsById,
    placeholder: { path, bytes: Buffer.from(svg), expectedSha256: hash(svg) }, now };
  return { evidence, current, options, rows, tables, grant, run: () => assemblePermanentBaseline(evidence, current, options) };
}

test('3383 identities reconcile without enrichment, supplier fields or source/native mutations', () => {
  const f = fixture(3383), unchanged = () => hash(JSON.stringify({ evidence: f.evidence, rows: f.rows,
    current: f.current, tables: f.tables, options: f.options })), before = unchanged();
  const result = f.run();
  assert.equal(result.reconciliation.identityCount, 3383); assert.equal(result.proposed.length, 3383); assert.equal(result.holds.length, 0);
  assert.equal(new Set(result.reconciliation.identities.map(p => p.publicId)).size, 3383);
  for (const item of result.proposed) {
    const display = createPersistentCatalogProduct(item.input, now);
    assert.equal(display.eligibleUntil, null); assert.equal(display.indexable, false); assert.equal(display.price, 0);
    assert.equal(display.description, display.title); assert.equal(display.imageUrl, path);
    assert.equal(item.input.rights.title.reference, f.options.approvedRightsById[item.id].title.reference);
  }
  assert.doesNotMatch(JSON.stringify(result), /supplier\.invalid|Merchant listing|native-bytes-marker|Found while hunting|99\.99/);
  assert.equal(unchanged(), before);
  f.current.reverse(); assert.equal(hash(canonicalJson(f.run())), hash(canonicalJson(result)));
});

test('authoritative current curation overrides archived active/quality flags without losing held identities', () => {
  const f = fixture(6);
  Object.assign(f.current[0], { isActive: false }); Object.assign(f.current[1], { duplicateOfProductId: f.current[0].id });
  f.current[2].qualityScore = .1; f.current[3].editorialStatus = 'blocked'; f.current[4].editorialStatus = 'needs_review';
  const result = f.run(); assert.equal(result.proposed.length, 1); assert.equal(result.holds.length, 5);
  assert.deepEqual(result.holds.map(p => p.reason), ['inactive', 'duplicate', 'quality', 'editorial_hold', 'editorial_hold']);
  assert.equal(result.reconciliation.identityCount, 6); assert.equal(result.proposed[0].input.product.qualityScore, .8);
});

test('rights absence, wrong values, merchant or expiring grants never self-certify permanence', () => {
  const f = fixture(); f.options.approvedRightsById = {};
  assert.equal(f.run().proposed.length, 0); assert.equal(f.run().holds.length, 2);
  for (const change of [r => delete r.title, r => r.title.value = 'not the constructed label', r => r.title.basis = 'merchant',
    r => r.title.reference = ' ', r => r.imageUrl.expiresAt = '2026-10-23T00:00:00.000Z']) {
    const value = fixture(1); change(value.options.approvedRightsById[value.current[0].id]);
    assert.equal(value.run().holds[0].reason, 'rights_unverified');
  }
});

test('only root-selected exact seed prose is attached; fallback boilerplate is omitted even with a grant', () => {
  const f = fixture(), id = f.current[0].id;
  f.options.approvedRightsById[id].description = f.grant(f.current[0].wittyDescription);
  f.options.approvedRightsById[id].punnyTitle = f.grant(f.current[0].punnyTitle);
  assert.equal(f.run().proposed[0].input.product.description, f.current[0].wittyDescription);
  const other = f.current[1]; f.options.approvedRightsById[other.id].wittyDescription = f.grant(other.wittyDescription);
  assert.equal(f.run().proposed[1].input.product.wittyDescription, undefined);
  assert.equal(f.run().proposed[1].input.product.description, f.evidence.products[1].fields.title.value);
});

test('long copy requires exact archived line, root grant and unchanged current factual/review state', () => {
  const setup = () => { const f = fixture(1), id = f.current[0].id;
    f.options.approvedRightsById[id].editorialWriteup = f.grant(article);
    f.options.editorialSourceRowsById = { [id]: JSON.stringify(f.rows[0]) }; return f; };
  const good = setup(), accepted = good.run().proposed[0];
  assert.equal(accepted.input.product.editorialWriteup, article);
  assert.equal(createPersistentCatalogProduct(accepted.input, now).indexable, true);
  for (const mutate of [f => delete f.options.editorialSourceRowsById, f => f.options.editorialSourceRowsById[f.current[0].id] += ' ',
    f => f.options.editorialSourceRowsById[f.current[0].id] = {},
    f => f.options.editorialSourceRowsById[f.current[0].id] = 'x'.repeat(128 * 1024 + 1),
    f => delete f.options.approvedRightsById[f.current[0].id].editorialWriteup,
    f => f.current[0].editorialModel = 'human-editor', f => f.current[0].editorialStatus = 'stale',
    f => f.current[0].editorialQualityScore = .5, f => f.current[0].sourceFactsHash = 'b'.repeat(64),
    f => { const p = f.current[0]; p.sourceFacts.material = 'plastic'; p.sourceFactsHash = editorialSourceHash(p); p.editorialSourceHash = p.sourceFactsHash; },
  ]) { const f = setup(); mutate(f); const item = f.run().proposed[0]; assert.equal(item.input.product.editorialWriteup, undefined);
    assert.equal(item.input.rights.editorialWriteup, undefined); assert.equal(createPersistentCatalogProduct(item.input, now).indexable, false); }
});

test('missing current/evidence entries remain reconciled holds; identity drift and duplicate IDs refuse', () => {
  const f = fixture(); f.current.pop(); const result = f.run();
  assert.equal(result.reconciliation.identityCount, 2); assert.equal(result.holds[0].reason, 'missing_current');
  const extra = { ...f.current[0], id: 'B099999999', publicId: '99999999-0000-4000-8000-000000000099', slug: 'extra-identity' };
  f.current.push(extra); assert.equal(f.run().reconciliation.identityCount, 3);
  assert.equal(f.run().holds.some(p => p.id === extra.id && p.reason === 'missing_evidence'), true);
  for (const patch of [{ publicId: extra.publicId }, { slug: 'other-identity' }, { source: 'etsy' }]) {
    const value = fixture(1); Object.assign(value.current[0], patch); assert.throws(value.run, /identity_drift/);
  }
  const duplicate = fixture(); duplicate.current.push(duplicate.current[0]); assert.throws(duplicate.run, /identity_duplicate/);
});

test('reviewed evidence and local SVG bytes/path/SHA stay pinned, with no remote or executable image substitution', () => {
  for (const mutate of [f => f.evidence.products[0].fields.title.value = 'unreviewed title',
    f => f.options.placeholder.bytes = Buffer.from(svg + ' '), f => f.options.placeholder.expectedSha256 = 'b'.repeat(64),
    f => f.options.placeholder.path = 'https://supplier.invalid/owned.svg', f => f.options.placeholder.path = '/../private.svg',
    f => { const text = svg.replace('</svg>', '<script>bad()</script></svg>'); f.options.placeholder.bytes = Buffer.from(text); f.options.placeholder.expectedSha256 = hash(text); },
  ]) { const f = fixture(); mutate(f); assert.throws(f.run, /permanent_/); }
});

function restorationFixture(count = 2) {
  const f = fixture(count);
  f.options.existingDisplayReference = 'owner-confirmed-existing-dataset:synthetic-fixture';
  for (const p of f.current) {
    const grant = value => ({ basis: 'licensed', value, reference: f.options.existingDisplayReference });
    const rights = f.options.approvedRightsById[p.id];
    for (const [field, value] of Object.entries({ title: p.title, description: p.wittyDescription || p.title,
      imageUrl: p.imageUrl, punnyTitle: p.punnyTitle, wittyDescription: p.wittyDescription, editorialWriteup: p.editorialWriteup })) {
      if (value) rights[field] = grant(value);
    }
  }
  return f;
}

test('owner-confirmed dataset restoration preserves exact existing photos, copy, IDs and source history', () => {
  const f = restorationFixture(), before = JSON.stringify({ current: f.current, evidence: f.evidence, options: f.options });
  const result = f.run();
  assert.equal(result.proposed.length, 2);
  for (const candidate of result.proposed) {
    const original = f.current.find(p => p.id === candidate.id), display = createPersistentCatalogProduct(candidate.input, now);
    for (const field of ['id', 'publicId', 'slug', 'title', 'imageUrl', 'punnyTitle', 'wittyDescription'])
      assert.equal(display[field], original[field]);
    assert.equal(display.description, original.wittyDescription);
    assert.equal(display.eligibleUntil, null);
    assert.equal(candidate.input.rights.imageUrl.basis, 'licensed');
  }
  assert.equal(result.proposed[0].input.product.editorialWriteup, article);
  assert.equal(JSON.stringify({ current: f.current, evidence: f.evidence, options: f.options }), before);
});

test('restoration needs exact owner-referenced grants and never changes curation holds', () => {
  for (const mutate of [f => f.options.approvedRightsById[f.current[0].id].imageUrl.value = 'https://supplier.invalid/other.jpg',
    f => f.options.approvedRightsById[f.current[0].id].imageUrl.basis = 'merchant',
    f => f.options.approvedRightsById[f.current[0].id].imageUrl.reference = 'unrelated',
    f => f.options.approvedRightsById[f.current[0].id].imageUrl.expiresAt = '2026-10-23T00:00:00.000Z']) {
    const f = restorationFixture(); mutate(f); assert.throws(f.run, /restoration_field/);
  }
  const f = restorationFixture(3); f.current[0].isActive = false; f.current[1].editorialStatus = 'blocked';
  assert.deepEqual(f.run().holds.map(p => p.reason), ['inactive', 'editorial_hold']);
  assert.equal(f.run().proposed.length, 1);
});
