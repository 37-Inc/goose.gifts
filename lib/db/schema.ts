import { pgTable, uuid, varchar, text, integer, bigserial, jsonb, timestamp, index, numeric, boolean, vector } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Legacy bundle tables are kept mapped until a destructive database cleanup
// migration is explicitly approved. The maintained runtime no longer reads or
// writes bundle pages, bundle search, or bundle admin flows.
export const giftBundles = pgTable('gift_bundles', {
  id: uuid('id').primaryKey().defaultRandom(),

  slug: varchar('slug', { length: 100 }).notNull().unique(),

  recipientDescription: text('recipient_description').notNull(),
  occasion: varchar('occasion', { length: 500 }),
  humorStyle: varchar('humor_style', { length: 50 }).notNull(),
  minPrice: integer('min_price').notNull(),
  maxPrice: integer('max_price').notNull(),
  priceRange: varchar('price_range', { length: 20 }).notNull(),

  seoTitle: varchar('seo_title', { length: 60 }),
  seoDescription: varchar('seo_description', { length: 160 }),
  seoKeywords: varchar('seo_keywords', { length: 500 }),
  seoContent: text('seo_content'),
  seoFaqJson: jsonb('seo_faq_json').$type<Array<{ question: string; answer: string }>>(),
  recipientKeywords: text('recipient_keywords'),
  embedding: vector('embedding', { dimensions: 1536 }),
  giftIdeas: jsonb('gift_ideas'),

  viewCount: integer('view_count').notNull().default(0),
  clickCount: integer('click_count').notNull().default(0),
  shareCount: integer('share_count').notNull().default(0),

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

// Products table - active catalog source of truth
export const products = pgTable('products', {
  // Product ID (ASIN for Amazon, listing ID for Etsy)
  id: varchar('id', { length: 255 }).primaryKey(),

  // Goose-owned public identity. Retailer IDs remain private integration keys.
  publicId: uuid('public_id').notNull().defaultRandom().unique(),
  slug: varchar('slug', { length: 160 }).notNull().unique(),

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
  sourceQuery: text('source_query'),

  // Catalog search metadata for pre-indexed gift discovery
  embedding: vector('embedding', { dimensions: 1536 }),
  humorTags: text('humor_tags').array(),
  punnyTitle: text('punny_title'),
  wittyDescription: text('witty_description'),
  editorialWriteup: text('editorial_writeup'),
  sourceFacts: jsonb('source_facts').$type<Record<string, unknown>>(),
  sourceFactsHash: varchar('source_facts_hash', { length: 64 }),
  editorialSourceHash: varchar('editorial_source_hash', { length: 64 }),
  availabilityStatus: varchar('availability_status', { length: 32 }),
  availabilityCheckedAt: timestamp('availability_checked_at'),
  editorialStatus: varchar('editorial_status', { length: 32 }).notNull().default('pending'),
  editorialQualityScore: numeric('editorial_quality_score', { precision: 5, scale: 4 }),
  editorialModel: varchar('editorial_model', { length: 100 }),
  editorialPromptVersion: varchar('editorial_prompt_version', { length: 50 }),
  editorialGeneratedAt: timestamp('editorial_generated_at'),
  editorialBlockReason: text('editorial_block_reason'),
  duplicateOfProductId: varchar('duplicate_of_product_id', { length: 255 }),
  contentUpdatedAt: timestamp('content_updated_at'),
  qualityScore: numeric('quality_score', { precision: 5, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  lastVerifiedAt: timestamp('last_verified_at'),

  // Analytics - track product clicks
  clickCount: integer('click_count').notNull().default(0),
  impressionCount: integer('impression_count').notNull().default(0), // For CTR calculation

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastClickedAt: timestamp('last_clicked_at'), // Track recency for rotation
}, (table) => ({
  // Index for filtering by source
  sourceIdx: index('products_source_idx').on(table.source),
  isActiveIdx: index('products_is_active_idx').on(table.isActive),
  qualityScoreIdx: index('products_quality_score_idx').on(table.qualityScore),
  editorialStatusIdx: index('products_editorial_status_idx').on(table.editorialStatus),
  availabilityStatusIdx: index('products_availability_status_idx').on(table.availabilityStatus),
  duplicateOfProductIdIdx: index('products_duplicate_of_product_id_idx').on(table.duplicateOfProductId),
  humorTagsIdx: index('products_humor_tags_idx').using('gin', table.humorTags),
  embeddingIdx: index('products_embedding_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops'))
    .where(sql`${table.embedding} IS NOT NULL`),
}));

// Durable invocation-level telemetry for catalog discovery, revalidation, and
// editorial work. Writers persist only allowlisted configuration.
export const catalogRuns = pgTable('catalog_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  telemetryVersion: varchar('telemetry_version', { length: 50 }).notNull(),
  mode: varchar('mode', { length: 50 }).notNull(),
  trigger: varchar('trigger', { length: 32 }).notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  dryRun: boolean('dry_run').notNull().default(false),
  gitSha: varchar('git_sha', { length: 64 }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  counts: jsonb('counts').$type<Record<string, unknown>>().notNull().default({}),
  timingsMs: jsonb('timings_ms').$type<Record<string, number>>().notNull().default({}),
  usage: jsonb('usage').$type<Record<string, unknown>>().notNull().default({}),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
  warnings: jsonb('warnings').$type<Array<Record<string, unknown>>>().notNull().default([]),
  errorSummary: text('error_summary'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  startedAtIdx: index('catalog_runs_started_at_idx').on(table.startedAt),
  statusIdx: index('catalog_runs_status_idx').on(table.status),
}));

// Append-only candidate transitions. productId is deliberately not a foreign
// key so rejected discoveries and later-deleted products keep their history.
export const catalogRunItems = pgTable('catalog_run_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequence: bigserial('sequence', { mode: 'number' }).notNull(),
  runId: uuid('run_id').notNull().references(() => catalogRuns.id, { onDelete: 'cascade' }),
  phase: varchar('phase', { length: 32 }).notNull(),
  stage: varchar('stage', { length: 32 }).notNull(),
  decision: varchar('decision', { length: 32 }).notNull(),
  reasonCode: varchar('reason_code', { length: 64 }),
  productId: varchar('product_id', { length: 255 }),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  source: varchar('source', { length: 20 }),
  sourceQuery: text('source_query'),
  title: text('title'),
  imageUrl: text('image_url'),
  affiliateUrl: text('affiliate_url'),
  canonicalPath: text('canonical_path'),
  winnerProductId: varchar('winner_product_id', { length: 255 }),
  sourceFactsHash: varchar('source_facts_hash', { length: 64 }),
  editorialSourceHash: varchar('editorial_source_hash', { length: 64 }),
  requiresManualReview: boolean('requires_manual_review').notNull().default(false),
  nextAction: text('next_action'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  runIdIdx: index('catalog_run_items_run_id_idx').on(table.runId, table.sequence),
  externalIdIdx: index('catalog_run_items_external_id_idx').on(table.externalId),
  decisionIdx: index('catalog_run_items_decision_idx').on(table.decision),
  manualReviewIdx: index('catalog_run_items_manual_review_idx')
    .on(table.requiresManualReview)
    .where(sql`${table.requiresManualReview} = true`),
}));

// Append-only record of catalog editorial decisions and generation attempts.
export const catalogEditorialEvents = pgTable('catalog_editorial_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull(),
  productId: varchar('product_id', { length: 255 }).notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  runIdIdx: index('catalog_editorial_events_run_id_idx').on(table.runId),
  productIdIdx: index('catalog_editorial_events_product_id_idx').on(table.productId),
}));

