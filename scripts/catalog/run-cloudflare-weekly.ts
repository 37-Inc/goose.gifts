import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCatalogD1Rest } from './d1-write-rest.ts';
import { checkCloudflareRunner, resolveReadToken, validateRunnerCheckConfig } from './check-cloudflare-runner.ts';
import { createD1CatalogMaintenanceStore, loadMaintenanceVectorPayload } from './maintenance-d1.ts';
import { createD1CatalogTelemetryStore } from './telemetry-d1.ts';
import { createCatalogProviderEvidence } from './provider-evidence.ts';
import { createVectorizeRestAdapters } from './vectorize-rest.ts';
import { deliverOwnedOutboxEvent, deliverOwnedApprovedCohortVector, readOwnedApprovedCohortVectors } from './owned-vector-delivery.ts';
import { canonicalJson, sha256 } from './migration.ts';
import { decodePgvectorSendBase64 } from './pgvector-binary.ts';
import { openRunWorkspace, readRunWorkspace } from './run-workspace.ts';
import type { ArtifactRef, RetentionPolicy, RunWorkspace, RunWorkspaceOptions, WorkspaceCheckpoint } from './run-workspace.ts';
import { executePublication, validatePublicationConfig } from './publish-release.ts';
import type { PublicationConfig } from './publish-release.ts';
import { claimMutationOwnership, releaseMutationOwnership } from '../../lib/catalog/mutation-fence.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import { approvedCohortOperationKey, approvedCohortVectorPlan, prepareApprovedCohort, settleApprovedCohort } from '../../lib/catalog/freeze-approved-cohort.ts';
import type { ApprovedCohortRequest, ApprovedCohortRevision } from '../../lib/catalog/freeze-approved-cohort.ts';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { canonicalTime } from '../../lib/catalog/snapshot.ts';
import amazonCreators from '../../lib/amazon-creators.js';

type KeychainRef={service:string;account:string};
type InputRef={path:string;sha256:string;observedAt:string};
export interface CloudflareWeeklyConfig {
  schemaVersion:1;runId:string;catalogRevision:string;codeSha:string;environment:'staging'|'production';accountId:string;
  database:{id:string;name:string};vectorIndex:{name:string;dimensions:1536;metric:'cosine'};
  catalog:{associateTag:string;marketplace:'www.amazon.com'};backfillLimit:number;
  credentials:{cloudflare:KeychainRef;amazonId:KeychainRef;amazonSecret:KeychainRef;amazonVersion:string;openai:KeychainRef;stagingAuthSecret?:KeychainRef};
  limits:{requests:number;statements:number};retention:RetentionPolicy;
  inputs:{previous:InputRef;context:InputRef;rights:InputRef;originalVectors?:InputRef};publication:PublicationConfig;
}
export const WEEKLY_RESUME_STATES=Object.freeze({
  created:'No provider phase started; the exact initial claim can be recovered.',
  phases_running:'Ambiguous provider work: STOP for explicit review; never replay automatically.',
  phases_complete:'Providers finished; await a separately reviewed post-phase approval, then drain/freeze.',
  draining:'Resume only the pinned outbox event and immutable payload; unknown mutation stays owned.',
  freezing:'Resume the same approved seal, original vectors and exact proof (union at most20).',
  publishing:'Resume pinned build/upload/activation/readback only; no merchant/model phases.',
  published:'Verified receipt; deliberately reacquire writing solely for exact telemetry finalization.',
  finalized:'Terminal exact telemetry readback; never rerun.',
  phase_failed:'Terminal failed/partial provider phase; review retained receipts, never rerun.',
  attention:'Explicit reconciliation needed; never infer completion or take ownership.',
});
const KEY=/^[a-zA-Z0-9._-]{1,100}$/;const HASH=/^[a-f0-9]{64}$/;
const repository=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const exact=(value:unknown,keys:string)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys;
const keychain=(r:KeychainRef)=>r&&exact(r,'account,service')&&/^goose\.gifts\.[a-zA-Z0-9._:/-]{1,150}$/.test(r.service)
  &&/^[a-zA-Z0-9][a-zA-Z0-9._@:/-]{0,199}$/.test(r.account);
