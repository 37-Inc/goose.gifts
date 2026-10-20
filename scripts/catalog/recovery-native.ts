import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { lstat, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertPrivateOutsideGit, canonicalRowsHash, validateRecoveryArchive } from './recovery-archive.ts';
import type { RecoveryTable } from './recovery-archive.ts';
import { canonicalJson } from './migration.ts';
import { decodePgvectorSendBase64, PGVECTOR_BINARY_ENCODING } from './pgvector-binary.ts';
import { validateRecoveryMetadata } from './recovery-metadata.ts';
import type { RecoveryMetadata } from './recovery-metadata.ts';

// Maintainer-published 0.8.0-pg17 ARM64 manifest, independently inspected before use.
export const NATIVE_IMAGE = 'pgvector/pgvector@sha256:09c8aaae717baf4412f6efd174f51172c0638720a72a86e804cd698197fc8ba2';
type Row = Record<string, string | boolean | null>;
export interface NativeTable extends RecoveryTable {
  columns: Array<RecoveryTable['columns'][number] & { default?: string | null }>;
  indexes: Array<{ name: string; definition: string }>;
}
interface Sequence { schemaname: string; sequencename: string; data_type: string; increment_by: string;
  min_value: string; max_value: string; start_value: string; cache_size: string; cycle: boolean; last_value: string | null }
interface Audit { readOnly: boolean; isolation: string;
  tables: Array<{ schema_name: string; relname: string; relkind: string; can_select: boolean; active_rls_for_export_role: boolean;
    relrowsecurity: boolean; relforcerowsecurity: boolean; relispartition: boolean; relhassubclass: boolean; inherits_from_parent: boolean }>;
  functions: Array<{ schema_name: string; proname: string; arguments: string; definition: string }>;
  triggers: Array<{ schema_name: string; relname: string; tgname: string; definition: string }>;
  extensions: Array<{ extname: string; extversion: string; schema_name: string }>; policies: unknown[] }
