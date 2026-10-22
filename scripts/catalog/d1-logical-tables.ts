// Logical application tables through0012; FTS/shadows are derived, not capture
// substitutes. Unknown future application tables require explicit review.
export const D1_RECOVERY_TABLES = ['products','product_slug_history','catalog_runs','catalog_run_items',
  'catalog_editorial_events','search_history','search_diagnostics','catalog_revisions','publication_receipts',
  'vector_sync_outbox','migration_imports','catalog_public_products','catalog_projection_receipts',
  'publication_outbox','semantic_search_budgets','catalog_build_requests','vector_delete_mutations',
  'catalog_mutation_scopes','catalog_maintenance_products','catalog_maintenance_operations',
  'catalog_maintenance_vector_payloads','catalog_vector_deliveries','catalog_run_telemetry','sqlite_sequence'].sort();
