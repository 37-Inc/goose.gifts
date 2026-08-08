import { and, desc, eq, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db } from './index';
import { productSlugHistory, products } from './schema';
import { cleanImageUrl } from '../image-utils';
import type { Product } from '../types';
import { hasIndexableGiftEditorial } from '../gift-slugs';

const productSelection = {
  id: products.id,
  publicId: products.publicId,
  slug: products.slug,
  title: products.title,
  punnyTitle: products.punnyTitle,
  wittyDescription: products.wittyDescription,
  editorialWriteup: products.editorialWriteup,
  sourceFacts: products.sourceFacts,
  sourceFactsHash: products.sourceFactsHash,
  editorialSourceHash: products.editorialSourceHash,
  availabilityStatus: products.availabilityStatus,
  availabilityCheckedAt: products.availabilityCheckedAt,
  lastVerifiedAt: products.lastVerifiedAt,
  editorialStatus: products.editorialStatus,
  editorialQualityScore: products.editorialQualityScore,
  editorialModel: products.editorialModel,
  editorialPromptVersion: products.editorialPromptVersion,
  editorialGeneratedAt: products.editorialGeneratedAt,
  editorialBlockReason: products.editorialBlockReason,
  duplicateOfProductId: products.duplicateOfProductId,
  contentUpdatedAt: products.contentUpdatedAt,
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
  sourceFacts: Record<string, unknown> | null;
  sourceFactsHash: string | null;
  editorialSourceHash: string | null;
  availabilityStatus: string | null;
  availabilityCheckedAt: Date | null;
  lastVerifiedAt: Date | null;
  editorialStatus: string;
  editorialQualityScore: string | null;
  editorialModel: string | null;
  editorialPromptVersion: string | null;
  editorialGeneratedAt: Date | null;
  editorialBlockReason: string | null;
  duplicateOfProductId: string | null;
  contentUpdatedAt: Date | null;
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
    sourceFacts: row.sourceFacts || undefined,
    sourceFactsHash: row.sourceFactsHash || undefined,
    editorialSourceHash: row.editorialSourceHash || undefined,
    availabilityStatus: row.availabilityStatus || undefined,
    availabilityCheckedAt: row.availabilityCheckedAt || undefined,
    lastVerifiedAt: row.lastVerifiedAt || undefined,
    editorialStatus: row.editorialStatus || undefined,
    editorialQualityScore: row.editorialQualityScore ? parseFloat(row.editorialQualityScore) : undefined,
    editorialModel: row.editorialModel || undefined,
    editorialPromptVersion: row.editorialPromptVersion || undefined,
    editorialGeneratedAt: row.editorialGeneratedAt || undefined,
    editorialBlockReason: row.editorialBlockReason || undefined,
    duplicateOfProductId: row.duplicateOfProductId || undefined,
    contentUpdatedAt: row.contentUpdatedAt || undefined,
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
  duplicateOfSlug?: string;
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

  let duplicateOfSlug: string | undefined;
  if (row.duplicateOfProductId) {
    const winner = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, row.duplicateOfProductId))
      .limit(1);
    duplicateOfSlug = winner[0]?.slug;
  }

  return {
    product: toProduct(row),
    canonicalSlug: row.slug,
    matchedHistoricalSlug: row.slug !== slug,
    duplicateOfSlug,
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
      isNotNull(products.affiliateUrl),
      isNotNull(products.editorialWriteup),
      or(eq(products.editorialStatus, 'generated_ready'), eq(products.editorialStatus, 'manual_locked'))
    ))
    .orderBy(desc(sharedTagScore), desc(products.qualityScore), desc(products.clickCount))
    .limit(Math.max(12, Math.min(limit * 4, 48)));

  return (rows as ProductRow[])
    .map(toProduct)
    .filter((candidate) => hasIndexableGiftEditorial(candidate))
    .slice(0, limit);
}

export async function getIndexableGiftSitemapEntries(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const rows = await db
    .select(productSelection)
    .from(products)
    .where(and(
      eq(products.isActive, true),
      isNotNull(products.imageUrl),
      isNotNull(products.editorialWriteup),
      or(eq(products.editorialStatus, 'generated_ready'), eq(products.editorialStatus, 'manual_locked'))
    ));

  return (rows as ProductRow[])
    .map(toProduct)
    .filter((product) => hasIndexableGiftEditorial(product))
    .map((product) => ({
      slug: product.slug || '',
      updatedAt: new Date(product.contentUpdatedAt || product.editorialGeneratedAt || product.lastVerifiedAt || 0),
    }))
    .filter((entry) => entry.slug && Number.isFinite(entry.updatedAt.getTime()));
}

export async function getIndexableGiftDirectoryPage(page: number, pageSize: number = 24): Promise<{
  products: Product[];
  page: number;
  pageCount: number;
  total: number;
}> {
  const rows = await db
    .select(productSelection)
    .from(products)
    .where(and(
      eq(products.isActive, true),
      isNotNull(products.imageUrl),
      isNotNull(products.editorialWriteup),
      or(eq(products.editorialStatus, 'generated_ready'), eq(products.editorialStatus, 'manual_locked'))
    ))
    .orderBy(desc(products.qualityScore), desc(products.clickCount));
  const eligible = (rows as ProductRow[]).map(toProduct).filter((product) => hasIndexableGiftEditorial(product));
  const safePageSize = Math.max(1, Math.min(pageSize, 48));
  const pageCount = Math.max(1, Math.ceil(eligible.length / safePageSize));
  const safePage = Math.max(1, Math.min(page, pageCount));

  return {
    products: eligible.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    page: safePage,
    pageCount,
    total: eligible.length,
  };
}
