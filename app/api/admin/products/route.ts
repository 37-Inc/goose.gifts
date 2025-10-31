import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Fetch all products with their stats
    const allProducts = await db
      .select({
        id: products.id,
        title: products.title,
        source: products.source,
        price: products.price,
        clickCount: products.clickCount,
        impressionCount: products.impressionCount,
        lastClickedAt: products.lastClickedAt,
      })
      .from(products)
      .where(sql`${products.imageUrl} IS NOT NULL`)
      .orderBy(sql`${products.clickCount} DESC`);

    // Calculate CTR for each product
    const productsWithCTR = allProducts.map(product => ({
      id: product.id,
      title: product.title,
      source: product.source,
      price: product.price,
      clickCount: product.clickCount || 0,
      impressionCount: product.impressionCount || 0,
      ctr: product.impressionCount && product.impressionCount > 0
        ? ((product.clickCount || 0) / product.impressionCount) * 100
        : 0,
      lastClickedAt: product.lastClickedAt,
    }));

    return NextResponse.json({
      success: true,
      data: productsWithCTR,
    });
  } catch (error) {
    console.error('Product stats fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch product stats',
      },
      { status: 500 }
    );
  }
}
