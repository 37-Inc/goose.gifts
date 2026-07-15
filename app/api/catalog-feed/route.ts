import { NextRequest, NextResponse } from 'next/server';
import { getCatalogFeedProducts } from '@/lib/db/operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : 24;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(36, parsed)) : 24;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    seed?: unknown;
    limit?: unknown;
    excludeIds?: unknown;
  };
  const seed = (typeof body.seed === 'string' ? body.seed : 'goose-gifts').slice(0, 80);
  const limit = normalizeLimit(body.limit);
  const excludeIds = (Array.isArray(body.excludeIds) ? body.excludeIds : [])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 1200);

  const { timing, ...result } = await getCatalogFeedProducts({ seed, limit, excludeIds });
  const serverTiming = [
    `catalog-load;dur=${timing.loadMs}`,
    `catalog-rank;dur=${timing.rankMs}`,
    `catalog-dedupe;dur=${timing.dedupeMs}`,
    `catalog-total;dur=${timing.totalMs}`,
  ].join(', ');

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Server-Timing': serverTiming,
      'X-Catalog-Candidate-Count': String(timing.candidateCount),
    },
  });
}
