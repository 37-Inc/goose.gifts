import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createCatalogSnapshot, canonicalTime } from '../../lib/catalog/snapshot.ts';
import type { CatalogSlugHistory, ProductRights, SnapshotProductInput } from '../../lib/catalog/types.ts';
import { cleanAmazonImageUrl } from '../../lib/image-utils.ts';
import { isCatalogDisplayEligibleProduct, suppressNearDuplicateProducts } from '../../lib/db/product-scoring.ts';
import { editorialSourceHash, isPurchasableAvailability, sourceFactCount } from '../ops/catalog-editorial-core.mjs';
import { assertProtectedDestination } from '../catalog/export-postgres.ts';

type Row = Record<string, unknown>;
type Decision = { id: string; status: 'ready' | 'held'; reason: string };
const MERCHANT_TTL = 24 * 60 * 60_000;
const ASIN = /^[A-Z0-9]{10}$/;
const PRICE_CLAIM = /(?:[$€£¥]\s*\d|\b(?:USD|CAD|EUR|GBP|AUD)\s*\d|\b\d+(?:\.\d+)?\s*(?:dollars?|euros?|pounds?)\b)/i;
function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an input object');
  return value as Row;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

/** Decode only a one-dimensional PostgreSQL text[]; never split quoted commas. */
export function decodeTextArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value) && value.every((part) => typeof part === 'string')) return [...value];
  if (typeof value !== 'string' || value.length > 10_000 || !value.startsWith('{') || !value.endsWith('}')) throw new Error('Invalid source text array');
  if (value === '{}') return [];
  const result: string[] = [];
  let index = 1;
  while (index < value.length - 1) {
    let part = ''; const quoted = value[index] === '"';
    if (quoted) index++;
    let closed = !quoted;
    while (index < value.length - 1) {
      const character = value[index++];
      if (character === '\\') {
        if (index >= value.length - 1) throw new Error('Invalid source text array escape');
        part += value[index++];
      } else if (quoted && character === '"') { closed = true; break; }
      else if (!quoted && character === ',') { index--; break; }
      else if (!quoted && /[{}"]/.test(character)) throw new Error('Nested source array is unsupported');
      else part += character;
    }
    if (!closed || !part || (!quoted && part === 'NULL')) throw new Error('Invalid source tag');
    result.push(part);
    if (index < value.length - 1 && value[index++] !== ',') throw new Error('Invalid source array separator');
    if (index === value.length - 1 && value[index - 1] === ',') throw new Error('Invalid trailing source tag');
  }
  return result;
}

function facts(value: unknown): Row {
  return record(typeof value === 'string' ? JSON.parse(value) : value);
}
function image(value: unknown): string {
  const raw = text(value);
  decodeURIComponent(raw); // Reject malformed escapes before the shared cleaner can log.
  const safe = (candidate: string) => {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
      || !/^(?:m\.media-amazon\.com|images-(?:na|eu|fe)\.ssl-images-amazon\.com)$/.test(url.hostname)
      || !url.pathname.startsWith('/images/I/')) throw new Error('Missing fresh Amazon image');
  };
  safe(raw);
  const cleaned = cleanAmazonImageUrl(raw);
  safe(cleaned);
  return cleaned;
}
function affiliate(value: unknown, id: string, tag: string, marketplace: string): string {
  const url = new URL(text(value));
  const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/)?.[1];
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
    || url.hostname.replace(/^www\./, '') !== marketplace.replace(/^www\./, '') || asin !== id) {
    throw new Error('Missing fresh exact-product Amazon destination');
  }
  // Ignore all imported tags/campaign parameters. Canonical operator config wins.
  return `https://${marketplace}/dp/${id}?${new URLSearchParams({ tag })}`;
}

