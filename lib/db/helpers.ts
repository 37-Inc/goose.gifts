/**
 * Helper functions for database operations
 */

/**
 * Generate a random 8-character alphanumeric slug
 * Character set excludes ambiguous characters (0, O, I, l)
 * 2.8 trillion possible combinations
 */
export function generateSlug(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

/**
 * Calculate price range classification
 */
export function calculatePriceRange(minPrice: number, maxPrice: number): string {
  const avgPrice = (minPrice + maxPrice) / 2;

  if (avgPrice < 50) return 'budget';
  if (avgPrice < 150) return 'mid';
  return 'premium';
}

/**
 * Extract keywords from recipient description
 * Simple implementation - extracts meaningful words
 */
export function extractKeywords(text: string): string {
  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'who', 'what', 'when', 'where', 'why', 'how', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your',
  ]);

  // Clean and tokenize
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Remove duplicates and join
  return [...new Set(words)].join(' ');
}

/**
 * Calculate Jaccard similarity between two keyword strings
 * Returns a value between 0 (no overlap) and 1 (identical)
 */
export function jaccardSimilarity(keywords1: string, keywords2: string): number {
  const set1 = new Set(keywords1.split(' '));
  const set2 = new Set(keywords2.split(' '));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}
