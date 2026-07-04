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
    const decoded = decodeURIComponent(url);
    const origin = new URL(url).origin;

    // Some Amazon URLs are generated composite frames, usually with marketing
    // text or badges. The actual product shot is embedded as pi-src.
    const compositeSource = decoded.match(/(?:^|[|])pi-src:([^|]+?\.(?:jpg|jpeg|png|webp))/i)?.[1];
    if (compositeSource) {
      return compositeSource.startsWith('http')
        ? compositeSource
        : `${origin}/images/I/${compositeSource}`;
    }

    // Remove Amazon's transformation suffixes that are appended after a real
    // image extension, such as .jpg_BO..._UF..._QL100_.jpg.
    const transformedImage = decoded.match(
      /^(https?:\/\/[^/]+\/images\/I\/[^?#]+?\.(?:jpg|jpeg|png|webp))(?:[._][^?#]*)?$/i
    );
    if (transformedImage) {
      return transformedImage[1];
    }

    const cleaned = decoded.replace(
      /\.(jpg|jpeg|png|webp)_[^?#]+\.(jpg|jpeg|png|webp)$/i,
      '.$1'
    );

    // If URL still seems malformed, try to extract the base image ID
    if (cleaned.includes('.jpg_') || cleaned.includes('.png_') || cleaned.includes('.webp_')) {
      // Extract just the image ID and rebuild a simple URL
      const match = decoded.match(/\/images\/I\/([^._]+)\./);
      if (match) {
        const imageId = match[1];
        const ext = decoded.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg';
        return `${origin}/images/I/${imageId}.${ext}`;
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
