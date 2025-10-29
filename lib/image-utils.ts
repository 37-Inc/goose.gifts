/**
 * Clean and normalize image URLs from Amazon and other sources
 */

/**
 * Strip Amazon's image transformation parameters from the URL
 *
 * Amazon appends transformation params in several formats:
 * Pattern 1: .jpg_BO30,255,255,255_UF900,850_SR1910,1000,0,C_QL100_.jpg
 * Pattern 2: ._TSa|size:1910,1000|format:(A,f,b,d,pi,pl,o)|...json
 *
 * These params make the URLs invalid. We need to strip them to get the base image.
 *
 * Examples:
 * Input:  https://m.media-amazon.com/images/I/61phUFMrvSL.jpg_BO30,255,255,255_UF900,850_SR1910,1000,0,C_QL100_.jpg
 * Output: https://m.media-amazon.com/images/I/61phUFMrvSL.jpg
 *
 * Input:  https://m.media-amazon.com/images/I/01UwfHrld+L._TSa|size:1910,1000|format:(A,f,b,d,pi,pl,o)|...json
 * Output: https://m.media-amazon.com/images/I/01UwfHrld+L.jpg
 */
export function cleanAmazonImageUrl(url: string): string {
  if (!url) return url;

  try {
    // Check if URL has transformation suffixes
    // Pattern 1: .extension_LETTERS... (e.g., .jpg_BO30...)
    // Pattern 2: ._TSa|... or ending with .json
    const hasTransformations = /\.(jpg|jpeg|png)_[A-Z]/i.test(url) ||
                              /\._TSa/i.test(url) ||
                              url.endsWith('.json');

    if (hasTransformations) {
      // Extract the image ID - can contain letters, numbers, +, -, and _
      // Look for /images/I/{IMAGE_ID} followed by . or _
      const match = url.match(/\/images\/I\/([A-Za-z0-9+\-_%]+)[._]/);
      if (match) {
        const imageId = match[1];
        const domain = new URL(url).hostname;

        // Determine the extension - look for first occurrence after image ID
        let ext = 'jpg'; // default
        const extMatch = url.match(new RegExp(`/images/I/[^.]+\\.(jpg|jpeg|png)`, 'i'));
        if (extMatch) {
          ext = extMatch[1].toLowerCase();
        }

        const cleanUrl = `https://${domain}/images/I/${imageId}.${ext}`;

        // Log if we actually cleaned something
        if (cleanUrl !== url) {
          console.log(`🧹 Cleaned Amazon image URL for ${imageId}`);
          console.log(`   From: ${url.substring(0, 100)}...`);
          console.log(`   To: ${cleanUrl}`);
        }

        return cleanUrl;
      }
    }

    // No transformations detected, return as-is
    return url;
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
