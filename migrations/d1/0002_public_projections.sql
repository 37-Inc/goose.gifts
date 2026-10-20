-- Public views are immutable per revision; products remains current operational state.
CREATE TABLE IF NOT EXISTS catalog_public_products (
  catalog_revision TEXT NOT NULL,
  public_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT NOT NULL,
  source_facts_hash TEXT NOT NULL,
  eligible_until TEXT NOT NULL,
  public_display_json TEXT NOT NULL CHECK (json_valid(public_display_json)),
  display_sha256 TEXT NOT NULL CHECK (length(display_sha256)=64),
  PRIMARY KEY (catalog_revision, public_id),
  UNIQUE (catalog_revision, product_id),
  UNIQUE (catalog_revision, slug)
);
CREATE INDEX IF NOT EXISTS catalog_public_expiry_idx ON catalog_public_products(catalog_revision,eligible_until);
CREATE TRIGGER IF NOT EXISTS catalog_public_immutable BEFORE UPDATE ON catalog_public_products BEGIN
  SELECT RAISE(ABORT,'Public projections are immutable');
END;
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_public_products_fts USING fts5(
  title,description,tags,content='catalog_public_products',content_rowid='rowid',tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS catalog_public_ai AFTER INSERT ON catalog_public_products BEGIN
  INSERT INTO catalog_public_products_fts(rowid,title,description,tags) VALUES(new.rowid,new.title,new.description,new.tags);
END;
CREATE TRIGGER IF NOT EXISTS catalog_public_ad AFTER DELETE ON catalog_public_products BEGIN
  INSERT INTO catalog_public_products_fts(catalog_public_products_fts,rowid,title,description,tags)
    VALUES('delete',old.rowid,old.title,old.description,old.tags);
END;
CREATE TABLE IF NOT EXISTS catalog_projection_receipts (
  catalog_revision TEXT PRIMARY KEY NOT NULL,
  snapshot_sha256 TEXT NOT NULL CHECK (length(snapshot_sha256)=64),
  projection_sha256 TEXT NOT NULL CHECK (length(projection_sha256)=64),
  source_export_sha256 TEXT NOT NULL CHECK (length(source_export_sha256)=64),
  product_count INTEGER NOT NULL CHECK (product_count>=0),
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS catalog_projection_receipt_immutable BEFORE UPDATE ON catalog_projection_receipts BEGIN
  SELECT RAISE(ABORT,'Projection receipts are immutable');
END;
CREATE TRIGGER IF NOT EXISTS catalog_projection_complete BEFORE INSERT ON catalog_projection_receipts
WHEN new.product_count!=(SELECT count(*) FROM catalog_public_products WHERE catalog_revision=new.catalog_revision) BEGIN
  SELECT RAISE(ABORT,'Incomplete public projection');
END;
CREATE TRIGGER IF NOT EXISTS catalog_public_sealed BEFORE INSERT ON catalog_public_products
WHEN EXISTS(SELECT 1 FROM catalog_projection_receipts WHERE catalog_revision=new.catalog_revision) BEGIN
  SELECT RAISE(ABORT,'Public projection revision is sealed');
END;
