/**
 * Search Analytics - Database queries for search tracking and insights
 */

import { db } from './index';
import { searchQueries } from './schema';
import { sql, desc, and, gte, eq } from 'drizzle-orm';

/**
 * Get top search terms for a given time period
 */
export async function getTopSearchTerms(
  period: 'day' | 'week' | 'month',
  limit: number = 20
): Promise<Array<{ query: string; count: number; avgResults: number; clickRate: number }>> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  try {
    const results = await db.execute<{
      query: string;
      count: string;
      avg_results: string;
      click_rate: string;
    }>(sql`
      SELECT
        query,
        COUNT(*) as count,
        AVG(result_count)::numeric(10,2) as avg_results,
        (SUM(clicked)::float / COUNT(*)::float * 100)::numeric(5,2) as click_rate
      FROM search_queries
      WHERE created_at >= ${startDate.toISOString()}
      GROUP BY query
      ORDER BY count DESC
      LIMIT ${limit}
    `);

    return results.map(row => ({
      query: row.query,
      count: parseInt(row.count, 10),
      avgResults: parseFloat(row.avg_results),
      clickRate: parseFloat(row.click_rate),
    }));
  } catch (error) {
    console.error('Error fetching top search terms:', error);
    return [];
  }
}

/**
 * Get searches with no results (content gaps)
 */
export async function getFailedSearches(
  period: 'day' | 'week' | 'month',
  limit: number = 50
): Promise<Array<{ query: string; count: number; lastSearched: Date }>> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  try {
    const results = await db.execute<{
      query: string;
      count: string;
      last_searched: string;
    }>(sql`
      SELECT
        query,
        COUNT(*) as count,
        MAX(created_at) as last_searched
      FROM search_queries
      WHERE created_at >= ${startDate.toISOString()}
        AND result_count = 0
      GROUP BY query
      ORDER BY count DESC, last_searched DESC
      LIMIT ${limit}
    `);

    return results.map(row => ({
      query: row.query,
      count: parseInt(row.count, 10),
      lastSearched: new Date(row.last_searched),
    }));
  } catch (error) {
    console.error('Error fetching failed searches:', error);
    return [];
  }
}

/**
 * Get searches with poor results (low similarity scores)
 */
export async function getPoorResultSearches(
  period: 'day' | 'week' | 'month',
  limit: number = 50
): Promise<Array<{ query: string; count: number; avgSimilarity: number }>> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  try {
    const results = await db.execute<{
      query: string;
      count: string;
      avg_similarity: string;
    }>(sql`
      SELECT
        query,
        COUNT(*) as count,
        AVG(top_similarity)::numeric(5,4) as avg_similarity
      FROM search_queries
      WHERE created_at >= ${startDate.toISOString()}
        AND result_count > 0
        AND top_similarity < 0.6
      GROUP BY query
      ORDER BY count DESC
      LIMIT ${limit}
    `);

    return results.map(row => ({
      query: row.query,
      count: parseInt(row.count, 10),
      avgSimilarity: parseFloat(row.avg_similarity),
    }));
  } catch (error) {
    console.error('Error fetching poor result searches:', error);
    return [];
  }
}

/**
 * Get overall search analytics summary
 */
export async function getSearchAnalyticsSummary(
  period: 'day' | 'week' | 'month'
): Promise<{
  totalSearches: number;
  uniqueQueries: number;
  avgResultsPerSearch: number;
  overallClickRate: number;
  zeroResultRate: number;
}> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  try {
    const results = await db.execute<{
      total_searches: string;
      unique_queries: string;
      avg_results: string;
      click_rate: string;
      zero_result_rate: string;
    }>(sql`
      SELECT
        COUNT(*) as total_searches,
        COUNT(DISTINCT query) as unique_queries,
        AVG(result_count)::numeric(10,2) as avg_results,
        (SUM(clicked)::float / COUNT(*)::float * 100)::numeric(5,2) as click_rate,
        (SUM(CASE WHEN result_count = 0 THEN 1 ELSE 0 END)::float / COUNT(*)::float * 100)::numeric(5,2) as zero_result_rate
      FROM search_queries
      WHERE created_at >= ${startDate.toISOString()}
    `);

    const row = results[0];
    if (!row) {
      return {
        totalSearches: 0,
        uniqueQueries: 0,
        avgResultsPerSearch: 0,
        overallClickRate: 0,
        zeroResultRate: 0,
      };
    }

    return {
      totalSearches: parseInt(row.total_searches, 10),
      uniqueQueries: parseInt(row.unique_queries, 10),
      avgResultsPerSearch: parseFloat(row.avg_results),
      overallClickRate: parseFloat(row.click_rate),
      zeroResultRate: parseFloat(row.zero_result_rate),
    };
  } catch (error) {
    console.error('Error fetching search analytics summary:', error);
    return {
      totalSearches: 0,
      uniqueQueries: 0,
      avgResultsPerSearch: 0,
      overallClickRate: 0,
      zeroResultRate: 0,
    };
  }
}

/**
 * Get recent searches (for debugging/monitoring)
 */
export async function getRecentSearches(limit: number = 50) {
  try {
    return await db
      .select({
        id: searchQueries.id,
        query: searchQueries.query,
        resultCount: searchQueries.resultCount,
        topSimilarity: searchQueries.topSimilarity,
        clicked: searchQueries.clicked,
        clickedBundleSlug: searchQueries.clickedBundleSlug,
        createdAt: searchQueries.createdAt,
      })
      .from(searchQueries)
      .orderBy(desc(searchQueries.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('Error fetching recent searches:', error);
    return [];
  }
}
