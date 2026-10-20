-- Empty means compatibility-off. Root enables one exact environment/index only
-- after stopping every old/manual writer; this is not a provider permission ACL.
CREATE TABLE catalog_mutation_scopes (
  environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
  index_name TEXT NOT NULL CHECK(length(index_name) BETWEEN 1 AND 100),
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
  mutation_epoch INTEGER NOT NULL DEFAULT 0 CHECK(mutation_epoch>=0),
  phase TEXT NOT NULL DEFAULT 'idle' CHECK(phase IN ('idle','writing','freezing','activating')),
  owner_token TEXT,
  owner_reference TEXT,
  operation_key TEXT,
  captured_at TEXT,
  external_pending INTEGER NOT NULL DEFAULT 0 CHECK(external_pending IN (0,1)),
  activation_request_id TEXT REFERENCES catalog_build_requests(request_id),
  PRIMARY KEY(environment,index_name),
  CHECK((phase='idle' AND owner_token IS NULL AND owner_reference IS NULL AND operation_key IS NULL
      AND captured_at IS NULL AND external_pending=0 AND activation_request_id IS NULL)
    OR (phase!='idle' AND owner_token IS NOT NULL AND owner_reference IS NOT NULL
      AND operation_key IS NOT NULL AND captured_at IS NOT NULL
      AND (phase!='activating' OR activation_request_id IS NOT NULL)))
);
