import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, stat, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { assertProtectedDestination, collectConsistentExport, loadNeonHttpFactory, resolveNeonFactory,
  tableExportSql, writeProtectedExport } from '../scripts/catalog/export-postgres.ts';
import { sha256 } from '../scripts/catalog/migration.ts';

const tables = [{ schema: 'public', name: 'products', kind: 'r', partition: false,
  columns: [{ name: 'id', type: 'text', nullable: false, default: null }, { name: 'price', type: 'numeric(10,2)', nullable: true, default: null },
    { name: 'created_at', type: 'timestamp without time zone', nullable: true, default: 'now()' }],
  constraints: [{ name: 'products_pkey', definition: 'PRIMARY KEY (id)' }], indexes: [] },
  { schema: 'public', name: 'gift_bundles', kind: 'r', partition: false,
    columns: [{ name: 'id', type: 'uuid', nullable: false, default: null }], constraints: [], indexes: [] }];
const dataRows = [[{ row: '{"id":"TEST-ONLY","price":"19.99","created_at":"2026-10-19 15:31:58.50259"}' }],
  [{ row: '{"id":"00000000-0000-4000-8000-000000000001"}' }]];

test('HTTPS factory resolves named/default module shapes and the actual installed Vercel dependency without a source read', async () => {
  const sentinel = () => {};
  assert.equal(resolveNeonFactory({ neon: sentinel }), sentinel);
  assert.equal(resolveNeonFactory({ default: { neon: sentinel } }), sentinel);
  assert.throws(() => resolveNeonFactory({ default: {} }), /does not export neon/);
  const neon = await loadNeonHttpFactory();
  assert.equal(typeof neon, 'function');
  // Construction is local; no query is created/awaited and no network call occurs.
  const sql = neon('postgresql://test:unused@fixture-test-only.neon.tech/test');
  assert.equal(typeof sql, 'function');
  assert.equal(typeof sql.transaction, 'function');
});
function source({ settings = { isolation: 'repeatable read', readOnly: 'on', snapshot: '1:2:', timezone: 'GMT' }, actual = tables } = {}) {
  const stats = dataRows.map((rows) => [{ row_count: String(rows.length),
    wire_bytes: String(rows.reduce((sum, value) => sum + Buffer.byteLength(JSON.stringify(value.row)) + 32, 0)) }]);
  return { async query() { return [{ inventory: JSON.stringify(tables) }]; },
    async transaction(queries, options) {
      assert.equal(options.isolationLevel, 'RepeatableRead'); assert.equal(options.readOnly, true);
      if (queries.length === 2) return stats;
      assert.equal(queries.length, 8); assert.ok(queries.every((query) => /^(SELECT|WITH)/.test(query)));
      return [[{ settings: JSON.stringify(settings) }], [{ inventory: JSON.stringify(actual) }], [{ sequences: '[]' }],
        ...stats, ...dataRows, [{ inventory: JSON.stringify(actual) }]];
    } };
}

test('export uses one proven repeatable-read read-only transaction and retains typed source text', async () => {
  const result = await collectConsistentExport(source());
  assert.equal(result.tables.length, 2);
  assert.equal(result.tables[0].count, 1);
  const row = JSON.parse(result.tables[0].data);
  assert.equal(row.price, '19.99'); assert.equal(row.created_at, '2026-10-19 15:31:58.50259');
  const sql = tableExportSql(tables[0]);
  assert.match(sql, /"price"::text/); assert.match(sql, /"created_at"::text/);
  assert.match(sql, /ORDER BY row COLLATE "C"/);
});

test('unsupported snapshots, schema races and partitioned data are rejected, never silently paged', async () => {
  await assert.rejects(collectConsistentExport({ async query() { return []; } }), /transactions are required/);
  await assert.rejects(collectConsistentExport(source({ settings: { isolation: 'read committed', readOnly: 'on', snapshot: 'x' } })), /did not prove/);
  await assert.rejects(collectConsistentExport(source({ actual: tables.slice(0, 1) })), /schema changed/);
  assert.throws(() => tableExportSql({ ...tables[0], partition: true }), /refusing incomplete/);
  assert.throws(() => tableExportSql({ ...tables[0], kind: 'f' }), /refusing incomplete/);
});

test('wire size preflight refuses before row transfer when the documented HTTPS bound is exceeded', async () => {
  let transactions = 0;
  await assert.rejects(collectConsistentExport({
    async query() { return [{ inventory: JSON.stringify(tables) }]; },
    async transaction() { transactions++; return tables.map(() => [{ row_count: '100', wire_bytes: '40000000' }]); },
  }), /exceeds bounded HTTPS response/);
  assert.equal(transactions, 1);
});

test('protected files are outside Git, private, checksummed and not overwritten; all tables have destinations', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'stupid-gifts-test-export-'));
  try {
    const output = join(parent, 'protected'); const data = await collectConsistentExport(source());
    const receipt = await writeProtectedExport(data, { output, repository: process.cwd(), codeSha: 'test-only-exporter' });
    assert.equal(receipt.tableCount, 2);
    assert.equal((await stat(output)).mode & 0o077, 0);
    const text = await readFile(join(output, 'manifest.json'), 'utf8'); const manifest = JSON.parse(text);
    assert.equal(sha256(text), receipt.manifestSha256);
    assert.equal(manifest.tables[0].destination.kind, 'd1'); assert.equal(manifest.tables[1].destination.kind, 'archive');
    for (const table of manifest.tables) {
      const filename = join(output, table.file);
      assert.equal((await stat(filename)).mode & 0o077, 0);
      assert.equal(sha256(await readFile(filename, 'utf8')), table.sha256);
    }
    await assert.rejects(writeProtectedExport(data, { output, repository: process.cwd(), codeSha: 'test-only' }), /EEXIST/);
    await assert.rejects(assertProtectedDestination(join(process.cwd(), 'bad-export'), process.cwd()), /inside the repository/);
    await chmod(parent, 0o755);
    await assert.rejects(assertProtectedDestination(join(parent, 'bad-permissions'), process.cwd()), /private/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('archive rows restore losslessly into disposable local tables and reconcile by checksum', async () => {
  // This tests archive readability/row restoration, not full Postgres schema restoration.
  const exported = await collectConsistentExport(source()); const db = new DatabaseSync(':memory:');
  for (const [index, table] of exported.tables.entries()) {
    db.exec(`CREATE TABLE archive_${index}(position INTEGER PRIMARY KEY,source_row_json TEXT NOT NULL)`);
    const rows = table.data.trim().split('\n').filter(Boolean);
    rows.forEach((row, position) => db.prepare(`INSERT INTO archive_${index} VALUES(?,?)`).run(position, row));
    const restored = db.prepare(`SELECT source_row_json FROM archive_${index} ORDER BY position`).all().map((row) => row.source_row_json);
    assert.equal(restored.length, table.count);
    assert.equal(sha256(`${restored.join('\n')}\n`), sha256(table.data));
  }
  db.close();
});

test('oversized one-shot export refuses before creating a misleading completion manifest', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'stupid-gifts-test-limit-'));
  try {
    await assert.rejects(writeProtectedExport(await collectConsistentExport(source()), {
      output: join(parent, 'too-large'), repository: process.cwd(), codeSha: 'test-only', maxBytes: 1,
    }), /exceeds bounded/);
    await assert.rejects(stat(join(parent, 'too-large')), /ENOENT/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});
