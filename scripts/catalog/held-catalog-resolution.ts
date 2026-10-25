import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import { mutationAssertion, mutationAdvance, readMutationOwner } from '../../lib/catalog/mutation-fence.ts';
import type { CatalogSnapshot, DisplayRights, PersistentCatalogProduct, ProductRights, SnapshotProductInput } from '../../lib/catalog/types.ts';
import { createPersistentCatalogProduct, validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import { canonicalJson, sha256 } from './migration.ts';
import { maintenanceState } from './maintenance-state.ts';
import { exactOwnerBaseTitle, OWNER_PUBLIC_DUPLICATE } from '../../lib/catalog/owner-base-review.ts';
import type { OwnerPublicDuplicate } from '../../lib/catalog/owner-base-review.ts';
import { EXACT_DUPLICATE_LISTINGS } from '../../lib/catalog/duplicate-listings.ts';

type Row = Record<string, unknown>;
export interface HeldResolutionRow { row: Row; sidecar: Row | null }
interface HeldCatalogMutation { id: string; before: HeldResolutionRow; after: HeldResolutionRow; display: PersistentCatalogProduct | null }
/** Actual reviewed objections, not a blanket historical status. Funny books,
 * novelty mugs, costumes and unapproved LONG drafts are deliberately absent. */
export const HELD_CATALOG_EXCLUSIONS: Readonly<Record<string, string>> = Object.freeze({
  '1630260436': 'Ordinary dog-treat recipe cookbook; no unusual or humorous product feature.',
  B071ZZFTZG: 'Standard scented bath-bomb assortment; no unusual or humorous product feature.',
  B0764HS4SL: 'Standard vegetable chopper; no unusual or humorous product feature.',
  B079YWG3GM: 'Ordinary licensed Mickey Mouse plush toy; no unusual or humorous product feature.',
  B08CVS9Z2Y: 'Standard pine-scented candle; no unusual or humorous product feature.',
  B08LB3R9XG: 'Standard ramen-bowl set; no unusual or humorous product feature.',
  B094CHY3SV: 'Conventional carved gemstone elephant ornament; no unusual or humorous product feature.',
  B0999LRNRB: 'Standard children baking kit; no unusual or humorous product feature.',
  B09BZ4NV2R: 'Standard makeup-brush set; no unusual or humorous product feature.',
  B09PHGN1MC: 'Generic cat-quote wall decal; no distinctive physical gag or product feature.',
  B09QLLK4R9: 'Standard family-game bundle; no unusual or humorous product feature.',
  B0B8GB1LD4: 'Standard bulk smores ingredients; no unusual or humorous product feature.',
  B0B9PZHWGZ: 'Standard cocktail shaker; no unusual or humorous product feature.',
  B0BCCZBLN5: 'Generic dog-themed coloring/activity book; no distinctive product gag.',
  B0BCDB95FT: 'Generic dog-themed coloring book; no distinctive product gag.',
  B0BQHXYWSF: 'Standard game-and-snack gift basket; no unusual or humorous product feature.',
  B0BXYT5KD9: 'Ordinary licensed character-logo shirt; no unusual or humorous product feature.',
  B0C282QD51: 'Standard diaper backpack; no unusual or humorous product feature.',
  B0CBP2JB8P: 'Conventional decorative heart-hands sculpture; no distinctive absurd feature.',
  B0CBR3K68S: 'Conventional decorative heart-hands sculpture; no distinctive absurd feature.',
  B0CJ4ZDH8Y: 'Standard disposable party food boxes; no unusual or humorous product feature.',
  B0DM1MPVXP: 'Generic large-print Christmas coloring book; no distinctive product gag.',
  B0DQ1MLM4L: 'Standard character-themed coloring party favors; no distinctive product gag.',
  B0F9NZ923R: 'Standard game-and-snack gift basket; no unusual or humorous product feature.',
});
const hash = (value: unknown) => sha256(canonicalJson(value));
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const columns = (row: Row) => Object.keys(row).sort().map(k => {
  if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw Error('held_resolution_column'); return k;
});
const PATCH_FIELDS = ['is_active', 'editorial_status', 'duplicate_of_product_id', 'title', 'description', 'tags', 'public_display_json', 'rights_json', 'catalog_revision'];
const SIDECAR_FIELDS = ['version', 'semantic_json'];
function refuse(code: string): never { throw Error('held_resolution_' + code); }
function pairQuery(pair: HeldResolutionRow) {
  const keys = columns(pair.row), side = pair.sidecar, fields = side ? columns(side) : [];
  const params = [...keys.map(k => pair.row[k]), ...(side ? fields.map(k => side[k]) : [pair.row.id])];
  if (params.length > 100) refuse('parameters');
  return { sql: `SELECT json(CASE WHEN EXISTS(SELECT 1 FROM products WHERE ${keys.map(k => `${k} IS ?`).join(' AND ')}) AND ${side
    ? `EXISTS(SELECT 1 FROM catalog_maintenance_products WHERE ${fields.map(k => `${k} IS ?`).join(' AND ')})`
    : 'NOT EXISTS(SELECT 1 FROM catalog_maintenance_products WHERE product_id=?)'} THEN 'true' ELSE 'held_resolution_conflict' END)`, params };
}
function pairCas(db: CatalogD1, pair: HeldResolutionRow) {
  const q = pairQuery(pair); return db.prepare(q.sql).bind(...q.params);
}
export interface HeldCatalogResolution {
  schemaVersion: 1; kind: 'held-catalog-resolution-v1'; owner: MutationOwner; reference: string; createdAt: string;
  catalogRevision: string;
  baseline: CatalogSnapshot; capture: HeldResolutionRow[];
  promotions: Array<{ id: string; before: HeldResolutionRow; after: HeldResolutionRow; display: PersistentCatalogProduct }>;
  exclusions: Array<{ id: string; reason: string; duplicateOfProductId: string | null }>;
  clearedLegacyDuplicateFlags: Array<{ id: string; previousDuplicateOfProductId: string; reason: string }>;
  publicDuplicate?: { review: OwnerPublicDuplicate; change: HeldCatalogMutation; keeper: HeldResolutionRow };
}
/** Only exact normalized listing labels, never broad format/archetype/fuzzy
 * similarity. Brand, size, model and all alphanumeric distinctions survive. */
export function exactHeldListingTitle(title: string): string {
  return exactOwnerBaseTitle(title);
}
/** Bounded12-20-row batches in the ordinary case, automatically smaller for a
 * large original row. Reserve128KiB for the fixed owner/receipt envelope. */
export function heldCatalogResolutionBatches(plan: HeldCatalogResolution) {
  const batches: HeldCatalogMutation[][] = [];
  let bytes = 0, statements = 4;
  for (const p of [...plan.promotions, ...(plan.publicDuplicate ? [plan.publicDuplicate.change] : [])]) {
    const queries = [pairQuery(p.before), pairQuery(p.after), { sql: `UPDATE products SET ${PATCH_FIELDS.map(k => k + '=?').join(',')} WHERE id=?`,
      params: [...PATCH_FIELDS.map(k => p.after.row[k]), p.id] }, ...(p.after.sidecar ? [{ sql: 'UPDATE catalog_maintenance_products SET version=?,semantic_json=? WHERE product_id=?',
      params: [p.after.sidecar.version, p.after.sidecar.semantic_json, p.id] }] : []),
      ...(p.id === plan.publicDuplicate?.review.id ? [pairQuery(plan.publicDuplicate.keeper)] : [])];
    const size = Buffer.byteLength(JSON.stringify(queries));
    if (size > 384 * 1024) refuse('row_bounds');
    if (!batches.length || batches.at(-1)!.length >= 20 || bytes + size > 384 * 1024 || statements + queries.length > 50) {
      batches.push([]); bytes = 0; statements = 4;
    }
    batches.at(-1)!.push(p); bytes += size; statements += queries.length;
  }
  return batches;
}

/** Pure owner-requested curation plan. No fresh supplier observation, price,
 * generated prose, article approval, source rewrite or native-index mutation. */
export function prepareHeldCatalogResolution(input: {
  baseline: CatalogSnapshot; rows: HeldResolutionRow[]; owner: MutationOwner; reference: string; now: string; catalogRevision?: string;
}): HeldCatalogResolution {
  const { owner, reference, now } = input;
  if (!reference.trim() || reference.length > 1000 || !Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now)
    refuse('approval');
  if (owner.phase !== 'writing' || now < owner.capturedAt) refuse('owner');
  const catalogRevision = input.catalogRevision ?? owner.ownerReference;
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(catalogRevision) || catalogRevision === input.baseline.catalogRevision) refuse('revision');
  const baseline = validateCatalogSnapshot(input.baseline, new Date(now));
  const held = new Map(baseline.heldProducts.map(p => [p.id, p]));
  const publicRows = input.rows.filter(p => !held.has(String(p.row.id)));
  const publicPair = publicRows.length === 2 && Object.values(OWNER_PUBLIC_DUPLICATE).every(id =>
    publicRows.some(p => p.row.id === id) && baseline.products.some(p => p.id === id));
  if (publicRows.length && !publicPair || input.rows.length !== held.size + (publicPair ? 2 : 0)
    || input.rows.length > 5000 || new Set(input.rows.map(p => p.row.id)).size !== input.rows.length)
    refuse('identities');
  const plan: HeldCatalogResolution = { schemaVersion: 1, kind: 'held-catalog-resolution-v1', owner: structuredClone(owner),
    reference, createdAt: now, catalogRevision, baseline: structuredClone(baseline), capture: structuredClone(input.rows),
    promotions: [], exclusions: [], clearedLegacyDuplicateFlags: [] };
  const representatives = new Map(baseline.products.map(p => [exactHeldListingTitle(p.title), p.id]));
  for (const before of input.rows.filter(p => held.has(String(p.row.id))).sort((a, b) => String(a.row.id).localeCompare(String(b.row.id)))) {
    const { row, sidecar } = before, identity = held.get(String(row.id));
    if (!identity || identity.publicId !== row.public_id || identity.slug !== row.slug
      || sidecar && sidecar.product_id !== row.id) refuse('identity');
    const p = maintenanceState({ ...row, maintenance_semantic: sidecar?.semantic_json ?? null });
    if (p.source !== 'amazon') refuse('unsupported_source');
    // Old pointer flags were generated by broad family/archetype heuristics
    // (different box designs, mug prints, books and even plush vs desk goats).
    // Only actual exact listing evidence justifies keeping one excluded now.
    const duplicate = EXACT_DUPLICATE_LISTINGS[p.id] || representatives.get(exactHeldListingTitle(p.title)) || null;
    const objection = duplicate ? 'Duplicate of ' + duplicate : HELD_CATALOG_EXCLUSIONS[p.id];
    if (objection) { plan.exclusions.push({ id: p.id, reason: objection, duplicateOfProductId: duplicate }); continue; }
    // Source flags describe old supplier/draft state. Listing approval does not
    // approve that draft or invent current stock, hash, observation or rights.
    const status = ['blocked', 'needs_review', 'duplicate'].includes(p.editorialStatus) ? 'pending' : p.editorialStatus;
    const title = p.title, description = typeof p.description === 'string' && p.description.trim() ? p.description : p.wittyDescription;
    if (!title.trim() || !description?.trim() || !p.imageUrl?.trim()) {
      plan.exclusions.push({ id: p.id, reason: 'Missing essential ' + (!title.trim() ? 'title' : !description?.trim() ? 'short description' : 'image'), duplicateOfProductId: null }); continue;
    }
    const product: SnapshotProductInput = { id: p.id, publicId: p.publicId, slug: p.slug, source: p.source, currency: p.currency,
      title, description, imageUrl: p.imageUrl, affiliateUrl: `https://www.amazon.com/dp/${p.id}?tag=goose-gifts-37-20`,
      price: 0, isActive: true, qualityScore: Number(p.qualityScore), editorialStatus: status,
      ...(p.punnyTitle ? { punnyTitle: p.punnyTitle } : {}), ...(p.wittyDescription ? { wittyDescription: p.wittyDescription } : {}),
      ...(p.humorTags?.length ? { humorTags: p.humorTags.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())) } : {}) };
    const rights: DisplayRights = {};
    for (const field of ['title', 'description', 'imageUrl', 'affiliateUrl', 'punnyTitle', 'wittyDescription', 'humorTags'] as const) {
      const value = field === 'humorTags' ? product.humorTags?.length ? JSON.stringify(product.humorTags) : undefined : product[field];
      if (value) rights[field] = { basis: 'licensed', reference, value };
    }
    const display = createPersistentCatalogProduct({ product, rights }, new Date(now));
    if (!display || display.indexable || display.editorialWriteup) refuse('display');
    const oldRights = JSON.parse(String(row.rights_json)) as ProductRights;
    const after: HeldResolutionRow = { row: { ...row, is_active: 1, editorial_status: status, duplicate_of_product_id: null, title: display.title,
      description: display.description, tags: display.humorTags?.join(' ') || '', public_display_json: canonicalJson(display),
      rights_json: canonicalJson({ ...oldRights, persistent: rights }), catalog_revision: catalogRevision }, sidecar: sidecar ? { ...sidecar,
        version: Number(sidecar.version) + 1, semantic_json: canonicalJson({ ...p, isActive: true, editorialStatus: status, duplicateOfProductId: null, persistentBase: display }) } : null };
    // Exact archived source, native bytes, supplier facts/times and scores stay.
    plan.promotions.push({ id: p.id, before: structuredClone(before), after, display });
    if (p.duplicateOfProductId) plan.clearedLegacyDuplicateFlags.push({ id: p.id, previousDuplicateOfProductId: p.duplicateOfProductId,
      reason: 'No exact same-product listing evidence; historical broad-family pointer cleared under owner restoration.' });
    representatives.set(exactHeldListingTitle(p.title), p.id);
  }
  // A reviewed duplicate must retain a real public representative, including
  // one promoted in this same plan. Never silently exclude both identities.
  const publicIds = new Set([...baseline.products.filter(p => !publicPair || p.id !== OWNER_PUBLIC_DUPLICATE.id).map(p => p.id), ...plan.promotions.map(p => p.id)]);
  if (plan.exclusions.some(p => p.duplicateOfProductId && !publicIds.has(p.duplicateOfProductId))) refuse('duplicate_representative');
  if (publicPair) {
    const before = publicRows.find(p => p.row.id === OWNER_PUBLIC_DUPLICATE.id)!, keeper = publicRows.find(p => p.row.id === OWNER_PUBLIC_DUPLICATE.keeperId)!;
    for (const pair of publicRows) {
      const prior = baseline.products.find(p => p.id === pair.row.id)!;
      if (prior.publicId !== pair.row.public_id || prior.slug !== pair.row.slug || prior.eligibleUntil !== null
        || !same(JSON.parse(String(pair.row.public_display_json)), prior) || pair.sidecar && pair.sidecar.product_id !== pair.row.id) refuse('public_duplicate_identity');
    }
    const p = maintenanceState({ ...before.row, maintenance_semantic: before.sidecar?.semantic_json ?? null });
    const after: HeldResolutionRow = { row: { ...before.row, editorial_status: 'duplicate', duplicate_of_product_id: keeper.row.id,
      public_display_json: null, catalog_revision: catalogRevision }, sidecar: before.sidecar ? { ...before.sidecar,
        version: Number(before.sidecar.version) + 1, semantic_json: canonicalJson({ ...p, editorialStatus: 'duplicate', duplicateOfProductId: keeper.row.id }) } : null };
    plan.publicDuplicate = { review: { id: String(before.row.id), publicId: String(before.row.public_id), keeperId: String(keeper.row.id),
      keeperPublicId: String(keeper.row.public_id), keeperProductSha256: hash(keeper.row), keeperPrivateStateSha256: hash(keeper.sidecar) },
      change: { id: String(before.row.id), before: structuredClone(before), after, display: null }, keeper: structuredClone(keeper) };
  }
  return plan;
}
/** Exact existing maintenance-receipt vocabulary, reusable by the normal
 * approved-cohort freezer. No approval is inferred from mutable ready rows. */
