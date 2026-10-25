/** One owner-reviewed catalog cleanup, not a second scheduler or merchant lane.
 * Source, accepted predecessor, authorization and SAME-run ledger are pinned.
 * Routine maintenance limits/cadence and all historical run charges stay intact. */
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './migration.ts';
import {resolveWranglerOAuth} from './check-cloudflare-runner.ts';
import {openRunWorkspace} from './run-workspace.ts';
import type {RunWorkspace,RunWorkspaceOptions,WorkspaceCheckpoint,WorkspaceScope} from './run-workspace.ts';
import {createCatalogD1MigrationRest} from './d1-write-rest.ts';
import {createOneTimeMigrationBudget,assertOneTimeMigrationBudget} from './one-time-migration-budget.ts';
import type {OneTimeMigrationBudget,MigrationAccountUsage} from './one-time-migration-budget.ts';
import {validateCatalogSnapshot} from '../../lib/catalog/snapshot.ts';
import {approvedCohortOperationKey} from '../../lib/catalog/freeze-approved-cohort.ts';
import type {ApprovedCohortRequest,ApprovedCohortRevision} from '../../lib/catalog/freeze-approved-cohort.ts';
import {claimMutationOwnership,readMutationOwner,releaseMutationOwnership} from '../../lib/catalog/mutation-fence.ts';
import type {MutationOwner} from '../../lib/catalog/mutation-fence.ts';
import type {CatalogD1} from '../../lib/catalog/storage/d1.ts';
import {OWNER_PUBLIC_DUPLICATE} from '../../lib/catalog/owner-base-review.ts';
import {captureHeldCatalogResolution,prepareHeldCatalogResolution,applyHeldCatalogResolution} from './held-catalog-resolution.ts';
import type {HeldCatalogResolution} from './held-catalog-resolution.ts';
import {prepareOwnedApprovedCohortPlan,settleOwnedApprovedCohortVectorProof} from './owned-vector-delivery.ts';
import {createPublishedApprovedCatalogSeal,catalogSuccessorBytes,approvedRevisionControl} from './approved-catalog-seal.ts';
import type {ApprovedCatalogSeal} from './approved-catalog-seal.ts';
import {accountedPublicationFetch,accountedPublicationReadFetch} from './publication-read-fetch.ts';
import {accountedPublicationUploadCommand} from './publication-upload-command.ts';
import {createVectorizeRestAdapters} from './vectorize-rest.ts';
import {executePublication,validatePublicationConfig} from './publish-release.ts';
import type {PublicationConfig} from './publish-release.ts';
import {createD1CatalogTelemetryStore} from './telemetry-d1.ts';
import {createEditorialSuccessorFiles,createEditorialSuccessorObserver,reconcileEditorialRecoverySuccessor} from './editorial-recovery-successor.ts';
import type {EditorialSuccessorPointer} from './editorial-recovery-successor.ts';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const BASE=join(homedir(),'.codex/private/goose-gifts-migration');
const HASH=/^[a-f0-9]{64}$/;
export const HELD_CLEANUP_LIMITS=Object.freeze({requests:9000,statements:22000,rowsRead:2000000,rowsWritten:50000});
const SCOPE:WorkspaceScope={environment:'production',accountId:'7f05a1dcb6e16f9c239564a0293bbe74',databaseId:'77b30f85-c57c-4acb-a0df-53368806c2a6',
  databaseName:'stupid-gifts-production',workerName:'stupid-gifts-production',indexName:'stupid-gifts-production'};
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const exact=(a:unknown,keys:string[])=>Boolean(a&&typeof a==='object'&&!Array.isArray(a)&&same(Object.keys(a).sort(),[...keys].sort()));
const digest=(a:unknown)=>sha256(canonicalJson(a));
function fail(code:string):never{throw Error('held_command_'+code);}
function canonicalPath(path:string){return typeof path==='string'&&resolve(path)===path;}
export interface HeldCommandConfig {
  schemaVersion:1;kind:'owner-held-catalog-publication';repository:string;codeSha:string;runId:string;
  workspaceDirectory:string;careDirectory:string;outputDirectory:string;
  baseline:{path:string;sha256:string};previous:EditorialSuccessorPointer;
  authorization:{path:string;sha256:string};publication:PublicationConfig;
  createdAt:string;cutoff:string;notAfter:string;
}
async function readPlan(w:RunWorkspace,ref:WorkspaceCheckpoint['pins'][string]){
  const plan=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await w.readBlob(ref))) as HeldCatalogResolution;
  const rebuilt=prepareHeldCatalogResolution({baseline:plan.baseline,rows:plan.capture,owner:plan.owner,reference:plan.reference,
    now:plan.createdAt,catalogRevision:plan.catalogRevision});
  if(!same(plan,rebuilt))fail('plan_digest');return plan;
}
type BlobStore=Pick<RunWorkspace,'putBlob'|'readBlob'>;
/** Retain the genuinely reviewed frozen evidence for lost-ACK resumes. The
 * control is the existing technical seal; source rows are bounded pages, not a
 * second revision/approval or an increase to any wire, row or blob limit. */
