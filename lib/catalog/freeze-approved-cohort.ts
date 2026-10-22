import type { CatalogD1 } from './storage/d1.ts';
import { catalogDisplayDeadline, persistentPublicProduct } from './display.ts';
import type { CatalogSnapshot, PublicCatalogProduct, SafeHeldProduct } from './types.ts';
import type { MutationOwner } from './mutation-fence.ts';
import { mutationAssertion } from './mutation-fence.ts';
import { createProjectionPacket } from './d1.ts';
import { canonicalTime, validateCatalogSnapshot, validatePublicCatalogProduct } from './snapshot.ts';
import { areNearDuplicateTitles, suppressNearDuplicateProducts } from '../db/product-scoring.ts';
import { checkCurrent, readApprovedCurrentRows, readPruningSource } from '../../scripts/catalog/export-d1-snapshot.ts';
import { canonicalJson, sha256 } from '../../scripts/catalog/migration.ts';
import { pruneOperationKey, prunedVectorPlan, sealCapturedRevision, settleCapturedRevision } from './prune-existing-revision.ts';
import type { PruneRequest, PrunedRevision, PrunedVectorObservation, PrunedVectorPlan } from './prune-existing-revision.ts';

type Row = Record<string, unknown>;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/** Private, independently reviewed input, not approval inferred from ready rows.
 * productSha256 hashes canonicalJson of the COMPLETE current products row;
 * displaySha256 hashes its exact public_display_json bytes (literal "null" for a
 * held row). Order is deliberate.
 * The immutable maintenance receipt must bind those same row/input bytes.
 */
