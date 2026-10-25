import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openRunWorkspace} from './run-workspace.ts';
import type {ArtifactRef} from './run-workspace.ts';
import {readOnlyTransportEvidence} from './upload-preflight-proof.ts';
import {canonicalJson} from './migration.ts';
import {encodeReviewedUploadActivationApproval} from '../../lib/catalog/build-requests.ts';
import type {ReviewedUploadActivationApprovalV4} from '../../lib/catalog/build-requests.ts';
import {loadUploadInputs,readUploadPrivate,putUploadPrivate,publishPreparedUpload} from './editorial-upload-continuation.mts';

const BASE=join(homedir(),'.codex/private/goose-gifts-migration');
const PACKET=join(BASE,'editorial-recovery-20261024-reviewed-1e3b505');
const OUTPUT=join(BASE,'editorial-upload-transport-20261024-v1');
const OLD=join(BASE,'editorial-upload-continuation-20261024-v4/continuation.json');
const OLD_SHA='d952239d4b7bfd1d8fc1109ef5eb42746051a9bce09b113d3a0a38ae58f53ec9';
const OLD_ROOT=join(homedir(),'.codex/worktrees/stupid-editorial-live-receipt/goose.gifts');
const OLD_CODE='6fcf41cbfc4774f3eca2678be4754218eb06241c';
const JOB='288eff3237914982079ab42cb224fa600b67031fe7bb511de25481db147d079d';
function fail(code:string):never{throw Error('editorial_transport_'+code);}
async function prior(){
  const old=(await readUploadPrivate<{controllerSha:string;jobSha256:string}>(OLD,OLD_SHA)).value;
  const git=(...args:string[])=>execFileSync('git',args,{cwd:OLD_ROOT,encoding:'utf8'}).trim();
  if(old.controllerSha!==OLD_CODE||old.jobSha256!==JOB||git('rev-parse','HEAD')!==OLD_CODE||git('status','--porcelain','--untracked-files=all'))fail('prior');
}
interface Intent {schemaVersion:1;controllerSha:string;checkpointSha256:string;authorizationSha256:string;reviewedAt:string;previous:ArtifactRef;through:{sequence:number;sha256:string}}
async function prepare(controllerSha:string){
  await prior();const {job}=await loadUploadInputs(controllerSha),w=await openRunWorkspace(job.workspace);
  try{
    if(canonicalJson(w.execution)!==canonicalJson(job.adoption))fail('adoption');
    const cp=await w.readCheckpoint(),c=cp?.checkpoint.control?.publication,pins=cp?.checkpoint.pins;
    if(!cp||cp.checkpoint.phase!=='publishing'||cp.checkpoint.owner?.phase!=='freezing'||c?.stage!=='uploading'||c.permit||c.versionReference
      ||!pins?.publicationUploadRetryPending||pins.publicationUploadRetryAcknowledged||pins.publicationUploadTransportPending
      ||pins.publicationUploadTransportAcknowledged||new Date().toISOString()>=c.build.request.cutoff)fail('pending');
    const authorizationSha256=(await readUploadPrivate(join(PACKET,'live-authorization.json'))).sha256;
    await fs.mkdir(OUTPUT,{recursive:true,mode:0o700});const intentPath=join(OUTPUT,'prepare-intent.json');let intent:Intent;
    try{intent=(await readUploadPrivate<Intent>(intentPath)).value;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
      intent={schemaVersion:1,controllerSha,checkpointSha256:cp.sha256,authorizationSha256,reviewedAt:new Date().toISOString(),previous:pins.publicationUploadRetryPending,
        through:(await readUploadPrivate<Intent['through']>(join(w.directory,'head.json'))).value};await putUploadPrivate(intentPath,intent);}
    if(intent.schemaVersion!==1||intent.controllerSha!==controllerSha||intent.checkpointSha256!==cp.sha256
      ||intent.authorizationSha256!==authorizationSha256||intent.previous.sha256!==pins.publicationUploadRetryPending.sha256
      ||intent.reviewedAt>=c.build.request.cutoff)fail('intent');
    const proof=await readOnlyTransportEvidence(w,intent.previous,intent.through);
    if(proof.checkpointSha256!==cp.sha256)fail('checkpoint');
    const evidence=await w.putArtifact(proof,{kind:'publication',observedAt:intent.reviewedAt});
    const approval:ReviewedUploadActivationApprovalV4={schemaVersion:4,requestId:c.requestId,packageSha256:c.packageSha256!,configSha256:c.configSha256,
      checkpointSha256:cp.sha256,reviewPinSha256:pins.publicationUploadReview.sha256,evidenceSha256:evidence.sha256,
      reviewReference:'roadmap-lbbz1.4.9/proven-zero-post-connection-correction',reviewedAt:intent.reviewedAt,authorizationSha256};
    encodeReviewedUploadActivationApproval(approval);
    const reviewedPath=join(OUTPUT,'reviewed-upload.json'),reviewedSha256=await putUploadPrivate(reviewedPath,{approval,evidence,transport:{previous:intent.previous}});
    const continuationSha256=await putUploadPrivate(join(OUTPUT,'continuation.json'),{schemaVersion:1,controllerSha,jobSha256:JOB,authorizationSha256,reviewedPath,reviewedSha256});
    return{state:'prepared_offline',continuationSha256,reviewedSha256,proof,approval};
  }finally{await w.close();}
}
export async function editorialTransportContinuation(args:string[]){
  if(args.length===1&&args[0]==='--help')return{usage:'prepare --controller-sha SHA | publish --controller-sha SHA --approve CONTINUATION_SHA',
    authority:'One unchanged package after two proven read-only failures. Retain all prior markers/charges; no batch, new budget, claim or deadline.'};
  if(process.versions.node.split('.')[0]!=='22'||Object.keys(process.env).some(k=>/^(AMAZON_|OPENAI_|POSTGRES_|VERCEL_|CATALOG_|CLOUDFLARE_API_TOKEN)/.test(k)))fail('environment');
  if(args[0]==='prepare'&&args.length===3&&args[1]==='--controller-sha')return prepare(args[2]);
  if(args[0]==='publish'&&args.length===5&&args[1]==='--controller-sha'&&args[3]==='--approve'){
    await prior();return publishPreparedUpload(args[2],join(OUTPUT,'continuation.json'),args[4]);
  }
  fail('arguments');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)editorialTransportContinuation(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{
  const m=e instanceof Error?e.message:'';console.error(/^[a-z0-9_]{1,150}$/.test(m)?m:'editorial_transport_refused');process.exitCode=1;});
