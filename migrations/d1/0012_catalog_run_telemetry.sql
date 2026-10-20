-- Explicit opt-in run accounting, not a runner/schedule activation. Historical
-- source JSON remains byte-recoverable; only current typed status/time changes.
CREATE TABLE catalog_run_telemetry (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES catalog_runs(id),
  start_json TEXT NOT NULL CHECK(json_valid(start_json)),
  finish_json TEXT CHECK(finish_json IS NULL OR json_valid(finish_json))
);
CREATE TRIGGER catalog_run_telemetry_immutable BEFORE UPDATE ON catalog_run_telemetry
WHEN OLD.start_json IS NOT NEW.start_json OR OLD.run_id IS NOT NEW.run_id OR OLD.finish_json IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'Run telemetry is already finalized');
END;
CREATE TRIGGER catalog_runs_source_retained BEFORE UPDATE OF source_record_json ON catalog_runs
WHEN OLD.source_record_json IS NOT NEW.source_record_json BEGIN
  SELECT RAISE(ABORT,'Historical run source is immutable');
END;
CREATE TRIGGER catalog_run_items_source_retained BEFORE UPDATE ON catalog_run_items BEGIN
  SELECT RAISE(ABORT,'Run items are append-only');
END;
CREATE TRIGGER catalog_run_telemetry_retained BEFORE DELETE ON catalog_run_telemetry BEGIN
  SELECT RAISE(ABORT,'Run telemetry is retained');
END;
CREATE TRIGGER catalog_runs_retained BEFORE DELETE ON catalog_runs BEGIN
  SELECT RAISE(ABORT,'Historical runs are retained');
END;
CREATE TRIGGER catalog_run_items_retained BEFORE DELETE ON catalog_run_items BEGIN
  SELECT RAISE(ABORT,'Run items are retained');
END;