function q(value: string): string {
  if (typeof value!=='string'||!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Native restore identifier requires review');
  return `"${value}"`;
}
function literal(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function name(table: RecoveryTable): string { return `${q(table.schema)}.${q(table.name)}`; }
function type(value: string): string {
  if (!/^(?:integer|bigint|text|uuid|jsonb|boolean|text\[\]|timestamp (?:with|without) time zone|character varying\([1-9]\d*\)|numeric\([1-9]\d*,\d+\)|vector\(1536\))$/.test(value)) throw new Error('Native restore type requires review');
  return value;
}
function primaryKey(table: RecoveryTable): string[] {
  const key = table.constraints.find((c) => c.definition.startsWith('PRIMARY KEY ('))?.definition.match(/^PRIMARY KEY \(([^)]+)\)$/)?.[1];
  if (!key) throw new Error('Native restore requires an archived primary key');
  return key.split(',').map((part) => { const id = part.trim().replaceAll('"', ''); q(id); return id; });
}
export function nativeTableSql(table: NativeTable): string {
  return `CREATE SCHEMA IF NOT EXISTS ${q(table.schema)}; CREATE TABLE ${name(table)} (${table.columns.map((c) => `${q(c.name)} ${type(c.type)}${c.nullable ? '' : ' NOT NULL'}`).join(',')});`;
}
/** COPY's native binary framing; vector payload is used byte-for-byte, never decimalized. */
export function nativeVectorCopy(rows: Row[], column: string): Buffer {
  const header = Buffer.alloc(19); Buffer.from('PGCOPY\n\xff\r\n\0', 'binary').copy(header);
  const chunks = [header];
  rows.forEach((row, i) => {
    const value = row[column];
    if (value !== null) decodePgvectorSendBase64(value); // Strict dimensions/finite floats/header validation.
    const payload = value === null ? null : Buffer.from(String(value), 'base64');
    const framing = Buffer.alloc(18); framing.writeInt16BE(2); framing.writeInt32BE(8, 2);
    framing.writeBigInt64BE(BigInt(i + 1), 6); framing.writeInt32BE(payload?.length ?? -1, 14);
    chunks.push(framing); if (payload) chunks.push(payload);
  });
  const end = Buffer.alloc(2); end.writeInt16BE(-1); chunks.push(end); return Buffer.concat(chunks);
}
export function nativeInsertSql(table: NativeTable, ordinal: number): string {
  const vectors = table.columns.filter((c) => table.columnEncodings[c.name] === PGVECTOR_BINARY_ENCODING);
  if (vectors.length > 1) throw new Error('Multiple native vector columns need review');
  const fields = table.columns.map((c) => table.columnEncodings[c.name] === PGVECTOR_BINARY_ENCODING ? 'v.embedding' : `(s.row_json::jsonb->>${literal(c.name)})::${type(c.type)}`);
  return `INSERT INTO ${name(table)} (${table.columns.map((c) => q(c.name)).join(',')}) SELECT ${fields.join(',')} FROM _catalog_recovery.s${ordinal} s${vectors.length ? ` JOIN _catalog_recovery.v${ordinal} v USING (position)` : ''} ORDER BY s.position;`;
}
export function nativeReadbackSql(table: NativeTable, ordinal: number): string {
  const fields = table.columns.flatMap((c) => [literal(c.name), table.columnEncodings[c.name] === PGVECTOR_BINARY_ENCODING
    ? `replace(encode(vector_send(t.${q(c.name)}),'base64'),chr(10),'')` : `t.${q(c.name)}${c.type === 'boolean' ? '' : '::text'}`]);
  const join = primaryKey(table).map((column) => {
    const definition = table.columns.find((c) => c.name === column); if (!definition) throw new Error('Primary key column missing');
    return `t.${q(column)}=(s.row_json::jsonb->>${literal(column)})::${type(definition.type)}`;
  }).join(' AND ');
  return `SELECT json_build_object(${fields.join(',')})::text FROM ${name(table)} t JOIN _catalog_recovery.s${ordinal} s ON ${join} ORDER BY s.position;`;
}
function defaultSql(value: string): string {
  if (!/^(?:now\(\)|gen_random_uuid\(\)|true|false|-?\d+|'[^']*'::(?:character varying|jsonb)|nextval\('[a-z_.]+'::regclass\))$/.test(value)) throw new Error('Column default requires explicit review');
  return value;
}
export function nativeSequenceSql(s: Sequence, state?: RecoveryMetadata['sequences'][number]): string {
  if (!['integer', 'bigint'].includes(s.data_type) || typeof s.cycle!=='boolean'
    || (s.last_value!==null&&typeof s.last_value!=='string')
    || [s.increment_by, s.min_value, s.max_value, s.start_value, s.cache_size, s.last_value ?? '0'].some((v) => typeof v!=='string'||!/^-?\d+$/.test(v))) throw new Error('Sequence metadata requires review');
  const configuration=Object.fromEntries(Object.entries(s).filter(([key])=>!['schemaname','sequencename','last_value'].includes(key)));
  if (state && (state.schema!==s.schemaname || state.name!==s.sequencename || canonicalJson(state.configuration)!==canonicalJson(configuration)
    || typeof state.lastValue!=='string' || !/^-?\d+$/.test(state.lastValue) || typeof state.isCalled!=='boolean' || BigInt(state.lastValue)<BigInt(s.min_value)
    || BigInt(state.lastValue)>BigInt(s.max_value))) throw new Error('Sequence metadata differs from recorded configuration');
  const id = `${q(s.schemaname)}.${q(s.sequencename)}`;
  const value=state?.lastValue??s.last_value;
  return `CREATE SEQUENCE ${id} AS ${s.data_type} INCREMENT ${s.increment_by} MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START ${s.start_value} CACHE ${s.cache_size} ${s.cycle ? '' : 'NO '}CYCLE;${value === null ? '' : ` SELECT setval(${literal(id)}::regclass,${value},${state?state.isCalled:true});`}`;
}
export function nativeTriggerModeSql(t: RecoveryMetadata['triggers'][number]): string {
  const mode: Record<string,string>={O:'ENABLE',D:'DISABLE',R:'ENABLE REPLICA',A:'ENABLE ALWAYS'};
  if (!Object.hasOwn(mode,t.enabled)) throw new Error('Trigger mode requires review');
  return `ALTER TABLE ${q(t.schema)}.${q(t.table)} ${mode[t.enabled]} TRIGGER ${q(t.name)};`;
}
export function validateNativeAudit(audit: Audit, tables: RecoveryTable[]): void {
  if (tables.some((t) => !['public', 'drizzle'].includes(t.schema)) || audit.readOnly !== true || !['repeatable read', 'RepeatableRead'].includes(audit.isolation) || audit.policies.length || audit.tables.length !== tables.length
    || new Set(audit.tables.map((t) => `${t.schema_name}.${t.relname}`)).size !== tables.length
    || audit.tables.some((t) => t.relkind !== 'r' || t.can_select !== true || [t.active_rls_for_export_role, t.relrowsecurity,
      t.relforcerowsecurity, t.relispartition, t.relhassubclass, t.inherits_from_parent].some((flag) => flag !== false)
      || !tables.some((expected) => expected.schema === t.schema_name && expected.name === t.relname))) throw new Error('Native recovery requires a complete visible ordinary-table audit');
  if (audit.extensions.length !== 2 || !audit.extensions.some((e) => e.extname === 'vector' && e.extversion === '0.8.0' && e.schema_name === 'public')
    || !audit.extensions.some((e) => e.extname === 'plpgsql' && e.extversion === '1.0')) throw new Error('Native extension inventory mismatch');
  const functions = ['assign_product_public_identity', 'preserve_product_slug_history'];
  const triggers = ['products_assign_public_identity', 'products_preserve_slug_history'];
  if (audit.functions.length !== 2 || new Set(audit.functions.map((f) => f.proname)).size !== 2
    || audit.functions.some((f) => f.schema_name !== 'public' || f.arguments !== '' || !functions.includes(f.proname)
      || !f.definition.startsWith(`CREATE OR REPLACE FUNCTION public.${f.proname}()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$`))
    || audit.triggers.length !== 2 || new Set(audit.triggers.map((t) => t.tgname)).size !== 2
    || audit.triggers.some((t) => t.schema_name !== 'public' || t.relname !== 'products' || !triggers.includes(t.tgname)
      || !t.definition.startsWith(`CREATE TRIGGER ${t.tgname} BEFORE `))) throw new Error('Native function/trigger inventory requires review');
}
async function pinnedJson(path: string, expected: string) {
  await assertPrivateOutsideGit(dirname(path)); const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 1_000_000) throw new Error('Native metadata must remain private and bounded');
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Native metadata independently recorded checksum mismatch');
  return JSON.parse(bytes.toString('utf8'));
}
function schemaSql(table: NativeTable): string {
  const relation = `${literal(name(table))}::regclass`;
  return `SELECT json_build_object('columns',(SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=${relation} AND a.attnum>0 AND NOT a.attisdropped),'constraints',(SELECT coalesce(json_agg(json_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname),'[]') FROM pg_constraint WHERE conrelid=${relation}),'indexes',(SELECT coalesce(json_agg(json_build_object('name',c.relname,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY c.relname),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=${relation}))::text;`;
}

/** Fresh uniquely labeled container/volume only. No DSN or existing resource input exists. */
export async function runNativeRecovery(options: { archive: string; expectedManifestSha256: string; audit: string;
  expectedAuditSha256: string; workParent: string; metadata?: string; expectedMetadataSha256?: string }) {
  const archive = await validateRecoveryArchive(options.archive, { expectedManifestSha256: options.expectedManifestSha256 });
  const manifest = await pinnedJson(join(archive.directory, 'manifest.json'), options.expectedManifestSha256) as { tables: NativeTable[]; sequences: Sequence[];
    settings: {database:string;snapshot:string;observedAt:string;serverVersion?:string}; recoveryMetadata?: RecoveryMetadata };
  const audit = await pinnedJson(options.audit, options.expectedAuditSha256) as Audit;
  validateNativeAudit(audit, manifest.tables);
  if (Boolean(options.metadata)!==Boolean(options.expectedMetadataSha256) || (options.metadata&&manifest.recoveryMetadata)) throw new Error('One explicitly pinned metadata source is required');
  const metadata: RecoveryMetadata | undefined = options.metadata
    ? await pinnedJson(options.metadata,options.expectedMetadataSha256!) : manifest.recoveryMetadata;
  if (metadata) {
    validateRecoveryMetadata(metadata,options.expectedManifestSha256,manifest.settings);
    if (options.metadata&&metadata.binding.kind!=='later-observation') throw new Error('A supplement is never original-transaction evidence');
    if (metadata.sequences.length!==manifest.sequences.length || metadata.sequences.some(s=>!manifest.sequences.some(m=>m.schemaname===s.schema&&m.sequencename===s.name))
      || metadata.triggers.length!==audit.triggers.length || metadata.triggers.some(t=>!audit.triggers.some(a=>a.schema_name===t.schema&&a.relname===t.table&&a.tgname===t.name&&a.definition===t.definition))) throw new Error('Metadata sequence/trigger inventory or definition changed');
    for (const s of metadata.sequences) for (const owned of s.ownedBy) {
      if (!manifest.tables.some(t=>t.schema===owned.schema&&t.name===owned.table&&t.columns.some(c=>c.name===owned.column&&['integer','bigint'].includes(c.type)))) throw new Error('Sequence ownership target requires review');
    }
    metadata.triggers.forEach(nativeTriggerModeSql);
  }
  const sequenceState=(s:Sequence)=>metadata?.sequences.find(m=>m.schema===s.schemaname&&m.name===s.sequencename);
  manifest.tables.forEach((t, i) => { nativeTableSql(t); nativeInsertSql(t, i); primaryKey(t); t.columns.filter((c) => c.default).forEach((c) => defaultSql(c.default!)); });
  manifest.sequences.forEach(s=>nativeSequenceSql(s,sequenceState(s)));
  if (manifest.sequences.some((s) => !['public', 'drizzle'].includes(s.schemaname))) throw new Error('Unexpected sequence schema');
  const parent = await assertPrivateOutsideGit(options.workParent); const work = await mkdtemp(join(parent, 'recovery-native-pg17-'));
  const token = randomUUID(); const container = `sg-recovery-${token}`; const volume = `${container}-data`; const label = `goose.catalog.recovery=${token}`;
  const log = join(work, 'commands.log'); await writeFile(log, '', { mode: 0o600, flag: 'wx' });
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST,
    DOCKER_CONTEXT: process.env.DOCKER_CONTEXT, LANG: 'C', TZ: 'UTC', NODE_ENV: 'test' };
  function command(args: string[], input?: string | Buffer): Buffer {
    try { return execFileSync('docker', args, { env, input, timeout: 60_000, maxBuffer: 96 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { const e = error as { stdout?: Buffer; stderr?: Buffer }; appendFileSync(log, Buffer.concat([e.stdout || Buffer.alloc(0), e.stderr || Buffer.alloc(0)])); throw new Error('Native recovery command failed; protected diagnostics retained'); }
  }
  const psql = ['exec', '--user', 'postgres', '-i', container, 'psql', '-X', '-qAt', '--no-password', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = (value: string) => command(psql, `SET timezone='GMT'; SET datestyle='ISO, YMD'; SET extra_float_digits=3; SET statement_timeout='55s';\n${value}`).toString('utf8');
  let volumeCreated = false; let containerCreated = false; let cleaned = false; let diagnosticsCollectionFailed = false; let failure: unknown;
  let settings: Record<string, unknown> | null = null; const reconciled: Array<Record<string, unknown>> = [];
  try {
    if (env.DOCKER_HOST && env.DOCKER_CONTEXT) throw new Error('Ambiguous Docker endpoint refused');
    const endpoint = env.DOCKER_HOST || JSON.parse(command(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']).toString());
    if (typeof endpoint !== 'string' || !endpoint.startsWith('unix://')) throw new Error('Native recovery requires a local Unix Docker endpoint');
    const image = JSON.parse(command(['image', 'inspect', NATIVE_IMAGE]).toString())[0];
    if (image.Architecture !== 'arm64' || image.Os !== 'linux') throw new Error('Pinned native ARM64 image must be pulled explicitly before the drill');
    command(['volume', 'create', '--label', label, volume]); volumeCreated = true;
    command(['create', '--name', container, '--label', label, '--network', 'none', '--memory', '1g', '--cpus', '2', '--shm-size', '128m',
      '--mount', `type=volume,source=${volume},target=/var/lib/postgresql/data`, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', NATIVE_IMAGE,
      'postgres', '-c', 'listen_addresses=', '-c', 'unix_socket_permissions=0700', '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic']);
    containerCreated = true;
    command(['start', container]);
    const actual = JSON.parse(command(['inspect', container]).toString())[0];
    if (actual.HostConfig.NetworkMode !== 'none' || Object.keys(actual.HostConfig.PortBindings || {}).length
      || actual.Config.Labels['goose.catalog.recovery'] !== token || actual.Mounts.length !== 1 || actual.Mounts[0].Name !== volume) throw new Error('Native container isolation verification failed');
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        // The image briefly starts a temporary initdb server. Only the final
        // exec'd PostgreSQL is PID1; pg_isready alone can observe that temporary server.
        if (command(['exec', '--user', 'postgres', container, 'cat', '/proc/1/comm']).toString().trim() === 'postgres') {
          command(['exec', '--user', 'postgres', container, 'pg_isready', '-q', '-h', '/var/run/postgresql', '-U', 'postgres']); ready = true; break;
        }
      } catch { /* startup is bounded; only final PID1 readiness counts */ }
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!ready) throw new Error('Native PostgreSQL did not become ready');
    sql("CREATE EXTENSION vector VERSION '0.8.0'; CREATE SCHEMA _catalog_recovery;");
    settings = JSON.parse(sql("SELECT json_build_object('serverVersion',current_setting('server_version'),'listenAddresses',current_setting('listen_addresses'),'vectorVersion',(SELECT extversion FROM pg_extension WHERE extname='vector'))::text;").trim());
    if (!String(settings?.serverVersion).startsWith('17.') || settings?.listenAddresses !== '' || settings?.vectorVersion !== '0.8.0') throw new Error('Native server/version/isolation mismatch');
    for (const schema of new Set(manifest.tables.map((t) => t.schema))) sql(`CREATE SCHEMA IF NOT EXISTS ${q(schema)};`);
    for (const sequence of manifest.sequences) sql(nativeSequenceSql(sequence,sequenceState(sequence)));
    for (let i = 0; i < archive.tables.length; i++) {
      const source = archive.tables[i]; const table = manifest.tables[i]; sql(nativeTableSql(table));
      sql(`CREATE TABLE _catalog_recovery.s${i} (position bigint GENERATED ALWAYS AS IDENTITY, row_json text NOT NULL); COPY _catalog_recovery.s${i} (row_json) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\x02', QUOTE E'\\x01', ESCAPE E'\\x01');\n${source.raw}\\.\n`);
      for (const c of table.columns.filter((c) => table.columnEncodings[c.name] === PGVECTOR_BINARY_ENCODING)) {
        sql(`CREATE TABLE _catalog_recovery.v${i} (position bigint, embedding vector(1536));`);
        command([...psql, '-c', `COPY _catalog_recovery.v${i} FROM STDIN WITH (FORMAT binary)`], nativeVectorCopy(source.rows, c.name));
      }
      sql(nativeInsertSql(table, i));
      for (const c of table.columns.filter((c) => c.default)) sql(`ALTER TABLE ${name(table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${defaultSql(c.default!)};`);
    }
    // Restore constraints only after all data: all referenced parents now exist.
    for (const foreign of [false, true]) for (const table of manifest.tables) for (const c of table.constraints.filter((c) => c.definition.startsWith('FOREIGN KEY') === foreign)) sql(`ALTER TABLE ${name(table)} ADD CONSTRAINT ${q(c.name)} ${c.definition};`);
    for (const table of manifest.tables) for (const index of table.indexes.filter((i) => !table.constraints.some((c) => c.name === i.name))) {
      if (!index.definition.startsWith(`CREATE ${index.definition.startsWith('CREATE UNIQUE ') ? 'UNIQUE ' : ''}INDEX ${index.name} ON ${table.schema}.${table.name} USING `)
        || !/ USING (?:btree|gin|hnsw) \(/.test(index.definition) || /[;\r\n]/.test(index.definition)) throw new Error('Index DDL requires review');
      sql(index.definition);
    }
    for (const f of audit.functions) sql(f.definition);
    for (const t of audit.triggers) sql(t.definition);
    if (metadata) {
      for (const s of metadata.sequences) for (const owned of s.ownedBy)
        sql(`ALTER SEQUENCE ${q(s.schema)}.${q(s.name)} OWNED BY ${q(owned.schema)}.${q(owned.table)}.${q(owned.column)};`);
      for (const t of metadata.triggers) sql(nativeTriggerModeSql(t));
    }
    for (let i = 0; i < manifest.tables.length; i++) {
      const table = manifest.tables[i]; const source = archive.tables[i];
      const raw = sql(`SELECT row_json FROM _catalog_recovery.s${i} ORDER BY position;`);
      if (createHash('sha256').update(raw).digest('hex') !== table.sha256) throw new Error('Native raw archive bytes differ');
      const rows = sql(nativeReadbackSql(table, i)).trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
      if (rows.length !== source.rows.length || canonicalRowsHash(rows) !== source.canonicalRowsSha256
        || Number(sql(`SELECT count(*) FROM ${name(table)};`).trim()) !== rows.length) throw new Error('Native typed values/vector_send bytes/count differ');
      const actualSchema = JSON.parse(sql(schemaSql(table)).trim());
      const expectedSchema = { columns: table.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, default: c.default || null })),
        constraints: [...table.constraints].sort((a, b) => a.name.localeCompare(b.name)), indexes: [...table.indexes].sort((a, b) => a.name.localeCompare(b.name)) };
      if (canonicalJson(actualSchema) !== canonicalJson(expectedSchema)) {
        appendFileSync(log, JSON.stringify({ table: `${table.schema}.${table.name}`, expectedSchema, actualSchema }) + '\n');
        throw new Error('Native schema definitions differ');
      }
      reconciled.push({ schema: table.schema, name: table.name, rowCount: rows.length, rawSha256: table.sha256,
        canonicalRowsSha256: source.canonicalRowsSha256, vectorCount: source.vectorCount, vectorBytesSha256: source.vectorBytesSha256,
        columns: table.columns.length, constraints: table.constraints.length, indexes: table.indexes.length });
    }
    for (const f of audit.functions) if (sql(`SELECT pg_get_functiondef(${literal(`${f.schema_name}.${f.proname}()`)}::regprocedure);`).trim() !== f.definition.trim()) throw new Error('Native function definition differs');
    for (const t of audit.triggers) if (sql(`SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid=${literal(`${t.schema_name}.${t.relname}`)}::regclass AND tgname=${literal(t.tgname)};`).trim() !== t.definition) throw new Error('Native trigger definition differs');
    if (metadata) for (const t of metadata.triggers)
      if (sql(`SELECT tgenabled FROM pg_trigger WHERE tgrelid=${literal(`${t.schema}.${t.table}`)}::regclass AND tgname=${literal(t.name)};`).trim()!==t.enabled) throw new Error('Native trigger mode differs');
    for (const s of manifest.sequences) {
      const actual = JSON.parse(sql(`SELECT json_build_object('schemaname',schemaname,'sequencename',sequencename,'data_type',data_type::text,'start_value',start_value::text,'min_value',min_value::text,'max_value',max_value::text,'increment_by',increment_by::text,'cycle',cycle,'cache_size',cache_size::text,'last_value',last_value::text)::text FROM pg_sequences WHERE schemaname=${literal(s.schemaname)} AND sequencename=${literal(s.sequencename)};`).trim());
      const state=sequenceState(s);
      if (canonicalJson(actual) !== canonicalJson(state?{...s,last_value:state.isCalled?state.lastValue:null}:s)) throw new Error('Native observed sequence configuration/high-water differs');
      if (state) {
        const observed=JSON.parse(sql(`SELECT json_build_object('lastValue',last_value::text,'isCalled',is_called)::text FROM ${q(s.schemaname)}.${q(s.sequencename)};`).trim());
        const ownership=JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'column',a.attname,'dependency',d.deptype::text)),'[]')::text
          FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace
          JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid WHERE d.classid='pg_class'::regclass
          AND d.objid=${literal(`${q(s.schemaname)}.${q(s.sequencename)}`)}::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN('a','i');`).trim());
        if (canonicalJson(observed)!==canonicalJson({lastValue:state.lastValue,isCalled:state.isCalled}) || canonicalJson(ownership)!==canonicalJson(state.ownedBy)) throw new Error('Native sequence state/ownership differs');
      }
    }
  } catch (error) { failure = error; }
  finally {
    try {
      if (containerCreated) {
        const item = JSON.parse(command(['inspect', container]).toString())[0];
        if (item.Config.Labels['goose.catalog.recovery'] !== token) throw new Error('Cleanup ownership mismatch');
        try { appendFileSync(log, command(['logs', container])); } catch { diagnosticsCollectionFailed = true; }
        command(['stop', '--time', '10', container]); command(['rm', container]);
      }
      if (volumeCreated) {
        const item = JSON.parse(command(['volume', 'inspect', volume]).toString())[0];
        if (item.Labels['goose.catalog.recovery'] !== token) throw new Error('Cleanup volume ownership mismatch');
        command(['volume', 'rm', volume]);
      }
      if (command(['container', 'ls', '--all', '--filter', `label=${label}`, '--format', '{{.ID}}']).toString().trim()
        || command(['volume', 'ls', '--filter', `label=${label}`, '--format', '{{.Name}}']).toString().trim()) throw new Error('Owned recovery resources still present');
      cleaned = true;
    } catch { failure ||= new Error('Only newly created recovery resources require manual cleanup'); }
  }
  const implementationSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
  const implementationFiles = Object.fromEntries(await Promise.all(['recovery-native.ts', 'recovery-archive.ts', 'recovery-metadata.ts', 'migration.ts', 'pgvector-binary.ts'].map(async (file) => [file,
    createHash('sha256').update(await readFile(new URL(file, import.meta.url))).digest('hex')])));
  const sourceVersion=manifest.settings.serverVersion??null;
  const sourceMinor=sourceVersion?.match(/^(\d+)\.(\d+)/);const restoredMinor=String(settings?.serverVersion||'').match(/^(\d+)\.(\d+)/);
  const receipt = { schemaVersion: 1, status: failure ? 'failed' : 'passed', scope: 'native-typed-data-and-recorded-schema-not-full-cluster-recovery',
    generatedAt: new Date().toISOString(), image: NATIVE_IMAGE, implementationSha256, implementationFiles, settings, container, volume, resourceLabel: label, resourcesRemoved: cleaned, diagnosticsCollectionFailed,
    failureReason: failure instanceof Error ? failure.message : null,
    archive: archive.directory, ...archive.summary, metadataAuditSha256: options.expectedAuditSha256, reconciledTables: reconciled,
    functionsReconciled: failure ? null : audit.functions.length, triggersReconciled: failure ? null : audit.triggers.length,
    observedSequencesReconciled: failure ? null : manifest.sequences.length,
    versionComparison: {source:sourceVersion,restored:settings?.serverVersion??null,classification:!sourceMinor||!restoredMinor?'unknown'
      :sourceMinor[0]===restoredMinor[0]?'same-major-and-minor':sourceMinor[1]===restoredMinor[1]?'same-major-different-minor':'different-major'},
    recoveryMetadata: metadata?{sha256:createHash('sha256').update(canonicalJson(metadata)).digest('hex'),binding:metadata.binding,source:metadata.source,
      artifactSha256:options.expectedMetadataSha256??null,sequenceStatesReconciled:failure?null:metadata.sequences.length,
      triggerModesReconciled:failure?null:metadata.triggers.length,aclSettingsReplayed:false,
      aclEvidenceSha256:createHash('sha256').update(canonicalJson(metadata.aclEvidence)).digest('hex'),
      settingsEvidenceSha256:createHash('sha256').update(canonicalJson(metadata.settingsEvidence)).digest('hex')}:null,
    limitations: [metadata?'ACL/default-privilege and scoped settings evidence was captured, not replayed. Role attributes/ownership, permissions, collations, storage options, comments and extension ownership remain unverified.':'No full schema/grant dump was captured: owners, grants/default privileges, database/role settings, collations, table storage options, comments and extension ownership remain unverified.',
      metadata?'Sequence state/ownership restored to the explicitly dated metadata observation, not an atomic write barrier or in-flight session-cache recovery.':'Sequence last_value is a nontransactional observation; original is_called, sequence ownership and exact next-call state were not captured.',
      metadata?'Recorded trigger modes restored to the explicitly dated metadata observation; a later supplement is not original-snapshot evidence.':'Trigger enabled/replica/always modes were not captured. Recorded DDL restored with normal enabled defaults; original behavior beyond that remains unverified.',
      'Source PG17 minor version may differ; source column/type OIDs are database-local and not preserved. Final write-barrier deltas and D1 recovery remain separate gates.'] };
  const receiptPath = join(work, 'receipt.json'); await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  if (failure) throw new Error(`Native recovery failed; protected receipt: ${receiptPath}`);
  return { receiptPath, receipt };
}

async function main(argv: string[]) {
  if (argv.includes('--help')) { console.log('Explicit local-only native drill: --archive /private/export --manifest-sha SHA --audit /private/audit.json --audit-sha SHA --work-parent /private/parent --run-native-drill [--metadata /private/later-observation.json --metadata-sha SHA]. Pull the pinned NATIVE_IMAGE first. No existing DB/container/volume input accepted.'); return; }
  const args: Record<string, string> = {}; const execute = argv.includes('--run-native-drill');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run-native-drill') continue;
    if (!['--archive','--manifest-sha','--audit','--audit-sha','--work-parent','--metadata','--metadata-sha'].includes(argv[i]) || !argv[i + 1] || args[argv[i]]) throw new Error('Invalid native recovery argument');
    args[argv[i]] = argv[++i];
  }
  if (!execute || ![5,7].includes(Object.keys(args).length) || ['--archive','--manifest-sha','--audit','--audit-sha','--work-parent'].some(key=>!args[key])) throw new Error('Explicit native drill and all protected pinned inputs are required');
  const result = await runNativeRecovery({ archive: args['--archive'], expectedManifestSha256: args['--manifest-sha'], audit: args['--audit'], expectedAuditSha256: args['--audit-sha'], workParent: args['--work-parent'],metadata:args['--metadata'],expectedMetadataSha256:args['--metadata-sha'] });
  console.log(JSON.stringify({ status: result.receipt.status, receiptPath: result.receiptPath, tableCount: result.receipt.tableCount, totalRows: result.receipt.totalRows, vectorCount: result.receipt.vectorCount, resourcesRemoved: result.receipt.resourcesRemoved }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error && error.message.startsWith('Native recovery failed; protected receipt:') ? error.message : 'Native recovery refused; no source access was attempted.'); process.exitCode = 1;
});
