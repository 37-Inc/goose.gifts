-- Additive technical audit only: normal attempts remain CHECKed/capped at3.
-- Existing24 logical tables/rows/FKs are preserved; captures discover this
-- nullable column dynamically. One recorded operator attempt cannot be erased.
ALTER TABLE catalog_build_requests ADD COLUMN operator_recovery_json TEXT
  CHECK(operator_recovery_json IS NULL OR json_valid(operator_recovery_json));
CREATE TRIGGER catalog_build_operator_recovery_immutable
  BEFORE UPDATE OF operator_recovery_json ON catalog_build_requests
  WHEN OLD.operator_recovery_json IS NOT NULL AND NEW.operator_recovery_json IS NOT OLD.operator_recovery_json BEGIN
  SELECT RAISE(ABORT,'Build operator recovery is immutable');
END;
CREATE TRIGGER catalog_build_operator_recovery_no_delete
  BEFORE DELETE ON catalog_build_requests WHEN OLD.operator_recovery_json IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'Build operator recovery is immutable');
END;
