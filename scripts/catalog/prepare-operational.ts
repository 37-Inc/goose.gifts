import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { assertPrivateOutsideGit, validateRecoveryArchive } from './recovery-archive.ts';
import type { ValidatedRecoveryTable } from './recovery-archive.ts';
import { prepareHistoryPacket } from './prepare-history.ts';
import { canonicalJson, convertSourceRow, destinationFor, reconcileRows, sha256, TYPED_TIMESTAMP_COLUMNS } from './migration.ts';
import type { ImportBatch, TimestampDecision } from './migration.ts';

type Row = Record<string, unknown>;
type Archive = { tables: ValidatedRecoveryTable[]; summary: { manifestSha256: string } };
export interface PreservedProducts {
  rows: Row[]; rowsFileSha256: string; evidenceSha256: string; evidenceReference: string;
}
const EXTRA = ['products', 'product_slug_history', 'catalog_editorial_events', 'search_queries'] as const;
const TARGETS = ['catalog_runs', 'products', 'product_slug_history', 'catalog_run_items', 'catalog_editorial_events', 'search_history'];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);

/** Offline only. Unknown historical instants remain NULL, never "now" or assumed UTC. */
export function prepareOperationalPacket(archive: Archive, options: {
  importedAt: string; unresolvedEvidence: string; preserve?: PreservedProducts;
}) {
  if (!options.unresolvedEvidence.trim()) throw new Error('Historical unresolved decision evidence required');
  const history = prepareHistoryPacket(archive, options);
  const preservedRows: Row[] = options.preserve?.rows.map((row): Row => ({ ...row, timestamp_provenance_json: row.timestamp_provenance_json ?? '{}' })) || [];
  if (options.preserve && (!preservedRows.length || !hash(options.preserve.rowsFileSha256)
    || !hash(options.preserve.evidenceSha256) || !options.preserve.evidenceReference.trim())) throw new Error('Explicit preserved rows and pinned readback evidence required');
  if (new Set(preservedRows.map((r) => r.id)).size !== preservedRows.length) throw new Error('Duplicate preserved identity');
  const remaining = new Map(preservedRows.map((r) => [r.id, r]));
  const preservation = [];
  const tables: Array<{ table: string; sourceSha256: string; rows: number; batches: number }> = [...history.summary.tables];
  const batches: ImportBatch[] = [...history.batches];
  const timestamps = Object.fromEntries(EXTRA.filter((table) => table !== 'product_slug_history').flatMap((table) =>
    TYPED_TIMESTAMP_COLUMNS[table].map((column) => [`${table}.${column}`, {
      timezone: 'unresolved', evidence: options.unresolvedEvidence,
    } satisfies TimestampDecision])));
  for (const table of EXTRA) {
    const source = archive.tables.find((t) => t.definition.schema === 'public' && t.definition.name === table);
    if (!source || sha256(source.raw) !== source.definition.sha256 || source.rows.length !== source.definition.rowCount) throw new Error('Operational source checksum/count missing');
    const lines = source.raw.length ? source.raw.slice(0, -1).split('\n') : [];
    if (lines.length !== source.rows.length || (source.raw.length && !source.raw.endsWith('\n'))) throw new Error('Operational source line framing invalid');
    const rows: Row[] = [];
    for (const [index, row] of source.rows.entries()) {
      if (canonicalJson(JSON.parse(lines[index])) !== canonicalJson(row)) throw new Error('Operational source row/raw mismatch');
      const preserved = table === 'products' ? remaining.get(row.id) : undefined;
      if (preserved) {
        // Fresh operational fields may differ intentionally, but their archived
        // original source must still match this source snapshot structurally.
        const original = { ...row }; delete original.embedding;
        if (preserved.public_id !== row.public_id || preserved.slug !== row.slug
          || canonicalJson(JSON.parse(String(preserved.source_record_json))) !== canonicalJson(original)) throw new Error('Preserved product identity/source delta requires explicit review');
        preservation.push({ id: row.id, publicId: row.public_id, sourceLineSha256: sha256(lines[index]),
          preservedTargetSha256: sha256(canonicalJson(preserved)) });
        remaining.delete(row.id); continue;
      }
      const converted = convertSourceRow(table, row, { catalogRevision: `archive-${archive.summary.manifestSha256.slice(0, 12)}`,
        archiveId: archive.summary.manifestSha256, timestamps });
      // Products omit only embeddings from D1 raw JSON; original binary vectors
      // and exact full source lines remain in the pinned protected archive.
      if (table !== 'products') converted.source_record_json = lines[index];
      rows.push(converted);
    }
    const key = table === 'product_slug_history' ? 'slug' : 'id';
    rows.sort((a, b) => compare(String(a[key]), String(b[key])));
    if (new Set(rows.map((r) => r[key])).size !== rows.length) throw new Error('Duplicate operational source identity');
    const destination = destinationFor(table).table;
    for (let i = 0; i < rows.length; i += 40) batches.push({ exportSha256: archive.summary.manifestSha256,
      table: destination, batchNumber: i / 40, rows: rows.slice(i, i + 40), importedAt: options.importedAt });
    tables.push({ table: destination, sourceSha256: source.definition.sha256, rows: rows.length, batches: Math.ceil(rows.length / 40) });
  }
  if (remaining.size) throw new Error('Preserved product is absent from pinned source');
  batches.sort((a, b) => TARGETS.indexOf(a.table) - TARGETS.indexOf(b.table) || a.batchNumber - b.batchNumber);
  return { batches, preservedRows, summary: {
    schemaVersion: 1, mode: 'offline-operational-import-packet', sourceManifestSha256: archive.summary.manifestSha256,
    importedAt: options.importedAt, imported: false, published: false, requiredMigration: '0005_historical_timestamps.sql',
    tables, batchCount: batches.length, batchRowLimit: 40, importedRows: batches.reduce((n, b) => n + b.rows.length, 0),
    preservedRows: preservedRows.length, preservation: preservation.sort((a, b) => compare(String(a.id), String(b.id))),
    preserveEvidence: options.preserve ? { rowsFileSha256: options.preserve.rowsFileSha256,
      evidenceSha256: options.preserve.evidenceSha256, evidenceReference: options.preserve.evidenceReference } : null,
    unresolvedEvidence: options.unresolvedEvidence, historySequence: history.summary.sequence,
    sourceIdentityCount: tables.reduce((n, t) => n + t.rows, preservedRows.length),
    policy: 'Unresolved typed historical instants are NULL with private source-null/unresolved/evidenced provenance. Products are held with no public projection or vector work; preserved products are not rewritten.',
    rawPolicy: 'Products retain exact nonvector source values in canonical source_record_json; original full lines/native vector bytes stay in the checksum-pinned archive. Other tables retain exact source NDJSON lines.',
    vectorWorkEmitted: 0,
    pendingGates: ['root_review_before_provider_writes', 'atomic_0005_FK_FTS_projection_integrity', 'full_target_readback_and_preserved_subset_proof',
      'future_consumers_unknown_timestamp_policy', 'writer_barrier_final_delta_and_recovery', 'rights_freshness_public_search_and_cutover_acceptance'],
  } };
}

