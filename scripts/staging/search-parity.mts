import { lstat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../catalog/migration.ts';
import { decodePgvectorSendBase64, PGVECTOR_BINARY_ENCODING } from '../catalog/pgvector-binary.ts';
import { assertPrivateOutsideGit, validateRecoveryArchive } from '../catalog/recovery-archive.ts';
import { validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import type { CatalogSnapshot, PublicCatalogProduct } from '../../lib/catalog/types.ts';
import { isCatalogDisplayEligibleProduct, suppressNearDuplicateProducts } from '../../lib/db/product-scoring.ts';

export const QUERY_SET_VERSION = 'stupid-gifts-search-parity-30-v1';
export const MODEL = 'text-embedding-3-small';
export const DIMENSIONS = 1536;
export const SCORE_TOLERANCE = 0.0001; // Includes the legacy SQL numeric(5,4) score rounding.
type Category = 'recipient' | 'exact_product' | 'obscure' | 'typo' | 'held_duplicate' | 'empty' | 'provider_failure';
export const FIXED_QUERIES: ReadonlyArray<{ id: string; category: Category; text: string; mode: string }> = Object.freeze([
  ['recipient-dad', 'recipient', 'dad with no spare time', 'semantic'],
  ['recipient-desk', 'recipient', 'coworker who loves desk jokes', 'semantic'],
  ['recipient-gothic', 'recipient', 'someone who loves a gothic kitchen', 'semantic'],
  ['recipient-cat', 'recipient', 'cat obsessed friend', 'semantic'],
  ['recipient-sister', 'recipient', 'sarcastic sister', 'semantic'],
  ['recipient-exchange', 'recipient', 'white elephant gift exchange', 'semantic'],
  ['recipient-golfer', 'recipient', 'golfer with bathroom humor', 'semantic'],
  ['recipient-coffee', 'recipient', 'coffee lover who likes weird mugs', 'semantic'],
  ['exact-goat', 'exact_product', 'screaming goat', 'semantic'],
  ['exact-toast', 'exact_product', 'toast lamp', 'semantic'],
  ['exact-gothic', 'exact_product', 'gothic window cutting board', 'semantic'],
  ['exact-button', 'exact_product', 'bullshit button', 'semantic'],
  ['exact-chicken', 'exact_product', 'rubber chicken vase', 'semantic'],
  ['exact-golf', 'exact_product', 'toilet golf', 'semantic'],
  ['obscure-pickle', 'obscure', 'yodeling pickle', 'semantic'],
  ['obscure-crab', 'obscure', 'crab spoon rest', 'semantic'],
  ['obscure-duck', 'obscure', 'duck decanter', 'semantic'],
  ['obscure-statue', 'obscure', 'middle management statue', 'semantic'],
  ['typo-goat', 'typo', 'screeming goet', 'semantic'],
  ['typo-toast', 'typo', 'toest lamp', 'semantic'],
  ['typo-gothic', 'typo', 'gothik cuting bord', 'semantic'],
  ['typo-button', 'typo', 'bullshitt buton', 'semantic'],
  ['held-unavailable', 'held_duplicate', 'unavailable funny gift', 'semantic'],
  ['held-family', 'held_duplicate', 'duplicate crab holder', 'semantic'],
  ['empty-blank', 'empty', '', 'empty'],
  ['empty-short', 'empty', 'x', 'empty'],
  ['empty-keyword', 'empty', 'zzqv no matching keyword fixture', 'keyword_only'],
  ['failure-embedding', 'provider_failure', 'funny desk present', 'embedding_failure'],
  ['failure-vectorize', 'provider_failure', 'weird kitchen gift', 'vectorize_failure'],
  ['failure-storage', 'provider_failure', 'sarcastic gift', 'storage_failure'],
].map(([id, category, text, mode]) => Object.freeze({ id, category: category as Category, text, mode })));

export interface OriginalVector { id: string; legacyId: string; active: boolean; values: number[] }
export interface Embeddings { schemaVersion: 1; querySetVersion: string; model: string; dimensions: number;
  embeddings: Array<{ queryId: string; queryHash: string; values: number[] }> }
export interface CapturedCase {
  queryId: string; queryHash: string; mode: string; limit: number; workerStatus: number;
  vectorMatches?: Array<{ id: string; score: number }>;
  /** Exact D1 keyword candidate IDs, before application scoring/dedup. */
  keywordPublicIds?: string[];
  workerResults: Array<{ publicId: string; similarity: number; rankScore: number; matchType: 'semantic' | 'keyword' }>;
  legacyResults?: Array<{ publicId?: string; id?: string }>;
}
export interface CapturedResults {
  schemaVersion: 1; querySetVersion: string; model: string; dimensions: number; catalogRevision: string;
  sourceManifestSha256: string; asOf: string; scope: 'staging_cohort' | 'full_catalog';
  indexInventory?: { catalogRevision: string; visibilityVerifiedAt: string; publicIds: string[] };
  cases: CapturedCase[];
}
export function queryHash(text: string): string { return sha256(text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()); }
function vector(value: number[]): void {
  if (!Array.isArray(value) || value.length !== DIMENSIONS || value.some((n) => !Number.isFinite(n))
    || !value.some((n) => n !== 0)) throw new Error('Parity requires 1536 finite, nonzero embedding dimensions');
}
export function cosineSimilarity(first: number[], second: number[]): number {
  vector(first); vector(second);
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < DIMENSIONS; i++) { dot += first[i] * second[i]; aa += first[i] ** 2; bb += second[i] ** 2; }
  const score = dot / Math.sqrt(aa * bb);
  if (!Number.isFinite(score)) throw new Error('Invalid cosine norm');
  return Math.max(-1, Math.min(1, score));
}
export function qualityRank(similarity: number, product: PublicCatalogProduct): number {
  // Current Worker contract: price-free products have no historical price bonus.
  return similarity * 0.76 + product.qualityScore * 0.22;
}
function keywordSimilarity(product: PublicCatalogProduct, query: string): number {
  if (product.punnyTitle?.toLowerCase().includes(query)) return 0.78;
  if (product.title.toLowerCase().includes(query)) return 0.74;
  if (product.wittyDescription?.toLowerCase().includes(query)) return 0.68;
  if (product.humorTags?.join(' ').toLowerCase().includes(query)) return 0.62;
  return 0.48;
}
function overlap(first: string[], second: string[]): number | null {
  const expected = first.slice(0, 10); if (!expected.length) return null;
  const actual = new Set(second.slice(0, 10)); return expected.filter((id) => actual.has(id)).length / expected.length;
}
function sameIds(first: string[], second: string[]): boolean { return first.length === second.length && first.every((id, i) => id === second[i]); }

/**
 * Offline evidence comparison, never an embedding/Vectorize/D1 client.
 * Captures are operator-provided evidence, not proof of a fresh provider call.
 * Missing keyword inputs permit a partial comparison, never full acceptance.
 */
export function verifySearchParity(input: {
  snapshot: CatalogSnapshot; originalVectors: OriginalVector[]; sourcePublicIds: string[];
  sourceManifestSha256: string; embeddings: Embeddings; results: CapturedResults;
}) {
  const saved = input.results; const embeddings = input.embeddings;
  if ([saved, embeddings].some((data) => data.schemaVersion !== 1 || data.querySetVersion !== QUERY_SET_VERSION
    || data.model !== MODEL || data.dimensions !== DIMENSIONS) || saved.sourceManifestSha256 !== input.sourceManifestSha256
    || !/^[a-f0-9]{64}$/.test(input.sourceManifestSha256)
    || !['staging_cohort', 'full_catalog'].includes(saved.scope)) throw new Error('Parity model/dimension/query-set/source provenance mismatch');
  const asOf = new Date(saved.asOf);
  if (!Number.isFinite(asOf.getTime()) || asOf.toISOString() !== saved.asOf) throw new Error('Parity clock must be a canonical UTC instant');
  const snapshot = validateCatalogSnapshot(input.snapshot, asOf);
  if (saved.catalogRevision !== snapshot.catalogRevision) throw new Error('Parity catalog revision mismatch');
  const originals = new Map<string, OriginalVector>(); const legacyMap = new Map<string, string>();
  for (const original of input.originalVectors) {
    vector(original.values);
    if (original.values.some((value) => Math.fround(value) !== value)) throw new Error('Original vector must preserve native float32 values');
    if (originals.has(original.id) || legacyMap.has(original.legacyId)) throw new Error('Duplicate original identity mapping');
    originals.set(original.id, original); legacyMap.set(original.legacyId, original.id);
  }
  const sources = new Set(input.sourcePublicIds);
  if (sources.size !== input.sourcePublicIds.length || [...originals.keys()].some((id) => !sources.has(id))) throw new Error('Original vector/source identity coverage mismatch');
  const products = new Map(snapshot.products.map((product) => [product.publicId, product]));
  if (snapshot.products.some((product) => !originals.has(product.publicId))) throw new Error('Ready product original vector missing');
  const eligible = snapshot.products.filter((product) => originals.get(product.publicId)?.active && isCatalogDisplayEligibleProduct(product));
  const embeddingMap = new Map<string, number[]>();
  for (const item of embeddings.embeddings) {
    const query = FIXED_QUERIES.find((q) => q.id === item.queryId);
    if (!query || query.mode !== 'semantic' || item.queryHash !== queryHash(query.text) || embeddingMap.has(item.queryId)) throw new Error('Query embedding provenance mismatch');
    vector(item.values); embeddingMap.set(item.queryId, item.values);
  }
  const cases = []; const seen = new Set<string>();
  for (const captured of saved.cases) {
    const query = FIXED_QUERIES.find((q) => q.id === captured.queryId);
    if (!query || seen.has(query.id) || captured.queryHash !== queryHash(query.text) || captured.mode !== query.mode
      || !Number.isInteger(captured.limit) || captured.limit < 1 || captured.limit > 60) throw new Error('Captured query identity/mode/limit mismatch');
    seen.add(query.id); const issues: string[] = [];
    const worker = captured.workerResults;
    if (!Array.isArray(worker) || worker.length > captured.limit
      || (captured.vectorMatches?.length || 0) > Math.min(100, captured.limit * 4)) throw new Error('Captured result/candidate bound exceeded');
    if (captured.workerStatus !== (query.mode === 'storage_failure' ? 503 : 200)) issues.push('unexpected_worker_status');
    let rawTop10Overlap: number | null = null;
    let ranked: Array<PublicCatalogProduct & { similarity: number; rankScore: number }> = [];
    const scores = new Map<string, number>();
    if (query.mode === 'semantic') {
      const embedding = embeddingMap.get(query.id);
      if (!embedding) throw new Error('Semantic query embedding missing');
      const matches = captured.vectorMatches;
      if (!matches) throw new Error('Semantic Vectorize candidate capture missing');
      const matchIds = new Set<string>();
      for (const match of matches) {
        const original = originals.get(match.id);
        if (!original || matchIds.has(match.id) || !Number.isFinite(match.score) || Math.abs(match.score) > 1) throw new Error('Captured Vectorize public ID/score is invalid');
        matchIds.add(match.id); scores.set(match.id, match.score);
        if (Math.abs(cosineSimilarity(embedding, original.values) - match.score) > SCORE_TOLERANCE) issues.push('raw_cosine_score_mismatch');
      }
      const exact = eligible.map((product) => ({ id: product.publicId, score: cosineSimilarity(embedding, originals.get(product.publicId)!.values) }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      rawTop10Overlap = overlap(exact.map((item) => item.id), matches.map((item) => item.id));
      if (rawTop10Overlap !== null && rawTop10Overlap < 0.8) issues.push('raw_top10_overlap_below_80_percent');
      if (matches.some((match, i) => i > 0 && match.score > matches[i - 1].score + SCORE_TOLERANCE)) issues.push('raw_cosine_order_mismatch');
      ranked = eligible.filter((product) => scores.has(product.publicId))
        .map((product) => ({ ...product, similarity: scores.get(product.publicId)!, rankScore: qualityRank(scores.get(product.publicId)!, product) }))
        .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
      const expected = suppressNearDuplicateProducts(ranked, captured.limit).map((product) => product.publicId);
      if (!sameIds(expected, worker.filter((item) => item.matchType === 'semantic').map((item) => item.publicId))) issues.push('quality_aware_semantic_order_mismatch');
    } else if (captured.vectorMatches?.length) {
      issues.push('vector_matches_during_fallback');
    }
    const candidateLimit = Math.min(240, captured.limit * 4);
    const semantic = suppressNearDuplicateProducts(ranked, captured.limit);
    const shouldFallback = !['empty', 'storage_failure'].includes(query.mode) && semantic.length < captured.limit && scores.size < candidateLimit;
    const keywordCandidateEvidenceComplete = !shouldFallback || Array.isArray(captured.keywordPublicIds);
    if (captured.keywordPublicIds) {
      if (!shouldFallback && captured.keywordPublicIds.length) issues.push('unexpected_keyword_candidates');
      if (captured.keywordPublicIds.length > candidateLimit - scores.size || new Set(captured.keywordPublicIds).size !== captured.keywordPublicIds.length) throw new Error('Keyword candidate bound/identity mismatch');
      const keywords = captured.keywordPublicIds.map((id) => {
        const product = products.get(id);
        if (!product) throw new Error('Keyword candidate is absent from ready snapshot');
        return product;
      }).filter((product) => !scores.has(product.publicId) && originals.get(product.publicId)?.active && isCatalogDisplayEligibleProduct(product))
        .map((product) => ({ ...product, similarity: keywordSimilarity(product, query.text.toLowerCase()),
          rankScore: qualityRank(keywordSimilarity(product, query.text.toLowerCase()), product) }))
        .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
      const expected = suppressNearDuplicateProducts([...semantic, ...keywords], captured.limit).map((product) => product.publicId);
      if (!sameIds(expected, worker.map((item) => item.publicId))) issues.push('combined_keyword_order_mismatch');
    }
    const seenResults = new Set<string>(); const displayed: PublicCatalogProduct[] = [];
    for (const item of worker) {
      const product = products.get(item.publicId);
      if (!product || !originals.get(item.publicId)?.active || !isCatalogDisplayEligibleProduct(product)) { issues.push('held_inactive_or_ineligible_result'); continue; }
      if (seenResults.has(item.publicId)) issues.push('duplicate_result_id');
      seenResults.add(item.publicId); displayed.push(product);
      if (!['semantic','keyword'].includes(item.matchType) || !Number.isFinite(item.similarity) || Math.abs(item.similarity) > 1
        || !Number.isFinite(item.rankScore) || Math.abs(item.rankScore - qualityRank(item.similarity, product)) > SCORE_TOLERANCE) issues.push('quality_rank_score_mismatch');
      if (item.matchType === 'keyword' && Math.abs(item.similarity - keywordSimilarity(product, query.text.toLowerCase())) > SCORE_TOLERANCE) issues.push('keyword_score_mismatch');
      if (item.matchType === 'semantic' && (scores.get(item.publicId) === undefined || Math.abs(item.similarity - scores.get(item.publicId)!) > SCORE_TOLERANCE)) issues.push('semantic_score_carrythrough_mismatch');
      if (query.mode !== 'semantic' && item.matchType === 'semantic') issues.push('semantic_result_during_fallback');
    }
    if (suppressNearDuplicateProducts(displayed).length !== displayed.length) issues.push('duplicate_product_family');
    if ((query.category === 'empty' || query.mode === 'storage_failure') && worker.length) issues.push('expected_empty_results');
    const legacyIds = captured.legacyResults?.map((item) => {
      const id = item.publicId || legacyMap.get(item.id || '');
      if (!id || !originals.has(id) || (item.id && legacyMap.get(item.id) !== id)) throw new Error('Legacy-to-public identity mapping mismatch');
      return id;
    });
    if (legacyIds && new Set(legacyIds).size !== legacyIds.length) throw new Error('Duplicate legacy result identity');
    // Compare the old baseline after the same current public eligibility policy.
    const legacy = legacyIds?.filter((id) => eligible.some((product) => product.publicId === id));
    const legacyTop10Overlap = legacy ? overlap(legacy, worker.map((item) => item.publicId)) : null;
    if (legacyTop10Overlap !== null && legacyTop10Overlap < 0.8) issues.push('legacy_top10_overlap_below_80_percent');
    cases.push({ queryId: query.id, category: query.category, mode: query.mode, issues: [...new Set(issues)],
      rawTop10Overlap, legacyTop10Overlap, baselineHasTop10: (legacy?.length || 0) >= 10, keywordCandidateEvidenceComplete,
      workerPublicIds: worker.map((item) => item.publicId) });
  }
  const catalogIds = new Set([...snapshot.products, ...snapshot.heldProducts].map((product) => product.publicId));
  const catalogCoverageComplete = catalogIds.size === sources.size && [...sources].every((id) => catalogIds.has(id));
  const expectedIndex = input.originalVectors.filter((item) => item.active).map((item) => item.id);
  const inventory = saved.indexInventory;
  const indexed = new Set(inventory?.publicIds || []);
  const visibilityTime = inventory ? new Date(inventory.visibilityVerifiedAt) : null;
  const indexCoverageComplete = Boolean(inventory && visibilityTime && Number.isFinite(visibilityTime.getTime())
    && visibilityTime.toISOString() === inventory.visibilityVerifiedAt && visibilityTime.getTime() <= asOf.getTime()
    && inventory.catalogRevision === snapshot.catalogRevision && indexed.size === inventory.publicIds.length
    && indexed.size === expectedIndex.length && expectedIndex.every((id) => indexed.has(id)));
  const completeQuerySet = seen.size === FIXED_QUERIES.length;
  const checksPassed = cases.length > 0 && cases.every((item) => item.issues.length === 0);
  const manualReviewRequired = cases.some((item) => item.issues.length || (item.legacyTop10Overlap !== null && item.legacyTop10Overlap < 1)
    || (item.rawTop10Overlap !== null && item.rawTop10Overlap < 1));
  const fullCatalogAutomatedChecksPassed = saved.scope === 'full_catalog' && snapshot.dataKind === 'catalog' && checksPassed
    && catalogCoverageComplete && indexCoverageComplete && completeQuerySet && eligible.length >= 10
    && cases.every((item) => item.keywordCandidateEvidenceComplete)
    && cases.filter((item) => item.mode === 'semantic').every((item) => item.baselineHasTop10 && item.legacyTop10Overlap !== null);
  const fullCatalogAcceptance = fullCatalogAutomatedChecksPassed && !manualReviewRequired;
  return { schemaVersion: 1, querySetVersion: QUERY_SET_VERSION, model: MODEL, dimensions: DIMENSIONS,
    sourceManifestSha256: input.sourceManifestSha256, catalogRevision: snapshot.catalogRevision, asOf: saved.asOf,
    scope: saved.scope, originalVectorCount: originals.size, eligibleProductCount: eligible.length,
    eligibilityYear: new Date().getUTCFullYear(), // Shared brand-fit policy excludes years relative to the execution year.
    capturedQueryCount: cases.length, requiredQueryCount: FIXED_QUERIES.length, completeQuerySet,
    catalogCoverageComplete, indexCoverageComplete, checksPassed, fullCatalogAutomatedChecksPassed, fullCatalogAcceptance, manualReviewRequired,
    rankContract: 'Worker price-free: cosine*0.76 + quality*0.22; eligibility then family dedup; keywords appended',
    comparisonNote: 'Raw cosine order is not quality-aware application order. Legacy overlap applies current eligibility first. Saved evidence is not new live verification; differences still need manual review.',
    cases };
}

async function privateJson(path: string, maxBytes: number) {
  await assertPrivateOutsideGit(dirname(resolve(path))); const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > maxBytes) throw new Error('Parity input must be a bounded private nonsymlink file');
  const bytes = await readFile(path);
  if (bytes.length > maxBytes) throw new Error('Parity input exceeded its size bound');
  try { return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    sha256: createHash('sha256').update(bytes).digest('hex') }; }
  catch { throw new Error('Parity input JSON is invalid; raw data is not logged'); }
}
async function main(argv: string[]) {
  if (argv.includes('--help')) {
    console.log('Offline only: --archive /private/export --manifest-sha SHA --snapshot /private/snapshot.json --queries /private/query-embeddings.json --results /private/provider-results.json [--output /private/new-report.json]. Uses exported fixed 30-query IDs/hashes, model/1536-d provenance, saved Vectorize matches, legacy/Worker results, keyword candidate IDs, and optional index inventory. Never calls providers. A staging cohort is not full-catalog acceptance.'); return;
  }
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!['--archive','--manifest-sha','--snapshot','--queries','--results','--output'].includes(argv[i]) || !argv[i + 1] || args[argv[i]]) throw new Error('Invalid parity argument');
    args[argv[i]] = argv[++i];
  }
  if (!['--archive','--manifest-sha','--snapshot','--queries','--results'].every((key) => args[key])) throw new Error('Explicit protected parity inputs required');
  const archive = await validateRecoveryArchive(args['--archive'], { expectedManifestSha256: args['--manifest-sha'] });
  const products = archive.tables.find((table) => table.definition.schema === 'public' && table.definition.name === 'products');
  if (!products || products.definition.columnEncodings.embedding !== PGVECTOR_BINARY_ENCODING) throw new Error('Parity CLI requires the verified original native-binary product export');
  const originals = products.rows.filter((row) => row.embedding !== null).map((row) => ({ id: String(row.public_id), legacyId: String(row.id), active: row.is_active === true,
    values: decodePgvectorSendBase64(row.embedding) }));
  const [snapshot, embeddings, results] = await Promise.all([
    privateJson(args['--snapshot'], 16_000_000), privateJson(args['--queries'], 4_000_000), privateJson(args['--results'], 4_000_000),
  ]);
  const report = verifySearchParity({ snapshot: snapshot.value, originalVectors: originals,
    sourcePublicIds: products.rows.map((row) => String(row.public_id)), sourceManifestSha256: args['--manifest-sha'],
    embeddings: embeddings.value, results: results.value });
  const evidenceSha256 = { snapshot: snapshot.sha256, queryEmbeddings: embeddings.sha256, providerResults: results.sha256 };
  if (args['--output']) {
    await assertPrivateOutsideGit(dirname(resolve(args['--output'])));
    await writeFile(args['--output'], `${JSON.stringify({ ...report, evidenceSha256 }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  console.log(JSON.stringify({ checksPassed: report.checksPassed, fullCatalogAcceptance: report.fullCatalogAcceptance,
    capturedQueryCount: report.capturedQueryCount, eligibleProductCount: report.eligibleProductCount, scope: report.scope,
    manualReviewRequired: report.manualReviewRequired }));
  if (!report.checksPassed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Offline parity verification failed; no provider calls were made.'); process.exitCode = 1; });
}