// Preserve old canonical paths when an editor deliberately changes a gift slug.
export const productSlugHistory = pgTable('product_slug_history', {
  slug: varchar('slug', { length: 160 }).primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  productIdIdx: index('product_slug_history_product_id_idx').on(table.productId),
}));

// Legacy gift idea tables retained for historical data only.
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

// Product clicks table - detailed click tracking for analytics
export const productClicks = pgTable('product_clicks', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Product that was clicked
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),

  // Context of the click: 'catalog', 'search', or another product feed.
  source: varchar('source', { length: 50 }).notNull(),
  bundleSlug: varchar('bundle_slug', { length: 100 }),

  // User context (for future personalization)
  userAgent: text('user_agent'),
  referer: text('referer'),
  sessionId: varchar('session_id', { length: 100 }),
  landingPage: text('landing_page'),
  utmSource: varchar('utm_source', { length: 100 }),
  utmMedium: varchar('utm_medium', { length: 100 }),
  utmCampaign: varchar('utm_campaign', { length: 150 }),
  utmContent: varchar('utm_content', { length: 150 }),
  utmTerm: varchar('utm_term', { length: 150 }),
  referrerHost: varchar('referrer_host', { length: 255 }),

  // Timestamp
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Index for analytics queries
  productIdIdx: index('product_clicks_product_id_idx').on(table.productId),
  sourceIdx: index('product_clicks_source_idx').on(table.source),
  createdAtIdx: index('product_clicks_created_at_idx').on(table.createdAt),
  sessionIdIdx: index('product_clicks_session_id_idx').on(table.sessionId),
  utmSourceIdx: index('product_clicks_utm_source_idx').on(table.utmSource),
  utmCampaignIdx: index('product_clicks_utm_campaign_idx').on(table.utmCampaign),
  // Composite for trending analysis
  productSourceIdx: index('product_clicks_product_source_idx').on(table.productId, table.source),
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

export type ProductClick = typeof productClicks.$inferSelect;
export type NewProductClick = typeof productClicks.$inferInsert;

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

// Search Queries - Track all search activity for analytics
export const searchQueries = pgTable('search_queries', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Search query text
  query: text('query').notNull(),

  // Results metadata
  resultCount: integer('result_count').notNull().default(0),
  topSimilarity: numeric('top_similarity', { precision: 5, scale: 4 }), // Highest similarity score (0-1)

  // User interaction
  clicked: integer('clicked').notNull().default(0), // 0 = no click, 1 = clicked result
  // Legacy nullable bundle fields retained until a DB cleanup migration removes them.
  clickedBundleId: uuid('clicked_bundle_id').references(() => giftBundles.id, { onDelete: 'set null' }),
  clickedBundleSlug: varchar('clicked_bundle_slug', { length: 100 }),

  // Session tracking (optional - for grouping related searches)
  sessionId: varchar('session_id', { length: 100 }),

  // User agent for analytics
  userAgent: text('user_agent'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Index for time-based queries (top searches by day/week/month)
  createdAtIdx: index('search_queries_created_at_idx').on(table.createdAt),
  // Index for finding failed searches (0 results)
  resultCountIdx: index('search_queries_result_count_idx').on(table.resultCount),
  // Index for conversion analysis (clicked vs not clicked)
  clickedIdx: index('search_queries_clicked_idx').on(table.clicked),
  // Composite index for popular queries over time
  queryCreatedAtIdx: index('search_queries_query_created_at_idx').on(table.query, table.createdAt),
}));

export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;
