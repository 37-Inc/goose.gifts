/**
 * Clean and normalize image URLs from Amazon and other sources
 */

/**
 * Strip Amazon's image transformation parameters from the URL
 *
 * Amazon appends transformation params like:
 * _BO30,255,255,255_UF900,850_SR1910,1000,0,C_QL100_.jpg
 *
 * These params make the URLs invalid. We need to strip them to get the base image.
 *
 * Example:
 * Input:  https://m.media-amazon.com/images/I/81YkbDHQoPL.jpg_BO30,255,255,255_UF900,850_SR1910,1000,0,C_QL100_.jpg
 * Output: https://m.media-amazon.com/images/I/81YkbDHQoPL.jpg
 */
export function cleanAmazonImageUrl(url: string): string {
  if (!url) return url;

  try {
    // Remove Amazon's transformation suffixes
    // Pattern: _(BO|UF|SR|UX|UL|US|SL|AC|QL|CR|SX|SY)[0-9,_]+\.jpg
    const cleaned = url.replace(/\.(jpg|jpeg|png)_[A-Z]+[0-9,_]+\.(jpg|jpeg|png)$/i, '.$1');

    // If URL still seems malformed, try to extract the base image ID
    if (cleaned.includes('.jpg_') || cleaned.includes('.png_')) {
      // Extract just the image ID and rebuild a simple URL
      const match = url.match(/\/images\/I\/([^._]+)\./);
      if (match) {
        const imageId = match[1];
        const domain = new URL(url).hostname;
        const ext = url.match(/\.(jpg|jpeg|png)/i)?.[1] || 'jpg';
        return `https://${domain}/images/I/${imageId}.${ext}`;
      }
    }

    return cleaned;
  } catch (error) {
    console.error('Error cleaning Amazon image URL:', error);
    return url;
  }
}

/**
 * Clean image URL from any source
 */
export function cleanImageUrl(url: string, source: 'amazon' | 'etsy' | string): string {
  if (!url) return url;

  if (source === 'amazon') {
    return cleanAmazonImageUrl(url);
  }

  // Etsy and other sources - no cleaning needed for now
  return url;
}
