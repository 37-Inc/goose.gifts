/** Explicit one-time owner curation, not an expansion of routine maintenance,
 * supplier observations, model calls or native-index work. Body-free binding. */
export interface OwnerBaseCatalogReview {
  schemaVersion: 1;
  kind: 'owner-base-catalog-review';
  authorizationSha256: string;
  resolutionPlanSha256: string;
}
export function approvedBaseChangeLimit(review?: OwnerBaseCatalogReview): number {
  if (review === undefined) return 30;
  if (!review || Object.keys(review).sort().join(',') !== 'authorizationSha256,kind,resolutionPlanSha256,schemaVersion'
    || review.schemaVersion !== 1 || review.kind !== 'owner-base-catalog-review'
    || ![review.authorizationSha256, review.resolutionPlanSha256].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)))
    throw Error('cohort_owner_base_review_invalid');
  return 3383;
}
/** Exact product labels only: keep brand, size, model and every alphanumeric
 * distinction; never collapse a gift because its broad archetype is similar. */
export function exactOwnerBaseTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
