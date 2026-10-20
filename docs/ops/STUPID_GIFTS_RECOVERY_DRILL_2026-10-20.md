# Protected raw archive recovery drill — October 20, 2026 UTC

**Passed: raw archive data restoration into a fresh local PostgreSQL 14.19
cluster. Not proved: original typed-vector/full PostgreSQL schema recovery.**
No existing database/container, provider setting or source data was changed.

## Evidence

The final drill completed at `2026-10-20T05:57:17.825Z`.

- Source export: `~/.codex/private/goose-gifts-migration/export-2026-10-20-first`.
  Manifest SHA-256:
  `6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076`.
- Private final receipt:
  `~/.codex/private/goose-gifts-migration/recovery-pg14-jenjlR/receipt.json`.
  SHA-256:
  `dfc307e388c0205ff26dfc92a9ce40de947db3880ce662ab5e52eb0b1bafc491`.
  File mode `0600`; parent `0700`. Receipt includes implementation-file
  checksums, actual server socket settings and per-table reconciliation hashes.
- Restored all **13 tables / 11,921 rows / 40,692,109 source bytes**, including
  retired history. Every raw table NDJSON checksum matched after PostgreSQL
  readback; every reconstructed field/null/boolean value matched its canonical
  row hash. No timestamp or money normalization was performed.
- All **3,492 vectors** (3,383 products + 109 archived bundles) retained their
  native 1,536-float32 payloads in `BYTEA`; decoding/re-encoding and database
  readback preserved the exact native bytes. No embeddings were regenerated.
- Offline data-level validation checked **21 declared primary/unique/foreign
  key relationships**, plus product ID/public UUID/slug uniqueness. These are
  data checks, not a claim that original database constraints were installed.
- Server reported an empty `listen_addresses` and its own fresh private Unix
  socket. The server was stopped, and only this drill's newly created `pgdata`
  and socket directory were removed. Receipt/logs remain protected. No TCP
  port or existing PostgreSQL service was used; no Docker container was changed.

| Source table | Restored rows | Native vectors |
| --- | ---: | ---: |
| `drizzle.__drizzle_migrations` | 0 | 0 |
| `public.admin_actions` | 22 | 0 |
| `public.catalog_editorial_events` | 601 | 0 |
| `public.catalog_run_items` | 3,750 | 0 |
| `public.catalog_runs` | 17 | 0 |
| `public.error_logs` | 0 | 0 |
| `public.gift_bundles` | 114 | 109 |
| `public.gift_idea_products` | 3,259 | 0 |
| `public.gift_ideas` | 327 | 0 |
| `public.product_clicks` | 108 | 0 |
| `public.product_slug_history` | 0 | 0 |
| `public.products` | 3,383 | 3,383 |
| `public.search_queries` | 340 | 0 |

The source owner's separate read-only repeatable-read metadata receipt is
`~/.codex/private/goose-gifts-migration/source-metadata-audit.json`, SHA-256
`78007cbe3a28572373e35a1652fcc6989330d7d266e0b307bba0904248c61b31`.
Independent local readback confirms 13 tables, zero inaccessible tables,
zero active RLS, zero inheritance/partition/nonordinary tables, two
non-extension function definitions, two trigger definitions and zero policies.
That closes the **actual source visibility/inheritance** concern for this
audit; it is explicitly not a full schema/grant dump. This metadata read is
separate from the earlier data snapshot and must be reconciled again at the
final writer barrier if schema changes occur.

## Reusable procedure

Use Node 22. Recheck the recorded source manifest checksum, protected paths and
available PostgreSQL binary version before a future run. Never substitute a
production DSN; this tool deliberately accepts none.

Offline validation only (default; no database/process creation):

```sh
node --experimental-strip-types scripts/catalog/recovery-drill.ts \
  --archive /Users/cameronehrlich/.codex/private/goose-gifts-migration/export-2026-10-20-first \
  --manifest-sha 6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076
```

Explicit isolated local raw-data drill, using the already installed binaries:

```sh
node --experimental-strip-types scripts/catalog/recovery-drill.ts \
  --archive /Users/cameronehrlich/.codex/private/goose-gifts-migration/export-2026-10-20-first \
  --manifest-sha 6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076 \
  --work-parent /Users/cameronehrlich/.codex/private/goose-gifts-migration \
  --pg-bin /opt/homebrew/Cellar/postgresql@14/14.19/bin \
  --run-local-drill
```

The tool verifies externally pinned manifest/file checksums, permissions,
bounded sizes, complete fields/encodings/nullability, original identities,
native vector payloads and archive references before database creation. Each
run creates a new private cluster, disables TCP, rejects host authentication,
and sets explicit socket/user/database arguments rather than inheriting any
`PG*` connection environment. It restores server-text values as `TEXT`, native
booleans as `BOOLEAN`, native vector payloads as `BYTEA`, and the exact original
row JSON alongside them. It never executes manifest SQL definitions or source
defaults/triggers. Only its fresh cluster is stopped/removed. On cleanup
failure it preserves the cluster instead of deleting a running database;
inspect that run's protected receipt/logs and stop only its recorded data path.

Tests: `tests/catalog-recovery.test.mjs` covers tampering, broken archive
references, malformed vectors, invalid encodings/fields, private permissions,
symlinks, empty tables, exact escaping/Unicode and an opt-in fresh PostgreSQL
fixture. All six passed locally with
`CATALOG_RECOVERY_TEST_PG_BIN=/opt/homebrew/Cellar/postgresql@14/14.19/bin`.
Scoped TypeScript and ESLint checks passed.

## Remaining full recovery gate

The source uses PostgreSQL 17.11 / pgvector 0.8.0. Local default server binaries
are PostgreSQL 14.19; installed pgvector libraries target PostgreSQL 17/18,
not 14. The existing cached Docker PostgreSQL 16 image has no reviewed native
pgvector installation. No image pull, build or host extension install was
performed for this drill.

Before calling a full recovery rehearsal complete:

1. Use a **new isolated** PostgreSQL 17 + reviewed compatible pgvector instance;
   do not attach existing volumes/databases or expose a public port.
2. Obtain/review complete source DDL and dependencies: original types/domains,
   extension versions, defaults/identity/sequence ownership, constraints and
   indexes, schemas/collations, owners/grants, functions/triggers and relevant
   database/session settings. The extra metadata receipt now supplies the two
   actual application functions/triggers and confirms no active source RLS,
   but does not supply a complete ownership/privilege/DDL backup.
3. Restore original typed columns and native `vector` values, preserving native
   float32 payloads; compare every source identity/raw value/sequence/null and
   vector-byte checksum. Test original FK/unique/default/trigger behavior and
   remaining maintained consumers, not just counts.
4. Reconcile final source changes at the write barrier and exercise recovery
   of **post-cutover D1 deltas** before re-enabling any old writer. Restoring
   this older snapshot alone is not rollback after new D1 writes.

This receipt advances launch-spec Stage 2's archived-data restoration evidence.
It does not close full schema recovery, native vector behavior, historical
timestamp reconciliation, D1 delta rollback, cutover or provider retirement.
