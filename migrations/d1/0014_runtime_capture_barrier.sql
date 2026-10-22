-- Database enforcement also covers SQL already in flight from an old Worker.
-- Idle traffic is unchanged. This does not stop privileged/out-of-band writers.
CREATE TRIGGER search_diagnostics_capture_insert BEFORE INSERT ON search_diagnostics
WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE phase!='idle') BEGIN
  SELECT RAISE(ABORT,'catalog_runtime_owned');
END;
CREATE TRIGGER search_diagnostics_capture_update BEFORE UPDATE ON search_diagnostics
WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE phase!='idle') BEGIN
  SELECT RAISE(ABORT,'catalog_runtime_owned');
END;
CREATE TRIGGER search_diagnostics_capture_delete BEFORE DELETE ON search_diagnostics
WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE phase!='idle') BEGIN
  SELECT RAISE(ABORT,'catalog_runtime_owned');
END;
CREATE TRIGGER semantic_search_budgets_capture_insert BEFORE INSERT ON semantic_search_budgets
WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE phase!='idle') BEGIN
  SELECT RAISE(ABORT,'catalog_runtime_owned');
END;
CREATE TRIGGER semantic_search_budgets_capture_update BEFORE UPDATE ON semantic_search_budgets
WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE phase!='idle') BEGIN
  SELECT RAISE(ABORT,'catalog_runtime_owned');
END;
CREATE TRIGGER semantic_search_budgets_capture_delete BEFORE DELETE ON semantic_search_budgets
WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE phase!='idle') BEGIN
  SELECT RAISE(ABORT,'catalog_runtime_owned');
END;
