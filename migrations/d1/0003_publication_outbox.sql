-- Dispatch state only. Existing revision/projection/publication receipts remain authoritative.
CREATE TABLE IF NOT EXISTS publication_outbox (
  intent_id TEXT PRIMARY KEY NOT NULL,
  release_id TEXT NOT NULL UNIQUE,
  catalog_revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  intent_json TEXT NOT NULL CHECK (json_valid(intent_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','claimed','dispatched','failed','verified')),
  lease_token TEXT,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts>=0),
  dispatch_reference TEXT,
  completed_token TEXT,
  error_code TEXT CHECK (error_code IS NULL OR error_code='dispatch_failed'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((state IN ('claimed','dispatched') AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (state NOT IN ('claimed','dispatched') AND lease_token IS NULL AND lease_until IS NULL))
);
-- One active owner per revision, even for different code releases of that catalog.
CREATE UNIQUE INDEX IF NOT EXISTS publication_revision_lease ON publication_outbox(catalog_revision)
  WHERE state IN ('claimed','dispatched');
CREATE INDEX IF NOT EXISTS vector_sync_revision_watermark ON vector_sync_outbox(source_revision,sequence,status);
CREATE TRIGGER IF NOT EXISTS publication_intent_immutable
  BEFORE UPDATE OF intent_id,release_id,catalog_revision,intent_json,created_at ON publication_outbox BEGIN
  SELECT RAISE(ABORT,'Publication intent is immutable');
END;
