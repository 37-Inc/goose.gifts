import { NextRequest, NextResponse } from 'next/server';
import { GiftRequestSchema, type GiftIdea, type Product } from '@/lib/types';
import { generateGiftConcepts, selectBestProductsBatch } from '@/lib/openai';
import { searchMultipleCategoriesAmazon, enrichProductsWithAmazonData } from '@/lib/amazon';
import { searchAmazonViaGoogleMulti } from '@/lib/google-amazon-search';
import { saveGiftIdeas } from '@/lib/db/operations';
import { generateSEOContent } from '@/lib/seo';
import { PRODUCTS_PER_BUNDLE } from '@/lib/config';

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

    // Step 1.5: Kick off SEO generation in parallel (doesn't need final products)
    const seoPromise = process.env.POSTGRES_URL ? (async () => {
      console.log('⚡ Starting SEO generation in parallel...');
      const tempGiftIdeas = concepts.map((concept, i) => ({
        id: `temp-${i}`,
        title: concept.title,
        tagline: concept.tagline,
        description: concept.description,
        products: [],
        humorStyle: validatedRequest.humorStyle,
      }));
      return await generateSEOContent(
        validatedRequest.recipientDescription,
        validatedRequest.occasion,
        tempGiftIdeas
      );
    })() : null;

    // Step 2: Search for products for each concept
    console.log(`Searching products for ${concepts.length} concepts...`);

    // Feature flags
    const enableFullSearch = process.env.ENABLE_FULL_SEARCH === 'true';
    const useGoogleSearch = process.env.USE_GOOGLE_AMAZON_SEARCH === 'true';

    // Choose Amazon search method
    const amazonSearchFn = useGoogleSearch
      ? searchAmazonViaGoogleMulti
      : searchMultipleCategoriesAmazon;

    console.log(`🔧 Search mode: ${useGoogleSearch ? 'GOOGLE' : 'PA-API'} | ${enableFullSearch ? 'FULL' : 'LITE'}`);

    const giftIdeas: GiftIdea[] = [];

    // Google Search can run in parallel (no strict rate limits)
    // PA-API needs sequential processing (1 req/sec limit)
    if (useGoogleSearch) {
      // PARALLEL MODE for Google Search - much faster!
      // Step 2a: Search products for all concepts in parallel
      const conceptProductPromises = concepts.map(async (concept) => {
        const queriesToSearch = concept.productSearchQueries;

        console.log(`📦 Searching ${queriesToSearch.length} queries for "${concept.title}"`);

        // Search all queries in parallel
        const productPromises = queriesToSearch.map(async (query) => {
          const amazonProducts = await amazonSearchFn(
            query,
            validatedRequest.minPrice / queriesToSearch.length,
            validatedRequest.maxPrice / queriesToSearch.length
          );
          return amazonProducts;
        });

        const allProductResults = await Promise.all(productPromises);
        let allProducts = allProductResults.flat();

        // Basic deduplication by product ID
        const seenIds = new Set<string>();
        allProducts = allProducts.filter(product => {
          if (seenIds.has(product.id)) return false;
          seenIds.add(product.id);
          return true;
        });

        console.log(`🔍 Found ${allProducts.length} unique products for "${concept.title}"`);

        return {
          title: concept.title,
          tagline: concept.tagline,
          description: concept.description,
          products: allProducts,
        };
      });

      const conceptsWithProducts = await Promise.all(conceptProductPromises);

      // Step 2b: Use BATCHED LLM to select products for ALL concepts at once (1 API call instead of 3)
      console.log(`🤖 Batching LLM product selection for ${conceptsWithProducts.length} concepts...`);
      const selectedProductsForAllConcepts = await selectBestProductsBatch(
        conceptsWithProducts,
        PRODUCTS_PER_BUNDLE
      );

      // Step 2c: Build gift ideas with selected products and optionally enrich
      const enableEnrichment = process.env.ENABLE_AMAZON_ENRICHMENT === 'true';
      const giftIdeaPromises = conceptsWithProducts.map(async (concept, index) => {
        const selectedProducts = selectedProductsForAllConcepts[index];
        console.log(`✅ Selected ${selectedProducts.length} products for "${concept.title}"`);

        // Enrich selected products with accurate Amazon data (price, ratings, images)
        const enrichedProducts = enableEnrichment
          ? await enrichProductsWithAmazonData(selectedProducts)
          : selectedProducts;

        return {
          id: `gift-${Date.now()}-${index}`,
          title: concept.title,
          tagline: concept.tagline,
          description: concept.description,
          products: enrichedProducts,
          humorStyle: validatedRequest.humorStyle,
        };
      });

      giftIdeas.push(...await Promise.all(giftIdeaPromises));
    } else {
      // SEQUENTIAL MODE for PA-API - respect rate limits
      // Step 2a: Search products for all concepts sequentially
      const conceptsWithProducts: Array<{
        title: string;
        tagline: string;
        description: string;
        products: Product[];
      }> = [];

      for (const [index, concept] of concepts.entries()) {
        let allProducts: Product[] = [];

        // LITE MODE: Search only first 2 queries (respects 1 req/sec limit)
        // FULL MODE: Search all queries for better product variety
        const queriesToSearch = enableFullSearch
          ? concept.productSearchQueries
          : concept.productSearchQueries.slice(0, 2);

        console.log(`📦 Searching ${queriesToSearch.length}/${concept.productSearchQueries.length} queries for "${concept.title}"`);

        // Search each query sequentially
        for (const query of queriesToSearch) {
          const amazonProducts = await amazonSearchFn(
            query,
            validatedRequest.minPrice / queriesToSearch.length,
            validatedRequest.maxPrice / queriesToSearch.length
          );

          allProducts.push(...amazonProducts);

          // Add delay between queries
          if (queriesToSearch.indexOf(query) < queriesToSearch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        // Basic deduplication by product ID
        const seenIds = new Set<string>();
        allProducts = allProducts.filter(product => {
          if (seenIds.has(product.id)) return false;
          seenIds.add(product.id);
          return true;
        });

        console.log(`🔍 Found ${allProducts.length} unique products for "${concept.title}"`);

        conceptsWithProducts.push({
          title: concept.title,
          tagline: concept.tagline,
          description: concept.description,
          products: allProducts,
        });

        // Add delay between concepts to respect rate limits (1.5s)
        if (index < concepts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // Step 2b: Use BATCHED LLM to select products for ALL concepts at once (1 API call instead of 3)
      console.log(`🤖 Batching LLM product selection for ${conceptsWithProducts.length} concepts...`);
      const selectedProductsForAllConcepts = await selectBestProductsBatch(
        conceptsWithProducts,
        PRODUCTS_PER_BUNDLE
      );

      // Step 2c: Build gift ideas with selected products
      conceptsWithProducts.forEach((concept, index) => {
        const selectedProducts = selectedProductsForAllConcepts[index];
        console.log(`✅ Selected ${selectedProducts.length} products for "${concept.title}"`);

        giftIdeas.push({
          id: `gift-${Date.now()}-${index}`,
          title: concept.title,
          tagline: concept.tagline,
          description: concept.description,
          products: selectedProducts,
          humorStyle: validatedRequest.humorStyle,
        });
      });
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

    // Step 3: Save to database and generate permalink (optional)
    let slug = null;
    let permalinkUrl = null;

    if (process.env.POSTGRES_URL) {
      try {
        console.log('Saving gift ideas...');
        // Await SEO content (should be ready by now, or will wait briefly)
        const seoContent = await seoPromise!;
        console.log('✅ SEO content ready');
        slug = await saveGiftIdeas(validatedRequest, validGiftIdeas, seoContent);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        permalinkUrl = `${baseUrl}/${slug}`;
      } catch (error) {
        console.warn('⚠️  Failed to save to database, continuing without permalink:', error);
      }
    } else {
      console.log('⚠️  Database not configured, skipping permalink generation');
    }

    return NextResponse.json({
      success: true,
      slug,
      permalinkUrl,
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
