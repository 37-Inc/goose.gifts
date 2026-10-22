import type { CatalogD1 } from './storage/d1.ts';
import type { MutationOwner } from './mutation-fence.ts';
import { mutationAssertion } from './mutation-fence.ts';
import type { SafeHeldProduct } from './types.ts';
import { canonicalTime, publicProductRightsExpiry, validateCatalogSnapshot, validatePublicCatalogProduct } from './snapshot.ts';
import { createProjectionPacket } from './d1.ts';
import { encodeBuildRequest } from './build-requests.ts';
import type { ActivationPermit } from './build-requests.ts';
import { pruneOperationKey, sealCapturedRevision, settleCapturedRevision } from './prune-existing-revision.ts';
import type { HistoricalNativeBinding, PruneRequest, PrunedRevision } from './prune-existing-revision.ts';
import { PRUNING_CURRENT_COLUMNS, pruningCurrentQueries } from './pruning-current.ts';
import { canonicalJson, sha256 } from '../../scripts/catalog/migration.ts';
import { checkCurrent, readPruningSource, SNAPSHOT_READ_LIMITS } from '../../scripts/catalog/export-d1-snapshot.ts';
import { readOwnedLogicalRows } from '../../scripts/catalog/owned-operational-import.ts';
import { expectedPermanentDisplayRows, validatePermanentRuntimeTransition } from '../../scripts/catalog/permanent-display-d1.ts';
import type { PermanentDisplayPlan } from '../../scripts/catalog/permanent-display-d1.ts';
import { readCaptureSchema } from '../../scripts/catalog/capture-owned-d1.ts';
import type { CooperativeCaptureReceipt } from '../../scripts/catalog/capture-owned-d1.ts';
import { isCatalogD1Rest } from '../../scripts/catalog/d1-write-rest.ts';
import { D1_RECOVERY_TABLES } from '../../scripts/catalog/d1-logical-tables.ts';

type Row=Record<string,unknown>;
const HASH=/^[a-f0-9]{64}$/;
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const digest=(rows:Row[])=>sha256(canonicalJson([...rows].sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)))));
function refuse():never{throw new Error('permanent_freeze_changed');}
export interface PermanentCatalogRequest extends PruneRequest {
  catalogRevision:string;
  installation:{plan:PermanentDisplayPlan;sha256:string;capture:{receipt:CooperativeCaptureReceipt;sha256:string}};
  native:HistoricalNativeBinding;
  preserveSupplierPhotos:boolean;
  /** Complete independently reviewed ready UUID order; no implicit reranking. */
  productOrder:string[];
}
export interface PermanentCatalogRevision extends PrunedRevision {request:PermanentCatalogRequest;nativePreservation:HistoricalNativeBinding}
export function permanentCatalogOperationKey(request:PermanentCatalogRequest):string{
  const base=pruneOperationKey(request),{installation,native}=request;
  if(!/^[a-zA-Z0-9._-]{1,64}$/.test(request.catalogRevision)||request.catalogRevision===request.previous.catalogRevision
    ||typeof request.preserveSupplierPhotos!=='boolean'||!Array.isArray(request.productOrder)
    ||request.productOrder.length>SNAPSHOT_READ_LIMITS.identities||new Set(request.productOrder).size!==request.productOrder.length
    ||!HASH.test(installation.sha256)||!HASH.test(installation.capture.sha256)
    ||sha256(canonicalJson(installation.plan))!==installation.sha256||sha256(canonicalJson(installation.capture.receipt))!==installation.capture.sha256
    ||!native||!HASH.test(native.revisionSha256)||!HASH.test(native.source.deliveryId)||!HASH.test(native.source.deliverySha256)
    ||!HASH.test(native.source.receiptSha256)||!/^[a-zA-Z0-9._-]{1,64}$/.test(native.source.releaseId)
    ||native.plan.products.length+native.plan.absentIds.length>20
    ||'preserved' in native.plan||native.plan.environment!==request.scope.environment||native.plan.indexName!==request.scope.indexName)refuse();
  return sha256(canonicalJson({kind:'installed-permanent-catalog',base,catalogRevision:request.catalogRevision,
    installation:installation.sha256,capture:installation.capture.sha256,native,preserveSupplierPhotos:request.preserveSupplierPhotos,productOrder:request.productOrder}));
}
function scopeRow(row:Row,owner:MutationOwner):Row{return{...row,phase:owner.phase,owner_token:owner.token,generation:owner.generation,
  mutation_epoch:owner.epoch,owner_reference:owner.ownerReference,operation_key:owner.operationKey,captured_at:owner.capturedAt,
  external_pending:0,activation_request_id:null};}
