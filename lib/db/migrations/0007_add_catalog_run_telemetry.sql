-- One durable receipt per catalog invocation, including partial and failed
-- runs. Configuration is allowlisted by the writer; secrets never belong in
-- these records.
CREATE TABLE IF NOT EXISTS "catalog_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "telemetry_version" varchar(50) NOT NULL,
  "mode" varchar(50) NOT NULL,
  "trigger" varchar(32) NOT NULL,
  "status" varchar(16) NOT NULL,
  "dry_run" boolean DEFAULT false NOT NULL,
  "git_sha" varchar(64),
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "timings_ms" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "estimated_cost_usd" numeric(12,6),
  "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error_summary" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_runs_started_at_idx" ON "catalog_runs" ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_runs_status_idx" ON "catalog_runs" ("status");--> statement-breakpoint

-- Append-only candidate transitions retain enough small snapshots to audit a
-- decision even when the candidate never became a product or a product is
-- later removed. Product IDs are intentionally not foreign keys.
CREATE TABLE IF NOT EXISTS "catalog_run_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence" bigserial NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "catalog_runs"("id") ON DELETE CASCADE,
  "phase" varchar(32) NOT NULL,
  "stage" varchar(32) NOT NULL,
  "decision" varchar(32) NOT NULL,
  "reason_code" varchar(64),
  "product_id" varchar(255),
  "external_id" varchar(255) NOT NULL,
  "source" varchar(20),
  "source_query" text,
  "title" text,
  "image_url" text,
  "affiliate_url" text,
  "canonical_path" text,
  "winner_product_id" varchar(255),
  "source_facts_hash" varchar(64),
  "editorial_source_hash" varchar(64),
  "requires_manual_review" boolean DEFAULT false NOT NULL,
  "next_action" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_run_items_run_id_idx" ON "catalog_run_items" ("run_id", "sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_run_items_external_id_idx" ON "catalog_run_items" ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_run_items_decision_idx" ON "catalog_run_items" ("decision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_run_items_manual_review_idx"
  ON "catalog_run_items" ("requires_manual_review")
  WHERE "requires_manual_review" = true;--> statement-breakpoint

-- The original event FK cascaded on product deletion, which made an audit log
-- erasable by catalog cleanup. Keep its historical product ID as a plain key.
ALTER TABLE "catalog_editorial_events"
  DROP CONSTRAINT IF EXISTS "catalog_editorial_events_product_id_products_id_fk",
  DROP CONSTRAINT IF EXISTS "catalog_editorial_events_product_id_fkey";
