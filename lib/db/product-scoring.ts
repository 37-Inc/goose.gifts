import type { Product } from '@/lib/types';

export const STRONG_GAG_TERMS = [
  'funny', 'gag', 'prank', 'weird', 'novelty', 'ridiculous', 'sarcastic',
  'silly', 'hilarious', 'joke', 'absurd', 'inappropriate', 'fart', 'poop',
  'whoopee', 'bullshit', 'penis', 'testicle',
  'middle finger', 'dad joke', 'white elephant', 'screaming goat',
];

// Some of the best catalog products are visually strange without using Amazon's
// usual "funny gift" SEO language. These are deliberately concrete product
// details, not generated catalog copy or discovery-query terms.
export const DISTINCTIVE_ODDITY_TERMS = [
  'angry mama', 'animal butt', 'bacon candle', 'beer bong', 'cat butt',
  'cereal killer', 'crab', 'duck decanter', 'emotional support',
  'fake poop', 'fart machine', 'loch ness', 'nessie', 'pizza boss',
  'rubber chicken', 'screaming chicken', 'squirrel hot tub', 'sword shaped',
  'wacky waving', 'yodeling',
];

// Safe coarse filter for database candidate selection. The application-level
// eligibility check remains authoritative, but every eligible homepage item
// must contain at least one of these merchant-title terms. Applying this
// predicate in Postgres avoids transferring the entire catalog on cache fills.
export const HOMEPAGE_BRAND_FIT_TERMS = [
  ...STRONG_GAG_TERMS,
  ...DISTINCTIVE_ODDITY_TERMS,
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

// Words that describe merchandising, audience, or a minor listing variant do
// not distinguish one product family from another. Keeping them out of the
// fingerprint collapses separately listed colors/sizes without conflating the
// actual objects (for example, a crab spoon rest and a crab pencil holder).
const FAMILY_NOISE_TERMS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or',
  'the', 'to', 'with', 'your',
  'adult', 'adults', 'boy', 'boys', 'christmas', 'coworker', 'coworkers',
  'dad', 'dads', 'friend', 'friends', 'girl', 'girls', 'gift', 'gifts', 'her',
  'him', 'holiday', 'kid', 'kids', 'men', 'mom', 'moms', 'present', 'stocking',
  'stuffer', 'stuffers', 'teen', 'teens', 'women',
  'best', 'cool', 'crazy', 'cute', 'fun', 'funny', 'gag', 'great', 'hilarious',
  'joke', 'novelty', 'perfect', 'prank', 'ridiculous', 'silly', 'unique',
  'black', 'blue', 'brown', 'gold', 'gray', 'green', 'grey', 'orange', 'pink',
  'purple', 'red', 'silver', 'white', 'yellow', 'small', 'medium', 'large',
  'xl', 'xxl', 'pack', 'piece', 'set',
]);

const FAMILY_TOKEN_ALIASES: Record<string, string> = {
  bellies: 'belly',
  chickens: 'chicken',
  fannies: 'fanny',
  hats: 'hat',
  legs: 'leg',
  keychains: 'keychain',
  mugs: 'mug',
  packs: 'pack',
  pouches: 'pouch',
  toys: 'toy',
};

const PRODUCT_ARCHETYPE_RULES: Array<{ key: string; matches: (title: string) => boolean }> = [
  {
    key: 'belly-fanny-pack',
    matches: (title) => /\b(?:belly|dad body)\b/.test(title) && /\b(?:fanny|waist) pack\b/.test(title),
  },
  {
    key: 'middle-finger-keychain',
    matches: (title) => /\bmiddle finger\b/.test(title) && /\bkey ?chain\b/.test(title),
  },
  {
    key: 'prank-pill-box',
    matches: (title) => /\b(?:prank|joke) pill box\b/.test(title),
  },
  {
    key: 'bodily-survival-kit',
    matches: (title) => /\b(?:shart|fart|poop|potty|underwear)\b/.test(title)
      && /\b(?:survival|emergency)\b/.test(title)
      && /\b(?:kit|pack|set)\b/.test(title),
  },
  {
    key: 'goat-desk-noise-toy',
    matches: (title) => /\bgoat\b/.test(title)
      && /\b(?:desk|scream|squeak|sound|button|toy)\b/.test(title),
  },
  {
    key: 'prank-o-gift-box',
    matches: (title) => /\bprank o\b/.test(title) && /\b(?:prank|gag|gift) box\b/.test(title),
  },
];

function normalizeForMatching(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function familyTokens(title: string): string[] {
  return [...new Set(title
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:inch(?:es)?|in|cm|mm|oz|ounce|lb|pound)s?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token))
    .map((token) => FAMILY_TOKEN_ALIASES[token] || token)
    .filter((token) => !FAMILY_NOISE_TERMS.has(token)))]
    .sort();
}

/** Stable, order-independent identity for exact title variants. */
export function productFamilyFingerprint(title: string): string {
  return familyTokens(title).join('|');
}