/** Includes the explicitly preserved subset and rejects any extra/missing identity. */
export async function reconcileOperationalPacket(db: CatalogD1, packet: ReturnType<typeof prepareOperationalPacket>) {
  if (packet.batches.some((batch) => !TARGETS.includes(batch.table))) throw new Error('Unexpected operational destination');
  const reports = [];
  for (const table of TARGETS) {
    const expected = packet.batches.filter((b) => b.table === table).flatMap((b) => b.rows);
    if (table === 'products') expected.push(...packet.preservedRows);
    const key = table === 'product_slug_history' ? 'slug' : 'id'; const actual: Row[] = [];
    for (let i = 0; i < expected.length; i += 80) {
      const part = expected.slice(i, i + 80); const fields = [...new Set(part.flatMap((row) => Object.keys(row)))];
      if (fields.some((field) => !/^[a-z_]+$/.test(field))) throw new Error('Invalid operational reconciliation columns');
      actual.push(...(await db.prepare(`SELECT ${fields.join(',')} FROM ${table} WHERE ${key} IN (${part.map(() => '?').join(',')})`)
        .bind(...part.map((r) => r[key])).all<Row>()).results);
    }
    const total = Number((await db.prepare(`SELECT count(*) AS count FROM ${table}`).all<{ count: number }>()).results[0]?.count);
    if (total !== expected.length || reconcileRows(expected, actual, key).length) throw new Error('Operational readback identity/count/full-field mismatch');
    reports.push({ table, rows: total, rowsSha256: sha256(canonicalJson(actual.sort((a, b) => compare(String(a[key]), String(b[key]))))) });
  }
  return reports;
}

