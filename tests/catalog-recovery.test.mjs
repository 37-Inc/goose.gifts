import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateRecoveryArchive } from '../scripts/catalog/recovery-archive.ts';
import { recoveryPopulateSql, recoveryReadbackSql, recoveryTableSql, runLocalRecoveryDrill } from '../scripts/catalog/recovery-drill.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { sha256 } from '../scripts/catalog/migration.ts';

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'stupid-gifts-recovery-test-'));
  const columns = [
    { name: 'id', type: 'text', nullable: false }, { name: 'public_id', type: 'uuid', nullable: false },
    { name: 'slug', type: 'text', nullable: false }, { name: 'amount', type: 'numeric(10,2)', nullable: true },
    { name: 'is_active', type: 'boolean', nullable: false }, { name: 'created_at', type: 'timestamp without time zone', nullable: true },
    { name: 'private_text', type: 'text', nullable: true }, { name: 'embedding', type: 'vector(1536)', nullable: true },
  ];
  const rows = [{ id: 'TEST-ONLY', public_id: '00000000-0000-4000-8000-000000000001', slug: 'test-only',
    amount: '0.00', is_active: false, created_at: '2026-10-19 08:31:55.596',
    private_text: 'PRIVATE-MARKER newline\nquote" backslash\\ emoji🍋 tab\t',
    embedding: encodePgvectorSendBase64(Array(1536).fill(Math.fround(0.1))) }];
  const childRows = [{ id: 'child-test', product_id: 'TEST-ONLY' }];
  const manifest = { schemaVersion: 1, mode: 'https-repeatable-read-single-transaction',
    settings: { isolation: 'repeatable read', readOnly: 'on' }, totalBytes: 0,
    tables: [{ schema: 'public', name: 'products', file: '000.ndjson', rowCount: 1, sha256: '', columns,
      columnEncodings: Object.fromEntries(columns.map((column) => [column.name, column.name === 'embedding' ? 'pgvector-send-base64-v1' : column.type === 'boolean' ? 'json-boolean' : 'postgres-text'])),
      constraints: [{ name: 'test_pk', definition: 'PRIMARY KEY (id)' }] },
    { schema: 'public', name: 'historical_references', file: '001.ndjson', rowCount: 1, sha256: '',
      columns: [{ name: 'id', type: 'text', nullable: false }, { name: 'product_id', type: 'text', nullable: true }],
      columnEncodings: { id: 'postgres-text', product_id: 'postgres-text' },
      constraints: [{ name: 'child_pk', definition: 'PRIMARY KEY (id)' },
        { name: 'child_fk', definition: 'FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE' }] }] };
  async function save() {
    const data = [rows, childRows].map((items) => items.map(JSON.stringify).join('\n') + (items.length ? '\n' : ''));
    manifest.totalBytes = 0;
    for (let i = 0; i < data.length; i++) {
      manifest.tables[i].rowCount = [rows, childRows][i].length;
      manifest.tables[i].sha256 = sha256(data[i]); manifest.totalBytes += Buffer.byteLength(data[i]);
      await writeFile(join(parent, manifest.tables[i].file), data[i], { mode: 0o600 });
    }
    const text = JSON.stringify(manifest) + '\n'; const hash = sha256(text);
    await writeFile(join(parent, 'manifest.json'), text, { mode: 0o600 });
    await writeFile(join(parent, 'manifest.sha256'), hash + '  manifest.json\n', { mode: 0o600 });
    return hash;
  }
  const hash = await save();
  return { parent, manifest, rows, childRows, save, hash, validate: () => validateRecoveryArchive(parent, { expectedManifestSha256: hash, expectedTableCount: 2 }) };
}

