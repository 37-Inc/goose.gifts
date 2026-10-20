import type {
  CatalogSnapshot,
  PublicCatalogProduct,
} from "../../lib/catalog/types";

export const RANDOM_POOL_LIMIT = 48;

export function readySnapshotProducts(
  snapshot: CatalogSnapshot,
  now = Date.parse(snapshot.generatedAt),
) {
  return snapshot.products.filter(
    (product) =>
      product.isActive &&
      product.qualityScore >= 0.55 &&
      product.imageUrl &&
      product.affiliateUrl &&
      Date.parse(product.eligibleUntil) > now,
  );
}

export function eligiblePool<
  T extends Pick<PublicCatalogProduct, "eligibleUntil">,
>(products: readonly T[], now = Date.now()) {
  return products
    .filter((product) => Date.parse(product.eligibleUntil) > now)
    .slice(0, RANDOM_POOL_LIMIT);
}

export function nextRandomIndex(
  length: number,
  current: number,
  random = Math.random,
): number {
  if (length < 2) return 0;
  const offset =
    Math.min(length - 2, Math.max(0, Math.floor(random() * (length - 1)))) + 1;
  return (current + offset) % length;
}

export function isIllustrative(
  product: Pick<PublicCatalogProduct, "affiliateUrl">,
) {
  return new URL(product.affiliateUrl).hostname === "example.invalid";
}
