-- Forward migration. Execute atomically through the migration runner.
-- NULL means the normalized instant is unknown, never that the source row/time was lost.
-- Existing rows/projections remain unchanged; {} does not invent timestamp provenance.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE products_timestamp_v5 (
  id TEXT PRIMARY KEY NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('amazon','etsy')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor>0),
  currency TEXT NOT NULL CHECK (length(currency)=3),
  quality_score REAL CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 1),
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  duplicate_of_product_id TEXT,
  editorial_status TEXT NOT NULL,
  availability_status TEXT,
  availability_checked_at TEXT,
  last_verified_at TEXT,
  source_facts_hash TEXT,
  editorial_source_hash TEXT,
  embedding_text_hash TEXT,
  catalog_revision TEXT NOT NULL,
  eligible_until TEXT,
  public_display_json TEXT CHECK (public_display_json IS NULL OR json_valid(public_display_json)),
  rights_json TEXT NOT NULL CHECK (json_valid(rights_json)),
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json)),
  created_at TEXT,
  updated_at TEXT,
  timestamp_provenance_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(timestamp_provenance_json))
);
INSERT INTO products_timestamp_v5
  (rowid,id,public_id,slug,source,title,description,tags,price_minor,currency,quality_score,is_active,
   duplicate_of_product_id,editorial_status,availability_status,availability_checked_at,last_verified_at,
   source_facts_hash,editorial_source_hash,embedding_text_hash,catalog_revision,eligible_until,
   public_display_json,rights_json,source_record_json,created_at,updated_at)
SELECT rowid,id,public_id,slug,source,title,description,tags,price_minor,currency,quality_score,is_active,
   duplicate_of_product_id,editorial_status,availability_status,availability_checked_at,last_verified_at,
   source_facts_hash,editorial_source_hash,embedding_text_hash,catalog_revision,eligible_until,
   public_display_json,rights_json,source_record_json,created_at,updated_at FROM products;
DROP TABLE products;
ALTER TABLE products_timestamp_v5 RENAME TO products;
CREATE INDEX products_active_quality_idx ON products(is_active,quality_score);
CREATE INDEX products_expiry_idx ON products(eligible_until);
CREATE INDEX products_duplicate_idx ON products(duplicate_of_product_id);
CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid,title,description,tags) VALUES(new.rowid,new.title,new.description,new.tags);
END;
CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts,rowid,title,description,tags) VALUES('delete',old.rowid,old.title,old.description,old.tags);
END;
CREATE TRIGGER products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts,rowid,title,description,tags) VALUES('delete',old.rowid,old.title,old.description,old.tags);
  INSERT INTO products_fts(rowid,title,description,tags) VALUES(new.rowid,new.title,new.description,new.tags);
END;
INSERT INTO products_fts(products_fts) VALUES('rebuild');

CREATE TABLE catalog_editorial_events_timestamp_v5 (
  id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL,product_id TEXT NOT NULL,
  event_type TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json)),
  timestamp_provenance_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(timestamp_provenance_json))
);
INSERT INTO catalog_editorial_events_timestamp_v5
  (rowid,id,run_id,product_id,event_type,status,created_at,source_record_json)
SELECT rowid,id,run_id,product_id,event_type,status,created_at,source_record_json FROM catalog_editorial_events;
DROP TABLE catalog_editorial_events;
ALTER TABLE catalog_editorial_events_timestamp_v5 RENAME TO catalog_editorial_events;
CREATE INDEX catalog_editorial_events_product_idx ON catalog_editorial_events(product_id,created_at);

CREATE TABLE search_history_timestamp_v5 (
  id TEXT PRIMARY KEY NOT NULL,created_at TEXT,legacy_bundle_id TEXT,legacy_bundle_slug TEXT,archive_reference TEXT,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json)),
  timestamp_provenance_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(timestamp_provenance_json)),
  CHECK (legacy_bundle_id IS NULL OR archive_reference IS NOT NULL)
);
INSERT INTO search_history_timestamp_v5
  (rowid,id,created_at,legacy_bundle_id,legacy_bundle_slug,archive_reference,source_record_json)
SELECT rowid,id,created_at,legacy_bundle_id,legacy_bundle_slug,archive_reference,source_record_json FROM search_history;
DROP TABLE search_history;
ALTER TABLE search_history_timestamp_v5 RENAME TO search_history;
CREATE INDEX search_history_created_idx ON search_history(created_at);
PRAGMA defer_foreign_keys = OFF;