function sourceRows(rows:Record<string,Row[]>):Row[]{
  const operations=new Map(rows.catalog_maintenance_operations.map(r=>[r.operation_id,r]));
  return rows.products.map((row):Row=>{const archive=JSON.parse(String(row.source_record_json)),proof=JSON.parse(String(row.timestamp_provenance_json));
    const column=row.availability_checked_at!==null?'availability_checked_at':'last_verified_at',operation=operations.get(proof?.fields?.[column]?.operationId);
    return{...Object.fromEntries(PRUNING_CURRENT_COLUMNS.map(k=>[k,row[k]])),approved_product_json:canonicalJson(row),
      ...Object.fromEntries(['id','public_id','source','availability_checked_at','last_verified_at'].map(k=>[`archived_${k}`,archive[k]??null])),
      ...(operation?{verification_operation_json:canonicalJson(operation)}:{})};
  }).sort((a,b)=>String(a.public_id).localeCompare(String(b.public_id)));
}
async function installed(db:CatalogD1,owner:MutationOwner,request:PermanentCatalogRequest){
  const {plan,sha256:planHash,capture:proof}=request.installation,original=expectedPermanentDisplayRows(plan,planHash);
  const old=original.catalog_mutation_scopes[0],r=proof.receipt;
  if(!isCatalogD1Rest(db)||r.providerIdentity!==(db as CatalogD1&{providerIdentity:string}).providerIdentity
    ||r.kind!=='cooperative-owned-d1-logical-capture'||r.schemaVersion!==1||r.captureSha256!==plan.input.captureSha256
    ||!same(r.ownerBefore,plan.input.owner)||!same(r.ownerAfter,plan.input.owner)||!same(r.inventory,plan.input.capture.inventory)
    ||r.scopeRowSha256!==sha256(canonicalJson(plan.input.capture.tables.catalog_mutation_scopes[0]))
    ||canonicalTime(r.startedAt)!==r.startedAt||canonicalTime(r.completedAt)!==r.completedAt
    ||r.startedAt>r.completedAt||r.completedAt>plan.input.assembler.now||plan.input.assembler.now>owner.capturedAt
    ||owner.generation!==Number(old.generation)+1||owner.token===old.owner_token||owner.environment!==old.environment||owner.indexName!==old.index_name)refuse();
  await mutationAssertion(db,owner,['freezing']).all();
  const schema=await readCaptureSchema(db);if(sha256(canonicalJson(schema))!==r.schemaSha256
    ||!same(schema.map(row=>({name:row.name,type:row.type,table:row.tbl_name,sha256:sha256(canonicalJson(row))})),r.schemas))refuse();
  const actual=await readOwnedLogicalRows(db,owner,{phase:'freezing'}),revision=request.catalogRevision;
  const sealed=actual.catalog_projection_receipts.filter(row=>row.catalog_revision===revision),queued=actual.catalog_build_requests.filter(row=>row.source_revision===revision);
  if(sealed.length>1||queued.length>1||owner.epoch!==Number(old.mutation_epoch)+sealed.length+queued.length)refuse();
  validatePermanentRuntimeTransition(original,actual,String(old.captured_at),owner.capturedAt);
  for(const table of D1_RECOVERY_TABLES){
    let rows=actual[table];
    if(table==='catalog_mutation_scopes'){if(rows.length!==1||original[table].length!==1||!same(rows[0],scopeRow(old,owner)))refuse();continue;}
    if(['search_diagnostics','semantic_search_budgets'].includes(table))continue;
    if(['catalog_revisions','catalog_public_products','catalog_projection_receipts','catalog_build_requests'].includes(table))
      rows=rows.filter(row=>(table==='catalog_revisions'?row.revision:table==='catalog_build_requests'?row.source_revision:row.catalog_revision)!==revision);
    if(digest(rows)!==digest(original[table]))refuse();
  }
  await mutationAssertion(db,owner,['freezing']).all();return{actual,queued};
}
async function prepare(db:CatalogD1,owner:MutationOwner,input:PermanentCatalogRequest){
  owner=structuredClone(owner);const request=structuredClone(input),operationKey=permanentCatalogOperationKey(request);
  if(owner.phase!=='freezing'||owner.operationKey!==operationKey||owner.environment!==request.scope.environment||owner.indexName!==request.scope.indexName)refuse();
  const {actual,queued}=await installed(db,owner,request),source=await readPruningSource(db,request.previous,request.context,owner);
  const now=new Date(source.observedAt),cutoff=Date.parse(request.context.cutoff);
  if(now.getTime()<Date.parse(owner.capturedAt)||cutoff<=now.getTime()||cutoff-Date.parse(owner.capturedAt)>26*3600000)refuse();
  const current=sourceRows(actual),byId=new Map(current.map(r=>[String(r.id),r])),before=new Map(request.installation.plan.input.capture.tables.products.map(r=>[String(r.id),r]));
  const proposal=request.installation.plan.input.approvedProposal.value;
  if(actual.products.length>SNAPSHOT_READ_LIMITS.identities||proposal.reconciliation.identityCount!==actual.products.length
    ||proposal.proposed.length+proposal.holds.length!==actual.products.length)refuse();
  const candidates=new Map(proposal.proposed.map(candidate=>[candidate.input.product.publicId,candidate]));
  if(request.productOrder.length!==candidates.size||request.productOrder.some(id=>!candidates.has(id)))refuse();
  const products=request.productOrder.map(id=>{const candidate=candidates.get(id)!;
    const row=byId.get(candidate.id);if(!row)refuse();const base=validatePublicCatalogProduct(JSON.parse(String(row.public_display_json)),now);
    if(base.eligibleUntil!==null)refuse();checkCurrent(base,{source_facts_hash:row.source_facts_hash},row,now);
    if(request.preserveSupplierPhotos){
      const old=before.get(candidate.id),raw=old?.public_display_json;
      if(typeof raw==='string')try{
        const overlay=validatePublicCatalogProduct(JSON.parse(raw),now),rights=JSON.parse(String(old!.rights_json));
        if(overlay.eligibleUntil!==null&&Date.parse(overlay.eligibleUntil)>now.getTime()
          &&publicProductRightsExpiry(overlay,rights,now)!==null&&overlay.id===base.id&&overlay.publicId===base.publicId&&overlay.slug===base.slug)
          return{...overlay,persistent:base};
      }catch{/* Missing/expired supplier fields never hide a positively cleared base. */}
    }
    return base;
  });
  const heldProducts:SafeHeldProduct[]=proposal.holds.map(row=>({id:row.id,publicId:row.publicId,slug:row.slug,path:`/gifts/${row.slug}`,
    title:'Gift currently unavailable',description:'This gift is not currently available in the curated catalog. Browse other gifts instead.',
    reason:['inactive','duplicate','rights_unverified'].includes(row.reason)?row.reason as SafeHeldProduct['reason']:'editorial_hold'}));
  const all=new Map(actual.products.map(r=>[r.id,r])),history=new Map(request.previous.slugHistory.map(row=>[row.slug,row]));
  for(const row of actual.product_slug_history){const p=all.get(row.product_id);if(!p)refuse();if(row.slug!==p.slug){
    const value={slug:String(row.slug),canonicalSlug:String(p.slug),publicId:String(p.public_id)};
    if(history.has(value.slug)&&!same(history.get(value.slug),value))refuse();history.set(value.slug,value);}}
  const existing=actual.catalog_revisions.find(r=>r.revision===request.catalogRevision),generatedAt=existing?canonicalTime(existing.created_at):owner.capturedAt;
  const snapshot=validateCatalogSnapshot({schemaVersion:1,dataKind:'catalog',catalogRevision:request.catalogRevision,generatedAt,
    products,heldProducts,slugHistory:[...history.values()]},now);
  const globalVectorWatermark=Number(source.header.globalWatermark),sourceDigest=sha256(canonicalJson({operationKey,generatedAt,
    globalVectorWatermark,current,prior:source.header.prior}));
  const packet=await createProjectionPacket(snapshot,Object.fromEntries(current.map(r=>[String(r.public_id),r.source_facts_hash===null?null:String(r.source_facts_hash)])),sourceDigest,now);
  const bytes=encodeBuildRequest({schemaVersion:1,environment:owner.environment,sourceRevision:snapshot.catalogRevision,sourceDigest:packet.receipt.snapshot_sha256,
    codeSha:request.codeSha,priorReleaseId:request.context.priorPublication?.releaseId??null,capturedAt:generatedAt,cutoff:request.context.cutoff});
  if(queued.some(row=>row.request_id!==sha256(bytes)||row.request_json!==bytes||!['pending','claimed'].includes(String(row.state))))refuse();
  const sealed=await sealCapturedRevision(db,owner,{request,snapshot,packet,sourceRows:current,priorRow:source.header.prior as Row,sourceDigest,
    globalVectorWatermark,vectorSyncWatermark:0,operationKey,nativePreservation:request.native});
  return{state:'prepared' as const,owner:sealed.owner,revision:sealed.revision as PermanentCatalogRevision};
}
export function preparePermanentCatalog(...args:Parameters<typeof prepare>){return prepare(...args);}
export async function settlePermanentCatalog(db:CatalogD1,owner:MutationOwner,revision:PermanentCatalogRevision,
  adapters:import('../../scripts/catalog/owned-vector-delivery.ts').OwnedVectorAdapters){
  const rebuilt=await preparePermanentCatalog(db,owner,revision.request);if(!same(rebuilt.revision,revision))refuse();
  const {readPermanentNativeProof}=await import('../../scripts/catalog/owned-vector-delivery.ts');
  return settleCapturedRevision(db,owner,revision,(_plan,signal)=>readPermanentNativeProof({db,owner,revision,adapters,signal}));
}

