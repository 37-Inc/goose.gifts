import { createHash } from 'node:crypto';
import { canonicalJson } from './migration.ts';
import type { mapAuthoredCopyEvidence, CopyFieldEvidence, AuthoredCopyProduct } from './authored-copy-evidence.ts';
import type { DisplayRights, PersistentProductInput, SnapshotProductInput } from '../../lib/catalog/types.ts';
import { createPersistentCatalogProduct, publicProductRightsExpiry } from '../../lib/catalog/snapshot.ts';
import { hasReviewedGiftEditorial } from '../../lib/gift-slugs.ts';
import { PRUNING_CURRENT_LIMITS } from '../../lib/catalog/pruning-current.ts';
import { editorialSourceHash, validateEditorialDraft } from '../ops/catalog-editorial-core.mjs';

type Evidence = ReturnType<typeof mapAuthoredCopyEvidence>;
type Identity = { id: string; publicId: string; slug: string };
type HoldReason = 'missing_current' | 'missing_evidence' | 'inactive' | 'duplicate' | 'quality'
  | 'editorial_hold' | 'rights_unverified';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const OPTIONAL = ['punnyTitle', 'wittyDescription', 'editorialWriteup'] as const;
function identity(row: Identity): void {
  if (!/^[A-Z0-9]{10}$/.test(row.id) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.publicId)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) || row.slug.length > 120) throw new Error('permanent_identity_invalid');
}
function indexed<T extends Identity>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>(), publicIds = new Set<string>(), slugs = new Set<string>();
  for (const row of rows) {
    identity(row);
    if (map.has(row.id) || publicIds.has(row.publicId) || slugs.has(row.slug)) throw new Error('permanent_identity_duplicate');
    map.set(row.id, row); publicIds.add(row.publicId); slugs.add(row.slug);
  }
  return map;
}
function checked(field: CopyFieldEvidence | undefined): CopyFieldEvidence | undefined {
  if (field && (typeof field.value !== 'string' || hash(field.value) !== field.sha256
    || !field.references.length || field.references.some(value => typeof value !== 'string' || !value.trim())))
    throw new Error('permanent_evidence_field_invalid');
  return field;
}
function originalEditorialMatches(origin: AuthoredCopyProduct, current: SnapshotProductInput, raw?: string): boolean {
  if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw) > PRUNING_CURRENT_LIMITS.rowBytes
    || hash(raw) !== origin.sourceRowSha256) return false;
  try {
    const row = JSON.parse(raw);
    const original = { title: row.title, imageUrl: row.image_url, sourceFacts: JSON.parse(row.source_facts) };
    return row.id === origin.id && row.public_id === origin.publicId && row.slug === origin.slug
      && row.editorial_writeup === origin.fields.editorialWriteup?.value
      && row.source_facts_hash === row.editorial_source_hash && row.source_facts_hash === editorialSourceHash(original)
      && current.sourceFactsHash === row.source_facts_hash && current.editorialSourceHash === row.editorial_source_hash;
  } catch { return false; } // Never log private source rows or parser diagnostics.
}

/** Pure proposal, NOT a database patch or rights decision. The caller supplies
 * reviewed exact grants and the bytes of the existing pinned local SVG.
 * No supplier body, native vector, source record, time or history is rewritten. */
