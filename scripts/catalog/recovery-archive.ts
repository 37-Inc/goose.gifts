import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalJson, sha256 } from './migration.ts';
import { decodePgvectorSendBase64, encodePgvectorSendBase64, PGVECTOR_BINARY_ENCODING } from './pgvector-binary.ts';

type Row = Record<string, string | boolean | null>;
export interface RecoveryTable {
  schema: string; name: string; file: string; rowCount: number; sha256: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  constraints: Array<{ name: string; definition: string }>;
  columnEncodings: Record<string, string>;
}
export interface ValidatedRecoveryTable {
  definition: RecoveryTable; raw: string; rows: Row[]; canonicalRowsSha256: string;
  vectorCount: number; vectorBytesSha256: string;
}
export function canonicalRowsHash(rows: Record<string, unknown>[]): string {
  return sha256(rows.map((row) => canonicalJson(row)).join('\n') + (rows.length ? '\n' : ''));
}
export async function assertPrivateOutsideGit(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Recovery paths must be absolute');
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('Recovery directory must be private, nonsymlink and mode 0700');
  const absolute = await realpath(path);
  let git = false;
  try { execFileSync('git', ['-C', absolute, 'rev-parse', '--show-toplevel'], { stdio: 'ignore' }); git = true; } catch { /* outside Git */ }
  if (git) throw new Error('Recovery data must remain outside Git');
  return absolute;
}
async function privateFile(directory: string, file: string, maxBytes: number): Promise<Buffer> {
  const path = join(directory, file); const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > maxBytes) throw new Error('Recovery file type, permissions or size is invalid');
  return readFile(path);
}
function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error('Recovery JSON is invalid; raw content is not logged'); }
}
function simpleColumns(value: string): string[] {
  return value.split(',').map((name) => {
    const match = name.trim().match(/^(?:"([a-zA-Z_][a-zA-Z0-9_]*)"|([a-zA-Z_][a-zA-Z0-9_]*))$/);
    if (!match) throw new Error('Archive key expression needs an explicit recovery review');
    return match[1] || match[2];
  });
}
/** Data-level checks only: never executes SQL metadata from the manifest. */
export function validateArchiveRelations(tables: ValidatedRecoveryTable[]): number {
  const byName = new Map(tables.map((table) => [`${table.definition.schema}.${table.definition.name}`, table]));
  let checked = 0;
  for (const table of tables) for (const constraint of table.definition.constraints) {
    const key = constraint.definition.match(/^(PRIMARY KEY|UNIQUE) \(([^)]+)\)$/);
    if (key) {
      const columns = simpleColumns(key[2]); const seen = new Set<string>();
      for (const row of table.rows) {
        const values = columns.map((column) => row[column]);
        if (values.some((value) => value === undefined)) throw new Error('Archive constraint references a missing column');
        if (values.some((value) => value === null)) {
          if (key[1] === 'PRIMARY KEY') throw new Error('Archive primary key contains NULL');
          continue;
        }
        const value = canonicalJson(values);
        if (seen.has(value)) throw new Error('Archive contains a duplicate primary/unique key');
        seen.add(value);
      }
      checked++; continue;
    }
    const fk = constraint.definition.match(/^FOREIGN KEY \(([^)]+)\) REFERENCES (?:(\w+)\.)?(\w+)\(([^)]+)\)(?: ON (?:DELETE|UPDATE) (?:CASCADE|SET NULL|NO ACTION|RESTRICT|SET DEFAULT))*$/);
    if (!fk) throw new Error('Archive constraint syntax needs an explicit recovery review');
    const from = simpleColumns(fk[1]); const to = simpleColumns(fk[4]);
    const target = byName.get(`${fk[2] || table.definition.schema}.${fk[3]}`);
    if (!target || from.length !== to.length) throw new Error('Archive foreign-key target is missing');
    const keys = new Set(target.rows.map((row) => canonicalJson(to.map((column) => row[column]))));
    for (const row of table.rows) {
      const values = from.map((column) => row[column]);
      if (values.some((value) => value === undefined)) throw new Error('Archive foreign key references a missing column');
      if (!values.includes(null) && !keys.has(canonicalJson(values))) throw new Error('Archive contains an unresolved foreign-key reference');
    }
    checked++;
  }
  return checked;
}

