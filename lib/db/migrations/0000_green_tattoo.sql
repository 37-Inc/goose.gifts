CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar(255) NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"target_slug" varchar(100),
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"error_type" varchar(50) NOT NULL,
	"error_message" text NOT NULL,
	"stack_trace" text,
	"metadata" jsonb,
	"resolved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"recipient_description" text NOT NULL,
	"occasion" varchar(500),
	"humor_style" varchar(50) NOT NULL,
	"min_price" integer NOT NULL,
	"max_price" integer NOT NULL,
	"price_range" varchar(20) NOT NULL,
	"gift_ideas" jsonb NOT NULL,
	"seo_title" varchar(60),
	"seo_description" varchar(160),
	"seo_keywords" varchar(500),
	"seo_content" text,
	"seo_faq_json" jsonb,
	"recipient_keywords" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "gift_bundles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "admin_actions_created_at_idx" ON "admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_actions_admin_id_idx" ON "admin_actions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "error_logs_created_at_idx" ON "error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_logs_error_type_idx" ON "error_logs" USING btree ("error_type");--> statement-breakpoint
CREATE INDEX "error_logs_resolved_idx" ON "error_logs" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "slug_idx" ON "gift_bundles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "occasion_idx" ON "gift_bundles" USING btree ("occasion");--> statement-breakpoint
CREATE INDEX "humor_style_idx" ON "gift_bundles" USING btree ("humor_style");--> statement-breakpoint
CREATE INDEX "price_range_idx" ON "gift_bundles" USING btree ("price_range");--> statement-breakpoint
CREATE INDEX "occasion_humor_idx" ON "gift_bundles" USING btree ("occasion","humor_style");--> statement-breakpoint
CREATE INDEX "created_at_idx" ON "gift_bundles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "view_count_idx" ON "gift_bundles" USING btree ("view_count");