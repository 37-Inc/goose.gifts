import { db } from './index';
import {
  giftBundles,
  products,
  giftIdeas,
  giftIdeaProducts,
  type GiftBundle,
  type NewGiftBundle,
  type NewProduct,
  type NewGiftIdea,
  type NewGiftIdeaProduct,
} from './schema';
import { eq, sql } from 'drizzle-orm';
import { generateSlug, calculatePriceRange, extractKeywords } from './helpers';
import type { GiftIdea, GiftRequest, Product } from '../types';
import type { SEOContent } from '../seo';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate embedding for a bundle using OpenAI's text-embedding-3-small model
 */
async function generateBundleEmbedding(
  recipientDescription: string,
  occasion: string | null,
  giftIdeas: GiftIdea[]
): Promise<number[]> {
  // Create a rich text representation of the bundle for embedding
  const giftTitles = giftIdeas.map(idea => idea.title).join(', ');
  const embeddingText = `${recipientDescription}. ${occasion || ''}. Gift ideas: ${giftTitles}`;

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    // Return null instead of throwing - embedding is optional
    return [];
  }
}

/**
 * Save gift ideas to database with pre-generated SEO content
 * Returns the slug for the permalink
 *
 * This function handles the migration from JSONB to relational tables.
 * It creates records in gift_bundles, products, gift_ideas, and gift_idea_products tables.
 */
export async function saveGiftIdeas(
  request: GiftRequest,
  giftIdeasData: GiftIdea[],
  seoContent: SEOContent
): Promise<string> {
  const priceRange = calculatePriceRange(request.minPrice, request.maxPrice);
  const recipientKeywords = extractKeywords(request.recipientDescription);

  try {
    // Generate human-readable slug from SEO title
    const slug = generateSlug(seoContent.title);

    // Generate embedding for semantic search
    const embedding = await generateBundleEmbedding(
      request.recipientDescription,
      request.occasion || null,
      giftIdeasData
    );

    // Use a transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Step 1: Create the bundle (without giftIdeas JSONB)
      const newBundle: NewGiftBundle = {
        slug,
        recipientDescription: request.recipientDescription,
        occasion: request.occasion || null,
        humorStyle: request.humorStyle,
        minPrice: request.minPrice,
        maxPrice: request.maxPrice,
        priceRange,
        seoTitle: seoContent.title,
        seoDescription: seoContent.description,
        seoKeywords: seoContent.keywords,
        seoContent: seoContent.content,
        seoFaqJson: seoContent.faq,
        recipientKeywords,
        embedding: embedding.length > 0 ? embedding : null,
        viewCount: 0,
        shareCount: 0,
        clickCount: 0,
      };

      const [bundle] = await tx.insert(giftBundles).values(newBundle).returning();

      // Step 2: Process each gift idea
      for (let ideaPosition = 0; ideaPosition < giftIdeasData.length; ideaPosition++) {
        const ideaData = giftIdeasData[ideaPosition];

        // Create gift idea record
        const newGiftIdea: NewGiftIdea = {
          bundleId: bundle.id,
          title: ideaData.title,
          tagline: ideaData.tagline || null,
          description: ideaData.description || null,
          position: ideaPosition,
        };

        const [giftIdea] = await tx.insert(giftIdeas).values(newGiftIdea).returning();

        // Step 3: Process products for this gift idea
        for (let productPosition = 0; productPosition < ideaData.products.length; productPosition++) {
          const productData = ideaData.products[productPosition];

          // Insert or update product (deduplicate by ID)
          const newProduct: NewProduct = {
            id: productData.id,
            title: productData.title,
            price: productData.price.toString(),
            currency: productData.currency || 'USD',
            imageUrl: productData.imageUrl || null,
            affiliateUrl: productData.affiliateUrl,
            source: productData.source,
            rating: productData.rating ? productData.rating.toString() : null,
            reviewCount: productData.reviewCount || null,
            category: null,
          };

          // Use ON CONFLICT to handle duplicates
          await tx
            .insert(products)
            .values(newProduct)
            .onConflictDoUpdate({
              target: products.id,
              set: {
                title: newProduct.title,
                price: newProduct.price,
                currency: newProduct.currency,
                imageUrl: newProduct.imageUrl,
                affiliateUrl: newProduct.affiliateUrl,
                rating: newProduct.rating,
                reviewCount: newProduct.reviewCount,
                updatedAt: new Date(),
              },
            });

          // Create junction table entry
          const newJunction: NewGiftIdeaProduct = {
            giftIdeaId: giftIdea.id,
            productId: productData.id,
            position: productPosition,
          };

          await tx.insert(giftIdeaProducts).values(newJunction);
        }
      }
    });

    console.log(`✅ Saved gift bundle with slug: ${slug}`);
    return slug;
  } catch (error) {
    console.error('Database save error:', error);
    throw new Error('Failed to save gift ideas');
  }
}

/**
 * Get gift bundle by slug with all nested data
 * Increments view count
 *
 * This function performs JOINs to reconstruct the nested structure
 * that was previously stored in JSONB.
 */
