import { NextRequest, NextResponse } from 'next/server';
import { searchBundles } from '@/lib/db/operations';

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
