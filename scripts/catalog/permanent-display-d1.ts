import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import { mutationFenceQuery, readMutationOwner } from '../../lib/catalog/mutation-fence.ts';
import { createPersistentCatalogProduct, publicProductRightsExpiry } from '../../lib/catalog/snapshot.ts';
import type { ProductRights, SnapshotProductInput } from '../../lib/catalog/types.ts';
import { canonicalJson, sha256 } from './migration.ts';
import { maintenanceState } from './maintenance-state.ts';
import { assemblePermanentBaseline } from './permanent-baseline.ts';
import { expectedOwnedOperationalImportRows, readOwnedLogicalRows } from './owned-operational-import.ts';
import type { OwnedOperationalImportPlan } from './owned-operational-import.ts';
import { validateCooperativeCaptureReceipt } from './capture-owned-d1.ts';
import type { CooperativeCaptureReceipt } from './capture-owned-d1.ts';
import type { FrozenD1RecoveryInput } from './recovery-delta.ts';
import { D1_RECOVERY_TABLES } from './d1-logical-tables.ts';

type Row=Record<string,unknown>;
type Proposal=ReturnType<typeof assemblePermanentBaseline>;
type AssemblerOptions=Parameters<typeof assemblePermanentBaseline>[2];
const FIELDS=['public_display_json','rights_json','title','description','tags'] as const;
const HASH=/^[a-f0-9]{64}$/;
const CONTROL_MIGRATION='0015_persistent_projection_facts.sql';
const CONTROL_SOURCE='ba52088cf45175f5a4107793a848d084ac6d48935aaa1b2efd4e7950a14a0df0';
/** Explicit root-reviewed control receipt; never a source/application allocator
 * waiver. The operator retains and verifies the actual receipt bytes. */
export interface PermanentControlMigration {name:typeof CONTROL_MIGRATION;sourceSha256:string;receiptSha256:string}
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const digest=(rows:Row[])=>sha256(canonicalJson([...rows].sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)))));
function refuse(code:string):never{throw new Error(`permanent_display_${code}`);}
function instant(value:unknown):value is string{return typeof value==='string'&&Number.isFinite(Date.parse(value))
  &&new Date(value).toISOString()===value;}
function indexed(rows:Row[],key:string){const result=new Map<string,Row>();for(const row of rows){
  if(typeof row[key]!=='string'||result.has(String(row[key])))refuse('identity');result.set(String(row[key]),row);}return result;}
function captureValid(capture:FrozenD1RecoveryInput,hash:string){
  if(!HASH.test(hash)||sha256(canonicalJson(capture))!==hash||capture.schemaVersion!==1
    ||capture.scope!=='application-logical-tables-through-0012'||capture.provenance.kind!=='unverified-capture'
    ||capture.provenance.barrierEvidence!==null||Object.keys(capture.tables).sort().join(',')!==D1_RECOVERY_TABLES.join(',')
    ||capture.inventory.length!==24)refuse('capture');
  for(const table of D1_RECOVERY_TABLES){const entries=capture.inventory.filter(i=>i.table===table),rows=capture.tables[table];
    if(!Array.isArray(rows)||rows.length>20_000||entries.length!==1||entries[0].rows!==rows.length
      ||entries[0].sha256!==sha256(canonicalJson(rows)))refuse('capture');}
  if(capture.inventory.reduce((n,t)=>n+t.rows,0)>100_000||Buffer.byteLength(canonicalJson(capture))>128*1024*1024)refuse('bounds');
}

