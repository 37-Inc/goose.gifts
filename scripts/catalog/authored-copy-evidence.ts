import { createHash } from 'node:crypto';
import { canonicalJson, canonicalTimestamp } from './migration.ts';
import type { validateRecoveryArchive, ValidatedRecoveryTable } from './recovery-archive.ts';
import { editorialSourceHash, editorialWordCount, validateEditorialDraft } from '../ops/catalog-editorial-core.mjs';

type Row = Record<string, unknown>;
type Archive = Pick<Awaited<ReturnType<typeof validateRecoveryArchive>>, 'summary' | 'tables'>;
export interface AuthoredSeedInput { reference: string; raw: string; expectedSha256: string }
export interface CopyFieldEvidence {
  value: string;
  sha256: string;
  kind: 'slug_identity_label' | 'id_identity_label' | 'committed_seed_exact' | 'local_fallback_exact'
    | 'recorded_generation' | 'constructed_retailer_destination';
  references: string[];
}
export interface AuthoredCopyProduct {
  id: string; publicId: string; slug: string; sourceRowSha256: string;
  fields: {
    title: CopyFieldEvidence; punnyTitle?: CopyFieldEvidence; description?: CopyFieldEvidence;
    editorialWriteup?: CopyFieldEvidence; retailerUrl: CopyFieldEvidence;
  };
  image: { kind: 'local_svg_placeholder' };
  curation: { isActive: boolean; duplicateOfProductId: string | null; qualityScore: number | null;
    editorialStatus: string; editorialBlockReason: string | null };
  /** Original wall-time text, never interpreted as a new observation or approval. */
  authoring: { model: string | null; promptVersion: string | null; generatedAtRaw: string | null };
  unresolved: string[];
}

const HASH = /^[a-f0-9]{64}$/;
const ASIN = /^[A-Z0-9]{10}$/;
const RECIPE = 'repo:7223ead2619eb3f5937d5a826639603f50a13fdf/scripts/ops/prefetch-catalog.mjs'
  + '#fallbackWittyDescription:sha256:127de2ed7aa31ed1e504bea2e4e58a4777099ba1fc83f16897b836fe28a514d9';
const VALIDATOR = 'repo:7223ead2619eb3f5937d5a826639603f50a13fdf/scripts/ops/catalog-editorial-core.mjs'
  + '#validateEditorialDraft:sha256:fb2df611cf8a2f8c0ff9fb8f582ac9b6618d470c755262a20e959deb098b9feb';
const PRICE = /(?:[$€£¥]\s*\d|\b(?:USD|CAD|EUR|GBP|AUD)\s*\d|\b\d+(?:\.\d+)?\s*(?:dollars?|euros?|pounds?)\b)/i;
const MUTABLE = /\b(?:(?:currently|now) available|available (?:now|today)|in stock|out of stock|on sale|(?:free|two-day|same-day) shipping)\b|\bonly \$\d/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const text = (value: unknown) => typeof value === 'string' ? value : '';
const noOffer = (value: string) => !PRICE.test(value) && !MUTABLE.test(value);
function authoringTime(value: string): boolean {
  if (!value) return false;
  try { canonicalTimestamp(value, { timezone: 'UTC', evidence: 'Syntax validation only; result discarded' }); return true; }
  catch { return false; } // No inferred instant is returned or persisted.
}
function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('authored_copy_object_invalid');
  return value as Row;
}
function json(value: string): unknown {
  try { return JSON.parse(value); } catch { throw new Error('authored_copy_json_invalid'); }
}
function truncate(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= length ? normalized : `${normalized.slice(0, length - 3).trim()}...`;
}
function field(value: string, kind: CopyFieldEvidence['kind'], references: string[]): CopyFieldEvidence {
  return { value, sha256: hash(value), kind, references: [...new Set(references)].sort() };
}
function reference(value: string): string {
  if (!value || value.length > 512 || /[\u0000-\u001f]/.test(value)) throw new Error('authored_copy_reference_invalid');
  return value;
}
/** Recheck the relevant bytes, not caller-mutable parsed archive.rows. The
 * caller supplies the complete result of validateRecoveryArchive. */
