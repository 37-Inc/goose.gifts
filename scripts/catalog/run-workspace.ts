import { constants } from 'node:fs';
import { lstat, realpath, mkdir, open, link, unlink, readdir, rename } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, parse, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertProtectedDestination } from './export-postgres.ts';
import { canonicalJson, sha256 } from './migration.ts';
import { explicitMaintenanceTime } from './maintenance-state.ts';
import { mutationFenceQuery } from '../../lib/catalog/mutation-fence.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import { encodeBuildRequest } from '../../lib/catalog/build-requests.ts';
import type { CatalogBuildClaim, ActivationPermit } from '../../lib/catalog/build-requests.ts';
import type { PublicationClaim, PublicationIntent } from '../../lib/catalog/publication.ts';
import type { ProviderReceipt } from './provider-evidence.ts';

type Json = null | boolean | number | string | Json[] | { [key:string]:Json };
type Kind = ProviderReceipt['kind'] | 'phase' | 'publication' | 'checkpoint';
export interface ArtifactRef { sha256:string; reference:string }
export interface WorkspaceScope {
  environment:'staging'|'production'; accountId:string; databaseId:string; databaseName:string; workerName:string; indexName:string;
}
export interface RetentionPolicy {
  reviewReference:string;
  rules:Record<Kind,{maxAgeMs:number;notAfter:string}>;
}
export interface PublicationControl {
  schemaVersion:1; configSha256:string; requestId:string; runReference:string;
  stage:'claimed'|'built'|'uploading'|'uploaded'|'activating'|'published';
  build:CatalogBuildClaim; publication:PublicationClaim|null; intent:PublicationIntent|null; permit:ActivationPermit|null;
  vectorPlan:{catalogRevision:string;planSha256:string;ids:string[]}; packageSha256:string|null;
  uploadMarker:string; versionReference:string|null; deploymentMarker:string; deploymentId:string|null;
  receiptSha256?:string;
}
export interface WorkspaceControl { publication?:PublicationControl }
export interface WorkspaceCheckpoint {
  phase:string; owner:MutationOwner|null; state:Json; pins:Record<string,ArtifactRef>;
  phaseComplete:ArtifactRef|null; control?:WorkspaceControl;
}
export type CheckpointControl = Omit<WorkspaceCheckpoint,'state'>;
export interface BudgetTotals {
  httpRequests:number; sqlStatements:number; knownRowsRead:number; knownRowsWritten:number; unconfirmedRequests:number;
}
export interface BudgetReservation { id:string; requestSha256:string; units:{httpRequests:number;sqlStatements:number} }
export type BudgetSettlement = {status:'known';usage:{rowsRead:number;rowsWritten:number}} | {status:'unknown';usage:null};
export interface RunWorkspaceOptions {
  /** Shared PRIVATE root, not the per-run directory. No implicit default. */
  directory:string; repository:string; mode:'create'|'resume'; runId:string; configSha256:string; codeSha:string;
  scope:WorkspaceScope; retention:RetentionPolicy; budgetCaps:{httpRequests:number;sqlStatements:number};
  expectedManifestSha256?:string; now?:()=>string;
}
export interface WorkspaceManifest {
  schemaVersion:1; runId:string; configSha256:string; codeSha:string; scope:WorkspaceScope;
  retention:RetentionPolicy; budgetCaps:{httpRequests:number;sqlStatements:number}; createdAt:string;
}
type Stored = { schemaVersion:1; sha256:string; kind:Kind; observedAt:string; expiresAt:string; policySha256:string; value:Json };
type CheckpointView = {sha256:string;checkpoint:CheckpointControl};
type Event = {type:'artifact';ref:ArtifactRef} | {type:'checkpoint';ref:ArtifactRef;previous:string|null;control:CheckpointControl}
  | {type:'control';sha256:string;previous:string;control:CheckpointControl}
  | {type:'reserve';reservation:BudgetReservation} | {type:'settle';id:string;settlement:BudgetSettlement};
type RecordFile = {schemaVersion:1;sequence:number;parent:string|null;event:Event};
type State = {head:string|null;count:number;bytes:number;checkpoint:CheckpointView|null;body:ArtifactRef|null;previous:string|null;totals:BudgetTotals;
  refs:Map<string,ArtifactRef>;reservations:Map<string,{reservation:BudgetReservation;settlement?:BudgetSettlement}>};
