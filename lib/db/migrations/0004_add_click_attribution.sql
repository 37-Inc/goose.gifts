-- Attribution fields for measuring external acquisition experiments through
-- outbound product clicks.
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "session_id" varchar(100);--> statement-breakpoint
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "landing_page" text;--> statement-breakpoint
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "utm_source" varchar(100);--> statement-breakpoint
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "utm_medium" varchar(100);--> statement-breakpoint
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "utm_campaign" varchar(150);--> statement-breakpoint
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "utm_content" varchar(150);--> statement-breakpoint
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "utm_term" varchar(150);--> statement-breakpoint
ALTER TABLE "product_clicks" ADD COLUMN IF NOT EXISTS "referrer_host" varchar(255);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_clicks_session_id_idx" ON "product_clicks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_clicks_utm_source_idx" ON "product_clicks" USING btree ("utm_source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_clicks_utm_campaign_idx" ON "product_clicks" USING btree ("utm_campaign");