export async function validateRecoveryArchive(directory: string, options: {
  expectedManifestSha256: string; expectedTableCount?: number; maxDataBytes?: number;
}) {
  const path = await assertPrivateOutsideGit(directory);
  if (!/^[a-f0-9]{64}$/.test(options.expectedManifestSha256)) throw new Error('An independently recorded manifest checksum is required');
  const manifestBytes = await privateFile(path, 'manifest.json', 1_000_000);
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  if (manifestSha256 !== options.expectedManifestSha256) throw new Error('Manifest differs from independently recorded checksum');
  const sidecar = await privateFile(path, 'manifest.sha256', 100);
  if (sidecar.toString() !== `${manifestSha256}  manifest.json\n`) throw new Error('Manifest checksum sidecar mismatch');
  const manifest = parseJson(manifestBytes.toString()) as {
    schemaVersion: number; mode: string; totalBytes: number; tables: RecoveryTable[];
    settings: { isolation: string; readOnly: string };
  };
  if (manifest.schemaVersion !== 1 || manifest.mode !== 'https-repeatable-read-single-transaction'
    || manifest.settings?.isolation !== 'repeatable read' || manifest.settings.readOnly !== 'on'
    || !Array.isArray(manifest.tables) || manifest.tables.length !== (options.expectedTableCount ?? 13)) throw new Error('Recovery manifest snapshot/table coverage is invalid');
  const tables: ValidatedRecoveryTable[] = []; const identities = new Set<string>(); const files = new Set<string>();
  let totalBytes = 0;
  for (const definition of manifest.tables) {
    const identity = `${definition.schema}.${definition.name}`;
    if (!definition.schema || !definition.name || identities.has(identity) || files.has(definition.file)
      || !/^\d{3}\.ndjson$/.test(definition.file) || !Array.isArray(definition.columns)
      || !Array.isArray(definition.constraints) || !Number.isSafeInteger(definition.rowCount) || definition.rowCount < 0) throw new Error('Recovery table inventory is invalid');
    identities.add(identity); files.add(definition.file);
    const columnNames = definition.columns.map((column) => column.name);
    if (new Set(columnNames).size !== columnNames.length || columnNames.some((name) => name.startsWith('_archive_'))
      || canonicalJson(Object.keys(definition.columnEncodings || {}).sort()) !== canonicalJson([...columnNames].sort())) throw new Error('Recovery column/encoding inventory is invalid');
    const bytes = await privateFile(path, definition.file, options.maxDataBytes ?? 60_000_000);
    totalBytes += bytes.length;
    if (totalBytes > (options.maxDataBytes ?? 60_000_000) || createHash('sha256').update(bytes).digest('hex') !== definition.sha256) throw new Error('Recovery table size or checksum mismatch');
    const raw = bytes.toString('utf8');
    if (!Buffer.from(raw).equals(bytes) || (raw.length && !raw.endsWith('\n'))) throw new Error('Recovery data is not complete UTF-8 NDJSON');
    const lines = raw.length ? raw.slice(0, -1).split('\n') : [];
    if (lines.length !== definition.rowCount || lines.some((line) => !line.length)) throw new Error('Recovery table row count mismatch');
    const vectorHash = createHash('sha256'); let vectorCount = 0;
    const rows = lines.map((line) => {
      const row = parseJson(line) as Row;
      if (!row || Array.isArray(row) || canonicalJson(Object.keys(row).sort()) !== canonicalJson([...columnNames].sort())) throw new Error('Recovery row has missing/unexpected fields');
      for (const column of definition.columns) {
        const value = row[column.name]; const encoding = definition.columnEncodings[column.name];
        if (!['postgres-text', 'json-boolean', PGVECTOR_BINARY_ENCODING].includes(encoding)) throw new Error('Unknown recovery column encoding');
        if (value === null) { if (!column.nullable) throw new Error('Recovery row violates source nullability'); continue; }
        if (encoding === 'json-boolean' ? typeof value !== 'boolean' : typeof value !== 'string') throw new Error('Recovery field representation is invalid');
        if (encoding === PGVECTOR_BINARY_ENCODING) {
          const values = decodePgvectorSendBase64(value);
          if (encodePgvectorSendBase64(values) !== value) throw new Error('Recovery vector native bytes did not round-trip');
          const id = String(row.public_id || row.id || '');
          vectorHash.update(`${Buffer.byteLength(id)}:${id}\n`).update(Buffer.from(String(value), 'base64'));
          vectorCount++;
        }
      }
      return row;
    });
    if (definition.schema === 'public' && definition.name === 'products') for (const key of ['id', 'public_id', 'slug']) {
      const values = rows.map((row) => row[key]);
      if (values.some((value) => typeof value !== 'string' || !value) || new Set(values).size !== values.length) throw new Error('Product identity coverage is invalid');
    }
    tables.push({ definition, raw, rows, canonicalRowsSha256: canonicalRowsHash(rows), vectorCount, vectorBytesSha256: vectorHash.digest('hex') });
  }
  if (totalBytes !== manifest.totalBytes) throw new Error('Recovery manifest total byte count mismatch');
  const constraintsChecked = validateArchiveRelations(tables);
  const summary = { manifestSha256, tableCount: tables.length, totalRows: tables.reduce((n, table) => n + table.rows.length, 0),
    totalBytes, vectorCount: tables.reduce((n, table) => n + table.vectorCount, 0), constraintsChecked,
    tables: tables.map((table) => ({ schema: table.definition.schema, name: table.definition.name,
      rowCount: table.rows.length, sourceSha256: table.definition.sha256, canonicalRowsSha256: table.canonicalRowsSha256,
      vectorCount: table.vectorCount, vectorBytesSha256: table.vectorBytesSha256 })) };
  return { directory: path, tables, summary };
}