/** Pure, bounded transformation. No dotenv, credentials, provider or source writes. */
export function prepareCohort(rawRows: Row[], freshInput: unknown, options: {
  ids: string[]; catalogRevision: string; affiliateTag: string; marketplace?: string;
  now?: Date; slugHistory?: CatalogSlugHistory[];
}) {
  const now = options.now || new Date();
  if (!Number.isFinite(now.getTime()) || !options.catalogRevision.trim()
    || !/^[a-zA-Z0-9][a-zA-Z0-9-]{1,79}$/.test(options.affiliateTag)) throw new Error('Canonical revision/tag configuration is required');
  const ids = [...new Set(options.ids)];
  if (!ids.length || ids.length !== options.ids.length || ids.length > 10 || ids.some((id) => !ASIN.test(id))) throw new Error('Select 1..10 unique exact ASINs');
  const marketplace = options.marketplace || 'www.amazon.com';
  if (!/^(?:www\.)?amazon\.(?:com|ca|co\.uk|de|fr|it|es|co\.jp|com\.au)$/.test(marketplace)) throw new Error('Unreviewed Amazon marketplace');
  const fresh = record(freshInput);
  const observedAt = canonicalTime(fresh.observedAt);
  if (Date.parse(observedAt) > now.getTime()) throw new Error('Fresh receipt is in the future');
  const reference = text(fresh.reference).trim();
  if (!reference || reference.length > 500 || /[\u0000-\u001f]/.test(reference)) throw new Error('Fresh receipt reference is required');
  if (!Array.isArray(fresh.items) || fresh.items.length > 10) throw new Error('Fresh getItems receipt exceeds the 10-item bound');
  const remote = new Map<string, Row>();
  for (const raw of fresh.items) {
    const item = record(raw); const id = text(item.id);
    if (!ASIN.test(id) || !ids.includes(id) || remote.has(id)) throw new Error('Unexpected/duplicate fresh product identity');
    remote.set(id, item);
  }
  if (!Array.isArray(rawRows) || rawRows.length > 10_000) throw new Error('Raw source inventory exceeds the reviewed bound');
  const selected = new Map<string, Row>();
  for (const row of rawRows) {
    if (!ids.includes(text(row.id))) continue;
    if (selected.has(text(row.id))) throw new Error('Duplicate source identity');
    selected.set(text(row.id), row);
  }
  if (ids.some((id) => !selected.has(id))) throw new Error('Selected ASIN is absent from the protected source export');
  const expiresAt = new Date(Date.parse(observedAt) + MERCHANT_TTL).toISOString();
  const inputs: SnapshotProductInput[] = [];
  const rightsById: Record<string, ProductRights> = {};
  const decisions: Decision[] = [];
  const sourceRowSha256ById: Record<string, string> = {};

  for (const id of ids) {
    const row = selected.get(id)!;
    sourceRowSha256ById[id] = digest(row);
    const product: SnapshotProductInput = {
      id, publicId: text(row.public_id), slug: text(row.slug), source: 'amazon',
      title: 'Gift currently unavailable', description: 'This gift is not currently available.',
      imageUrl: '', affiliateUrl: '', price: 0, currency: text(row.currency) || 'USD',
      isActive: row.is_active === true, qualityScore: Number(row.quality_score),
      editorialStatus: text(row.editorial_status), editorialSourceHash: text(row.editorial_source_hash),
      sourceFactsHash: text(row.source_facts_hash), editorialQualityScore: Number(row.editorial_quality_score),
      editorialWriteup: text(row.editorial_writeup), punnyTitle: text(row.punny_title) || undefined,
      wittyDescription: text(row.witty_description) || undefined,
      duplicateOfProductId: text(row.duplicate_of_product_id) || undefined,
      editorialGeneratedAt: text(row.editorial_generated_at) || undefined,
    };
    let reason: string | undefined;
    const item = remote.get(id);
    if (row.source !== 'amazon') reason = 'unsupported_source';
    else if (row.is_active !== true) reason = 'inactive';
    else if (product.duplicateOfProductId) reason = 'duplicate';
    else if (!item) reason = 'missing_fresh_item';
    else if (Date.parse(expiresAt) <= now.getTime()) reason = 'expired_receipt';
    if (!reason && item) {
      try {
        if (item.source !== 'amazon' || item.remotelyVerified !== true || !text(item.title).trim()) throw new Error('Incomplete fresh product');
        product.title = text(item.title).trim();
        product.imageUrl = image(item.imageUrl);
        product.affiliateUrl = affiliate(item.affiliateUrl, id, options.affiliateTag, marketplace);
        product.sourceFacts = facts(item.sourceFacts);
        product.humorTags = decodeTextArray(row.humor_tags);
        product.availabilityStatus = text(item.availabilityStatus).toUpperCase();
        product.availabilityCheckedAt = observedAt;
        product.lastVerifiedAt = observedAt;
        const currentHash = editorialSourceHash(product);
        product.sourceFactsHash = currentHash;
        if (!isPurchasableAvailability(product.availabilityStatus)) reason = 'unavailable';
        else if (sourceFactCount(product) < 2) reason = 'insufficient_fresh_facts';
        else if (!product.editorialSourceHash || row.source_facts_hash !== product.editorialSourceHash
          || product.editorialSourceHash !== currentHash) reason = 'source_facts_changed';
        else if (!['generated_ready', 'manual_locked'].includes(product.editorialStatus || '')
          || !Number.isFinite(product.editorialQualityScore) || product.editorialQualityScore! < 0.8) reason = 'editorial_hold';
        else if (!isCatalogDisplayEligibleProduct(product)) reason = 'catalog_ineligible';
        product.description = product.wittyDescription || product.title;
        // Offer changes are not part of the factual editorial hash. Do not let
        // inherited copy smuggle an old displayed price into a price-free release.
        if (!reason && [product.title, product.punnyTitle, product.description, product.editorialWriteup]
          .some((copy) => PRICE_CLAIM.test(copy || ''))) reason = 'price_claim_in_copy';
      } catch { reason = 'incomplete_fresh_content'; }
    }
    if (reason) {
      product.isActive = false;
      rightsById[id] = {};
    } else {
      const grant = (value: string) => ({ basis: 'merchant' as const, value, observedAt, expiresAt,
        reference: `${reference}; unchanged source ${product.sourceFactsHash}` });
      rightsById[id] = Object.fromEntries([
        ['title', product.title], ['description', product.description], ['imageUrl', product.imageUrl],
        ['affiliateUrl', product.affiliateUrl], ['punnyTitle', product.punnyTitle],
        ['wittyDescription', product.wittyDescription], ['editorialWriteup', product.editorialWriteup],
        ['humorTags', product.humorTags?.length ? JSON.stringify(product.humorTags) : undefined],
      ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([field, value]) => [field, grant(value)]));
    }
    inputs.push(product);
    decisions.push({ id, status: reason ? 'held' : 'ready', reason: reason || 'fresh_unchanged_source' });
  }
  const candidates = inputs.filter((product) => product.isActive)
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0) || a.id.localeCompare(b.id));
  const distinct = new Set(suppressNearDuplicateProducts(candidates).map((product) => product.id));
  for (const product of candidates) {
    if (distinct.has(product.id)) continue;
    product.isActive = false;
    rightsById[product.id] = {};
    Object.assign(decisions.find((decision) => decision.id === product.id)!, { status: 'held', reason: 'duplicate_family' });
  }
  const snapshot = createCatalogSnapshot(inputs, rightsById, { catalogRevision: options.catalogRevision, now,
    slugHistory: options.slugHistory?.filter((history) => inputs.some((product) => product.publicId === history.publicId)) });
  const ready = new Set(snapshot.products.map((product) => product.id));
  for (const decision of decisions) if (decision.status === 'ready' && !ready.has(decision.id)) Object.assign(decision, { status: 'held', reason: 'snapshot_validation_hold' });
  const reasonCounts: Record<string, number> = {};
  for (const decision of decisions) reasonCounts[decision.reason] = (reasonCounts[decision.reason] || 0) + 1;
  return { snapshot, rightsById, inputs, sourceRowSha256ById,
    report: { selected: ids.length, ready: snapshot.products.length, held: snapshot.heldProducts.length, observedAt, expiresAt, decisions, reasonCounts } };
}