export async function storeHeldRevision(w:BlobStore,revision:ApprovedCohortRevision,observedAt:string){
  const put=(value:unknown)=>w.putBlob(Buffer.from(JSON.stringify(value)),{kind:'publication',observedAt});
  const source=[];let page:Record<string,unknown>[]=[],bytes=0;
  for(const row of revision.sourceRows){const size=Buffer.byteLength(JSON.stringify(row));if(size>128*1024)fail('revision_row_bounds');
    if(page.length&&bytes+size>8*1024*1024){source.push(await put(page));page=[];bytes=0;}
    page.push(row);bytes+=size;
  }
  if(page.length)source.push(await put(page));
  return put({schemaVersion:1,kind:'held-frozen-revision',control:await put(approvedRevisionControl(revision)),source});
}
export async function restoreHeldRevision(w:Pick<RunWorkspace,'readBlob'>,ref:WorkspaceCheckpoint['pins'][string],previous:ApprovedCohortRequest['previous']){
  const read=async<T,>(pin:WorkspaceCheckpoint['pins'][string]):Promise<T>=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await w.readBlob(pin)));
  const value=await read<{schemaVersion:number;kind:string;control:typeof ref;source:Array<typeof ref>}>(ref);
  if(!exact(value,['schemaVersion','kind','control','source'])||value.schemaVersion!==1||value.kind!=='held-frozen-revision'
    ||!Array.isArray(value.source)||value.source.length>128)fail('revision_control');
  const control=await read<ReturnType<typeof approvedRevisionControl>>(value.control),sourceRows=[];
  for(const pin of value.source){const page=await read<Record<string,unknown>[]>(pin);
    if(!Array.isArray(page)||Buffer.byteLength(JSON.stringify(page))>8*1024*1024+128*1024||page.some(row=>Buffer.byteLength(JSON.stringify(row))>128*1024))fail('revision_row_bounds');
    sourceRows.push(...page);
  }
  const request={...control.request.request,previous},revision={...control.revision,request,sourceRows};
  if(control.schemaVersion!==1||control.kind!=='approved-revision-control'||control.request.schemaVersion!==1||control.request.kind!=='approved-request-control'
    ||sourceRows.length!==control.sourceIds.length||!same(sourceRows.map(r=>String(r.public_id)),control.sourceIds)
    ||digest(request)!==control.request.requestSha256||digest(sourceRows)!==control.sourceRowsSha256||digest(revision)!==control.revisionSha256)fail('revision_digest');
  approvedCohortOperationKey(request);return revision;
}
/** Pure config check: an explicit one-time owner lane, never ambient defaults. */
export function validateHeldCommandConfig(input:HeldCommandConfig):HeldCommandConfig {
  const c=structuredClone(input);
  if(!exact(c,['schemaVersion','kind','repository','codeSha','runId','workspaceDirectory','careDirectory','outputDirectory','baseline','previous','authorization','publication','createdAt','cutoff','notAfter'])
    ||c.schemaVersion!==1||c.kind!=='owner-held-catalog-publication'||!/^[a-f0-9]{40}$/.test(c.codeSha)
    ||!/^owner-held-[a-zA-Z0-9._-]{1,50}$/.test(c.runId)||!['repository','workspaceDirectory','careDirectory','outputDirectory'].every(k=>canonicalPath(c[k as keyof HeldCommandConfig] as string))
    ||c.workspaceDirectory!==join(BASE,'weekly-runs')||c.careDirectory!==join(BASE,'daily-catalog-care')
    ||dirname(c.outputDirectory)!==c.careDirectory
    ||!['baseline','authorization'].every(k=>{const r=c[k as 'baseline'];return exact(r,['path','sha256'])&&canonicalPath(r.path)&&HASH.test(r.sha256);})
    ||!exact(c.previous,['control','versionReference','manifestSha256'])||!exact(c.previous.control,['path','sha256'])
    ||!canonicalPath(c.previous.control.path)||!HASH.test(c.previous.control.sha256)||!HASH.test(c.previous.manifestSha256)
    ||typeof c.previous.versionReference!=='string'||!/^[a-zA-Z0-9._:-]{1,200}$/.test(c.previous.versionReference)
    ||[c.createdAt,c.cutoff,c.notAfter].some(v=>typeof v!=='string'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)
    ||c.cutoff<=c.createdAt||Date.parse(c.cutoff)-Date.parse(c.createdAt)>6*3600000
    ||c.notAfter<c.cutoff||Date.parse(c.notAfter)-Date.parse(c.createdAt)>86400000)fail('configuration');
  const p=validatePublicationConfig(c.publication);
  if(p.environment!==SCOPE.environment||p.accountId!==SCOPE.accountId||p.database.id!==SCOPE.databaseId||p.database.name!==SCOPE.databaseName
    ||p.workerName!==SCOPE.workerName||p.indexName!==SCOPE.indexName||p.identityOrigin!=='https://stupid.gifts'||p.sourceMode!=='stupid-production'
    ||p.sourceRoot!==c.repository||p.codeSha!==c.codeSha||p.releaseId!==c.runId||!p.prior||p.prior.directory!==null
    ||p.prior.manifestSha256!==c.previous.manifestSha256||p.prior.versionReference!==c.previous.versionReference
    ||p.semanticSearch?.enabled!==false)fail('publication_configuration');
  return c;
}
async function privateRead<T>(file:string,expected?:string):Promise<{value:T;sha256:string}> {
  if(!canonicalPath(file)||await fs.realpath(file)!==file)fail('private_path');
  const s=await fs.lstat(file);
  if(!s.isFile()||s.uid!==process.getuid?.()||s.nlink!==1||(s.mode&0o777)!==0o600||s.size>32*1024*1024)fail('private_file');
  const h=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const a=await h.stat();if(a.ino!==s.ino||a.dev!==s.dev)fail('private_file');
    const bytes=await h.readFile(),b=await h.stat(),hash=createHash('sha256').update(bytes).digest('hex');
    if(b.size!==s.size||b.mtimeMs!==s.mtimeMs||b.ctimeMs!==s.ctimeMs||expected&&hash!==expected)fail('private_digest');
    return{value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as T,sha256:hash};
  }finally{await h.close();}
}
async function privateDirectory(path:string){
  const s=await fs.lstat(path);if(await fs.realpath(path)!==path||!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o700)fail('private_directory');
}
async function immutable(file:string,value:unknown){
  await privateDirectory(dirname(file));const bytes=canonicalJson(value)+'\n';let h;
  try{h=await fs.open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||(await privateRead(file)).sha256!==sha256(bytes))fail('immutable_changed');return sha256(bytes);}
  try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
  const dir=await fs.open(dirname(file),constants.O_RDONLY|constants.O_DIRECTORY);try{await dir.sync();}finally{await dir.close();}
  if((await privateRead(file)).sha256!==sha256(bytes))fail('immutable_readback');return sha256(bytes);
}
function clean(c:HeldCommandConfig){
  const git=(...args:string[])=>execFileSync('git',args,{cwd:c.repository,encoding:'utf8'}).trim();
  if(c.repository!==ROOT||git('rev-parse','HEAD')!==c.codeSha||git('status','--porcelain','--untracked-files=all'))fail('source');
}
async function prior(c:HeldCommandConfig){
  const stored=await privateRead<EditorialSuccessorPointer>(join(c.careDirectory,'last-success.json'));
  if(!same(stored.value,c.previous))fail('predecessor_pointer');
  const seal=(await privateRead<ApprovedCatalogSeal>(c.previous.control.path,c.previous.control.sha256)).value;
  catalogSuccessorBytes(seal);
  const baseline=validateCatalogSnapshot((await privateRead(c.baseline.path,c.baseline.sha256)).value);
  if(sha256(JSON.stringify(baseline)+'\n')!==seal.snapshotSha256||baseline.catalogRevision!==seal.projectionReceipt.catalog_revision
    ||seal.publication.releaseId!==c.publication.prior!.releaseId||baseline.products.length!==2359||baseline.heldProducts.length!==1024
    ||baseline.products.length+baseline.heldProducts.length!==3383)fail('predecessor_catalog');
  return{seal,baseline};
}
async function authorize(c:HeldCommandConfig){
  const a=(await privateRead<Record<string,unknown>>(c.authorization.path,c.authorization.sha256)).value;
  if(!exact(a,['schemaVersion','kind','approvedAt','reference','merchantRequests','modelRequests','nativeWrites','paidUpgrade'])
    ||a.schemaVersion!==1||a.kind!=='owner-held-catalog-resolution'||typeof a.reference!=='string'||!a.reference.trim()||a.reference.length>800
    ||typeof a.approvedAt!=='string'||!Number.isFinite(Date.parse(a.approvedAt))||new Date(String(a.approvedAt)).toISOString()!==a.approvedAt
    ||a.approvedAt>c.createdAt||a.merchantRequests!==0||a.modelRequests!==0||a.nativeWrites!==0||a.paidUpgrade!==false)fail('authorization');
  return String(a.reference)+' sha256:'+c.authorization.sha256;
}
function workspaceOptions(c:HeldCommandConfig,configSha256:string,mode:RunWorkspaceOptions['mode']):RunWorkspaceOptions{
  return{directory:c.workspaceDirectory,repository:c.repository,mode,runId:c.runId,codeSha:c.codeSha,configSha256,scope:SCOPE,
    retention:{reviewReference:'owner/held-catalog/'+c.authorization.sha256,rules:Object.fromEntries(
      ['amazon-observation','embedding-response','phase','publication','checkpoint'].map(k=>[k,{maxAgeMs:86400000,notAfter:c.notAfter}]))} as RunWorkspaceOptions['retention'],
    budgetCaps:{httpRequests:HELD_CLEANUP_LIMITS.requests,sqlStatements:HELD_CLEANUP_LIMITS.statements}};
}
async function accountUsage(w:RunWorkspace,token:string):Promise<MigrationAccountUsage>{
  const day=new Date().toISOString().slice(0,10),url='https://api.cloudflare.com/client/v4/graphql',id=randomUUID();
  const body=JSON.stringify({query:'query($a:string!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:$d,date_leq:$d}){sum{rowsRead rowsWritten}}}}}',variables:{a:SCOPE.accountId,d:day}});
  await w.reserveBudget({id,requestSha256:sha256(url+body),units:{httpRequests:1,sqlStatements:0}});
  let response;try{response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body});}
  catch{await w.settleBudget(id,{status:'unknown',usage:null});return fail('account_usage_unknown');}
  let value;try{const text=await response.text();if(Buffer.byteLength(text)>512*1024)throw Error('bounds');value=JSON.parse(text);}
  catch{await w.settleBudget(id,{status:'unknown',usage:null});return fail('account_usage_unknown');}
  await w.settleBudget(id,{status:'known',usage:{rowsRead:0,rowsWritten:0}});
  const accounts=value.data?.viewer?.accounts,groups=accounts?.[0]?.d1AnalyticsAdaptiveGroups;
  if(!response.ok||value.errors||accounts?.length!==1||!Array.isArray(groups)||groups.length>=10000
    ||groups.some(g=>!Number.isSafeInteger(g.sum?.rowsRead)||g.sum.rowsRead<0||!Number.isSafeInteger(g.sum?.rowsWritten)||g.sum.rowsWritten<0))fail('account_usage');
  return{accountId:SCOPE.accountId,utcDay:day,capturedAt:new Date().toISOString(),coverage:'account-wide',resources:[SCOPE.databaseId],
    rowsRead:groups.reduce((n,g)=>n+g.sum.rowsRead,0),rowsWritten:groups.reduce((n,g)=>n+g.sum.rowsWritten,0),evidenceSha256:digest(value)};
}
export function assertHeldFreeCapacity(profile:OneTimeMigrationBudget,usage:MigrationAccountUsage,spent:Awaited<ReturnType<RunWorkspace['budget']>>){
  const a=profile.input.ledgerAtObservation,o=profile.input.observations[0];
  const reads=Math.max(usage.rowsRead,o.rowsRead+spent.knownRowsRead-a.knownRowsRead);
  const writes=Math.max(usage.rowsWritten,o.rowsWritten+spent.knownRowsWritten-a.knownRowsWritten);
  if(usage.utcDay!==profile.createdAt.slice(0,10)||spent.unconfirmedRequests!==0
    ||reads+Math.max(0,profile.limits.reportedRowsRead-spent.knownRowsRead)+1500000>5000000
    ||writes+Math.max(0,profile.limits.reportedRowsWritten-spent.knownRowsWritten)+15000>100000)fail('free_capacity');
}
/** Release may have committed before a local/network acknowledgement was lost.
 * Only this writer's exact idle generation/epoch counts as its own release. */
