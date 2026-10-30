import type {CatalogD1} from '../../lib/catalog/storage/d1.ts';
import type {MutationOwner} from '../../lib/catalog/mutation-fence.ts';
import {mutationAssertion,mutationAdvance} from '../../lib/catalog/mutation-fence.ts';
import {persistentPublicProduct} from '../../lib/catalog/display.ts';
import {publicProductRightsExpiry,persistentDisplayRights} from '../../lib/catalog/snapshot.ts';
import {normalizedEditorialFacts,originalEditorialEquivalentRow} from '../../lib/catalog/editorial-equivalence.ts';
import {editorialSourceHash} from '../ops/catalog-editorial-core.mjs';
import {canonicalJson,sha256} from './migration.ts';
import {checkCurrent} from './export-d1-snapshot.ts';
import type {ApprovedCatalogSeal} from './approved-catalog-seal.ts';
import type {CatalogSnapshot} from '../../lib/catalog/types.ts';

type Row=Record<string,unknown>;
function fail():never{throw Error('cleared_base_recovery_refused');}
/** Recover only previously published, independently cleared presentation. No
 * supplier observation, deadline, native vector or immutable operation changes. */
export function planClearedBaseRecovery(input:{seal:ApprovedCatalogSeal;previous:CatalogSnapshot;
  products:Row[];maintenance:Row[];operations:Row[];owner:MutationOwner;runId:string;catalogRevision:string;now:string}){
  const {seal,previous,owner}=input;
  if(!seal.persistent||owner.phase!=='freezing'||previous.catalogRevision!==seal.projectionReceipt.catalog_revision
    ||sha256(JSON.stringify(previous)+'\n')!==seal.snapshotSha256||input.products.length<1||input.products.length>5
    ||new Set(input.products.map(p=>p.public_id)).size!==input.products.length)fail();
  const changes=input.products.map(before=>{
    const prior=seal.persistent!.inventory.find(p=>p.publicId===before.public_id);
    const old=previous.products.find(p=>p.publicId===before.public_id),base=old&&persistentPublicProduct(old);
    const state=input.maintenance.find(p=>p.product_id===before.id);
    const links=input.operations.flatMap(op=>JSON.parse(String(op.changes_json)).filter((c:Row)=>c.productId===before.id).map((change:Row)=>({op,change})));
    if(!prior||!base||!state||links.length!==1)fail();
    const {op,change}=links[0],semantic=JSON.parse(String(state.semantic_json)),archive=JSON.parse(String(before.source_record_json));
    if(op.environment!==owner.environment||op.index_name!==owner.indexName||Number(op.generation)<=seal.persistent!.generation
      ||Number(op.generation)>=owner.generation||change.beforeSha256!==prior.productSha256
      ||change.afterSha256!==sha256(canonicalJson(before))||before.is_active!==1||before.duplicate_of_product_id!==null
      ||['id','publicId','slug','source'].some(k=>base[k as keyof typeof base]!==semantic[k])
      ||normalizedEditorialFacts(archive.source_facts)===null
      ||normalizedEditorialFacts(archive.source_facts)!==normalizedEditorialFacts(semantic.sourceFacts)
      ||publicProductRightsExpiry(base,persistentDisplayRights(JSON.parse(String(before.rights_json))),new Date(input.now))!==Infinity)fail();
    // Restore exact original optional editorial; do not generate or reapprove it.
    const restored={...semantic,qualityScore:base.qualityScore,persistentBase:base};
    for(const key of ['punnyTitle','wittyDescription','editorialWriteup'] as const)
      if(base[key]!==undefined)restored[key]=base[key];
    const after={...before,public_display_json:canonicalJson(base),quality_score:base.qualityScore,eligible_until:null};
    const nextState={...state,version:Number(state.version)+1,semantic_json:canonicalJson(restored)};
    const current={...after,maintenance_semantic:nextState.semantic_json};
    if(base.indexable&&!originalEditorialEquivalentRow(current,base.editorialWriteup??'',editorialSourceHash)
      &&before.source_facts_hash!==before.editorial_source_hash)fail();
    checkCurrent(base,{source_facts_hash:before.source_facts_hash},current,new Date(input.now));
    return {publicId:base.publicId,priorProductSha256:prior.productSha256,priorOperationId:String(op.operation_id),
      before,after,state,nextState,operation:op};
  });
  return{schemaVersion:1 as const,kind:'cleared-base-recovery-v1' as const,runId:input.runId,catalogRevision:input.catalogRevision,
    owner,priorReceiptSha256:seal.publication.receiptSha256,priorSnapshotSha256:seal.snapshotSha256,
    priorGeneration:seal.persistent.generation,changes};
}
export type ClearedBaseRecovery=ReturnType<typeof planClearedBaseRecovery>;
/** A prior failed write is carried only through its exact, appended repair;
 * arbitrary historical mutations cannot become implicitly approved changes. */