/** Current private semantic facts, not the display cache or an inferred grant. */
export function permanentBaselineCurrent(capture:FrozenD1RecoveryInput):SnapshotProductInput[]{
  const sidecars=indexed(capture.tables.catalog_maintenance_products,'product_id');
  return capture.tables.products.map(row=>{const p=maintenanceState({...row,maintenance_semantic:sidecars.get(String(row.id))?.semantic_json});
    return {...p,price:Number(p.price),qualityScore:p.qualityScore===null?undefined:Number(p.qualityScore),
      editorialQualityScore:p.editorialQualityScore===null?undefined:Number(p.editorialQualityScore)} as unknown as SnapshotProductInput;});
}
/** Only the two inventoried idle app SQL paths, never catalog/native changes.
 * Callers separately prove exact owner/scope/epoch and every other table. */
export function validatePermanentRuntimeTransition(before:Record<string,Row[]>,after:Record<string,Row[]>,from:string,until:string){
  const old=indexed(before.search_diagnostics,'id'),current=indexed(after.search_diagnostics,'id');
  for(const [id,row]of old){const next=current.get(id);if(next?!same(row,next):!instant(row.expires_at)||row.expires_at>until)refuse('runtime_drift');}
  for(const [id,row]of current)if(!old.has(id)){
    if(!instant(row.created_at)||!instant(row.expires_at)||row.created_at<from||row.created_at>until
      ||Date.parse(row.expires_at)-Date.parse(row.created_at)!==30*86400000
      ||typeof row.query_hash!=='string'||!HASH.test(row.query_hash)||!Number.isInteger(row.query_length)||Number(row.query_length)<2||Number(row.query_length)>200
      ||!Number.isInteger(row.result_count)||Number(row.result_count)<0||Number(row.result_count)>60
      ||!['semantic','keyword','none'].includes(String(row.match_type))||!['ok','empty','unavailable'].includes(String(row.outcome))
      ||row.top_similarity!==null&&(typeof row.top_similarity!=='number'||!Number.isFinite(row.top_similarity)||Math.abs(row.top_similarity)>1))refuse('runtime_drift');
  }
  const key=(row:Row)=>canonicalJson([row.environment,row.index_scope,row.utc_day]);
  const budgets=new Map(after.semantic_search_budgets.map(r=>[key(r),r]));
  const cleanup=new Date(Date.parse(until)-30*86400000).toISOString().slice(0,10);
  for(const row of before.semantic_search_budgets){const next=budgets.get(key(row));
    if(!next){if(String(row.utc_day)>=cleanup)refuse('runtime_drift');continue;}
    const requests=Number(next.requests_reserved)-Number(row.requests_reserved),tokens=Number(next.tokens_reserved)-Number(row.tokens_reserved);
    if(!same({...row,requests_reserved:next.requests_reserved,tokens_reserved:next.tokens_reserved},next)
      ||!Number.isSafeInteger(requests)||!Number.isSafeInteger(tokens)||requests<0||tokens<requests||tokens>816*requests
      ||requests>0&&(String(row.utc_day)<from.slice(0,10)||String(row.utc_day)>until.slice(0,10)))refuse('runtime_drift');
  }
  const oldBudgets=new Set(before.semantic_search_budgets.map(key));
  for(const row of after.semantic_search_budgets){
    if(!Number.isSafeInteger(row.requests_reserved)||!Number.isSafeInteger(row.tokens_reserved)||Number(row.requests_reserved)<1
      ||Number(row.requests_reserved)>Number(row.request_cap)||Number(row.tokens_reserved)>Number(row.token_cap))refuse('runtime_drift');
    if(!oldBudgets.has(key(row))&&(!instant(`${row.utc_day}T00:00:00.000Z`)||String(row.utc_day)<from.slice(0,10)||String(row.utc_day)>until.slice(0,10)
      ||!['staging','production'].includes(String(row.environment))||! /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(String(row.index_scope))
      ||!Number.isSafeInteger(row.request_cap)||Number(row.request_cap)<1||Number(row.request_cap)>100000
      ||!Number.isSafeInteger(row.token_cap)||Number(row.token_cap)<1||Number(row.token_cap)>100000000
      ||Number(row.tokens_reserved)<Number(row.requests_reserved)||Number(row.tokens_reserved)>816*Number(row.requests_reserved)))refuse('runtime_drift');
  }
}
function verifyUnion(input:StoredInput){
  const {capture,owner,union}=input,expected=expectedOwnedOperationalImportRows(union.plan,union.sha256);
  if(input.controlMigration){
    const m=input.controlMigration,old=expected.sqlite_sequence.filter(r=>r.name==='d1_migrations'),
      current=capture.tables.sqlite_sequence.filter(r=>r.name==='d1_migrations');
    if(!same(Object.keys(m).sort(),['name','receiptSha256','sourceSha256'])||m.name!==CONTROL_MIGRATION
      ||m.sourceSha256!==CONTROL_SOURCE||!HASH.test(m.receiptSha256)||old.length!==1||current.length!==1
      ||old[0].seq!==14||current[0].seq!==15)refuse('control_migration');
    expected.sqlite_sequence=expected.sqlite_sequence.map(r=>r.name==='d1_migrations'?{...r,seq:15}:r);
  }
  if(!union.plan.batches.length||union.plan.sourceManifestSha256!==input.evidence.manifestSha256
    ||owner.phase!=='writing'||owner.epoch!==union.plan.owner.epoch+union.plan.batches.length)refuse('union');
  const old={...union.plan.owner,epoch:owner.epoch};
  if(!same(owner,old)&&(owner.generation!==old.generation+1||owner.token===old.token||owner.capturedAt<old.capturedAt
    ||owner.environment!==old.environment||owner.indexName!==old.indexName))refuse('union_owner');
  mutationFenceQuery(owner);
  for(const table of D1_RECOVERY_TABLES){
    if(table==='catalog_mutation_scopes'){
      if(expected[table].length!==1||capture.tables[table].length!==1)refuse('union_owner');
      const row={...expected[table][0],owner_token:owner.token,generation:owner.generation,owner_reference:owner.ownerReference,
        operation_key:owner.operationKey,captured_at:owner.capturedAt};
      if(!same(row,capture.tables[table][0]))refuse('union_owner');
    }else if(!['search_diagnostics','semantic_search_budgets'].includes(table)&&digest(expected[table])!==digest(capture.tables[table]))refuse(`union_drift_${table}`);
  }
  if(!same(owner,old))validatePermanentRuntimeTransition(expected,capture.tables,old.capturedAt,owner.capturedAt);
  else for(const table of ['search_diagnostics','semantic_search_budgets'])if(digest(expected[table])!==digest(capture.tables[table]))refuse('runtime_drift');
}
interface StoredInput {
  capture:FrozenD1RecoveryInput;captureSha256:string;owner:MutationOwner;
  union:{plan:OwnedOperationalImportPlan;sha256:string};
  controlMigration?:PermanentControlMigration;
  evidence:Parameters<typeof assemblePermanentBaseline>[0];
  assembler:Omit<AssemblerOptions,'now'|'placeholder'>&{now:string;placeholder:{path:string;bytesBase64:string;expectedSha256:string}};
  approvedProposal:{value:Proposal;sha256:string;reference:string};
}
type Patch=Record<typeof FIELDS[number],string>;
export interface PermanentDisplayPlan {schemaVersion:1;kind:'owned-permanent-display';input:StoredInput;batches:Array<Array<{id:string;fields:Patch}>>}
type Query={sql:string;params:unknown[]};
const ownerAt=(plan:PermanentDisplayPlan,n:number)=>({...plan.input.owner,epoch:plan.input.owner.epoch+n});
function receipt(plan:PermanentDisplayPlan,hash:string,n:number){return{export_sha256:hash,table_name:'products',batch_number:n,
  batch_sha256:sha256(canonicalJson({kind:plan.kind,planSha256:hash,batch:plan.batches[n],owner:ownerAt(plan,n)})),
  row_count:plan.batches[n].length,imported_at:plan.input.assembler.now};}
