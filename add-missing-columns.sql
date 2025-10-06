-- Add missing columns to gift_bundles table
ALTER TABLE gift_bundles
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now() NOT NULL;
