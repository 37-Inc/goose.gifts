import { NextResponse } from 'next/server';
import { getTrendingProducts } from '@/lib/db/operations';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to check if image URLs from database are accessible
 * Usage: GET /api/test-images
 */
export async function GET() {
  try {
    const products = await getTrendingProducts(10);

    const imageTests = await Promise.all(
      products.map(async (product) => {
        if (!product.imageUrl) {
          return {
            productId: product.id,
            title: product.title.substring(0, 60),
            imageUrl: null,
            accessible: false,
            error: 'No image URL',
          };
        }

        try {
          // Try to fetch the image to see if it's accessible
          const response = await fetch(product.imageUrl, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; goose.gifts/1.0)',
            },
          });

          const domain = new URL(product.imageUrl).hostname;

          return {
            productId: product.id,
            title: product.title.substring(0, 60),
            imageUrl: product.imageUrl,
            domain,
            accessible: response.ok,
            statusCode: response.status,
            contentType: response.headers.get('content-type'),
          };
        } catch (error) {
          return {
            productId: product.id,
            title: product.title.substring(0, 60),
            imageUrl: product.imageUrl,
            accessible: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const summary = {
      total: imageTests.length,
      accessible: imageTests.filter((t) => t.accessible).length,
      noImageUrl: imageTests.filter((t) => !t.imageUrl).length,
      failed: imageTests.filter((t) => !t.accessible && t.imageUrl).length,
    };

    return NextResponse.json({
      summary,
      results: imageTests,
    });
  } catch (error) {
    console.error('Image test error:', error);
    return NextResponse.json(
      { error: 'Failed to test images' },
      { status: 500 }
    );
  }
}