function sourceTable(archive: Archive, name: string): Array<{ row: Row; sha256: string }> {
  const matches = archive.tables.filter(table => table.definition.schema === 'public' && table.definition.name === name);
  if (matches.length !== 1) throw new Error('authored_copy_table_missing');
  const table: ValidatedRecoveryTable = matches[0];
  const summary = archive.summary.tables.find(item => item.schema === 'public' && item.name === name);
  if (!summary || summary.sourceSha256 !== table.definition.sha256 || hash(table.raw) !== table.definition.sha256
    || Buffer.byteLength(table.raw) > 60_000_000 || (table.raw.length && !table.raw.endsWith('\n')))
    throw new Error('authored_copy_table_binding');
  const lines = table.raw ? table.raw.slice(0, -1).split('\n') : [];
  if (lines.length !== table.definition.rowCount || lines.length !== summary.rowCount) throw new Error('authored_copy_table_count');
  const columns = canonicalJson(table.definition.columns.map(column => column.name).sort());
  return lines.map(line => {
    const row = object(json(line));
    if (canonicalJson(Object.keys(row).sort()) !== columns) throw new Error('authored_copy_columns_invalid');
    return { row, sha256: hash(line) };
  });
}

/** Pure offline authoring/construction evidence, NOT a rights grant, renewed
 * freshness, publication approval or legal classification. Full source rows
 * and native vector bodies are never copied; unknown copy stays absent. */
