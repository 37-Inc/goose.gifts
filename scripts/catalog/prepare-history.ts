import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertPrivateOutsideGit, validateRecoveryArchive } from './recovery-archive.ts';
import type { ValidatedRecoveryTable } from './recovery-archive.ts';
import { canonicalJson, canonicalTimestamp, convertSourceRow, reconcileRows, sha256, TYPED_TIMESTAMP_COLUMNS } from './migration.ts';
import type { ImportBatch } from './migration.ts';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';

const TARGETS = ['catalog_runs', 'catalog_run_items'] as const;
type Row = Record<string, unknown>;
type Archive = { tables: ValidatedRecoveryTable[]; summary: { manifestSha256: string } };
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function explicitInstant(value: unknown): boolean { return typeof value === 'string' && /(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(value); }

/** Counts only; never includes search text, private product copy, or raw timestamp values. */
export function timestampPreflight(tables: ValidatedRecoveryTable[]) {
  return tables.filter((t) => Object.hasOwn(TYPED_TIMESTAMP_COLUMNS, t.definition.name)).flatMap((table) =>
    table.definition.columns.filter((c) => c.type.includes('timestamp')).map((column) => {
      let nulls = 0; let aware = 0; let naive = 0; let invalid = 0;
      for (const row of table.rows) {
        const value = row[column.name];
        if (value === null) { nulls++; continue; }
        if (!explicitInstant(value)) { naive++; continue; }
        try { canonicalTimestamp(value); aware++; } catch { invalid++; }
      }
      const typed = TYPED_TIMESTAMP_COLUMNS[table.definition.name].includes(column.name);
      return { table: table.definition.name, column: column.name, sourceType: column.type, rowCount: table.rows.length,
        nulls, aware, naive, invalid, typedRuntimeColumn: typed, unresolvedTypedValues: typed ? naive + invalid : 0,
        disposition: !table.rows.length ? 'empty_no_transformation' : typed && (naive || invalid)
          ? 'blocked_without_per_row_writer_timezone_evidence' : typed ? 'explicit_instants_only' : 'raw_only_not_normalized' };
    }));
}

/** Deterministic, offline-only packet. The caller must validate/pin the source archive first. */
export function prepareHistoryPacket(archive: Archive, options: { importedAt: string }) {
  if (!/^[a-f0-9]{64}$/.test(archive.summary.manifestSha256) || new Date(options.importedAt).toISOString() !== options.importedAt) throw new Error('Pinned source and explicit canonical import clock required');
  const batches: ImportBatch[] = []; const tables = [];
  const converted: Record<string, Row[]> = {};
  for (const target of TARGETS) {
    const source = archive.tables.find((t) => t.definition.schema === 'public' && t.definition.name === target);
    if (!source || sha256(source.raw) !== source.definition.sha256 || source.rows.length !== source.definition.rowCount) throw new Error('History source table/checksum/count missing');
    for (const column of TYPED_TIMESTAMP_COLUMNS[target]) if (source.definition.columns.find((c) => c.name === column)?.type !== 'timestamp with time zone') throw new Error('History packet refuses a naive/unknown typed source timestamp');
    const lines = source.raw.length ? source.raw.slice(0, -1).split('\n') : [];
    if (lines.length !== source.rows.length || (source.raw.length && !source.raw.endsWith('\n'))) throw new Error('History raw line framing is incomplete');
    const rows = source.rows.map((row, i) => {
      if (canonicalJson(JSON.parse(lines[i])) !== canonicalJson(row)) throw new Error('History row differs from raw archive line');
      const result = convertSourceRow(target, row, { catalogRevision: `history-${archive.summary.manifestSha256.slice(0, 12)}`,
        archiveId: archive.summary.manifestSha256, timestamps: {} });
      // Preserve the exact server JSON line, including key order and whitespace.
      result.source_record_json = lines[i];
      return result;
    }).sort((a, b) => target === 'catalog_run_items' ? Number(a.sequence) - Number(b.sequence)
      : compare(String(a.started_at), String(b.started_at)) || compare(String(a.id), String(b.id)));
    if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('Duplicate history identity');
    converted[target] = rows;
    for (let i = 0; i < rows.length; i += 40) batches.push({ exportSha256: archive.summary.manifestSha256, table: target,
      batchNumber: i / 40, rows: rows.slice(i, i + 40), importedAt: options.importedAt });
    tables.push({ table: target, sourceSha256: source.definition.sha256, rows: rows.length, batches: Math.ceil(rows.length / 40) });
  }
  const runs = new Set(converted.catalog_runs.map((row) => row.id));
  const items = converted.catalog_run_items;
  if (items.some((row) => !runs.has(row.run_id)) || new Set(items.map((row) => row.sequence)).size !== items.length) throw new Error('History parent/sequence coverage mismatch');
  const sequences = items.map((row) => Number(row.sequence)); const maximum = sequences.length ? sequences.at(-1)! : 0;
  if (!Number.isSafeInteger(maximum + 1)) throw new Error('History sequence high-water requires review');
  const slugHistory = archive.tables.find((t) => t.definition.schema === 'public' && t.definition.name === 'product_slug_history');
  const preflight = timestampPreflight(archive.tables);
  return { batches, summary: { schemaVersion: 1, mode: 'offline-history-import-packet', sourceManifestSha256: archive.summary.manifestSha256,
    importedAt: options.importedAt, imported: false, published: false, tables, totalRows: batches.reduce((sum, b) => sum + b.rows.length, 0),
    clockPolicy: 'importedAt is the explicit operator-supplied packet clock, not a provider execution receipt.',
    batchCount: batches.length, batchRowLimit: 40, order: ['catalog_runs: started_at/id', 'catalog_run_items: original sequence ascending'],
    sequence: { count: sequences.length, minimum: sequences[0] ?? null, maximum, nextMinimum: maximum + 1,
      gaps: sequences.length ? maximum - sequences[0] + 1 - sequences.length : 0 },
    slugHistory: { sourceRows: slugHistory?.rows.length ?? null, emittedRows: 0, disposition: slugHistory?.rows.length === 0
      ? 'verified_empty_no_write' : 'not_emitted_requires_product_parents_and_timestamp_review' },
    rawPolicy: 'source_record_json is the exact original source NDJSON line; only explicitly timezone-aware operational fields are canonicalized.',
    retryRule: 'Use existing importBatch: matching receipt skips; absent receipt imports atomically; changed receipt/payload or unexpected identity refuses.',
    targetPrecondition: 'Target history tables are empty or exactly the same source history; reconcile additional target writes before applying.',
    pendingGates: ['root_review_before_any_provider_write', 'remote_atomic_batch_and_full_row_readback', 'remaining_timestamp_provenance', 'final_writer_barrier_and_D1_delta_recovery'],
    timestampPreflight: preflight } };
}

/** Read-only, full-field reconciliation after importBatch; no receipt alone counts as row proof. */
export async function reconcileHistoryPacket(db: CatalogD1, batches: ImportBatch[]) {
  const reports = [];
  for (const table of TARGETS) {
    if (batches.some((b) => !TARGETS.includes(b.table as typeof TARGETS[number]))) throw new Error('Unexpected history destination');
    const expected = batches.filter((b) => b.table === table).flatMap((b) => b.rows);
    const actual: Row[] = [];
    for (let i = 0; i < expected.length; i += 80) {
      const ids = expected.slice(i, i + 80).map((r) => r.id);
      actual.push(...(await db.prepare(`SELECT * FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results);
    }
    const total = Number((await db.prepare(`SELECT count(*) AS count FROM ${table}`).all<{ count: number }>()).results[0]?.count);
    const differences = reconcileRows(expected, actual, 'id');
    if (differences.length || !Number.isSafeInteger(total) || total !== expected.length) throw new Error('History readback identity/count/full-field mismatch');
    reports.push({ table, rows: actual.length, rowsSha256: sha256(canonicalJson(actual.sort((a, b) => compare(String(a.id), String(b.id))))) });
  }
  return reports;
}

export async function writeHistoryPacket(output: string, packet: ReturnType<typeof prepareHistoryPacket>) {
  const path = resolve(output); await assertPrivateOutsideGit(dirname(path));
  await mkdir(path, { mode: 0o700 }); // No reuse/overwrite of an existing packet directory.
  const files = [];
  for (let i = 0; i < packet.batches.length; i++) {
    const batch = packet.batches[i]; const file = `${String(i).padStart(3, '0')}-${batch.table}-${String(batch.batchNumber).padStart(3, '0')}.json`;
    const text = `${canonicalJson(batch)}\n`;
    if (Buffer.byteLength(text) > 1_000_000) throw new Error('History batch exceeds one-megabyte protected packet bound');
    await writeFile(join(path, file), text, { mode: 0o600, flag: 'wx' });
    if (sha256(await readFile(join(path, file), 'utf8')) !== sha256(text)) throw new Error('History packet file readback mismatch');
    files.push({ file, sha256: sha256(text), batchSha256: sha256(canonicalJson(batch.rows)), table: batch.table,
      batchNumber: batch.batchNumber, rowCount: batch.rows.length, bytes: Buffer.byteLength(text) });
  }
  const manifest = `${canonicalJson({ ...packet.summary, files })}\n`; const hash = sha256(manifest);
  await writeFile(join(path, 'manifest.json'), manifest, { mode: 0o600, flag: 'wx' });
  await writeFile(join(path, 'manifest.sha256'), `${hash}  manifest.json\n`, { mode: 0o600, flag: 'wx' });
  if (sha256(await readFile(join(path, 'manifest.json'), 'utf8')) !== hash) throw new Error('History manifest readback mismatch');
  return { path, manifestSha256: hash };
}

async function main(argv: string[]) {
  if (argv.includes('--help')) { console.log('Offline only: --archive /private/export --manifest-sha SHA --imported-at YYYY-MM-DDTHH:mm:ss.sssZ --output /private/new-history-packet. Validates the pinned full export, emits ≤40-row catalog_runs/items ImportBatch JSON plus preflight; never calls D1/providers.'); return; }
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!['--archive', '--manifest-sha', '--imported-at', '--output'].includes(argv[i]) || !argv[i + 1] || args[argv[i]]) throw new Error('Invalid history packet option');
    args[argv[i]] = argv[++i];
  }
  if (Object.keys(args).length !== 4 || !args['--output'].startsWith('/')) throw new Error('Explicit pinned source, deterministic clock and protected output required');
  const archive = await validateRecoveryArchive(args['--archive'], { expectedManifestSha256: args['--manifest-sha'] });
  const packet = prepareHistoryPacket(archive, { importedAt: args['--imported-at'] });
  const result = await writeHistoryPacket(args['--output'], packet);
  console.log(JSON.stringify({ output: result.path, manifestSha256: result.manifestSha256, batches: packet.summary.batchCount,
    rows: packet.summary.totalRows, sequenceMaximum: packet.summary.sequence.maximum, imported: false, providerCalls: 0 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(() => {
  console.error('History packet preparation refused; no provider calls/source writes occurred. Protected source remains unchanged.'); process.exitCode = 1;
});
