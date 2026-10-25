import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadUploadInputs,readUploadPrivate,putUploadPrivate} from './editorial-upload-continuation.mts';
import {openRunWorkspace,readRunWorkspace} from './run-workspace.ts';
import {resolveWranglerOAuth} from './check-cloudflare-runner.ts';
import {runCloudflareWeekly,weeklyCommandSummary,readOrdered} from './run-cloudflare-weekly.ts';
import {sha256,canonicalJson} from './migration.ts';
import type {PublicationFinishBudget,RunWorkspace} from './run-workspace.ts';
import type {ReviewedUploadActivationInput} from '../../lib/catalog/build-requests.ts';
import {createCatalogD1Rest} from './d1-write-rest.ts';
import {accountedPublicationFetch} from './publication-read-fetch.ts';
import {createEditorialSuccessorFiles,createEditorialSuccessorObserver,reconcileEditorialRecoverySuccessor} from './editorial-recovery-successor.ts';
import type {EditorialSuccessorPointer} from './editorial-recovery-successor.ts';
import {approvedCatalogPlanChecks} from './owned-vector-delivery.ts';
import type {ApprovedCohortRevision} from '../../lib/catalog/freeze-approved-cohort.ts';
import type {CatalogD1} from '../../lib/catalog/storage/d1.ts';

// A retained operator, not a second scheduler or general-purpose budget flag.
const BASE=join(homedir(),'.codex/private/goose-gifts-migration');
const OUTPUT=join(BASE,'editorial-finish-20261025');
const PREVIOUS=join(BASE,'editorial-upload-transport-20261024-v1/reviewed-upload.json');
const PREVIOUS_SHA='e4dbe0cc08df356cc5ea983111a14282528e6e56f2da56fec872fbe5e51a85cb';
const VERSION='97aedc42-2321-416c-b349-014e13dba563';
const CHECKPOINT='4318aca3970c843d3524d71d5ee88bfc093b3ecadb68b2513ca3108631e6174e';
const ORIGINAL_CONTROLLER='c7859d302bdd5164792d7bdb9450f07a92dab469';
function fail(code:string):never{throw Error('editorial_finish_'+code);}
interface Profile {schemaVersion:1;controllerSha:string;authorizationSha256:string;
  budget:PublicationFinishBudget;authorization:NonNullable<ReviewedUploadActivationInput['finishAuthorization']>}

