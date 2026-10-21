import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createCatalogSnapshot, validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import type { ProductRights, SnapshotProductInput } from '../../lib/catalog/types.ts';
import { canonicalJson, canonicalTimestamp, convertSourceRow, exportLegacyVector, sha256 } from '../catalog/migration.ts';
import type { ImportBatch, TimestampDecision } from '../catalog/migration.ts';
import { assertProtectedDestination } from '../catalog/export-postgres.ts';
import { editorialSourceHash } from '../ops/catalog-editorial-core.mjs';
import { createProjectionPacket, projectionPreflight, projectionQueries } from '../../lib/catalog/d1.ts';
import { prepareCohort } from './prepare-cohort.mts';
import { originalReviewCopy, readCopyReview, reviewedCopyHash, reviewedFreshReceipt, validateCopyReview } from './copy-review.mts';
import type { CopyReviewEvidence, CopyReviewInput } from './copy-review.mts';

type Row = Record<string, unknown>;
type Encoding = 'postgres-text' | 'pgvector-send-base64-v1';
type Query = { sql: string; params: unknown[] };
function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected protected object');
  return value as Row;
}
function block(code: string): never { throw new Error(`Import packet blocked: ${code}`); }
export function vectorNdjson(vectors: NonNullable<ReturnType<typeof exportLegacyVector>>[]): string {
  // JSON.stringify(-0) loses its sign. Preserve every exported float32 bit.
  return vectors.map((vector) => `{"id":${JSON.stringify(vector.id)},"values":[${vector.values.map((value) => Object.is(value, -0) ? '-0' : JSON.stringify(value)).join(',')}],"metadata":${JSON.stringify(vector.metadata)}}\n`).join('');
}

