import type { Product } from './types';

/**
 * Google Custom Search API implementation for Amazon product search
 *
 * This uses Google's Custom Search JSON API to search amazon.com
 * Workaround for Amazon PA-API rate limits
 *
 * Setup:
 * 1. Go to: https://programmablesearchengine.google.com/controlpanel/all
 * 2. Create new search engine, set to search "amazon.com"
 * 3. Get your Search Engine ID (cx parameter)
 * 4. Go to: https://console.cloud.google.com/apis/credentials
 * 5. Create API key for Custom Search JSON API
 *
 * Rate Limits:
 * - Free: 100 queries/day
 * - Paid: $5 per 1000 queries (up to 10k/day)
 */

interface GoogleSearchResult {
  title: string;
  link: string;
  snippet: string;
  pagemap?: {
    metatags?: Array<{
      'og:image'?: string;
      'og:price:amount'?: string;
      'og:price:currency'?: string;
    }>;
  };
}

interface GoogleSearchResponse {
  items?: GoogleSearchResult[];
}

export async function searchAmazonViaGoogle(
  query: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _minPrice?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _maxPrice?: number
): Promise<Product[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    console.log('⚠️  Google Search not configured, skipping...');
    return [];
  }

  try {
    // Add "best seller" prefix for better results (optional - can be toggled)
    const useBestSellerPrefix = process.env.GOOGLE_SEARCH_BEST_SELLER === 'true';
    const searchQuery = useBestSellerPrefix ? `best seller ${query}` : query;

    console.log(`🔍 Google searching Amazon for: "${searchQuery}"`);

    const params = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      q: searchQuery,
      siteSearch: 'amazon.com',
      siteSearchFilter: 'i', // include only from this site
      num: '10', // max results per request
    });

    const response = await fetch(
      `https://customsearch.googleapis.com/customsearch/v1?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Google Search API error:', response.status, error);
      return [];
    }

    const data: GoogleSearchResponse = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log('⚠️  No products found via Google for:', searchQuery);
      return [];
    }

    console.log(`✅ Found ${data.items.length} Amazon products via Google`);

    // Parse Amazon product URLs and extract info
    const products: Product[] = data.items
      .filter(item => item.link.includes('/dp/') || item.link.includes('/gp/product/'))
      .map(item => {
        // Extract ASIN from Amazon URL
        const asinMatch = item.link.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/);
        const asin = asinMatch ? (asinMatch[1] || asinMatch[2]) : item.link;

        // Try to extract price from metadata
        const metatag = item.pagemap?.metatags?.[0];
        let price = 0;
        if (metatag?.['og:price:amount']) {
          price = parseFloat(metatag['og:price:amount']);
        } else {
          // Try to extract from snippet
          const priceMatch = item.snippet.match(/\$(\d+(?:\.\d{2})?)/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1]);
          }
        }

        // Extract image URL (no fallback - we'll filter out products without images)
        const imageUrl = metatag?.['og:image'] || '';

        // Create Amazon affiliate link
        const affiliateTag = process.env.AMAZON_ASSOCIATE_TAG || '';
        const affiliateUrl = `https://www.amazon.com/dp/${asin}?tag=${affiliateTag}`;

        return {
          id: asin,
          title: item.title.replace(' - Amazon.com', '').replace(' : Amazon.com', ''),
          price,
          currency: 'USD',
          imageUrl,
          affiliateUrl,
          source: 'amazon' as const,
        };
      })
      .filter(product => product.imageUrl && product.imageUrl !== ''); // Filter out products without images

    return products;
  } catch (error) {
    console.error('❌ Google Amazon search failed:', error);
    return [];
  }
}

// Wrapper to match existing Amazon search signature
export async function searchAmazonViaGoogleMulti(
  keywords: string,
  minPrice: number,
  maxPrice: number
): Promise<Product[]> {
  // Simple single search - no category splitting needed with Google
  return searchAmazonViaGoogle(keywords, minPrice, maxPrice);
}
