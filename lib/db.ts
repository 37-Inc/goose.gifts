import { sql } from '@vercel/postgres';
import type { GiftIdea, GiftRequest, PermalinkRecord } from './types';

// Generate a unique slug for permalinks
export function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

// Save gift ideas to database and return slug
export async function saveGiftIdeas(
  request: GiftRequest,
  giftIdeas: GiftIdea[]
): Promise<string> {
  const slug = generateSlug();
  const now = new Date();

  try {
    await sql`
      INSERT INTO gift_ideas (
        slug,
        recipient_description,
        occasion,
        humor_style,
        min_price,
        max_price,
        gift_ideas,
        created_at,
        view_count
      ) VALUES (
        ${slug},
        ${request.recipientDescription},
        ${request.occasion || null},
        ${request.humorStyle},
        ${request.minPrice},
        ${request.maxPrice},
        ${JSON.stringify(giftIdeas)}::jsonb,
        ${now.toISOString()},
        0
      )
    `;

    return slug;
  } catch (error) {
    console.error('Database save error:', error);
    throw new Error('Failed to save gift ideas');
  }
}

// Retrieve gift ideas by slug
export async function getGiftIdeasBySlug(
  slug: string
): Promise<PermalinkRecord | null> {
  try {
    const result = await sql`
      SELECT * FROM gift_ideas
      WHERE slug = ${slug}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Increment view count
    await sql`
      UPDATE gift_ideas
      SET view_count = view_count + 1
      WHERE slug = ${slug}
    `;

    return {
      id: row.id,
      slug: row.slug,
      recipient_description: row.recipient_description,
      occasion: row.occasion,
      humor_style: row.humor_style,
      min_price: row.min_price,
      max_price: row.max_price,
      gift_ideas: row.gift_ideas,
      created_at: new Date(row.created_at),
      view_count: row.view_count + 1,
    };
  } catch (error) {
    console.error('Database fetch error:', error);
    return null;
  }
}

// Initialize database schema (run this once during setup)
export async function initializeDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS gift_ideas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(255) UNIQUE NOT NULL,
        recipient_description TEXT NOT NULL,
        occasion VARCHAR(255),
        humor_style VARCHAR(50) NOT NULL,
        min_price INTEGER NOT NULL,
        max_price INTEGER NOT NULL,
        gift_ideas JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        view_count INTEGER NOT NULL DEFAULT 0,
        INDEX idx_slug (slug),
        INDEX idx_created_at (created_at DESC)
      )
    `;

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Get trending gift ideas (most viewed in last 7 days)
export async function getTrendingGiftIdeas(limit: number = 10): Promise<PermalinkRecord[]> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await sql`
      SELECT * FROM gift_ideas
      WHERE created_at >= ${sevenDaysAgo.toISOString()}
      ORDER BY view_count DESC
      LIMIT ${limit}
    `;

    return result.rows.map(row => ({
      id: row.id,
      slug: row.slug,
      recipient_description: row.recipient_description,
      occasion: row.occasion,
      humor_style: row.humor_style,
      min_price: row.min_price,
      max_price: row.max_price,
      gift_ideas: row.gift_ideas,
      created_at: new Date(row.created_at),
      view_count: row.view_count,
    }));
  } catch (error) {
    console.error('Trending fetch error:', error);
    return [];
  }
}
