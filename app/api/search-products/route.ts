import { NextRequest, NextResponse } from 'next/server';
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

    return NextResponse.json({
      searchId: null,
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
