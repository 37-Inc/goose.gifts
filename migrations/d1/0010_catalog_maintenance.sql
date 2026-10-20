-- Opt-in maintenance only; apply after0009. This does not select D1 as writer.
-- Historical records are archival evidence, never the editable current payload.
CREATE TRIGGER products_archive_immutable BEFORE UPDATE OF source_record_json ON products
WHEN OLD.source_record_json IS NOT NEW.source_record_json BEGIN
  SELECT RAISE(ABORT,'Historical product source is immutable');
END;
CREATE TRIGGER products_public_id_immutable BEFORE UPDATE OF public_id ON products
WHEN OLD.public_id IS NOT NEW.public_id BEGIN
  SELECT RAISE(ABORT,'Public identity is immutable');
END;
CREATE TRIGGER products_slug_history_reserved BEFORE INSERT ON products
WHEN EXISTS(SELECT 1 FROM product_slug_history WHERE slug=NEW.slug AND product_id<>NEW.id) BEGIN
  SELECT RAISE(ABORT,'Slug is reserved by history');
END;
-- Maintenance never renames a product. An explicit future rename protocol must
-- preserve aliases atomically rather than relying on an unguarded UPDATE.
CREATE TRIGGER products_maintenance_slug_immutable BEFORE UPDATE OF slug ON products
WHEN OLD.slug IS NOT NEW.slug BEGIN
  SELECT RAISE(ABORT,'Maintenance preserves existing slugs');
END;
CREATE TRIGGER product_slug_history_reserved BEFORE INSERT ON product_slug_history
WHEN EXISTS(SELECT 1 FROM products WHERE slug=NEW.slug AND id<>NEW.product_id) BEGIN
  SELECT RAISE(ABORT,'Slug is reserved by a current product');
END;

CREATE TABLE catalog_maintenance_products (
  product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id),
  version INTEGER NOT NULL CHECK(version>0),
  semantic_json TEXT NOT NULL CHECK(json_valid(semantic_json)),
  -- NULL means unknown, not absent: it must not cause bulk regeneration.
  embedding_present INTEGER CHECK(embedding_present IS NULL OR embedding_present IN(0,1)),
  embedding_native_base64 TEXT,
  embedding_provenance_json TEXT NOT NULL CHECK(json_valid(embedding_provenance_json)),
  CHECK(embedding_native_base64 IS NULL OR embedding_present=1)
);
CREATE TABLE catalog_maintenance_operations (
  operation_id TEXT PRIMARY KEY NOT NULL CHECK(length(operation_id)=64),
  input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
  run_id TEXT NOT NULL,
  catalog_revision TEXT NOT NULL,
  environment TEXT NOT NULL,
  index_name TEXT NOT NULL,
  generation INTEGER NOT NULL,
  prior_epoch INTEGER NOT NULL,
  next_epoch INTEGER NOT NULL CHECK(next_epoch=prior_epoch+1),
  database_time TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  changes_json TEXT NOT NULL CHECK(json_valid(changes_json))
);
CREATE TRIGGER catalog_maintenance_operations_immutable BEFORE UPDATE ON catalog_maintenance_operations BEGIN
  SELECT RAISE(ABORT,'Maintenance operation is immutable');
END;
CREATE TRIGGER catalog_maintenance_operations_retained BEFORE DELETE ON catalog_maintenance_operations BEGIN
  SELECT RAISE(ABORT,'Maintenance operation is retained');
END;
-- Retain payloads even when an entirely UNSENT event is superseded. The outbox
-- sequence is never reused; its operation ledger explains every replacement.
CREATE TABLE catalog_maintenance_vector_payloads (
  sequence INTEGER PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL REFERENCES catalog_maintenance_operations(operation_id) DEFERRABLE INITIALLY DEFERRED,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE TRIGGER catalog_maintenance_vector_payloads_immutable BEFORE UPDATE ON catalog_maintenance_vector_payloads BEGIN
  SELECT RAISE(ABORT,'Maintenance vector payload is immutable');
END;
CREATE TRIGGER catalog_maintenance_vector_payloads_retained BEFORE DELETE ON catalog_maintenance_vector_payloads BEGIN
  SELECT RAISE(ABORT,'Maintenance vector payload is retained');
END;
