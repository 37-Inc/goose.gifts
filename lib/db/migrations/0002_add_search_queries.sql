-- Add search_queries table for search analytics
CREATE TABLE "search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"top_similarity" numeric(5, 4),
	"clicked" integer DEFAULT 0 NOT NULL,
	"clicked_bundle_id" uuid,
	"clicked_bundle_slug" varchar(100),
	"session_id" varchar(100),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_clicked_bundle_id_gift_bundles_id_fk" FOREIGN KEY ("clicked_bundle_id") REFERENCES "public"."gift_bundles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "search_queries_created_at_idx" ON "search_queries" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "search_queries_result_count_idx" ON "search_queries" USING btree ("result_count");
--> statement-breakpoint
CREATE INDEX "search_queries_clicked_idx" ON "search_queries" USING btree ("clicked");
--> statement-breakpoint
CREATE INDEX "search_queries_query_created_at_idx" ON "search_queries" USING btree ("query","created_at");
