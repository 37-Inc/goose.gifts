-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

-- Add embedding column to gift_bundles
ALTER TABLE "gift_bundles" ADD COLUMN "embedding" vector(1536);
--> statement-breakpoint

-- Create products table
CREATE TABLE "products" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"image_url" text,
	"affiliate_url" text NOT NULL,
	"source" varchar(20) NOT NULL,
	"rating" numeric(3, 2),
	"review_count" integer,
	"category" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create gift_ideas table
CREATE TABLE "gift_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"description" text,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create gift_idea_products junction table
CREATE TABLE "gift_idea_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_idea_id" uuid NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "gift_ideas" ADD CONSTRAINT "gift_ideas_bundle_id_gift_bundles_id_fk"
	FOREIGN KEY ("bundle_id") REFERENCES "gift_bundles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE "gift_idea_products" ADD CONSTRAINT "gift_idea_products_gift_idea_id_gift_ideas_id_fk"
	FOREIGN KEY ("gift_idea_id") REFERENCES "gift_ideas"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE "gift_idea_products" ADD CONSTRAINT "gift_idea_products_product_id_products_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

-- Create indexes
CREATE INDEX "products_source_idx" ON "products" USING btree ("source");
--> statement-breakpoint

CREATE INDEX "gift_ideas_bundle_id_idx" ON "gift_ideas" USING btree ("bundle_id");
--> statement-breakpoint

CREATE INDEX "gift_ideas_bundle_position_idx" ON "gift_ideas" USING btree ("bundle_id", "position");
--> statement-breakpoint

CREATE INDEX "gift_idea_products_gift_idea_id_idx" ON "gift_idea_products" USING btree ("gift_idea_id");
--> statement-breakpoint

CREATE INDEX "gift_idea_products_product_id_idx" ON "gift_idea_products" USING btree ("product_id");
--> statement-breakpoint

CREATE INDEX "gift_idea_products_position_idx" ON "gift_idea_products" USING btree ("gift_idea_id", "position");