export async function writeOperationalPacket(output: string, packet: ReturnType<typeof prepareOperationalPacket>) {
  const path = resolve(output); await assertPrivateOutsideGit(dirname(path)); await mkdir(path, { mode: 0o700 });
  const files = [];
  const payloads = packet.batches.map((batch, i) => ({ file: `${String(i).padStart(3, '0')}-${batch.table}-${batch.batchNumber}.json`,
    value: batch, table: batch.table, batchNumber: batch.batchNumber, rowCount: batch.rows.length }));
  const emit = async (file: string, value: unknown) => {
    const text = `${canonicalJson(value)}\n`; if (Buffer.byteLength(text) > 1_000_000) throw new Error('Operational packet file exceeds one megabyte');
    await writeFile(join(path, file), text, { mode: 0o600, flag: 'wx' });
    if (sha256(await readFile(join(path, file), 'utf8')) !== sha256(text)) throw new Error('Operational packet readback mismatch');
    return { file, sha256: sha256(text), bytes: Buffer.byteLength(text) };
  };
  for (const payload of payloads) files.push({ ...await emit(payload.file, payload.value), table: payload.table,
    batchNumber: payload.batchNumber, rowCount: payload.rowCount, batchSha256: sha256(canonicalJson(payload.value.rows)) });
  const preserved = await emit('preserved-products.json', packet.preservedRows);
  const manifest = await emit('manifest.json', { ...packet.summary, files, preserved });
  await writeFile(join(path, 'manifest.sha256'), `${manifest.sha256}  manifest.json\n`, { mode: 0o600, flag: 'wx' });
  return { path, manifestSha256: manifest.sha256 };
}

async function pinnedPrivateFile(path: string, expected: string) {
  await assertPrivateOutsideGit(dirname(resolve(path))); const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 1_000_000 || !hash(expected)) throw new Error('Private evidence file is invalid');
  const raw = await readFile(path, 'utf8'); if (sha256(raw) !== expected) throw new Error('Private evidence checksum mismatch'); return raw;
}
async function main(argv: string[]) {
  if (argv.includes('--help')) { console.log('Offline only: --archive PATH --manifest-sha SHA --imported-at ISO --evidence TEXT --output NEW_PRIVATE_DIR; optional explicit preservation requires all --preserve-rows PATH --preserve-sha SHA --readback-evidence PATH --readback-sha SHA. No provider calls.'); return; }
  const names = ['--archive', '--manifest-sha', '--imported-at', '--evidence', '--output', '--preserve-rows', '--preserve-sha', '--readback-evidence', '--readback-sha'];
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) { if (!names.includes(argv[i]) || !argv[i + 1] || args[argv[i]]) throw new Error('Invalid operational packet option'); args[argv[i]] = argv[++i]; }
  if (names.slice(0, 5).some((name) => !args[name]) || (Object.keys(args).length !== 5 && Object.keys(args).length !== 9)) throw new Error('Explicit source, clock, decision and preservation evidence required');
  const archive = await validateRecoveryArchive(args['--archive'], { expectedManifestSha256: args['--manifest-sha'] });
  let preserve: PreservedProducts | undefined;
  if (args['--preserve-rows']) {
    const raw = await pinnedPrivateFile(args['--preserve-rows'], args['--preserve-sha']);
    await pinnedPrivateFile(args['--readback-evidence'], args['--readback-sha']);
    const rows = JSON.parse(raw); if (!Array.isArray(rows)) throw new Error('Preserved products must be explicit rows');
    preserve = { rows, rowsFileSha256: args['--preserve-sha'], evidenceSha256: args['--readback-sha'], evidenceReference: args['--readback-evidence'] };
  }
  const packet = prepareOperationalPacket(archive, { importedAt: args['--imported-at'], unresolvedEvidence: args['--evidence'], preserve });
  const result = await writeOperationalPacket(args['--output'], packet);
  console.log(JSON.stringify({ ...result, rows: packet.summary.importedRows, preserved: packet.summary.preservedRows, batches: packet.summary.batchCount, providerCalls: 0 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(() => {
  console.error('Operational packet refused; protected source unchanged, no provider calls. Inspect source/evidence locally without logging private rows.'); process.exitCode = 1;
});