async function reviewedReadUncertainty(w:RunWorkspace){
  const spent=await w.budget();if(spent.unconfirmedRequests===0)return;
  if(spent.unconfirmedRequests!==1)fail('unreviewed_unknown');
  const directory=w.directory,requestSha256='6d288bf42d10309dabffe35e36ca013486682b4d7f5e11adf79cfb70877f7850';
  const reserved=(await readUploadPrivate<{event:{reservation:{requestSha256:string;id:string;units:{sqlStatements:number}}}}>(
    join(directory,'events/009998.099728debc7ce5d5abf0d223777e2dbed13e78b4663eb18be5dc5bcb94d1ee13.json'),
    'f3e1ff3a0f43c31379316d61072d4feeb60270ad90b4c806123bf652bb4d83fd')).value.event.reservation;
  const settled=(await readUploadPrivate<{event:{id:string;settlement:{status:string;usage:unknown}}}>(
    join(directory,'events/009999.38007b3833c19efd32c4585e580274770b4cdc75f3167caa227103150d9b97fb.json'),
    '1ff217bcd0bca5e417587056a7357ca0d50345111531e71b7bbc393d55417562')).value.event;
  if(reserved.id!=='6e2abd0c-1e8c-4fea-8bb8-0a9f9ead1aaf'||reserved.requestSha256!==requestSha256||reserved.units.sqlStatements!==2
    ||settled.id!==reserved.id||settled.settlement.status!=='unknown'||settled.settlement.usage!==null)fail('unreviewed_unknown');
  const proof={schemaVersion:1,kind:'matched-read-only-plan-checks',runId:w.manifest.runId,requestSha256,sqlStatements:2,
    maximumUnreportedReads:5000,maximumUnreportedWrites:0,originalCutoff:'2026-10-24T23:00:00.000Z'};
  try{const old=(await readUploadPrivate(join(OUTPUT,'classified-read.json'))).value;
    if(canonicalJson(old)!==canonicalJson(proof))fail('unknown_proof');return;
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const retained=await w.readCheckpoint();
  if(retained?.sha256!==CHECKPOINT)fail('unknown_checkpoint');
  const original=retained.checkpoint;
  const control=await readOrdered<{revision:Omit<ApprovedCohortRevision,'request'|'sourceRows'>;request:{request:ApprovedCohortRevision['request']}}>(w,original.pins.revision);
  const capture={prepare(sql:string){return{bind(...params:unknown[]){return{sql,params};}};}};
  const batch=approvedCatalogPlanChecks(capture as unknown as CatalogD1,original.owner!,{...control.revision,request:control.request.request} as ApprovedCohortRevision) as unknown as Array<{sql:string;params:unknown[]}>;
  const s=w.manifest.scope,actual=sha256(JSON.stringify({accountId:s.accountId,databaseId:s.databaseId,body:JSON.stringify({batch})}));
  if(actual!==requestSha256||!batch.every(q=>/^SELECT\b/.test(q.sql))||control.revision.globalVectorWatermark!==8
    ||control.request.request.context.publicationReceiptWatermark!==7)fail('unknown_proof');
  await putUploadPrivate(join(OUTPUT,'classified-read.json'),proof);
}

async function freeCapacity(w:RunWorkspace,token:string){
  await reviewedReadUncertainty(w); // Retained unknown is classified, NEVER refunded.
  const spent=await w.budget(),id=randomUUID(),url='https://api.cloudflare.com/client/v4/graphql';
  const body=JSON.stringify({query:'query($a:string!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:$d,date_leq:$d}){sum{rowsRead rowsWritten}}}}}',
    variables:{a:w.manifest.scope.accountId,d:new Date().toISOString().slice(0,10)}});
  await w.reserveBudget({id,requestSha256:sha256(url+body),units:{httpRequests:1,sqlStatements:0}});
  let response:Response;try{response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body});}
  catch{await w.settleBudget(id,{status:'unknown',usage:null});return fail('headroom_unknown');}
  await w.settleBudget(id,{status:'known',usage:{rowsRead:0,rowsWritten:0}});
  const usage=await response.json(),accounts=usage.data?.viewer?.accounts,groups=accounts?.[0]?.d1AnalyticsAdaptiveGroups;
  if(!response.ok||usage.errors||accounts?.length!==1||!Array.isArray(groups)||groups.length>=10000
    ||groups.some((g:{sum:{rowsRead:number;rowsWritten:number}})=>!Number.isSafeInteger(g.sum?.rowsRead)||g.sum.rowsRead<0
      ||!Number.isSafeInteger(g.sum?.rowsWritten)||g.sum.rowsWritten<0))fail('headroom');
  const reads=groups.reduce((n:number,g:{sum:{rowsRead:number}})=>n+g.sum.rowsRead,0),writes=groups.reduce((n:number,g:{sum:{rowsWritten:number}})=>n+g.sum.rowsWritten,0);
  if(Math.max(reads,spent.knownRowsRead)+Math.max(0,2000000-spent.knownRowsRead)+500000+300000>5000000
    ||Math.max(writes,spent.knownRowsWritten)+Math.max(0,30000-spent.knownRowsWritten)+5000+10000>100000
    ||spent.unconfirmedRequests>1)fail('free_capacity');
  return{reads,writes};
}

