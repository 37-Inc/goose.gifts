import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { mutationAssertion, mutationAdvance, mutationFenceQuery, readMutationOwner } from '../../lib/catalog/mutation-fence.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import type { PublicCatalogProduct, ProductRights } from '../../lib/catalog/types.ts';
import { publicProductRightsExpiry, validatePublicCatalogProduct, validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import { maintenanceProjection, maintenanceState } from './maintenance-state.ts';
import type { Row, SemanticProduct } from './maintenance-state.ts';
import { canonicalJson, sha256 } from './migration.ts';
import type { BudgetTotals, WorkspaceCheckpoint, WorkspaceScope } from './run-workspace.ts';
import { editorialSourceHash } from '../ops/catalog-editorial-core.mjs';

type Proposal={schemaVersion:1;runId:string;catalogRevision:string;changes:Array<{
  publicId:string;operationId:string;inputSha256:string;productSha256:string;displaySha256:string}>};
type RecoveryD1=CatalogD1&{providerIdentity:string};
export interface EditorialRecoveryBinding {
  runId:string;configSha256:string;sourceSha:string;manifestSha256:string;checkpointSha256:string;
  reservationSha256:string;journal:{sequence:number;sha256:string};scope:WorkspaceScope;
  cutoff:string;notAfter:string;owner:MutationOwner;baselineSnapshotSha256:string;
  minimumBudget:BudgetTotals;
}
export interface EditorialRecoveryContext {
  schemaVersion:1;binding:EditorialRecoveryBinding;checkpoint:WorkspaceCheckpoint;
  originalProposal:Proposal;originalProposalSha256:string;
  affectedIds:string[];baseline:PublicCatalogProduct[];baselineSnapshotJson:string;
}
export interface EditorialRecoveryCapture {
  schemaVersion:1;binding:EditorialRecoveryBinding;observedAt:string;budget:BudgetTotals;
  rows:Array<{row:Row;sidecar:Row}>;operations:Row[];
}
export interface EditorialRepairPlan {
  schemaVersion:1;kind:'eight-article-projection-repair';context:EditorialRecoveryContext;
  capture:EditorialRecoveryCapture;
  patches:Array<{id:string;before:Row;sidecarBefore:Row;after:Row;sidecarAfter:Row}>;
  proposal:Proposal;
}
const digest=(x:unknown)=>sha256(canonicalJson(x));
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const HASH=/^[a-f0-9]{64}$/;
function refuse(code:string):never{throw Error('editorial_recovery_'+code);}
function time(value:string){const n=Date.parse(value);if(!Number.isFinite(n)||new Date(n).toISOString()!==value)refuse('time');return n;}
function validBudget(b:BudgetTotals){if(!b||!same(Object.keys(b).sort(),['httpRequests','knownRowsRead','knownRowsWritten','sqlStatements','unconfirmedRequests'])||Object.values(b).some(n=>!Number.isSafeInteger(n)||n<0))refuse('budget');}
export function assertEditorialRecoveryWindow(binding:EditorialRecoveryBinding,now:string){
  if(time(now)>=Math.min(time(binding.cutoff),time(binding.notAfter)))refuse('expired');
}
function validateContext(c:EditorialRecoveryContext){
  const b=c.binding;
  if(c.schemaVersion!==1||!b||!/^[a-f0-9]{40}$/.test(b.sourceSha)
    ||[b.configSha256,b.manifestSha256,b.checkpointSha256,b.reservationSha256,b.journal.sha256,b.baselineSnapshotSha256,c.originalProposalSha256].some(h=>!HASH.test(h))
    ||!Number.isSafeInteger(b.journal.sequence)||b.journal.sequence<1||b.owner.phase!=='writing'
    ||!same(c.checkpoint.owner,b.owner)||c.checkpoint.phase!=='phases_complete'||c.checkpoint.control?.publication
    ||b.owner.ownerReference!==b.runId||b.owner.environment!==b.scope.environment||b.owner.indexName!==b.scope.indexName
    ||c.originalProposal.runId!==b.runId||c.originalProposal.catalogRevision!==b.runId||c.originalProposal.changes.length!==10
    ||sha256(JSON.stringify(c.originalProposal)+'\n')!==c.originalProposalSha256
    ||c.affectedIds.length!==8||new Set(c.affectedIds).size!==8||c.baseline.length!==10
    ||new Set(c.baseline.map(p=>p.id)).size!==10||new Set(c.baseline.map(p=>p.publicId)).size!==10
    ||new Set(c.originalProposal.changes.map(p=>p.publicId)).size!==10)refuse('binding');
  mutationFenceQuery(b.owner);time(b.cutoff);time(b.notAfter);
  validBudget(b.minimumBudget);
  if(sha256(c.baselineSnapshotJson)!==b.baselineSnapshotSha256)refuse('snapshot');
  const snapshot=validateCatalogSnapshot(JSON.parse(c.baselineSnapshotJson),new Date(b.owner.capturedAt));
  if(c.baseline.some(p=>!same(p,snapshot.products.find(x=>x.publicId===p.publicId)??null)))refuse('snapshot');
}
function requireRows(c:EditorialRecoveryContext,capture:EditorialRecoveryCapture){
  if(capture.schemaVersion!==1||!same(c.binding,capture.binding)||capture.rows.length!==10||capture.operations.length!==10
    ||new Set(capture.rows.map(x=>x.row.id)).size!==10||new Set(capture.operations.map(x=>x.operation_id)).size!==10)refuse('capture');
  validBudget(capture.budget);assertEditorialRecoveryWindow(c.binding,capture.observedAt);
  if(time(capture.observedAt)<time(c.binding.owner.capturedAt)
    ||capture.operations.some(op=>time(String(op.database_time))>time(capture.observedAt)))refuse('capture_time');
  if(Object.keys(c.binding.minimumBudget).some(k=>capture.budget[k as keyof BudgetTotals]<c.binding.minimumBudget[k as keyof BudgetTotals]))refuse('accounting_reset');
  for(const entry of capture.rows){
    const {row,sidecar}=entry,p=c.originalProposal.changes.find(p=>p.publicId===row.public_id);
    const op=capture.operations.find(op=>op.operation_id===p?.operationId);
    if(!p||row.catalog_revision!==c.binding.runId||digest(row)!==p.productSha256
      ||sha256(String(row.public_display_json??'null'))!==p.displaySha256
      ||sidecar.product_id!==row.id||!op||op.input_sha256!==p.inputSha256||op.run_id!==c.binding.runId
      ||op.catalog_revision!==c.binding.runId||op.environment!==c.binding.owner.environment
      ||op.index_name!==c.binding.owner.indexName||op.generation!==c.binding.owner.generation
      ||!JSON.parse(String(op.changes_json)).some((x:Row)=>x.productId===row.id&&x.afterSha256===p.productSha256))refuse('capture_receipt');
  }
}

/** Pure saved-input planner. Exact-value grants come from captured D1, never a
 * reconstructed fixture grant. No hash/status/native proof is promoted. */
export function prepareEditorialRepair(context:EditorialRecoveryContext,capture:EditorialRecoveryCapture,now:string):EditorialRepairPlan{
  validateContext(context);assertEditorialRecoveryWindow(context.binding,now);requireRows(context,capture);
  if(time(capture.observedAt)>time(now))refuse('capture_time');
  const patches:EditorialRepairPlan['patches']=[];
  for(const entry of capture.rows){
    const {row,sidecar}=entry,base=context.baseline.find(p=>p.publicId===row.public_id);
    if(!base||base.id!==row.id||base.slug!==row.slug||base.eligibleUntil!==null||!base.indexable||!base.editorialWriteup)refuse('baseline');
    validatePublicCatalogProduct(base,new Date(now));
    const current=maintenanceState({...row,maintenance_semantic:sidecar.semantic_json});
    const rights=JSON.parse(String(row.rights_json)) as ProductRights;
    if(publicProductRightsExpiry(base,rights,new Date(now))!==Infinity)refuse('rights');
    if(!context.affectedIds.includes(base.id)){
      if(!same(JSON.parse(String(row.public_display_json)),base))refuse('unaffected');continue;
    }
    const raw=JSON.parse(String(row.source_record_json));
    const facts=typeof raw.source_facts==='string'?JSON.parse(raw.source_facts):raw.source_facts;
    const original={...current,title:raw.title,imageUrl:raw.image_url,sourceFacts:facts} as SemanticProduct;
    if(raw.id!==base.id||raw.public_id!==base.publicId||raw.slug!==base.slug||raw.editorial_writeup!==base.editorialWriteup
      ||current.editorialWriteup!==base.editorialWriteup||current.editorialSourceHash!==raw.editorial_source_hash
      ||raw.editorial_source_hash!==raw.source_facts_hash||editorialSourceHash(original)!==raw.source_facts_hash
      ||!['generated_ready','manual_locked'].includes(raw.editorial_status)||!(Number(raw.editorial_quality_score)>=.8)
      ||Number(raw.editorial_quality_score)>1)refuse('original_editorial');
    const previous={row:{...row,public_display_json:canonicalJson(base)},product:original};
    const projection=maintenanceProjection(current,rights,context.binding.runId,now,false,null,previous);
    const display=JSON.parse(String(projection.row.public_display_json));
    if(!display||display.editorialWriteup!==base.editorialWriteup
      ||!same({...display,indexable:base.indexable},base)||display.indexable!==false
      ||!same(projection.persistentBase,base))refuse('factual_equivalence');
    const beforeDisplay=JSON.parse(String(row.public_display_json)),expectedBefore={...display};delete expectedBefore.editorialWriteup;
    if(!same(beforeDisplay,expectedBefore))refuse('unexpected_before');
    const after={...row,public_display_json:canonicalJson(display)};
    const sidecarAfter={...sidecar,version:Number(sidecar.version)+1,
      semantic_json:canonicalJson({...current,persistentBase:base})};
    if(!Number.isSafeInteger(sidecarAfter.version)||sidecarAfter.version<2)refuse('version');
    patches.push({id:base.id,before:row,sidecarBefore:sidecar,after,sidecarAfter});
  }
  if(patches.length!==8||!same(patches.map(p=>p.id).sort(),[...context.affectedIds].sort()))refuse('eight_only');
  const preliminary={schemaVersion:1 as const,kind:'eight-article-projection-repair' as const,context,capture,patches};
  const operationId=sha256(context.binding.runId+':'+digest(preliminary));
  const inputHash=digest(preliminary);
  const changes=context.originalProposal.changes.map(change=>{
    const p=patches.find(p=>p.after.public_id===change.publicId);
    return p?{...change,operationId,inputSha256:inputHash,productSha256:digest(p.after),displaySha256:sha256(String(p.after.public_display_json))}:change;
  });
  return structuredClone({...preliminary,proposal:{...context.originalProposal,changes}});
}
function identity(plan:EditorialRepairPlan){const inputHash=digest({schemaVersion:plan.schemaVersion,kind:plan.kind,context:plan.context,capture:plan.capture,patches:plan.patches});return{inputHash,operationId:sha256(plan.context.binding.runId+':'+inputHash)};}
function checkedPlan(plan:EditorialRepairPlan,expectedSha256:string,expectedContextSha256:string){
  if(digest(plan)!==expectedSha256||digest(plan.context)!==expectedContextSha256
    ||!same(plan,prepareEditorialRepair(plan.context,plan.capture,plan.capture.observedAt)))refuse('plan');
}
function assertion(db:CatalogD1,sql:string,params:unknown[]){return db.prepare(`SELECT json(CASE WHEN ${sql} THEN 'true' ELSE 'editorial_repair_conflict' END)`).bind(...params);}
const fields=(row:Row)=>Object.keys(row).sort().map(k=>{if(!/^[a-z_][a-z0-9_]*$/.test(k))refuse('column');return k;});
function rowCas(db:CatalogD1,table:string,row:Row){return assertion(db,`EXISTS(SELECT 1 FROM ${table} WHERE ${fields(row).map(k=>`${k} IS ?`).join(' AND ')})`,fields(row).map(k=>row[k]));}
function pairCas(db:CatalogD1,row:Row,sidecar:Row){return assertion(db,
  `EXISTS(SELECT 1 FROM products WHERE ${fields(row).map(k=>`${k} IS ?`).join(' AND ')}) AND
   EXISTS(SELECT 1 FROM catalog_maintenance_products WHERE ${fields(sidecar).map(k=>`${k} IS ?`).join(' AND ')})`,
  [...fields(row).map(k=>row[k]),...fields(sidecar).map(k=>sidecar[k])]);}
async function actualRows(db:CatalogD1,plan:EditorialRepairPlan){
  const rows=[];
  for(const p of plan.patches){
    const row=(await db.prepare('SELECT * FROM products WHERE id=?').bind(p.id).all<Row>()).results;
    const sidecar=(await db.prepare('SELECT * FROM catalog_maintenance_products WHERE product_id=?').bind(p.id).all<Row>()).results;
    if(row.length!==1||sidecar.length!==1)refuse('row_missing');rows.push({row:row[0],sidecar:sidecar[0]});
  }return rows;
}

/** Caller supplies ONLY the original accounted D1 connection/workspace. No
 * owner claim/release, provider phase, counter reset or automatic inverse write.
 * Uncertain ACKs retain their charged unknown and reconcile the exact receipt. */
export async function applyEditorialRepair(options:{db:RecoveryD1;plan:EditorialRepairPlan;planSha256:string;contextSha256:string;
  now:()=>string;checkpoint:{read():Promise<{sha256:string;checkpoint:WorkspaceCheckpoint}>;
    write(expected:string,checkpoint:WorkspaceCheckpoint):Promise<unknown>}}){
  const {db,plan}=options;checkedPlan(plan,options.planSha256,options.contextSha256);
  assertEditorialRecoveryWindow(plan.context.binding,options.now());
  if(time(options.now())<time(plan.capture.observedAt))refuse('capture_time');
  if(db.providerIdentity!==`cloudflare:${plan.context.binding.scope.accountId}:${plan.context.binding.scope.databaseId}`)refuse('database');
  const {operationId,inputHash}=identity(plan),binding=plan.context.binding,next={...binding.owner,epoch:binding.owner.epoch+1};
  const result={kind:plan.kind,planSha256:options.planSha256,contextSha256:options.contextSha256};
  const changes=plan.patches.map(p=>({productId:p.id,beforeSha256:digest(p.before),afterSha256:digest(p.after),privateStateSha256:sha256(String(p.sidecarAfter.semantic_json)),supersededUnsentSequences:[],vectorOperation:null}));
  const reconcile=async()=>{
    const receipts=(await db.prepare('SELECT * FROM catalog_maintenance_operations WHERE operation_id=?').bind(operationId).all<Row>()).results;
    if(!receipts.length)return false;
    const r=receipts[0];
    if(receipts.length!==1||r.input_sha256!==inputHash||r.run_id!==binding.runId||r.catalog_revision!==binding.runId
      ||r.environment!==binding.owner.environment||r.index_name!==binding.owner.indexName||r.generation!==binding.owner.generation
      ||r.prior_epoch!==binding.owner.epoch||r.next_epoch!==next.epoch||!same(JSON.parse(String(r.result_json)),result)
      ||!same(JSON.parse(String(r.changes_json)),changes)||!same(await readMutationOwner(db,binding.owner),next))refuse('receipt');
    const actual=await actualRows(db,plan);
    if(actual.some((a,i)=>!same(a.row,plan.patches[i].after)||!same(a.sidecar,plan.patches[i].sidecarAfter)))refuse('after_drift');
    await mutationAssertion(db,next).all();
    return true;
  };
  const cp=await options.checkpoint.read();
  const completedCheckpoint={...plan.context.checkpoint,owner:next};
  if(cp.sha256!==binding.checkpointSha256&&!same(cp.checkpoint,completedCheckpoint))refuse('checkpoint');
  if(!await reconcile()){
    if(cp.sha256!==binding.checkpointSha256||!same(cp.checkpoint,plan.context.checkpoint))refuse('checkpoint');
    const statements=[mutationAssertion(db,binding.owner),assertion(db,
      "EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE environment=? AND index_name=? AND captured_at=?) AND strftime('%Y-%m-%dT%H:%M:%fZ','now')>=? AND strftime('%Y-%m-%dT%H:%M:%fZ','now')<?",
      [binding.owner.environment,binding.owner.indexName,binding.owner.capturedAt,plan.capture.observedAt,
        new Date(Math.min(time(binding.cutoff),time(binding.notAfter))).toISOString()])];
    for(const op of plan.capture.operations)statements.push(rowCas(db,'catalog_maintenance_operations',op));
    for(const p of plan.capture.rows)statements.push(pairCas(db,p.row,p.sidecar));
    for(const p of plan.patches){
      statements.push(db.prepare('UPDATE products SET public_display_json=? WHERE id=?').bind(p.after.public_display_json,p.id));
      statements.push(db.prepare('UPDATE catalog_maintenance_products SET semantic_json=?,version=? WHERE product_id=?').bind(p.sidecarAfter.semantic_json,p.sidecarAfter.version,p.id));
      statements.push(pairCas(db,p.after,p.sidecarAfter));
    }
    statements.push(db.prepare(`INSERT INTO catalog_maintenance_operations(operation_id,input_sha256,run_id,catalog_revision,environment,index_name,generation,prior_epoch,next_epoch,database_time,result_json,changes_json)
      VALUES(?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?)`).bind(operationId,inputHash,binding.runId,binding.runId,binding.owner.environment,binding.owner.indexName,binding.owner.generation,binding.owner.epoch,next.epoch,canonicalJson(result),canonicalJson(changes)));
    statements.push(mutationAdvance(db,binding.owner,{sql:'SELECT 1 FROM catalog_maintenance_operations WHERE operation_id=? AND input_sha256=?',params:[operationId,inputHash]}),mutationAssertion(db,next),
      assertion(db,"strftime('%Y-%m-%dT%H:%M:%fZ','now')<?",[new Date(Math.min(time(binding.cutoff),time(binding.notAfter))).toISOString()]));
    if(statements.length>50)refuse('statements');
    assertEditorialRecoveryWindow(binding,options.now());
    try{await db.batch(statements);}catch{if(!await reconcile())refuse('apply_unconfirmed');}
    if(!await reconcile())refuse('receipt_missing');
  }
  if(cp.sha256===binding.checkpointSha256)await options.checkpoint.write(cp.sha256,completedCheckpoint);
  return {state:'repaired' as const,operationId,planSha256:options.planSha256,owner:next,proposal:plan.proposal};
}
export const editorialRepairSha256=digest;

/** Bounded same-owner capture. No merchant API, owner claim or write SQL. The
 * caller wires its ORIGINAL workspace-accounted D1 client and immutable output. */
export async function captureEditorialRepair(options:{db:RecoveryD1;context:EditorialRecoveryContext;
  checkpoint:()=>Promise<{sha256:string;checkpoint:WorkspaceCheckpoint}>;budget:()=>Promise<BudgetTotals>;now:()=>string}){
  const {db,context:c}=options;validateContext(c);assertEditorialRecoveryWindow(c.binding,options.now());
  if(db.providerIdentity!==`cloudflare:${c.binding.scope.accountId}:${c.binding.scope.databaseId}`)refuse('database');
  const cp=await options.checkpoint();
  if(cp.sha256!==c.binding.checkpointSha256||!same(cp.checkpoint,c.checkpoint))refuse('checkpoint');
  const check=async()=>{if(!same(await readMutationOwner(db,c.binding.owner),c.binding.owner))refuse('owner');await mutationAssertion(db,c.binding.owner).all();};
  await check();const rows:EditorialRecoveryCapture['rows']=[],operations:Row[]=[];
  for(const item of c.originalProposal.changes){
    const row=(await db.prepare('SELECT * FROM products WHERE public_id=?').bind(item.publicId).all<Row>()).results;
    if(row.length!==1)refuse('row_missing');
    const sidecar=(await db.prepare('SELECT * FROM catalog_maintenance_products WHERE product_id=?').bind(row[0].id).all<Row>()).results;
    const op=(await db.prepare('SELECT * FROM catalog_maintenance_operations WHERE operation_id=?').bind(item.operationId).all<Row>()).results;
    if(sidecar.length!==1||op.length!==1)refuse('row_missing');rows.push({row:row[0],sidecar:sidecar[0]});operations.push(op[0]);
  }
  await check();assertEditorialRecoveryWindow(c.binding,options.now());
  const capture:EditorialRecoveryCapture={schemaVersion:1,binding:c.binding,observedAt:options.now(),budget:await options.budget(),rows,operations};
  prepareEditorialRepair(c,capture,capture.observedAt);return capture;
}
