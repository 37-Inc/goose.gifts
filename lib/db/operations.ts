import { db } from './index';
import { giftBundles, type GiftBundle, type NewGiftBundle } from './schema';
import { eq, sql } from 'drizzle-orm';
import { generateSlug, calculatePriceRange, extractKeywords } from './helpers';
import { generateSEOContent } from '../seo';
import type { GiftIdea, GiftRequest } from '../types';

/**
 * Save gift ideas to database with SEO content
 * Returns the slug for the permalink
 */
export async function saveGiftIdeas(
  request: GiftRequest,
  giftIdeas: GiftIdea[]
): Promise<string> {
  const slug = generateSlug();
  const priceRange = calculatePriceRange(request.minPrice, request.maxPrice);
  const recipientKeywords = extractKeywords(request.recipientDescription);

  try {
    // Generate SEO content
    console.log('Generating SEO content...');
    const seoContent = await generateSEOContent(
      request.recipientDescription,
      request.occasion,
      giftIdeas
    );

    // Prepare bundle data
    const newBundle: NewGiftBundle = {
      slug,
      recipientDescription: request.recipientDescription,
      occasion: request.occasion || null,
      humorStyle: request.humorStyle,
      minPrice: request.minPrice,
      maxPrice: request.maxPrice,
      priceRange,
      giftIdeas,
      seoTitle: seoContent.title,
      seoDescription: seoContent.description,
      seoKeywords: seoContent.keywords,
      seoContent: seoContent.content,
      seoFaqJson: seoContent.faq,
      recipientKeywords,
      viewCount: 0,
      shareCount: 0,
    };

    // Insert into database
    await db.insert(giftBundles).values(newBundle);

    console.log(`✅ Saved gift bundle with slug: ${slug}`);
    return slug;
  } catch (error) {
    console.error('Database save error:', error);
    throw new Error('Failed to save gift ideas');
  }
}

/**
 * Get gift bundle by slug
 * Increments view count
 */
export async function getGiftBundleBySlug(slug: string): Promise<GiftBundle | null> {
  try {
    // Get the bundle
    const [bundle] = await db
      .select()
      .from(giftBundles)
      .where(eq(giftBundles.slug, slug))
      .limit(1);

    if (!bundle) {
      return null;
    }

    // Increment view count (fire and forget - don't await)
    db.update(giftBundles)
      .set({ viewCount: sql`${giftBundles.viewCount} + 1` })
      .where(eq(giftBundles.slug, slug))
      .then(() => console.log(`View count incremented for ${slug}`))
      .catch((err) => console.error('Error incrementing view count:', err));

    return bundle;
  } catch (error) {
    console.error('Database fetch error:', error);
    return null;
  }
}

/**
 * Increment share count for a bundle
 */
export async function incrementShareCount(slug: string): Promise<void> {
  try {
    await db
      .update(giftBundles)
      .set({ shareCount: sql`${giftBundles.shareCount} + 1` })
      .where(eq(giftBundles.slug, slug));
  } catch (error) {
    console.error('Error incrementing share count:', error);
  }
}

/**
 * Get all bundle slugs for sitemap generation
 */
export async function getAllBundleSlugs(): Promise<string[]> {
  try {
    const bundles = await db
      .select({ slug: giftBundles.slug })
      .from(giftBundles);

    return bundles.map(b => b.slug);
  } catch (error) {
    console.error('Error fetching bundle slugs:', error);
    return [];
  }
}
