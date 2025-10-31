import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftBundles, products, productClicks } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, productId, source = 'bundle' } = body;

    // Must have either slug or productId
    if ((!slug || typeof slug !== 'string') && (!productId || typeof productId !== 'string')) {
      return NextResponse.json(
        { success: false, error: 'Slug or productId is required' },
        { status: 400 }
      );
    }

    // Track product click (primary metric)
    if (productId) {
      // Increment product click count
      await db
        .update(products)
        .set({
          clickCount: sql`${products.clickCount} + 1`,
          lastClickedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      // Record detailed click event for analytics
      await db.insert(productClicks).values({
        productId,
        source,
        bundleSlug: slug || null,
        userAgent: request.headers.get('user-agent') || null,
        referer: request.headers.get('referer') || null,
      });
    }

    // Also track bundle click if slug provided (for backward compatibility)
    if (slug && slug !== 'trending') {
      await db
        .update(giftBundles)
        .set({
          clickCount: sql`${giftBundles.clickCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(giftBundles.slug, slug));
    }

    // Return success quickly
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Click tracking error:', error);
    // Still return success to not block the user
    return NextResponse.json({ success: true });
  }
}