export async function getGiftBundleBySlug(slug: string): Promise<(GiftBundle & { giftIdeas: GiftIdea[] }) | null> {
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

    // Get all gift ideas for this bundle with their products
    const giftIdeasWithProducts = await db
      .select({
        // Gift idea fields
        id: giftIdeas.id,
        title: giftIdeas.title,
        tagline: giftIdeas.tagline,
        description: giftIdeas.description,
        position: giftIdeas.position,
        // Product fields
        productId: products.id,
        productTitle: products.title,
        productPrice: products.price,
        productCurrency: products.currency,
        productImageUrl: products.imageUrl,
        productAffiliateUrl: products.affiliateUrl,
        productSource: products.source,
        productRating: products.rating,
        productReviewCount: products.reviewCount,
        productPosition: giftIdeaProducts.position,
      })
      .from(giftIdeas)
      .innerJoin(giftIdeaProducts, eq(giftIdeas.id, giftIdeaProducts.giftIdeaId))
      .innerJoin(products, eq(giftIdeaProducts.productId, products.id))
      .where(eq(giftIdeas.bundleId, bundle.id))
      .orderBy(giftIdeas.position, giftIdeaProducts.position);

    // Transform flat JOIN results into nested structure
    const giftIdeasMap = new Map<string, GiftIdea>();

    for (const row of giftIdeasWithProducts) {
      const ideaId = row.id;

      // Get or create gift idea
      if (!giftIdeasMap.has(ideaId)) {
        giftIdeasMap.set(ideaId, {
          id: ideaId,
          title: row.title,
          tagline: row.tagline || '',
          description: row.description || '',
          products: [],
          humorStyle: bundle.humorStyle as any,
        });
      }

      const idea = giftIdeasMap.get(ideaId)!;

      // Add product to gift idea
      const product: Product = {
        id: row.productId,
        title: row.productTitle,
        price: parseFloat(row.productPrice),
        currency: row.productCurrency,
        imageUrl: row.productImageUrl || '',
        affiliateUrl: row.productAffiliateUrl,
        source: row.productSource as 'amazon' | 'etsy',
        rating: row.productRating ? parseFloat(row.productRating) : undefined,
        reviewCount: row.productReviewCount || undefined,
      };

      idea.products.push(product);
    }

    // Convert map to array, maintaining order
    const giftIdeasArray = Array.from(giftIdeasMap.values()).sort((a, b) => {
      const aPos = giftIdeasWithProducts.find(r => r.id === a.id)?.position || 0;
      const bPos = giftIdeasWithProducts.find(r => r.id === b.id)?.position || 0;
      return aPos - bPos;
    });

    // Increment view count (fire and forget - don't await)
    db.update(giftBundles)
      .set({ viewCount: sql`${giftBundles.viewCount} + 1` })
      .where(eq(giftBundles.slug, slug))
      .then(() => console.log(`View count incremented for ${slug}`))
      .catch((err) => console.error('Error incrementing view count:', err));

    return {
      ...bundle,
      giftIdeas: giftIdeasArray,
    };
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
 * Increment click count for a bundle (when user clicks affiliate link)
 */
export async function incrementClickCount(slug: string): Promise<void> {
  try {
    await db
      .update(giftBundles)
      .set({ clickCount: sql`${giftBundles.clickCount} + 1` })
      .where(eq(giftBundles.slug, slug));
  } catch (error) {
    console.error('Error incrementing click count:', error);
  }
}

/**
 * Get all bundle slugs for sitemap generation
 */
export async function getAllBundleSlugs(): Promise<string[]> {
  try {
    const bundles = await db
      .select({ slug: giftBundles.slug })
      .from(giftBundles)
      .where(sql`${giftBundles.deletedAt} IS NULL`);

    return bundles.map(b => b.slug);
  } catch (error) {
    console.error('Error fetching bundle slugs:', error);
    return [];
  }
}

/**
 * Get all bundles with nested gift ideas (for admin panel)
 */
export async function getAllBundles(): Promise<Array<GiftBundle & { giftIdeas: GiftIdea[] }>> {
  try {
    const allBundles = await db
      .select()
      .from(giftBundles)
      .where(sql`${giftBundles.deletedAt} IS NULL`)
      .orderBy(sql`${giftBundles.createdAt} DESC`);

    // For each bundle, fetch its gift ideas and products
    const bundlesWithIdeas = await Promise.all(
      allBundles.map(async (bundle) => {
        const giftIdeasWithProducts = await db
          .select({
            id: giftIdeas.id,
            title: giftIdeas.title,
            tagline: giftIdeas.tagline,
            description: giftIdeas.description,
            position: giftIdeas.position,
            productId: products.id,
            productTitle: products.title,
            productPrice: products.price,
            productCurrency: products.currency,
            productImageUrl: products.imageUrl,
            productAffiliateUrl: products.affiliateUrl,
            productSource: products.source,
            productRating: products.rating,
            productReviewCount: products.reviewCount,
            productPosition: giftIdeaProducts.position,
          })
          .from(giftIdeas)
          .innerJoin(giftIdeaProducts, eq(giftIdeas.id, giftIdeaProducts.giftIdeaId))
          .innerJoin(products, eq(giftIdeaProducts.productId, products.id))
          .where(eq(giftIdeas.bundleId, bundle.id))
          .orderBy(giftIdeas.position, giftIdeaProducts.position);

        // Transform to nested structure
        const giftIdeasMap = new Map<string, GiftIdea>();

        for (const row of giftIdeasWithProducts) {
          const ideaId = row.id;

          if (!giftIdeasMap.has(ideaId)) {
            giftIdeasMap.set(ideaId, {
              id: ideaId,
              title: row.title,
              tagline: row.tagline || '',
              description: row.description || '',
              products: [],
              humorStyle: bundle.humorStyle as any,
            });
          }

          const idea = giftIdeasMap.get(ideaId)!;

          const product: Product = {
            id: row.productId,
            title: row.productTitle,
            price: parseFloat(row.productPrice),
            currency: row.productCurrency,
            imageUrl: row.productImageUrl || '',
            affiliateUrl: row.productAffiliateUrl,
            source: row.productSource as 'amazon' | 'etsy',
            rating: row.productRating ? parseFloat(row.productRating) : undefined,
            reviewCount: row.productReviewCount || undefined,
          };

          idea.products.push(product);
        }

        const giftIdeasArray = Array.from(giftIdeasMap.values()).sort((a, b) => {
          const aPos = giftIdeasWithProducts.find(r => r.id === a.id)?.position || 0;
          const bPos = giftIdeasWithProducts.find(r => r.id === b.id)?.position || 0;
          return aPos - bPos;
        });

        return {
          ...bundle,
          giftIdeas: giftIdeasArray,
        };
      })
    );

    return bundlesWithIdeas;
  } catch (error) {
    console.error('Error fetching all bundles:', error);
    return [];
  }
}

/**
 * Update gift ideas for a bundle (for admin panel)
 * This handles reordering and deletion of products
 */
export async function updateBundleGiftIdeas(
  bundleId: string,
  giftIdeasData: GiftIdea[]
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Get existing gift ideas for this bundle
      const existingIdeas = await tx
        .select()
        .from(giftIdeas)
        .where(eq(giftIdeas.bundleId, bundleId));

      const existingIdeaIds = new Set(existingIdeas.map(i => i.id));
      const updatedIdeaIds = new Set(giftIdeasData.map(i => i.id));

      // Delete gift ideas that are no longer present
      for (const existingIdea of existingIdeas) {
        if (!updatedIdeaIds.has(existingIdea.id)) {
          await tx.delete(giftIdeas).where(eq(giftIdeas.id, existingIdea.id));
        }
      }

      // Update or insert gift ideas
      for (let ideaPosition = 0; ideaPosition < giftIdeasData.length; ideaPosition++) {
        const ideaData = giftIdeasData[ideaPosition];

        if (existingIdeaIds.has(ideaData.id)) {
          // Update existing gift idea
          await tx
            .update(giftIdeas)
            .set({
              title: ideaData.title,
              tagline: ideaData.tagline || null,
              description: ideaData.description || null,
              position: ideaPosition,
            })
            .where(eq(giftIdeas.id, ideaData.id));

          // Delete existing product associations
          await tx.delete(giftIdeaProducts).where(eq(giftIdeaProducts.giftIdeaId, ideaData.id));
        } else {
          // Insert new gift idea
          const [newIdea] = await tx
            .insert(giftIdeas)
            .values({
              id: ideaData.id,
              bundleId,
              title: ideaData.title,
              tagline: ideaData.tagline || null,
              description: ideaData.description || null,
              position: ideaPosition,
            })
            .returning();

          ideaData.id = newIdea.id;
        }

        // Insert products for this gift idea
        for (let productPosition = 0; productPosition < ideaData.products.length; productPosition++) {
          const productData = ideaData.products[productPosition];

          // Ensure product exists
          await tx
            .insert(products)
            .values({
              id: productData.id,
              title: productData.title,
              price: productData.price.toString(),
              currency: productData.currency || 'USD',
              imageUrl: productData.imageUrl || null,
              affiliateUrl: productData.affiliateUrl,
              source: productData.source,
              rating: productData.rating ? productData.rating.toString() : null,
              reviewCount: productData.reviewCount || null,
              category: null,
            })
            .onConflictDoUpdate({
              target: products.id,
              set: {
                title: productData.title,
                price: productData.price.toString(),
                currency: productData.currency || 'USD',
                imageUrl: productData.imageUrl || null,
                affiliateUrl: productData.affiliateUrl,
                rating: productData.rating ? productData.rating.toString() : null,
                reviewCount: productData.reviewCount || null,
                updatedAt: new Date(),
              },
            });

          // Insert junction table entry
          await tx.insert(giftIdeaProducts).values({
            giftIdeaId: ideaData.id,
            productId: productData.id,
            position: productPosition,
          });
        }
      }
    });

    console.log(`✅ Updated gift ideas for bundle ${bundleId}`);
  } catch (error) {
    console.error('Error updating bundle gift ideas:', error);
    throw new Error('Failed to update bundle gift ideas');
  }
}
