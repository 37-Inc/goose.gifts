import { mkdir, realpath, stat, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { canonicalJson, destinationFor, sha256, TYPED_TIMESTAMP_COLUMNS } from './migration.ts';

interface Column { name: string; type: string; nullable: boolean; default: string | null }
export interface SourceTable {
  schema: string; name: string; kind: string; partition: boolean; columns: Column[];
  constraints: Array<{ name: string; definition: string }>;
  indexes: Array<{ name: string; definition: string }>;
}
export interface ReadOnlyHttpSource {
  /** A one-shot read is only used to plan the following atomic export transaction. */
  query(sql: string): Promise<Array<Record<string, string>>>;
  transaction(queries: string[], options: { isolationLevel: 'RepeatableRead'; readOnly: true }): Promise<Array<Array<Record<string, string>>>>;
}

export const INVENTORY_SQL = `SELECT COALESCE(json_agg(t ORDER BY t.schema,t.name),'[]'::json)::text AS inventory FROM (
  SELECT n.nspname AS schema,c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,
    (SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    COALESCE((SELECT json_agg(json_build_object('name',con.conname,'definition',pg_get_constraintdef(con.oid)) ORDER BY con.conname)
      FROM pg_constraint con WHERE con.conrelid=c.oid),'[]'::json) AS constraints,
    COALESCE((SELECT json_agg(json_build_object('name',ci.relname,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY ci.relname)
      FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),'[]'::json) AS indexes
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','f') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
) t`;
const SETTINGS_SQL = `SELECT json_build_object('isolation',current_setting('transaction_isolation'),
  'readOnly',current_setting('transaction_read_only'),'snapshot',txid_current_snapshot()::text,
  'database',current_database(),'serverVersion',current_setting('server_version'),
  'timezone',current_setting('TimeZone'),'observedAt',clock_timestamp()::text)::text AS settings`;
const SEQUENCES_SQL = `SELECT COALESCE(json_agg(s ORDER BY s.schemaname,s.sequencename),'[]'::json)::text AS sequences
  FROM (SELECT schemaname,sequencename,data_type::text,start_value::text,min_value::text,max_value::text,
    increment_by::text,cycle,cache_size::text,last_value::text FROM pg_sequences
    WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') s`;
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function parseInventory(rows: Array<Record<string, string>>): SourceTable[] {
  const inventory = JSON.parse(rows[0]?.inventory || 'null');
  if (!Array.isArray(inventory) || inventory.some((table) => !table.schema || !table.name || !Array.isArray(table.columns))) {
    throw new Error('Source inventory is unavailable');
  }
  return inventory;
}
function tableRowsSql(table: SourceTable): string {
  if (table.kind !== 'r' || table.partition) throw new Error('Partitioned/foreign tables need a reviewed exporter; refusing incomplete backup');
  // Values are strings in the archive (except booleans/null). This avoids JS
  // timestamp, decimal, int8, array and nested JSON parser losses. Column types
  // in inventory describe the exact casts required by a restore tool.
  const fields = table.columns.flatMap((column) => [
    `'${column.name.replaceAll("'", "''")}'`,
    column.type === 'boolean' ? quote(column.name) : `${quote(column.name)}::text`,
  ]).join(',');
  if (table.columns.length > 50) throw new Error('Wide table exceeds reviewed export expression; refusing incomplete backup');
  return `SELECT json_build_object(${fields})::text AS row FROM ${quote(table.schema)}.${quote(table.name)}`;
}
export function tableStatsSql(table: SourceTable): string {
  return `SELECT count(*)::text AS row_count,COALESCE(sum(octet_length(to_json(row)::text)+32),0)::text AS wire_bytes FROM (${tableRowsSql(table)}) exported`;
}
export function tableExportSql(table: SourceTable, maxWireBytes?: number): string {
  if (maxWireBytes === undefined) return `SELECT row FROM (${tableRowsSql(table)}) exported ORDER BY row COLLATE "C"`;
  if (!Number.isSafeInteger(maxWireBytes) || maxWireBytes < 0) throw new Error('Invalid export response bound');
  // Materialize once inside this snapshot. A growing table returns no payload,
  // and its separate same-snapshot stats cause the entire export to be refused.
  return `WITH exported AS MATERIALIZED (${tableRowsSql(table)})
    SELECT row FROM exported WHERE (SELECT COALESCE(sum(octet_length(to_json(row)::text)+32),0) FROM exported)<=${maxWireBytes}
    ORDER BY row COLLATE "C"`;
}

/** One HTTPS transaction, no live multi-page reads and no unsupported fallback. */
export async function collectConsistentExport(source: ReadOnlyHttpSource, options: { maxResponseBytes?: number } = {}) {
  if (typeof source.transaction !== 'function') throw new Error('Repeatable-read HTTPS transactions are required');
  const planned = parseInventory(await source.query(INVENTORY_SQL));
  // Neon documents a 64 MB HTTPS request/response ceiling. Reserve headroom
  // for protocol/schema metadata, and refuse before transferring all rows.
  // https://neon.com/docs/serverless/serverless-driver
  const budget = options.maxResponseBytes ?? 60_000_000;
  if (!Number.isSafeInteger(budget) || budget <= 1_000_000 || budget > 60_000_000) throw new Error('Invalid one-shot response budget');
  const preflight = await source.transaction(planned.map(tableStatsSql), { isolationLevel: 'RepeatableRead', readOnly: true });
  if (preflight.length !== planned.length) throw new Error('Incomplete export size preflight');
  const caps = preflight.map((rows) => {
    const bytes = Number(rows[0]?.wire_bytes); const count = Number(rows[0]?.row_count);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid export size preflight');
    return Math.ceil(bytes * 1.05) + 1024;
  });
  if (caps.reduce((sum, bytes) => sum + bytes, 1_000_000) > budget) throw new Error('Source exceeds bounded HTTPS response mode; no rows were exported');
  const queries = [SETTINGS_SQL, INVENTORY_SQL, SEQUENCES_SQL, ...planned.map(tableStatsSql),
    ...planned.map((table, index) => tableExportSql(table, caps[index])), INVENTORY_SQL];
  const result = await source.transaction(queries, { isolationLevel: 'RepeatableRead', readOnly: true });
  if (result.length !== queries.length) throw new Error('Incomplete transaction response');
  const settings = JSON.parse(result[0]?.[0]?.settings || 'null');
  if (settings?.isolation !== 'repeatable read' || settings?.readOnly !== 'on' || !settings.snapshot) throw new Error('Source did not prove repeatable-read/read-only mode');
  const actual = parseInventory(result[1]); const after = parseInventory(result.at(-1)!);
  if (canonicalJson(planned) !== canonicalJson(actual) || canonicalJson(actual) !== canonicalJson(after)) throw new Error('Source schema changed during export planning; retry from a fresh inventory');
  const tables = planned.map((table, index) => {
    const stats = result[index + 3]?.[0];
    const bytes = Number(stats?.wire_bytes); const count = Number(stats?.row_count);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > caps[index] || !Number.isSafeInteger(count) || count < 0) throw new Error('Source grew beyond bounded HTTPS mode; retry after review');
    const lines = result[index + 3 + planned.length].map((value) => {
      if (typeof value.row !== 'string') throw new Error('Export row is not lossless server JSON text');
      const row = JSON.parse(value.row);
      if (canonicalJson(Object.keys(row).sort()) !== canonicalJson(table.columns.map((column) => column.name).sort())) throw new Error('Export row column mismatch');
      return value.row;
    });
    if (lines.length !== count) throw new Error('Export table count mismatch');
    return { source: table, count: lines.length, data: lines.length ? `${lines.join('\n')}\n` : '' };
  });
  return { settings, responseBudgetBytes: budget, sequences: JSON.parse(result[2]?.[0]?.sequences || 'null'), tables };
}

