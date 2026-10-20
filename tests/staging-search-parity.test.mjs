import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXED_QUERIES, QUERY_SET_VERSION, MODEL, DIMENSIONS, SCORE_TOLERANCE,
  cosineSimilarity, qualityRank, queryHash, verifySearchParity } from '../scripts/staging/search-parity.mts';
import { suppressNearDuplicateProducts } from '../lib/db/product-scoring.ts';

// Invented vectors/copy only. No provider calls or real product claims.
const asOf = '2026-10-20T06:00:00.000Z';
const hash = '1'.repeat(64);
function values(first = 1, second = 0) { return [Math.fround(first), Math.fround(second), ...Array(DIMENSIONS - 2).fill(0)]; }
function fixture(count = 12) {
  const nouns = ['glass prism', 'wooden compass', 'brass whistle', 'neon lantern', 'clay volcano', 'steel rocket',
    'paper cactus', 'rubber banana', 'felt lobster', 'marble snail', 'ceramic raccoon', 'copper accordion'];
  const products = nouns.slice(0, count).map((noun, i) => ({
    id: `T${String(i + 1).padStart(9, '0')}`, publicId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    slug: `synthetic-parity-${i + 1}`, title: `Funny ${noun}`, description: 'Invented parity test fixture, never public catalog data.',
    imageUrl: '/synthetic-test.svg', affiliateUrl: 'https://example.invalid/fixture', source: 'amazon', currency: 'USD',
    price: 0, isActive: true, qualityScore: i === 0 ? 0.55 : 0.95, eligibleUntil: '2026-10-21T06:00:00.000Z',
  }));
  const originals = products.map((p, i) => ({ id: p.publicId, legacyId: p.id, active: true, values: values(1, (i + 1) / 10) }));
  const snapshot = { schemaVersion: 1, dataKind: 'synthetic_fixture', catalogRevision: 'synthetic-parity-test', generatedAt: asOf,
    products, heldProducts: [], slugHistory: [] };
  const embeddings = { schemaVersion: 1, querySetVersion: QUERY_SET_VERSION, model: MODEL, dimensions: DIMENSIONS,
    embeddings: FIXED_QUERIES.filter((q) => q.mode === 'semantic').map((q) => ({ queryId: q.id, queryHash: queryHash(q.text), values: values() })) };
  const results = { schemaVersion: 1, querySetVersion: QUERY_SET_VERSION, model: MODEL, dimensions: DIMENSIONS,
    catalogRevision: snapshot.catalogRevision, sourceManifestSha256: hash, asOf, scope: 'staging_cohort',
    indexInventory: { catalogRevision: snapshot.catalogRevision, visibilityVerifiedAt: asOf, publicIds: originals.map((v) => v.id) },
    cases: FIXED_QUERIES.map((q) => {
      const vectorMatches = originals.map((v) => ({ id: v.id, score: cosineSimilarity(values(), v.values) }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const ranked = products.map((p) => ({ ...p, similarity: vectorMatches.find((v) => v.id === p.publicId).score,
        rankScore: qualityRank(vectorMatches.find((v) => v.id === p.publicId).score, p) }))
        .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
      const selected = suppressNearDuplicateProducts(ranked, 10);
      return { queryId: q.id, queryHash: queryHash(q.text), mode: q.mode, limit: 10,
        workerStatus: q.mode === 'storage_failure' ? 503 : 200,
        ...(q.mode === 'semantic' ? { vectorMatches } : {}), keywordPublicIds: [],
        workerResults: q.mode === 'semantic' ? selected.map((p) => ({ publicId: p.publicId, similarity: p.similarity, rankScore: p.rankScore, matchType: 'semantic' })) : [],
        ...(q.mode === 'semantic' ? { legacyResults: selected.map((p) => ({ id: p.id })) } : {}) };
    }) };
  const input = { snapshot, originalVectors: originals, sourcePublicIds: originals.map((v) => v.id), sourceManifestSha256: hash, embeddings, results };
  return { input, run: () => verifySearchParity(input) };
}

test('fixed immutable 30-query set covers required categories; native cosine differs from quality ranking', () => {
  assert.equal(FIXED_QUERIES.length, 30); assert.equal(new Set(FIXED_QUERIES.map((q) => q.id)).size, 30);
  for (const category of ['recipient', 'exact_product', 'obscure', 'typo', 'held_duplicate', 'empty', 'provider_failure']) assert(FIXED_QUERIES.some((q) => q.category === category));
  assert(Object.isFrozen(FIXED_QUERIES));
  assert.equal(cosineSimilarity(values(), values()), 1);
  assert.equal(cosineSimilarity(values(), values(-1)), -1);
  assert.equal(queryHash('  FＵNNY\n  TEST '), queryHash('funny test'));
  assert.throws(() => cosineSimilarity(Array(DIMENSIONS).fill(0), values()), /nonzero/);
  assert.throws(() => cosineSimilarity([1], values()), /1536/);
  const f = fixture(); const captured = f.input.results.cases[0];
  assert.notEqual(captured.vectorMatches[0].id, captured.workerResults[0].publicId);
  const report = f.run();
  assert.equal(report.checksPassed, true); assert.equal(report.completeQuerySet, true);
  assert.equal(report.fullCatalogAcceptance, false); // Synthetic data is never release evidence.
  assert.equal(JSON.stringify(report).includes('Funny glass prism'), false);
});

test('four-product/partial evidence remains explicitly staging, never full acceptance', () => {
  const f = fixture(4); f.input.results.cases = f.input.results.cases.slice(0, 4);
  const report = f.run();
  assert.equal(report.checksPassed, true); assert.equal(report.eligibleProductCount, 4);
  assert.equal(report.completeQuerySet, false); assert.equal(report.fullCatalogAcceptance, false);
});

test('rejects altered provenance, dimensions, mappings and duplicate legacy baselines', () => {
  for (const mutate of [
    (f) => { f.input.results.model = 'other-model'; },
    (f) => { f.input.results.sourceManifestSha256 = '2'.repeat(64); },
    (f) => { f.input.results.catalogRevision = 'other'; },
    (f) => { f.input.results.asOf = '2026-10-20 06:00:00Z'; },
    (f) => { f.input.embeddings.embeddings[0].queryHash = hash; },
    (f) => { f.input.originalVectors[0].values[0] = 0.1; },
    (f) => { f.input.originalVectors.pop(); },
    (f) => { f.input.results.cases[0].legacyResults[1] = f.input.results.cases[0].legacyResults[0]; },
    (f) => { f.input.results.cases[0].legacyResults[0].publicId = f.input.originalVectors[0].id; },
  ]) { const f = fixture(); mutate(f); assert.throws(f.run); }
});

test('detects changed cosine, quality order, score carrythrough and native ANN candidate ordering', () => {
  for (const [mutate, issue] of [
    [(c) => { c.vectorMatches[0].score -= 0.05; }, 'raw_cosine_score_mismatch'],
    [(c) => { [c.workerResults[0], c.workerResults[1]] = [c.workerResults[1], c.workerResults[0]]; }, 'quality_aware_semantic_order_mismatch'],
    [(c, f) => { const p = f.input.snapshot.products.find((p) => p.publicId === c.workerResults[0].publicId); c.workerResults[0].similarity -= 0.03; c.workerResults[0].rankScore = qualityRank(c.workerResults[0].similarity, p); }, 'semantic_score_carrythrough_mismatch'],
    [(c) => { [c.vectorMatches[0], c.vectorMatches[1]] = [c.vectorMatches[1], c.vectorMatches[0]]; }, 'raw_cosine_order_mismatch'],
  ]) {
    const f = fixture(); mutate(f.input.results.cases[0], f); const report = f.run();
    assert.equal(report.checksPassed, false); assert(report.cases[0].issues.includes(issue));
  }
  const f = fixture(); f.input.results.cases[0].vectorMatches[0].score -= SCORE_TOLERANCE / 2;
  const c = f.input.results.cases[0]; const p = f.input.snapshot.products.find((p) => p.publicId === c.vectorMatches[0].id);
  const item = c.workerResults.find((r) => r.publicId === p.publicId);
  if (item) { item.similarity = c.vectorMatches[0].score; item.rankScore = qualityRank(item.similarity, p); }
  assert.equal(f.run().checksPassed, true);
});

test('held, inactive, duplicate-family, keyword and failure behavior are checked separately', () => {
  const f = fixture(); const p = f.input.snapshot.products[0];
  f.input.snapshot.products[1].title = p.title;
  f.input.originalVectors[2].active = false;
  const report = f.run();
  assert(report.cases[0].issues.includes('duplicate_product_family'));
  assert(report.cases[0].issues.includes('held_inactive_or_ineligible_result'));
  const g = fixture(); const held = g.input.snapshot.products.pop();
  g.input.snapshot.heldProducts.push({ id: held.id, publicId: held.publicId, slug: held.slug, path: `/gifts/${held.slug}`,
    title: 'Gift currently unavailable', description: 'This gift is not currently available in the curated catalog. Browse other gifts instead.', reason: 'inactive' });
  g.input.results.cases[0].workerResults.push({ publicId: held.publicId, similarity: 0.5, rankScore: 0.5, matchType: 'semantic' });
  g.input.results.cases[0].limit = 11;
  assert(g.run().cases[0].issues.includes('held_inactive_or_ineligible_result'));
  const h = fixture(); const fallback = h.input.results.cases.find((q) => q.mode === 'embedding_failure');
  fallback.keywordPublicIds = [p.publicId]; fallback.workerResults = [{ publicId: p.publicId, similarity: 0.48, rankScore: qualityRank(0.48, p), matchType: 'keyword' }];
  assert.equal(h.run().checksPassed, true);
  fallback.workerResults[0].similarity = 0.74;
  assert(h.run().cases.find((c) => c.queryId === fallback.queryId).issues.includes('keyword_score_mismatch'));
  const k = fixture(); k.input.results.cases.find((c) => c.mode === 'storage_failure').workerStatus = 200;
  assert.equal(k.run().checksPassed, false);
});

test('80 percent baseline threshold and manual difference review stay distinct', () => {
  const f = fixture(); const c = f.input.results.cases[0];
  c.legacyResults[9] = { id: f.input.snapshot.products.find((p) => !c.workerResults.some((r) => r.publicId === p.publicId)).id };
  const report = f.run(); assert.equal(report.checksPassed, true);
  assert.equal(report.cases[0].legacyTop10Overlap, 0.9); assert.equal(report.manualReviewRequired, true);
  c.legacyResults = f.input.snapshot.products.slice(0, 3).map((p) => ({ id: p.id }));
  c.workerResults = c.workerResults.filter((r) => !c.legacyResults.some((old) => f.input.originalVectors.find((v) => v.legacyId === old.id).id === r.publicId));
  assert.equal(f.run().checksPassed, false);
});

test('full gate requires exact index visibility, all sources, full baselines and keyword evidence', () => {
  const f = fixture();
  // Unit-test-only simulation of a real release shape; no generated artifact is written.
  f.input.snapshot.dataKind = 'catalog'; f.input.results.scope = 'full_catalog';
  for (const p of f.input.snapshot.products) p.affiliateUrl = `https://www.amazon.com/dp/${p.id}`;
  assert.equal(f.run().fullCatalogAcceptance, true);
  for (const mutate of [
    (g) => { g.input.results.indexInventory.publicIds.pop(); },
    (g) => { g.input.results.indexInventory.visibilityVerifiedAt = '2026-10-21T00:00:00.000Z'; },
    (g) => { g.input.sourcePublicIds.push('00000000-0000-4000-8000-999999999999'); },
    (g) => { delete g.input.results.cases[0].legacyResults; },
    (g) => { delete g.input.results.cases.find((c) => c.mode === 'embedding_failure').keywordPublicIds; },
  ]) { const g = structuredClone(f.input); mutate({ input: g }); assert.equal(verifySearchParity(g).fullCatalogAcceptance, false); }
});