export interface WorkspaceStatus {
  directory:string;manifest:WorkspaceManifest;manifestSha256:string;checkpoint:CheckpointView|null;budget:BudgetTotals;
  expired:{reference:string;kind:Kind;expiresAt:string}[];
}
export interface RunWorkspace {
  readonly directory:string;readonly repository:string;readonly manifest:WorkspaceManifest;readonly manifestSha256:string;
  assertHeld():Promise<void>;assertScope(scope:WorkspaceScope):Promise<void>;
  putArtifact(value:unknown,options:{kind:'phase'|'publication';observedAt:string}):Promise<ArtifactRef>;
  readArtifact(ref:ArtifactRef):Promise<Json>;
  saveReceipt(input:Readonly<{sha256:string;receipt:ProviderReceipt}>):Promise<ArtifactRef>;
  readReceipt(ref:ArtifactRef):Promise<ProviderReceipt>;
  readCheckpoint(options?:{controlOnly?:false}):Promise<{sha256:string;checkpoint:WorkspaceCheckpoint}|null>;
  readCheckpoint(options:{controlOnly:true}):Promise<CheckpointView|null>;
  writeCheckpoint(expectedSha256:string|null,checkpoint:WorkspaceCheckpoint):Promise<{sha256:string;checkpoint:WorkspaceCheckpoint}>;
  /** Only records reconciliation of an ALREADY dispatched activation. Cannot
   * introduce new claims/content or renew any artifact's original deadline. */
  writeControlCheckpoint(expectedSha256:string,input:{phase:'attention'|'published';owner:MutationOwner|null;control:WorkspaceControl}):Promise<CheckpointView>;
  reserveBudget(input:BudgetReservation):Promise<void>;settleBudget(id:string,input:BudgetSettlement):Promise<void>;
  budget():Promise<BudgetTotals>;close():Promise<void>;
}
const HASH=/^[a-f0-9]{64}$/;const KEY=/^[A-Za-z0-9._-]{1,100}$/;const REF=/^[A-Za-z0-9._:/-]{1,200}$/;
const KINDS:Kind[]=['amazon-observation','embedding-response','phase','publication','checkpoint'];
const MAX_JSON=512*1024, MAX_EVENTS=20_000, MAX_JOURNAL=32*1024*1024;
function fail(code:string):never {throw new Error(`run_workspace_${code}`);}
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const hash=(value:unknown)=>typeof value==='string'&&HASH.test(value);
const key=(value:unknown)=>typeof value==='string'&&KEY.test(value)&&value!=='.'&&value!=='..';
const refString=(value:unknown)=>typeof value==='string'&&REF.test(value);
const integer=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
const exact=(value:unknown,keys:string[])=>!!value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function json(value:unknown,max=MAX_JSON):Json {
  const encoded=canonicalJson(value);if(Buffer.byteLength(encoded)>max)fail('bytes');return JSON.parse(encoded);
}
function time(value:unknown):string {try{return explicitMaintenanceTime(value);}catch{return fail('time');}}
function scope(value:WorkspaceScope) {
  if(!exact(value,['environment','accountId','databaseId','databaseName','workerName','indexName'])
    ||!['staging','production'].includes(value.environment)||![value.accountId,value.databaseId,value.databaseName,value.workerName,value.indexName].every(key))fail('scope');
}
function options(value:RunWorkspaceOptions) {
  if(!value||!key(value.runId)||!hash(value.configSha256)||typeof value.codeSha!=='string'||!/^[a-f0-9]{40}$/.test(value.codeSha)
    ||!['create','resume'].includes(value.mode)||value.expectedManifestSha256!==undefined&&!hash(value.expectedManifestSha256))fail('configuration');
  scope(value.scope);
  if(!exact(value.retention,['reviewReference','rules'])||!refString(value.retention.reviewReference)
    ||!exact(value.retention.rules,KINDS))fail('retention_policy');
  for(const kind of KINDS){const rule=value.retention.rules[kind];
    if(!exact(rule,['maxAgeMs','notAfter'])||!integer(rule.maxAgeMs)||rule.maxAgeMs<1)fail('retention_policy');time(rule.notAfter);}
  if(!exact(value.budgetCaps,['httpRequests','sqlStatements'])||!Object.values(value.budgetCaps).every(integer))fail('budget_caps');
}
function artifactRef(value:ArtifactRef) {
  if(!exact(value,['sha256','reference'])||!hash(value.sha256)||value.reference!==`objects/${value.sha256}.json`)fail('reference');
}
function intent(value:PublicationIntent) {
  if(!exact(value,['releaseId','codeSha','catalogRevision','vectorSyncWatermark','priorReleaseId','nextExpiry','catalogSnapshotSha256','manifestSha256'])
    ||!key(value.releaseId)||!key(value.catalogRevision)||!/^[a-f0-9]{40}$/.test(value.codeSha)||!integer(value.vectorSyncWatermark)
    ||value.priorReleaseId!==null&&!key(value.priorReleaseId)||!hash(value.catalogSnapshotSha256)||!hash(value.manifestSha256))fail('control');
  if(value.nextExpiry!==null)time(value.nextExpiry);
}
function owner(value:MutationOwner) {
  if(!exact(value,['environment','indexName','token','generation','epoch','phase','ownerReference','operationKey','capturedAt']))fail('owner');
  mutationFenceQuery(value,[value.phase]);
}
function control(value:WorkspaceControl|undefined) {
  if(value===undefined)return;
  if(!exact(value,value.publication===undefined?[]:['publication']))fail('control');
  if(!value.publication)return;
  json(value,8192);const p=value.publication;
  if(!exact(p,['schemaVersion','configSha256','requestId','runReference','stage','build','publication','intent','permit','vectorPlan','packageSha256','uploadMarker','versionReference','deploymentMarker','deploymentId',...(p.receiptSha256===undefined?[]:['receiptSha256'])])
    ||p.schemaVersion!==1||!hash(p.configSha256)||!key(p.requestId)||!refString(p.runReference)
    ||!['claimed','built','uploading','uploaded','activating','published'].includes(p.stage)
    ||!exact(p.build,['requestId','token','runReference','leaseUntil','request'])||!key(p.build.requestId)||!key(p.build.token)||!refString(p.build.runReference))fail('control');
  time(p.build.leaseUntil);encodeBuildRequest(p.build.request);
  if(p.intent!==null)intent(p.intent);
  if(p.publication!==null){if(!exact(p.publication,['intentId','token','leaseUntil','intent'])||!key(p.publication.intentId)||!key(p.publication.token))fail('control');
    time(p.publication.leaseUntil);intent(p.publication.intent);}
  if(p.permit!==null){const q=p.permit;if(!exact(q,q.mutationOwner?['requestId','token','runReference','releaseId','versionReference','mutationOwner']:['requestId','token','runReference','releaseId','versionReference'])
      ||![q.requestId,q.token,q.releaseId].every(key)||![q.runReference,q.versionReference].every(refString))fail('control');
    if(q.mutationOwner)owner(q.mutationOwner);}
  if(!exact(p.vectorPlan,['catalogRevision','planSha256','ids'])||!key(p.vectorPlan.catalogRevision)||!hash(p.vectorPlan.planSha256)
    ||!Array.isArray(p.vectorPlan.ids)||p.vectorPlan.ids.length>100||p.vectorPlan.ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))
    ||new Set(p.vectorPlan.ids).size!==p.vectorPlan.ids.length||p.packageSha256!==null&&!hash(p.packageSha256)
    ||![p.uploadMarker,p.deploymentMarker].every(refString)||[p.versionReference,p.deploymentId].some(v=>v!==null&&!refString(v))
    ||p.receiptSha256!==undefined&&!hash(p.receiptSha256))fail('control');
  if(p.requestId!==p.build.requestId||p.runReference!==p.build.runReference
    ||p.publication&&p.intent&&!same(p.publication.intent,p.intent)
    ||p.permit&&(p.permit.requestId!==p.requestId||p.permit.token!==p.build.token||p.permit.runReference!==p.runReference
      ||p.permit.releaseId!==p.intent?.releaseId||p.permit.versionReference!==p.versionReference))fail('control');
}
function checkpoint(value:WorkspaceCheckpoint) {
  if(!exact(value,value.control===undefined?['phase','owner','state','pins','phaseComplete']:['phase','owner','state','pins','phaseComplete','control'])||!key(value.phase))fail('checkpoint');
  json(value);if(value.owner!==null)owner(value.owner);
  if(!value.pins||typeof value.pins!=='object'||Array.isArray(value.pins)||Object.keys(value.pins).length>100)fail('pins');
  for(const [label,ref]of Object.entries(value.pins)){if(!key(label))fail('pins');artifactRef(ref);}
  if(value.phaseComplete!==null)artifactRef(value.phaseComplete);control(value.control);
}
function reservation(value:BudgetReservation) {
  if(!exact(value,['id','requestSha256','units'])||!key(value.id)||!hash(value.requestSha256)||!exact(value.units,['httpRequests','sqlStatements'])
    ||!Object.values(value.units).every(integer)||value.units.httpRequests!==1||value.units.sqlStatements>50)fail('budget_reservation');
}
function settlement(value:BudgetSettlement) {
  if(!exact(value,['status','usage'])||!['known','unknown'].includes(value.status)||value.status==='unknown'&&value.usage!==null
    ||value.status==='known'&&(!exact(value.usage,['rowsRead','rowsWritten'])||!Object.values(value.usage).every(integer)))fail('budget_settlement');
}
function totals(state:State):BudgetTotals {
  const result={...state.totals};
  if(!Object.values(result).every(integer))fail('budget_overflow');return result;
}
async function pathWithoutLinks(path:string) {
  if(!isAbsolute(path)||normalize(path)!==path||path.endsWith(sep)||path.includes('\0'))fail('path');
  const parts=path.slice(parse(path).root.length).split(sep);let current=parse(path).root;
  for(const part of parts){current=join(current,part);try{if((await lstat(current)).isSymbolicLink())fail('symlink');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
async function protectedStat(path:string,directory:boolean) {
  const s=await lstat(path);if(s.isSymbolicLink()||(directory?!s.isDirectory():!s.isFile())||s.uid!==process.getuid?.()
    ||(s.mode&0o777)!==(directory?0o700:0o600)||!directory&&s.nlink!==1)fail('permissions');return s;
}
async function syncDirectory(path:string) {const fd=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await fd.sync();}finally{await fd.close();}}
async function privateDirectory(path:string,create:boolean) {
  if(create){try{await mkdir(path,{mode:0o700});await syncDirectory(dirname(path));}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}
  return protectedStat(path,true);
}
async function readBytes(path:string,max=MAX_JSON*2) {
  const before=await protectedStat(path,false);if(before.size>max)fail('bytes');
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{
    const stat=await fd.stat();if(stat.ino!==before.ino||stat.dev!==before.dev||stat.nlink!==1)fail('file_changed');
    // Bound allocation/read even if a same-UID process grows the file after stat.
    const buffer=Buffer.alloc(before.size+1);let size=0;
    while(size<buffer.length){const result=await fd.read(buffer,size,buffer.length-size,null);if(!result.bytesRead)break;size+=result.bytesRead;}
    const bytes=buffer.subarray(0,size),after=await protectedStat(path,false);
    if(bytes.length!==before.size||after.ino!==before.ino||after.dev!==before.dev||after.size!==before.size)fail('file_changed');return bytes;
  }finally{await fd.close();}
}
async function readJson(path:string,max?:number):Promise<unknown> {
  const bytes=await readBytes(path,max);let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{return fail('json');}
  if(!bytes.equals(Buffer.from(`${canonicalJson(value)}\n`)))fail('noncanonical');return value;
}
/** File and directory fsync + no-overwrite link publication + independent readback.
 * An interrupted link/unlink may leave nlink=2: reopening refuses it, never guesses
 * success or repairs a lock/archive automatically. Private same-UID tampering is
 * detected where possible, not a replacement for OS account isolation. */
async function immutable(path:string,value:unknown) {
  const bytes=Buffer.from(`${canonicalJson(value)}\n`);if(bytes.length>MAX_JSON*2)fail('bytes');
  try{if(!(await readBytes(path)).equals(bytes))fail('immutable_conflict');return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const temp=join(dirname(path),`.pending-${randomUUID()}`);const fd=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
  if(!(await readBytes(temp)).equals(bytes))fail('write_readback');
  try{await link(temp,path);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  await syncDirectory(dirname(path));await unlink(temp);await syncDirectory(dirname(path));
  if(!(await readBytes(path)).equals(bytes))fail('write_readback');
}
async function replaceHead(directory:string,expected:{sequence:number;sha256:string|null},next:{sequence:number;sha256:string|null}) {
  const path=join(directory,'head.json');if(!same(await readJson(path),expected))fail('head_changed');
  const temp=join(directory,`.pending-${randomUUID()}`);await immutable(temp,next);
  if(!same(await readJson(path),expected))fail('head_changed');
  await rename(temp,path);await syncDirectory(directory);if(!same(await readJson(path),next))fail('head_readback');
}
function refFor(value:unknown):ArtifactRef {const digest=sha256(canonicalJson(value));return{sha256:digest,reference:`objects/${digest}.json`};}
function stored(value:unknown,kind:Kind,observedAt:string,manifest:WorkspaceManifest):Stored {
  const original=time(observedAt);const rule=manifest.retention.rules[kind];
  const expiresAt=new Date(Math.min(Date.parse(original)+rule.maxAgeMs,Date.parse(rule.notAfter))).toISOString();
  if(!Number.isFinite(Date.parse(expiresAt)))fail('retention_policy');
  return{schemaVersion:1,sha256:refFor(value).sha256,kind,observedAt:original,expiresAt,policySha256:sha256(canonicalJson(manifest.retention)),value:json(value)};
}
async function loadStored(directory:string,ref:ArtifactRef,manifest:WorkspaceManifest):Promise<Stored> {
  artifactRef(ref);const value=await readJson(join(directory,ref.reference)) as Stored;
  if(!exact(value,['schemaVersion','sha256','kind','observedAt','expiresAt','policySha256','value'])||value.schemaVersion!==1
    ||!KINDS.includes(value.kind)||!same(value,stored(value.value,value.kind,value.observedAt,manifest))||value.sha256!==ref.sha256)fail('artifact_hash');
  return value;
}
function fresh(value:Stored,now:string) {if(Date.parse(value.observedAt)>Date.parse(now)||Date.parse(value.expiresAt)<=Date.parse(now))fail('expired');}
const empty=():State=>({head:null,count:0,bytes:0,checkpoint:null,body:null,previous:null,
  totals:{httpRequests:0,sqlStatements:0,knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:0},refs:new Map(),reservations:new Map()});
function apply(state:State,event:Event,dry=false) {
  if(event.type==='artifact'){if(!exact(event,['type','ref']))fail('event');artifactRef(event.ref);if(!dry)state.refs.set(event.ref.sha256,event.ref);}
  else if(event.type==='checkpoint'){
    if(!exact(event,['type','ref','previous','control'])||event.previous!==(state.checkpoint?.sha256||null))fail('checkpoint_cas');
    artifactRef(event.ref);checkpoint({...event.control,state:null});const old=state.checkpoint?.checkpoint;
    if(old){for(const [label,ref]of Object.entries(old.pins))if(!same(event.control.pins[label]||null,ref))fail('pin_rewrite');
      if(old.phaseComplete!==null&&!same(old.phaseComplete,event.control.phaseComplete))fail('phase_complete_rewrite');
      controlEvolution(old.control,event.control.control);}
    if(!dry){state.previous=event.previous;state.checkpoint={sha256:event.ref.sha256,checkpoint:event.control};state.body=event.ref;state.refs.set(event.ref.sha256,event.ref);}
  }else if(event.type==='control'){
    if(!exact(event,['type','sha256','previous','control'])||!state.checkpoint||event.previous!==state.checkpoint.sha256
      ||event.sha256!==sha256(canonicalJson({previous:event.previous,control:event.control})))fail('control_cas');
    validateControlTransition(state.checkpoint.checkpoint,event.control);
    if(!dry){state.previous=event.previous;state.checkpoint={sha256:event.sha256,checkpoint:event.control};}
  } else if(event.type==='reserve'){
    if(!exact(event,['type','reservation']))fail('event');reservation(event.reservation);
    if(state.reservations.has(event.reservation.id))fail('budget_duplicate');
    if(!dry){state.reservations.set(event.reservation.id,{reservation:event.reservation});state.totals.httpRequests+=event.reservation.units.httpRequests;
      state.totals.sqlStatements+=event.reservation.units.sqlStatements;state.totals.unconfirmedRequests++;}
  }else if(event.type==='settle'){
    if(!exact(event,['type','id','settlement']))fail('event');settlement(event.settlement);const r=state.reservations.get(event.id);
    if(!r||r.settlement)fail('budget_settlement');
    if(event.settlement.status==='known'&&(!integer(state.totals.knownRowsRead+event.settlement.usage.rowsRead)
      ||!integer(state.totals.knownRowsWritten+event.settlement.usage.rowsWritten)))fail('budget_overflow');
    if(!dry){r.settlement=event.settlement;if(event.settlement.status==='known'){state.totals.knownRowsRead+=event.settlement.usage.rowsRead;
      state.totals.knownRowsWritten+=event.settlement.usage.rowsWritten;state.totals.unconfirmedRequests--;}}
  }else fail('event');
}
function validateControlTransition(old:CheckpointControl,next:CheckpointControl) {
  checkpoint({...next,state:null});
  if(!['attention','published'].includes(next.phase)||!same(old.pins,next.pins)||!same(old.phaseComplete,next.phaseComplete)
    ||!old.control?.publication||!next.control?.publication)fail('control_reconciliation');
  const prior=old.control.publication,current=next.control.publication;
  const recoveredPermit=prior.permit===null&&prior.stage==='activating'&&current.permit;
  if(recoveredPermit){
    const p=current.permit!;
    if(p.requestId!==prior.build.requestId||p.token!==prior.build.token||p.runReference!==prior.build.runReference
      ||p.releaseId!==prior.intent?.releaseId||p.versionReference!==prior.versionReference)fail('control_reconciliation');
    const a=old.owner,b=p.mutationOwner;
    if(!a||!b||a.phase!=='freezing'||b.phase!=='activating'||!same({...a,phase:'activating'},b)||!same(next.owner,b))fail('control_reconciliation');
  }
  if(prior.stage!=='activating'&&prior.stage!=='published'||current.stage!=='published'&&current.stage!==prior.stage
    ||!same({...prior,stage:current.stage,deploymentId:current.deploymentId,...(recoveredPermit?{permit:current.permit}:{}),...(current.receiptSha256?{receiptSha256:current.receiptSha256}:{})},current)
    ||prior.deploymentId!==null&&prior.deploymentId!==current.deploymentId)fail('control_reconciliation');
  if(prior.receiptSha256!==undefined&&prior.receiptSha256!==current.receiptSha256)fail('control_reconciliation');
}
function controlEvolution(old:WorkspaceControl|undefined,next:WorkspaceControl|undefined) {
  const a=old?.publication,b=next?.publication;if(!a)return;if(!b)fail('control_rewrite');
  for(const field of ['schemaVersion','configSha256','requestId','runReference','build','vectorPlan','uploadMarker','deploymentMarker'] as const)
    if(!same(a[field],b[field]))fail('control_rewrite');
  for(const field of ['packageSha256','publication','intent','permit','versionReference','deploymentId','receiptSha256'] as const)
    if(a[field]!==null&&a[field]!==undefined&&!same(a[field],b[field]??null))fail('control_rewrite');
  const stages=['claimed','built','uploading','uploaded','activating','published'];if(stages.indexOf(b.stage)<stages.indexOf(a.stage))fail('control_rewrite');
}
function bindCheckpoint(value:CheckpointControl,manifest:WorkspaceManifest) {
  if(value.owner&&(value.owner.environment!==manifest.scope.environment||value.owner.indexName!==manifest.scope.indexName))fail('owner_scope');
  const p=value.control?.publication;if(p&&(p.build.request.environment!==manifest.scope.environment
    ||p.build.request.codeSha!==manifest.codeSha||p.intent&&p.intent.codeSha!==manifest.codeSha))fail('control_scope');
}
async function loadState(directory:string,manifest:WorkspaceManifest):Promise<State> {
  const entries=await readdir(join(directory,'events'));if(entries.length>MAX_EVENTS+32)fail('entries');
  if((await readdir(join(directory,'objects'))).length>MAX_EVENTS)fail('entries');
  const files=entries.filter(name=>!name.startsWith('.pending-')).sort();
  if(files.length>MAX_EVENTS)fail('entries');const state=empty();
  for(const filename of files){
    if(!/^\d{6}\.[a-f0-9]{64}\.json$/.test(filename))fail('journal_name');
    state.bytes+=(await protectedStat(join(directory,'events',filename),false)).size;if(state.bytes>MAX_JOURNAL)fail('journal_bytes');
    const record=await readJson(join(directory,'events',filename)) as RecordFile;const digest=sha256(canonicalJson(record));
    if(!exact(record,['schemaVersion','sequence','parent','event'])||record.schemaVersion!==1||record.sequence!==state.count+1||record.parent!==state.head
      ||filename!==`${String(record.sequence).padStart(6,'0')}.${digest}.json`)fail('journal_chain');
    if(record.event.type==='checkpoint'||record.event.type==='control')bindCheckpoint(record.event.control,manifest);
    if(record.event.type==='checkpoint'){
      const sealed=await loadStored(directory,record.event.ref,manifest);if(sealed.kind!=='checkpoint')fail('checkpoint_body');
      checkpoint(sealed.value as unknown as WorkspaceCheckpoint);
      const {state:unused,...view}=sealed.value as unknown as WorkspaceCheckpoint;void unused;
      if(!same(view,record.event.control))fail('checkpoint_body');
    }
    apply(state,record.event);state.count++;state.head=digest;
  }
  if(!same(await readJson(join(directory,'head.json')),{sequence:state.count,sha256:state.head}))fail('journal_head');
  const usage=totals(state);if(usage.httpRequests>manifest.budgetCaps.httpRequests||usage.sqlStatements>manifest.budgetCaps.sqlStatements)fail('budget_exceeded');
  return state;
}
function receipt(value:ProviderReceipt) {
  if(!value||value.schemaVersion!==1||!['amazon-observation','embedding-response'].includes(value.kind)||!Array.isArray(value.products)||value.products.length>20)fail('receipt');
  const amazon=value.kind==='amazon-observation';
  if(!exact(value,amazon?['schemaVersion','kind','operation','observedAt','products','returnedIds',...(value.requestedIds===undefined?[]:['requestedIds'])]
    :['schemaVersion','kind','observedAt','model','products']))fail('receipt');
  time(value.observedAt);
  if(amazon){if(!['getItems','searchItems'].includes(value.operation)||![value.returnedIds,...(value.requestedIds?[value.requestedIds]:[])].every(ids=>Array.isArray(ids)&&ids.length<=10
      &&ids.every(id=>typeof id==='string'&&/^[A-Z0-9]{10}$/.test(id))&&new Set(ids).size===ids.length)||value.requestedIds&&value.operation!=='getItems')fail('receipt');}
  else if(value.model!=='text-embedding-3-small')fail('receipt');
  // Raw HTTP headers, credentials and arbitrary provider response envelopes are
  // not accepted: only the existing reviewed, bounded semantic receipt kinds.
  for(const product of value.products){if(!exact(product,amazon?['id','availabilityStatus','sourceFactsHash','snapshot']:['id','sourceFactsHash','text','nativeBase64','vectorBytesSha256'])
    ||typeof product.id!=='string'||!/^[A-Z0-9]{10}$/.test(product.id)||!hash(product.sourceFactsHash))fail('receipt');}
  json(value);
}
async function location(input:RunWorkspaceOptions,create:boolean) {
  options(input);await pathWithoutLinks(input.directory);await assertProtectedDestination(input.directory,input.repository);
  await protectedStat(dirname(input.directory),true);
  await privateDirectory(input.directory,create);for(const name of ['runs','locks'])await privateDirectory(join(input.directory,name),create);
  const directory=join(input.directory,'runs',input.runId);if(create){await mkdir(directory,{mode:0o700});await syncDirectory(dirname(directory));}
  await privateDirectory(directory,false);for(const name of ['objects','events'])await privateDirectory(join(directory,name),create);
  return directory;
}
async function readManifest(directory:string,input:RunWorkspaceOptions) {
  const manifest=await readJson(join(directory,'manifest.json')) as WorkspaceManifest;
  if(!exact(manifest,['schemaVersion','runId','configSha256','codeSha','scope','retention','budgetCaps','createdAt'])||manifest.schemaVersion!==1)fail('manifest');
  const expected={schemaVersion:1,runId:input.runId,configSha256:input.configSha256,codeSha:input.codeSha,scope:input.scope,retention:input.retention,budgetCaps:input.budgetCaps,createdAt:manifest.createdAt};
  time(manifest.createdAt);const digest=sha256(canonicalJson(manifest));
  if(!same(manifest,expected)||input.expectedManifestSha256!==undefined&&input.expectedManifestSha256!==digest)fail('manifest_mismatch');
  return{manifest,manifestSha256:digest};
}
async function expired(directory:string,state:State,manifest:WorkspaceManifest,now:string) {
  const result:WorkspaceStatus['expired']=[];
  for(const ref of state.refs.values()){const v=await loadStored(directory,ref,manifest);
    if(Date.parse(v.observedAt)>Date.parse(now)||Date.parse(v.expiresAt)<=Date.parse(now))result.push({reference:ref.reference,kind:v.kind,expiresAt:v.expiresAt});}
  return result;
}
/** Read-only metadata/status. Never acquires/removes a lock or returns artifact
 * bodies/state. Expired content does not hide identities needed to reconcile an
 * already dispatched activation. This is NOT permission to build/publish anew. */
export async function readRunWorkspace(input:RunWorkspaceOptions):Promise<WorkspaceStatus> {
  input={...input,scope:structuredClone(input.scope),retention:structuredClone(input.retention),budgetCaps:structuredClone(input.budgetCaps)};
  const directory=await location({...input,mode:'resume'},false);const info=await readManifest(directory,input);
  const before=(await readdir(join(directory,'events'))).sort();const state=await loadState(directory,info.manifest);
  const expiredRefs=await expired(directory,state,info.manifest,time((input.now||(()=>new Date().toISOString()))()));
  if(!same(before,(await readdir(join(directory,'events'))).sort()))fail('concurrent_read');
  return{directory,...info,checkpoint:state.checkpoint,budget:totals(state),expired:expiredRefs};
}
/** Host-local resource locks (D1 + Worker + build checkout), sorted to avoid lock-order
 * deadlocks across run IDs. No PID/age takeover, heartbeat, provider credential,
 * or claim of cross-host authority: callers still need the exact D1 owner. */
export async function openRunWorkspace(input:RunWorkspaceOptions):Promise<RunWorkspace> {
  input={...input,scope:structuredClone(input.scope),retention:structuredClone(input.retention),budgetCaps:structuredClone(input.budgetCaps)};
  options(input);await pathWithoutLinks(input.directory);await assertProtectedDestination(input.directory,input.repository);
  await protectedStat(dirname(input.directory),true);
  const repository=await realpath(input.repository);
  await privateDirectory(input.directory,true);await privateDirectory(join(input.directory,'locks'),true);
  const resources=[{accountId:input.scope.accountId,environment:input.scope.environment,databaseId:input.scope.databaseId},
    {accountId:input.scope.accountId,environment:input.scope.environment,workerName:input.scope.workerName},
    {sourceRoot:repository}];
  const locks:{path:string;ino:number;dev:number;body:unknown}[]=[];const token=randomUUID();
  try{
    for(const resource of resources.map(r=>({key:sha256(canonicalJson(r)),resource:r})).sort((a,b)=>a.key.localeCompare(b.key))){
      const path=join(input.directory,'locks',`${resource.key}.lock`);let fd;
      try{fd=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')fail('locked');throw error;}
      const body={schemaVersion:1,token,runId:input.runId,resource:resource.resource};
      try{await fd.writeFile(`${canonicalJson(body)}\n`);await fd.sync();const s=await fd.stat();locks.push({path,ino:s.ino,dev:s.dev,body});}finally{await fd.close();}
      await syncDirectory(dirname(path));
    }
    const directory=await location(input,input.mode==='create');
    if(input.mode==='create'){
      await immutable(join(directory,'manifest.json'),{schemaVersion:1,runId:input.runId,configSha256:input.configSha256,codeSha:input.codeSha,
        scope:input.scope,retention:input.retention,budgetCaps:input.budgetCaps,createdAt:time((input.now||(()=>new Date().toISOString()))())});
      await immutable(join(directory,'head.json'),{sequence:0,sha256:null});
    }
    const info=await readManifest(directory,input);const manifest=JSON.parse(canonicalJson(info.manifest)) as WorkspaceManifest;
    // Runtime freeze prevents accidental caller scope/policy mutation.
    const freeze=(v:unknown):void=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(manifest);
    const state=await loadState(directory,manifest);let closed=false,poisoned=false;let queue:Promise<unknown>=Promise.resolve();
    let usableUntil=Infinity,usableAfter=-Infinity;
    // Verify every registered body once on open; held-lock operations retain
    // immutable deadline metadata, not O(receipts × HTTP requests) body rescans.
    for(const ref of state.refs.values()){const v=await loadStored(directory,ref,manifest);usableUntil=Math.min(usableUntil,Date.parse(v.expiresAt));usableAfter=Math.max(usableAfter,Date.parse(v.observedAt));}
    const guards=await Promise.all([input.directory,join(input.directory,'runs'),join(input.directory,'locks'),directory,join(directory,'objects'),join(directory,'events')]
      .map(async path=>({path,stat:await protectedStat(path,true)})));
    async function assertHeld(){if(closed)fail('closed');await pathWithoutLinks(input.directory);
      for(const guard of guards){const s=await protectedStat(guard.path,true);if(s.ino!==guard.stat.ino||s.dev!==guard.stat.dev)fail('directory_changed');}
      for(const l of locks){const s=await protectedStat(l.path,false);if(s.ino!==l.ino||s.dev!==l.dev||!same(await readJson(l.path),l.body))fail('lock_lost');}}
    const serial=<T>(action:()=>Promise<T>):Promise<T>=>{const result=queue.then(async()=>{await assertHeld();if(poisoned)fail('journal_uncertain');return action();});queue=result.catch(()=>{});return result;};
    const now=()=>time((input.now||(()=>new Date().toISOString()))());
    async function usable(){const instant=Date.parse(now());if(usableUntil<=instant||usableAfter>instant)fail('expired');}
    async function append(event:Event){
      event=json(event) as unknown as Event;
      if(state.count>=MAX_EVENTS)fail('entries');const next={schemaVersion:1 as const,sequence:state.count+1,parent:state.head,event};
      // Validate the transition BEFORE publishing immutable journal bytes.
      apply(state,event,true);const digest=sha256(canonicalJson(next)),bytes=Buffer.byteLength(canonicalJson(next))+1;
      if(state.bytes+bytes>MAX_JOURNAL)fail('journal_bytes');
      try{await immutable(join(directory,'events',`${String(next.sequence).padStart(6,'0')}.${digest}.json`),next);
        await replaceHead(directory,{sequence:state.count,sha256:state.head},{sequence:next.sequence,sha256:digest});
      }catch(error){poisoned=true;throw error;}
      apply(state,event);state.count=next.sequence;state.head=digest;state.bytes+=bytes;
    }
    async function put(value:unknown,kind:Kind,observedAt:string,reuseOriginal=false){
      const ref=refFor(value);let sealed=stored(value,kind,observedAt,manifest);
      if(reuseOriginal)try{const previous=await loadStored(directory,ref,manifest);if(previous.kind!==kind)fail('kind');sealed=previous;}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      fresh(sealed,now());
      await immutable(join(directory,ref.reference),sealed);
      const readback=await loadStored(directory,ref,manifest);fresh(readback,now());
      if(!state.refs.has(ref.sha256))await append({type:'artifact',ref});usableUntil=Math.min(usableUntil,Date.parse(sealed.expiresAt));usableAfter=Math.max(usableAfter,Date.parse(sealed.observedAt));return structuredClone(ref);
    }
    async function read(ref:ArtifactRef){if(!state.refs.has(ref.sha256))fail('unregistered_artifact');const v=await loadStored(directory,ref,manifest);fresh(v,now());return v;}
    const api={directory,repository,manifest,manifestSha256:info.manifestSha256,assertHeld,
      assertScope:async(expected:WorkspaceScope)=>{await assertHeld();scope(expected);if(!same(manifest.scope,expected))fail('scope_mismatch');},
      putArtifact:(value:unknown,o:{kind:'phase'|'publication';observedAt:string})=>serial(async()=>{if(!o||!['phase','publication'].includes(o.kind))fail('kind');await usable();return put(json(value),o.kind,o.observedAt);}),
      readArtifact:(ref:ArtifactRef)=>serial(async()=>{const v=await read(ref);if(!['phase','publication'].includes(v.kind))fail('kind');return structuredClone(v.value);}),
      saveReceipt:(o:Readonly<{sha256:string;receipt:ProviderReceipt}>)=>serial(async()=>{receipt(o.receipt);if(o.sha256!==refFor(o.receipt).sha256)fail('receipt_hash');
        await usable();return put(o.receipt,o.receipt.kind,o.receipt.observedAt);}),
      readReceipt:(ref:ArtifactRef)=>serial(async()=>{const v=await read(ref);if(!['amazon-observation','embedding-response'].includes(v.kind))fail('kind');
        receipt(v.value as unknown as ProviderReceipt);return structuredClone(v.value) as unknown as ProviderReceipt;}),
      readCheckpoint:(o?:{controlOnly?:boolean})=>serial(async()=>{if(!state.checkpoint)return null;
        if(o?.controlOnly===true)return structuredClone(state.checkpoint);await usable();
        const v=await read(state.body!);
        if(v.kind!=='checkpoint')fail('kind');checkpoint(v.value as unknown as WorkspaceCheckpoint);
        const body=v.value as unknown as WorkspaceCheckpoint;
        return{sha256:state.checkpoint.sha256,checkpoint:{...structuredClone(body),...structuredClone(state.checkpoint.checkpoint)}};}),
      writeCheckpoint:(expected:string|null,value:WorkspaceCheckpoint)=>serial(async()=>{
        checkpoint(value);bindCheckpoint(value,manifest);await usable();const digest=refFor(value).sha256;
        if(state.checkpoint?.sha256===digest&&(state.previous===expected||expected===digest)){return{sha256:digest,checkpoint:structuredClone(value)};}
        if(expected!==(state.checkpoint?.sha256||null))fail('checkpoint_cas');
        for(const ref of [...Object.values(value.pins),...(value.phaseComplete?[value.phaseComplete]:[])])await read(ref);
        const {state:unused,...view}=value;void unused;
        // First validate immutable pins/phase-complete before writing the body.
        const event:Event={type:'checkpoint',ref:refFor(value),previous:expected,control:json(view) as unknown as CheckpointControl};apply(state,event,true);
        const ref=await put(value,'checkpoint',now(),true);await append({...event,ref});return{sha256:ref.sha256,checkpoint:structuredClone(value)};
      }),
      writeControlCheckpoint:(expected:string,value:{phase:'attention'|'published';owner:MutationOwner|null;control:WorkspaceControl})=>serial(async()=>{
        if(!exact(value,['phase','owner','control'])||!state.checkpoint)fail('control_reconciliation');
        const view={...state.checkpoint.checkpoint,...structuredClone(value)} as CheckpointControl;bindCheckpoint(view,manifest);
        const digest=sha256(canonicalJson({previous:expected,control:view}));
        if(state.checkpoint.sha256===digest&&state.previous===expected)return structuredClone(state.checkpoint);
        if(state.checkpoint.sha256!==expected)fail('checkpoint_cas');
        await append({type:'control',previous:expected,sha256:digest,control:view});return structuredClone(state.checkpoint!);
      }),
      reserveBudget:(value:BudgetReservation)=>serial(async()=>{reservation(value);const old=state.reservations.get(value.id);
        if(old){if(!same(old.reservation,value))fail('budget_replay');return;}const current=totals(state);
        if(current.httpRequests+value.units.httpRequests>manifest.budgetCaps.httpRequests||current.sqlStatements+value.units.sqlStatements>manifest.budgetCaps.sqlStatements)fail('budget_exceeded');
        await append({type:'reserve',reservation:json(value) as unknown as BudgetReservation});}),
      settleBudget:(id:string,value:BudgetSettlement)=>serial(async()=>{settlement(value);const old=state.reservations.get(id);if(!old)fail('budget_reservation_missing');
        if(old.settlement){if(!same(old.settlement,value))fail('budget_settlement_replay');return;}await append({type:'settle',id,settlement:json(value) as unknown as BudgetSettlement});}),
      budget:()=>serial(async()=>totals(state)),
      close:()=>serial(async()=>{for(const lock of [...locks].reverse()){await unlink(lock.path);await syncDirectory(dirname(lock.path));}closed=true;}),
    };
    return Object.freeze(api) as RunWorkspace;
  }catch(error){
    // Remove only locks whose exact inode AND token remain ours. Any uncertain
    // acquisition/crash residue remains blocking for explicit operator review.
    for(const l of locks.reverse())try{const s=await protectedStat(l.path,false);if(s.ino===l.ino&&s.dev===l.dev&&same(await readJson(l.path),l.body)){await unlink(l.path);await syncDirectory(dirname(l.path));}}catch{/* fail closed */}
    throw error;
  }
}
