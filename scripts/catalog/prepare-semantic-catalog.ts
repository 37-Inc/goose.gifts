import { canonicalJson } from '../../lib/catalog/canonical-json.ts';
import { persistentPublicProduct } from '../../lib/catalog/display.ts';
import { validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import { DERIVED_SEARCH_PROFILE, semanticHash, semanticProductInput, semanticPublicFields,
  semanticVectorIdentity, semanticVectorMetadata, validateSemanticCatalog } from '../../lib/catalog/semantic-profile.ts';
import type { CatalogSnapshot } from '../../lib/catalog/types.ts';
import type { SemanticCatalogEntry } from '../../lib/catalog/semantic-profile.ts';
import { projectReceiptEmbedding } from './search-vector-projection.ts';

/** OFFLINE only. Caller pins authentic retained receipts and original hashes.
 * A title/copy mismatch cannot be repaired by relabeling a previous embedding.
 * Original sourceQuery is retained context, not an invented public field.
 */
export async function prepareSemanticCatalog(input: {
  snapshot: CatalogSnapshot; indexName: string;
  sources: Array<Omit<Parameters<typeof projectReceiptEmbedding>[0], 'dimensions'> & { retainedContext: string | null }>;
  /** Planning inventory only; never evidence that provider writes actually succeeded. */
  previousVectorIds?: readonly string[];
}) {
  const previous = new Set(input.previousVectorIds ?? []);
  if (previous.size > 10_000 || [...previous].some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)))
    throw new Error('semantic_previous_vector_inventory_invalid');
  const snapshot = validateCatalogSnapshot(input.snapshot);
  const publicProducts = new Map(snapshot.products.map(p => [p.id, persistentPublicProduct(p)]));
  const entries: SemanticCatalogEntry[] = [], vectors = [];
  for (const source of input.sources) {
    const product = publicProducts.get(source.productId);
    if (!product || typeof source.retainedContext !== 'string' && source.retainedContext !== null
      || semanticProductInput(product, source.retainedContext) !== source.expectedInput)
      throw new Error('semantic_current_input_mismatch');
    const projected = projectReceiptEmbedding({ ...source, dimensions: DERIVED_SEARCH_PROFILE.dimensions });
    if (projected.model !== DERIVED_SEARCH_PROFILE.model) throw new Error('semantic_profile_model_mismatch');
    const proof = projected.provenance;
    const identity = { publicId: product.publicId, productId: product.id,
      publicFieldsSha256: await semanticHash(canonicalJson(semanticPublicFields(product))),
      inputSha256: proof.inputSha256, originalNativeSha256: proof.originalNativeSha256,
      derivedNativeSha256: proof.derivedNativeSha256, receiptSha256: proof.receiptSha256, sourceFactsHash: proof.sourceFactsHash };
    const entry = { ...identity, vectorId: await semanticVectorIdentity(identity) };
    entries.push(entry);
    vectors.push({ id: entry.vectorId, values: projected.values, metadata: semanticVectorMetadata(entry) });
  }
  const catalog = validateSemanticCatalog({ schemaVersion: 1, indexName: input.indexName,
    profile: DERIVED_SEARCH_PROFILE, entries: entries.sort((a,b) => a.publicId.localeCompare(b.publicId)) });
  const current = new Set(vectors.map(v => v.id));
  return { catalog, vectors: vectors.filter(v => !previous.has(v.id)),
    unchangedVectors: vectors.filter(v => previous.has(v.id)).length,
    // Keep prior stored vectors/history; current public/input checks prevent serving stale entries.
    retainedPreviousVectorIds: [...previous].filter(id => !current.has(id)),
    providerCalls: 0, executionAuthorized: false as const, retrievalQualityAccepted: false as const };
}
