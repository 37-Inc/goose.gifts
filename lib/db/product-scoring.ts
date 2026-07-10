import type { Product } from '@/lib/types';

const STRONG_GAG_TERMS = [
  'funny', 'gag', 'prank', 'weird', 'novelty', 'ridiculous', 'sarcastic',
  'silly', 'fart', 'poop', 'whoopee', 'bullshit', 'penis', 'testicle',
  'middle finger', 'dad joke', 'white elephant', 'screaming goat',
];

const GENERIC_GIFT_TERMS = [
  'bath bomb', 'skincare', 'makeup bag', 'makeup brush', 'eyeshadow',
  'coloring book', 'gift basket', 'stuffed animal', 'cookbook', 'candle',
  'chocolate gift', 'costume',
];

function normalizedCatalogText(product: Product): string {
  return [product.title, product.sourceQuery, ...(product.humorTags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchingTerms(text: string, terms: string[]): number {
  return terms.filter((term) => text.includes(term)).length;
}

export function isHomepageEligibleProduct(product: Product): boolean {
  if (product.isActive === false || !product.imageUrl || !product.affiliateUrl) {
    return false;
  }

  if ((product.qualityScore || 0) < 0.55) {
    return false;
  }

  const originalTitle = product.title.toLowerCase();
  const hasCuratedSource = Boolean(product.sourceQuery?.trim());
  const hasExplicitGagSignal = matchingTerms(originalTitle, STRONG_GAG_TERMS) > 0;

  return hasCuratedSource || hasExplicitGagSignal;
}

/**
 * Brand-fit score for the homepage feed.
 *
 * Engagement and recency are added by the rotation layer. This base score is
 * deliberately about catalog quality and gag-gift relevance, not an assumed
 * commission category. That prevents generic beauty, wellness, and book items
 * from outranking products that actually deliver on the goose.gifts promise.
 */
export function scoreProductForTrending(product: Product): number {
  const text = normalizedCatalogText(product);
  const title = product.title.toLowerCase();
  const qualityScore = Math.max(0, Math.min(1, product.qualityScore || 0));
  const gagMatches = matchingTerms(text, STRONG_GAG_TERMS);
  const genericMatches = matchingTerms(title, GENERIC_GIFT_TERMS);

  let score = qualityScore * 50;
  score += Math.min(gagMatches * 8, 32);
  score += product.sourceQuery?.trim() ? 12 : 0;
  score += product.price > 0 && product.price <= 75 ? 3 : 0;
  score += product.rating && product.rating >= 4.3 ? 3 : 0;
  score += product.reviewCount && product.reviewCount >= 100 ? 2 : 0;

  if (genericMatches > 0 && gagMatches === 0) {
    score -= Math.min(genericMatches * 18, 36);
  }

  return Math.max(0, Math.round(score));
}