export function heldCatalogResolutionApproval(plan: HeldCatalogResolution, planSha256: string) {
  if (hash(plan) !== planSha256) refuse('plan');
  return { schemaVersion: 1 as const, runId: plan.owner.ownerReference, catalogRevision: plan.catalogRevision,
    changes: heldCatalogResolutionBatches(plan).flatMap((batch, n) => {
      const inputSha256 = hash({ planSha256, batch: n }), operationId = sha256('held-catalog:' + inputSha256);
      return batch.map(p => ({ publicId: String(p.after.row.public_id), operationId, inputSha256,
        productSha256: hash(p.after.row), displaySha256: sha256(String(p.after.row.public_display_json)) }));
    }) };
}
/** Pure membership projection for the reviewed plan; not an application or
 * publication receipt. Also lets offline capacity QA use the identical rules. */
export function heldCatalogResolutionSnapshot(plan: HeldCatalogResolution) {
  const promoted = new Set(plan.promotions.map(p => p.id));
  const duplicateIds = new Set(plan.exclusions.filter(p => p.duplicateOfProductId).map(p => p.id));
  return validateCatalogSnapshot({ ...plan.baseline, catalogRevision: plan.catalogRevision, generatedAt: plan.createdAt,
    products: [...plan.baseline.products.filter(p => p.id !== plan.publicDuplicate?.review.id), ...plan.promotions.map(p => p.display)],
    heldProducts: [...plan.baseline.heldProducts.filter(p => !promoted.has(p.id)).map(p => duplicateIds.has(p.id) ? { ...p, reason: 'duplicate' as const } : p),
      ...(plan.publicDuplicate ? [{ id: plan.publicDuplicate.review.id, publicId: plan.publicDuplicate.review.publicId,
        slug: String(plan.publicDuplicate.change.before.row.slug), path: '/gifts/' + plan.publicDuplicate.change.before.row.slug,
        title: 'Gift currently unavailable', description: 'This gift is not currently available in the curated catalog. Browse other gifts instead.', reason: 'duplicate' as const }] : [])] }, new Date(plan.createdAt));
}

