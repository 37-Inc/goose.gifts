import { sql } from 'drizzle-orm';
import { db } from './index';
import { products } from './schema';
import { cleanImageUrl } from '../image-utils';
import { generateTextEmbedding } from '../openai-embeddings';
import type { Product, ProductSearchResult } from '../types';
import {
  isHomepageEligibleProduct,
  suppressNearDuplicateProducts,
} from './product-scoring';

const MAX_SEARCH_LIMIT = 60;
const SEARCH_OVERFETCH_FACTOR = 4;

type ProductSearchRow = {
  id: string;
  title: string;
  punny_title: string | null;
  witty_description: string | null;
  humor_tags: string[] | null;
  quality_score: string | null;
  source_query: string | null;
  is_active: boolean;
  price: string;
  currency: string;
  image_url: string | null;
  affiliate_url: string;
  source: string;
  rating: string | null;
  review_count: number | null;
  click_count: number | null;
  impression_count: number | null;
  last_clicked_at: Date | null;
  similarity: string | null;
  rank_score: string | null;
  match_type: 'semantic' | 'keyword';
};

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 36;
  }

  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(limit)));
}

function toProductSearchResult(row: ProductSearchRow): ProductSearchResult {
  return {
    id: row.id,
    title: row.title,
    punnyTitle: row.punny_title || undefined,
    wittyDescription: row.witty_description || undefined,
    humorTags: row.humor_tags || undefined,
    qualityScore: row.quality_score ? parseFloat(row.quality_score) : undefined,
    sourceQuery: row.source_query || undefined,
    isActive: row.is_active,
    price: parseFloat(row.price),
    currency: row.currency,
    imageUrl: cleanImageUrl(row.image_url || '', row.source),
    affiliateUrl: row.affiliate_url,
    source: row.source as Product['source'],
    rating: row.rating ? parseFloat(row.rating) : undefined,
    reviewCount: row.review_count || undefined,
    similarity: row.similarity ? parseFloat(row.similarity) : 0,
    rankScore: row.rank_score ? parseFloat(row.rank_score) : 0,
    matchType: row.match_type,
  };
}

function selectSearchResults(
  rankedProducts: ProductSearchResult[],
  limit: number
): ProductSearchResult[] {
  return suppressNearDuplicateProducts(
    rankedProducts.filter(isHomepageEligibleProduct),
    limit
  );
}