const safeCode=(error:unknown)=>error instanceof Error&&/^[a-z][a-z0-9_]{1,100}$/.test(error.message)?error.message:'weekly_requires_review';
const resolving=(checkpoint:{control?:WorkspaceCheckpoint['control']})=>Boolean(checkpoint.control?.publication
  &&(checkpoint.control.publication.permit||checkpoint.control.publication.stage==='activating'));
let executing=false; // Environment isolation across differing DB/workspace scopes in ONE process.

export function validateCloudflareWeeklyConfig(input:unknown):CloudflareWeeklyConfig {
  const c=input as CloudflareWeeklyConfig;
  if(!exact(c,'accountId,backfillLimit,catalog,catalogRevision,codeSha,credentials,database,environment,inputs,limits,publication,retention,runId,schemaVersion,vectorIndex')
    ||c.schemaVersion!==1||!KEY.test(c.runId)||!KEY.test(c.catalogRevision)||c.catalogRevision.length>64||!/^[a-f0-9]{40}$/.test(c.codeSha)
    ||!Number.isInteger(c.backfillLimit)||c.backfillLimit<0||c.backfillLimit>25
    ||!exact(c.credentials,c.credentials?.stagingAuthSecret?'amazonId,amazonSecret,amazonVersion,cloudflare,openai,stagingAuthSecret':'amazonId,amazonSecret,amazonVersion,cloudflare,openai')
    ||![c.credentials.cloudflare,c.credentials.amazonId,c.credentials.amazonSecret,c.credentials.openai,...(c.credentials.stagingAuthSecret?[c.credentials.stagingAuthSecret]:[])].every(keychain)
    ||!['2.1','2.2','2.3','3.1','3.2','3.3'].includes(c.credentials.amazonVersion)
    ||!exact(c.limits,'requests,statements')||!Number.isInteger(c.limits.requests)||c.limits.requests<2||c.limits.requests>10000
    ||!Number.isInteger(c.limits.statements)||c.limits.statements<1||c.limits.statements>25000
    ||!exact(c.inputs,c.inputs?.originalVectors?'context,originalVectors,previous,rights':'context,previous,rights'))throw new Error('weekly_configuration_invalid');
  validateRunnerCheckConfig({schemaVersion:1,environment:c.environment,accountId:c.accountId,database:c.database,vectorIndex:c.vectorIndex,
    catalog:c.catalog,cloudflareReadToken:c.credentials.cloudflare});
  const p=validatePublicationConfig(c.publication);
  if(p.environment!==c.environment||p.accountId!==c.accountId||p.database.id!==c.database.id||p.database.name!==c.database.name
    ||p.indexName!==c.vectorIndex.name||p.codeSha!==c.codeSha)throw new Error('weekly_publication_scope');
  for(const ref of Object.values(c.inputs)){
    if(!exact(ref,'observedAt,path,sha256')||!isAbsolute(ref.path)||!HASH.test(ref.sha256))throw new Error('weekly_input_reference');canonicalTime(ref.observedAt);
  }
  return structuredClone(c);
}
async function reviewed(path:string,digest:string,repo:string,max=512*1024) {
  if(!isAbsolute(path)||!HASH.test(digest))throw new Error('weekly_private_input');
  const stat=await lstat(path);const actual=await realpath(path);const rel=relative(await realpath(repo),actual);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.uid!==process.getuid?.()||stat.mode&0o077||stat.size>max
    ||rel===''||!rel.startsWith('..')&&!isAbsolute(rel))throw new Error('weekly_private_input');
  const bytes=await readFile(path);if(bytes.length>max||createHash('sha256').update(bytes).digest('hex')!==digest)throw new Error('weekly_input_digest');
  return JSON.parse(bytes.toString('utf8'));
}
// Strip product/candidate bodies and search-theme strings from phase counts.
// Token/cost usage remains exact private operational evidence, not analytics.
function numbers(value:unknown):unknown {
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='boolean'||value===null)return value;
  if(value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.entries(value)
    .filter(([,v])=>v===null||['number','boolean','object'].includes(typeof v)&&!Array.isArray(v)).map(([k,v])=>[k,numbers(v)]));
  return null;
}
function finalization(input:Record<string,unknown>) {
  return{counts:numbers(input.counts),timingsMs:input.timingsMs,usage:input.usage,
    warnings:(Array.isArray(input.warnings)?input.warnings:[]).map(w=>({phase:String(w.phase||'unknown').slice(0,40),reasonCode:String(w.reasonCode||'unknown').slice(0,80)}))};
}
// Snapshot/projection receipts bind JSON.stringify order, not canonicalJson.
// Preserve that reviewed byte order through the workspace's canonical store.
async function putOrdered(ws:RunWorkspace,value:unknown,observedAt:string){
  return ws.putArtifact(JSON.stringify(value),{kind:'publication',observedAt});
}
async function readOrdered<T>(ws:RunWorkspace,ref:ArtifactRef):Promise<T>{
  const value=await ws.readArtifact(ref);if(typeof value!=='string')throw new Error('weekly_sealed_artifact');
  return JSON.parse(value) as T;
}
async function scopedProviders<T>(config:CloudflareWeeklyConfig,resolveToken:(ref:KeychainRef)=>Promise<string>,action:()=>Promise<T>) {
  const names=Object.keys(process.env).filter(key=>/^(CATALOG_|AMAZON_|OPENAI_|GOOGLE_SEARCH_|POSTGRES_|VERCEL_)/.test(key));
  const values={...Object.fromEntries(names.map(key=>[key,undefined])),AMAZON_ASSOCIATE_TAG:config.catalog.associateTag,
    AMAZON_MARKETPLACE:config.catalog.marketplace,AMAZON_CREATORS_CREDENTIAL_VERSION:config.credentials.amazonVersion,
    AMAZON_CREATORS_CREDENTIAL_ID:await resolveToken(config.credentials.amazonId),AMAZON_CREATORS_CREDENTIAL_SECRET:await resolveToken(config.credentials.amazonSecret),
    OPENAI_API_KEY:await resolveToken(config.credentials.openai)};
  const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  try{for(const [key,value]of Object.entries(values)){if(value===undefined)delete process.env[key];else process.env[key]=value;}amazonCreators.clearToken();return await action();}
  finally{amazonCreators.clearToken();for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
async function releaseExact(db:CatalogD1,owner:MutationOwner){
  try{await releaseMutationOwnership(db,owner);}catch{
    const rows=(await db.prepare(`SELECT 1 FROM catalog_mutation_scopes WHERE environment=? AND index_name=? AND phase='idle'
      AND generation=? AND mutation_epoch=? AND external_pending=0`).bind(owner.environment,owner.indexName,owner.generation,owner.epoch).all()).results;
    if(rows.length!==1)throw new Error('weekly_release_uncertain');
  }
}
async function mutationKnown(db:CatalogD1,deliveryId:string){
  const row=(await db.prepare('SELECT mutation_reference FROM catalog_vector_deliveries WHERE delivery_id=?').bind(deliveryId).all()).results[0];
  return typeof row?.mutation_reference==='string';
}
export interface WeeklyDriverOptions {
  command:'preflight'|'start'|'resume'|'status';configPath:string;configSha256:string;workspace:string;
  approval?:{path:string;sha256:string};
}
type Dependencies={repository?:string;fetch?:typeof fetch;resolveToken?:(ref:KeychainRef)=>Promise<string>;now?:()=>string;
  publication?:Parameters<typeof executePublication>[0]['dependencies']};

/** Concrete opt-in local command; no scheduling, schema enablement or ambient
 * credential fallback. A post-phase approval is independently reviewed/pinned.
 * The default Goose CLI/backend and its schedule are intentionally untouched.
 */
export async function runCloudflareWeekly(options:WeeklyDriverOptions,dependencies:Dependencies={}) {
  const repo=dependencies.repository||repository;const now=dependencies.now||(()=>new Date().toISOString());
  const config=validateCloudflareWeeklyConfig(await reviewed(options.configPath,options.configSha256,repo,32768));
  if(options.approval&&options.command!=='resume')throw new Error('weekly_approval_requires_phase_resume');
  const scope={environment:config.environment,indexName:config.vectorIndex.name};const resolveToken=dependencies.resolveToken||resolveReadToken;
  const workspaceOptions:RunWorkspaceOptions={directory:options.workspace,repository:repo,mode:options.command==='start'?'create':'resume',
    runId:config.runId,configSha256:options.configSha256,codeSha:config.codeSha,
    scope:{...scope,accountId:config.accountId,databaseId:config.database.id,databaseName:config.database.name,workerName:config.publication.workerName},
    retention:config.retention,budgetCaps:{httpRequests:config.limits.requests,sqlStatements:config.limits.statements},now};
  if(options.command==='status'){
    const report=await readRunWorkspace(workspaceOptions);
    return{state:'status',runId:config.runId,phase:report.checkpoint?.checkpoint.phase??'created',
      resumeStates:WEEKLY_RESUME_STATES,...report};
  }
  if(options.command==='preflight')return checkCloudflareRunner({schemaVersion:1,environment:config.environment,accountId:config.accountId,
    database:config.database,vectorIndex:config.vectorIndex,catalog:config.catalog,cloudflareReadToken:config.credentials.cloudflare},
  {resolveToken,fetch:dependencies.fetch});
  if(!['start','resume'].includes(options.command))throw new Error('weekly_command');
  if(executing)throw new Error('weekly_process_busy');executing=true;
  let workspace:RunWorkspace|undefined;
  try{
    const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
    if(head!==config.codeSha||resolve(config.publication.sourceRoot)!==resolve(repo)
      ||execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:repo,encoding:'utf8'}).trim())throw new Error('weekly_source_mismatch');
    workspace=await openRunWorkspace(workspaceOptions);const ws=workspace;
    let saved=await ws.readCheckpoint({controlOnly:true});
    if(saved&&['phases_running','phase_failed','attention','finalized'].includes(saved.checkpoint.phase)
      &&!(saved.checkpoint.phase==='attention'&&resolving(saved.checkpoint)))
      return{state:saved.checkpoint.phase==='finalized'?'finalized':'attention',phase:saved.checkpoint.phase,budget:await ws.budget()};
    const token=await resolveToken(config.credentials.cloudflare);
    const identityAuthorization=async()=>config.credentials.stagingAuthSecret
      ?`Basic ${Buffer.from(`staging:${await resolveToken(config.credentials.stagingAuthSecret)}`).toString('base64')}`:undefined;
    const db=await createCatalogD1Rest({accountId:config.accountId,databaseId:config.database.id,databaseName:config.database.name,
      token,fetch:dependencies.fetch,limits:config.limits,accounting:{scope:{accountId:config.accountId,databaseId:config.database.id,databaseName:config.database.name},
        initial:await ws.budget(),reserve:value=>ws.reserveBudget(value),settle:(id,value)=>ws.settleBudget(id,value)}});
    // Expiry never hides the minimal control identity required to resolve an
    // already-dispatched activation. No expired snapshot/evidence is read here.
    let cp:WorkspaceCheckpoint;
    try{const full=await ws.readCheckpoint();cp=full?.checkpoint||{phase:'created',owner:null,state:{},pins:{},phaseComplete:null};saved=full;}
    catch(error){
      if(!saved||!resolving(saved.checkpoint)||!saved.checkpoint.owner)throw error;
      const result=await executePublication({db,owner:saved.checkpoint.owner,revision:null,requestId:saved.checkpoint.control!.publication!.requestId,
        runReference:saved.checkpoint.control!.publication!.runReference,workspace:ws,config:config.publication,credentials:{cloudflareToken:token,
          identityAuthorization:await identityAuthorization()},dependencies:dependencies.publication});
      return result.state==='published'?{state:'attention',phase:'published',reason:'finalization_requires_review',releaseId:result.releaseId,
        receiptSha256:result.receiptSha256,budget:await ws.budget()}:{...result,budget:await ws.budget()};
    }
    const write=async(patch:Partial<WorkspaceCheckpoint>)=>{const value={...cp,...patch};const next=await ws.writeCheckpoint(saved?.sha256||null,value);
      saved=next;cp=next.checkpoint;};
    if(cp.phase==='attention'&&resolving(cp))cp={...cp,phase:'publishing'};
    const state=()=>cp.state as Record<string,unknown>;
    if(!saved){
      if(options.command!=='start')throw new Error('weekly_checkpoint_missing');
      if((await db.prepare('SELECT id FROM catalog_runs WHERE id=?').bind(config.runId).all()).results.length)throw new Error('weekly_run_exists');
      const pins:Record<string,ArtifactRef>={};
      for(const [label,ref]of Object.entries(config.inputs)){
        const value=await reviewed(ref.path,ref.sha256,repo);
        pins[label]=await ws.putArtifact(label==='previous'?JSON.stringify(value):value,{kind:'phase',observedAt:ref.observedAt});
      }
      await write({pins});
    }
    if(cp.phase==='created'){
      const owner=await claimMutationOwnership(db,scope,{phase:'writing',ownerReference:config.runId,operationKey:sha256(`weekly:${options.configSha256}`)});
      if(!owner)throw new Error('weekly_owner_busy');const cursor={current:owner};await write({phase:'phases_running',owner});
      const intent=await ws.readArtifact(cp.pins.rights) as unknown as {rightsById:Record<string,never>;reviewedDeleteReference?:string};
      const evidence=createCatalogProviderEvidence({reviewedRightsById:intent.rightsById,reviewedDeleteReference:intent.reviewedDeleteReference,saveReceipt:input=>ws.saveReceipt(input),now});
      const maintenance=createD1CatalogMaintenanceStore({db,owner,ownerCursor:cursor,runId:config.runId,catalogRevision:config.catalogRevision,intent:evidence.intent});
      const telemetry=createD1CatalogTelemetryStore({db,owner,ownerCursor:cursor,runId:config.runId,catalogRevision:config.catalogRevision});
      try{await scopedProviders(config,resolveToken,async()=>{
        const {runWeeklyCatalogWithBackend}=await import('../ops/catalog-weekly.mjs');
        const backend={runId:config.runId,gitSha:config.codeSha,backfillLimit:config.backfillLimit,
          maintenanceStore:maintenance,telemetryStore:telemetry,providerEvidence:evidence,deferPublicationFinalization:true,
          async publish(input:{finalization:Record<string,unknown>}){
            const phaseComplete=await ws.putArtifact(finalization(input.finalization),{kind:'publication',observedAt:now()});
            await write({phase:'phases_complete',owner:cursor.current,phaseComplete});return{status:'pending'};
          },async finalizeRun(id:string,input:Record<string,unknown>){await telemetry.finishCatalogRun(id,input);return telemetry.loadCatalogRun(id);}};
        await runWeeklyCatalogWithBackend(backend);
      });}catch(error){
        const durable=await ws.readCheckpoint();if(durable){saved=durable;cp=durable.checkpoint;}
        if(cp.phase==='phases_running'){
          const row=await telemetry.loadCatalogRun(config.runId);
          await write({phase:row&&['partial','failed'].includes(String(row.run.status))?'phase_failed':'attention',owner:cursor.current,
            state:{errorCode:safeCode(error)}});
        }
        return{state:'attention',phase:cp.phase,errorCode:safeCode(error),budget:await ws.budget()};
      }
    }
    const adapters=createVectorizeRestAdapters({...scope,accountId:config.accountId,token,fetch:dependencies.fetch});
    if(cp.phase==='phases_complete'||cp.phase==='draining'){
      // Review is separate from running paid phases. Never synthesize an envelope
      // from whichever mutable rows happen to be ready when this command resumes.
      if(!cp.pins.approval){
        if(!options.approval)return{state:'pending',phase:cp.phase,reason:'awaiting_reviewed_approval',budget:await ws.budget()};
        const approval=await reviewed(options.approval.path,options.approval.sha256,repo);
        if(approval.runId!==config.runId||approval.catalogRevision!==config.catalogRevision)throw new Error('weekly_approval_run');
        const pin=await ws.putArtifact(approval,{kind:'publication',observedAt:now()});await write({pins:{...cp.pins,approval:pin}});
      }else if(options.approval){const approval=await reviewed(options.approval.path,options.approval.sha256,repo);
        if(sha256(canonicalJson(approval))!==cp.pins.approval.sha256)throw new Error('weekly_approval_rewrite');}
      await write({phase:'draining'});
      for(let n=0;n<200;n++){
        const sequence=Number(state().outboxSequence)||Number((await db.prepare("SELECT sequence FROM vector_sync_outbox WHERE source_revision=? AND status='pending' ORDER BY sequence LIMIT 1")
          .bind(config.catalogRevision).all()).results[0]?.sequence)||0;
        if(!sequence)break;
        await write({state:{...state(),outboxSequence:sequence}});
        for(let pass=0;pass<4;pass++){
          const result=await deliverOwnedOutboxEvent({db,owner:cp.owner!,sequence,catalogRevision:config.catalogRevision,adapters,
            loadPayload:event=>loadMaintenanceVectorPayload(db,event)});await write({owner:result.owner});
          if(result.state==='expired')return{state:'attention',phase:cp.phase,reason:'expired_vector',budget:await ws.budget()};
          if(result.state==='complete'){await write({state:{...state(),outboxSequence:null}});break;}
          if(pass===3||result.errorCode==='mutation_unknown'&&!await mutationKnown(db,result.deliveryId))
            return{state:'pending',phase:cp.phase,errorCode:result.errorCode,budget:await ws.budget()};
        }
        if(n===199)throw new Error('weekly_outbox_bound');
      }
      const request={previous:await readOrdered(ws,cp.pins.previous),context:await ws.readArtifact(cp.pins.context),scope,codeSha:config.codeSha,
        approval:await ws.readArtifact(cp.pins.approval),approvalSha256:cp.pins.approval.sha256} as unknown as ApprovedCohortRequest;
      approvedCohortOperationKey(request);
      const pin=await putOrdered(ws,request,now());await write({phase:'freezing',pins:{...cp.pins,request:pin}});
    }
    let revision:ApprovedCohortRevision|undefined;
    if(cp.phase==='freezing'){
      const request=await readOrdered<ApprovedCohortRequest>(ws,cp.pins.request);
      if(cp.pins.preparedRevision)revision=await readOrdered<ApprovedCohortRevision>(ws,cp.pins.preparedRevision);
      else{
        const claim={phase:'freezing' as const,ownerReference:`${config.runId}:freeze`,operationKey:approvedCohortOperationKey(request)};
        let owner=await claimMutationOwnership(db,scope,claim);
        if(!owner){if(cp.owner?.phase!=='writing')throw new Error('weekly_freeze_claim');await releaseExact(db,cp.owner);owner=await claimMutationOwnership(db,scope,claim);}
        if(!owner)throw new Error('weekly_freeze_claim');await write({owner});
        const prepared=await prepareApprovedCohort(db,owner,request);revision=prepared.revision;
        const pin=await putOrdered(ws,revision,now());
        await write({owner:prepared.owner,pins:{...cp.pins,preparedRevision:pin},state:{...state(),vectorOffset:0}});
      }
      const plan=approvedCohortVectorPlan(revision);
      const originals=cp.pins.originalVectors?await ws.readArtifact(cp.pins.originalVectors) as Record<string,unknown>:{};
      const vectorIds=[...plan.products.map(p=>p.publicId),...plan.absentIds];
      for(let index=Number(state().vectorOffset)||0;index<vectorIds.length;index++){
        const publicId=vectorIds[index];
        // Replaying complete earlier journal entries recovers only their own
        // recorded epoch; the exact current checkpoint owner is never replaced
        // with an arbitrary DB cursor. Original signed zero stays native bytes.
        const raw=originals[publicId] as Record<string,unknown>|undefined;
        const {nativeBase64,...fields}=raw||{};
        const original=raw?{...fields,values:decodePgvectorSendBase64(nativeBase64)}:undefined;
        for(let pass=0;pass<4;pass++){
          const result=await deliverOwnedApprovedCohortVector({db,owner:cp.owner!,revision,publicId,adapters,
            ...(!request.approval.changes.some(c=>c.publicId===publicId)&&plan.products.some(p=>p.publicId===publicId)&&original
              ?{original:{sha256:sha256(canonicalJson(original)),async load(){return original as never;}}}:{})});
          await write({owner:result.owner});
          if(result.state==='expired')return{state:'attention',phase:cp.phase,reason:'expired_vector',budget:await ws.budget()};
          if(result.state==='complete'){await write({state:{...state(),vectorOffset:index+1}});break;}
          if(pass===3||result.errorCode==='mutation_unknown'&&!await mutationKnown(db,result.deliveryId))
            return{state:'pending',phase:cp.phase,errorCode:result.errorCode,budget:await ws.budget()};
        }
      }
      const queued=await settleApprovedCohort(db,cp.owner!,revision,()=>readOwnedApprovedCohortVectors(db,cp.owner!,revision!,adapters));
      const pin=await putOrdered(ws,revision,now());
      await write({phase:'publishing',owner:queued.owner,pins:{...cp.pins,revision:pin},state:{...state(),requestId:queued.requestId}});
    }
    if(cp.phase==='publishing'){
      revision=revision||await readOrdered<ApprovedCohortRevision>(ws,cp.pins.revision);
      const result=await executePublication({db,owner:cp.owner!,revision,requestId:String(state().requestId),runReference:config.runId,workspace:ws,
        config:config.publication,credentials:{cloudflareToken:token,identityAuthorization:await identityAuthorization()},dependencies:dependencies.publication});
      const changed=await ws.readCheckpoint();if(!changed)throw new Error('weekly_checkpoint_missing');saved=changed;cp=changed.checkpoint;
      if(result.state!=='published')return{...result,phase:cp.phase,budget:await ws.budget()};
      const pin=await ws.putArtifact(result,{kind:'publication',observedAt:now()});
      await write({phase:'published',owner:null,pins:{...cp.pins,published:pin}});
    }
    if(cp.phase==='published'){
      const receipt=await ws.readArtifact(cp.pins.published) as Record<string,unknown>;
      const owner=await claimMutationOwnership(db,scope,{phase:'writing',ownerReference:`${config.runId}:finalize`,operationKey:sha256(`finalize:${options.configSha256}`)});
      if(!owner)throw new Error('weekly_finalize_owner');await write({owner});
      const cursor={current:owner};const telemetry=createD1CatalogTelemetryStore({db,owner,ownerCursor:cursor,runId:config.runId,catalogRevision:config.catalogRevision});
      const summary=await ws.readArtifact(cp.phaseComplete!) as Record<string,unknown>;
      const input={...summary,status:'completed',counts:{...summary.counts as object,publication:{status:'published',releaseId:receipt.releaseId,receiptSha256:receipt.receiptSha256}}};
      await telemetry.finishCatalogRun(config.runId,input);const actual=await telemetry.loadCatalogRun(config.runId);
      if(actual?.run.id!==config.runId||actual.run.status!=='completed'||canonicalJson(actual.run.counts)!==canonicalJson(input.counts))throw new Error('weekly_finalization_mismatch');
      await write({owner:cursor.current});await releaseExact(db,cursor.current);await write({phase:'finalized',owner:null});
      return{state:'finalized',runId:config.runId,releaseId:receipt.releaseId,receiptSha256:receipt.receiptSha256,budget:await ws.budget()};
    }
    throw new Error('weekly_checkpoint_phase');
  }finally{try{await workspace?.close();}finally{executing=false;}}
}

