-- Staging-first runtime catalog. Private operational evidence is not a public artifact.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('amazon', 'etsy')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  quality_score REAL CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 1),
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
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
  -- Historical creation wall times may have unresolved writer/session timezone.
  -- NULL is truthful; the exact original remains in private source_record_json.
  created_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS products_active_quality_idx ON products(is_active, quality_score);
CREATE INDEX IF NOT EXISTS products_expiry_idx ON products(eligible_until);
CREATE INDEX IF NOT EXISTS products_duplicate_idx ON products(duplicate_of_product_id);

CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  title, description, tags, content='products', content_rowid='rowid', tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid,title,description,tags) VALUES(new.rowid,new.title,new.description,new.tags);
END;
CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts,rowid,title,description,tags) VALUES('delete',old.rowid,old.title,old.description,old.tags);
END;
CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts,rowid,title,description,tags) VALUES('delete',old.rowid,old.title,old.description,old.tags);
  INSERT INTO products_fts(rowid,title,description,tags) VALUES(new.rowid,new.title,new.description,new.tags);
END;

CREATE TABLE IF NOT EXISTS product_slug_history (
  slug TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  created_at TEXT NOT NULL,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json))
);
CREATE INDEX IF NOT EXISTS product_slug_history_product_idx ON product_slug_history(product_id);

CREATE TABLE IF NOT EXISTS catalog_runs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  dry_run INTEGER NOT NULL CHECK (dry_run IN (0,1)),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json))
);
CREATE INDEX IF NOT EXISTS catalog_runs_started_idx ON catalog_runs(started_at);
CREATE TABLE IF NOT EXISTS catalog_run_items (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL REFERENCES catalog_runs(id),
  product_id TEXT,
  external_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  requires_manual_review INTEGER NOT NULL CHECK (requires_manual_review IN (0,1)),
  created_at TEXT NOT NULL,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json))
);
CREATE INDEX IF NOT EXISTS catalog_run_items_run_idx ON catalog_run_items(run_id,sequence);
CREATE INDEX IF NOT EXISTS catalog_run_items_review_idx ON catalog_run_items(requires_manual_review,sequence);
CREATE TABLE IF NOT EXISTS catalog_editorial_events (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json))
);
CREATE INDEX IF NOT EXISTS catalog_editorial_events_product_idx ON catalog_editorial_events(product_id,created_at);

-- Historical bundle identifiers intentionally have no runtime FK to retired tables.
CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  legacy_bundle_id TEXT,
  legacy_bundle_slug TEXT,
  archive_reference TEXT,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json)),
  CHECK (legacy_bundle_id IS NULL OR archive_reference IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS search_history_created_idx ON search_history(created_at);
CREATE TABLE IF NOT EXISTS search_diagnostics (
  id TEXT PRIMARY KEY NOT NULL,
  query_hash TEXT NOT NULL CHECK (length(query_hash)=64),
  query_length INTEGER NOT NULL CHECK (query_length BETWEEN 2 AND 200),
  result_count INTEGER NOT NULL CHECK (result_count BETWEEN 0 AND 60),
  top_similarity REAL,
  match_type TEXT NOT NULL CHECK (match_type IN ('semantic','keyword','none')),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','empty','unavailable')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_diagnostics_expiry_idx ON search_diagnostics(expires_at);

CREATE TABLE IF NOT EXISTS catalog_revisions (
  revision TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  source_export_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('importing','reconciled','published'))
);
CREATE TABLE IF NOT EXISTS publication_receipts (
  release_id TEXT PRIMARY KEY NOT NULL,
  catalog_revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  code_sha TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json))
);
CREATE TABLE IF NOT EXISTS vector_sync_outbox (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  embedding_text_hash TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (public_id,source_revision,operation)
);
CREATE INDEX IF NOT EXISTS vector_sync_outbox_pending_idx ON vector_sync_outbox(status,sequence);

CREATE TABLE IF NOT EXISTS migration_imports (
  export_sha256 TEXT NOT NULL,
  table_name TEXT NOT NULL,
  batch_number INTEGER NOT NULL,
  batch_sha256 TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (export_sha256,table_name,batch_number)
);