/** Known marketplace variant families whose titles can otherwise look unrelated. */
export function productArchetypeKey(title: string): string | undefined {
  const normalizedTitle = normalizeForMatching(title);
  return PRODUCT_ARCHETYPE_RULES.find((rule) => rule.matches(normalizedTitle))?.key;
}

interface TitleMatchProfile {
  archetype?: string;
  fingerprint: string;
  normalizedTitle: string;
  tokens: string[];
  tokenSet: Set<string>;
}

function titleMatchProfile(title: string): TitleMatchProfile {
  const tokens = familyTokens(title);
  return {
    archetype: productArchetypeKey(title),
    fingerprint: tokens.join('|'),
    normalizedTitle: normalizeForMatching(title),
    tokens,
    tokenSet: new Set(tokens),
  };
}

function areNearDuplicateProfiles(
  first: TitleMatchProfile,
  second: TitleMatchProfile
): boolean {
  if (first.archetype && first.archetype === second.archetype) return true;
  if (first.tokens.length === 0 || second.tokens.length === 0) return false;
  if (first.normalizedTitle === second.normalizedTitle) return true;
  if (first.tokens.length >= 2 && first.fingerprint === second.fingerprint) return true;

  const intersection = first.tokens.filter((token) => second.tokenSet.has(token)).length;
  if (intersection < 3) return false;

  const containment = intersection / Math.min(first.tokens.length, second.tokens.length);
  const union = new Set([...first.tokens, ...second.tokens]).size;
  const jaccard = intersection / union;

  return containment >= 0.8 || jaccard >= 0.67;
}

/**
 * Conservative product-family comparison. Containment catches SEO suffixes,
 * while the Jaccard threshold catches small wording changes. Requiring at
 * least three shared concrete tokens avoids grouping unrelated generic mugs,
 * hats, or keychains.
 */
export function areNearDuplicateTitles(firstTitle: string, secondTitle: string): boolean {
  return areNearDuplicateProfiles(
    titleMatchProfile(firstTitle),
    titleMatchProfile(secondTitle)
  );
}

/** Preserve ranking while retaining only one representative of each family. */
export function suppressNearDuplicateProducts<T extends Pick<Product, 'title'>>(
  rankedProducts: T[],
  limit: number = rankedProducts.length
): T[] {
  const selected: T[] = [];
  const selectedProfiles: TitleMatchProfile[] = [];
  const archetypes = new Set<string>();
  const fingerprints = new Set<string>();
  const normalizedTitles = new Set<string>();
  const tokenIndex = new Map<string, number[]>();

  for (const candidate of rankedProducts) {
    const profile = titleMatchProfile(candidate.title);
    if (
      (profile.archetype && archetypes.has(profile.archetype))
      || normalizedTitles.has(profile.normalizedTitle)
      || (profile.tokens.length >= 2 && fingerprints.has(profile.fingerprint))
    ) {
      continue;
    }

    // Only selected products sharing at least three concrete title tokens can
    // pass the conservative containment/Jaccard rule. The inverted index avoids
    // comparing every candidate with every previously selected product.
    const sharedTokenCounts = new Map<number, number>();
    for (const token of profile.tokens) {
      for (const selectedIndex of tokenIndex.get(token) || []) {
        sharedTokenCounts.set(selectedIndex, (sharedTokenCounts.get(selectedIndex) || 0) + 1);
      }
    }

    const isNearDuplicate = [...sharedTokenCounts].some(([selectedIndex, sharedCount]) => (
      sharedCount >= 3
      && areNearDuplicateProfiles(selectedProfiles[selectedIndex], profile)
    ));
    if (isNearDuplicate) continue;

    const selectedIndex = selected.length;
    selected.push(candidate);
    selectedProfiles.push(profile);
    if (profile.archetype) archetypes.add(profile.archetype);
    if (profile.tokens.length >= 2) fingerprints.add(profile.fingerprint);
    normalizedTitles.add(profile.normalizedTitle);
    for (const token of profile.tokens) {
      const indices = tokenIndex.get(token) || [];
      indices.push(selectedIndex);
      tokenIndex.set(token, indices);
    }
    if (selected.length >= limit) break;
  }

  return selected;
}

function matchingTerms(text: string, terms: string[]): number {
  const normalizedText = normalizeForMatching(text);

  return terms.filter((term) => normalizedText.includes(normalizeForMatching(term))).length;
}

function hasExcludedHomepageFormat(title: string): boolean {
  const hasException = matchingTerms(title, HOMEPAGE_FORMAT_EXCEPTIONS) > 0;
  return !hasException && matchingTerms(title, HOMEPAGE_FORMAT_EXCLUSIONS) > 0;
}

function hasExpiredYearInTitle(title: string): boolean {
  const currentYear = new Date().getUTCFullYear();
  const years = title.match(/\b20\d{2}\b/g) || [];
  return years.some((year) => Number(year) < currentYear);
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

  if (hasExpiredYearInTitle(product.title)) {
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
