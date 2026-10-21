import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SnapshotProductInput } from '../../lib/catalog/types.ts';
import { canonicalTime } from '../../lib/catalog/snapshot.ts';
import { canonicalJson, sha256 } from '../catalog/migration.ts';
import { assertProtectedDestination } from '../catalog/export-postgres.ts';
import { editorialSourceHash, validateEditorialDraft } from '../ops/catalog-editorial-core.mjs';

type Row = Record<string, unknown>;
export interface ReviewedCopy { punnyTitle: string | null; wittyDescription: string | null; editorialWriteup: string }
export interface CopyReviewEntry {
  id: string; sourceRowSha256: string; sourceFactsHash: string; originalCopySha256: string;
  copy: ReviewedCopy; copySha256: string; reason: string; imageReview: 'unchanged' | 'reviewed_fresh_image';
}
export interface CopyReview {
  schemaVersion: 1; kind: 'prospective-copy-review'; freshReceiptSha256: string;
  reviewedAt: string; reference: string; entries: CopyReviewEntry[];
}
/** Pins ORIGINAL UTF-8 file bytes, not a reserialized parsed object. Private
 * prospective review evidence, never a provider receipt, model approval or right. */
export interface CopyReviewInput { bytes: Uint8Array; sha256: string; freshBytes: Uint8Array }
export interface CopyReviewEvidence { reviewSha256: string; review: CopyReview }
export class CopyReviewError extends Error {
  constructor(code: string) { super(`Copy review blocked: ${code}`); }
}
function block(code: string): never { throw new CopyReviewError(code); }
const HASH = /^[a-f0-9]{64}$/;
const byteHash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const exact = (value: Row, keys: string) => Object.keys(value).sort().join(',') === keys;
function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) block('object_required');
  return value as Row;
}
const text = (value: unknown, max: number): value is string => typeof value === 'string'
  && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function originalReviewCopy(row: Row): ReviewedCopy {
  return { punnyTitle: typeof row.punny_title === 'string' && row.punny_title ? row.punny_title : null,
    wittyDescription: typeof row.witty_description === 'string' && row.witty_description ? row.witty_description : null,
    editorialWriteup: typeof row.editorial_writeup === 'string' ? row.editorial_writeup : '' };
}
export const reviewedCopyHash = (copy: ReviewedCopy): string => sha256(canonicalJson(copy));
function jsonBytes(bytes: Uint8Array, max: number): unknown {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > max) block('byte_bound');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return block('invalid_utf8_or_json'); }
}
export function reviewedFreshReceipt(input: CopyReviewInput): unknown {
  return jsonBytes(input.freshBytes, 1_000_000);
}

export function validateCopyReview(input: CopyReviewInput, rows: Row[], ids: string[], fresh: unknown, now: Date): CopyReviewEvidence {
  if (!HASH.test(input.sha256) || byteHash(input.bytes) !== input.sha256) block('review_checksum');
  const review = record(jsonBytes(input.bytes, 256_000));
  if (!exact(review, 'entries,freshReceiptSha256,kind,reference,reviewedAt,schemaVersion')
    || review.schemaVersion !== 1 || review.kind !== 'prospective-copy-review'
    || typeof review.freshReceiptSha256 !== 'string' || !HASH.test(review.freshReceiptSha256)
    || byteHash(input.freshBytes) !== review.freshReceiptSha256 || !text(review.reference, 500)) block('receipt_or_schema');
  const originalFresh = reviewedFreshReceipt(input);
  if (canonicalJson(originalFresh) !== canonicalJson(fresh)) block('fresh_receipt_changed');
  const observed = canonicalTime(record(originalFresh).observedAt); const reviewed = canonicalTime(review.reviewedAt);
  const expiry = Date.parse(observed) + 24 * 3600_000;
  if (!Number.isFinite(now.getTime()) || reviewed <= observed || Date.parse(reviewed) > now.getTime()
    || Date.parse(reviewed) >= expiry || now.getTime() >= expiry) block('review_time_or_expired_receipt');
  if (!Array.isArray(review.entries) || !ids.length || ids.length > 10 || new Set(ids).size !== ids.length
    || review.entries.length !== ids.length) block('exact_reviewed_ids');
  const seen = new Set<string>();
  for (const value of review.entries) {
    const entry = record(value);
    if (!exact(entry, 'copy,copySha256,id,imageReview,originalCopySha256,reason,sourceFactsHash,sourceRowSha256')
      || typeof entry.id !== 'string' || !ids.includes(entry.id) || seen.has(entry.id)
      || !text(entry.reason, 2000) || !['unchanged', 'reviewed_fresh_image'].includes(String(entry.imageReview))
      || ['sourceRowSha256', 'sourceFactsHash', 'originalCopySha256', 'copySha256'].some(key => typeof entry[key] !== 'string' || !HASH.test(entry[key] as string))) block('entry_or_identity');
    seen.add(entry.id);
    const matches = rows.filter(row => row.id === entry.id); const row = matches[0];
    if (matches.length !== 1 || sha256(JSON.stringify(row)) !== entry.sourceRowSha256
      || reviewedCopyHash(originalReviewCopy(row)) !== entry.originalCopySha256
      || row.source_facts_hash !== row.editorial_source_hash || typeof row.source_facts_hash !== 'string') block('original_row_or_copy');
    let oldFacts: unknown;
    try { oldFacts = typeof row.source_facts === 'string' ? JSON.parse(row.source_facts) : row.source_facts; }
    catch { block('original_facts'); }
    if (editorialSourceHash({ title: row.title, imageUrl: row.image_url, sourceFacts: record(oldFacts) }) !== row.source_facts_hash) block('original_source_hash');
    const copy = record(entry.copy);
    if (!exact(copy, 'editorialWriteup,punnyTitle,wittyDescription') || !text(copy.editorialWriteup, 16_000)
      || !['punnyTitle', 'wittyDescription'].every(key => copy[key] === null || text(copy[key], 2000))
      || reviewedCopyHash(copy as unknown as ReviewedCopy) !== entry.copySha256) block('reviewed_copy');
  }
  return { reviewSha256: input.sha256, review: review as unknown as CopyReview };
}

