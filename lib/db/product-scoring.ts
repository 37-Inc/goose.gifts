/**
 * Product scoring for trending section
 * Optimized for: high Amazon commissions + clickbait appeal
 */

import type { Product } from '@/lib/types';

// Amazon commission rates by category (2024)
const COMMISSION_RATES: Record<string, number> = {
  // High commission (8-10%)
  'luxury beauty': 10,
  'beauty': 10,
  'books': 10,
  'kitchen': 8,
  'automotive': 8,

  // Medium commission (4-5%)
  'toys': 4.5,
  'furniture': 4.5,
  'home': 4.5,
  'sports': 4.5,
  'outdoors': 4.5,
  'baby': 4.5,
  'apparel': 4.5,

  // Lower but still decent
  'electronics': 4,
  'health': 4,
  'pet supplies': 4,
  'garden': 3,

  // Low commission (avoid if possible)
  'computers': 2.5,
  'video games': 1,
  'grocery': 1,
};

// Clickbait keywords (boost visual/emotional appeal)
const CLICKBAIT_KEYWORDS = [
  // Visual appeal
  'aesthetic', 'luxury', 'premium', 'elegant', 'beautiful', 'stunning',
  'gorgeous', 'stylish', 'designer', 'chic', 'trendy',

  // Emotional triggers
  'gift', 'perfect', 'best', 'ultimate', 'essential', 'must-have',
  'amazing', 'incredible', 'unique', 'special', 'exclusive',

  // Self-care/wellness (popular categories)
  'spa', 'massage', 'aromatherapy', 'wellness', 'skincare', 'beauty',
  'relaxation', 'candle', 'bath', 'self-care',

  // Tech gadgets (high interest)
  'wireless', 'smart', 'portable', 'rechargeable', 'led', 'bluetooth',

  // Fashion/lifestyle
  'jewelry', 'watch', 'bracelet', 'necklace', 'ring', 'handbag',
  'wallet', 'sunglasses', 'scarf',

  // Food/drink (impulse purchases)
  'gourmet', 'artisan', 'organic', 'premium', 'craft', 'wine',
  'chocolate', 'coffee', 'tea',
];

// Price sweet spot (not too cheap, not too expensive)
const IDEAL_PRICE_MIN = 25;
const IDEAL_PRICE_MAX = 150;

/**
 * Estimate commission category from product title
 * (Since Amazon PA-API doesn't return category with commission rate)
 */
function estimateCategory(title: string): string {
  const lower = title.toLowerCase();

  // High commission categories (prioritize these)
  if (lower.match(/\b(lipstick|mascara|serum|skincare|makeup|cosmetic|perfume|fragrance)\b/)) return 'luxury beauty';
  if (lower.match(/\b(book|novel|cookbook|guide|manual)\b/)) return 'books';
  if (lower.match(/\b(knife|pan|pot|blender|mixer|cookware|utensil)\b/)) return 'kitchen';
  if (lower.match(/\b(car|automotive|tire|motor|vehicle)\b/)) return 'automotive';

  // Medium commission
  if (lower.match(/\b(toy|doll|lego|puzzle|game|playmat)\b/)) return 'toys';
  if (lower.match(/\b(chair|table|desk|sofa|bed|furniture)\b/)) return 'furniture';
  if (lower.match(/\b(decor|pillow|blanket|rug|lamp|vase)\b/)) return 'home';
  if (lower.match(/\b(yoga|fitness|workout|exercise|sports|camping|hiking)\b/)) return 'sports';
  if (lower.match(/\b(baby|infant|toddler|diaper|stroller)\b/)) return 'baby';
  if (lower.match(/\b(shirt|dress|jacket|shoes|clothing|apparel)\b/)) return 'apparel';

  // Lower commission
  if (lower.match(/\b(laptop|computer|tablet|monitor|keyboard|mouse)\b/)) return 'computers';
  if (lower.match(/\b(playstation|xbox|nintendo|gaming|console)\b/)) return 'video games';
  if (lower.match(/\b(snack|food|grocery|cereal)\b/)) return 'grocery';
  if (lower.match(/\b(headphones|speaker|camera|phone|electronic)\b/)) return 'electronics';

  // Default to medium commission
  return 'home';
}

/**
 * Score a product for trending section
 * Higher score = better for homepage visibility
 */
export function scoreProductForTrending(product: Product): number {
  let score = 0;
  const title = product.title.toLowerCase();

  // 1. Commission rate (0-40 points)
  const category = estimateCategory(product.title);
  const commissionRate = COMMISSION_RATES[category] || 3;
  score += commissionRate * 4; // 10% commission = 40 points

  // 2. Clickbait appeal (0-30 points)
  const clickbaitMatches = CLICKBAIT_KEYWORDS.filter(keyword =>
    title.includes(keyword)
  ).length;
  score += Math.min(clickbaitMatches * 5, 30);

  // 3. Price sweet spot (0-20 points)
  if (product.price >= IDEAL_PRICE_MIN && product.price <= IDEAL_PRICE_MAX) {
    score += 20;
  } else if (product.price < IDEAL_PRICE_MIN) {
    score += 5; // Too cheap = lower commission
  } else if (product.price > IDEAL_PRICE_MAX) {
    score += 10; // Too expensive = lower conversion
  }

  // 4. High rating (0-15 points)
  if (product.rating && product.rating >= 4.5) {
    score += 15;
  } else if (product.rating && product.rating >= 4.0) {
    score += 10;
  } else if (product.rating && product.rating >= 3.5) {
    score += 5;
  }

  // 5. Social proof via reviews (0-10 points)
  if (product.reviewCount) {
    if (product.reviewCount > 5000) score += 10;
    else if (product.reviewCount > 1000) score += 7;
    else if (product.reviewCount > 100) score += 5;
  }

  // 6. Has image (0-5 points)
  if (product.imageUrl) {
    score += 5;
  }

  // BONUS: Beauty/skincare/wellness extra boost (clickbait gold)
  if (title.match(/\b(skincare|beauty|spa|massage|aromatherapy|candle|bath)\b/)) {
    score += 15;
  }

  // BONUS: "For her" products (statistically higher engagement)
  if (title.match(/\b(jewelry|necklace|bracelet|earring|handbag|scarf)\b/)) {
    score += 10;
  }

  return Math.round(score);
}

/**
 * Score and sort products for trending display
 */
export function selectTrendingProducts(products: Product[], limit: number = 12): Product[] {
  const scored = products.map(product => ({
    ...product,
    trendingScore: scoreProductForTrending(product),
  }));

  return scored
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, limit);
}