async function keywordSearchProducts(
  query: string,
  limit: number,
  excludeIds: string[] = []
): Promise<ProductSearchResult[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const likeQuery = `%${trimmed}%`;
  const terms = trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9-]/g, ''))
    .filter((term) => term.length >= 3)
    .slice(0, 8);
  const excludeClause = excludeIds.length > 0
    ? sql`AND id NOT IN (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  const termClauses = terms.map((term) => {
    const termLikeQuery = `%${term}%`;
    return sql`(
      title ILIKE ${termLikeQuery}
      OR punny_title ILIKE ${termLikeQuery}
      OR witty_description ILIKE ${termLikeQuery}
      OR source_query ILIKE ${termLikeQuery}
      OR array_to_string(COALESCE(humor_tags, ARRAY[]::text[]), ' ') ILIKE ${termLikeQuery}
    )`;
  });
  const termSearchClause = termClauses.length > 0
    ? sql`OR ${sql.join(termClauses, sql` OR `)}`
    : sql``;

  const rows = await db.execute<ProductSearchRow>(sql`
    SELECT
      id,
      title,
      punny_title,
      witty_description,
      humor_tags,
      quality_score,
      source_query,
      is_active,
      price,
      currency,
      image_url,
      affiliate_url,
      source,
      rating,
      review_count,
      click_count,
      impression_count,
      last_clicked_at,
      CASE
        WHEN punny_title ILIKE ${likeQuery} THEN 0.78
        WHEN title ILIKE ${likeQuery} THEN 0.74
        WHEN witty_description ILIKE ${likeQuery} THEN 0.68
        WHEN source_query ILIKE ${likeQuery} THEN 0.64
        WHEN array_to_string(COALESCE(humor_tags, ARRAY[]::text[]), ' ') ILIKE ${likeQuery} THEN 0.62
        ELSE 0.48
      END::numeric(5,4) AS similarity,
      (
        CASE
          WHEN punny_title ILIKE ${likeQuery} THEN 0.78
          WHEN title ILIKE ${likeQuery} THEN 0.74
          WHEN witty_description ILIKE ${likeQuery} THEN 0.68
          WHEN source_query ILIKE ${likeQuery} THEN 0.64
          WHEN array_to_string(COALESCE(humor_tags, ARRAY[]::text[]), ' ') ILIKE ${likeQuery} THEN 0.62
          ELSE 0.48
        END * 0.76
        + COALESCE(quality_score, 0)::float * 0.18
        + LEAST(COALESCE(click_count, 0), 50)::float / 50 * 0.04
        + CASE WHEN price::float > 0 AND price::float <= 75 THEN 0.02 ELSE 0 END
      )::numeric(7,4) AS rank_score,
      'keyword'::text AS match_type
    FROM products
    WHERE is_active = true
      AND image_url IS NOT NULL
      AND affiliate_url IS NOT NULL
      AND title <> ''
      AND (${products.price} <= 0 OR ${products.price} <= 250)
      ${excludeClause}
      AND (
        punny_title ILIKE ${likeQuery}
        OR title ILIKE ${likeQuery}
        OR witty_description ILIKE ${likeQuery}
        OR source_query ILIKE ${likeQuery}
        OR array_to_string(COALESCE(humor_tags, ARRAY[]::text[]), ' ') ILIKE ${likeQuery}
        ${termSearchClause}
      )
    ORDER BY rank_score DESC, quality_score DESC NULLS LAST, click_count DESC
    LIMIT ${limit}
  `);

  return rows.rows.map(toProductSearchResult);
}

export async function searchCatalogProducts(
  query: string,
  limit: number = 36
): Promise<ProductSearchResult[]> {
  const trimmed = query.trim();
  const normalizedLimit = normalizeLimit(limit);
  const candidateLimit = normalizedLimit * SEARCH_OVERFETCH_FACTOR;

  if (trimmed.length < 2) {
    return [];
  }

  const queryEmbedding = await generateTextEmbedding(trimmed);

  if (queryEmbedding.length === 0) {
    const keywordResults = await keywordSearchProducts(trimmed, candidateLimit);
    return selectSearchResults(keywordResults, normalizedLimit);
  }

  try {
    const vector = `[${queryEmbedding.join(',')}]`;
    const semanticRows = await db.execute<ProductSearchRow>(sql`
      SELECT
        id,
        title,
        punny_title,
        witty_description,
        humor_tags,
        quality_score,
        source_query,
        is_active,
        price,
        currency,
        image_url,
        affiliate_url,
        source,
        rating,
        review_count,
        click_count,
        impression_count,
        last_clicked_at,
        (1 - (embedding <=> ${vector}::vector))::numeric(5,4) AS similarity,
        (
          (1 - (embedding <=> ${vector}::vector)) * 0.76
          + COALESCE(quality_score, 0)::float * 0.16
          + LEAST(COALESCE(click_count, 0), 50)::float / 50 * 0.04
          + CASE WHEN price::float > 0 AND price::float <= 75 THEN 0.02 ELSE 0 END
          + CASE WHEN last_clicked_at >= NOW() - INTERVAL '14 days' THEN 0.02 ELSE 0 END
        )::numeric(7,4) AS rank_score,
        'semantic'::text AS match_type
      FROM products
      WHERE is_active = true
        AND image_url IS NOT NULL
        AND affiliate_url IS NOT NULL
        AND title <> ''
        AND embedding IS NOT NULL
        AND (${products.price} <= 0 OR ${products.price} <= 250)
      ORDER BY rank_score DESC, embedding <=> ${vector}::vector
      LIMIT ${candidateLimit}
    `);

    const semanticResults = semanticRows.rows.map(toProductSearchResult);
    const selectedSemanticResults = selectSearchResults(semanticResults, normalizedLimit);

    if (selectedSemanticResults.length >= normalizedLimit) {
      return selectedSemanticResults;
    }

    const fallbackResults = await keywordSearchProducts(
      trimmed,
      candidateLimit,
      semanticResults.map((product) => product.id)
    );

    return selectSearchResults(
      [...selectedSemanticResults, ...fallbackResults],
      normalizedLimit
    );
  } catch (error) {
    console.error('Error searching catalog products:', error);
    const keywordResults = await keywordSearchProducts(trimmed, candidateLimit);
    return selectSearchResults(keywordResults, normalizedLimit);
  }
}
