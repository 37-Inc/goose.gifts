import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { searchQueries } from '@/lib/db/schema';
import { searchCatalogProducts } from '@/lib/db/product-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeLimit(value: string | null): number {
  const parsed = value ? parseInt(value, 10) : 36;

  if (!Number.isFinite(parsed)) {
    return 36;
  }

  return Math.max(1, Math.min(60, parsed));
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get('q') || '').trim();
    const limit = normalizeLimit(searchParams.get('limit'));

    if (query.length < 2) {
      return NextResponse.json({ results: [], searchId: null });
    }

    const results = await searchCatalogProducts(query, limit);
    const topSimilarity = results.length > 0 ? results[0].similarity : null;
    const userAgent = request.headers.get('user-agent') || undefined;
    let searchId: string | null = null;

    try {
      const [search] = await db.insert(searchQueries).values({
        query,
        resultCount: results.length,
        topSimilarity: topSimilarity?.toString(),
        userAgent,
      }).returning({ id: searchQueries.id });

      searchId = search?.id || null;
    } catch (error) {
      console.error('Failed to log product search query:', error);
    }

    return NextResponse.json({
      searchId,
      results,
    });
  } catch (error) {
    console.error('Product search API error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
