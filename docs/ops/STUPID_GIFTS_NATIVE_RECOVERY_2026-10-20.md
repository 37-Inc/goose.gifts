# Native archive recovery — October 20, 2026 UTC

Passed: all archived data restored into original PostgreSQL column types and
native `vector(1536)`, with the recorded table/default/constraint/index and
application-function/trigger definitions. **Not a full cluster/schema/grant
recovery or permission to cut over.** No source/provider call or write occurred.

## Evidence

- Source export manifest SHA-256:
  `6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076`.
  Protected archive:
  `~/.codex/private/goose-gifts-migration/export-2026-10-20-first`.
- Supplemental metadata receipt:
  `~/.codex/private/goose-gifts-migration/source-metadata-audit.json`, SHA-256
  `78007cbe3a28572373e35a1652fcc6989330d7d266e0b307bba0904248c61b31`.
- Final run completed `2026-10-20T06:27:41.764Z`. Protected receipt:
  `~/.codex/private/goose-gifts-migration/recovery-native-pg17-T9TYHf/receipt.json`,
  SHA-256 `8039dac70cd787b0d43459c288d9f66d02ec4e764455cf50f44021b2b53ff44b`.
  Mode `0600` in its private `0700` run directory; implementation-file hashes
  are recorded, and the native implementation matches the committed bytes.
- Root repeated the complete drill after integration at
  `2026-10-20T06:33:50.483Z`, including the newer import-helper source:
  `~/.codex/private/goose-gifts-migration/recovery-native-pg17-hsCHd4/receipt.json`,
  SHA-256 `0a2e5608e64efcf5ca4c778dd192b030cc0d9d0cdd0c4012b1ff146608912bb4`.
  All recorded implementation-file hashes match the integrated source; the same
  data/schema checks passed and owned resources were removed. The four-test
  synthetic native fixture also passed independently.
- All **13 tables / 11,921 rows / 40,692,109 archive bytes** reconciled.
  Per-table original NDJSON and canonical field hashes matched native SQL
  readback. This includes the private/retired tables, restored locally only;
  they were not added to runtime D1.
- All **3,492 vectors** (3,383 products + 109 archived bundles) preserved their
  original 1,536 float32 values **bit-for-bit**. PostgreSQL binary COPY received
  the original `vector_send` payload directly, and native `vector_send` readback
  matched. No decimal-vector reconstruction or new embeddings were used.
- **165 columns**, original nullability/default expressions, **21 constraints**,
  **61 index definitions** (including HNSW/GIN), **two function definitions**,
  **two trigger definitions**, and **two observed sequence configurations and
  last-value observations** matched the protected metadata.
- Local server: PostgreSQL **17.6**, pgvector **0.8.0**. Source: PostgreSQL
  **17.11**, pgvector **0.8.0**. Matching major/extension versions does not prove
  identical minor-version behavior.
- Used only the maintainer's pinned ARM64 image
  `pgvector/pgvector@sha256:09c8aaae717baf4412f6efd174f51172c0638720a72a86e804cd698197fc8ba2`.
  The image origin/version pattern is documented in the
  [pgvector 0.8.0 Docker instructions](https://github.com/pgvector/pgvector/blob/v0.8.0/README.md#docker).
  The tag's ARM64 manifest was independently inspected before pulling.

Each run creates its own uniquely labeled container and new volume. Docker must
use a local Unix endpoint; the container has `network=none`, no published ports,
empty `listen_addresses`, bounded CPU/memory, and only its own data volume.
There are **no host bind mounts**: no archive directory, HOME, or Docker socket
is exposed to PostgreSQL. Protected data travels through stdin. Local raw JSON
staging preserves original source bytes separately from typed restored tables.
Only that run's labeled container/volume is stopped/removed; receipt and private
diagnostics remain outside Git. The pulled image stays cached. No existing
container, volume, database, host extension or service is changed.
The final receipt reports successful cleanup, and an independent label-filtered
readback found zero remaining owned containers or volumes. Diagnostic collection
is best-effort and cannot skip resource cleanup. Readiness requires the final
PID1 PostgreSQL process, not the image's temporary initialization server.

## Reproduce safely

Use Node 22. Review both pinned checksums and any changed DDL before executing.
The restore deliberately accepts no DSN, existing container/volume name, image
override, or remote Docker endpoint.

```sh
docker pull pgvector/pgvector@sha256:09c8aaae717baf4412f6efd174f51172c0638720a72a86e804cd698197fc8ba2
node --experimental-strip-types scripts/catalog/recovery-native.ts \
  --archive /Users/cameronehrlich/.codex/private/goose-gifts-migration/export-2026-10-20-first \
  --manifest-sha 6ad587730009580ca55d18a4ea136222b2070b03b80efebb33838f11cfb41076 \
  --audit /Users/cameronehrlich/.codex/private/goose-gifts-migration/source-metadata-audit.json \
  --audit-sha 78007cbe3a28572373e35a1652fcc6989330d7d266e0b307bba0904248c61b31 \
  --work-parent /Users/cameronehrlich/.codex/private/goose-gifts-migration \
  --run-native-drill
```

The archive is validated offline first. The restore allowlists the observed
schemas/types/default forms and supported index methods; the supplementary
receipt must show complete visible ordinary tables, no RLS/inheritance, the
expected extensions, and the two reviewed PL/pgSQL trigger functions. Original
types retain naive versus zoned timestamps, microseconds, money scale, arrays,
JSONB, booleans, text and NULL without application-level normalization.

Tests: `tests/catalog-recovery-native.test.mjs` covers binary COPY framing,
negative zero/subnormal float32 values, exact/native types, unsafe metadata
refusal, and a disposable native fixture. The fixture is opt-in with
`CATALOG_RECOVERY_TEST_NATIVE=1` after pulling the pinned image. All **51**
catalog/migration/recovery/parity tests passed with both local PostgreSQL fixture
modes enabled; scoped TypeScript (ES2022) and ESLint passed.

## Explicit remaining gates

- No full ownership/privilege/DDL dump was captured. Owners, grants/default
  privileges, database/role settings, collations, storage options, comments and
  extension ownership remain unverified. Database-local type OIDs are not
  reproduced. This is recorded schema reconstruction, not a complete pg_dump.
- Source `is_called`, sequence ownership and exact next-call state were not
  captured. Sequence `last_value` is nontransactional. Restored configurations
  and observed high-water values match, but an exact next-call assertion would
  be invented.
- Trigger enabled/replica/always modes were not captured. Recorded DDL is
  restored with normal enabled defaults; original execution mode and complete
  application behavior are not proven merely by matching definitions.
- The metadata audit was observed after the data snapshot. Reconcile both at
  the final writer barrier, including schema changes and new source data.
- Typed restoration preserves raw naive timestamps; it does not establish
  unknown historical timezone provenance or close the timestamp audit.
- Full-catalog search acceptance, writer migration, post-cutover D1 delta
  recovery, rollback after new writes, cutover and provider retirement remain
  independent gates. The earlier [raw PG14 proof](STUPID_GIFTS_RECOVERY_DRILL_2026-10-20.md)
  remains a separate, narrower recovery receipt.
