-- Add a Goose-owned public identity and stable slug without replacing the
-- retailer listing ID used by catalog imports, click history, and relations.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "public_id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" varchar(160);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "editorial_writeup" text;--> statement-breakpoint

UPDATE "products"
SET "public_id" = gen_random_uuid()
WHERE "public_id" IS NULL;--> statement-breakpoint

WITH normalized AS (
  SELECT
    id,
    public_id,
    COALESCE(
      NULLIF(
        LEFT(
          TRIM(BOTH '-' FROM REGEXP_REPLACE(
            LOWER(COALESCE(NULLIF(punny_title, ''), title)),
            '[^a-z0-9]+',
            '-',
            'g'
          )),
          120
        ),
        ''
      ),
      'ridiculous-gift'
    ) AS base_slug
  FROM products
  WHERE slug IS NULL OR slug = ''
), ranked AS (
  SELECT
    id,
    public_id,
    base_slug,
    COUNT(*) OVER (PARTITION BY base_slug) AS duplicate_count
  FROM normalized
)
UPDATE products AS target
SET slug = CASE
  WHEN ranked.duplicate_count = 1 THEN ranked.base_slug
  ELSE LEFT(ranked.base_slug, 150) || '-' || LEFT(ranked.public_id::text, 8)
END
FROM ranked
WHERE target.id = ranked.id;--> statement-breakpoint

ALTER TABLE "products" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_public_id_unique_idx" ON "products" ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_unique_idx" ON "products" ("slug");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_slug_history" (
  "slug" varchar(160) PRIMARY KEY NOT NULL,
  "product_id" varchar(255) NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_slug_history_product_id_idx" ON "product_slug_history" ("product_id");--> statement-breakpoint

CREATE OR REPLACE FUNCTION assign_product_public_identity()
RETURNS trigger AS $$
DECLARE
  base_slug text;
  candidate_slug text;
  suffix_length integer;
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := gen_random_uuid();
  END IF;

  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base_slug := LEFT(TRIM(BOTH '-' FROM REGEXP_REPLACE(
      LOWER(COALESCE(NULLIF(NEW.punny_title, ''), NEW.title)),
      '[^a-z0-9]+',
      '-',
      'g'
    )), 120);
    IF base_slug = '' THEN
      base_slug := 'ridiculous-gift';
    END IF;

    candidate_slug := base_slug;
    suffix_length := 8;

    WHILE EXISTS (
      SELECT 1 FROM products WHERE slug = candidate_slug AND id <> NEW.id
      UNION ALL
      SELECT 1 FROM product_slug_history
      WHERE slug = candidate_slug AND product_id <> NEW.id
    ) LOOP
      IF suffix_length > 32 THEN
        RAISE EXCEPTION 'Unable to assign a unique public slug for product %', NEW.id;
      END IF;

      candidate_slug := LEFT(base_slug, 159 - suffix_length)
        || '-'
        || LEFT(REPLACE(NEW.public_id::text, '-', ''), suffix_length);
      suffix_length := suffix_length + 4;
    END LOOP;

    NEW.slug := candidate_slug;
  ELSIF EXISTS (
    SELECT 1
    FROM product_slug_history
    WHERE slug = NEW.slug AND product_id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Product slug % is reserved by another product history', NEW.slug;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS products_assign_public_identity ON products;--> statement-breakpoint
CREATE TRIGGER products_assign_public_identity
BEFORE INSERT OR UPDATE OF slug ON products
FOR EACH ROW EXECUTE FUNCTION assign_product_public_identity();--> statement-breakpoint

CREATE OR REPLACE FUNCTION preserve_product_slug_history()
RETURNS trigger AS $$
BEGIN
  IF OLD.slug IS DISTINCT FROM NEW.slug AND OLD.slug IS NOT NULL THEN
    INSERT INTO product_slug_history (slug, product_id)
    VALUES (OLD.slug, OLD.id)
    ON CONFLICT (slug) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS products_preserve_slug_history ON products;--> statement-breakpoint
CREATE TRIGGER products_preserve_slug_history
BEFORE UPDATE OF slug ON products
FOR EACH ROW EXECUTE FUNCTION preserve_product_slug_history();--> statement-breakpoint

-- Start with carefully edited copy for products already used by public
-- Pinterest campaigns. Other gift pages exist but remain noindex until their
-- own substantive, product-specific editorial is reviewed.
UPDATE products SET editorial_writeup = 'This personalized black ceramic mug turns an ordinary coffee break into a very specific piece of hippo theater. The front keeps the actual listing''s cartoon hippo, exaggerated red lips, turquoise medallion, and custom name together, so the joke feels personal without asking the recipient to understand a complicated reference.

It works best for a Patricia—or another name chosen at order time—who enjoys conspicuous desk mugs, animal humor, or gifts that can carry a meeting through the awkward first five minutes. The useful part matters: after the reveal, it is still a real mug rather than a prank package with nothing left to do. Check the retailer listing for the current personalization choices, price, and availability before ordering.'
WHERE id = 'B0F9DZMQBL' AND editorial_writeup IS NULL;--> statement-breakpoint

UPDATE products SET editorial_writeup = 'This green alligator oven mitt makes a normal kitchen task look like a tiny reptile has volunteered for pan duty. Its long printed jaws, white teeth, red mouth, and textile oven-mitt construction make the gag readable from across the room while keeping the object recognizably useful.

It is a strong fit for housewarmings, hosts, home cooks, and white elephant exchanges where a practical gift has a better chance of being stolen. The humor comes from the object doing its actual job, not from a misleading prop or invented feature. Check the retailer listing for current sizing, care instructions, price, and availability before ordering.'
WHERE id = 'B005UGWDAE' AND editorial_writeup IS NULL;--> statement-breakpoint

UPDATE products SET editorial_writeup = 'This glossy ceramic eye is a small piece of tabletop decor that quietly makes an entire room feel watched. The dimensional white almond shape, blue iris, dark pupil, and gold outline give it enough polish to work on a shelf or side table before the visual joke fully registers.

It suits people who like surreal interiors, maximalist accents, optical-illusion decor, or housewarming gifts that do not look like conventional gag merchandise. Because it is a freestanding ceramic object rather than a rug or wall print, the safest expectation is a strange decorative accent at tabletop scale. Check the retailer listing for current dimensions, price, and availability before ordering.'
WHERE id = 'B0D57DDDM1' AND editorial_writeup IS NULL;--> statement-breakpoint

UPDATE products SET editorial_writeup = 'The Screaming Goat pairs a miniature goat figure with its companion book, turning a famously dramatic noise into a compact desk interruption. The tiny figure and stump-like base are the joke; it is intentionally small, so the appeal is in the absurd sound-and-scale contrast rather than in receiving a full-size toy.

It works for coworkers, meeting survivors, stocking stuffers, and white elephant groups that appreciate a harmless bit of desk chaos. The book-and-figure format also gives the recipient something more complete than a single disposable prank. Check the retailer listing for the current package contents, price, and availability before ordering.'
WHERE id = '0762459816' AND editorial_writeup IS NULL;
