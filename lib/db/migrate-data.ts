/**
 * Data migration script: JSONB to Relational Tables + Embeddings
 *
 * This script migrates existing gift_bundles data from JSONB format to relational tables
 * and generates vector embeddings for semantic search.
 * It preserves all existing data and maintains referential integrity.
 *
 * Usage: npx tsx lib/db/migrate-data.ts
 */

import { db } from './index';
import { sql } from 'drizzle-orm';
import OpenAI from 'openai';
import type { GiftIdea as LegacyGiftIdea, Product as LegacyProduct } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface LegacyBundle {
  id: string;
  recipient_description: string;
  occasion: string | null;
  humor_style: string;
  gift_ideas: LegacyGiftIdea[];
  [key: string]: unknown;
}

/**
 * Generate embedding for a bundle using OpenAI's text-embedding-3-small model
 */
async function generateBundleEmbedding(bundle: LegacyBundle): Promise<number[]> {
  // Create a rich text representation of the bundle for embedding
  const giftTitles = bundle.gift_ideas.map(idea => idea.title).join(', ');
  const embeddingText = `${bundle.recipient_description}. ${bundle.occasion || ''}. Gift ideas: ${giftTitles}`;

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error(`  ⚠️  Failed to generate embedding for bundle ${bundle.id}:`, error);
    throw error;
  }
}

async function migrateData() {
  console.log('🚀 Starting data migration from JSONB to relational tables + embeddings...\n');

  try {
    // Step 1: Fetch all bundles with JSONB gift_ideas
    console.log('📦 Fetching all bundles...');
    const bundles = await db.execute<LegacyBundle>(
      sql`SELECT id, recipient_description, occasion, humor_style, gift_ideas FROM gift_bundles WHERE deleted_at IS NULL ORDER BY created_at ASC`
    );

    const bundleRows = Array.from(bundles);
    console.log(`Found ${bundleRows.length} bundles to migrate\n`);

    if (bundleRows.length === 0) {
      console.log('✅ No bundles to migrate');
      return;
    }

    let totalGiftIdeas = 0;
    let totalProducts = 0;
    let totalProductInserts = 0;
    let totalEmbeddings = 0;
    const productCache = new Map<string, boolean>();

    // Step 2: Process each bundle in a transaction
    for (const bundle of bundleRows) {
      const bundleId = bundle.id;
      const giftIdeas = bundle.gift_ideas as LegacyGiftIdea[];

      console.log(`\n📦 Processing bundle ${bundleId} (${giftIdeas.length} gift ideas)...`);

      // Generate embedding for the bundle
      console.log(`  🧠 Generating embedding...`);
      const embedding = await generateBundleEmbedding(bundle);
      totalEmbeddings++;

      await db.transaction(async (tx) => {
        // Process each gift idea
        for (let ideaPosition = 0; ideaPosition < giftIdeas.length; ideaPosition++) {
          const idea = giftIdeas[ideaPosition];
          totalGiftIdeas++;

          // Insert gift idea
          const giftIdeaResult = await tx.execute<{ id: string }>(
            sql`
              INSERT INTO gift_ideas (bundle_id, title, tagline, description, position)
              VALUES (${bundleId}, ${idea.title}, ${idea.tagline || null}, ${idea.description || null}, ${ideaPosition})
              RETURNING id
            `
          );

          const giftIdeaRows = Array.from(giftIdeaResult);
          const giftIdeaId = giftIdeaRows[0]?.id;

          if (!giftIdeaId) {
            throw new Error(`Failed to insert gift idea: ${idea.title}`);
          }

          console.log(`  ✓ Gift idea: "${idea.title}" (${idea.products.length} products)`);

          // Process each product
          for (let productPosition = 0; productPosition < idea.products.length; productPosition++) {
            const product = idea.products[productPosition];
            totalProducts++;

            // Insert product if it doesn't exist (deduplicate by ID)
            if (!productCache.has(product.id)) {
              await tx.execute(
                sql`
                  INSERT INTO products (
                    id, title, price, currency, image_url, affiliate_url,
                    source, rating, review_count
                  )
                  VALUES (
                    ${product.id},
                    ${product.title},
                    ${product.price.toString()},
                    ${product.currency || 'USD'},
                    ${product.imageUrl || null},
                    ${product.affiliateUrl},
                    ${product.source},
                    ${product.rating ? product.rating.toString() : null},
                    ${product.reviewCount || null}
                  )
                  ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    price = EXCLUDED.price,
                    currency = EXCLUDED.currency,
                    image_url = EXCLUDED.image_url,
                    affiliate_url = EXCLUDED.affiliate_url,
                    rating = EXCLUDED.rating,
                    review_count = EXCLUDED.review_count,
                    updated_at = now()
                `
              );

              productCache.set(product.id, true);
              totalProductInserts++;
            }

            // Insert junction table entry
            await tx.execute(
              sql`
                INSERT INTO gift_idea_products (gift_idea_id, product_id, position)
                VALUES (${giftIdeaId}, ${product.id}, ${productPosition})
              `
            );
          }
        }

        // Update bundle with embedding
        // Note: pgvector requires the array to be formatted as a string like '[1,2,3]'
        await tx.execute(
          sql`UPDATE gift_bundles SET embedding = ${`[${embedding.join(',')}]`} WHERE id = ${bundleId}`
        );
      });

      console.log(`  ✅ Bundle ${bundleId} migrated successfully (with embedding)`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!\n');
    console.log(`📊 Statistics:`);
    console.log(`   Bundles processed: ${bundleRows.length}`);
    console.log(`   Embeddings generated: ${totalEmbeddings}`);
    console.log(`   Gift ideas created: ${totalGiftIdeas}`);
    console.log(`   Products processed: ${totalProducts}`);
    console.log(`   Unique products inserted: ${totalProductInserts}`);
    console.log(`   Product reuse rate: ${((1 - totalProductInserts / totalProducts) * 100).toFixed(1)}%`);
    console.log('='.repeat(60) + '\n');

    console.log('⚠️  IMPORTANT: The gift_ideas JSONB column has NOT been dropped.');
    console.log('   This allows for rollback if needed.');
    console.log('   After verifying the migration, you can drop it with:');
    console.log('   ALTER TABLE gift_bundles DROP COLUMN gift_ideas;\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\nThe database transaction has been rolled back.');
    process.exit(1);
  }
}

// Run migration
migrateData()
  .then(() => {
    console.log('Migration script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
