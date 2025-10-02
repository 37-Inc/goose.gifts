import { NextRequest, NextResponse } from 'next/server';
import { GiftRequestSchema, type GiftIdea } from '@/lib/types';
import { generateGiftConcepts } from '@/lib/openai';
import { searchMultipleCategoriesAmazon } from '@/lib/amazon';
import { searchMultipleStrategiesEtsy } from '@/lib/etsy';
import { saveGiftIdeas } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for API calls

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validatedRequest = GiftRequestSchema.parse(body);

    // Step 1: Generate gift concepts with AI
    console.log('Generating gift concepts...');
    const concepts = await generateGiftConcepts({
      recipientDescription: validatedRequest.recipientDescription,
      occasion: validatedRequest.occasion,
      humorStyle: validatedRequest.humorStyle,
      minPrice: validatedRequest.minPrice,
      maxPrice: validatedRequest.maxPrice,
    });

    if (concepts.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate gift concepts' },
        { status: 500 }
      );
    }

    console.log('\n🎁 AI GENERATED GIFT CONCEPTS:');
    concepts.forEach((concept, i) => {
      console.log(`\n${i + 1}. ${concept.title}`);
      console.log(`   "${concept.tagline}"`);
      console.log(`   ${concept.description}`);
      console.log(`   Products to search: ${concept.productSearchQueries.join(', ')}`);
    });

    // Step 2: Search for products for each concept
    console.log(`Searching products for ${concepts.length} concepts...`);
    const giftIdeas: GiftIdea[] = await Promise.all(
      concepts.map(async (concept, index) => {
        // Search both Amazon and Etsy for each query
        const productPromises = concept.productSearchQueries.map(async (query) => {
          const [amazonProducts, etsyProducts] = await Promise.all([
            searchMultipleCategoriesAmazon(
              query,
              validatedRequest.minPrice / concept.productSearchQueries.length,
              validatedRequest.maxPrice / concept.productSearchQueries.length
            ),
            searchMultipleStrategiesEtsy(
              query,
              validatedRequest.minPrice / concept.productSearchQueries.length,
              validatedRequest.maxPrice / concept.productSearchQueries.length
            ),
          ]);

          return [...amazonProducts, ...etsyProducts];
        });

        const allProductResults = await Promise.all(productPromises);
        const allProducts = allProductResults.flat();

        // Take best 2-4 products for this concept
        const selectedProducts = allProducts
          .slice(0, Math.min(4, allProducts.length));

        return {
          id: `gift-${Date.now()}-${index}`,
          title: concept.title,
          tagline: concept.tagline,
          description: concept.description,
          products: selectedProducts,
          humorStyle: validatedRequest.humorStyle,
        };
      })
    );

    // Filter out gift ideas with no products
    const validGiftIdeas = giftIdeas.filter(idea => idea.products.length > 0);

    if (validGiftIdeas.length === 0) {
      // Return the concepts even without products so user can see what AI generated
      console.log('⚠️  No products found, but returning concepts for preview');
      return NextResponse.json({
        success: false,
        message: 'API keys not configured - showing AI concepts only',
        concepts: concepts,
        giftIdeas: [], // Empty for now
        needsApiKeys: true,
      });
    }

    // Step 3: Save to database and generate permalink
    console.log('Saving gift ideas...');
    const slug = await saveGiftIdeas(validatedRequest, validGiftIdeas);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    return NextResponse.json({
      success: true,
      slug,
      permalinkUrl: `${baseUrl}/${slug}`,
      giftIdeas: validGiftIdeas,
    });
  } catch (error) {
    console.error('Gift generation error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