/** Bounded authenticated-connection read. Caller owns credential/budget/lock
 * policy; this helper neither claims scope nor fetches merchant/model data. */
export async function captureHeldCatalogResolution(db: CatalogD1, owner: MutationOwner, ids: string[]): Promise<HeldResolutionRow[]> {
  if (ids.length > 5000 || new Set(ids).size !== ids.length || owner.phase !== 'writing') refuse('capture');
  await mutationAssertion(db, owner).all(); const output: HeldResolutionRow[] = [];
  for (let n = 0; n < ids.length; n += 10) {
    const part = ids.slice(n, n + 10);
    const result = (await db.prepare(`SELECT p.*,s.product_id _side_product_id,s.version _side_version,s.semantic_json _side_semantic_json,
      s.embedding_present _side_embedding_present,s.embedding_native_base64 _side_embedding_native_base64,
      s.embedding_provenance_json _side_embedding_provenance_json FROM json_each(?) wanted CROSS JOIN products p ON p.id=wanted.value
      LEFT JOIN catalog_maintenance_products s ON s.product_id=p.id ORDER BY p.id`).bind(JSON.stringify(part)).all<Row>()).results;
    if (result.length !== part.length || Buffer.byteLength(JSON.stringify(result)) > 384 * 1024) refuse('capture_bounds');
    for (const raw of result) {
      const row = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_side_')));
      const sidecar = raw._side_product_id === null ? null : Object.fromEntries(Object.entries(raw).filter(([k]) => k.startsWith('_side_')).map(([k, v]) => [k.slice(6), v]));
      output.push({ row, sidecar });
    }
  }
  await mutationAssertion(db, owner).all(); return output;
}