export function recoveredBaseLink(operations:Row[],input:{publicId:string;productId:unknown;productSha256:string;
  priorProductSha256:string;priorReceiptSha256:string;priorSnapshotSha256:string;priorGeneration:number;owner:MutationOwner;runId:string}){
  const matches=operations.filter(op=>{
    if(op.run_id!==input.runId||Number(op.generation)>input.owner.generation||Number(op.next_epoch)>input.owner.epoch
      ||op.environment!==input.owner.environment||op.index_name!==input.owner.indexName)return false;
    const r=JSON.parse(String(op.result_json));
    if(r?.kind!=='cleared-base-recovery-v1'||r.priorReceiptSha256!==input.priorReceiptSha256
      ||r.priorSnapshotSha256!==input.priorSnapshotSha256||r.priorGeneration!==input.priorGeneration
      ||!Array.isArray(r.changes)||r.changes.length>5)return false;
    const c=r.changes.find((c:Row)=>c.publicId===input.publicId);
    if(!c||c.priorProductSha256!==input.priorProductSha256||c.productSha256!==input.productSha256)return false;
    const changes=JSON.parse(String(op.changes_json)),repair=changes.find((c:Row)=>c.productId===input.productId);
    const old=operations.find(old=>old.operation_id===c.priorOperationId);
    const before=old&&JSON.parse(String(old.changes_json)).find((c:Row)=>c.productId===input.productId);
    return !!old&&repair?.afterSha256===input.productSha256&&repair.vectorOperation===null&&before?.beforeSha256===input.priorProductSha256
      &&before.afterSha256===repair.beforeSha256&&old.environment===input.owner.environment&&old.index_name===input.owner.indexName
      &&Number(old.generation)>input.priorGeneration&&Number(old.generation)<Number(op.generation);
  });
  if(matches.length>1)fail();return matches[0]??null;
}
/** Atomic exact-row CAS with one appended maintenance receipt and fenced epoch.
 * A retry observes its original receipt; it never repeats provider work. */
export async function applyClearedBaseRecovery(db:CatalogD1,plan:ClearedBaseRecovery){
  const input=sha256(canonicalJson(plan)),operationId=sha256('cleared-base-recovery:'+input),owner=plan.owner;
  const exact=(table:string,row:Row)=>{
    const keys=Object.keys(row);if(keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k))||keys.length>65)fail();
    return db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE ${keys.map(k=>`${k} IS ?`).join(' AND ')})
      THEN 'true' ELSE 'cleared_base_recovery_conflict' END)`).bind(...keys.map(k=>row[k]));
  };
  const found=(await db.prepare('SELECT input_sha256,result_json FROM catalog_maintenance_operations WHERE operation_id=?').bind(operationId).all()).results;
  if(found.length){
    if(found.length!==1||found[0].input_sha256!==input)fail();
    await db.batch([mutationAssertion(db,{...owner,epoch:owner.epoch+1},['freezing']),
      ...plan.changes.flatMap(c=>[exact('products',c.after),exact('catalog_maintenance_products',c.nextState)])]);
    return{owner:{...owner,epoch:owner.epoch+1},operationId};
  }
  const result={kind:plan.kind,priorReceiptSha256:plan.priorReceiptSha256,priorSnapshotSha256:plan.priorSnapshotSha256,
    priorGeneration:plan.priorGeneration,changes:plan.changes.map(c=>({publicId:c.publicId,priorProductSha256:c.priorProductSha256,
      priorOperationId:c.priorOperationId,productSha256:sha256(canonicalJson(c.after))}))};
  const statements=[mutationAssertion(db,owner,['freezing'])];
  for(const c of plan.changes){
    statements.push(exact('products',c.before),exact('catalog_maintenance_products',c.state),exact('catalog_maintenance_operations',c.operation),
      db.prepare('UPDATE products SET public_display_json=?,quality_score=?,eligible_until=NULL WHERE id=?')
        .bind(c.after.public_display_json,c.after.quality_score,c.before.id),
      db.prepare('UPDATE catalog_maintenance_products SET semantic_json=?,version=? WHERE product_id=?')
        .bind(c.nextState.semantic_json,c.nextState.version,c.before.id),exact('products',c.after),exact('catalog_maintenance_products',c.nextState));
  }
  statements.push(db.prepare(`INSERT INTO catalog_maintenance_operations(operation_id,input_sha256,run_id,catalog_revision,
    environment,index_name,generation,prior_epoch,next_epoch,database_time,result_json,changes_json)
    VALUES(?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?)`).bind(operationId,input,plan.runId,plan.catalogRevision,
      owner.environment,owner.indexName,owner.generation,owner.epoch,owner.epoch+1,canonicalJson(result),canonicalJson(plan.changes.map(c=>({
        productId:c.before.id,beforeSha256:sha256(canonicalJson(c.before)),afterSha256:sha256(canonicalJson(c.after)),
        privateStateSha256:sha256(c.nextState.semantic_json),supersededUnsentSequences:[],vectorOperation:null})))));
  statements.push(mutationAdvance(db,owner,{sql:'SELECT 1 FROM catalog_maintenance_operations WHERE operation_id=? AND input_sha256=?',params:[operationId,input]}),
    mutationAssertion(db,{...owner,epoch:owner.epoch+1},['freezing']));
  await db.batch(statements);
  return{owner:{...owner,epoch:owner.epoch+1},operationId};
}
