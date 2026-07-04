const exactLegacyTargets: Record<string, string> = {
  'purrfect-gifts-for-cat-loving-bookworms-n6y7': '/gift-guides/cat-lover-gag-gifts',
  'hilarious-gift-bundles-for-a-new-bathroom-remodel-522n': '/gift-guides/weird-bathroom-gifts',
  'hilarious-gift-bundles-for-property-managers-fy9y': '/gift-guides/funny-gifts-for-coworkers',
  'quirky-optical-illusion-statues-for-unique-decor-lovers-ey78': '/?q=optical%20illusion%20decor',
  'hilarious-dirty-santa-gift-bundles-for-holiday-fun-kwsf': '/gift-guides/dirty-santa-gifts',
};

const guideTargets = [
  { terms: ['dirty-santa'], target: '/gift-guides/dirty-santa-gifts' },
  { terms: ['secret-santa'], target: '/gift-guides/secret-santa-gag-gifts' },
  { terms: ['white-elephant'], target: '/gift-guides/white-elephant-gifts' },
  { terms: ['coworker'], target: '/gift-guides/funny-gifts-for-coworkers' },
  { terms: ['property-manager'], target: '/gift-guides/funny-gifts-for-coworkers' },
  { terms: ['office'], target: '/gift-guides/office-prank-gifts' },
  { terms: ['dad'], target: '/gift-guides/funny-gifts-for-dads' },
  { terms: ['father'], target: '/gift-guides/funny-gifts-for-dads' },
  { terms: ['cat'], target: '/gift-guides/cat-lover-gag-gifts' },
  { terms: ['dog'], target: '/gift-guides/dog-lover-gag-gifts' },
  { terms: ['bathroom'], target: '/gift-guides/weird-bathroom-gifts' },
  { terms: ['kitchen'], target: '/gift-guides/weird-kitchen-gadgets' },
  { terms: ['coffee'], target: '/gift-guides/funny-coffee-mugs' },
  { terms: ['bookworm'], target: '/gift-guides/funny-book-lover-gifts' },
  { terms: ['birthday'], target: '/gift-guides/funny-birthday-gag-gifts' },
  { terms: ['retirement'], target: '/gift-guides/funny-retirement-gifts' },
  { terms: ['holiday'], target: '/gift-guides/funny-christmas-gifts' },
  { terms: ['christmas'], target: '/gift-guides/funny-christmas-gifts' },
  { terms: ['halloween'], target: '/gift-guides/funny-halloween-gifts' },
  { terms: ['wine'], target: '/gift-guides/funny-wine-gifts' },
  { terms: ['bath'], target: '/gift-guides/funny-bath-gifts' },
  { terms: ['desk'], target: '/gift-guides/novelty-desk-toys' },
  { terms: ['prank'], target: '/gift-guides/prank-gifts-for-friends' },
];

function isLikelyLegacyBundleSlug(slug: string): boolean {
  return slug.includes('gift-bundles')
    || slug.includes('gift-bundle')
    || slug.includes('gifts-for')
    || slug.includes('gift-for')
    || slug.includes('gag-gifts')
    || slug.includes('gift-ideas');
}

function slugToSearchQuery(slug: string): string {
  return slug
    .replace(/-[a-z0-9]{4}$/, '')
    .replace(/\b(gift|gifts|bundle|bundles)\b/g, '')
    .replace(/\b(hilarious|unique|delightful|quirky|purrfect|trendy|perfect|discover|shop)\b/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLegacyRedirectTarget(slug: string): string | null {
  const normalizedSlug = slug.toLowerCase();
  const exactTarget = exactLegacyTargets[normalizedSlug];

  if (exactTarget) {
    return exactTarget;
  }

  if (!isLikelyLegacyBundleSlug(normalizedSlug)) {
    return null;
  }

  const guideTarget = guideTargets.find(({ terms }) => (
    terms.some((term) => normalizedSlug.includes(term))
  ));

  if (guideTarget) {
    return guideTarget.target;
  }

  const query = slugToSearchQuery(normalizedSlug);

  return query ? `/?q=${encodeURIComponent(query)}` : '/';
}
