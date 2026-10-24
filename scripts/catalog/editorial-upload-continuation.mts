import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './migration.ts';
import {openRunWorkspace} from './run-workspace.ts';
import type {ArtifactRef,RunWorkspaceOptions} from './run-workspace.ts';
import {readOnlyUploadEvidence} from './upload-preflight-proof.ts';
import {validateExecutionAdoption,validateExecutionAdoptionConfigs} from './execution-adoption.ts';
import type {ExecutionAdoption} from './execution-adoption.ts';
import {runCloudflareWeekly,validateCloudflareWeeklyConfig,weeklyCommandSummary,reviewedUploadResume} from './run-cloudflare-weekly.ts';
import {encodeReviewedUploadActivationApproval} from '../../lib/catalog/build-requests.ts';
import type {ReviewedUploadActivationApprovalV4} from '../../lib/catalog/build-requests.ts';
import {resolveWranglerOAuth} from './check-cloudflare-runner.ts';

// One retained run only. This controller is pinned separately; it never adopts
// its own code as the runtime or changes the already built package/source.
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const BASE=join(homedir(),'.codex/private/goose-gifts-migration');
const PACKET=join(BASE,'editorial-recovery-20261024-reviewed-1e3b505');
const OUTPUT=join(BASE,'editorial-upload-continuation-20261024-v4');
const JOB_SHA='288eff3237914982079ab42cb224fa600b67031fe7bb511de25481db147d079d';
const RUNTIME_SHA='1e3b505eb0afc644b84de4e0cadcaa53daeb3f86';
const RUN='daily-2026-10-24-628707b5';
const HASH=/^[a-f0-9]{64}$/;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const equal=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
function fail(code:string):never{throw Error('editorial_upload_'+code);}
function clean(root:string,sha:string){
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  if(git('rev-parse','HEAD')!==sha||git('status','--porcelain','--untracked-files=all'))fail('source');
}
async function read<T=Record<string,unknown>>(file:string,digest?:string):Promise<{value:T;sha256:string}>{
  const s=await fs.lstat(file);if(await fs.realpath(file)!==file||!s.isFile()||s.uid!==process.getuid?.()||s.nlink!==1||(s.mode&0o777)!==0o600||s.size>32*1024*1024)fail('private_file');
  const fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const a=await fd.stat();if(a.ino!==s.ino||a.dev!==s.dev)fail('private_changed');
    const b=await fd.readFile(),after=await fd.stat(),sha256=hash(b);
    if(after.size!==s.size||after.mtimeMs!==s.mtimeMs||after.ctimeMs!==s.ctimeMs||digest&&sha256!==digest)fail('digest');
    return{value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b)) as T,sha256};
  }finally{await fd.close();}
}
async function put(file:string,value:unknown){
  const parent=dirname(file),s=await fs.lstat(parent);
  if(await fs.realpath(parent)!==parent||!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o700)fail('private_directory');
  const b=Buffer.from(JSON.stringify(value)+'\n');let fd;
  try{fd=await fs.open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||(await read(file)).sha256!==hash(b))fail('immutable_changed');return hash(b);}
  try{await fd.writeFile(b);await fd.sync();}finally{await fd.close();}
  const dir=await fs.open(parent,constants.O_RDONLY|constants.O_DIRECTORY);try{await dir.sync();}finally{await dir.close();}
  if((await read(file)).sha256!==hash(b))fail('readback');return hash(b);
}
interface Job {
  workspace:RunWorkspaceOptions;adoption:ExecutionAdoption;capacity:Record<string,unknown>;
  configPath:string;effectiveConfigPath:string;effectiveConfigSha256:string;approvalPath:string;approvalFileSha256:string;
}
interface Continuation {
  schemaVersion:1;controllerSha:string;jobSha256:string;authorizationSha256:string;
  reviewedPath:string;reviewedSha256:string;
}
interface PrepareIntent {
  schemaVersion:1;controllerSha:string;checkpointSha256:string;authorizationSha256:string;reviewedAt:string;
  through:{sequence:number;sha256:string};
}
async function inputs(controllerSha:string){
  if(!/^[a-f0-9]{40}$/.test(controllerSha))fail('controller');clean(ROOT,controllerSha);
  const job=(await read<Job>(join(PACKET,'job.json'),JOB_SHA)).value;
  const original=validateCloudflareWeeklyConfig((await read(job.configPath,job.workspace.configSha256)).value as never);
  const effective=validateCloudflareWeeklyConfig((await read(job.effectiveConfigPath,job.effectiveConfigSha256)).value as never);
  validateExecutionAdoption(job.adoption);validateExecutionAdoptionConfigs(original,effective,job.adoption);
  if(job.workspace.runId!==RUN||job.adoption.effective.codeSha!==RUNTIME_SHA
    ||!equal((await read(job.approvalPath,job.approvalFileSha256)).value,job.adoption))fail('job');
  clean(job.workspace.repository,job.workspace.codeSha);clean(effective.publication.sourceRoot,RUNTIME_SHA);
  return{job,effective};
}
async function prepare(controllerSha:string){
  const {job,effective}=await inputs(controllerSha),w=await openRunWorkspace(job.workspace);
  try{
    if(!equal(w.execution,job.adoption))fail('adoption');
    const cp=await w.readCheckpoint(),c=cp?.checkpoint.control?.publication,pins=cp?.checkpoint.pins;
    if(!cp||cp.checkpoint.phase!=='attention'||c?.stage!=='uploading'||!pins?.publicationUploadPending||!pins.publicationUploadReview
      ||pins.publicationUploadRetryPending||c.permit||c.versionReference||c.packageSha256!=='0df56aba12ab798bab51c7c2b9ada536430aff2716db893ee528859e471a4c89'
      ||c.requestId!=='a999582fcc4ec0a148bdc7c91349e1edd0f4b3aaf5fcfa335652e03fb7e8d28b'
      ||c.configSha256!==sha256(canonicalJson(effective.publication))||new Date().toISOString()>=c.build.request.cutoff)fail('original_pending');
    const authorizationSha256=(await read(join(PACKET,'live-authorization.json'))).sha256;
    await fs.mkdir(OUTPUT,{recursive:true,mode:0o700});
    let intent:PrepareIntent;const intentPath=join(OUTPUT,'prepare-intent.json');
    try{intent=(await read<PrepareIntent>(intentPath)).value;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
      intent={schemaVersion:1,controllerSha,checkpointSha256:cp.sha256,authorizationSha256,reviewedAt:new Date().toISOString(),
        through:(await read<PrepareIntent['through']>(join(w.directory,'head.json'))).value};await put(intentPath,intent);}
    if(intent.schemaVersion!==1||intent.controllerSha!==controllerSha||intent.checkpointSha256!==cp.sha256
      ||intent.authorizationSha256!==authorizationSha256||intent.reviewedAt>=c.build.request.cutoff)fail('prepare_intent');
    const proof=await readOnlyUploadEvidence(w,pins.publicationUploadPending,pins.publicationUploadReview,intent.through);
    const evidence=await w.putArtifact(proof,{kind:'publication',observedAt:intent.reviewedAt});
    const approval:ReviewedUploadActivationApprovalV4={schemaVersion:4,requestId:c.requestId,packageSha256:c.packageSha256!,configSha256:c.configSha256,
      checkpointSha256:cp.sha256,reviewPinSha256:pins.publicationUploadReview.sha256,evidenceSha256:evidence.sha256,
      reviewReference:'roadmap-lbbz1.4.9/same-package-read-only-preflight',reviewedAt:intent.reviewedAt,authorizationSha256};
    encodeReviewedUploadActivationApproval(approval);
    const reviewedPath=join(OUTPUT,'reviewed-upload.json'),reviewedSha256=await put(reviewedPath,{approval,evidence});
    const continuation:Continuation={schemaVersion:1,controllerSha,jobSha256:JOB_SHA,authorizationSha256,reviewedPath,reviewedSha256};
    const continuationSha256=await put(join(OUTPUT,'continuation.json'),continuation);
    return{state:'prepared_offline',continuationSha256,reviewedSha256,proof,approval};
  }finally{await w.close();}
}
export async function publishPreparedUpload(controllerSha:string,continuationFile:string,continuationSha256:string){
  if(!HASH.test(continuationSha256))fail('approval_digest');
  if(!continuationFile.startsWith(BASE+'/'))fail('private_file');
  const {job,effective}=await inputs(controllerSha),continuation=(await read<Continuation>(continuationFile,continuationSha256)).value;
  if(continuation.controllerSha!==controllerSha||continuation.jobSha256!==JOB_SHA||continuation.schemaVersion!==1
    ||continuation.reviewedPath!==join(dirname(continuationFile),'reviewed-upload.json')
    ||continuation.authorizationSha256!==(await read(join(PACKET,'live-authorization.json'))).sha256)fail('continuation');
  const reviewed=(await read<{approval:ReviewedUploadActivationApprovalV4;evidence:ArtifactRef;transport?:{previous:ArtifactRef}}>(continuation.reviewedPath,continuation.reviewedSha256)).value;
  encodeReviewedUploadActivationApproval(reviewed.approval);
  if(reviewed.approval.authorizationSha256!==continuation.authorizationSha256||reviewed.approval.schemaVersion!==4)fail('authorization');
  const w=await openRunWorkspace(job.workspace);
  try{
    if(!equal(w.execution,job.adoption))fail('adoption');
    const cp=await w.readCheckpoint({controlOnly:true});
    if(!cp)fail('checkpoint');
    if(cp.checkpoint.phase==='finalized')return{state:'finalized',phase:'finalized',budget:await w.budget()};
    if(!cp.checkpoint.control?.publication?.permit){
      if(!reviewedUploadResume(cp,reviewed))fail('pending_review');
      if(new Date().toISOString()>=job.adoption.contexts.replacement.cutoff)fail('cutoff');
    }
    // Existing account-wide Free headroom policy, charged to the original run.
    const token=await resolveWranglerOAuth(),{headroom}=await import(pathToFileURL(join(job.workspace.repository,'scripts/catalog/daily-operator.mjs')).href);
    const send:typeof fetch=async(input,init)=>{
      const url=String(input);if(url!=='https://api.cloudflare.com/client/v4/graphql'||init?.method!=='POST')fail('headroom_scope');
      const id=randomUUID();await w.reserveBudget({id,requestSha256:sha256(url+String(init.body)),units:{httpRequests:1,sqlStatements:0}});
      let response;try{response=await fetch(input,{...init,signal:AbortSignal.timeout(15000)});}catch{await w.settleBudget(id,{status:'unknown',usage:null});fail('headroom_unknown');}
      await w.settleBudget(id,{status:'known',usage:{rowsRead:0,rowsWritten:0}});return response;
    };
    await headroom(token,await w.budget(),job.capacity,send);
  }finally{await w.close();}
  const bundle=(await read<{proposalSha256:string}>(join(PACKET,'bundle.json'),'0424a0135c13ecc815d5290357a2e37441f2bfdbe8adb117db975796cf4ee17a')).value;
  return weeklyCommandSummary(await runCloudflareWeekly({command:'resume',configPath:job.configPath,configSha256:job.workspace.configSha256,workspace:job.workspace.directory,cadenceOnly:true,
    recovery:{path:job.approvalPath,sha256:job.approvalFileSha256,configPath:job.effectiveConfigPath,configSha256:job.effectiveConfigSha256},
    approval:{path:join(PACKET,'repair-proposal.json'),sha256:bundle.proposalSha256},
    reviewedUploadRetry:{path:continuation.reviewedPath,sha256:continuation.reviewedSha256}},
    {repository:effective.publication.sourceRoot}));
}
export async function editorialUploadContinuation(args:string[]){
  if(args.length===1&&args[0]==='--help')return{usage:'prepare --controller-sha SHA | publish --controller-sha SHA --approve CONTINUATION_SHA',authority:'Same retained run and package only; no new batch, adoption, cutoff, claim, counter or budget.'};
  if(process.versions.node.split('.')[0]!=='22'||Object.keys(process.env).some(k=>/^(AMAZON_|OPENAI_|POSTGRES_|VERCEL_|CATALOG_|CLOUDFLARE_API_TOKEN)/.test(k)))fail('environment');
  if(args[0]==='prepare'&&args.length===3&&args[1]==='--controller-sha')return prepare(args[2]);
  if(args[0]==='publish'&&args.length===5&&args[1]==='--controller-sha'&&args[3]==='--approve')return publishPreparedUpload(args[2],join(OUTPUT,'continuation.json'),args[4]);
  fail('arguments');
}
export {inputs as loadUploadInputs,read as readUploadPrivate,put as putUploadPrivate};
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)editorialUploadContinuation(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{
  const m=e instanceof Error?e.message:'';console.error(/^[a-z0-9_]{1,150}$/.test(m)?m:'editorial_upload_refused');process.exitCode=1;});
