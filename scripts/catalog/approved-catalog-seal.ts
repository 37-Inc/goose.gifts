import type {CatalogD1} from '../../lib/catalog/storage/d1.ts';
import type {MutationOwner} from '../../lib/catalog/mutation-fence.ts';
import type {CatalogSnapshot} from '../../lib/catalog/types.ts';
import type {ApprovedCohortRequest,ApprovedCohortRevision} from '../../lib/catalog/freeze-approved-cohort.ts';
import {approvedCohortOperationKey} from '../../lib/catalog/freeze-approved-cohort.ts';
import {validateCatalogSnapshot} from '../../lib/catalog/snapshot.ts';
import {canonicalJson,sha256} from './migration.ts';
import {createSealedSnapshotEnvelope,readOwnedProjection,readApprovedRevisionSource} from './export-d1-snapshot.ts';
import type {SealedSnapshotEnvelope,SnapshotReadContext} from './export-d1-snapshot.ts';

/** Body-free daily handoff. Actual receipt/projection readback is mandatory on
 * consumption; constructing technical metadata is never proof of publication. */
export function createApprovedCatalogSeal(revision:ApprovedCohortRevision,publication:{releaseId:string;receiptSha256:string}){
  return{schemaVersion:1 as const,kind:'approved-catalog-seal' as const,envelopeJson:JSON.stringify(createSealedSnapshotEnvelope(revision.snapshot)),
    snapshotSha256:revision.packet.receipt.snapshot_sha256,projectionReceipt:revision.packet.receipt,publication};
}
export type ApprovedCatalogSeal=ReturnType<typeof createApprovedCatalogSeal>;
type ProjectionSeal=Pick<ApprovedCatalogSeal,'envelopeJson'|'snapshotSha256'|'projectionReceipt'>;
/** Original projection bytes are reconstructed only in memory at their original
 * generatedAt, under the exact current owner. No expired body is re-pinned. */
export async function readApprovedPrior(db:CatalogD1,owner:MutationOwner,seal:ProjectionSeal,context:SnapshotReadContext){
  const envelope=JSON.parse(seal.envelopeJson) as SealedSnapshotEnvelope;
  if(sha256(seal.envelopeJson+'\n')!==context.envelopeSha256||seal.snapshotSha256!==context.snapshotSha256
    ||seal.projectionReceipt.projection_sha256!==context.projectionSha256
    ||seal.projectionReceipt.source_export_sha256!==context.sourceExportSha256)throw new Error('cohort_prior_changed');
  const rows=await readOwnedProjection(db,owner,envelope.catalogRevision,envelope.products,
    {...(owner.phase==='writing'||owner.phase==='activating'?{phase:owner.phase}:{}),approvedRecovery:true});
  const byId=new Map(rows.map(r=>[r.public_id,r]));
  const snapshot=validateCatalogSnapshot({...envelope,products:envelope.products.map(id=>JSON.parse(String(byId.get(id)?.public_display_json)))},
    new Date(envelope.generatedAt));
  if(sha256(JSON.stringify(snapshot)+'\n')!==seal.snapshotSha256)throw new Error('cohort_prior_changed');
  const receipt=(await db.prepare('SELECT * FROM catalog_projection_receipts WHERE catalog_revision=?').bind(envelope.catalogRevision).all()).results;
  if(receipt.length!==1||canonicalJson(receipt[0])!==canonicalJson(seal.projectionReceipt))throw new Error('cohort_prior_changed');
  if('publication' in seal){const publication=seal.publication as ApprovedCatalogSeal['publication'];
    const actual=(await db.prepare('SELECT * FROM publication_receipts WHERE release_id=?').bind(publication.releaseId).all()).results;
    if(actual.length!==1||sha256(canonicalJson(actual[0]))!==publication.receiptSha256
      ||context.priorPublication?.releaseId!==publication.releaseId||context.priorPublication.receiptSha256!==publication.receiptSha256)
      throw new Error('cohort_prior_changed');
  }
  return snapshot;
}
export function approvedRequestControl(request:ApprovedCohortRequest){
  const {previous,...rest}=request;
  return{schemaVersion:1 as const,kind:'approved-request-control' as const,request:rest,
    previous:{envelopeJson:JSON.stringify(createSealedSnapshotEnvelope(previous)),snapshotSha256:sha256(JSON.stringify(previous)+'\n'),
      projectionReceipt:{catalog_revision:previous.catalogRevision,snapshot_sha256:request.context.snapshotSha256,
        projection_sha256:request.context.projectionSha256,source_export_sha256:request.context.sourceExportSha256,
        product_count:previous.products.length,created_at:previous.generatedAt}},
    requestSha256:sha256(canonicalJson(request))};
}
export async function hydrateApprovedRequest(db:CatalogD1,owner:MutationOwner,control:ReturnType<typeof approvedRequestControl>){
  const previous=await readApprovedPrior(db,owner,control.previous,control.request.context);
  const request={...control.request,previous};
  if(control.schemaVersion!==1||control.kind!=='approved-request-control'||sha256(canonicalJson(request))!==control.requestSha256)
    throw new Error('cohort_request_changed');
  approvedCohortOperationKey(request);return request;
}
export function approvedRevisionControl(revision:ApprovedCohortRevision){
  const {request,sourceRows,...rest}=revision;
  return{schemaVersion:1 as const,kind:'approved-revision-control' as const,revision:rest,request:approvedRequestControl(request),
    sourceIds:sourceRows.map(r=>String(r.public_id)),sourceRowsSha256:sha256(canonicalJson(sourceRows)),revisionSha256:sha256(canonicalJson(revision))};
}
export async function hydrateApprovedRevision(db:CatalogD1,owner:MutationOwner,control:ReturnType<typeof approvedRevisionControl>){
  const request=await hydrateApprovedRequest(db,owner,control.request);
  const sourceRows=await readApprovedRevisionSource(db,owner,control.sourceIds,request.approval.changes);
  const revision={...control.revision,request,sourceRows};
  if(control.schemaVersion!==1||control.kind!=='approved-revision-control'||sha256(canonicalJson(sourceRows))!==control.sourceRowsSha256
    ||sha256(canonicalJson(revision))!==control.revisionSha256)throw new Error('cohort_revision_changed');
  return revision;
}
/** Finite displayed fields keep their original deadline within existing rules. */
export function approvedArtifactObservedAt(snapshot:CatalogSnapshot,now:string,maxAgeMs:number){
  const deadlines=snapshot.products.flatMap(p=>p.eligibleUntil===null?[]:[Date.parse(p.eligibleUntil)]);
  return new Date(Math.min(Date.parse(now),...deadlines.map(deadline=>deadline-maxAgeMs))).toISOString();
}