async function reconcile(controllerSha:string){
  const {job,effective}=await loadUploadInputs(controllerSha),w=await openRunWorkspace(job.workspace);
  try{
    const cp=await w.readCheckpoint({controlOnly:true});if(cp?.checkpoint.phase!=='finalized'||cp.checkpoint.owner!==null)fail('not_finalized');
    const full=(await readUploadPrivate<typeof job&{previous:EditorialSuccessorPointer;previousPublication:{releaseId:string;receiptSha256:string}}>(
      join(BASE,'editorial-recovery-20261024-reviewed-1e3b505/job.json'),'288eff3237914982079ab42cb224fa600b67031fe7bb511de25481db147d079d')).value;
    const token=await resolveWranglerOAuth(),s=w.manifest.scope,caps=await w.budgetCeiling();
    await freeCapacity(w,token);
    const db=await createCatalogD1Rest({accountId:s.accountId,databaseId:s.databaseId,databaseName:s.databaseName,token,
      limits:{requests:caps.httpRequests,statements:caps.sqlStatements,reportedRowsRead:2000000,reportedRowsWritten:30000},
      accounting:{scope:{accountId:s.accountId,databaseId:s.databaseId,databaseName:s.databaseName},initial:await w.budget(),
        reserve:async r=>{if((await w.budget()).knownRowsRead+80000>2000000)fail('read_margin');await w.reserveBudget(r);},settle:(id,x)=>w.settleBudget(id,x)}});
    const send=accountedPublicationFetch(w,fetch,{...s,identityOrigin:effective.publication.identityOrigin});
    return await reconcileEditorialRecoverySuccessor({workspace:w,binding:{runId:w.manifest.runId,originalConfigSha256:w.manifest.configSha256,
      originalCodeSha:w.manifest.codeSha,publicationConfigSha256:job.adoption.effective.publicationConfigSha256,executionCodeSha:job.adoption.effective.codeSha,
      scope:s,publicProducts:2359,heldProducts:1024,previous:full.previous,previousPublication:full.previousPublication},
      store:await createEditorialSuccessorFiles(join(BASE,'daily-catalog-care'),join(BASE,'daily-catalog-care/2026-10-24')),
      observe:createEditorialSuccessorObserver({db,send,scope:s,identityOrigin:effective.publication.identityOrigin})});
  }finally{await w.close();}
}

