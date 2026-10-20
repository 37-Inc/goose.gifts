import { getGiftGuide, giftGuideFocusKeywordGroups } from './gift-guide-definitions';
import type { GiftGuideDefinition } from './gift-guide-definitions';
import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db } from './db/index';
import { products } from './db/schema';
import { cleanImageUrl } from './image-utils';
import type { Product } from './types';
import { selectGiftGuideDisplayProducts } from './db/product-scoring';
import { PUBLIC_CATALOG_CACHE_SECONDS } from './catalog-cache-policy';

export type { GiftGuideFaq } from './gift-guide-editorial';
export { giftGuides, getGiftGuide, getFeaturedGiftGuides } from './gift-guide-definitions';
export type { GiftGuideDefinition, GiftGuideEditorialSection } from './gift-guide-definitions';

const MIN_FOCUSED_GUIDE_PRODUCTS = 6;
const MAX_FALLBACK_GUIDE_PRODUCTS = 12;

function keywordRegex(keyword: string): string {
  const words = keyword.toLowerCase().match(/[a-z0-9]+/g) || [];

  return `(^|[^[:alnum:]])${words.join('[^[:alnum:]]+')}([^[:alnum:]]|$)`;
}

function titleKeywordMatchClause(keyword: string) {
  return sql`${products.title} ~* ${keywordRegex(keyword)}`;
}

function sourceQueryKeywordMatchClause(keyword: string) {
  return sql`COALESCE(${products.sourceQuery}, '') ~* ${keywordRegex(keyword)}`;
}

function generatedKeywordMatchClause(keyword: string) {
  const pattern = keywordRegex(keyword);

  return sql`(
    COALESCE(${products.punnyTitle}, '') ~* ${pattern}
    OR COALESCE(${products.wittyDescription}, '') ~* ${pattern}
    OR array_to_string(COALESCE(${products.humorTags}, ARRAY[]::text[]), ' ') ~* ${pattern}
  )`;
}

function keywordMatchClause(keyword: string) {
  return sql`(
    ${titleKeywordMatchClause(keyword)}
    OR ${sourceQueryKeywordMatchClause(keyword)}
    OR ${generatedKeywordMatchClause(keyword)}
  )`;
}

function titleKeywordGroupMatchClause(keywords: string[]) {
  return sql`(${sql.join(keywords.map(titleKeywordMatchClause), sql` OR `)})`;
}

function focusMatchClause(groups: string[][]) {
  return sql`(${sql.join(groups.map(titleKeywordGroupMatchClause), sql` AND `)})`;
}

function guideMatchScoreSql(guide: GiftGuideDefinition, groups: string[][]) {
  const titleScore = sql.join(
    guide.keywords.map((keyword) => sql`CASE WHEN ${titleKeywordMatchClause(keyword)} THEN 4 ELSE 0 END`),
    sql` + `
  );
  const sourceQueryScore = sql.join(
    guide.keywords.map((keyword) => sql`CASE WHEN ${sourceQueryKeywordMatchClause(keyword)} THEN 2 ELSE 0 END`),
    sql` + `
  );
  const generatedScore = sql.join(
    guide.keywords.map((keyword) => sql`CASE WHEN ${generatedKeywordMatchClause(keyword)} THEN 1 ELSE 0 END`),
    sql` + `
  );
  const focusScore = sql.join(
    groups.map((group) => sql`CASE WHEN ${titleKeywordGroupMatchClause(group)} THEN 10 ELSE 0 END`),
    sql` + `
  );

  return sql`(${titleScore}) + (${sourceQueryScore}) + (${generatedScore}) + (${focusScore})`;
}

async function selectGiftGuideRows(
  guide: GiftGuideDefinition,
  groups: string[][],
  limit: number,
  focusedOnly: boolean
) {
  const keywordClauses = guide.keywords.map(keywordMatchClause);
  const focusClause = focusMatchClause(groups);
  const matchScore = guideMatchScoreSql(guide, groups);
  const relevanceClause = focusedOnly
    ? focusClause
    : sql`(${focusClause} OR ${sql.join(keywordClauses, sql` OR `)})`;

  return db
    .select({
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
    })
    .from(products)
    .where(sql`
      ${products.isActive} = true
      AND ${products.imageUrl} IS NOT NULL
      AND ${products.affiliateUrl} IS NOT NULL
      AND (${products.price} <= 0 OR ${products.price} <= 250)
      AND ${relevanceClause}
    `)
    .orderBy(sql`${matchScore} DESC, ${products.qualityScore} DESC NULLS LAST, ${products.id} ASC`)
    .limit(limit);
}

