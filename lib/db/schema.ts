import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index, numeric, foreignKey, vector } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const giftBundles = pgTable('gift_bundles', {
  // Primary identifier
  id: uuid('id').primaryKey().defaultRandom(),

  // URL slug (unique, indexed for fast lookups)
  // Human-readable SEO-friendly format: "surf-themed-gift-bundles-for-moms-a3k9"
  slug: varchar('slug', { length: 100 }).notNull().unique(),

  // Search context (for SEO and display)
  recipientDescription: text('recipient_description').notNull(),
  occasion: varchar('occasion', { length: 500 }),
  humorStyle: varchar('humor_style', { length: 50 }).notNull(),
  minPrice: integer('min_price').notNull(),
  maxPrice: integer('max_price').notNull(),

  // Price range classification for related bundles
  priceRange: varchar('price_range', { length: 20 }).notNull(), // 'budget', 'mid', 'premium'

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

  // Vector embedding for semantic search (1536 dimensions for text-embedding-3-small)
  embedding: vector('embedding', { dimensions: 1536 }),

  // DEPRECATED: Keep until cleanup migration after verification
  giftIdeas: jsonb('gift_ideas'),

  // Analytics
  viewCount: integer('view_count').notNull().default(0),
  clickCount: integer('click_count').notNull().default(0),
  shareCount: integer('share_count').notNull().default(0),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
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

// Products table - deduplicated across all bundles
export const products = pgTable('products', {
  // Product ID (ASIN for Amazon, listing ID for Etsy)
  id: varchar('id', { length: 255 }).primaryKey(),

  // Product details
  title: text('title').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  imageUrl: text('image_url'),
  affiliateUrl: text('affiliate_url').notNull(),

  // Source and metadata
  source: varchar('source', { length: 20 }).notNull(), // 'amazon' | 'etsy'
  rating: numeric('rating', { precision: 3, scale: 2 }),
  reviewCount: integer('review_count'),
  category: varchar('category', { length: 100 }), // For future commission tracking

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // Index for filtering by source
  sourceIdx: index('products_source_idx').on(table.source),
}));

// Gift ideas table - each bundle has multiple gift ideas
export const giftIdeas = pgTable('gift_ideas', {
  // Primary identifier
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign key to bundle
  bundleId: uuid('bundle_id').notNull().references(() => giftBundles.id, { onDelete: 'cascade' }),

  // Gift idea content
  title: text('title').notNull(),
  tagline: text('tagline'),
  description: text('description'),

  // Position within bundle for ordering
  position: integer('position').notNull(),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Index for fast bundle lookups
  bundleIdIdx: index('gift_ideas_bundle_id_idx').on(table.bundleId),
  // Composite index for ordered queries
  bundlePositionIdx: index('gift_ideas_bundle_position_idx').on(table.bundleId, table.position),
}));

// Junction table - many-to-many between gift ideas and products
export const giftIdeaProducts = pgTable('gift_idea_products', {
  // Primary identifier
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign keys
  giftIdeaId: uuid('gift_idea_id').notNull().references(() => giftIdeas.id, { onDelete: 'cascade' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),

  // Position within gift idea for ordering
  position: integer('position').notNull(),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Indexes for fast lookups
  giftIdeaIdIdx: index('gift_idea_products_gift_idea_id_idx').on(table.giftIdeaId),
  productIdIdx: index('gift_idea_products_product_id_idx').on(table.productId),
  // Composite index for ordered queries
  giftIdeaPositionIdx: index('gift_idea_products_position_idx').on(table.giftIdeaId, table.position),
}));

// Define relations for Drizzle ORM
export const giftBundlesRelations = relations(giftBundles, ({ many }) => ({
  giftIdeas: many(giftIdeas),
}));

export const giftIdeasRelations = relations(giftIdeas, ({ one, many }) => ({
  bundle: one(giftBundles, {
    fields: [giftIdeas.bundleId],
    references: [giftBundles.id],
  }),
  giftIdeaProducts: many(giftIdeaProducts),
}));

export const productsRelations = relations(products, ({ many }) => ({
  giftIdeaProducts: many(giftIdeaProducts),
}));

export const giftIdeaProductsRelations = relations(giftIdeaProducts, ({ one }) => ({
  giftIdea: one(giftIdeas, {
    fields: [giftIdeaProducts.giftIdeaId],
    references: [giftIdeas.id],
  }),
  product: one(products, {
    fields: [giftIdeaProducts.productId],
    references: [products.id],
  }),
}));

// Type inference helpers
export type GiftBundle = typeof giftBundles.$inferSelect;
export type NewGiftBundle = typeof giftBundles.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type GiftIdea = typeof giftIdeas.$inferSelect;
export type NewGiftIdea = typeof giftIdeas.$inferInsert;

export type GiftIdeaProduct = typeof giftIdeaProducts.$inferSelect;
export type NewGiftIdeaProduct = typeof giftIdeaProducts.$inferInsert;

// Admin Actions - Audit log for admin actions
export const adminActions = pgTable('admin_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: varchar('admin_id', { length: 255 }).notNull(), // For future multi-admin support
  actionType: varchar('action_type', { length: 50 }).notNull(), // 'delete', 'edit', 'export'
  targetSlug: varchar('target_slug', { length: 100 }),
  reason: text('reason'),
  metadata: jsonb('metadata'), // Additional action details
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index('admin_actions_created_at_idx').on(table.createdAt),
  adminIdIdx: index('admin_actions_admin_id_idx').on(table.adminId),
}));

export type AdminAction = typeof adminActions.$inferSelect;
export type NewAdminAction = typeof adminActions.$inferInsert;

// Error Logs - System error tracking
export const errorLogs = pgTable('error_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  errorType: varchar('error_type', { length: 50 }).notNull(), // 'openai', 'amazon', 'etsy', 'database', 'other'
  errorMessage: text('error_message').notNull(),
  stackTrace: text('stack_trace'),
  metadata: jsonb('metadata'), // Additional error context
  resolved: integer('resolved').notNull().default(0), // 0 = unresolved, 1 = resolved
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index('error_logs_created_at_idx').on(table.createdAt),
  errorTypeIdx: index('error_logs_error_type_idx').on(table.errorType),
  resolvedIdx: index('error_logs_resolved_idx').on(table.resolved),
}));

export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;