/** Produces a packet, not an import/deployment receipt. Provider execution is separate. */
export function prepareImport(rawRows: Row[], cohort: {
  snapshot: unknown; rights: Record<string, ProductRights>;
  inputs: { products: SnapshotProductInput[]; sourceRowSha256ById: Record<string, string>; copyReview?: CopyReviewEvidence };
}, options: {
  sourceSha256: string; archiveId: string; embeddingEncoding: Encoding;
  timestamps: Record<string, TimestampDecision>; now?: Date; copyReview?: CopyReviewInput; affiliateTag?: string; marketplace?: string;
}) {
  const now = options.now || new Date();
  if (!/^[a-f0-9]{64}$/.test(options.sourceSha256) || !options.archiveId.trim()
    || !['postgres-text', 'pgvector-send-base64-v1'].includes(options.embeddingEncoding)) block('source_or_encoding_configuration');
  const snapshot = validateCatalogSnapshot(cohort.snapshot, now);
  if (snapshot.dataKind !== 'catalog') block('synthetic_catalog_cannot_enter_real_staging');
  const products = cohort.inputs.products;
  if (!Array.isArray(products) || products.length < 1 || products.length > 10 || new Set(products.map((p) => p.id)).size !== products.length) block('cohort_size_or_identity');
  const rebuilt = createCatalogSnapshot(products, cohort.rights, {
    catalogRevision: snapshot.catalogRevision, now: new Date(snapshot.generatedAt), slugHistory: snapshot.slugHistory,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(snapshot)) block('snapshot_rights_inputs_disagree');
  if (Boolean(cohort.inputs.copyReview) !== Boolean(options.copyReview)) block('matching_copy_review_required');
  let copyReview: CopyReviewEvidence | undefined;
  if (options.copyReview) {
    const fresh = reviewedFreshReceipt(options.copyReview);
    validateCopyReview(options.copyReview, rawRows, products.map(product => product.id), fresh, now);
    // Reconstruct from ORIGINAL row/receipt bytes + the independently pinned
    // review, not from mutable prepared products or a claimed provenance hash.
    const verified = prepareCohort(rawRows, fresh, {
      ids: products.map(product => product.id), catalogRevision: snapshot.catalogRevision,
      affiliateTag: options.affiliateTag || '', marketplace: options.marketplace, now: new Date(snapshot.generatedAt),
      slugHistory: snapshot.slugHistory, copyReview: options.copyReview,
    });
    // inputs.json omits explicit undefined optional properties. Compare the
    // documented JSON boundary without touching original row/receipt hashes.
    if (canonicalJson(verified.copyReview) !== canonicalJson(cohort.inputs.copyReview)
      || canonicalJson(JSON.parse(JSON.stringify(verified.inputs))) !== canonicalJson(JSON.parse(JSON.stringify(products)))
      || canonicalJson(verified.rightsById) !== canonicalJson(cohort.rights)
      || canonicalJson(verified.sourceRowSha256ById) !== canonicalJson(cohort.inputs.sourceRowSha256ById)
      || canonicalJson(verified.snapshot) !== canonicalJson(snapshot)) block('reviewed_cohort_changed');
    copyReview = verified.copyReview;
  }
  const source = new Map<string, Row>();
  for (const row of rawRows) {
    if (!products.some((product) => product.id === row.id)) continue;
    if (source.has(String(row.id))) block('duplicate_source_identity');
    source.set(String(row.id), row);
  }
  const ready = new Map(snapshot.products.map((product) => [product.id, product]));
  const rows: Row[] = [];
  const archiveVectors: NonNullable<ReturnType<typeof exportLegacyVector>>[] = [];
  const vectors: typeof archiveVectors = [];
  for (const input of products) {
    const raw = source.get(input.id);
    if (!raw || raw.public_id !== input.publicId || raw.slug !== input.slug) block('source_identity_mismatch');
    if (sha256(JSON.stringify(raw)) !== cohort.inputs.sourceRowSha256ById[input.id]) block('source_row_checksum_mismatch');
    if (!copyReview && reviewedCopyHash({ punnyTitle: input.punnyTitle ?? null, wittyDescription: input.wittyDescription ?? null,
      editorialWriteup: input.editorialWriteup || '' }) !== reviewedCopyHash(originalReviewCopy(raw))) block('unreviewed_copy_transformation');
    const display = ready.get(input.id);
    if (display && (!copyReview && (raw.source_facts_hash !== input.sourceFactsHash || raw.editorial_source_hash !== input.editorialSourceHash)
      || input.sourceFactsHash !== input.editorialSourceHash || editorialSourceHash(input) !== input.sourceFactsHash)) block('ready_source_factual_hash_mismatch');
    // Historical naive timestamps can remain unresolved. A current display is
    // bound to the fresh input, not to a guessed historical verification time.
    // Convert the immutable baseline first, then project the validated display.
    if (display && (!input.availabilityCheckedAt || !input.lastVerifiedAt)) block('ready_fresh_verification_missing');
    const row = convertSourceRow('products', raw, { catalogRevision: snapshot.catalogRevision,
      archiveId: options.archiveId, timestamps: options.timestamps, rights: cohort.rights[input.id], now });
    // Keep source_record_json byte-for-byte canonical to the original export
    // (embedding has its own protected artifact), while operational state is fresh.
    const original = { ...raw }; delete original.embedding;
    if (row.source_record_json !== canonicalJson(original)) block('original_source_record_changed');
    Object.assign(row, {
      title: display?.title || '', description: display?.description || '', tags: display?.humorTags?.join(' ') || '',
      eligible_until: display?.eligibleUntil || null, public_display_json: display ? canonicalJson(display) : null,
      is_active: input.isActive === true ? 1 : 0,
      availability_status: input.availabilityStatus || row.availability_status,
      availability_checked_at: input.availabilityCheckedAt ? canonicalTimestamp(input.availabilityCheckedAt) : row.availability_checked_at,
      last_verified_at: input.lastVerifiedAt ? canonicalTimestamp(input.lastVerifiedAt) : row.last_verified_at,
      source_facts_hash: input.sourceFactsHash || row.source_facts_hash,
      editorial_source_hash: input.editorialSourceHash || row.editorial_source_hash,
      editorial_status: input.editorialStatus || row.editorial_status,
      // There is no persisted historical embedding-input hash. Never invent one.
      embedding_text_hash: null,
    });
    rows.push(row);
    const vector = exportLegacyVector(raw, { catalogRevision: snapshot.catalogRevision, eligible: Boolean(display) }, options.embeddingEncoding);
    if (display && !vector) block('ready_original_vector_missing');
    if (vector) {
      archiveVectors.push(vector);
      if (display) vectors.push(vector);
    }
  }
  const batch: ImportBatch = { exportSha256: options.sourceSha256, table: 'products', batchNumber: 0,
    rows, importedAt: now.toISOString() };
  const batchSha256 = sha256(canonicalJson(rows));
  const preflight: Query = { sql: 'SELECT batch_sha256,row_count FROM migration_imports WHERE export_sha256=? AND table_name=? AND batch_number=?',
    params: [batch.exportSha256, batch.table, batch.batchNumber] };
  // These strict INSERTs intentionally refuse unexpected existing identities.
  // Execute only when preflight is absent; matching receipt means skip all writes.
  const queries: Query[] = rows.map((row) => {
    const columns = Object.keys(row);
    if (columns.some((key) => !/^[a-z_]+$/.test(key)) || columns.length > 100) block('sql_column_bounds');
    return { sql: `INSERT INTO products (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      params: columns.map((key) => row[key]) };
  });
  queries.push({ sql: 'INSERT INTO migration_imports (export_sha256,table_name,batch_number,batch_sha256,row_count,imported_at) VALUES (?,?,?,?,?,?)',
    params: [batch.exportSha256, batch.table, batch.batchNumber, batchSha256, rows.length, batch.importedAt] });
  if (Buffer.byteLength(JSON.stringify(queries)) > 1_000_000) block('query_packet_exceeds_one_megabyte');
  return { batch, queries, preflight, expectedRows: rows, vectors, archiveVectors, ...(copyReview ? { copyReview } : {}),
    summary: { schemaVersion: 1, catalogRevision: snapshot.catalogRevision, sourceSha256: options.sourceSha256,
      archiveId: options.archiveId, embeddingEncoding: options.embeddingEncoding, imported: false, published: false,
      expectedProductCount: rows.length, ready: ready.size, held: rows.length - ready.size,
      expectedVectorCount: vectors.length, preservedOriginalVectorCount: archiveVectors.length,
      batchSha256, receiptKey: { exportSha256: batch.exportSha256, table: batch.table, batchNumber: batch.batchNumber },
      expectedReceipt: { batch_sha256: batchSha256, row_count: rows.length },
      retryRule: 'Preflight absent: execute the whole atomic batch. Exact matching receipt: skip. Any mismatch: stop and reconcile.',
      legacyInputProvenance: 'unverified', semanticInputCurrencyProven: false,
      vectorChecksumEncoding: 'SHA256 of canonical pgvector vector_send bytes: int16BE dimension, int16BE zero, float32BE values',
      sourceRecordPolicy: 'Original exported columns unchanged; embedding separately preserved, no stale source_record rewrite.',
      ...(copyReview ? { copyReviewSha256: copyReview.reviewSha256, copyReviewPolicy: 'Prospective explicit copy review; original generation/history unchanged, no model approval or rights renewal.' } : {}),
      pendingGates: ['provider_atomic_batch_verification', 'D1_full_row_reconciliation', 'Vectorize_mutation_visibility_and_ID_parity', 'historical_embedding_input_provenance_and_search_parity'],
    } };
}

async function protectedRead(path: string, repository: string, maxBytes = 60_000_000): Promise<string> {
  const actual = await realpath(path);
  await assertProtectedDestination(actual, repository);
  const metadata = await stat(actual);
  if (!metadata.isFile() || metadata.mode & 0o077 || metadata.size > maxBytes) block('private_input_mode_or_size');
  return readFile(actual, 'utf8');
}
async function main(argv: string[]) {
  if (argv.includes('--help')) {
    console.log('Usage: node --experimental-strip-types scripts/staging/prepare-import.mts --products /private/products.ndjson --cohort /private/cohort --timestamps /private/reviewed-decisions.json --archive-id source-receipt --embedding-encoding postgres-text --output /private/new-packet [--projection-only] [--review /private/review.json --review-sha256 SHA256 --fresh /private/get-items.json]\nTimestamp file is a map of products.column -> {timezone:"UTC",evidence:"reviewed writer receipt"}. Reviewed import also requires canonical AMAZON_ASSOCIATE_TAG (optional AMAZON_MARKETPLACE). Projection-only mode never emits operational product INSERTs. Offline packet only; no provider calls or source writes.');
    return;
  }
  const allowed = ['--products', '--cohort', '--timestamps', '--archive-id', '--embedding-encoding', '--output'];
  const flags = new Map<string, string>();
  const projectionOnly = argv.includes('--projection-only');
  if (projectionOnly) argv = argv.filter((argument) => argument !== '--projection-only');
  if (![allowed.length * 2, (allowed.length + 3) * 2].includes(argv.length)) block('explicit_options_required');
  for (let index = 0; index < argv.length; index += 2) {
    if (![...allowed, '--review', '--review-sha256', '--fresh'].includes(argv[index]) || flags.has(argv[index])) block('unknown_or_duplicate_option');
    flags.set(argv[index], argv[index + 1]);
  }
  if (allowed.some(key => !flags.has(key)) || ['--review-sha256', '--fresh'].some(key => flags.has(key) !== flags.has('--review'))) block('explicit_options_required');
  const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const output = await assertProtectedDestination(flags.get('--output')!, repository);
  const sourceText = await protectedRead(flags.get('--products')!, repository);
  const rows = sourceText.trim().split('\n').filter(Boolean).map((line) => record(JSON.parse(line)));
  const cohort = flags.get('--cohort')!;
  const copyReview = flags.has('--review') ? await readCopyReview(flags.get('--review')!, flags.get('--review-sha256')!, flags.get('--fresh')!, repository) : undefined;
  const snapshot = JSON.parse(await protectedRead(resolve(cohort, 'catalog.snapshot.json'), repository, 1_000_000));
  const result = prepareImport(rows, {
    snapshot,
    rights: JSON.parse(await protectedRead(resolve(cohort, 'rights.json'), repository, 1_000_000)),
    inputs: JSON.parse(await protectedRead(resolve(cohort, 'inputs.json'), repository, 1_000_000)),
  }, { sourceSha256: sha256(sourceText), archiveId: flags.get('--archive-id')!,
    embeddingEncoding: flags.get('--embedding-encoding') as Encoding,
    timestamps: JSON.parse(await protectedRead(flags.get('--timestamps')!, repository, 100_000)), copyReview,
    affiliateTag: process.env.AMAZON_ASSOCIATE_TAG, marketplace: process.env.AMAZON_MARKETPLACE });
  const projection = await createProjectionPacket(snapshot,
    Object.fromEntries(result.expectedRows.map((row) => [String(row.public_id), String(row.source_facts_hash)])), sha256(sourceText));
  await mkdir(output, { mode: 0o700 });
  if (result.copyReview) await writeFile(resolve(output, 'copy-review-provenance.json'), `${JSON.stringify(result.copyReview, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  for (const [file, value] of [['projection-batch.json', projectionQueries(projection)], ['projection-preflight.json', [projectionPreflight(projection)]],
    ['projection-packet.json', projection], ['expected-public-products.json', projection.rows]] as const) {
    await writeFile(resolve(output, file), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  if (projectionOnly) {
    const summary = { mode: 'projection-only', noOperationalReimport: true, imported: false, published: false,
      ...projection.receipt, pendingGates: result.summary.pendingGates };
    await writeFile(resolve(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ output, mode: summary.mode, products: projection.rows.length, statements: projectionQueries(projection).length, imported: false }));
    return;
  }
  for (const [file, value] of [['d1-batch.json', result.queries], ['d1-preflight.json', [result.preflight]],
    ['import-batch.json', result.batch], ['expected-products.json', result.expectedRows], ['summary.json', result.summary]] as const) {
    await writeFile(resolve(output, file), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  for (const [file, vectors] of [['vectors.ndjson', result.vectors], ['vectors.archive.ndjson', result.archiveVectors]] as const) {
    const content = vectorNdjson(vectors);
    await writeFile(resolve(output, file), content, { mode: 0o600, flag: 'wx' });
    if (sha256(await readFile(resolve(output, file), 'utf8')) !== sha256(content)) block('vector_file_readback_checksum');
  }
  console.log(JSON.stringify({ output, catalogRevision: result.summary.catalogRevision, products: result.summary.expectedProductCount,
    ready: result.summary.ready, held: result.summary.held, vectors: result.vectors.length,
    semanticInputCurrencyProven: false, imported: false, published: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch((error) => {
  const code = error instanceof Error && error.message.startsWith('Import packet blocked:') ? error.message : 'Import packet blocked: protected input validation';
  console.error(`${code}. No provider calls or source writes were made.`);
  process.exitCode = 1;
});
