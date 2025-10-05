/**
 * Application configuration constants
 * Can be overridden with environment variables
 */

// Number of gift concepts to generate per search
export const GIFT_CONCEPTS_COUNT = parseInt(
  process.env.NEXT_PUBLIC_GIFT_CONCEPTS_COUNT || '3',
  10
);

// Number of products to show per gift bundle
export const PRODUCTS_PER_BUNDLE = parseInt(
  process.env.NEXT_PUBLIC_PRODUCTS_PER_BUNDLE || '4',
  10
);

// Number of search queries per concept
export const QUERIES_PER_CONCEPT = parseInt(
  process.env.NEXT_PUBLIC_QUERIES_PER_CONCEPT || '4',
  10
);
