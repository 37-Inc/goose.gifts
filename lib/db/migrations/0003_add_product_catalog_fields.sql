-- Catalog fields for the pre-indexed product search pivot.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "source_query" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "humor_tags" text[];--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "punny_title" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "witty_description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "quality_score" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_is_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_quality_score_idx" ON "products" USING btree ("quality_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_humor_tags_idx" ON "products" USING gin ("humor_tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_embedding_hnsw_idx" ON "products" USING hnsw ("embedding" vector_cosine_ops) WHERE "products"."embedding" IS NOT NULL;
