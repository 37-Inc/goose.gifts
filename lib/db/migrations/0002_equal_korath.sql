CREATE TABLE "product_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"source" varchar(50) NOT NULL,
	"bundle_slug" varchar(100),
	"user_agent" text,
	"referer" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "impression_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "last_clicked_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_clicks" ADD CONSTRAINT "product_clicks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_clicks_product_id_idx" ON "product_clicks" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_clicks_source_idx" ON "product_clicks" USING btree ("source");--> statement-breakpoint
CREATE INDEX "product_clicks_created_at_idx" ON "product_clicks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_clicks_product_source_idx" ON "product_clicks" USING btree ("product_id","source");