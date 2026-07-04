import { sql } from 'drizzle-orm';
import { db } from './index';
import { products } from './schema';
import type { Product } from '../types';
import { cleanImageUrl } from '../image-utils';

/**
 * Get trending products for homepage
 * Uses scoring algorithm optimized for high Amazon commissions + clickbait appeal
 */
export async function getTrendingProducts(limit: number = 12): Promise<Product[]> {
  try {
    const { getTrendingProductsWithRotation } = await import('./trending-rotation');

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
        AND (${products.price} <= 0 OR ${products.price} <= 250)
      `);

    const productList = allProducts.map((product) => ({
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
    }));

    return getTrendingProductsWithRotation(productList, limit);
  } catch (error) {
    console.error('Error getting trending products:', error);
    return [];
  }
}
