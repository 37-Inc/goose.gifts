-- Execute atomically. Only the projection deadline becomes nullable; NULL is
-- independently cleared persistent display, never a supplier lease extension.
-- Keep every original rowid/value, FK, receipt and immutable/sealed boundary.
CREATE TABLE catalog_public_products_persistent_v13 (
  catalog_revision TEXT NOT NULL,
  public_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT NOT NULL,
  source_facts_hash TEXT NOT NULL,
  eligible_until TEXT,
  public_display_json TEXT NOT NULL CHECK (json_valid(public_display_json)),
  display_sha256 TEXT NOT NULL CHECK (length(display_sha256)=64),
  PRIMARY KEY (catalog_revision, public_id),
  UNIQUE (catalog_revision, product_id),
  UNIQUE (catalog_revision, slug)
);
INSERT INTO catalog_public_products_persistent_v13
  (rowid,catalog_revision,public_id,product_id,slug,title,description,tags,source_facts_hash,eligible_until,public_display_json,display_sha256)
SELECT rowid,catalog_revision,public_id,product_id,slug,title,description,tags,source_facts_hash,eligible_until,public_display_json,display_sha256
FROM catalog_public_products;
DROP TRIGGER catalog_projection_complete;
DROP TABLE catalog_public_products;
ALTER TABLE catalog_public_products_persistent_v13 RENAME TO catalog_public_products;
CREATE INDEX catalog_public_expiry_idx ON catalog_public_products(catalog_revision,eligible_until);
CREATE TRIGGER catalog_public_immutable BEFORE UPDATE ON catalog_public_products BEGIN
  SELECT RAISE(ABORT,'Public projections are immutable');
END;
CREATE TRIGGER catalog_public_ai AFTER INSERT ON catalog_public_products BEGIN
  INSERT INTO catalog_public_products_fts(rowid,title,description,tags) VALUES(new.rowid,new.title,new.description,new.tags);
END;
CREATE TRIGGER catalog_public_ad AFTER DELETE ON catalog_public_products BEGIN
  INSERT INTO catalog_public_products_fts(catalog_public_products_fts,rowid,title,description,tags)
    VALUES('delete',old.rowid,old.title,old.description,old.tags);
END;
CREATE TRIGGER catalog_projection_complete BEFORE INSERT ON catalog_projection_receipts
WHEN new.product_count!=(SELECT count(*) FROM catalog_public_products WHERE catalog_revision=new.catalog_revision) BEGIN
  SELECT RAISE(ABORT,'Incomplete public projection');
END;
CREATE TRIGGER catalog_public_sealed BEFORE INSERT ON catalog_public_products
WHEN EXISTS(SELECT 1 FROM catalog_projection_receipts WHERE catalog_revision=new.catalog_revision) BEGIN
  SELECT RAISE(ABORT,'Public projection revision is sealed');
END;
INSERT INTO catalog_public_products_fts(catalog_public_products_fts) VALUES('rebuild');
