import type { Product } from './types';
import crypto from 'crypto';

interface AmazonSearchParams {
  keywords: string;
  minPrice: number;
  maxPrice: number;
  category?: string;
}

// Amazon PA-API direct implementation (works with Next.js)
// Based on official SDK but simplified for serverless
// Exponential backoff with jitter for 429 rate limit errors
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Don't retry if not a 429 rate limit error
      if (!errorMessage.includes('429') && !errorMessage.includes('TooManyRequests')) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s with jitter
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000; // 0-1000ms random jitter
      const delay = baseDelay + jitter;

      console.log(`⏳ Rate limited, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export async function searchAmazonProducts(
  params: AmazonSearchParams
): Promise<Product[]> {
  // Return empty array if API not configured
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_KEY || !process.env.AMAZON_ASSOCIATE_TAG) {
    console.error('❌ Amazon API not configured!');
    console.error('Missing:', {
      AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_KEY: !!process.env.AWS_SECRET_KEY,
      AMAZON_ASSOCIATE_TAG: !!process.env.AMAZON_ASSOCIATE_TAG,
    });
    return [];
  }

  console.log('✅ Amazon API configured, searching for:', params.keywords);

  return retryWithBackoff(async () => {
    return await searchAmazonProductsInternal(params);
  });
}

async function searchAmazonProductsInternal(
  params: AmazonSearchParams
): Promise<Product[]> {

  const region = process.env.AWS_REGION || 'us-east-1';
  const host = 'webservices.amazon.com';
  const marketplace = 'www.amazon.com';
  const partnerTag = process.env.AMAZON_ASSOCIATE_TAG!;

  const requestParams = {
    Marketplace: marketplace,
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Keywords: params.keywords,
    SearchIndex: params.category || 'All',
    ItemCount: 10,
    Resources: [
      'ItemInfo.Title',
      'ItemInfo.Features',
      'Images.Primary.Medium',
      'Images.Primary.Large',
      'Offers.Listings.Price',
    ],
  };

  try {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z/, 'Z');
    const canonicalRequest = createCanonicalRequest(requestParams, timestamp);
    const signature = createSignature(canonicalRequest, timestamp, region);

    console.log('🔍 Request details:', {
      host,
      region,
      partnerTag,
      keywords: params.keywords
    });

    const response = await fetch(`https://${host}/paapi5/searchitems`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Date': timestamp,
        'Authorization': `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${getCredentialScope(timestamp, region)}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`,
        'Host': host,
      },
      body: JSON.stringify(requestParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Amazon API error:', response.status, errorText);

      // Throw error for 429 so retry logic can catch it
      if (response.status === 429) {
        const error = new Error(`429 TooManyRequests: ${errorText}`);
        throw error;
      }

      return [];
    }

    const data = await response.json();

    if (!data.SearchResult?.Items) {
      console.log('⚠️  No products found for:', params.keywords);
      return [];
    }

    console.log(`✅ Found ${data.SearchResult.Items.length} products for:`, params.keywords);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.SearchResult.Items.map((item: any) => ({
      id: item.ASIN,
      title: item.ItemInfo?.Title?.DisplayValue || 'Untitled Product',
      price: parseFloat(item.Offers?.Listings?.[0]?.Price?.Amount || '0'),
      currency: item.Offers?.Listings?.[0]?.Price?.Currency || 'USD',
      imageUrl: item.Images?.Primary?.Large?.URL || item.Images?.Primary?.Medium?.URL || '',
      affiliateUrl: item.DetailPageURL,
      source: 'amazon' as const,
      rating: item.CustomerReviews?.StarRating?.Value,
      reviewCount: item.CustomerReviews?.Count,
    })).filter((product: Product) => product.imageUrl);
  } catch (error) {
    console.error('Amazon API error:', error);
    return [];
  }
}

// Helper functions for AWS4 signing
function createCanonicalRequest(params: Record<string, unknown>, timestamp: string): string {
  const payload = JSON.stringify(params);
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  return [
    'POST',
    '/paapi5/searchitems',
    '',
    'content-type:application/json; charset=utf-8',
    'host:webservices.amazon.com',
    `x-amz-date:${timestamp}`,
    '',
    'content-type;host;x-amz-date',
    hashedPayload,
  ].join('\n');
}

function createSignature(canonicalRequest: string, timestamp: string, region: string): string {
  const date = timestamp.split('T')[0];
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    getCredentialScope(timestamp, region),
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = crypto.createHmac('sha256', `AWS4${process.env.AWS_SECRET_KEY}`).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update('ProductAdvertisingAPI').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
}

function getCredentialScope(timestamp: string, region: string): string {
  const date = timestamp.split('T')[0];
  return `${date}/${region}/ProductAdvertisingAPI/aws4_request`;
}

// Search multiple categories for better variety
// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function searchMultipleCategoriesAmazon(
  keywords: string,
  minPrice: number,
  maxPrice: number
): Promise<Product[]> {
  // Feature flag: enable full search once rate limits increase
  const enableFullSearch = process.env.ENABLE_FULL_SEARCH === 'true';

  // FULL SEARCH MODE (better results, requires higher rate limits)
  // Searches 5 categories with delays - ~7.5 seconds per query
  const fullCategories = [
    'All',
    'ToysAndGames',
    'HomeAndKitchen',
    'OfficeProducts',
    'ArtsAndCrafts',
  ];

  // LITE SEARCH MODE (respects 1 req/sec limit for new accounts)
  // Searches only 'All' category - instant results
  const liteCategories = ['All'];

  const categories = enableFullSearch ? fullCategories : liteCategories;

  console.log(`🔍 Search mode: ${enableFullSearch ? 'FULL' : 'LITE'} (${categories.length} categories)`);

  const allProducts: Product[] = [];

  try {
    // Search categories sequentially with delay
    for (const category of categories) {
      const products = await searchAmazonProducts({ keywords, minPrice, maxPrice, category });
      allProducts.push(...products);

      // Delay 1.5 seconds between requests to stay under rate limit
      if (categories.indexOf(category) < categories.length - 1) {
        await delay(1500);
      }
    }

    // Remove duplicates by ASIN
    const uniqueProducts = Array.from(
      new Map(allProducts.map(p => [p.id, p])).values()
    );

    // Sort by relevance (presence of humor keywords in title)
    return scoreAndSortProducts(uniqueProducts);
  } catch (error) {
    console.error('Multi-category search error:', error);
    return [];
  }
}

