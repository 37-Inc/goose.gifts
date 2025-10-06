import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftBundles } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug } = body;

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Slug is required' },
        { status: 400 }
      );
    }

    // Increment click count for the bundle (fire-and-forget style)
    await db
      .update(giftBundles)
      .set({
        clickCount: sql`${giftBundles.clickCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(giftBundles.slug, slug));

    // Return success quickly
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Click tracking error:', error);
    // Still return success to not block the user
    return NextResponse.json({ success: true });
  }
}