/** Exact full-row and projection CAS under the ACTUAL new owner/permit. */
export async function assertPermanentCatalog(db:CatalogD1,owner:MutationOwner,revision:PermanentCatalogRevision,permit?:ActivationPermit,signal?:AbortSignal){
  if(owner.operationKey!==permanentCatalogOperationKey(revision.request)||!same(revision.nativePreservation,revision.request.native)
    ||revision.operationKey!==owner.operationKey||revision.snapshot.catalogRevision!==revision.request.catalogRevision
    ||sha256(`${JSON.stringify(revision.snapshot)}\n`)!==revision.packet.receipt.snapshot_sha256
    ||!same(revision.snapshot.products.map(p=>p.publicId),revision.request.productOrder)
    ||owner.phase!=='freezing'&&owner.phase!=='activating'||owner.phase==='activating'&&(!permit||!same(permit.mutationOwner,owner)))refuse();
  const queries=pruningCurrentQueries(revision.sourceRows).map(q=>({sql:`SELECT json(CASE WHEN (${q.sql})=? THEN 'true' ELSE 'permanent_freeze_changed' END)`,params:[...q.params,q.count]}));
  const columns=Object.keys(revision.packet.rows[0]??{});
  const projection=(chunk:typeof revision.packet.rows)=>{
    const query={sql:`SELECT json(CASE WHEN (SELECT count(*) FROM json_each(?) e JOIN catalog_public_products p
      ON p.catalog_revision=? AND p.public_id=json_extract(e.value,'$.public_id') WHERE ${columns.map(k=>`p.${k} IS json_extract(e.value,'$.${k}')`).join(' AND ')})=? THEN 'true' ELSE 'permanent_freeze_changed' END)`,
    params:[JSON.stringify(chunk),revision.snapshot.catalogRevision,chunk.length]};
    if(Buffer.byteLength(JSON.stringify(query))>384*1024){if(chunk.length<2)refuse();const n=Math.floor(chunk.length/2);projection(chunk.slice(0,n));projection(chunk.slice(n));}
    else queries.push(query);
  };
  for(let i=0;i<revision.packet.rows.length;i+=20)projection(revision.packet.rows.slice(i,i+20));
  const prior=revision.priorRow,priorColumns=['release_id','catalog_revision','code_sha','completed_at','manifest_json'];
  const receipt=revision.packet.receipt,receiptColumns=['catalog_revision','snapshot_sha256','projection_sha256','source_export_sha256','product_count','created_at'];
  queries.push({sql:`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE environment=? AND index_name=?
    AND captured_at=? AND activation_request_id IS ?) THEN 'true' ELSE 'permanent_freeze_changed' END)`,
    params:[owner.environment,owner.indexName,owner.capturedAt,permit?.requestId??null]});
  queries.push({sql:`SELECT json(CASE WHEN (SELECT count(*) FROM products)=? AND (SELECT count(*) FROM catalog_public_products WHERE catalog_revision=?)=?
    AND (SELECT coalesce(max(sequence),0) FROM vector_sync_outbox)=? AND NOT EXISTS(SELECT 1 FROM vector_sync_outbox WHERE status!='complete')
    AND EXISTS(SELECT 1 FROM catalog_projection_receipts WHERE ${receiptColumns.map(k=>`${k} IS ?`).join(' AND ')})
    AND EXISTS(SELECT 1 FROM publication_receipts WHERE ${priorColumns.map(k=>`${k} IS ?`).join(' AND ')})
    AND NOT EXISTS(SELECT 1 FROM catalog_vector_deliveries WHERE status!='complete')
    AND NOT EXISTS(SELECT 1 FROM catalog_revisions WHERE status='importing' AND revision!=?)
    AND EXISTS(SELECT 1 FROM catalog_revisions WHERE revision=? AND source_export_sha256=? AND abandonment_delivery_id IS NULL)
    AND ((SELECT coalesce(max(rowid),0) FROM publication_receipts)=? OR EXISTS(
      SELECT 1 FROM publication_receipts p JOIN publication_outbox o ON o.release_id=p.release_id
      WHERE p.rowid=(SELECT max(rowid) FROM publication_receipts) AND p.release_id=? AND p.catalog_revision=?
        AND p.code_sha=? AND json_extract(p.manifest_json,'$.catalogSnapshotSha256')=?
        AND json_extract(p.manifest_json,'$.priorReleaseId')=? AND o.intent_json=p.manifest_json AND o.state='verified'))
    AND ?>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ?<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    THEN 'true' ELSE 'permanent_freeze_changed' END)`,params:[revision.sourceRows.length,revision.snapshot.catalogRevision,revision.packet.rows.length,
      revision.globalVectorWatermark,...receiptColumns.map(k=>receipt[k]),
      ...priorColumns.map(k=>prior[k]),revision.snapshot.catalogRevision,revision.snapshot.catalogRevision,revision.sourceDigest,
      revision.request.context.publicationReceiptWatermark,permit?.releaseId??null,revision.snapshot.catalogRevision,revision.request.codeSha,
      revision.packet.receipt.snapshot_sha256,revision.request.context.priorPublication?.releaseId??null,
      revision.request.context.cutoff,revision.snapshot.generatedAt]});
  if(permit)queries.push({sql:`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM catalog_mutation_scopes s JOIN catalog_build_requests b ON b.request_id=s.activation_request_id
    WHERE s.environment=? AND s.index_name=? AND s.activation_request_id=? AND b.lease_token=? AND b.run_reference=? AND b.release_id=? AND b.version_reference=?
    AND b.state='activating' AND json_extract(b.request_json,'$.sourceRevision')=?) THEN 'true' ELSE 'permanent_freeze_changed' END)`,
  params:[owner.environment,owner.indexName,permit.requestId,permit.token,permit.runReference,permit.releaseId,permit.versionReference,revision.snapshot.catalogRevision]});
  const time=(await db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') now").all<{now:string}>({signal})).results[0].now;
  validateCatalogSnapshot(revision.snapshot,new Date(time));
  const byId=new Map(revision.sourceRows.map(r=>[r.public_id,r]));
  for(const product of revision.snapshot.products)checkCurrent(product,{source_facts_hash:byId.get(product.publicId)!.source_facts_hash},byId.get(product.publicId)!,new Date(time));
  let batch:typeof queries=[];
  const flush=async()=>{signal?.throwIfAborted();await db.batch([mutationAssertion(db,owner,[owner.phase]),...batch.map(q=>db.prepare(q.sql).bind(...q.params)),mutationAssertion(db,owner,[owner.phase])],{signal});batch=[];};
  for(const q of queries){if(batch.length>=48||Buffer.byteLength(JSON.stringify({batch:[...batch,q]}))>450*1024)await flush();
    if(Buffer.byteLength(JSON.stringify(q))>450*1024)refuse();batch.push(q);}if(batch.length)await flush();signal?.throwIfAborted();
}