export async function assertProtectedDestination(output: string, repository: string): Promise<string> {
  if (!isAbsolute(output)) throw new Error('Export destination must be absolute and outside Git');
  const parent = await realpath(dirname(output));
  const repositoryReal = await realpath(repository);
  const destination = join(parent, output.split(sep).at(-1)!);
  const rel = relative(repositoryReal, destination);
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) throw new Error('Export destination is inside the repository');
  let enclosingGit: string | undefined;
  try { enclosingGit = execFileSync('git', ['-C', parent, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* outside Git */ }
  if (enclosingGit) throw new Error('Export destination must be outside every Git checkout');
  if ((await stat(parent)).mode & 0o077) throw new Error('Export parent must be private (chmod 700)');
  return destination;
}

/** Writes a new 0700 directory and 0600 files; a failed run has no completion manifest. */
export async function writeProtectedExport(data: Awaited<ReturnType<typeof collectConsistentExport>>, options: {
  output: string; repository: string; codeSha: string; createdAt?: string; maxBytes?: number;
}) {
  const output = await assertProtectedDestination(options.output, options.repository);
  const totalBytes = data.tables.reduce((total, table) => total + Buffer.byteLength(table.data), 0);
  if (totalBytes > (options.maxBytes ?? 60_000_000)) throw new Error('Export exceeds bounded one-transaction mode; use a reviewed snapshot/restore alternative');
  await mkdir(output, { mode: 0o700 }); // never overwrite a prior export
  const tables = [];
  for (const [index, table] of data.tables.entries()) {
    const file = `${String(index).padStart(3, '0')}.ndjson`;
    await writeFile(join(output, file), table.data, { mode: 0o600, flag: 'wx' });
    const hash = sha256(await readFile(join(output, file), 'utf8'));
    if (hash !== sha256(table.data)) throw new Error('Export readback checksum mismatch');
    tables.push({ ...table.source, file, rowCount: table.count, sha256: hash,
      timestampDecisions: table.source.columns.filter((column) => /^timestamp/.test(column.type)).map((column) => ({
        column: column.name, sourceType: column.type,
        destination: table.source.schema === 'public' && TYPED_TIMESTAMP_COLUMNS[table.source.name]?.includes(column.name)
          ? 'typed-canonical-column-requires-writer-evidence' : 'preserved-raw-private-history',
        writerTimezone: null, evidence: null,
      })),
      destination: table.source.schema === 'public' ? destinationFor(table.source.name)
        : { kind: 'archive', table: `${table.source.schema}.${table.source.name}` } });
  }
  const manifest = { schemaVersion: 1, exporterRevision: options.codeSha,
    createdAt: options.createdAt || new Date().toISOString(), mode: 'https-repeatable-read-single-transaction',
    valueEncoding: 'postgres-text-except-boolean-and-null', settings: data.settings,
    responseBudgetBytes: data.responseBudgetBytes,
    sequences: data.sequences, sequenceNote: 'Sequences are nontransactional observations; allocate D1 sequences after imported row maximum.',
    rightsRetention: 'Private recovery evidence only; every source field still requires retention/use review. No publication permission implied.',
    totalBytes, tables };
  const manifestText = `${canonicalJson(manifest)}\n`;
  await writeFile(join(output, 'manifest.json'), manifestText, { mode: 0o600, flag: 'wx' });
  await writeFile(join(output, 'manifest.sha256'), `${sha256(manifestText)}  manifest.json\n`, { mode: 0o600, flag: 'wx' });
  return { output, tableCount: tables.length, totalBytes, manifestSha256: sha256(manifestText) };
}

async function main(argv: string[]) {
  if (argv.includes('--help')) {
    console.log('Usage: node --experimental-strip-types scripts/catalog/export-postgres.ts --output /private/outside-git/new-export --execute-read-only\nRequires POSTGRES_URL, an existing private parent (0700), and explicit review before production execution. No dotenv/autobootstrap, TCP, source writes, or fallback paging.');
    return;
  }
  if (argv.length !== 3 || argv[0] !== '--output' || argv[2] !== '--execute-read-only') throw new Error('Explicit --output and --execute-read-only are required');
  const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  await assertProtectedDestination(argv[1], repository);
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('POSTGRES_URL is required; credentials are never read from public build files');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) throw new Error('Only the reviewed Neon HTTPS endpoint is supported');
  // Reuse the installed Vercel driver's HTTPS implementation, not its TCP client.
  const require = createRequire(import.meta.url);
  const driverPath = require.resolve('@neondatabase/serverless', { paths: [dirname(require.resolve('@vercel/postgres'))] });
  const { neon } = await import(pathToFileURL(driverPath).href);
  const sql = neon(connectionString);
  if (typeof sql.transaction !== 'function') throw new Error('Installed HTTPS driver lacks transaction support');
  const source: ReadOnlyHttpSource = {
    query: (query) => sql(query, []),
    transaction: (queries, options) => sql.transaction(queries.map((query) => sql(query, [])), options),
  };
  const data = await collectConsistentExport(source);
  console.log(JSON.stringify(await writeProtectedExport(data, { output: resolve(argv[1]), repository,
    codeSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Protected export failed; no source changes were made. Inspect the protected artifacts and retry only after review.'); process.exitCode = 1; });
}
