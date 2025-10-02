import type { Product } from './types';

interface EtsySearchParams {
  keywords: string;
  minPrice: number;
  maxPrice: number;
}

interface EtsyListing {
  listing_id: number;
  title: string;
  description: string;
  price: {
    amount: number;
    divisor: number;
    currency_code: string;
  };
  url: string;
  images: Array<{
    url_570xN: string;
    url_fullxfull: string;
  }>;
}

export async function searchEtsyProducts(
  params: EtsySearchParams
): Promise<Product[]> {
  const searchParams = new URLSearchParams({
    keywords: params.keywords,
    min_price: params.minPrice.toString(),
    max_price: params.maxPrice.toString(),
    sort_on: 'score',
    sort_order: 'down',
    limit: '50',
    offset: '0',
  });

  const url = `https://api.etsy.com/v3/application/listings/active?${searchParams}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': process.env.ETSY_API_KEY!,
      },
    });

    if (!response.ok) {
      console.error('Etsy API error:', response.status);
      return [];
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return [];
    }

    // Generate affiliate links for products
    const products = await Promise.all(
      data.results.map(async (listing: EtsyListing) => {
        const affiliateUrl = await generateAwinAffiliateLink(listing.url);

        return {
          id: `etsy-${listing.listing_id}`,
          title: listing.title,
          price: listing.price.amount / listing.price.divisor,
          currency: listing.price.currency_code,
          imageUrl: listing.images?.[0]?.url_570xN || listing.images?.[0]?.url_fullxfull || '',
          affiliateUrl: affiliateUrl || listing.url, // Fallback to direct URL
          source: 'etsy' as const,
        };
      })
    );

    return products.filter(p => p.imageUrl);
  } catch (error) {
    console.error('Etsy search error:', error);
    return [];
  }
}

export async function generateAwinAffiliateLink(
  etsyProductUrl: string
): Promise<string | null> {
  if (!process.env.AWIN_PUBLISHER_ID || !process.env.AWIN_API_TOKEN) {
    return null; // Return null if Awin not configured
  }

  const endpoint = `https://api.awin.com/publishers/${process.env.AWIN_PUBLISHER_ID}/linkbuilder/generate`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AWIN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        advertiserId: parseInt(process.env.AWIN_ADVERTISER_ID || '6220'),
        destinationUrl: etsyProductUrl,
        parameters: {
          campaign: 'funny_gifts',
          clickref: extractListingId(etsyProductUrl),
        },
      }),
    });

    if (!response.ok) {
      console.error('Awin API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.url || null;
  } catch (error) {
    console.error('Awin link generation error:', error);
    return null;
  }
}

function extractListingId(etsyUrl: string): string {
  const match = etsyUrl.match(/listing\/(\d+)/);
  return match ? match[1] : '';
}

// Search with multiple keyword strategies
export async function searchMultipleStrategiesEtsy(
  baseKeywords: string,
  minPrice: number,
  maxPrice: number
): Promise<Product[]> {
  const keywordStrategies = [
    `${baseKeywords} funny`,
    `${baseKeywords} personalized`,
    `${baseKeywords} quirky handmade`,
    `${baseKeywords} humorous custom`,
  ];

  const searchPromises = keywordStrategies.map(keywords =>
    searchEtsyProducts({ keywords, minPrice, maxPrice })
  );

  try {
    const results = await Promise.all(searchPromises);
    const allProducts = results.flat();

    // Remove duplicates by ID
    const uniqueProducts = Array.from(
      new Map(allProducts.map(p => [p.id, p])).values()
    );

    return scoreAndSortEtsyProducts(uniqueProducts);
  } catch (error) {
    console.error('Multi-strategy Etsy search error:', error);
    return [];
  }
}

function scoreAndSortEtsyProducts(products: Product[]): Product[] {
  const humorKeywords = [
    'funny', 'hilarious', 'humor', 'sarcastic', 'witty',
    'quirky', 'unique', 'weird', 'novelty', 'gag', 'silly'
  ];

  return products
    .map(product => {
      let score = 0;
      const title = product.title.toLowerCase();

      humorKeywords.forEach(keyword => {
        if (title.includes(keyword)) score += 3;
      });

      if (title.includes('handmade')) score += 2;
      if (title.includes('personalized') || title.includes('custom')) score += 2;

      return { ...product, score };
    })
    .sort((a, b) => (b as any).score - (a as any).score)
    .map(({ score, ...product }) => product);
}