export async function finishEditorialUpload(args:string[]){
  if(process.versions.node.split('.')[0]!=='22'||Object.keys(process.env).some(k=>/^(AMAZON_|OPENAI_|POSTGRES_|VERCEL_|CATALOG_|CLOUDFLARE_API_TOKEN)/.test(k)))fail('environment');
  if(args.length!==7||!['prepare','publish'].includes(args[0])||args[1]!=='--controller-sha'||args[3]!=='--authorization'||args[5]!=='--authorization-sha')fail('arguments');
  const [command,,controllerSha,,authorizationPath,,authorizationSha256]=args;
  if(!authorizationPath.startsWith(OUTPUT+'/')||!/^[a-f0-9]{64}$/.test(authorizationSha256))fail('authorization');
  const consent=(await readUploadPrivate<{scope:string;approvedAt:string;additionalHttpRequests:number;additionalSqlStatements:number;additionalRowsRead:number;
    minimumUntouchedAccountReads:number;newProductFetches:number;newModelCalls:number;newBuildUploads:number;paidUpgrade:boolean}>(authorizationPath,authorizationSha256)).value;
  if(consent.scope!=='roadmap-lbbz1.4.9/same-upload-finish'||consent.additionalHttpRequests!==1000||consent.additionalSqlStatements!==2000
    ||consent.additionalRowsRead!==750000||consent.minimumUntouchedAccountReads!==300000||consent.newProductFetches!==0||consent.newModelCalls!==0
    ||consent.newBuildUploads!==0||consent.paidUpgrade!==false||consent.approvedAt>new Date().toISOString())fail('authority');
  const {job,effective}=await loadUploadInputs(controllerSha),status=await readRunWorkspace(job.workspace);
  if(status.checkpoint?.checkpoint.phase==='finalized'){
    if(status.checkpoint.checkpoint.control?.publication?.versionReference!==VERSION||status.checkpoint.checkpoint.owner!==null)fail('finalized_identity');
    return reconcile(controllerSha);
  }
  const w=await openRunWorkspace(job.workspace);
  let profile:Profile;
  try{
    const cp=await w.readCheckpoint({controlOnly:true}),c=cp?.checkpoint.control?.publication;
    if(!cp||!c||c.versionReference!==VERSION||!cp.checkpoint.pins.publicationUploadTransportAcknowledged)fail('version');
    const pins=cp.checkpoint.pins,pending=pins.publicationUploadTransportPending;
    if(!pending)fail('upload_ack');
    const reviewed=(await readUploadPrivate<{approval:unknown;evidence:unknown;transport:unknown}>(PREVIOUS,PREVIOUS_SHA)).value;
    const expectedAck={schemaVersion:1,approval:reviewed.approval,evidence:reviewed.evidence,pending,
      oldPending:pins.publicationUploadPending,oldReview:pins.publicationUploadReview,
      upload:{schemaVersion:1,releaseId:effective.publication.releaseId,requestId:c.requestId,configSha256:c.configSha256,
        packageSha256:c.packageSha256,uploadMarker:c.uploadMarker},transport:reviewed.transport};
    if(pins.publicationUploadTransportAcknowledged.sha256!==sha256(canonicalJson(expectedAck)))fail('upload_ack');
    if(canonicalJson(await w.readArtifact(pins.publicationUploadTransportAcknowledged))!==canonicalJson(expectedAck))fail('upload_ack');
    if(cp.checkpoint.phase==='finalized')fail('state_changed');
    const token=await resolveWranglerOAuth(),{reads,writes}=await freeCapacity(w,token);
    if(command==='prepare'){
      if(cp.sha256!==CHECKPOINT||c.stage!=='uploaded'||c.permit||cp.checkpoint.owner?.phase!=='freezing'
        ||cp.checkpoint.pins.reviewedUploadActivationPending)fail('original_state');
      const reviewedAt=new Date().toISOString(),activationDeadline=new Date(Date.parse(reviewedAt)+2*3600000).toISOString();
      if(activationDeadline>w.manifest.retention.rules.publication.notAfter)fail('retention');
      profile={schemaVersion:1,controllerSha,authorizationSha256,
        budget:{expectedCheckpointSha256:CHECKPOINT,approvalReference:authorizationSha256,versionReference:VERSION,
          allowance:{httpRequests:1000,sqlStatements:2000},reportedRowsRead:2000000},
        authorization:{authorizationSha256,reviewedAt,activationDeadline,versionReference:VERSION}};
      const profileSha256=await putUploadPrivate(join(OUTPUT,'profile.json'),profile);
      return{state:'prepared',profileSha256,originalLedger:await w.budget(),accountUsage:{reads,writes},activationDeadline};
    }
    profile=(await readUploadPrivate<Profile>(join(OUTPUT,'profile.json'))).value;
    if(profile.schemaVersion!==1||![controllerSha,ORIGINAL_CONTROLLER].includes(profile.controllerSha)||profile.authorizationSha256!==authorizationSha256
      ||profile.authorization.authorizationSha256!==authorizationSha256||profile.budget.approvalReference!==authorizationSha256
      ||profile.budget.versionReference!==VERSION||profile.authorization.versionReference!==VERSION||profile.budget.expectedCheckpointSha256!==CHECKPOINT
      ||profile.budget.reportedRowsRead!==2000000||profile.budget.allowance.httpRequests!==1000||profile.budget.allowance.sqlStatements!==2000
      ||!c.permit&&new Date().toISOString()>=profile.authorization.activationDeadline)fail('profile');
  }finally{await w.close();}
  const bundle=(await readUploadPrivate<{proposalSha256:string}>(join(BASE,'editorial-recovery-20261024-reviewed-1e3b505/bundle.json'),
    '0424a0135c13ecc815d5290357a2e37441f2bfdbe8adb117db975796cf4ee17a')).value;
  const result=await runCloudflareWeekly({command:'resume',configPath:job.configPath,configSha256:job.workspace.configSha256,
    workspace:job.workspace.directory,cadenceOnly:true,
    recovery:{path:job.approvalPath,sha256:job.approvalFileSha256,configPath:job.effectiveConfigPath,configSha256:job.effectiveConfigSha256},
    approval:{path:join(BASE,'editorial-recovery-20261024-reviewed-1e3b505/repair-proposal.json'),sha256:bundle.proposalSha256},
    reviewedUploadRetry:{path:PREVIOUS,sha256:PREVIOUS_SHA}},
  {repository:effective.publication.sourceRoot,finishRecovery:{budget:profile.budget,authorization:profile.authorization},
    publication:{command:async()=>fail('build_upload_forbidden')}});
  return result.state==='finalized'?{...weeklyCommandSummary(result),successor:await reconcile(controllerSha)}:weeklyCommandSummary(result);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)finishEditorialUpload(process.argv.slice(2))
  .then(r=>console.log(JSON.stringify(r))).catch(e=>{const m=e instanceof Error?e.message:'';console.error(/^[a-z0-9_]{1,150}$/.test(m)?m:'editorial_finish_refused');process.exitCode=1;});