export async function releaseHeldOwner(db:CatalogD1,writing:MutationOwner){
  const actual=await readMutationOwner(db,writing);
  if(actual){if(!same(actual,writing))fail('transition_owner');
    try{await releaseMutationOwnership(db,writing);}catch{if(await readMutationOwner(db,writing)!==null)fail('transition_release');}}
  const rows=(await db.prepare('SELECT phase,generation,mutation_epoch,external_pending FROM catalog_mutation_scopes WHERE environment=? AND index_name=?')
    .bind(writing.environment,writing.indexName).all()).results;
  if(rows.length!==1||rows[0].phase!=='idle'||rows[0].generation!==writing.generation||rows[0].mutation_epoch!==writing.epoch||rows[0].external_pending!==0)fail('transition_release');
}
/** Exact lost-ACK release recovery. An unrelated owner is never adopted/forced. */
export async function transitionHeldOwner(db:CatalogD1,writing:MutationOwner,runId:string,request:ApprovedCohortRequest){
  const operationKey=approvedCohortOperationKey(request),actual=await readMutationOwner(db,writing);
  if(actual?.phase==='freezing'){
    if(actual.ownerReference!==runId||actual.operationKey!==operationKey||actual.generation!==writing.generation+1||actual.epoch!==writing.epoch)fail('transition_owner');return actual;
  }
  await releaseHeldOwner(db,writing);
  const owner=await claimMutationOwnership(db,writing,{phase:'freezing',ownerReference:runId,operationKey});
  if(!owner||owner.generation!==writing.generation+1||owner.epoch!==writing.epoch)fail('transition_claim');return owner;
}
async function run(command:'prepare'|'publish',c:HeldCommandConfig,configSha256:string,reference:string,approval?:string){
  clean(c);if(new Date().toISOString()<c.createdAt)fail('not_before');await privateDirectory(c.careDirectory);await privateDirectory(c.workspaceDirectory);
  try{await fs.mkdir(c.outputDirectory,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  await privateDirectory(c.outputDirectory);
  let mode:RunWorkspaceOptions['mode']='resume';try{await fs.lstat(join(c.workspaceDirectory,'runs',c.runId));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;mode='create';}
  if(command==='publish'&&mode==='create')fail('prepare_required');
  const w=await openRunWorkspace(workspaceOptions(c,configSha256,mode));
  try{
    const token=await resolveWranglerOAuth(),observed=await accountUsage(w,token),profilePath=join(c.outputDirectory,'budget.json');
    const evidenceSha256=digest({configSha256,authorizationSha256:c.authorization.sha256});
    let budget:{profile:OneTimeMigrationBudget;sha256:string};
    try{budget=(await privateRead<typeof budget>(profilePath)).value;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
      if(command!=='prepare'||await w.readCheckpoint({controlOnly:true}))fail('budget_missing');
      budget=createOneTimeMigrationBudget({scope:{accountId:SCOPE.accountId,databaseId:SCOPE.databaseId,databaseName:SCOPE.databaseName},observations:[observed],
        ledgerAtObservation:await w.budget(),required:{...HELD_CLEANUP_LIMITS,evidenceSha256}});
      assertHeldFreeCapacity(budget.profile,observed,await w.budget());await immutable(profilePath,budget);
    }
    assertOneTimeMigrationBudget(budget.profile,budget.sha256);
    if(!same(budget.profile.input.required,{...HELD_CLEANUP_LIMITS,evidenceSha256})
      ||!same(budget.profile.input.scope,{accountId:SCOPE.accountId,databaseId:SCOPE.databaseId,databaseName:SCOPE.databaseName}))fail('budget_configuration');
    assertHeldFreeCapacity(budget.profile,observed,await w.budget());
    const initial=await w.budget(),db=await createCatalogD1MigrationRest({accountId:SCOPE.accountId,databaseId:SCOPE.databaseId,databaseName:SCOPE.databaseName,token,budget,ledger:initial,
      accounting:{scope:{accountId:SCOPE.accountId,databaseId:SCOPE.databaseId,databaseName:SCOPE.databaseName},initial,reserve:r=>w.reserveBudget(r),settle:(id,s)=>w.settleBudget(id,s)}});
    const scope={...SCOPE,identityOrigin:c.publication.identityOrigin},send=accountedPublicationFetch(w,fetch,scope),observation=accountedPublicationReadFetch(w,fetch,scope);
    const native=createVectorizeRestAdapters({environment:SCOPE.environment,indexName:SCOPE.indexName,accountId:SCOPE.accountId,token,fetch:send});
    const adapters={...native,dispatch:async()=>fail('native_write_forbidden')};
    let saved=await w.readCheckpoint(),cp=saved?.checkpoint;
    const save=async(patch:Partial<WorkspaceCheckpoint>)=>{saved=await w.writeCheckpoint(saved?.sha256??null,
      {...(cp??{phase:'capturing',owner:null,state:{},pins:{},phaseComplete:null,control:{}}),...patch});cp=saved.checkpoint;};
    const blob=async<T,>(ref:WorkspaceCheckpoint['pins'][string]):Promise<T>=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await w.readBlob(ref)));
    if(cp&&(cp.state as Record<string,unknown>).profileSha256!==budget.sha256)fail('budget_pin');
    if(!cp){
      if(new Date().toISOString()>=c.cutoff)fail('cutoff');const p=await prior(c);
      const rows=await db.batch([db.prepare('SELECT coalesce(max(sequence),0) n FROM vector_sync_outbox WHERE source_revision=?').bind(p.baseline.catalogRevision),
        db.prepare('SELECT coalesce(max(rowid),0) n FROM publication_receipts'),db.prepare('SELECT * FROM publication_receipts WHERE release_id=?').bind(p.seal.publication.releaseId),
        db.prepare('SELECT phase,external_pending FROM catalog_mutation_scopes WHERE environment=? AND index_name=?').bind(SCOPE.environment,SCOPE.indexName)]) as Array<{results:Record<string,unknown>[]} >;
      const live=await send(c.publication.identityOrigin+'/.well-known/catalog-release.json',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)}),identity=await live.json();
      if(rows[2].results.length!==1||digest(rows[2].results[0])!==p.seal.publication.receiptSha256||rows[3].results.length!==1
        ||rows[3].results[0].phase!=='idle'||rows[3].results[0].external_pending!==0||!live.ok
        ||identity.release_id!==p.seal.publication.releaseId||identity.catalog_snapshot_sha256!==p.seal.snapshotSha256||identity.manifest_sha256!==c.previous.manifestSha256)fail('prior_or_owner');
      const context={envelopeSha256:sha256(p.seal.envelopeJson+'\n'),snapshotSha256:p.seal.snapshotSha256,projectionSha256:p.seal.projectionReceipt.projection_sha256,
        sourceExportSha256:p.seal.projectionReceipt.source_export_sha256,vectorSyncWatermark:Number(rows[0].results[0].n),publicationReceiptWatermark:Number(rows[1].results[0].n),cutoff:c.cutoff,priorPublication:p.seal.publication};
      await save({pins:{context:await w.putArtifact(context,{kind:'publication',observedAt:c.createdAt})},state:{profileSha256:budget.sha256}});
    }
    if(cp!.phase==='capturing'){
      const p=await prior(c);
      if(!cp!.owner){const owner=await claimMutationOwnership(db,SCOPE,{phase:'writing',ownerReference:c.runId,operationKey:digest({kind:'held-capture',configSha256})});
        if(!owner)fail('writing_owner');await save({owner});}
      if(!cp!.pins.started){const cursor={current:cp!.owner!},telemetry=createD1CatalogTelemetryStore({db,owner:cursor.current,ownerCursor:cursor,runId:c.runId,catalogRevision:c.runId});
        await telemetry.startCatalogRun({id:c.runId,mode:'owner-held-cleanup',trigger:'manual',gitSha:c.codeSha,config:{merchantRequests:0,modelRequests:0,nativeWrites:0}});
        await save({owner:cursor.current,pins:{...cp!.pins,started:await w.putArtifact({kind:'held-cleanup-started'},{kind:'publication',observedAt:c.createdAt})}});}
      const rows=await captureHeldCatalogResolution(db,cp!.owner!,[...p.baseline.heldProducts.map(v=>v.id),...Object.values(OWNER_PUBLIC_DUPLICATE)]);
      const plan=prepareHeldCatalogResolution({baseline:p.baseline,rows,owner:cp!.owner!,reference,now:new Date().toISOString(),catalogRevision:c.runId});
      const planRef=await w.putBlob(Buffer.from(JSON.stringify(plan)),{kind:'publication',observedAt:c.createdAt});
      await save({phase:'review',pins:{...cp!.pins,plan:planRef},state:{profileSha256:budget.sha256,planSha256:digest(plan)}});
    }
    const plan=await readPlan(w,cp!.pins.plan),planSha256=digest(plan);
    if(!same(cp!.state&&typeof cp!.state==='object'&&!Array.isArray(cp!.state)?cp!.state.planSha256:null,planSha256))fail('plan');
    const summary={planSha256,promoted:plan.promotions.length,public:plan.baseline.products.length+plan.promotions.length-(plan.publicDuplicate?1:0),held:plan.exclusions.length+(plan.publicDuplicate?1:0),
      clearedLegacyDuplicateFlags:plan.clearedLegacyDuplicateFlags.length,merchantRequests:0,modelRequests:0,nativeWrites:0};
    if(command==='prepare')return{state:'prepared_requires_agent_review',...summary,budget:await w.budget()};
    if(approval!==planSha256)fail('explicit_plan_review');
    if(['review','applying'].includes(cp!.phase)){
      if(new Date().toISOString()>=c.cutoff)fail('cutoff');await prior(c);await save({phase:'applying'});
      const cursor={current:cp!.owner!},result=await applyHeldCatalogResolution({db,plan,planSha256,ownerCursor:cursor,checkpoint:async owner=>{await save({owner});}});
      const request:ApprovedCohortRequest={scope:SCOPE,codeSha:c.codeSha,previous:plan.baseline,predecessor:(await prior(c)).seal,
        context:await w.readArtifact(cp!.pins.context) as unknown as ApprovedCohortRequest['context'],approval:result.approval,approvalSha256:digest(result.approval),
        ownerBaseReview:{schemaVersion:1,kind:'owner-base-catalog-review',authorizationSha256:c.authorization.sha256,resolutionPlanSha256:planSha256,
          ...(plan.publicDuplicate?{publicDuplicate:plan.publicDuplicate.review}:{})}};
      const requestRef=await w.putBlob(Buffer.from(JSON.stringify(request)),{kind:'publication',observedAt:c.createdAt});
      await save({phase:'transitioning',owner:cursor.current,pins:{...cp!.pins,request:requestRef}});
    }
    if(cp!.phase==='transitioning'){
      const request=await blob<ApprovedCohortRequest>(cp!.pins.request),owner=await transitionHeldOwner(db,cp!.owner!,c.runId,request);
      await save({phase:'freezing',owner});
    }
    let revision:ApprovedCohortRevision|undefined;
    if(cp!.phase==='freezing'){
      const request=await blob<ApprovedCohortRequest>(cp!.pins.request);
      type Intent={schemaVersion:1;kind:'held-projection-seal-intent';owner:MutationOwner;revision:WorkspaceCheckpoint['pins'][string];revisionSha256:string};
      const intent=cp!.pins.sealIntent?await w.readArtifact(cp!.pins.sealIntent) as unknown as Intent:undefined;
      if(intent&&(!exact(intent,['schemaVersion','kind','owner','revision','revisionSha256'])||intent.schemaVersion!==1||intent.kind!=='held-projection-seal-intent'))fail('seal_intent');
      const sealed=intent?{owner:intent.owner,revision:await restoreHeldRevision(w,intent.revision,plan.baseline)}:undefined;
      if(sealed&&digest(sealed.revision)!==intent!.revisionSha256)fail('seal_intent');
      const prepared=await prepareOwnedApprovedCohortPlan({db,owner:cp!.owner!,request,adapters,sealed,beforeSeal:async(owner,candidate)=>{
        if(intent){if(digest(candidate)!==intent.revisionSha256)fail('seal_intent');return;}
        const pin=await w.putArtifact({schemaVersion:1,kind:'held-projection-seal-intent',owner,
          revision:await storeHeldRevision(w,candidate,c.createdAt),revisionSha256:digest(candidate)},{kind:'publication',observedAt:c.createdAt});
        await save({pins:{...cp!.pins,sealIntent:pin}});
      }});
      if(prepared.remainingIds.length||prepared.revision.snapshot.products.length!==summary.public||prepared.revision.snapshot.heldProducts.length!==summary.held)fail('publication_membership');
      revision=prepared.revision;const revisionRef=await storeHeldRevision(w,revision,c.createdAt);
      await save({phase:'settling',owner:prepared.owner,pins:{...cp!.pins,revision:revisionRef}});
    }
    if(cp!.phase==='settling'){
      revision=revision??await restoreHeldRevision(w,cp!.pins.revision,plan.baseline);
      const queued=await settleOwnedApprovedCohortVectorProof({db,owner:cp!.owner!,revision,adapters});
      await save({phase:'publishing',owner:queued.owner,state:JSON.parse(JSON.stringify({...cp!.state as object,requestId:queued.requestId}))});
    }
    if(cp!.phase==='publishing'||cp!.phase==='attention'&&cp!.control?.publication){
      revision=revision??await restoreHeldRevision(w,cp!.pins.revision,plan.baseline);
      // Source repair/freeze may take minutes. Recheck shared Free capacity at
      // the actual publication boundary without creating another profile/grant.
      const fresh=await accountUsage(w,token);assertOneTimeMigrationBudget(budget.profile,budget.sha256);assertHeldFreeCapacity(budget.profile,fresh,await w.budget());
      const result=await executePublication({db,workspace:w,owner:cp!.owner!,revision,approvedCatalog:revision,
        requestId:String((cp!.state as Record<string,unknown>).requestId),runReference:c.runId,config:c.publication,credentials:{cloudflareToken:token},
        dependencies:{fetch:send,observationFetch:observation,command:accountedPublicationUploadCommand({workspace:w,scope:SCOPE})}});
      saved=await w.readCheckpoint();cp=saved!.checkpoint;if(result.state!=='published')return{state:result.state,errorCode:result.errorCode,...summary,budget:await w.budget()};
      const receipts=(await db.prepare('SELECT * FROM publication_receipts WHERE release_id=?').bind(c.runId).all()).results;
      if(receipts.length!==1)fail('publication_receipt');
      const successor=await createPublishedApprovedCatalogSeal(db,revision,{releaseId:c.runId,receiptSha256:digest(receipts[0])});
      await w.recordCatalogSuccessor(successor);await save({phase:'published',owner:null});
    }
    if(cp!.phase==='published'||cp!.phase==='finalizing'){
      if(!cp!.owner){const owner=await claimMutationOwnership(db,SCOPE,{phase:'writing',ownerReference:c.runId+':finalize',operationKey:digest({kind:'held-finalize',configSha256})});
        if(!owner)fail('finalize_owner');await save({phase:'finalizing',owner});}
      const cursor={current:cp!.owner!},telemetry=createD1CatalogTelemetryStore({db,owner:cursor.current,ownerCursor:cursor,runId:c.runId,catalogRevision:c.runId});
      await telemetry.finishCatalogRun(c.runId,{status:'completed',counts:{heldResolution:summary,publication:{releaseId:c.runId}}});
      const actual=await telemetry.loadCatalogRun(c.runId);if(actual?.run.status!=='completed')fail('finalize_telemetry');
      await save({phase:'finalize_release',owner:cursor.current});
    }
    if(cp!.phase==='finalize_release'){
      await releaseHeldOwner(db,cp!.owner!);
      await save({phase:'finalized',owner:null});
    }
    if(cp!.phase!=='finalized')fail('phase');
    const successor=await reconcileEditorialRecoverySuccessor({workspace:w,binding:{runId:c.runId,originalConfigSha256:configSha256,originalCodeSha:c.codeSha,
      publicationConfigSha256:digest(c.publication),executionCodeSha:c.codeSha,scope:SCOPE,publicProducts:summary.public,heldProducts:summary.held,
      previous:c.previous,previousPublication:(await privateRead<ApprovedCatalogSeal>(c.previous.control.path,c.previous.control.sha256)).value.publication},
      store:await createEditorialSuccessorFiles(c.careDirectory,c.outputDirectory),observe:createEditorialSuccessorObserver({db,send,scope:SCOPE,identityOrigin:c.publication.identityOrigin})});
    return{state:'finalized',...summary,successor:successor.next,budget:await w.budget()};
  }finally{await w.close();}
}
export async function heldCatalogCommand(args:string[]){
  if(args.length===1&&args[0]==='--help')return{usage:'prepare|review|publish --config PRIVATE_JSON --config-sha256 SHA [--approve PLAN_SHA]',
    authority:'One explicitly authorized held-catalog cleanup; no merchant/model/native writes, cadence reset or paid upgrade. Prepare captures; publish requires exact agent-reviewed plan SHA.'};
  if(process.versions.node.split('.')[0]!=='22'||Object.keys(process.env).some(k=>/^(AMAZON_|OPENAI_|POSTGRES_|VERCEL_|CATALOG_|CLOUDFLARE_API_TOKEN)/.test(k)))fail('environment');
  if(!['prepare','review','publish'].includes(args[0])||![5,7].includes(args.length)||args[1]!=='--config'||args[3]!=='--config-sha256'
    ||!HASH.test(args[4])||args[0]==='publish'&&args.length!==7||args.length===7&&(args[0]!=='publish'||args[5]!=='--approve'||!HASH.test(args[6])))fail('arguments');
  const c=validateHeldCommandConfig((await privateRead<HeldCommandConfig>(args[2],args[4])).value);clean(c);const reference=await authorize(c);
  if(args[0]==='review'){
    const w=await openRunWorkspace(workspaceOptions(c,args[4],'resume'));
    try{const cp=await w.readCheckpoint();if(!cp?.checkpoint.pins.plan)fail('review_plan');
      const plan=await readPlan(w,cp.checkpoint.pins.plan);
      return{state:'offline_agent_review',planSha256:digest(plan),promoted:plan.promotions.length,public:plan.baseline.products.length+plan.promotions.length-(plan.publicDuplicate?1:0),
        exclusions:plan.exclusions,publicDuplicate:plan.publicDuplicate?.review??null,clearedLegacyDuplicateFlags:plan.clearedLegacyDuplicateFlags,merchantRequests:0,modelRequests:0,nativeWrites:0};
    }finally{await w.close();}
  }
  return run(args[0] as 'prepare'|'publish',c,args[4],reference,args[6]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)heldCatalogCommand(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{
  const m=e instanceof Error?e.message:'';console.error(/^[a-z0-9_]{1,150}$/.test(m)?m:'held_command_refused');process.exitCode=1;});
