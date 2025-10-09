import { NextRequest, NextResponse } from 'next/server';
import { searchBundles } from '@/lib/db/operations';
import { db } from '@/lib/db/index';
import { searchQueries } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Minimum query length to avoid too broad searches
    if (query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchBundles(query, limit);

    // Log search query to database (fire-and-forget)
    const topSimilarity = results.length > 0 ? results[0].similarity : null;
    const userAgent = request.headers.get('user-agent') || undefined;

    db.insert(searchQueries)
      .values({
        query: query.trim(),
        resultCount: results.length,
        topSimilarity: topSimilarity?.toString(),
        userAgent,
      })
      .catch(err => console.error('Failed to log search query:', err));

    return NextResponse.json({
      results: results.map(r => ({
        id: r.id,
        slug: r.slug,
        title: r.seoTitle || r.recipientDescription,
        description: r.recipientDescription,
        occasion: r.occasion,
        similarity: r.similarity,
        url: `/${r.slug}`,
        productImages: r.productImages,
      })),
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
