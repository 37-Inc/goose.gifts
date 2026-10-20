-- Evidence journal only. catalog_mutation_scopes remains the ONLY ownership gate.
-- Install/enable only behind the reviewed stop-old/manual-writers barrier.
CREATE TABLE catalog_vector_deliveries (
  delivery_id TEXT PRIMARY KEY NOT NULL CHECK(length(delivery_id)=64),
  environment TEXT NOT NULL,
  index_name TEXT NOT NULL,
  generation INTEGER NOT NULL,
  prior_epoch INTEGER NOT NULL,
  owner_json TEXT NOT NULL CHECK(json_valid(owner_json)),
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  product_json TEXT NOT NULL CHECK(json_valid(product_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','complete')),
  disposition TEXT CHECK(disposition IN('verified','expired','expired_unsubmitted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  dispatch_token TEXT,
  mutation_reference TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  completed_at TEXT,
  CHECK((status='pending' AND completed_at IS NULL AND disposition IS NULL) OR
    (status='complete' AND completed_at IS NOT NULL AND disposition IS NOT NULL)),
  CHECK(mutation_reference IS NULL OR dispatch_token IS NOT NULL),
  UNIQUE(environment,index_name,generation,prior_epoch)
);
CREATE TRIGGER catalog_vector_delivery_identity_immutable BEFORE UPDATE OF
  delivery_id,environment,index_name,generation,prior_epoch,owner_json,request_json,product_json
  ON catalog_vector_deliveries BEGIN
  SELECT RAISE(ABORT,'Vector delivery identity is immutable');
END;
CREATE TRIGGER catalog_vector_delivery_complete_immutable BEFORE UPDATE ON catalog_vector_deliveries
WHEN OLD.status='complete' BEGIN
  SELECT RAISE(ABORT,'Completed vector evidence is immutable');
END;
CREATE TRIGGER catalog_vector_delivery_retained BEFORE DELETE ON catalog_vector_deliveries BEGIN
  SELECT RAISE(ABORT,'Vector delivery evidence is retained');
END;
-- Retain the original importing revision/projections/receipt, but allow an
-- explicit owned abandonment after settled expiry to unblock a NEW revision.
-- This marker never makes an importing revision reconciled or publishable.
ALTER TABLE catalog_revisions ADD COLUMN abandonment_delivery_id TEXT
  REFERENCES catalog_vector_deliveries(delivery_id);
ALTER TABLE catalog_revisions ADD COLUMN abandonment_epoch INTEGER
  CHECK(abandonment_epoch IS NULL OR abandonment_epoch>0);