/** Exit zero may mean waiting/reconciliation, not a publication receipt. */
export function weeklyCommandSummary(result:Record<string,unknown>){
  const output:Record<string,unknown>={state:result.state??result.status};
  for(const key of ['runId','phase','reason','errorCode','releaseId','receiptSha256']){
    const value=result[key];if(typeof value==='string'&&/^[a-zA-Z0-9._-]{1,200}$/.test(value))output[key]=value;
  }
  if(result.budget)output.budget=result.budget;
  return output;
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){console.log('Opt-in protected weekly driver: <preflight|start|resume|status> --config /private/reviewed.json --config-sha256 SHA --workspace /private/weekly-runs [--approval /private/post-phase.json --approval-sha256 SHA]\nExit zero may mean pending review/reconciliation; it is not a completion receipt.\n'+JSON.stringify(WEEKLY_RESUME_STATES));return;}
  if(!['preflight','start','resume','status'].includes(args[0])||![7,11].includes(args.length)||args[1]!=='--config'||args[3]!=='--config-sha256'||args[5]!=='--workspace'
    ||args.length===11&&(args[7]!=='--approval'||args[9]!=='--approval-sha256'))throw new Error('weekly_arguments');
  const result=await runCloudflareWeekly({command:args[0] as WeeklyDriverOptions['command'],configPath:resolve(args[2]),configSha256:args[4],workspace:resolve(args[6]),
    ...(args.length===11?{approval:{path:resolve(args[8]),sha256:args[10]}}:{})});
  // Never print candidate bodies, credentials, private checkpoints or provider errors.
  console.log(JSON.stringify(weeklyCommandSummary(result)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(safeCode(error));process.exitCode=1;});
