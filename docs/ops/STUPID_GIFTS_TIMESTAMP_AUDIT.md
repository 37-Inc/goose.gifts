# Stupid Gifts migration timestamp and archive audit

Audit: October 20, 2026 UTC / October 19 Pacific. Read-only source/code audit;
no timestamp corrections, source writes, cutover or deletion. Code baseline
`37cc671`; relevant actual weekly writer receipt `1e9df021`.

## Immediate staging decision

The ten selected products' `availability_checked_at`, `last_verified_at` and
`updated_at` are the same SQL `NOW()` values, between
`2026-10-19 15:30:26.204256` and `2026-10-19 15:31:58.50259`. They fall inside
completed run `11928e5b-6199-4f8e-8e71-9a33192b33c0`, whose **timezone-aware**
receipt is `2026-10-19 15:29:22.57164+00` through
`2026-10-19 15:32:09.255346+00`. The protected export proves database session
`TimeZone=GMT`. For these exact rows and three columns, interpret raw wall
times as UTC and retain six fractional digits. Do not use the driver's `Date`
objects, which the root audit observed applying an additional seven hours.

`created_at` is different: the original schema and every reviewed insert path
use the database `now()` default, but that proves the **writer**, not every
historical session's timezone. `B0DCNB17CD` was created during the same October
19 run, so its creation time has the same UTC evidence. The other nine
creation times predate that run and retain **historical timezone unproven**
status until a historical configuration/receipt establishes it. Do not silently
upgrade a default or plausible schedule match into confirmed UTC provenance.
Preserve these exact raw values; do not invent a new creation instant. The
root-approved staging representation is a nullable typed `products.created_at`:
an explicit per-column `{timezone: 'unresolved', evidence: '...'}` maps only
that column to `NULL`, retaining its original text in `source_record_json`.
No other typed timestamp accepts this exception. All ten staging creation
values may be marked unresolved conservatively; a per-row known UTC decision
can retain the one verified creation instant. Full historical reconciliation
remains open. An operator-approved provisional interpretation must be labeled
separately from verified reconciliation.

Selected cohort IDs: `B000L70MQO`, `B07B4PP1BB`, `B09HT6ZC7K`, `B0BL16BRNH`,
`B0C7J5SMPK`, `B0CGXSKGXL`, `B0CYKK1167`, `B0DCNB17CD`, `B0F88FJ56K`,
`B0GSW1X3P4`. These are identity/timestamp evidence, not product or rights
approvals. The protected sample and complete export remain outside Git.

## Column decisions and source evidence

“Aware” means the actual exported type contains an offset; normalize that
instant directly. “SQL lane” means UTC only where the writer/session/run
evidence supports that row, not a blanket rule for naive columns.

| Runtime source column | Writer and history evidence | Decision |
| --- | --- | --- |
| `products.availability_checked_at` | Current `upsertProduct` uses SQL `NOW()` when remotely verified; unavailable transition also uses `NOW()` (`scripts/ops/prefetch-catalog.mjs:1195`, `:1520`). Introduced in `75ad5c0` / migration `0006`; that migration backfilled from `last_verified_at`. | Ten sample values verified UTC SQL lane. Preserve/review older rows individually; backfill is not an independent clock. |
| `products.last_verified_at` | SQL `NOW()` on insert/update in `upsertProduct` (`:1197`, `:1285`); same design already present in first prefetch writer `dc30d82` (July 1, 2026). | Ten sample values verified UTC SQL lane. Older writer uses SQL, but historical session timezone is not independently proved here. |
| `products.updated_at` | Current upsert/repair/deactivation/duplicate writers use `NOW()` (`:1286`, `:1378`, `:1506`, `:1907`). Retired bundle upserts used `updatedAt: new Date()` in `f603251` and still in `77a5a53^:lib/db/operations.ts`; removed with bundle retirement July 4. | **Mixed historical writer semantics.** Ten latest sample values are verified UTC SQL lane; never reinterpret all older rows as UTC. |
| `products.created_at` | `lib/db/migrations/0001_add_relational_products.sql:20` and `f603251:lib/db/schema.ts` set `timestamp DEFAULT now()`. Old bundle inserts in `f603251:lib/db/operations.ts:121` / `:483` omit creation time. Prefetch inserts omit it from `dc30d82` through actual writer `1e9df021` and current `upsertProduct`. | SQL-default provenance established. One October 19 sample creation verified UTC; nine older sample creation timezones unproven. |
| `product_slug_history.created_at` | Migration `0005_add_canonical_gift_pages.sql:56` has `timestamp DEFAULT now()`; preservation trigger inserts only slug/product ID (`:123`). Introduced `7487899`. | SQL default; zero exported rows, so no existing timestamp transformation needed. Require explicit UTC future writer/session policy. |
| `catalog_runs.started_at` | Actual type is `timestamp with time zone`. Writer SQL `NOW()` (`scripts/ops/catalog-telemetry.mjs:304`). Migration `0008` explicitly converted prior naive values `AT TIME ZONE 'UTC'`. | Aware: preserve/normalize exported absolute instant without local reinterpretation. |
| `catalog_runs.completed_at` | Actual type aware; completion writer SQL `NOW()` (`catalog-telemetry.mjs:320`); same `0008` conversion. | Aware, nullable: null stays null. |
| `catalog_run_items.created_at` | Actual type aware; batch writer omits time, database default `NOW()` (`catalog-telemetry.mjs:362`). Migration `0008` converted old naive values explicitly using UTC. | Aware: preserve/normalize exported instant. Preserve original sequence ordering. |
| `catalog_editorial_events.created_at` | Actual type naive/default `now()` in migration `0006_add_catalog_editorial_pipeline.sql:45`; `recordEditorialEvent` omits the time (`prefetch-catalog.mjs:1878`). | SQL default, but historical timezone not globally proved. Match known run evidence before canonical conversion. |
| `search_queries.created_at` | Actual type naive/default `now()` in migration `0002_add_search_queries.sql:12`. Current `app/api/search-products/route.ts:35` insert omits timestamp; original `f5a61dd` route used the same default pattern. | SQL default, historical timezone not globally proved. Keep raw history and archive references; do not infer UTC merely from current GMT. |

