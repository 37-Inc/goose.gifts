import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import type { GiftIdea } from '@/lib/types';

export const giftBundles = pgTable('gift_bundles', {
  // Primary identifier
  id: uuid('id').primaryKey().defaultRandom(),

  // URL slug (unique, indexed for fast lookups)
  slug: varchar('slug', { length: 8 }).notNull().unique(),

  // Search context (for SEO and display)
  recipientDescription: text('recipient_description').notNull(),
  occasion: varchar('occasion', { length: 500 }),
  humorStyle: varchar('humor_style', { length: 50 }).notNull(),
  minPrice: integer('min_price').notNull(),
  maxPrice: integer('max_price').notNull(),

  // Price range classification for related bundles
  priceRange: varchar('price_range', { length: 20 }).notNull(), // 'budget', 'mid', 'premium'

  // Gift ideas (stored as JSONB array)
  giftIdeas: jsonb('gift_ideas').notNull().$type<GiftIdea[]>(),

  // SEO metadata
  seoTitle: varchar('seo_title', { length: 60 }),
  seoDescription: varchar('seo_description', { length: 160 }),
  seoKeywords: varchar('seo_keywords', { length: 500 }),

  // Enhanced SEO content (400-500 words)
  seoContent: text('seo_content'),

  // FAQ structured data (JSONB array of {question, answer} objects)
  seoFaqJson: jsonb('seo_faq_json').$type<Array<{ question: string; answer: string }>>(),

  // Recipient keywords for similarity matching
  recipientKeywords: text('recipient_keywords'),

  // Analytics
  viewCount: integer('view_count').notNull().default(0),
  shareCount: integer('share_count').notNull().default(0),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // Index on slug for fast permalink lookups
  slugIdx: index('slug_idx').on(table.slug),

  // Indexes for related bundles queries
  occasionIdx: index('occasion_idx').on(table.occasion),
  humorStyleIdx: index('humor_style_idx').on(table.humorStyle),
  priceRangeIdx: index('price_range_idx').on(table.priceRange),

  // Composite index for common query patterns
  occasionHumorIdx: index('occasion_humor_idx').on(table.occasion, table.humorStyle),

  // Index on createdAt for "newest first" queries
  createdAtIdx: index('created_at_idx').on(table.createdAt),

  // Index on viewCount for "trending" queries
  viewCountIdx: index('view_count_idx').on(table.viewCount),
}));

// Type inference helpers
export type GiftBundle = typeof giftBundles.$inferSelect;
export type NewGiftBundle = typeof giftBundles.$inferInsert;
