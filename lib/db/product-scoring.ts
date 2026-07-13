import type { Product } from '@/lib/types';

const STRONG_GAG_TERMS = [
  'funny', 'gag', 'prank', 'weird', 'novelty', 'ridiculous', 'sarcastic',
  'silly', 'hilarious', 'joke', 'absurd', 'inappropriate', 'fart', 'poop',
  'whoopee', 'bullshit', 'penis', 'testicle',
  'middle finger', 'dad joke', 'white elephant', 'screaming goat',
];

// Some of the best catalog products are visually strange without using Amazon's
// usual "funny gift" SEO language. These are deliberately concrete product
// details, not generated catalog copy or discovery-query terms.
const DISTINCTIVE_ODDITY_TERMS = [
  'angry mama', 'animal butt', 'bacon candle', 'beer bong', 'cat butt',
  'cereal killer', 'crab', 'duck decanter', 'emotional support',
  'fake poop', 'fart machine', 'loch ness', 'nessie', 'pizza boss',
  'rubber chicken', 'screaming chicken', 'squirrel hot tub', 'sword shaped',
  'wacky waving', 'yodeling',
];

// These commodity formats repeatedly entered the homepage because the merchant
// stuffed "funny" into the title or enrichment added optimistic tags. They are
// useful on long-tail guides, but are not strong enough to represent the brand
// on the homepage. A book bundled with a physical figure is the one established
// exception in the current catalog.
const HOMEPAGE_FORMAT_EXCLUSIONS = [
  'activity book', 'bath bomb', 'coloring', 'cookbook', 'cosmetic bag',
  'eyeshadow', 'gift basket', 'journal', 'makeup', 'notebook', 'skincare',
  'trivia book',
];

const HOMEPAGE_FORMAT_EXCEPTIONS = [
  'book and figure', 'book with figure',
];

const GENERIC_GIFT_TERMS = [
  'bath bomb', 'skincare', 'makeup bag', 'makeup brush', 'eyeshadow',
  'coloring book', 'gift basket', 'stuffed animal', 'cookbook', 'candle',
  'chocolate gift', 'costume',
];

function normalizeForMatching(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function matchingTerms(text: string, terms: string[]): number {
  const normalizedText = normalizeForMatching(text);

  return terms.filter((term) => normalizedText.includes(normalizeForMatching(term))).length;
}

function hasExcludedHomepageFormat(title: string): boolean {
  const hasException = matchingTerms(title, HOMEPAGE_FORMAT_EXCEPTIONS) > 0;
  return !hasException && matchingTerms(title, HOMEPAGE_FORMAT_EXCLUSIONS) > 0;
}

function titleBrandFitMatches(title: string): number {
  return matchingTerms(title, STRONG_GAG_TERMS)
    + matchingTerms(title, DISTINCTIVE_ODDITY_TERMS);
}

export function isHomepageEligibleProduct(product: Product): boolean {
  if (product.isActive === false || !product.imageUrl || !product.affiliateUrl) {
    return false;
  }

  if ((product.qualityScore || 0) < 0.55) {
    return false;
  }

  // sourceQuery, humorTags, punnyTitle, and wittyDescription are all generated
  // or automated fields. They can help rank an already credible product, but
  // must not manufacture homepage eligibility for a generic merchant listing.
  if (hasExcludedHomepageFormat(product.title)) {
    return false;
  }

  return titleBrandFitMatches(product.title) > 0;
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
  const title = product.title;
  const qualityScore = Math.max(0, Math.min(1, product.qualityScore || 0));
  const gagMatches = titleBrandFitMatches(title);
  const genericMatches = matchingTerms(title, GENERIC_GIFT_TERMS);

  let score = qualityScore * 50;
  score += Math.min(gagMatches * 8, 32);
  score += product.sourceQuery?.trim() ? 4 : 0;
  score += product.price > 0 && product.price <= 75 ? 3 : 0;
  score += product.rating && product.rating >= 4.3 ? 3 : 0;
  score += product.reviewCount && product.reviewCount >= 100 ? 2 : 0;

  if (genericMatches > 0) {
    score -= Math.min(genericMatches * 18, 36);
  }

  return Math.max(0, Math.round(score));
}
