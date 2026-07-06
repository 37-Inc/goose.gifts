import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products, productClicks, searchQueries } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, source = 'catalog', contextSlug, bundleSlug, searchQueryId } = body;

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
      source,
      bundleSlug: typeof contextSlug === 'string'
        ? contextSlug
        : typeof bundleSlug === 'string'
          ? bundleSlug
          : null,
      userAgent: request.headers.get('user-agent') || null,
      referer: request.headers.get('referer') || null,
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