export function mapAuthoredCopyEvidence(archive: Archive, options: {
  expectedManifestSha256: string; archiveReference: string; seeds: AuthoredSeedInput[];
  canonicalAffiliateTag: string;
}) {
  if (!HASH.test(options.expectedManifestSha256) || archive.summary.manifestSha256 !== options.expectedManifestSha256)
    throw new Error('authored_copy_manifest_binding');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(options.canonicalAffiliateTag)) throw new Error('authored_copy_tag_invalid');
  const archiveRef = `${reference(options.archiveReference)}#manifest-sha256:${options.expectedManifestSha256}`;
  const products = sourceTable(archive, 'products');
  const eventRows = sourceTable(archive, 'catalog_editorial_events');
  const events = new Map<string, Array<{ details: Row; reference: string }>>();
  const eventIds = new Set<string>();
  for (const entry of eventRows) {
    const id = text(entry.row.id), productId = text(entry.row.product_id);
    if (!id || !productId || eventIds.has(id)) throw new Error('authored_copy_event_identity');
    eventIds.add(id);
    const details = entry.row.details === null ? {} : object(json(text(entry.row.details)));
    const values = events.get(productId) || [];
    values.push({ details, reference: `${archiveRef}/catalog_editorial_events/${id}:sha256:${entry.sha256}` });
    events.set(productId, values);
  }
  const seeds = new Map<string, Array<{ row: Row; reference: string }>>();
  const seedPins = options.seeds.map(seed => {
    if (!HASH.test(seed.expectedSha256) || hash(seed.raw) !== seed.expectedSha256 || Buffer.byteLength(seed.raw) > 1_000_000)
      throw new Error('authored_copy_seed_binding');
    const parsed = object(json(seed.raw));
    if (!Array.isArray(parsed.products)) throw new Error('authored_copy_seed_invalid');
    const ids = new Set<string>();
    const ref = `${reference(seed.reference)}#sha256:${seed.expectedSha256}`;
    for (const value of parsed.products) {
      const row = object(value), id = text(row.id);
      if (!ASIN.test(id) || ids.has(id)) throw new Error('authored_copy_seed_identity');
      ids.add(id);
      const values = seeds.get(id) || []; values.push({ row, reference: ref }); seeds.set(id, values);
    }
    return { reference: seed.reference, sha256: seed.expectedSha256 };
  });
  const seen = { id: new Set<string>(), publicId: new Set<string>(), slug: new Set<string>() };
  const mapped: AuthoredCopyProduct[] = products.map(entry => {
    const row = entry.row, id = text(row.id), publicId = text(row.public_id), slug = text(row.slug);
    if (!ASIN.test(id) || row.source !== 'amazon' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(publicId)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120
      || seen.id.has(id) || seen.publicId.has(publicId) || seen.slug.has(slug)) throw new Error('authored_copy_product_identity');
    seen.id.add(id); seen.publicId.add(publicId); seen.slug.add(slug);
    if (typeof row.is_active !== 'boolean' || !(row.quality_score === null || typeof row.quality_score === 'string')
      || !(row.duplicate_of_product_id === null || typeof row.duplicate_of_product_id === 'string')) throw new Error('authored_copy_curation_invalid');
    const qualityScore = row.quality_score === null ? null : Number(row.quality_score);
    if (qualityScore !== null && (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(text(row.quality_score))
      || !Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 1)) throw new Error('authored_copy_curation_invalid');
    const sourceRef = `${archiveRef}/products/${id}:sha256:${entry.sha256}`;
    const label = truncate(slug.replaceAll('-', ' '), 78);
    const fields: AuthoredCopyProduct['fields'] = {
      title: noOffer(label)
        ? field(label[0].toUpperCase() + label.slice(1), 'slug_identity_label', [sourceRef, 'recipe:canonical-slug-words-v1'])
        : field(`Catalog gift ${id}`, 'id_identity_label', [sourceRef, 'recipe:catalog-id-label-v1']),
      retailerUrl: field(`https://www.amazon.com/dp/${id}?${new URLSearchParams({ tag: options.canonicalAffiliateTag })}`,
        'constructed_retailer_destination', [sourceRef, `recipe:amazon-dp-v1:tag-sha256:${hash(options.canonicalAffiliateTag)}`]),
    };
    const unresolved: string[] = [];
    for (const [target, source, seedKey, limit] of [
      ['punnyTitle', 'punny_title', 'punnyTitle', 78], ['description', 'witty_description', 'wittyDescription', 150],
    ] as const) {
      const value = text(row[source]);
      const matches = (seeds.get(id) || []).filter(seed => text(seed.row[seedKey]) && truncate(text(seed.row[seedKey]), limit) === value);
      const merchantTitleFallback = target === 'punnyTitle' && value === truncate(text(row.title), 78);
      if (value && noOffer(value) && matches.length && !merchantTitleFallback)
        fields[target] = field(value, 'committed_seed_exact', [sourceRef, ...matches.map(seed => seed.reference)]);
    }
    const fallback = truncate(row.source_query ? `Found while hunting for ${text(row.source_query)}.` : 'A strange little catalog find.', 150);
    if (!fields.description && row.witty_description === fallback && noOffer(fallback))
      fields.description = field(fallback, 'local_fallback_exact', [sourceRef, RECIPE]);
    if (!fields.description) unresolved.push('description_no_positive_evidence');
    if (!fields.punnyTitle) unresolved.push('punny_title_no_positive_evidence');
    const writeup = text(row.editorial_writeup);
    const matching = (events.get(id) || []).filter(event => event.details.editorialSourceHash === row.editorial_source_hash
      && event.details.sourceFactsHash === row.editorial_source_hash
      && event.details.model === row.editorial_model && event.details.promptVersion === row.editorial_prompt_version
      && event.details.finalWordCount === editorialWordCount(writeup));
    const model = text(row.editorial_model), prompt = text(row.editorial_prompt_version);
    if (writeup && matching.length && authoringTime(text(row.editorial_generated_at)) && ['gpt-4o-mini', 'codex-owner-session'].includes(model)
      && ['catalog-editorial-v1', 'catalog-editorial-v2', 'reviewed-cohort-v1', 'reviewed-cohort-v1-recovery'].includes(prompt)
      && ['generated_ready', 'manual_locked'].includes(text(row.editorial_status)) && Number(row.editorial_quality_score) >= 0.8
      && HASH.test(text(row.editorial_source_hash)) && row.source_facts_hash === row.editorial_source_hash && noOffer(writeup)) {
      const sourceProduct = { title: text(row.title), imageUrl: text(row.image_url), sourceFacts: object(json(text(row.source_facts))) };
      if (editorialSourceHash(sourceProduct) === row.editorial_source_hash && validateEditorialDraft(sourceProduct, writeup).approved)
        fields.editorialWriteup = field(writeup, 'recorded_generation', [sourceRef, VALIDATOR, ...matching.map(event => event.reference)]);
    }
    if (!fields.editorialWriteup) unresolved.push(writeup ? 'editorial_evidence_or_factual_gate_failed' : 'editorial_absent');
    return { id, publicId, slug, sourceRowSha256: entry.sha256, fields, image: { kind: 'local_svg_placeholder' },
      curation: { isActive: row.is_active, duplicateOfProductId: row.duplicate_of_product_id as string | null,
        qualityScore, editorialStatus: text(row.editorial_status), editorialBlockReason: text(row.editorial_block_reason) || null },
      authoring: { model: model || null, promptVersion: prompt || null, generatedAtRaw: text(row.editorial_generated_at) || null }, unresolved };
  });
  if ([...events.keys()].some(id => !seen.id.has(id))) throw new Error('authored_copy_event_product_missing');
  return { schemaVersion: 1 as const, manifestSha256: options.expectedManifestSha256, archiveReference: options.archiveReference,
    seedPins, products: mapped, counts: { identities: mapped.length,
      seedPunnyTitles: mapped.filter(product => product.fields.punnyTitle).length,
      descriptions: mapped.filter(product => product.fields.description).length,
      editorials: mapped.filter(product => product.fields.editorialWriteup).length,
      activeNonduplicateQuality055: mapped.filter(product => product.curation.isActive && !product.curation.duplicateOfProductId
        && product.curation.qualityScore !== null && product.curation.qualityScore >= 0.55).length } };
}