export function assemblePermanentBaseline(evidence: Evidence, current: SnapshotProductInput[], options: {
  expectedEvidenceSha256: string;
  approvedRightsById: Record<string, DisplayRights>;
  /** Owner-authorized restoration of the existing dataset. Exact per-field
   * grants must cite this reference; original supplier clocks stay unchanged. */
  existingDisplayReference?: string;
  /** Optional exact archived NDJSON lines, needed only for long-copy proof. */
  editorialSourceRowsById?: Record<string, string>;
  placeholder: { path: string; bytes: Uint8Array; expectedSha256: string };
  now: Date;
}) {
  if (!Number.isFinite(options.now.getTime()) || !HASH.test(options.expectedEvidenceSha256)
    || hash(canonicalJson(evidence)) !== options.expectedEvidenceSha256 || evidence.schemaVersion !== 1
    || evidence.counts.identities !== evidence.products.length) throw new Error('permanent_evidence_binding');
  if (options.existingDisplayReference !== undefined && (!options.existingDisplayReference.trim()
    || options.existingDisplayReference.length > 500)) throw new Error('permanent_restoration_reference');
  const asset = options.placeholder;
  if (!/^\/(?!\/)[a-zA-Z0-9/_\-.]+\.svg$/.test(asset.path) || asset.path.split('/').some(part => part === '.' || part === '..')
    || !HASH.test(asset.expectedSha256) || asset.bytes.byteLength > 64 * 1024 || hash(asset.bytes) !== asset.expectedSha256)
    throw new Error('permanent_placeholder_binding');
  let svg: string;
  try { svg = new TextDecoder('utf-8', { fatal: true }).decode(asset.bytes); } catch { throw new Error('permanent_placeholder_utf8'); }
  if (!/^\s*<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg) || !/<\/svg>\s*$/.test(svg)
    || /<(?:script|image|foreignObject)\b|\b(?:href|on[a-z]+)\s*=|url\s*\(/i.test(svg)) throw new Error('permanent_placeholder_svg');
  const archived = indexed(evidence.products), authoritative = indexed(current);
  const ids = [...new Set([...archived.keys(), ...authoritative.keys()])].sort();
  // Detect cross-input identity collisions as well as per-input duplicates.
  indexed(ids.map(id => authoritative.get(id) ?? archived.get(id)!));
  if (Object.keys(options.approvedRightsById).some(id => !ids.includes(id))) throw new Error('permanent_grant_identity_unknown');
  const proposed: Array<{ id: string; input: PersistentProductInput }> = [];
  const holds: Array<Identity & { reason: HoldReason }> = [];
  const omitted: Array<{ id: string; fields: string[] }> = [];
  for (const id of ids) {
    const origin = archived.get(id), source = authoritative.get(id), original = source ?? origin!;
    if (source && origin && (source.publicId !== origin.publicId || source.slug !== origin.slug || source.source !== 'amazon'))
      throw new Error('permanent_identity_drift');
    let reason: HoldReason | undefined;
    if (!source) reason = 'missing_current';
    else if (!origin) reason = 'missing_evidence';
    else if (source.isActive !== true) reason = 'inactive';
    else if (source.duplicateOfProductId) reason = 'duplicate';
    else if (!Number.isFinite(source.qualityScore) || source.qualityScore! < .55 || source.qualityScore! > 1) reason = 'quality';
    else if (['blocked', 'needs_review'].includes(source.editorialStatus ?? '')) reason = 'editorial_hold';
    if (reason) { holds.push({ id, publicId: original.publicId, slug: original.slug, reason }); continue; }
    const row = source!, fields = origin!.fields, approved = options.approvedRightsById[id] ?? {};
    const title = checked(fields.title)!, link = checked(fields.retailerUrl)!;
    if (!['slug_identity_label', 'id_identity_label'].includes(title.kind) || link.kind !== 'constructed_retailer_destination')
      throw new Error('permanent_constructed_field_invalid');
    const product: SnapshotProductInput = { id, publicId: row.publicId, slug: row.slug, source: row.source, currency: row.currency,
      title: title.value, description: title.value, imageUrl: asset.path, affiliateUrl: link.value, price: 0,
      isActive: row.isActive, qualityScore: row.qualityScore, editorialStatus: row.editorialStatus };
    const skipped: string[] = [];
    if (options.existingDisplayReference) {
      for (const [field, value] of Object.entries({ title: row.title, description: row.description || row.wittyDescription || row.title,
        imageUrl: row.imageUrl, punnyTitle: row.punnyTitle, wittyDescription: row.wittyDescription })) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const right = approved[field as keyof DisplayRights];
        if (!right || right.value !== value || right.basis === 'merchant' || right.expiresAt
          || !right.reference.includes(options.existingDisplayReference)) throw new Error('permanent_restoration_field');
        Object.assign(product, { [field]: value });
      }
      if (row.humorTags?.length) {
        const right = approved.humorTags;
        if (!right || right.value !== JSON.stringify(row.humorTags) || right.basis === 'merchant' || right.expiresAt
          || !right.reference.includes(options.existingDisplayReference)) throw new Error('permanent_restoration_field');
        product.humorTags = [...row.humorTags];
      }
    } else for (const [target, candidate, actual] of [
      ['description', fields.description, row.description ?? row.wittyDescription],
      ['punnyTitle', fields.punnyTitle, row.punnyTitle],
      ['wittyDescription', fields.description, row.wittyDescription],
    ] as const) {
      const value = checked(candidate);
      // Boilerplate fallback prose is deliberately not a permanent description.
      if (value?.kind === 'committed_seed_exact' && value.value === actual && approved[target]?.value === value.value)
        product[target] = value.value;
      else if (value) skipped.push(`${target}_not_selected_or_current`);
    }
    const article = checked(fields.editorialWriteup);
    const restoredArticle = options.existingDisplayReference && row.editorialWriteup
      && approved.editorialWriteup?.value === row.editorialWriteup && approved.editorialWriteup.basis !== 'merchant'
      && !approved.editorialWriteup.expiresAt && approved.editorialWriteup.reference.includes(options.existingDisplayReference);
    if ((restoredArticle || article?.kind === 'recorded_generation' && row.editorialWriteup === article.value
      && row.editorialModel === origin!.authoring.model && row.editorialPromptVersion === origin!.authoring.promptVersion
      && originalEditorialMatches(origin!, row, options.editorialSourceRowsById?.[id]))
      && hasReviewedGiftEditorial(row) && row.sourceFacts && row.sourceFactsHash === editorialSourceHash(row)
      && row.editorialWriteup && validateEditorialDraft(row, row.editorialWriteup).approved
      && approved.editorialWriteup?.value === row.editorialWriteup) {
      product.editorialWriteup = row.editorialWriteup;
      product.editorialQualityScore = row.editorialQualityScore;
      product.sourceFactsHash = row.sourceFactsHash; product.editorialSourceHash = row.editorialSourceHash;
    } else if (article) skipped.push('editorial_not_selected_or_current_factual_review_failed');
    const display = createPersistentCatalogProduct({ product, rights: approved }, options.now);
    if (!display) { holds.push({ id, publicId: row.publicId, slug: row.slug, reason: 'rights_unverified' }); continue; }
    const rights: DisplayRights = {};
    for (const field of ['title', 'description', 'imageUrl', 'affiliateUrl', ...OPTIONAL] as const) {
      if (field in display) rights[field] = structuredClone(approved[field]!);
    }
    if (display.humorTags) rights.humorTags = structuredClone(approved.humorTags!);
    for (const field of OPTIONAL) if (!(field in display)) delete product[field];
    if (publicProductRightsExpiry(display, rights, options.now) !== Infinity) throw new Error('permanent_grants_not_exact');
    if (!display.editorialWriteup) {
      delete product.editorialWriteup; delete product.editorialQualityScore;
      delete product.sourceFactsHash; delete product.editorialSourceHash;
    }
    proposed.push({ id, input: { product, rights } });
    if (skipped.length) omitted.push({ id, fields: skipped.sort() });
  }
  const identities = ids.map(id => { const row = authoritative.get(id) ?? archived.get(id)!;
    return { id, publicId: row.publicId, slug: row.slug }; });
  return { schemaVersion: 1 as const, proposed, holds, omitted,
    reconciliation: { evidenceSha256: options.expectedEvidenceSha256, placeholderSha256: asset.expectedSha256,
      evidenceCount: archived.size, currentCount: authoritative.size, identityCount: ids.length,
      proposedCount: proposed.length, heldCount: holds.length, identities,
      identitySha256: hash(canonicalJson(identities)),
      missingCurrent: ids.filter(id => !authoritative.has(id)), missingEvidence: ids.filter(id => !archived.has(id)) } };
}
