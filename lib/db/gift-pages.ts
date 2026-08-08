import { and, desc, eq, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db } from './index';
import { productSlugHistory, products } from './schema';
import { cleanImageUrl } from '../image-utils';
import type { Product } from '../types';

const productSelection = {
  id: products.id,
  publicId: products.publicId,
  slug: products.slug,
  title: products.title,
  punnyTitle: products.punnyTitle,
  wittyDescription: products.wittyDescription,
  editorialWriteup: products.editorialWriteup,
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
};

type ProductRow = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  punnyTitle: string | null;
  wittyDescription: string | null;
  editorialWriteup: string | null;
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
};

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    publicId: row.publicId,
    slug: row.slug,
    title: row.title,
    punnyTitle: row.punnyTitle || undefined,
    wittyDescription: row.wittyDescription || undefined,
    editorialWriteup: row.editorialWriteup || undefined,
    humorTags: row.humorTags || undefined,
    qualityScore: row.qualityScore ? parseFloat(row.qualityScore) : undefined,
    sourceQuery: row.sourceQuery || undefined,
    isActive: row.isActive,
    price: parseFloat(row.price),
    currency: row.currency,
    imageUrl: cleanImageUrl(row.imageUrl || '', row.source),
    affiliateUrl: row.affiliateUrl,
    source: row.source as Product['source'],
    rating: row.rating ? parseFloat(row.rating) : undefined,
    reviewCount: row.reviewCount || undefined,
  };
}

export interface GiftPageLookup {
  product: Product;
  canonicalSlug: string;
  matchedHistoricalSlug: boolean;
}

export async function getGiftPageBySlug(slug: string): Promise<GiftPageLookup | undefined> {
  const rows = await db
    .select(productSelection)
    .from(products)
    .leftJoin(productSlugHistory, eq(productSlugHistory.productId, products.id))
    .where(or(eq(products.slug, slug), eq(productSlugHistory.slug, slug)))
    .limit(1);

  const row = rows[0] as ProductRow | undefined;
  if (!row) {
    return undefined;
  }

  return {
    product: toProduct(row),
    canonicalSlug: row.slug,
    matchedHistoricalSlug: row.slug !== slug,
  };
}

export async function getRelatedGiftProducts(product: Product, limit: number = 6): Promise<Product[]> {
  const tags = product.humorTags || [];
  const tagArray = tags.length > 0
    ? sql`ARRAY[${sql.join(tags.map((tag) => sql`${tag}`), sql`, `)}]::text[]`
    : sql`ARRAY[]::text[]`;
  const sharedTagScore = tags.length > 0
    ? sql<number>`(
        SELECT COUNT(*)::int
        FROM unnest(COALESCE(${products.humorTags}, ARRAY[]::text[])) AS tag
        WHERE tag = ANY(${tagArray})
      )`
    : sql<number>`0`;

  const rows = await db
    .select(productSelection)
    .from(products)
    .where(and(
      ne(products.id, product.id),
      eq(products.isActive, true),
      isNotNull(products.imageUrl),
      isNotNull(products.affiliateUrl)
    ))
    .orderBy(desc(sharedTagScore), desc(products.qualityScore), desc(products.clickCount))
    .limit(Math.max(1, Math.min(limit, 12)));

  return (rows as ProductRow[]).map(toProduct);
}

export async function getIndexableGiftSitemapEntries(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  return db
    .select({
      slug: products.slug,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(
      eq(products.isActive, true),
      isNotNull(products.editorialWriteup),
      sql`length(trim(${products.editorialWriteup})) >= 500`
    ));
}
