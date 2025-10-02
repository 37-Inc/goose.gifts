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

    // Feature flag: enable full search once rate limits increase
    const enableFullSearch = process.env.ENABLE_FULL_SEARCH === 'true';

    const giftIdeas: GiftIdea[] = [];

    // Process concepts sequentially to respect rate limits
    for (const [index, concept] of concepts.entries()) {
      const allProducts: any[] = [];

      // LITE MODE: Search only first query (respects 1 req/sec limit)
      // FULL MODE: Search all queries for better product variety
      const queriesToSearch = enableFullSearch
        ? concept.productSearchQueries
        : [concept.productSearchQueries[0]];

      console.log(`📦 Searching ${queriesToSearch.length}/${concept.productSearchQueries.length} queries for "${concept.title}"`);

      // Search each query
      for (const query of queriesToSearch) {
        const [amazonProducts, etsyProducts] = await Promise.all([
          searchMultipleCategoriesAmazon(
            query,
            validatedRequest.minPrice / queriesToSearch.length,
            validatedRequest.maxPrice / queriesToSearch.length
          ),
          searchMultipleStrategiesEtsy(
            query,
            validatedRequest.minPrice / queriesToSearch.length,
            validatedRequest.maxPrice / queriesToSearch.length
          ),
        ]);

        allProducts.push(...amazonProducts, ...etsyProducts);

        // Add delay between queries if in full search mode
        if (enableFullSearch && queriesToSearch.indexOf(query) < queriesToSearch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // Take best 2-4 products for this concept
      const selectedProducts = allProducts.slice(0, Math.min(4, allProducts.length));

      giftIdeas.push({
        id: `gift-${Date.now()}-${index}`,
        title: concept.title,
        tagline: concept.tagline,
        description: concept.description,
        products: selectedProducts,
        humorStyle: validatedRequest.humorStyle,
      });

      // Add delay between concepts to respect rate limits (1.5s)
      if (index < concepts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

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
