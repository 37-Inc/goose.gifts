import { NextRequest, NextResponse } from 'next/server';
import { GiftRequestSchema, type GiftIdea, type Product, type GiftRequest } from '@/lib/types';
import { generateGiftConcepts, selectBestProductsBatch, type GiftConcept } from '@/lib/openai';
import { searchMultipleCategoriesAmazon, enrichProductsWithAmazonData } from '@/lib/amazon';
import { searchAmazonViaGoogleMulti } from '@/lib/google-amazon-search';
import { saveGiftIdeas } from '@/lib/db/operations';
import { generateSEOContent, type SEOContent } from '@/lib/seo';
import { PRODUCTS_PER_BUNDLE } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for API calls

// ============================================================================
// TYPES
// ============================================================================

interface ConceptWithProducts {
  title: string;
  tagline: string;
  description: string;
  products: Product[];
}

interface SearchConfig {
  enableFullSearch: boolean;
  useGoogleSearch: boolean;
  enableEnrichment: boolean;
}

// ============================================================================
// UTILITIES
// ============================================================================

/** Performance timing helper */
function logTiming(label: string, startTime: number): string {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️  ${label}: ${duration}s`);
  return duration;
}

/** Deduplicate products by ID */
function deduplicateProducts(products: Product[]): Product[] {
  const seenIds = new Set<string>();
  return products.filter(product => {
    if (seenIds.has(product.id)) return false;
    seenIds.add(product.id);
    return true;
  });
}

// ============================================================================
// CORE PIPELINE STEPS
// ============================================================================

/**
 * STEP 1: Start SEO generation in parallel (doesn't need products)
 */
function startParallelSEO(
  concepts: GiftConcept[],
  recipientDescription: string,
  occasion: string | undefined,
  humorStyle: string
): Promise<SEOContent> | null {
  if (!process.env.POSTGRES_URL) return null;

  console.log('⚡ Starting SEO generation in parallel...');

  return generateSEOContent(
    recipientDescription,
    occasion,
    concepts.map((concept, i) => ({
      id: `temp-${i}`,
      title: concept.title,
      tagline: concept.tagline,
      description: concept.description,
      products: [],
      humorStyle,
    }))
  );
}

/**
 * STEP 2A: Search products for all concepts in parallel (Google mode)
 */
async function searchProductsParallel(
  concepts: GiftConcept[],
  request: GiftRequest,
  searchFn: typeof searchAmazonViaGoogleMulti
): Promise<ConceptWithProducts[]> {
  const conceptPromises = concepts.map(async (concept) => {
    console.log(`📦 Searching ${concept.productSearchQueries.length} queries for "${concept.title}"`);

    // Search all queries in parallel
    const productResults = await Promise.all(
      concept.productSearchQueries.map(query =>
        searchFn(
          query,
          request.minPrice / concept.productSearchQueries.length,
          request.maxPrice / concept.productSearchQueries.length
        )
      )
    );

    const allProducts = deduplicateProducts(productResults.flat());
    console.log(`🔍 Found ${allProducts.length} unique products for "${concept.title}"`);

    return {
      title: concept.title,
      tagline: concept.tagline,
      description: concept.description,
      products: allProducts,
    };
  });

  return await Promise.all(conceptPromises);
}

/**
 * STEP 2B: Search products for all concepts sequentially (PA-API mode with rate limits)
 */
async function searchProductsSequential(
  concepts: GiftConcept[],
  request: GiftRequest,
  searchFn: typeof searchMultipleCategoriesAmazon,
  enableFullSearch: boolean
): Promise<ConceptWithProducts[]> {
  const conceptsWithProducts: ConceptWithProducts[] = [];

  for (const [index, concept] of concepts.entries()) {
    const queriesToSearch = enableFullSearch
      ? concept.productSearchQueries
      : concept.productSearchQueries.slice(0, 2);

    console.log(`📦 Searching ${queriesToSearch.length}/${concept.productSearchQueries.length} queries for "${concept.title}"`);

    let allProducts: Product[] = [];

    // Search each query sequentially with rate limit delays
    for (const query of queriesToSearch) {
      const products = await searchFn(
        query,
        request.minPrice / queriesToSearch.length,
        request.maxPrice / queriesToSearch.length
      );

      allProducts.push(...products);

      // Add delay between queries (1.5s)
      if (queriesToSearch.indexOf(query) < queriesToSearch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    allProducts = deduplicateProducts(allProducts);
    console.log(`🔍 Found ${allProducts.length} unique products for "${concept.title}"`);

    conceptsWithProducts.push({
      title: concept.title,
      tagline: concept.tagline,
      description: concept.description,
      products: allProducts,
    });

    // Add delay between concepts (1.5s)
    if (index < concepts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  return conceptsWithProducts;
}

/**
 * STEP 3: Use LLM to select best products from search results
 */
async function curateProductsWithLLM(
  conceptsWithProducts: ConceptWithProducts[],
  productsPerBundle: number
): Promise<Product[][]> {
  console.log(`🤖 Batching LLM product selection for ${conceptsWithProducts.length} concepts...`);

  const selectedProducts = await selectBestProductsBatch(
    conceptsWithProducts,
    productsPerBundle
  );

  conceptsWithProducts.forEach((concept, i) => {
    console.log(`✅ Selected ${selectedProducts[i].length} products for "${concept.title}"`);
  });

  return selectedProducts;
}

/**
 * STEP 4: Build final gift ideas with optional enrichment
 */
async function buildGiftIdeas(
  conceptsWithProducts: ConceptWithProducts[],
  selectedProducts: Product[][],
  humorStyle: string,
  enableEnrichment: boolean
): Promise<GiftIdea[]> {
  const giftIdeaPromises = conceptsWithProducts.map(async (concept, index) => {
    // Optionally enrich with accurate Amazon data (price, ratings, images)
    const products = enableEnrichment
      ? await enrichProductsWithAmazonData(selectedProducts[index])
      : selectedProducts[index];

    return {
      id: `gift-${Date.now()}-${index}`,
      title: concept.title,
      tagline: concept.tagline,
      description: concept.description,
      products,
      humorStyle,
    };
  });

  return await Promise.all(giftIdeaPromises);
}

/**
 * STEP 5: Save to database with permalink
 */
async function saveWithPermalink(
  request: GiftRequest,
  giftIdeas: GiftIdea[],
  seoPromise: Promise<SEOContent> | null
): Promise<{ slug: string | null; permalinkUrl: string | null }> {
  if (!process.env.POSTGRES_URL || !seoPromise) {
    console.log('⚠️  Database not configured, skipping permalink generation');
    return { slug: null, permalinkUrl: null };
  }

  try {
    console.log('Saving gift ideas...');

    // Wait for SEO content to finish (if not ready yet)
    const seoWaitStart = Date.now();
    const seoContent = await seoPromise;
    logTiming('SEO wait time', seoWaitStart);

    // Save to database
    const dbSaveStart = Date.now();
    const slug = await saveGiftIdeas(request, giftIdeas, seoContent);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const permalinkUrl = `${baseUrl}/${slug}`;
    logTiming('Database insert', dbSaveStart);

    return { slug, permalinkUrl };
  } catch (error) {
    console.warn('⚠️  Failed to save to database, continuing without permalink:', error);
    return { slug: null, permalinkUrl: null };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const validatedRequest = GiftRequestSchema.parse(body);

    // ========================================================================
    // STEP 1: Generate gift concepts with AI
    // ========================================================================
    console.log('Generating gift concepts...');
    const conceptStartTime = Date.now();

    const concepts = await generateGiftConcepts({
      recipientDescription: validatedRequest.recipientDescription,
      occasion: validatedRequest.occasion,
      humorStyle: validatedRequest.humorStyle,
      minPrice: validatedRequest.minPrice,
      maxPrice: validatedRequest.maxPrice,
    });

    logTiming('Concept generation', conceptStartTime);

    if (concepts.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate gift concepts' },
        { status: 500 }
      );
    }

    // Log generated concepts
    console.log('\n🎁 AI GENERATED GIFT CONCEPTS:');
    concepts.forEach((concept, i) => {
      console.log(`\n${i + 1}. ${concept.title}`);
      console.log(`   "${concept.tagline}"`);
      console.log(`   ${concept.description}`);
      console.log(`   Products to search: ${concept.productSearchQueries.join(', ')}`);
    });

    // Start SEO generation in parallel (doesn't block main flow)
    const seoPromise = startParallelSEO(
      concepts,
      validatedRequest.recipientDescription,
      validatedRequest.occasion,
      validatedRequest.humorStyle
    );

    // ========================================================================
    // STEP 2: Search for products
    // ========================================================================
    console.log(`Searching products for ${concepts.length} concepts...`);
    const searchStartTime = Date.now();

    // Configure search mode
    const config: SearchConfig = {
      enableFullSearch: process.env.ENABLE_FULL_SEARCH === 'true',
      useGoogleSearch: process.env.USE_GOOGLE_AMAZON_SEARCH === 'true',
      enableEnrichment: process.env.ENABLE_AMAZON_ENRICHMENT === 'true',
    };

    console.log(`🔧 Search mode: ${config.useGoogleSearch ? 'GOOGLE' : 'PA-API'} | ${config.enableFullSearch ? 'FULL' : 'LITE'}`);

    // Search using appropriate method (parallel Google or sequential PA-API)
    const conceptsWithProducts = config.useGoogleSearch
      ? await searchProductsParallel(concepts, validatedRequest, searchAmazonViaGoogleMulti)
      : await searchProductsSequential(
          concepts,
          validatedRequest,
          searchMultipleCategoriesAmazon,
          config.enableFullSearch
        );

    logTiming(`Product search (${config.useGoogleSearch ? 'parallel' : 'sequential'})`, searchStartTime);

    // ========================================================================
    // STEP 3: Curate products with LLM
    // ========================================================================
    const llmStartTime = Date.now();
    const selectedProducts = await curateProductsWithLLM(conceptsWithProducts, PRODUCTS_PER_BUNDLE);
    logTiming('LLM product selection', llmStartTime);

    // ========================================================================
    // STEP 4: Build final gift ideas
    // ========================================================================
    const enrichStartTime = Date.now();
    const giftIdeas = await buildGiftIdeas(
      conceptsWithProducts,
      selectedProducts,
      validatedRequest.humorStyle,
      config.enableEnrichment
    );
    if (config.enableEnrichment) {
      logTiming('Product enrichment', enrichStartTime);
    }

    // Filter out gift ideas with no products
    const validGiftIdeas = giftIdeas.filter(idea => idea.products.length > 0);

    if (validGiftIdeas.length === 0) {
      console.log('⚠️  No products found, but returning concepts for preview');
      return NextResponse.json({
        success: false,
        message: 'API keys not configured - showing AI concepts only',
        concepts: concepts,
        giftIdeas: [],
        needsApiKeys: true,
      });
    }

    // ========================================================================
    // STEP 5: Save to database with permalink
    // ========================================================================
    const { slug, permalinkUrl } = await saveWithPermalink(
      validatedRequest,
      validGiftIdeas,
      seoPromise
    );

    logTiming('TOTAL REQUEST', requestStartTime);

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