test('offline validator covers checksums/rows/types/nulls/keys/references/native vector bytes without returning raw rows in summary', async () => {
  const f = await fixture();
  try {
    const result = await f.validate();
    assert.equal(result.summary.tableCount, 2); assert.equal(result.summary.totalRows, 2);
    assert.equal(result.summary.vectorCount, 1); assert.equal(result.summary.constraintsChecked, 3);
    assert.equal(JSON.stringify(result.summary).includes('PRIVATE-MARKER'), false);
    assert.equal(result.tables[0].rows[0].created_at, f.rows[0].created_at);
    assert.equal(result.tables[0].rows[0].amount, '0.00');
    assert.equal(result.tables[0].rows[0].is_active, false);
    assert.equal(result.tables[0].rows[0].private_text, f.rows[0].private_text);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('offline validator refuses wrong external manifest checksum and data tampering', async () => {
  const f = await fixture();
  try {
    await assert.rejects(validateRecoveryArchive(f.parent, { expectedManifestSha256: 'f'.repeat(64), expectedTableCount: 2 }), /independently recorded checksum/);
    await writeFile(join(f.parent, '000.ndjson'), 'not-private-content\n', { mode: 0o600 });
    await assert.rejects(f.validate(), /checksum mismatch/);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('valid checksums do not excuse malformed vectors, unknown encodings, missing fields or broken references', async () => {
  for (const mutate of [
    (f) => { f.rows[0].embedding = encodePgvectorSendBase64([1]); },
    (f) => { f.manifest.tables[0].columnEncodings.embedding = 'unknown'; },
    (f) => { delete f.rows[0].amount; },
    (f) => { f.childRows[0].product_id = 'missing'; },
    (f) => { f.rows[0].is_active = 'false'; },
  ]) {
    const f = await fixture();
    try {
      mutate(f); const hash = await f.save();
      await assert.rejects(validateRecoveryArchive(f.parent, { expectedManifestSha256: hash, expectedTableCount: 2 }));
    } finally { await rm(f.parent, { recursive: true, force: true }); }
  }
});

test('recovery refuses public permissions and symlinked input, and supports empty archive tables', async () => {
  const f = await fixture();
  try {
    await chmod(join(f.parent, '000.ndjson'), 0o644); await assert.rejects(f.validate(), /permissions/);
    await chmod(join(f.parent, '000.ndjson'), 0o600);
    await rm(join(f.parent, '001.ndjson')); await symlink(join(f.parent, '000.ndjson'), join(f.parent, '001.ndjson'));
    await assert.rejects(f.validate(), /file type/);
    await rm(join(f.parent, '001.ndjson'));
    f.childRows.length = 0; const hash = await f.save();
    assert.equal((await validateRecoveryArchive(f.parent, { expectedManifestSha256: hash, expectedTableCount: 2 })).summary.totalRows, 1);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('restore SQL uses raw text/boolean/BYTEA and never executes source defaults, triggers or schema statements', async () => {
  const f = await fixture();
  try {
    const table = f.manifest.tables[0];
    assert.match(recoveryTableSql(table), /"amount" text/); assert.match(recoveryTableSql(table), /"created_at" text/);
    assert.match(recoveryTableSql(table), /"embedding" bytea/); assert.match(recoveryTableSql(table), /"is_active" boolean/);
    assert.match(recoveryPopulateSql(table), /decode\(/); assert.match(recoveryReadbackSql(table), /encode\(/);
    assert.equal(recoveryTableSql(table).includes('CREATE EXTENSION'), false);
    assert.equal(recoveryTableSql(table).includes('CREATE TRIGGER'), false);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('optional local PostgreSQL drill creates/stops only a fresh Unix-only cluster and preserves every field', {
  skip: !process.env.CATALOG_RECOVERY_TEST_PG_BIN,
}, async () => {
  const f = await fixture(); const workParent = await mkdtemp(join(tmpdir(), 'stupid-gifts-recovery-pg-test-'));
  try {
    const result = await runLocalRecoveryDrill({ archive: f.parent, expectedManifestSha256: f.hash,
      expectedTableCount: 2, workParent, pgBin: process.env.CATALOG_RECOVERY_TEST_PG_BIN });
    assert.equal(result.receipt.status, 'passed'); assert.equal(result.receipt.clusterStopped, true);
    assert.equal(result.receipt.freshClusterDataRemoved, true); assert.equal(result.receipt.totalRows, 2);
    assert.equal(result.receipt.vectorCount, 1);
    assert.equal((await lstat(result.receiptPath)).mode & 0o077, 0);
    assert.equal(JSON.stringify(result.receipt).includes('PRIVATE-MARKER'), false);
    const runDirectory = join(workParent, (await readdir(workParent))[0]);
    await assert.rejects(lstat(join(runDirectory, 'pgdata')), /ENOENT/);
    const persisted = JSON.parse(await readFile(result.receiptPath, 'utf8'));
    assert.equal(persisted.restoredTables.length, 2);
  } finally { await rm(f.parent, { recursive: true, force: true }); await rm(workParent, { recursive: true, force: true }); }
});