async function protectedRead(path: string, repository: string, maxBytes: number): Promise<string> {
  const actual = await realpath(path);
  await assertProtectedDestination(actual, repository);
  const metadata = await stat(actual);
  if (!metadata.isFile() || metadata.mode & 0o077 || metadata.size > maxBytes) throw new Error('Input must be a private bounded file');
  return readFile(actual, 'utf8');
}
async function main(argv: string[]) {
  if (argv.includes('--help')) {
    console.log('Usage: node --experimental-strip-types scripts/staging/prepare-cohort.mts --products /private/products.ndjson --fresh /private/get-items.json --ids ASIN,ASIN --revision staging-revision --output /private/new-cohort\nRequires canonical AMAZON_ASSOCIATE_TAG (optional AMAZON_MARKETPLACE). Offline only; new private output outside Git.');
    return;
  }
  const flags = new Map<string, string>();
  if (argv.length !== 10) throw new Error('Five explicit input/output options are required');
  for (let index = 0; index < argv.length; index += 2) {
    if (!['--products', '--fresh', '--ids', '--revision', '--output'].includes(argv[index]) || flags.has(argv[index])) throw new Error('Unknown/duplicate option');
    flags.set(argv[index], argv[index + 1]);
  }
  const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const output = await assertProtectedDestination(flags.get('--output')!, repository);
  const rows = (await protectedRead(flags.get('--products')!, repository, 60_000_000)).trim().split('\n').filter(Boolean).map((line) => record(JSON.parse(line)));
  const fresh = JSON.parse(await protectedRead(flags.get('--fresh')!, repository, 1_000_000));
  const result = prepareCohort(rows, fresh, { ids: flags.get('--ids')!.split(','), catalogRevision: flags.get('--revision')!,
    affiliateTag: process.env.AMAZON_ASSOCIATE_TAG || '', marketplace: process.env.AMAZON_MARKETPLACE });
  await mkdir(output, { mode: 0o700 });
  for (const [file, value] of [['catalog.snapshot.json', result.snapshot], ['rights.json', result.rightsById], ['inputs.json', {
    products: result.inputs, sourceRowSha256ById: result.sourceRowSha256ById,
  }], ['report.json', result.report]] as const) await writeFile(resolve(output, file), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ output, catalogRevision: result.snapshot.catalogRevision, selected: result.report.selected,
    ready: result.report.ready, held: result.report.held, reasonCounts: result.report.reasonCounts }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(() => {
  console.error('Offline cohort preparation failed safely. Review protected input shapes and freshness; no provider or source writes were made.');
  process.exitCode = 1;
});