/** A new explicit review can re-associate reused copy with the current factual
 * hash. It cannot change the original generation/status/quality or issue rights. */
export function applyCopyReview(product: SnapshotProductInput, row: Row, evidence: CopyReviewEvidence): void {
  const entry = evidence.review.entries.find(entry => entry.id === product.id)!;
  if (!entry || entry.sourceFactsHash !== editorialSourceHash(product)
    || entry.imageReview === 'unchanged' && product.imageUrl !== row.image_url) block('current_facts_or_image');
  product.punnyTitle = entry.copy.punnyTitle ?? undefined;
  product.wittyDescription = entry.copy.wittyDescription ?? undefined;
  product.editorialWriteup = entry.copy.editorialWriteup;
  product.editorialSourceHash = entry.sourceFactsHash;
  const validation = validateEditorialDraft(product, product.editorialWriteup,
    evidence.review.entries.filter(other => other.id !== product.id).map(other => other.copy.editorialWriteup));
  if (!validation.approved) block('editorial_validation');
}

/** Only the two checksum-bound review inputs use this strict reader. Refuse
 * symlinks, unsafe modes/owners/links, races, oversize and invalid UTF-8. */
async function privateBytes(file: string, repository: string, max: number): Promise<Uint8Array> {
  const absolute = path.resolve(file); await assertProtectedDestination(absolute, repository);
  const before = await fs.lstat(absolute);
  if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600
    || before.size > max || await fs.realpath(absolute) !== absolute) block('private_input');
  const handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size || opened.ctimeMs !== before.ctimeMs) block('input_changed');
    const chunks: Buffer[] = []; let length = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, max + 1 - length)); const part = await handle.read(chunk);
      if (!part.bytesRead) break;
      length += part.bytesRead; if (length > max) block('byte_bound'); chunks.push(chunk.subarray(0, part.bytesRead));
    }
    const after = await fs.lstat(absolute); const final = await handle.stat();
    if ([after, final].some(stat => stat.ino !== before.ino || stat.dev !== before.dev || stat.size !== before.size
      || stat.ctimeMs !== before.ctimeMs || stat.mtimeMs !== before.mtimeMs || stat.nlink !== 1 || stat.mode !== before.mode)
      || length !== before.size) block('input_changed');
    const bytes = Buffer.concat(chunks); jsonBytes(bytes, max); return bytes;
  } finally { await handle.close(); }
}
export async function readCopyReview(reviewPath: string, expectedSha256: string, freshPath: string, repository: string): Promise<CopyReviewInput> {
  if (!HASH.test(expectedSha256)) block('review_checksum');
  const bytes = await privateBytes(reviewPath, repository, 256_000);
  if (byteHash(bytes) !== expectedSha256) block('review_checksum');
  return { bytes, sha256: expectedSha256, freshBytes: await privateBytes(freshPath, repository, 1_000_000) };
}