Additional aware receipt columns `catalog_runs.created_at` and `updated_at`
remain in the private lossless source record; their actual exported types are
aware and their current writers/defaults are SQL `NOW()`. The original
`0007` migration was naive; `c75ffa8` added the explicit `0008` UTC conversion,
and the actual export confirms that conversion's resulting types. This is
documented existing transformation history, not a new migration correction.

Do not canonicalize these raw-only fields as part of readiness:

- `products.editorial_generated_at`: generated/seeded JS `Date` is bound as
  `$27` (`prefetch-catalog.mjs:1315`; generation/seed paths assign `new Date()`).
  Migration `0006` also backfilled it from `updated_at`, which itself has mixed
  history. The root's October 19 sample has editorial local wall time near
  `08:31` while SQL availability is near `15:31`. Keep raw; no blanket UTC or
  permanent “minus seven hours” repair. DST/historical host provenance matters.
- `products.content_updated_at`: current SQL `NOW()`, but migration `0006`
  backfilled from mixed historical `updated_at`; preserve raw provenance.
- `products.last_clicked_at`: retired click writers included application
  `Date` values. Not a current freshness or creation authority.

The conversion primitive refuses naive time without explicit per-column UTC
evidence, rejects invalid calendars and normalized wall times such as `24:00`,
and retains microseconds. Current shape checks do not make a caller-supplied
timezone decision true. Keep raw values in protected `source_record_json`
and the source export even when a typed derivative is approved.

## Independently verified protected archive

Root-created export:
`~/.codex/private/goose-gifts-migration/export-2026-10-20-first`.
Manifest SHA-256:
`6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076`.
Snapshot `17673263:17673263:`, read-only repeatable read, observed
`2026-10-20 05:36:14.208301+00`, PostgreSQL 17.11, session GMT.

Independent local readback verified all 13 per-table file checksums and row
counts against that manifest. It decoded **3,383 product vectors** and **109
archived bundle vectors**, each at 1,536 dimensions, then reconstructed native
float32 bytes byte-for-byte. Total 3,492 vectors; 3,180 active product vectors
is a different cohort, not the protected export's total vector count. The
actual `vector_send` metadata is pgvector 0.8.0, public native sender, execute
permission present; its constant protocol probe matched
`000200003f800000c0200000`. No embeddings were regenerated.

This verifies archive bytes/readability, **not full PostgreSQL restoration**.
The current archive contains table column/default/constraint/index metadata
and sequence observations, but not complete extension/type/schema definitions,
functions/triggers/views, ownership/grants/RLS policies or inheritance DDL.
For example the maintained slug identity/history triggers in migration
`0005` need restoration coverage even though the current slug-history table is
empty. The local SQLite row-container test is not a PostgreSQL restore test.
No retirement/deletion gate is closed by this receipt.

## Read-only metadata checks for the source owner

These queries are proposed diagnostics, not executed by this audit. Keep the
result in the protected migration receipt; do not publish role/policy contents.
Use the source owner's existing HTTPS read-only transaction path.

```sql
-- Prove the exporter role can see all ordinary table rows and inventory
-- inheritance, RLS and object kinds without reading customer/query contents.
SELECT n.nspname AS schema_name, c.relname, c.relkind,
       c.relispartition, c.relhassubclass,
       c.relrowsecurity, c.relforcerowsecurity,
       row_security_active(c.oid) AS active_rls_for_export_role,
       has_table_privilege(c.oid, 'SELECT') AS can_select,
       EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid)
         AS inherits_from_parent
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND c.relkind IN ('r','p','f','v','m')
ORDER BY n.nspname,c.relname;

SELECT current_setting('TimeZone') AS session_timezone,
       current_setting('row_security') AS row_security,
       r.rolsuper, r.rolbypassrls
FROM pg_roles r WHERE r.rolname=current_user;

SELECT n.nspname AS schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
ORDER BY n.nspname,p.proname,arguments;

SELECT n.nspname AS schema_name,c.relname,t.tgname,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_'
ORDER BY n.nspname,c.relname,t.tgname;
```

Any active RLS, inaccessible table or ordinary inheritance requires explicit
coverage review. A regular `SELECT parent` includes inherited child rows;
that must not become duplicate data during restore. The exporter's current
`NOT LIKE 'pg_%'` filter also treats `_` as a wildcard; verify there is no user
schema named `pgX...` omitted by that filter. The actual inventoried schemas
were `public` and `drizzle`, but the broader check above remains a completeness
gate. Partitioned/foreign tables and over-budget responses intentionally fail
closed; no live multi-page fallback is enabled.
