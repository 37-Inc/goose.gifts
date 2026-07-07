import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products, productClicks, searchQueries } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function getReferrerHost(referer: string | null): string | null {
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).hostname.slice(0, 255);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, source = 'catalog', contextSlug, bundleSlug, searchQueryId, attribution } = body;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    await db
      .update(products)
      .set({
        clickCount: sql`${products.clickCount} + 1`,
        lastClickedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    await db.insert(productClicks).values({
      productId,
      source: cleanString(source, 50) || 'catalog',
      bundleSlug: typeof contextSlug === 'string'
        ? contextSlug
        : typeof bundleSlug === 'string'
          ? bundleSlug
          : null,
      userAgent: request.headers.get('user-agent') || null,
      referer: request.headers.get('referer') || null,
      sessionId: cleanString(attribution?.sessionId, 100),
      landingPage: cleanString(attribution?.landingPage, 2000),
      utmSource: cleanString(attribution?.utmSource, 100),
      utmMedium: cleanString(attribution?.utmMedium, 100),
      utmCampaign: cleanString(attribution?.utmCampaign, 150),
      utmContent: cleanString(attribution?.utmContent, 150),
      utmTerm: cleanString(attribution?.utmTerm, 150),
      referrerHost: cleanString(attribution?.referrerHost, 255)
        || getReferrerHost(request.headers.get('referer')),
    });

    if (searchQueryId && typeof searchQueryId === 'string') {
      await db
        .update(searchQueries)
        .set({ clicked: 1 })
        .where(eq(searchQueries.id, searchQueryId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Click tracking error:', error);
    return NextResponse.json({ success: true });
  }
}
