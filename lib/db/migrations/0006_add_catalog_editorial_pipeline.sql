-- Persist the verified listing facts and review state that make a product page
-- safe to index. Stable pages remain available when they fail a gate, but only
-- explicitly reviewed copy is exposed to search engines.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "source_facts" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "source_facts_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_source_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "availability_status" varchar(32);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "availability_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_status" varchar(32) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_quality_score" numeric(5,4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_model" varchar(100);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_prompt_version" varchar(50);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_block_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "duplicate_of_product_id" varchar(255);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "content_updated_at" timestamp;--> statement-breakpoint

UPDATE products
SET editorial_status = 'manual_locked',
    editorial_quality_score = 0.9500,
    editorial_model = 'human-editor',
    editorial_prompt_version = 'manual-v1',
    editorial_generated_at = COALESCE(editorial_generated_at, updated_at),
    content_updated_at = COALESCE(content_updated_at, updated_at),
    availability_checked_at = COALESCE(availability_checked_at, last_verified_at)
WHERE editorial_writeup IS NOT NULL
  AND length(trim(editorial_writeup)) >= 500
  AND editorial_status = 'pending';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_editorial_status_idx" ON "products" ("editorial_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_availability_status_idx" ON "products" ("availability_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_duplicate_of_product_id_idx" ON "products" ("duplicate_of_product_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "catalog_editorial_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "product_id" varchar(255) NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "event_type" varchar(50) NOT NULL,
  "status" varchar(32) NOT NULL,
  "details" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_editorial_events_run_id_idx" ON "catalog_editorial_events" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_editorial_events_product_id_idx" ON "catalog_editorial_events" ("product_id");
