import { desc, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db } from './index';
import { products } from './schema';
import type { Product } from '../types';
import { cleanImageUrl } from '../image-utils';
import {
  HOMEPAGE_BRAND_FIT_TERMS,
  isHomepageEligibleProduct,
  scoreProductForTrending,
  suppressNearDuplicateProducts,
} from './product-scoring';

const HOMEPAGE_CANDIDATE_LIMIT = 1200;
const HOMEPAGE_CACHE_SECONDS = 3600;

interface ProductWithStats extends Product {
  clickCount: number;
  impressionCount: number;
  lastClickedAt: Date | null;
}

interface CatalogFeedOptions {
  seed: string;
  limit?: number;
  excludeIds?: string[];
}

function seededFraction(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

async function loadHomepageEligibleProducts(): Promise<ProductWithStats[]> {
  const merchantTitleBrandFit = sql.join(
    HOMEPAGE_BRAND_FIT_TERMS.map((term) => sql`${products.title} ILIKE ${`%${term}%`}`),
    sql` OR `
  );
  const allProducts = await db
    .select({
      id: products.id,
      title: products.title,
      punnyTitle: products.punnyTitle,
      wittyDescription: products.wittyDescription,
      humorTags: products.humorTags,
      qualityScore: products.qualityScore,
      sourceQuery: products.sourceQuery,
      isActive: products.isActive,
      price: products.price,
      currency: products.currency,
      imageUrl: products.imageUrl,
      affiliateUrl: products.affiliateUrl,
      source: products.source,
      rating: products.rating,
      reviewCount: products.reviewCount,
      clickCount: products.clickCount,
      impressionCount: products.impressionCount,
      lastClickedAt: products.lastClickedAt,
    })
    .from(products)
    .where(sql`
      ${products.imageUrl} IS NOT NULL
      AND ${products.affiliateUrl} IS NOT NULL
      AND ${products.isActive} = true
      AND ${products.qualityScore} IS NOT NULL
      AND ${products.qualityScore} >= 0.55
      AND (${products.price} <= 0 OR ${products.price} <= 250)
      AND (${merchantTitleBrandFit})
    `)
    .orderBy(
      desc(products.qualityScore),
      desc(products.clickCount),
      desc(products.updatedAt)
    )
    .limit(HOMEPAGE_CANDIDATE_LIMIT);

  return allProducts.map((product) => ({
    id: product.id,
    title: product.title,
    punnyTitle: product.punnyTitle || undefined,
    wittyDescription: product.wittyDescription || undefined,
    humorTags: product.humorTags || undefined,
    qualityScore: product.qualityScore ? parseFloat(product.qualityScore) : undefined,
    sourceQuery: product.sourceQuery || undefined,
    isActive: product.isActive,
    price: parseFloat(product.price),
    currency: product.currency,
    imageUrl: cleanImageUrl(product.imageUrl || '', product.source),
    affiliateUrl: product.affiliateUrl,
    source: product.source as 'amazon' | 'etsy',
    rating: product.rating ? parseFloat(product.rating) : undefined,
    reviewCount: product.reviewCount || undefined,
    clickCount: product.clickCount || 0,
    impressionCount: product.impressionCount || 0,
    lastClickedAt: product.lastClickedAt,
  })).filter(isHomepageEligibleProduct);
}

// `searchParams` makes the homepage route dynamic, so route-level revalidation
// does not cache this database read. Cache the stable catalog candidate pool
// explicitly so crawler traffic and progressive loading reuse one bounded
// result instead of downloading the catalog from Neon for every request.
const getHomepageEligibleProducts = unstable_cache(
  loadHomepageEligibleProducts,
  ['homepage-eligible-products-v1'],
  {
    revalidate: HOMEPAGE_CACHE_SECONDS,
    tags: ['catalog-products'],
  }
);

/**
 * Return a stable, quality-weighted homepage feed for progressive loading.
 * The seed keeps ordering consistent while a visitor scrolls, and excludeIds
 * protects against repeats if catalog contents change between requests.
 */
export async function getCatalogFeedProducts({
  seed,
  limit = 24,
  excludeIds = [],
}: CatalogFeedOptions): Promise<{ products: Product[]; hasMore: boolean }> {
  try {
    const excluded = new Set(excludeIds);
    const eligibleProducts = await getHomepageEligibleProducts();
    const ranked = eligibleProducts
      .map((product) => {
        const impressions = Math.max(product.impressionCount, 1);
        const ctr = Math.min(product.clickCount / impressions, 0.25);
        const engagementBonus = product.impressionCount >= 10 ? ctr * 48 : 2;
        const discoveryJitter = seededFraction(`${seed}:${product.id}`) * 12;

        return {
          product,
          title: product.title,
          score: scoreProductForTrending(product) + engagementBonus + discoveryJitter,
        };
      })
      .sort((left, right) => right.score - left.score || left.product.id.localeCompare(right.product.id));
    const distinctRanked = suppressNearDuplicateProducts(ranked)
      .filter(({ product }) => !excluded.has(product.id));

    return {
      products: distinctRanked.slice(0, limit).map(({ product }) => product),
      hasMore: distinctRanked.length > limit,
    };
  } catch (error) {
    console.error('Error getting catalog feed products:', error);
    return { products: [], hasMore: false };
  }
}

/**
 * Get trending products for homepage
 * Uses scoring algorithm optimized for high Amazon commissions + clickbait appeal
 */
export async function getTrendingProducts(limit: number = 12): Promise<Product[]> {
  try {
    const { getTrendingProductsWithRotation } = await import('./trending-rotation');
    const homepageEligibleProducts = await getHomepageEligibleProducts();

    return getTrendingProductsWithRotation(homepageEligibleProducts, limit);
  } catch (error) {
    console.error('Error getting trending products:', error);
    return [];
  }
}
