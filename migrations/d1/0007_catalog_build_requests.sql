-- Pre-build coordination only: publication_receipts remains the publication authority.
CREATE TABLE IF NOT EXISTS catalog_build_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  source_revision TEXT NOT NULL REFERENCES catalog_revisions(revision),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','building','activating','resolved','failed')),
  lease_token TEXT,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  dispatch_reference TEXT,
  run_reference TEXT,
  release_id TEXT REFERENCES publication_outbox(release_id),
  version_reference TEXT,
  error_code TEXT CHECK (error_code IS NULL OR error_code IN
    ('build_failed','dispatch_unconfirmed','activation_not_applied')),
  CHECK ((state='building' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (state='activating' AND lease_token IS NOT NULL AND lease_until IS NULL
      AND run_reference IS NOT NULL AND release_id IS NOT NULL AND version_reference IS NOT NULL)
    OR (state IN ('pending','failed') AND lease_token IS NULL AND lease_until IS NULL)
    OR (state='resolved' AND lease_token IS NOT NULL AND lease_until IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_build_revision_owner ON catalog_build_requests(environment,source_revision)
  WHERE state='building';
CREATE UNIQUE INDEX IF NOT EXISTS catalog_build_activation_owner ON catalog_build_requests(environment) WHERE state='activating';
CREATE TRIGGER IF NOT EXISTS catalog_build_request_immutable
  BEFORE UPDATE OF request_id,environment,source_revision,request_json ON catalog_build_requests BEGIN
  SELECT RAISE(ABORT,'Build request is immutable');
END;
