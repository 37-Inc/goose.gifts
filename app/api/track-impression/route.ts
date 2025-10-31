import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { sql, inArray } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productIds } = body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'productIds array is required' },
        { status: 400 }
      );
    }

    // Increment impression count for all products shown
    await db
      .update(products)
      .set({
        impressionCount: sql`${products.impressionCount} + 1`,
      })
      .where(inArray(products.id, productIds));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Impression tracking error:', error);
    // Still return success to not block the user
    return NextResponse.json({ success: true });
  }
}
