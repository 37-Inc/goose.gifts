/** Explicit one-time owner curation, not an expansion of routine maintenance,
 * supplier observations, model calls or native-index work. Body-free binding. */
export interface OwnerBaseCatalogReview {
  schemaVersion: 1;
  kind: 'owner-base-catalog-review';
  authorizationSha256: string;
  resolutionPlanSha256: string;
  publicDuplicate?: OwnerPublicDuplicate;
}
/** One photographed, individually confirmed public duplicate. Never a generic
 * prune list or permission to change the accepted predecessor. */
export const OWNER_PUBLIC_DUPLICATE = Object.freeze({ id: 'B0BQ9LZNXN', keeperId: 'B0DP9GRD9K' });
export interface OwnerPublicDuplicate {
  id: string; publicId: string; keeperId: string; keeperPublicId: string;
  keeperProductSha256: string; keeperPrivateStateSha256: string;
}
export function approvedBaseChangeLimit(review?: OwnerBaseCatalogReview): number {
  if (review === undefined) return 30;
  if (!review || Object.keys(review).sort().join(',') !== `authorizationSha256,kind,${Object.hasOwn(review, 'publicDuplicate') ? 'publicDuplicate,' : ''}resolutionPlanSha256,schemaVersion`
    || review.schemaVersion !== 1 || review.kind !== 'owner-base-catalog-review'
    || ![review.authorizationSha256, review.resolutionPlanSha256].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)))
    throw Error('cohort_owner_base_review_invalid');
  if (Object.hasOwn(review, 'publicDuplicate')) {
    const d = review.publicDuplicate;
    if (!d || Object.keys(d).sort().join(',') !== 'id,keeperId,keeperPrivateStateSha256,keeperProductSha256,keeperPublicId,publicId'
      || d.id !== OWNER_PUBLIC_DUPLICATE.id || d.keeperId !== OWNER_PUBLIC_DUPLICATE.keeperId
      || ![d.publicId, d.keeperPublicId].every(id => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
      || d.publicId === d.keeperPublicId || ![d.keeperProductSha256, d.keeperPrivateStateSha256].every(hash => /^[a-f0-9]{64}$/.test(hash)))
      throw Error('cohort_owner_base_review_invalid');
  }
  return 3383;
}
export function ownerBasePublicDuplicate(review: OwnerBaseCatalogReview | undefined, previous: { products: Array<{ id: string; publicId: string }> }) {
  approvedBaseChangeLimit(review);
  const d = review?.publicDuplicate;
  if (d && (!previous.products.some(p => p.id === d.id && p.publicId === d.publicId)
    || !previous.products.some(p => p.id === d.keeperId && p.publicId === d.keeperPublicId))) throw Error('cohort_owner_base_scope');
  return d;
}
/** Exact product labels only: keep brand, size, model and every alphanumeric
 * distinction; never collapse a gift because its broad archetype is similar. */
export function exactOwnerBaseTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
