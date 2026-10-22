import { createHash } from 'node:crypto';
import { canonicalJson } from '../../lib/catalog/canonical-json.ts';
export { canonicalJson } from '../../lib/catalog/canonical-json.ts';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { legacyMutationBatch } from '../../lib/catalog/mutation-fence.ts';
import type { ProductRights, PublicCatalogProduct } from '../../lib/catalog/types.ts';
import { validatePublicCatalogProduct } from '../../lib/catalog/snapshot.ts';
import { decodePgvectorSendBase64, encodePgvectorSendBase64, PGVECTOR_BINARY_ENCODING } from './pgvector-binary.ts';

export const RUNTIME_TABLES = ['products', 'product_slug_history', 'catalog_runs', 'catalog_run_items',
  'catalog_editorial_events', 'search_queries'] as const;
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL = 'text-embedding-3-small';
type Row = Record<string, unknown>;
export interface TimestampDecision { timezone: 'UTC' | 'unresolved'; evidence: string }
export interface ConversionOptions {
  catalogRevision: string;
  /** Required per historical naive column; do not infer UTC from the operator's clock. */
  timestamps: Record<string, TimestampDecision>;
  archiveId: string;
  rights?: ProductRights;
  publicDisplay?: PublicCatalogProduct;
  now?: Date;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.length) throw new Error(`Expected ${field}`);
  return value;
}

export const TYPED_TIMESTAMP_COLUMNS: Record<string, string[]> = {
  products: ['availability_checked_at', 'last_verified_at', 'created_at', 'updated_at'],
  product_slug_history: ['created_at'], catalog_runs: ['started_at', 'completed_at'],
  catalog_run_items: ['created_at'], catalog_editorial_events: ['created_at'], search_queries: ['created_at'],
};
const HISTORICAL_NULLABLE = new Set(['products.created_at', 'products.updated_at', 'products.last_verified_at',
  'products.availability_checked_at', 'catalog_editorial_events.created_at', 'search_queries.created_at']);
export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

