import type { PublicCatalogProduct } from "../../lib/catalog/types";

export const RANDOM_POOL_LIMIT = 48;

export function eligiblePool(
  products: readonly PublicCatalogProduct[],
  now = Date.now(),
) {
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