function scoreAndSortProducts(products: Product[]): Product[] {
  const humorKeywords = [
    'funny', 'hilarious', 'humor', 'joke', 'gag',
    'quirky', 'unique', 'novelty', 'silly', 'weird'
  ];

  return products
    .map(product => {
      let score = 0;
      const title = product.title.toLowerCase();

      humorKeywords.forEach(keyword => {
        if (title.includes(keyword)) score += 3;
      });

      if (product.rating && product.rating >= 4) score += 2;
      if (product.reviewCount && product.reviewCount > 100) score += 1;

      return { ...product, score };
    })
    .sort((a, b) => (b as Product & { score: number }).score - (a as Product & { score: number }).score)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ score: _score, ...product }) => product);
}

// Helper function to create canonical request for GetItems operation
function createGetItemsCanonicalRequest(params: Record<string, unknown>, timestamp: string): string {
  const payload = JSON.stringify(params);
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  return [
    'POST',
    '/paapi5/getitems',
    '',
    'content-type:application/json; charset=utf-8',
    'host:webservices.amazon.com',
    `x-amz-date:${timestamp}`,
    '',
    'content-type;host;x-amz-date',
    hashedPayload,
  ].join('\n');
}

/**
 * Enrich products with accurate Amazon data using GetItems API
 * Fails silently if rate limited - returns original products
 *
 * @param products Products with ASINs to enrich
 * @returns Enriched products with current prices, ratings, and images
 */
export async function enrichProductsWithAmazonData(products: Product[]): Promise<Product[]> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_KEY || !process.env.AMAZON_ASSOCIATE_TAG) {
    console.log('⚠️ Amazon PA-API not configured, skipping enrichment');
    return products;
  }

  // Extract ASINs from product IDs
  const asins = products.map(p => p.id).filter(id => id.length === 10); // Valid ASINs are 10 chars

  if (asins.length === 0) {
    console.log('⚠️ No valid ASINs to enrich');
    return products;
  }

  const region = 'us-east-1';
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');

  const params = {
    PartnerTag: process.env.AMAZON_ASSOCIATE_TAG,
    PartnerType: 'Associates',
    ItemIds: asins,
    Resources: [
      'Images.Primary.Large',
      'Images.Primary.Medium',
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'CustomerReviews.StarRating',
      'CustomerReviews.Count',
    ],
  };

  try {
    const canonicalRequest = createGetItemsCanonicalRequest(params, timestamp);
    const signature = createSignature(canonicalRequest, timestamp, region);

    console.log(`📦 Enriching ${asins.length} products with Amazon PA-API...`);

    const response = await fetch('https://webservices.amazon.com/paapi5/getitems', {
      method: 'POST',
      headers: {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${getCredentialScope(timestamp, region)}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Host': 'webservices.amazon.com',
        'X-Amz-Date': timestamp,
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Check for rate limit
      if (response.status === 429 || errorText.includes('TooManyRequests')) {
        console.log('⚠️ Amazon PA-API rate limited, using original product data');
        return products; // Silent failure - return original products
      }

      console.error('❌ Amazon GetItems error:', response.status, errorText);
      return products; // Silent failure
    }

    const data = await response.json();

    if (!data.ItemsResult?.Items || data.ItemsResult.Items.length === 0) {
      console.log('⚠️ No items returned from Amazon PA-API');
      return products;
    }

    console.log(`✅ Enriched ${data.ItemsResult.Items.length} products with Amazon data`);

    // Create a map of ASIN to enriched data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichedMap = new Map<string, {
      title?: string;
      price?: number;
      imageUrl?: string;
      rating?: number;
      reviewCount?: number;
    }>(data.ItemsResult.Items.map((item: any) => [
      item.ASIN,
      {
        title: item.ItemInfo?.Title?.DisplayValue,
        price: parseFloat(item.Offers?.Listings?.[0]?.Price?.Amount || '0'),
        imageUrl: item.Images?.Primary?.Large?.URL || item.Images?.Primary?.Medium?.URL,
        rating: item.CustomerReviews?.StarRating?.Value,
        reviewCount: item.CustomerReviews?.Count,
      }
    ]));

    // Merge enriched data with original products
    return products.map(product => {
      const enriched = enrichedMap.get(product.id);
      if (!enriched) return product;

      return {
        ...product,
        ...(enriched.title && { title: enriched.title }),
        ...(enriched.price && enriched.price > 0 && { price: enriched.price }),
        ...(enriched.imageUrl && { imageUrl: enriched.imageUrl }),
        ...(enriched.rating && { rating: enriched.rating }),
        ...(enriched.reviewCount && { reviewCount: enriched.reviewCount }),
      };
    });
  } catch (error) {
    // Silent failure - log but return original products
    console.error('❌ Amazon enrichment failed:', error);
    return products;
  }
}