async function loadGiftGuideProducts(guideSlug: string, limit: number): Promise<Product[]> {
  const guide = getGiftGuide(guideSlug);
  if (!guide) {
    return [];
  }

  const focusGroups = giftGuideFocusKeywordGroups[guide.slug] || [guide.keywords.slice(0, 1)];
  const candidateLimit = Math.max(limit, Math.min(limit * 2, 72));
  const toProduct = (row: Awaited<ReturnType<typeof selectGiftGuideRows>>[number]): Product => ({
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
      source: row.source as 'amazon' | 'etsy',
      rating: row.rating ? parseFloat(row.rating) : undefined,
      reviewCount: row.reviewCount || undefined,
    });
  const focusedRows = await selectGiftGuideRows(guide, focusGroups, candidateLimit, true);
  const focusedProducts = focusedRows.map(toProduct);
  const focusedSelection = selectGiftGuideDisplayProducts(focusedProducts, limit);
  const minimumFocusedProducts = Math.min(MIN_FOCUSED_GUIDE_PRODUCTS, limit);

  if (focusedSelection.length >= minimumFocusedProducts) {
    return focusedSelection;
  }

  const fallbackRows = await selectGiftGuideRows(guide, focusGroups, candidateLimit, false);
  return selectGiftGuideDisplayProducts(
    [...focusedProducts, ...fallbackRows.map(toProduct)],
    Math.min(limit, MAX_FALLBACK_GUIDE_PRODUCTS)
  );
}

const getCachedGiftGuideProducts = unstable_cache(
  loadGiftGuideProducts,
  ['gift-guide-products-v1'],
  {
    revalidate: PUBLIC_CATALOG_CACHE_SECONDS,
    tags: ['catalog-products'],
  }
);

export async function getGiftGuideProducts(
  guide: GiftGuideDefinition,
  limit: number = 36
): Promise<Product[]> {
  return getCachedGiftGuideProducts(guide.slug, limit);
}

export interface GuidePreview {
  imageUrl: string;
  source: 'amazon' | 'etsy';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

// Generic words that don't distinguish one gag gift from another; excluded
// when deriving a product's "family" so near-identical items (e.g. two fake
// belly fanny packs) are recognized as the same family and not shown together.
const PREVIEW_FAMILY_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'of', 'with', 'to', 'in', 'on', 'your',
  'gift', 'gifts', 'funny', 'gag', 'novelty', 'set', 'pack', 'kit', 'box',
  'men', 'women', 'him', 'her', 'kids', 'adult', 'adults', 'christmas',
  'birthday', 'holiday', 'secret', 'santa', 'white', 'elephant', 'stocking',
  'best', 'perfect', 'cool', 'unique', 'great', 'idea', 'ideas', 'present',
  'presents', 'him', 'dad', 'mom', 'new', 'pcs', 'piece', 'pieces', 'inch',
]);

function previewFamilyTokens(title: string): Set<string> {
  const tokens = (title.toLowerCase().match(/[a-z]+/g) || []).filter(
    (word) => word.length > 2 && !PREVIEW_FAMILY_STOPWORDS.has(word)
  );
  return new Set(tokens);
}

function sharesFamily(tokens: Set<string>, usedFamilies: Set<string>[]): boolean {
  for (const used of usedFamilies) {
    let overlap = 0;
    for (const token of tokens) {
      if (used.has(token)) {
        overlap += 1;
        if (overlap >= 2) return true;
      }
    }
  }
  return false;
}

/**
 * Pick one representative product image per guide for the directory tiles.
 *
 * Guarantees no two guides show the same product image, and avoids visual
 * near-duplicates (two different fake-belly fanny packs, say) by tracking a
 * loose product "family" derived from the title. Guides are satisfied
 * scarcest-first (fewest candidates); each takes its highest-quality image
 * whose family hasn't already been used, falling back to any unused image if
 * every remaining candidate collides. Returns a slug -> preview map; a guide
 * is omitted only if it has no usable, still-unclaimed image.
 */
export async function getGuidePreviewImages(
  guides: GiftGuideDefinition[]
): Promise<Record<string, GuidePreview>> {
  const pools = await mapWithConcurrency(guides, 8, async (guide) => {
    const products = await getGiftGuideProducts(guide, 10);
    return {
      slug: guide.slug,
      candidates: products
        .filter((product) => product.imageUrl && product.imageUrl.length > 10)
        .map((product) => ({
          imageUrl: product.imageUrl as string,
          source: product.source,
          quality: product.qualityScore ?? 0,
          family: previewFamilyTokens(product.title),
        })),
    };
  });

  const byScarcity = [...pools].sort(
    (a, b) => a.candidates.length - b.candidates.length
  );
  const usedImages = new Set<string>();
  const usedFamilies: Set<string>[] = [];
  const previews: Record<string, GuidePreview> = {};

  for (const pool of byScarcity) {
    const ranked = [...pool.candidates].sort((a, b) => b.quality - a.quality);
    const fresh = ranked.filter((candidate) => !usedImages.has(candidate.imageUrl));
    // Prefer an image whose product family hasn't been shown yet; only reuse a
    // family when this guide has nothing else left.
    const pick =
      fresh.find((candidate) => !sharesFamily(candidate.family, usedFamilies)) ||
      fresh[0];

    if (pick) {
      usedImages.add(pick.imageUrl);
      usedFamilies.push(pick.family);
      previews[pool.slug] = { imageUrl: pick.imageUrl, source: pick.source };
    }
  }

  return previews;
}
