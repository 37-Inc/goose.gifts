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
export async function searchAmazonProducts(
  params: AmazonSearchParams
): Promise<Product[]> {
  // Return empty array if API not configured
  if (!process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY || !process.env.AWS_PARTNER_TAG) {
    console.log('Amazon API not configured, skipping...');
    return [];
  }

  const host = 'webservices.amazon.com';
  const region = 'us-east-1';
  const partnerTag = process.env.AWS_PARTNER_TAG!;

  const requestParams = {
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Keywords: params.keywords,
    SearchIndex: params.category || 'All',
    ItemCount: 10,
    MinPrice: Math.floor(params.minPrice * 100),
    MaxPrice: Math.floor(params.maxPrice * 100),
    Resources: [
      'ItemInfo.Title',
      'ItemInfo.Features',
      'ItemInfo.ByLineInfo',
      'Images.Primary.Medium',
      'Images.Primary.Large',
      'Offers.Listings.Price',
      'Offers.Summaries.LowestPrice',
    ],
  };

  try {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z/, 'Z');
    const canonicalRequest = createCanonicalRequest(requestParams, timestamp);
    const signature = createSignature(canonicalRequest, timestamp, region);

    const response = await fetch(`https://${host}/paapi5/searchitems`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Date': timestamp,
        'Authorization': `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY}/${getCredentialScope(timestamp, region)}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`,
        'Host': host,
      },
      body: JSON.stringify(requestParams),
    });

    if (!response.ok) {
      console.error('Amazon API error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();

    if (!data.SearchResult?.Items) {
      return [];
    }

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
    })).filter((product: Product) => product.price > 0 && product.imageUrl);
  } catch (error) {
    console.error('Amazon API error:', error);
    return [];
  }
}

// Helper functions for AWS4 signing
function createCanonicalRequest(params: any, timestamp: string): string {
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
export async function searchMultipleCategoriesAmazon(
  keywords: string,
  minPrice: number,
  maxPrice: number
): Promise<Product[]> {
  const categories = [
    'All',
    'ToysAndGames',
    'HomeAndKitchen',
    'OfficeProducts',
    'ArtsAndCrafts',
  ];

  const searchPromises = categories.map(category =>
    searchAmazonProducts({ keywords, minPrice, maxPrice, category })
  );

  try {
    const results = await Promise.all(searchPromises);
    const allProducts = results.flat();

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
    .sort((a, b) => (b as any).score - (a as any).score)
    .map(({ score, ...product }) => product);
}