export interface ApprovedChange {
  publicId: string; operationId: string; inputSha256: string; productSha256: string; displaySha256: string;
}
export interface ApprovedCohortEnvelope {
  schemaVersion: 1; runId: string; catalogRevision: string; changes: ApprovedChange[];
}
export interface ApprovedCohortRequest extends PruneRequest {
  approval: ApprovedCohortEnvelope; approvalSha256: string;
}
export interface ApprovedCohortRevision extends PrunedRevision { request: ApprovedCohortRequest }
export function approvedCohortOperationKey(request: ApprovedCohortRequest): string {
  pruneOperationKey(request); // Shared scope/code/cutoff validation, NOT subset policy.
  const envelope = request.approval;
  if (!envelope || Object.keys(envelope).sort().join(',') !== 'catalogRevision,changes,runId,schemaVersion'
    || envelope.schemaVersion !== 1 || !/^[a-zA-Z0-9._-]{1,200}$/.test(envelope.runId)
    || !/^[a-zA-Z0-9._-]{1,64}$/.test(envelope.catalogRevision) || envelope.catalogRevision === request.previous.catalogRevision
    || !Array.isArray(envelope.changes) || envelope.changes.length > 20
    || new Set(envelope.changes.map(value => value.publicId)).size !== envelope.changes.length
    || envelope.changes.some(value => Object.keys(value).sort().join(',') !== 'displaySha256,inputSha256,operationId,productSha256,publicId'
      || !UUID.test(value.publicId) || ![value.operationId,value.inputSha256,value.productSha256,value.displaySha256].every(hash => HASH.test(hash)))
    || !HASH.test(request.approvalSha256) || sha256(canonicalJson(envelope)) !== request.approvalSha256)
    throw new Error('cohort_approval_invalid');
  return sha256(canonicalJson({ kind:'approved-cohort', previous:pruneOperationKey(request), approvalSha256:request.approvalSha256 }));
}
function held(value: { id: string; publicId: string; slug: string }, reason: SafeHeldProduct['reason']): SafeHeldProduct {
  return { id:value.id,publicId:value.publicId,slug:value.slug,path:`/gifts/${value.slug}`,title:'Gift currently unavailable',
    description:'This gift is not currently available in the curated catalog. Browse other gifts instead.',reason };
}
async function prepare(db: CatalogD1, owner: MutationOwner, input: ApprovedCohortRequest) {
  owner = structuredClone(owner);
  const request = structuredClone(input); const operationKey = approvedCohortOperationKey(request);
  if (owner.phase !== 'freezing' || owner.operationKey !== operationKey || owner.environment !== request.scope.environment
    || owner.indexName !== request.scope.indexName) throw new Error('cohort_owner_mismatch');
  await db.batch([mutationAssertion(db,owner,['freezing'])]);
  const source = await readPruningSource(db,request.previous,request.context,owner);
  const now = new Date(source.observedAt); const cutoff = Date.parse(request.context.cutoff);
  if (now.getTime() < Date.parse(owner.capturedAt) || cutoff <= now.getTime()
    || cutoff - Date.parse(owner.capturedAt) > 26*3600000) throw new Error('cohort_window_elapsed');
  const extra = await readApprovedCurrentRows(db,request.approval.changes.map(value => value.publicId),owner);
  const full = new Map(extra.rows.map(row => [String(row.public_id),row]));
  const current = new Map([...source.current,...extra.current].map(row => [String(row.public_id),row]));
  const projection = new Map(source.projection.map(row => [String(row.public_id),row]));
  const approved = new Map<string,PublicCatalogProduct>();
  const changed = new Map(request.approval.changes.map(value => [value.publicId,value]));
  // At most20 independently pinned operation IDs. Vector proof rebuilds this
  // seal repeatedly; one bounded read avoids an N+1 provider request per change.
  const operationIds = [...new Set(request.approval.changes.map(value => value.operationId))];
  const receipts = new Map((operationIds.length ? (await db.prepare(`SELECT * FROM catalog_maintenance_operations
    WHERE operation_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(operationIds)).all()).results : [])
    .map(row => [String(row.operation_id), row]));
  for (const change of request.approval.changes) {
    const row = full.get(change.publicId)!;
    const receipt = receipts.get(change.operationId);
    if (row.catalog_revision !== request.approval.catalogRevision || sha256(canonicalJson(row)) !== change.productSha256
      || row.public_display_json !== null && typeof row.public_display_json !== 'string'
      || sha256(row.public_display_json === null ? 'null' : String(row.public_display_json)) !== change.displaySha256
      || !receipt || receipt.input_sha256 !== change.inputSha256 || receipt.run_id !== request.approval.runId
      || receipt.catalog_revision !== request.approval.catalogRevision || receipt.environment !== owner.environment || receipt.index_name !== owner.indexName
      || !JSON.parse(String(receipt.changes_json)).some((value: Row) => value.productId === row.id && value.afterSha256 === change.productSha256))
      throw new Error('cohort_approval_changed');
    current.get(change.publicId)!.approval_operation_json = canonicalJson(receipt);
    try {
      const product = validatePublicCatalogProduct(JSON.parse(String(row.public_display_json)),now);
      checkCurrent(product,{ source_facts_hash:row.source_facts_hash },current.get(change.publicId)!,now);
      if (catalogDisplayDeadline(product) <= cutoff) throw new Error('expired');
      approved.set(change.publicId,product);
    } catch { /* A reviewed mutation is not a fresh availability/rights grant. */ }
  }
  const products: PublicCatalogProduct[] = []; const safeHeld: SafeHeldProduct[] = [];
  const seen = new Set<string>();
  for (const prior of source.snapshot.products) {
    seen.add(prior.publicId);
    if (changed.has(prior.publicId)) {
      const value = approved.get(prior.publicId);
      if (value) products.push(value); else safeHeld.push(held(prior,'editorial_hold'));
    } else {
      try {
        checkCurrent(prior,projection.get(prior.publicId)!,current.get(prior.publicId)!,now);
        if (catalogDisplayDeadline(prior) <= cutoff) throw new Error('expired');
        products.push(prior); // Untouched means exact old bytes/deadline, never renewed.
      } catch { safeHeld.push(held(prior,catalogDisplayDeadline(prior) <= cutoff ? 'expired' : 'editorial_hold')); }
    }
  }
  for (const prior of source.snapshot.heldProducts) {
    seen.add(prior.publicId);
    const value = approved.get(prior.publicId);
    if (value) products.push(value); else safeHeld.push(held(prior,prior.reason));
  }
  for (const change of request.approval.changes) if (!seen.has(change.publicId)) {
    const product = approved.get(change.publicId);
    if (product) products.push(product);
    else { const row=full.get(change.publicId)!;safeHeld.push(held({id:String(row.id),publicId:change.publicId,slug:String(row.slug)},'editorial_hold')); }
  }
  const stable = new Set(source.snapshot.products.filter(value => persistentPublicProduct(value) && !changed.has(value.publicId))
    .map(value => value.publicId));
  const preserved=products.filter(value=>stable.has(value.publicId));
  const candidates=products.filter(value=>!stable.has(value.publicId)
    && !preserved.some(prior=>areNearDuplicateTitles(prior.title,value.title)));
  const winners = new Set(suppressNearDuplicateProducts(candidates).map(value => value.publicId));
  const ready = products.filter(value => { if (stable.has(value.publicId) || winners.has(value.publicId)) return true;
    safeHeld.push(held(value,'duplicate'));return false; });
  const readyIds = new Set(ready.map(value => value.publicId));
  const removed = source.snapshot.products.filter(value => !readyIds.has(value.publicId));
  const additionalAbsentIds = request.approval.changes.filter(value => !readyIds.has(value.publicId)).map(value => value.publicId);
  const semantic = ready.filter(value => value.eligibleUntil !== null && Date.parse(value.eligibleUntil) > cutoff);
  if (semantic.length + new Set([...removed.map(value=>value.publicId),...additionalAbsentIds]).size > 20) throw new Error('cohort_vector_proof_bound');
  const revision = request.approval.catalogRevision;
  const existing = (await db.prepare('SELECT created_at FROM catalog_revisions WHERE revision=?').bind(revision).all()).results[0];
  const generatedAt = existing ? canonicalTime(existing.created_at) : owner.capturedAt;
  const snapshot: CatalogSnapshot = validateCatalogSnapshot({ ...source.snapshot,catalogRevision:revision,generatedAt,
    products:ready,heldProducts:safeHeld },now);
  // SQL candidate iteration is not an ordering contract. Snapshot order follows
  // the reviewed prior/envelope; private digest/CAS rows have a separate stable order.
  const sourceRows = [...current.values()].sort((a,b)=>String(a.public_id).localeCompare(String(b.public_id)));
  const globalVectorWatermark = Number(source.header.globalWatermark);
  const sourceDigest = sha256(canonicalJson({ operationKey,generatedAt,globalVectorWatermark,current:sourceRows,prior:source.header.prior }));
  const facts = Object.fromEntries(sourceRows.map(row => [String(row.public_id),row.source_facts_hash===null?null:String(row.source_facts_hash)]));
  const packet = await createProjectionPacket(snapshot,facts,sourceDigest,now);
  const sealed = await sealCapturedRevision(db,owner,{request,snapshot,packet,sourceRows,priorRow:source.header.prior as Row,
    sourceDigest,globalVectorWatermark,vectorSyncWatermark:0,operationKey,additionalAbsentIds});
  return { state:ready.length ? 'prepared' as const : 'all_held' as const,owner:sealed.owner,
    revision:{...sealed.revision,request} as ApprovedCohortRevision };
}
async function safe<T>(operation:()=>Promise<T>):Promise<T> {
  try { return await operation(); } catch(error) {
    throw new Error(error instanceof Error && /^(cohort_|prune_)[a-z_]+$/.test(error.message) ? error.message : 'cohort_failed');
  }
}
/** Supplied observations/rights only: no merchant/model calls, new approval,
 * verification renewal, implicit ready-row scan or mutable catalog revision flip.
 * On an uncertain D1 response keep the exact request, resume the SAME ownership
 * claim/reference to read its persisted epoch, then replay. Never infer release
 * or adopt another writer's cursor. Vector unknown responses retain that owner.
 */
export function prepareApprovedCohort(...args:Parameters<typeof prepare>) { return safe(()=>prepare(...args)); }
export function approvedCohortVectorPlan(revision:ApprovedCohortRevision):PrunedVectorPlan { return prunedVectorPlan(revision); }
export function settleApprovedCohort(db:CatalogD1,owner:MutationOwner,revision:ApprovedCohortRevision,
  readVectors:(plan:PrunedVectorPlan,signal:AbortSignal)=>Promise<PrunedVectorObservation>) {
  return safe(async()=>{
    const rebuilt=await prepareApprovedCohort(db,owner,revision.request);
    if(canonicalJson(rebuilt.revision)!==canonicalJson(revision))throw new Error('cohort_packet_changed');
    return settleCapturedRevision(db,owner,revision,readVectors);
  });
}
