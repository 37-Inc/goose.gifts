-- Keep pending/complete semantics; acceptance is not completion.
ALTER TABLE vector_sync_outbox ADD COLUMN lease_token TEXT;
ALTER TABLE vector_sync_outbox ADD COLUMN lease_until TEXT;
ALTER TABLE vector_sync_outbox ADD COLUMN mutation_reference TEXT;
ALTER TABLE vector_sync_outbox ADD COLUMN error_code TEXT CHECK (error_code IS NULL OR error_code IN
  ('payload_invalid','current_state_changed','provider_failed','not_visible','timeout','fenced'));
