-- An unknown historical embedding input is not a fabricated hash or text.
-- A reviewed DELETE instead binds an immutable current-row/revision receipt.
-- Apply after 0001–0007 as one atomic batch; no live activation is implied.
CREATE TABLE vector_delete_mutations (
  mutation_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(mutation_sha256)=64),
  public_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  mutation_json TEXT NOT NULL CHECK(json_valid(mutation_json))
);
CREATE TRIGGER vector_delete_mutations_immutable BEFORE UPDATE ON vector_delete_mutations BEGIN
  SELECT RAISE(ABORT,'Vector delete review is immutable');
END;
CREATE TRIGGER vector_delete_mutations_retained BEFORE DELETE ON vector_delete_mutations BEGIN
  SELECT RAISE(ABORT,'Vector delete review is retained');
END;

-- Preserve the high-water mark even if the highest historical row was removed.
CREATE TABLE vector_sequence_v8 AS SELECT coalesce((SELECT seq FROM sqlite_sequence
  WHERE name='vector_sync_outbox'),0) AS sequence;
CREATE TABLE vector_sync_outbox_v8 (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  embedding_text_hash TEXT,
  operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  lease_token TEXT,
  lease_until TEXT,
  mutation_reference TEXT,
  error_code TEXT CHECK(error_code IS NULL OR error_code IN
    ('payload_invalid','current_state_changed','provider_failed','not_visible','timeout','fenced')),
  delete_mutation_sha256 TEXT REFERENCES vector_delete_mutations(mutation_sha256),
  CHECK((embedding_text_hash IS NOT NULL AND delete_mutation_sha256 IS NULL)
    OR (operation='delete' AND embedding_text_hash IS NULL AND delete_mutation_sha256 IS NOT NULL)),
  UNIQUE(public_id,source_revision,operation)
);
INSERT INTO vector_sync_outbox_v8(sequence,public_id,source_revision,embedding_text_hash,operation,status,
  attempts,created_at,completed_at,lease_token,lease_until,mutation_reference,error_code)
SELECT sequence,public_id,source_revision,embedding_text_hash,operation,status,attempts,created_at,
  completed_at,lease_token,lease_until,mutation_reference,error_code FROM vector_sync_outbox;
DROP TABLE vector_sync_outbox;
ALTER TABLE vector_sync_outbox_v8 RENAME TO vector_sync_outbox;
UPDATE sqlite_sequence SET seq=max(seq,(SELECT sequence FROM vector_sequence_v8)) WHERE name='vector_sync_outbox';
INSERT INTO sqlite_sequence(name,seq) SELECT 'vector_sync_outbox',sequence FROM vector_sequence_v8
  WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='vector_sync_outbox');
DROP TABLE vector_sequence_v8;
CREATE INDEX vector_sync_outbox_pending_idx ON vector_sync_outbox(status,sequence);
CREATE TRIGGER vector_delete_outbox_review BEFORE INSERT ON vector_sync_outbox
WHEN NEW.delete_mutation_sha256 IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM vector_delete_mutations r
    WHERE r.mutation_sha256=NEW.delete_mutation_sha256 AND r.public_id=NEW.public_id
      AND r.source_revision=NEW.source_revision) THEN RAISE(ABORT,'Vector delete review mismatch') END;
END;
CREATE TRIGGER vector_delete_outbox_immutable BEFORE UPDATE ON vector_sync_outbox
WHEN OLD.delete_mutation_sha256 IS NOT NULL AND
  (OLD.public_id IS NOT NEW.public_id OR OLD.source_revision IS NOT NEW.source_revision
   OR OLD.operation IS NOT NEW.operation OR OLD.embedding_text_hash IS NOT NEW.embedding_text_hash
   OR OLD.delete_mutation_sha256 IS NOT NEW.delete_mutation_sha256 OR OLD.created_at IS NOT NEW.created_at) BEGIN
  SELECT RAISE(ABORT,'Vector delete identity is immutable');
END;