function queries(plan:PermanentDisplayPlan,hash:string,n:number):Query[]{
  const rows=indexed(plan.input.capture.tables.products,'id'),sidecars=indexed(plan.input.capture.tables.catalog_maintenance_products,'product_id');
  const batch=plan.batches[n],payload=canonicalJson(batch.map(p=>({...p,before:rows.get(p.id),private:sidecars.get(p.id)??null})));
  const columns=Object.keys(rows.get(batch[0].id)!);if(columns.some(c=>!/^[_a-z][_a-z0-9]*$/.test(c)))refuse('columns');
  const current=mutationFenceQuery(ownerAt(plan,n)),next=mutationFenceQuery(ownerAt(plan,n+1));
  const privateColumns=['product_id','version','semantic_json','embedding_present','embedding_native_base64','embedding_provenance_json'];
  const present=`((json_extract(j.value,'$.private') IS NULL AND NOT EXISTS(SELECT 1 FROM catalog_maintenance_products s WHERE s.product_id=p.id))
    OR EXISTS(SELECT 1 FROM catalog_maintenance_products s WHERE ${privateColumns.map(c=>`s.${c} IS json_extract(j.value,'$.private.${c}')`).join(' AND ')}))`;
  const exact=(after:boolean)=>`(SELECT count(*) FROM json_each(?) j JOIN products p ON p.id=json_extract(j.value,'$.id') WHERE
    ${columns.map(c=>`p.${c} IS json_extract(j.value,'$.${after&&FIELDS.includes(c as typeof FIELDS[number])?'fields':'before'}.${c}')`).join(' AND ')} AND ${present})=?`;
  const r=receipt(plan,hash,n),keys=Object.keys(r),values=Object.values(r);
  return[
    {sql:`SELECT json(CASE WHEN ${current.sql} AND EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE captured_at=?) AND ${exact(false)} THEN 'true' ELSE 'permanent_display_conflict' END)`,params:[...current.params,ownerAt(plan,n).capturedAt,payload,batch.length]},
    {sql:`WITH changes AS(SELECT value FROM json_each(?)) UPDATE products SET ${FIELDS.map(c=>`${c}=(SELECT json_extract(value,'$.fields.${c}') FROM changes WHERE json_extract(value,'$.id')=products.id)`).join(',')}
      WHERE id IN(SELECT json_extract(value,'$.id') FROM changes) AND ${current.sql}`,params:[canonicalJson(batch),...current.params]},
    {sql:`INSERT INTO migration_imports(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,params:values},
    {sql:`UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1 WHERE ${current.sql} AND EXISTS(SELECT 1 FROM migration_imports WHERE ${keys.map(c=>`${c} IS ?`).join(' AND ')})`,params:[...current.params,...values]},
    {sql:`SELECT json(CASE WHEN ${next.sql} AND EXISTS(SELECT 1 FROM catalog_mutation_scopes WHERE captured_at=?) AND ${exact(true)} THEN 'true' ELSE 'permanent_display_conflict' END)`,params:[...next.params,ownerAt(plan,n+1).capturedAt,payload,batch.length]},
  ];
}
function build(input:StoredInput){
  captureValid(input.capture,input.captureSha256);verifyUnion(input);
  if(!instant(input.assembler.now)||!HASH.test(input.approvedProposal.sha256)||!input.approvedProposal.reference.trim()
    ||input.approvedProposal.reference.length>1000||sha256(canonicalJson(input.approvedProposal.value))!==input.approvedProposal.sha256)refuse('approval');
  const bytes=Buffer.from(input.assembler.placeholder.bytesBase64,'base64');
  if(bytes.toString('base64')!==input.assembler.placeholder.bytesBase64)refuse('placeholder');
  const proposal=assemblePermanentBaseline(input.evidence,permanentBaselineCurrent(input.capture),{
    ...input.assembler,now:new Date(input.assembler.now),placeholder:{...input.assembler.placeholder,bytes}});
  if(!same(proposal,input.approvedProposal.value))refuse('proposal_changed');
  const plan:PermanentDisplayPlan={schemaVersion:1,kind:'owned-permanent-display',input,batches:[]};
  const rows=indexed(input.capture.tables.products,'id');
  for(const candidate of proposal.proposed){
    const row=rows.get(candidate.id),base=createPersistentCatalogProduct(candidate.input,new Date(input.assembler.now));
    if(!row||!base||base.id!==row.id||base.publicId!==row.public_id||base.slug!==row.slug||base.source!==row.source||base.currency!==row.currency
      ||publicProductRightsExpiry(base,candidate.input.rights,new Date(input.assembler.now))!==Infinity)refuse('candidate');
    // Never copy an expired supplier overlay into a newly public DTO. Preserve
    // every original root grant/clock privately; exact permanent grants have
    // their separate existing one-level slot. Daily preservation owns sidecars.
    const rights:ProductRights={...JSON.parse(String(row.rights_json)),persistent:candidate.input.rights};
    const fields:Patch={public_display_json:canonicalJson(base),rights_json:canonicalJson(rights),title:base.title,
      description:base.description,tags:base.humorTags?.join(' ')??''};
    if(FIELDS.every(c=>row[c]===fields[c]))continue;
    let batch=plan.batches.at(-1);if(!batch||batch.length===40){batch=[];plan.batches.push(batch);}batch.push({id:candidate.id,fields});
    if(Buffer.byteLength(JSON.stringify({batch:queries(plan,'0'.repeat(64),plan.batches.length-1)}))>480*1024){
      batch.pop();if(!batch.length)refuse('row_bounds');batch=[{id:candidate.id,fields}];plan.batches.push(batch);
      if(Buffer.byteLength(JSON.stringify({batch:queries(plan,'0'.repeat(64),plan.batches.length-1)}))>480*1024)refuse('row_bounds');
    }
  }
  if(!Number.isSafeInteger(input.owner.epoch+plan.batches.length)||Buffer.byteLength(canonicalJson(plan))>128*1024*1024)refuse('bounds');
  return{plan,sha256:sha256(canonicalJson(plan))};
}
/** Pure, root-reviewed exact proposal only. No inferred rights or source changes. */
export function preparePermanentDisplayPlan(input:Omit<StoredInput,'assembler'>&{assembler:AssemblerOptions}){
  return build(structuredClone({...input,assembler:{...input.assembler,now:input.assembler.now.toISOString(),
    placeholder:{path:input.assembler.placeholder.path,expectedSha256:input.assembler.placeholder.expectedSha256,
      bytesBase64:Buffer.from(input.assembler.placeholder.bytes).toString('base64')}}}));
}
function expected(plan:PermanentDisplayPlan,hash:string,completed:number){
  const rows=structuredClone(plan.input.capture.tables),products=indexed(rows.products,'id');
  for(let n=0;n<completed;n++){for(const patch of plan.batches[n])Object.assign(products.get(patch.id)!,patch.fields);
    rows.migration_imports.push(receipt(plan,hash,n));}
  rows.catalog_mutation_scopes[0].mutation_epoch=ownerAt(plan,completed).epoch;return rows;
}
function validatePlan(plan:PermanentDisplayPlan,hash:string){
  if(!HASH.test(hash)||sha256(canonicalJson(plan))!==hash||plan.schemaVersion!==1||plan.kind!=='owned-permanent-display'
    ||build(plan.input).sha256!==hash)refuse('plan');
}
/** Pure original completed state, NOT a new owner's approval or a DB readback.
 * A later freezer must independently verify receipts/current rows and its own
 * exact owner. Never rewrite this original writing owner for a new phase. */
export function expectedPermanentDisplayRows(plan:PermanentDisplayPlan,planSha256:string){
  validatePlan(plan,planSha256);return expected(plan,planSha256,plan.batches.length);
}
async function inspect(db:CatalogD1,plan:PermanentDisplayPlan,hash:string,cursor:MutationOwner){
  const actual=await readMutationOwner(db,plan.input.owner);if(!actual)refuse('owner');const completed=actual.epoch-plan.input.owner.epoch;
  if(!Number.isSafeInteger(completed)||completed<0||completed>plan.batches.length||!same(actual,ownerAt(plan,completed))
    ||!same(cursor,actual)&&!(completed>0&&same(cursor,ownerAt(plan,completed-1))))refuse('owner');
  const rows=await readOwnedLogicalRows(db,actual),wanted=expected(plan,hash,completed);
  for(const table of D1_RECOVERY_TABLES)if(digest(rows[table])!==digest(wanted[table]))refuse(`drift_${table}`);
  return{owner:actual,completed,rows};
}
/** Five public-cache fields only. No claim/release, timestamps, supplier/native
 * work, outbox, maintenance receipt, publication or schema changes. The genuine
 * registered cooperative receiver is mandatory, including offline REST fixtures.
 * Actual provider canary/writer-stop review remains an operator prerequisite. */
export async function applyPermanentDisplayPlan(options:{db:CatalogD1;plan:PermanentDisplayPlan;planSha256:string;
  ownerCursor:{current:MutationOwner};cooperativeCapture:{receipt:CooperativeCaptureReceipt;sha256:string};
  checkpoint?:(owner:MutationOwner)=>Promise<void>}){
  const {db,planSha256,ownerCursor}=options,plan=structuredClone(options.plan);
  validatePlan(plan,planSha256);
  if(plan.input.controlMigration){
    const rows=(await db.prepare('SELECT id,name FROM d1_migrations WHERE id=? OR name=? ORDER BY id')
      .bind(15,CONTROL_MIGRATION).all<Row>()).results;
    if(!same(rows,[{id:15,name:CONTROL_MIGRATION}]))refuse('control_migration');
  }
  const proof=structuredClone(options.cooperativeCapture);
  if(plan.input.assembler.now!==proof.receipt.completedAt)refuse('capture_time');
  const validate=(owner:MutationOwner)=>validateCooperativeCaptureReceipt({db,originalOwner:plan.input.owner,currentOwner:owner,
    baseline:plan.input.capture.tables,provenance:plan.input.capture.provenance,captureSha256:plan.input.captureSha256,proof});
  const before=await inspect(db,plan,planSha256,ownerCursor.current);await validate(before.owner);ownerCursor.current=before.owner;
  for(let n=before.completed;n<plan.batches.length;n++){
    try{await db.batch(queries(plan,planSha256,n).map(q=>db.prepare(q.sql).bind(...q.params)));}
    catch{const recovered=await inspect(db,plan,planSha256,ownerCursor.current);if(recovered.completed!==n+1)refuse('batch_unconfirmed');
      ownerCursor.current=recovered.owner;await options.checkpoint?.(ownerCursor.current);continue;}
    ownerCursor.current=ownerAt(plan,n+1);await options.checkpoint?.(ownerCursor.current);
  }
  const final=await inspect(db,plan,planSha256,ownerCursor.current);await validate(final.owner);
  if((await db.prepare('PRAGMA foreign_key_check').all()).results.length)refuse('foreign_key');
  return{state:'reconciled' as const,owner:final.owner,planSha256,approvedProposalSha256:plan.input.approvedProposal.sha256,
    cooperativeReceiptSha256:proof.sha256,sourceManifestSha256:plan.input.union.plan.sourceManifestSha256,
    changedProducts:plan.batches.reduce((n,b)=>n+b.length,0),tables:D1_RECOVERY_TABLES.map(table=>({table,rows:final.rows[table].length,sha256:digest(final.rows[table])})),
    barrierVerified:false as const,publicationEmitted:false as const,vectorWorkEmitted:0};
}