/** Each small atomic batch is exact-before/exact-after and advances the shared
 * owner once with an immutable operation receipt. ACK loss is read back, never
 * automatically repeated as new work. No delete/native/merchant/model/claim. */
export async function applyHeldCatalogResolution(options: {
  db: CatalogD1; plan: HeldCatalogResolution; planSha256: string; ownerCursor: { current: MutationOwner };
  checkpoint?: (owner: MutationOwner) => Promise<void>;
}) {
  const { db, ownerCursor } = options, plan = structuredClone(options.plan);
  if (hash(plan) !== options.planSha256 || !same(plan, prepareHeldCatalogResolution({ baseline: plan.baseline,
    rows: plan.capture, owner: plan.owner, reference: plan.reference, now: plan.createdAt, catalogRevision: plan.catalogRevision }))) refuse('plan');
  const at = (n: number) => ({ ...plan.owner, epoch: plan.owner.epoch + n });
  const batches = heldCatalogResolutionBatches(plan);
  const actual = await readMutationOwner(db, plan.owner), completed = actual ? actual.epoch - plan.owner.epoch : -1;
  if (!Number.isSafeInteger(completed) || completed < 0 || completed > batches.length || !same(actual, at(completed))
    || !same(ownerCursor.current, actual) && !same(ownerCursor.current, at(Math.max(0, completed - 1)))) refuse('owner');
  ownerCursor.current = actual!;
  for (const [n, batch] of batches.entries()) {
    const inputHash = hash({ planSha256: options.planSha256, batch: n }), operationId = sha256('held-catalog:' + inputHash);
    const result = { kind: plan.kind, planSha256: options.planSha256, batch: n, count: batch.length };
    const changes = batch.map(p => ({ productId: p.id, beforeSha256: hash(p.before.row), afterSha256: hash(p.after.row),
      privateStateSha256: hash(p.after.sidecar), supersededUnsentSequences: [], vectorOperation: null }));
    const receipt = async () => {
      const rows = (await db.prepare('SELECT * FROM catalog_maintenance_operations WHERE operation_id=?').bind(operationId).all<Row>()).results;
      if (!rows.length) return false; const r = rows[0];
      if (rows.length !== 1 || r.input_sha256 !== inputHash || r.run_id !== plan.owner.ownerReference
        || r.catalog_revision !== plan.catalogRevision || r.environment !== plan.owner.environment
        || r.index_name !== plan.owner.indexName || r.generation !== plan.owner.generation
        || r.prior_epoch !== at(n).epoch || r.next_epoch !== at(n + 1).epoch
        || !same(JSON.parse(String(r.result_json)), result) || !same(JSON.parse(String(r.changes_json)), changes)) refuse('receipt');
      for (const p of batch) await pairCas(db, p.after).all();
      if (batch.some(p => p.id === plan.publicDuplicate?.review.id)) await pairCas(db, plan.publicDuplicate!.keeper).all(); return true;
    };
    if (n < completed) { if (!await receipt()) refuse('missing_receipt'); continue; }
    const statements = [mutationAssertion(db, at(n)), ...batch.map(p => pairCas(db, p.before))];
    for (const p of batch) {
      if (p.id === plan.publicDuplicate?.review.id) statements.push(pairCas(db, plan.publicDuplicate.keeper));
      statements.push(db.prepare(`UPDATE products SET ${PATCH_FIELDS.map(k => k + '=?').join(',')} WHERE id=?`)
        .bind(...PATCH_FIELDS.map(k => p.after.row[k]), p.id));
      if (p.after.sidecar) statements.push(db.prepare(`UPDATE catalog_maintenance_products SET ${SIDECAR_FIELDS.map(k => k + '=?').join(',')} WHERE product_id=?`)
        .bind(...SIDECAR_FIELDS.map(k => p.after.sidecar![k]), p.id));
      statements.push(pairCas(db, p.after));
    }
    statements.push(db.prepare(`INSERT INTO catalog_maintenance_operations(operation_id,input_sha256,run_id,catalog_revision,environment,index_name,
      generation,prior_epoch,next_epoch,database_time,result_json,changes_json) VALUES(?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?)`)
      .bind(operationId, inputHash, plan.owner.ownerReference, plan.catalogRevision, plan.owner.environment, plan.owner.indexName,
        plan.owner.generation, at(n).epoch, at(n + 1).epoch, canonicalJson(result), canonicalJson(changes)),
    mutationAdvance(db, at(n), { sql: 'SELECT 1 FROM catalog_maintenance_operations WHERE operation_id=? AND input_sha256=?', params: [operationId, inputHash] }), mutationAssertion(db, at(n + 1)));
    try { await db.batch(statements); } catch { if (!await receipt()) refuse('apply_unconfirmed'); }
    if (!await receipt() || !same(await readMutationOwner(db, plan.owner), at(n + 1))) refuse('after_owner');
    ownerCursor.current = at(n + 1); await options.checkpoint?.(ownerCursor.current);
  }
  const snapshot = heldCatalogResolutionSnapshot(plan);
  return { state: 'reconciled' as const, owner: ownerCursor.current, snapshot, promoted: plan.promotions.length,
    held: plan.exclusions.length + (plan.publicDuplicate ? 1 : 0), batches: batches.length, approval: heldCatalogResolutionApproval(plan, options.planSha256),
    nativeWrites: 0, merchantRequests: 0, modelRequests: 0 };
}