/** Exact decimal arithmetic. Unsupported currency precision is an explicit review gate. */
export function moneyToMinor(value: unknown, currency: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const exponent = ['JPY', 'KRW', 'CLP'].includes(currency) ? 0
    : ['BHD', 'KWD', 'OMR', 'JOD', 'TND'].includes(currency) ? 3
    : ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'CHF', 'CNY', 'HKD', 'SGD', 'INR', 'MXN', 'BRL', 'SEK', 'NOK', 'DKK', 'PLN'].includes(currency) ? 2 : -1;
  if (exponent < 0) throw new Error(`Currency precision requires review: ${currency}`);
  // Postgres numeric must be exported as a string, not rounded through JS first.
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Money must be an unsigned decimal string');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.slice(exponent).replace(/0/g, '')) throw new Error('Money has excess precision');
  const minor = BigInt(whole) * BigInt(10) ** BigInt(exponent) + BigInt((fraction.slice(0, exponent).padEnd(exponent, '0')) || '0');
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Money exceeds safe integer');
  return minor === BigInt(0) ? null : Number(minor);
}
export function canonicalTimestamp(value: unknown, decision?: TimestampDecision): string | null {
  if (value === null || value === undefined) return null;
  let text = requiredString(value, 'timestamp');
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d\d(?::?\d\d)?)?$/.test(text)) throw new Error('Invalid timestamp representation');
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new Error('Invalid calendar date');
  const [hour, minute, second] = text.slice(11, 19).split(':').map(Number);
  if (hour > 23 || minute > 59 || second > 59) throw new Error('Invalid wall-clock time; normalization is not permitted');
  if (!/(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(text)) {
    if (decision?.timezone !== 'UTC' || !decision.evidence.trim()) throw new Error('Naive timestamp lacks documented UTC writer semantics');
    text = `${text.replace(' ', 'T')}Z`;
  }
  // Operational instants have six fractional digits; retain Postgres microseconds.
  const fraction = text.match(/\.(\d+)(?:Z|[+-])/i)?.[1] || '';
  if (fraction.length > 6 && /[1-9]/.test(fraction.slice(6))) throw new Error('Sub-microsecond timestamp requires explicit migration decision');
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid timestamp');
  return parsed.toISOString().replace(/\.(\d{3})Z$/, (_, ms: string) => `.${ms}${fraction.slice(3, 6).padEnd(3, '0')}Z`);
}
function time(row: Row, table: string, column: string, options: ConversionOptions, required = false): string | null {
  const decision = options.timestamps[`${table}.${column}`];
  if (decision?.timezone === 'unresolved') {
    if (!HISTORICAL_NULLABLE.has(`${table}.${column}`) || !decision.evidence.trim()) throw new Error('Unresolved timestamp requires an approved historical nullable column and evidence');
    if (row[column] !== null && row[column] !== undefined && /(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(String(row[column]))) throw new Error('An explicit instant cannot be discarded as unresolved');
    // Validate the wall-time syntax/calendar without using this synthetic instant.
    // This never supplies a normalized value or evidence about the source timezone.
    canonicalTimestamp(row[column], { timezone: 'UTC', evidence: 'Syntax validation only; result discarded' });
    return null; // The unmodified original is retained in source_record_json.
  }
  const value = canonicalTimestamp(row[column], decision);
  if (required && value === null) throw new Error(`Missing ${table}.${column}`);
  return value;
}
function timestampProvenance(table: string, row: Row, options: ConversionOptions): string {
  return canonicalJson({ schemaVersion: 1, sourceArchive: options.archiveId, fields: Object.fromEntries(
    TYPED_TIMESTAMP_COLUMNS[table].map((column) => {
      const value = row[column]; const decision = options.timestamps[`${table}.${column}`];
      if (value === null || value === undefined) return [column, { state: 'source_null' }];
      if (decision?.timezone === 'unresolved') return [column, { state: 'unresolved', evidence: decision.evidence }];
      return [column, { state: 'evidenced', basis: /(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(String(value)) ? 'explicit_offset' : 'documented_utc_writer',
        evidence: decision?.evidence || 'Explicit offset in protected source timestamp' }];
    })) });
}
function bool(value: unknown): number {
  if (value === true) return 1;
  if (value === false) return 0;
  throw new Error('Expected source boolean');
}
function score(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error('Invalid quality score');
  return number;
}
function safeSequence(value: unknown): number {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid sequence');
  return Number(value);
}

export function destinationFor(table: string): { kind: 'd1' | 'archive'; table: string } {
  return RUNTIME_TABLES.includes(table as typeof RUNTIME_TABLES[number])
    ? { kind: 'd1', table: table === 'search_queries' ? 'search_history' : table }
    : { kind: 'archive', table };
}

export function convertSourceRow(table: typeof RUNTIME_TABLES[number], row: Row, options: ConversionOptions): Row {
  const sourceRecord = { ...row };
  if (table === 'products') delete sourceRecord.embedding; // Original vectors have a separate protected artifact.
  const base: Row = { source_record_json: canonicalJson(sourceRecord),
    ...(['products', 'catalog_editorial_events', 'search_queries'].includes(table)
      ? { timestamp_provenance_json: timestampProvenance(table, row, options) } : {}) };
  const id = table === 'product_slug_history' ? '' : requiredString(row.id, 'id');
  if (table === 'products') {
    const currency = requiredString(row.currency, 'currency');
    const publicId = requiredString(row.public_id, 'public_id');
    const display = options.publicDisplay ? validatePublicCatalogProduct(options.publicDisplay, options.now || new Date()) : undefined;
    if (display && (display.id !== id || display.publicId !== publicId || display.slug !== row.slug)) throw new Error('Display identity mismatch');
    const availability = time(row, table, 'availability_checked_at', options);
    const verified = time(row, table, 'last_verified_at', options);
    if (display && !availability && !verified) throw new Error('Public display requires an evidenced verification instant');
    return { ...base, id, public_id: publicId, slug: requiredString(row.slug, 'slug'), source: row.source,
      // FTS contains approved display copy only; no stale merchant text is searchable.
      title: display?.title || '', description: display?.description || '', tags: display?.humorTags?.join(' ') || '',
      price_minor: moneyToMinor(row.price, currency), currency, quality_score: score(row.quality_score),
      is_active: bool(row.is_active), duplicate_of_product_id: row.duplicate_of_product_id ?? null,
      editorial_status: row.editorial_status, availability_status: row.availability_status ?? null,
      availability_checked_at: availability,
      last_verified_at: verified,
      source_facts_hash: row.source_facts_hash ?? null, editorial_source_hash: row.editorial_source_hash ?? null,
      embedding_text_hash: row.embedding_text_hash ?? null, catalog_revision: options.catalogRevision,
      eligible_until: display?.eligibleUntil || null, public_display_json: display ? canonicalJson(display) : null,
      rights_json: canonicalJson(options.rights || {}),
      created_at: time(row, table, 'created_at', options, true), updated_at: time(row, table, 'updated_at', options, true) };
  }
  if (table === 'product_slug_history') return { ...base, slug: row.slug, product_id: row.product_id,
    created_at: time(row, table, 'created_at', options, true) };
  if (table === 'catalog_runs') return { ...base, id, status: row.status, mode: row.mode, dry_run: bool(row.dry_run),
    started_at: time(row, table, 'started_at', options, true), completed_at: time(row, table, 'completed_at', options) };
  if (table === 'catalog_run_items') return { ...base, id, sequence: safeSequence(row.sequence), run_id: row.run_id,
    product_id: row.product_id ?? null, external_id: row.external_id, decision: row.decision,
    requires_manual_review: bool(row.requires_manual_review), created_at: time(row, table, 'created_at', options, true) };
  if (table === 'catalog_editorial_events') return { ...base, id, run_id: row.run_id, product_id: row.product_id,
    event_type: row.event_type, status: row.status, created_at: time(row, table, 'created_at', options, true) };
  return { ...base, id, created_at: time(row, table, 'created_at', options, true),
    legacy_bundle_id: row.clicked_bundle_id ?? null, legacy_bundle_slug: row.clicked_bundle_slug ?? null,
    archive_reference: row.clicked_bundle_id || row.clicked_bundle_slug ? `${options.archiveId}/gift_bundles` : null };
}

export function exportVector(row: Row, metadata: { catalogRevision: string; eligible: boolean; embeddingTextHash: string },
  encoding: 'postgres-text' | typeof PGVECTOR_BINARY_ENCODING = 'postgres-text'): {
  id: string; values: number[]; metadata: typeof metadata;
} | null {
  if (row.embedding === null || row.embedding === undefined) return null;
  if (!['postgres-text', PGVECTOR_BINARY_ENCODING].includes(encoding)) throw new Error('Unknown vector column encoding');
  const raw = encoding === PGVECTOR_BINARY_ENCODING ? decodePgvectorSendBase64(row.embedding)
    : typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
  if (!Array.isArray(raw) || raw.length !== EMBEDDING_DIMENSIONS || raw.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Original vector is not 1536 finite dimensions');
  }
  if (!metadata.catalogRevision || !/^[a-f0-9]{64}$/.test(metadata.embeddingTextHash) || typeof metadata.eligible !== 'boolean') throw new Error('Vector metadata requires reviewed revision, eligibility and embedding-text hash');
  return { id: requiredString(row.public_id, 'vector public_id'), values: [...raw], metadata: { ...metadata } };
}

/** Existing vectors with unknown historical input text are not verified-hash records. */
export function exportLegacyVector(row: Row, metadata: { catalogRevision: string; eligible: boolean },
  encoding: 'postgres-text' | typeof PGVECTOR_BINARY_ENCODING): {
    id: string; values: number[]; metadata: {
      catalogRevision: string; eligible: boolean; legacyInputProvenance: 'unverified'; vectorBytesSha256: string;
    };
  } | null {
  if (!['postgres-text', PGVECTOR_BINARY_ENCODING].includes(encoding)) throw new Error('Unknown vector column encoding');
  if (row.embedding === null || row.embedding === undefined) return null;
  let values: number[];
  if (encoding === PGVECTOR_BINARY_ENCODING) values = decodePgvectorSendBase64(row.embedding);
  else {
    if (typeof row.embedding !== 'string') throw new Error('Legacy Postgres vector text must be explicit server text');
    const parsed = JSON.parse(row.embedding);
    if (!Array.isArray(parsed) || parsed.length !== EMBEDDING_DIMENSIONS
      || parsed.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Original vector is not 1536 finite dimensions');
    // vector_out emits shortest round-trippable float4 decimals. Restore those
    // native float32 values, not new embeddings or an invented input-text hash.
    values = parsed.map((value) => Math.fround(value));
  }
  const nativeBytes = Buffer.from(encodePgvectorSendBase64(values), 'base64');
  if (!metadata.catalogRevision || typeof metadata.eligible !== 'boolean') throw new Error('Legacy vector requires explicit revision and eligibility');
  return { id: requiredString(row.public_id, 'vector public_id'), values,
    metadata: { catalogRevision: metadata.catalogRevision, eligible: metadata.eligible,
      legacyInputProvenance: 'unverified', vectorBytesSha256: createHash('sha256').update(nativeBytes).digest('hex') } };
}

export interface ImportBatch {
  exportSha256: string; table: string; batchNumber: number; rows: Row[]; importedAt: string;
}
async function verifyImportedRows(db: CatalogD1, batch: ImportBatch): Promise<void> {
  if (!batch.rows.length) return;
  const key = batch.table === 'product_slug_history' ? 'slug' : 'id';
  const columns = [...new Set(batch.rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length || columns.length > 100 || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new Error('Invalid import columns');
  const identities = batch.rows.map((row) => requiredString(row[key], key));
  const expected = new Map(batch.rows.map((row, index) => [identities[index], row]));
  if (expected.size !== batch.rows.length) throw new Error('Duplicate import identity');
  // The batch cap permits one indexed read with at most 40 bound identities.
  const result = await db.prepare(`SELECT ${columns.join(',')} FROM ${batch.table}
    WHERE ${key} IN (${identities.map(() => '?').join(',')})`).bind(...identities).all<Row>();
  const actual = result.results.map((row) => {
    const fields = expected.get(String(row[key]));
    // Schema defaults not present in the original payload are not imported bytes.
    return fields ? Object.fromEntries(Object.keys(fields).map((column) => [column, row[column]])) : row;
  });
  if (reconcileRows(batch.rows, actual, key).length) throw new Error('Imported target rows are missing or changed');
}
/** Restartable atomic batches; an existing receipt must match the exact payload. */
export async function importBatch(db: CatalogD1, batch: ImportBatch): Promise<'imported' | 'already_imported'> {
  const allowed = [...RUNTIME_TABLES.map((table) => destinationFor(table).table)];
  if (!allowed.includes(batch.table) || !/^[a-f0-9]{64}$/.test(batch.exportSha256)
    || !Number.isSafeInteger(batch.batchNumber) || batch.batchNumber < 0 || batch.rows.length > 40) throw new Error('Invalid import batch');
  const hash = sha256(canonicalJson(batch.rows));
  const existing = await db.prepare(`SELECT batch_sha256,row_count FROM migration_imports
    WHERE export_sha256=? AND table_name=? AND batch_number=?`)
    .bind(batch.exportSha256, batch.table, batch.batchNumber).all<{ batch_sha256: string; row_count: number }>();
  if (existing.results.length) {
    if (existing.results[0].batch_sha256 !== hash || existing.results[0].row_count !== batch.rows.length) throw new Error('Import receipt does not match batch');
    await verifyImportedRows(db, batch);
    return 'already_imported';
  }
  const statements = batch.rows.map((row) => {
    const columns = Object.keys(row);
    if (!columns.length || columns.some((key) => !/^[a-z_]+$/.test(key))) throw new Error('Invalid import columns');
    // No replace/upsert: an unexpected existing identity must fail and be reconciled.
    return db.prepare(`INSERT INTO ${batch.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .bind(...columns.map((key) => row[key]));
  });
  statements.push(db.prepare(`INSERT INTO migration_imports
    (export_sha256,table_name,batch_number,batch_sha256,row_count,imported_at) VALUES (?,?,?,?,?,?)`)
    .bind(batch.exportSha256, batch.table, batch.batchNumber, hash, batch.rows.length, batch.importedAt));
  await legacyMutationBatch(db, statements);
  return 'imported';
}

export function reconcileRows(expected: Row[], actual: Row[], key: string): string[] {
  const toMap = (rows: Row[]) => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = requiredString(String(row[key] ?? ''), key);
      if (map.has(id)) throw new Error(`Duplicate reconciliation key: ${id}`);
      map.set(id, canonicalJson(row));
    }
    return map;
  };
  const left = toMap(expected); const right = toMap(actual);
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap((id) => left.get(id) === right.get(id) ? [] : [id]);
}

/** Maintenance must update the product and enqueue its exact revision atomically. */
export async function upsertProductAndQueueVector(db: CatalogD1, product: Row, event: {
  publicId: string; revision: string; embeddingTextHash: string; operation: 'upsert' | 'delete'; createdAt: string;
}): Promise<void> {
  if (product.public_id !== event.publicId || product.catalog_revision !== event.revision
    || !/^[a-f0-9]{64}$/.test(event.embeddingTextHash)) throw new Error('Outbox identity/revision mismatch');
  const utc = (value: unknown) => {
    if (typeof value !== 'string' || !value.endsWith('Z')) throw new Error('Future writes require explicit UTC instants');
    canonicalTimestamp(value);
  };
  utc(event.createdAt); utc(product.updated_at);
  for (const column of ['created_at', 'last_verified_at', 'availability_checked_at']) {
    if (product[column] !== null && product[column] !== undefined) utc(product[column]);
  }
  if (product.public_display_json && !product.availability_checked_at && !product.last_verified_at) throw new Error('Public display requires an evidenced verification instant');
  const columns = Object.keys(product);
  if (!columns.includes('id') || columns.some((key) => !/^[a-z_]+$/.test(key))) throw new Error('Invalid product columns');
  if (product.created_at === null || product.created_at === undefined) {
    const existing = await db.prepare('SELECT created_at FROM products WHERE id=?').bind(product.id).all<{ created_at: string | null }>();
    if (existing.results.length !== 1 || existing.results[0].created_at !== null) throw new Error('Only an existing unresolved creation instant may remain NULL; new products require UTC creation');
  }
  const updates = columns.filter((key) => key !== 'id').map((key) => `${key}=excluded.${key}`).join(',');
  // Hash-unknown reviewed DELETEs make NULL legitimate in the newer schema.
  // Guard a nonnullable identity too, so a different-input retry still rolls back everything.
  await legacyMutationBatch(db, [
    db.prepare(`INSERT INTO products (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})
      ON CONFLICT(id) DO UPDATE SET ${updates}`).bind(...columns.map((key) => product[key])),
    db.prepare(`INSERT INTO vector_sync_outbox
      (public_id,source_revision,embedding_text_hash,operation,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(public_id,source_revision,operation) DO UPDATE SET
        public_id=CASE WHEN vector_sync_outbox.embedding_text_hash=excluded.embedding_text_hash
          THEN vector_sync_outbox.public_id ELSE NULL END,
        embedding_text_hash=CASE WHEN vector_sync_outbox.embedding_text_hash=excluded.embedding_text_hash
          THEN vector_sync_outbox.embedding_text_hash ELSE NULL END`)
      .bind(event.publicId, event.revision, event.embeddingTextHash, event.operation, event.createdAt),
  ]);
}
