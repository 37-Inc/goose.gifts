import { sql } from 'drizzle-orm';
import { db } from './index';
import { products } from './schema';
import { cleanImageUrl } from '../image-utils';
import { isHomepageEligibleProduct, scoreProductForTrending } from './product-scoring';
import type { Product } from '../types';

function toProduct(row: {
  id: string;
  title: string;
  punnyTitle: string | null;
  wittyDescription: string | null;
  humorTags: string[] | null;
  qualityScore: string | null;
  sourceQuery: string | null;
  isActive: boolean;
  price: string;
  currency: string;
  imageUrl: string | null;
  affiliateUrl: string;
  source: string;
  rating: string | null;
  reviewCount: number | null;
}): Product {
  return {
    id: row.id,
    title: row.title,
    punnyTitle: row.punnyTitle || undefined,
    wittyDescription: row.wittyDescription || undefined,
    humorTags: row.humorTags || undefined,
    qualityScore: row.qualityScore ? parseFloat(row.qualityScore) : undefined,
    sourceQuery: row.sourceQuery || undefined,
    isActive: row.isActive,
    price: parseFloat(row.price),
    currency: row.currency,
    imageUrl: cleanImageUrl(row.imageUrl || '', row.source),
    affiliateUrl: row.affiliateUrl,
    source: row.source as 'amazon' | 'etsy',
    rating: row.rating ? parseFloat(row.rating) : undefined,
    reviewCount: row.reviewCount || undefined,
  };
}

export async function getProductById(id: string): Promise<Product | undefined> {
  if (!id) {
    return undefined;
  }

  const rows = await db
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
    })
    .from(products)
    .where(sql`${products.id} = ${id}`)
    .limit(1);

  const row = rows[0];
  return row ? toProduct(row) : undefined;
}

function hashSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

async function getEligibleRandomGiftPool(): Promise<Product[]> {
  const rows = await db
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
    })
    .from(products)
    .where(sql`
      ${products.imageUrl} IS NOT NULL
      AND ${products.affiliateUrl} IS NOT NULL
      AND ${products.isActive} = true
      AND (${products.price} <= 0 OR ${products.price} <= 250)
    `);

  return rows
    .map(toProduct)
    .filter(isHomepageEligibleProduct)
    .sort((a, b) => scoreProductForTrending(b) - scoreProductForTrending(a));
}

export async function getRandomGiftSelection(seed: string, requestedId?: string) {
  const pool = await getEligibleRandomGiftPool();

  if (pool.length === 0) {
    return {
      product: undefined,
      alternates: [],
      poolSize: 0,
    };
  }

  const requestedProduct = requestedId
    ? pool.find((product) => product.id === requestedId)
    : undefined;
  const selectedIndex = requestedProduct
    ? pool.findIndex((product) => product.id === requestedProduct.id)
    : hashSeed(seed) % pool.length;
  const product = requestedProduct || pool[selectedIndex];
  const offset = hashSeed(`${seed}:${product.id}`) % pool.length;
  const alternates = pool
    .filter((candidate) => candidate.id !== product.id)
    .slice(offset)
    .concat(pool.filter((candidate) => candidate.id !== product.id).slice(0, offset))
    .slice(0, 6);

  return {
    product,
    alternates,
    poolSize: pool.length,
  };
}
