import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertPrivateOutsideGit, canonicalRowsHash, validateRecoveryArchive } from './recovery-archive.ts';
import type { RecoveryTable } from './recovery-archive.ts';
import { PGVECTOR_BINARY_ENCODING } from './pgvector-binary.ts';

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function literal(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function tableName(table: RecoveryTable): string { return `${quote(table.schema)}.${quote(table.name)}`; }

/** Raw data recovery types deliberately do not claim original PostgreSQL DDL. */
export function recoveryTableSql(table: RecoveryTable): string {
  const columns = table.columns.map((column) => `${quote(column.name)} ${table.columnEncodings[column.name] === PGVECTOR_BINARY_ENCODING
    ? 'bytea' : table.columnEncodings[column.name] === 'json-boolean' ? 'boolean' : 'text'}`);
  return `CREATE SCHEMA IF NOT EXISTS ${quote(table.schema)};
    CREATE TABLE ${tableName(table)} (${columns.join(',')},
      _archive_position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      _archive_row_json text NOT NULL);`;
}
export function recoveryPopulateSql(table: RecoveryTable): string {
  const fields = table.columns.map((column) => {
    const value = `(_archive_row_json::jsonb->>${literal(column.name)})`;
    const encoding = table.columnEncodings[column.name];
    return `${quote(column.name)}=${encoding === PGVECTOR_BINARY_ENCODING ? `decode(${value},'base64')`
      : encoding === 'json-boolean' ? `${value}::boolean` : value}`;
  });
  return `UPDATE ${tableName(table)} SET ${fields.join(',')};`;
}
export function recoveryReadbackSql(table: RecoveryTable): string {
  const fields = table.columns.flatMap((column) => [literal(column.name), table.columnEncodings[column.name] === PGVECTOR_BINARY_ENCODING
    ? `replace(encode(${quote(column.name)},'base64'),chr(10),'')` : quote(column.name)]);
  return `SELECT json_build_object(${fields.join(',')})::text FROM ${tableName(table)} ORDER BY _archive_position;`;
}

/** Fresh cluster only; no DSN, existing database or Docker target is accepted. */
export async function runLocalRecoveryDrill(options: {
  archive: string; expectedManifestSha256: string; workParent: string; pgBin: string; expectedTableCount?: number;
}) {
  const archive = await validateRecoveryArchive(options.archive, {
    expectedManifestSha256: options.expectedManifestSha256, expectedTableCount: options.expectedTableCount,
  });
  const workParent = await assertPrivateOutsideGit(options.workParent);
  if (!/^[A-Za-z0-9_./-]+$/.test(workParent)) throw new Error('Unsupported recovery parent path syntax');
  if (!isAbsolute(options.pgBin)) throw new Error('Explicit absolute PostgreSQL binary directory is required');
  const pgBin = resolve(options.pgBin);
  for (const name of ['initdb', 'pg_ctl', 'psql', 'postgres']) if (!(await lstat(join(pgBin, name))).isFile()) throw new Error('PostgreSQL binaries are unavailable');
  const work = await mkdtemp(join(workParent, 'recovery-pg14-'));
  const data = join(work, 'pgdata');
  const socket = await mkdtemp('/tmp/sg-recovery-');
  // pg_ctl passes its options through a shell; these generated paths cannot
  // contain shell syntax, whitespace or quote injection.
  if (![data, socket].every((path) => /^[A-Za-z0-9_./-]+$/.test(path))) throw new Error('Unsupported recovery path syntax');
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: `${pgBin}:/usr/bin:/bin`, LANG: 'C', LC_ALL: 'C', TZ: 'UTC', PGAPPNAME: 'stupid-gifts-recovery-drill' };
  const log = join(work, 'commands.log');
  await writeFile(log, '', { mode: 0o600, flag: 'wx' });
  await writeFile(join(work, 'postgres.log'), '', { mode: 0o600, flag: 'wx' });
  let started = false; let stopped = false; let failure: unknown;
  const results: Array<Record<string, unknown>> = [];
  function command(name: string, args: string[], input?: string): Buffer {
    try { return execFileSync(join(pgBin, name), args, { env, input, maxBuffer: 96 * 1024 * 1024, timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) {
      const diagnostic = error as { stderr?: Buffer; stdout?: Buffer };
      // Private output stays private, including PostgreSQL error context.
      appendFileSync(log, Buffer.concat([diagnostic.stdout || Buffer.alloc(0), diagnostic.stderr || Buffer.alloc(0)]));
      throw new Error('Disposable PostgreSQL command failed; see protected logs');
    }
  }
  const psqlArgs = ['--host', socket, '--port', '5432', '--username', 'catalog_recovery', '--dbname', 'postgres',
    '--no-password', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1'];
  const sql = (input: string) => command('psql', psqlArgs, input).toString('utf8');
  let postgresVersion = '';
  let serverSettings: Record<string, string> | null = null;
  try {
    postgresVersion = command('postgres', ['--version']).toString().trim();
    command('initdb', ['--pgdata', data, '--username', 'catalog_recovery', '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--no-locale', '--no-instructions']);
    started = true; // Even a failed startup wait requires cleanup of this fresh cluster.
    command('pg_ctl', ['--pgdata', data, '--log', join(work, 'postgres.log'), '--wait', '--timeout', '30', '--options',
      `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c timezone=UTC -c log_statement=none -c log_min_error_statement=panic`, 'start']);
    const settings = sql("SELECT json_build_object('listenAddresses',current_setting('listen_addresses'),'socketDirectory',current_setting('unix_socket_directories'))::text;\n");
    const actual = JSON.parse(settings.trim());
    if (actual.listenAddresses !== '' || actual.socketDirectory !== socket) throw new Error('Disposable instance is not Unix-socket-only');
    serverSettings = actual;
    for (const table of archive.tables) {
      const definition = table.definition;
      sql(recoveryTableSql(definition));
      // Valid JSON has no literal U+0001/U+0002 bytes, so this one-column CSV
      // framing preserves every backslash and UTF-8 byte of the original row.
      sql(`COPY ${tableName(definition)} (_archive_row_json) FROM STDIN WITH
        (FORMAT csv, DELIMITER E'\\x02', QUOTE E'\\x01', ESCAPE E'\\x01');\n${table.raw}\\.\n`);
      sql(recoveryPopulateSql(definition));
      const raw = sql(`SELECT _archive_row_json FROM ${tableName(definition)} ORDER BY _archive_position;\n`);
      if (createHash('sha256').update(raw).digest('hex') !== definition.sha256) throw new Error('Restored raw row bytes differ from protected source');
      const restored = sql(recoveryReadbackSql(definition)).trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
      if (restored.length !== table.rows.length || canonicalRowsHash(restored) !== table.canonicalRowsSha256) throw new Error('Restored field values, nulls or native vector bytes differ');
      results.push({ schema: definition.schema, name: definition.name, rowCount: restored.length,
        rawSha256: definition.sha256, canonicalRowsSha256: table.canonicalRowsSha256,
        vectorCount: table.vectorCount, vectorBytesSha256: table.vectorBytesSha256 });
    }
  } catch (error) { failure = error; }
  finally {
    if (started) {
      try { command('pg_ctl', ['--pgdata', data, '--wait', '--timeout', '30', '--mode', 'fast', 'stop']); stopped = true; }
      catch { failure ||= new Error('Fresh cluster cleanup failed; do not remove a running cluster'); }
    }
    if (!started || stopped) {
      await rm(data, { recursive: true, force: true });
      await rm(socket, { recursive: true, force: true });
    }
  }
  const implementationFiles = Object.fromEntries(await Promise.all(['recovery-drill.ts', 'recovery-archive.ts', 'migration.ts', 'pgvector-binary.ts'].map(async (file) => [file,
    createHash('sha256').update(await readFile(new URL(file, import.meta.url))).digest('hex')])));
  const receipt = { schemaVersion: 1, status: failure ? 'failed' : 'passed', scope: 'raw-archive-data-restoration-not-original-schema',
    generatedAt: new Date().toISOString(), postgresVersion, pgBin, serverSettings, implementationFiles, clusterStopped: stopped,
    freshClusterDataRemoved: !started || stopped, archive: archive.directory, ...archive.summary, restoredTables: results,
    limitations: ['Original pgvector type not restored; native payloads restored as BYTEA.',
      'Original type/domain/default/index/function/trigger/RLS/ownership/extension behavior not recreated.',
      'Source role visibility and post-cutover D1 delta recovery remain separate gates.'] };
  const receiptPath = join(work, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  if (failure) throw new Error(`Recovery drill failed; protected receipt: ${receiptPath}`);
  return { receiptPath, receipt };
}

async function main(argv: string[]) {
  if (argv.includes('--help')) {
    console.log('Usage: recovery-drill.ts --archive /private/export --manifest-sha SHA [--work-parent /private/parent --pg-bin /absolute/bin --run-local-drill]\nDefault validates offline only. Local drill creates and stops its own fresh Unix-socket-only cluster; no existing DB or DSN is accepted.'); return;
  }
  const values: Record<string, string> = {}; let execute = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run-local-drill') { execute = true; continue; }
    if (!['--archive','--manifest-sha','--work-parent','--pg-bin'].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Invalid recovery argument');
    if (values[argv[i]]) throw new Error('Duplicate recovery argument');
    values[argv[i]] = argv[++i];
  }
  if (!values['--archive'] || !values['--manifest-sha']) throw new Error('Archive and independently recorded manifest checksum required');
  if (!execute) {
    const validated = await validateRecoveryArchive(values['--archive'], { expectedManifestSha256: values['--manifest-sha'] });
    console.log(JSON.stringify({ status: 'offline_validation_passed', ...validated.summary })); return;
  }
  if (!values['--work-parent'] || !values['--pg-bin']) throw new Error('Explicit private work parent and binary path required');
  const result = await runLocalRecoveryDrill({ archive: values['--archive'], expectedManifestSha256: values['--manifest-sha'],
    workParent: values['--work-parent'], pgBin: values['--pg-bin'] });
  console.log(JSON.stringify({ status: result.receipt.status, receiptPath: result.receiptPath,
    tableCount: result.receipt.tableCount, totalRows: result.receipt.totalRows, vectorCount: result.receipt.vectorCount,
    clusterStopped: result.receipt.clusterStopped, freshClusterDataRemoved: result.receipt.freshClusterDataRemoved }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error && error.message.startsWith('Recovery drill failed; protected receipt:')
      ? error.message : 'Recovery verification failed; inspect the protected receipt/logs. No existing database was targeted.');
    process.exitCode = 1;
  });
}
