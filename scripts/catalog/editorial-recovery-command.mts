import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './migration.ts';
import {readRunWorkspace,openRunWorkspace} from './run-workspace.ts';
import type {RunWorkspace,RunWorkspaceOptions} from './run-workspace.ts';
import {executionAdoptionDigest,validateExecutionAdoption,validateExecutionAdoptionConfigs} from './execution-adoption.ts';
import type {ExecutionAdoption} from './execution-adoption.ts';
import {validateCloudflareWeeklyConfig,runCloudflareWeekly,weeklyCommandSummary} from './run-cloudflare-weekly.ts';
import {createCatalogD1Rest} from './d1-write-rest.ts';
import {resolveWranglerOAuth} from './check-cloudflare-runner.ts';
import {captureEditorialRepair,prepareEditorialRepair,applyEditorialRepair,editorialRepairSha256,assertEditorialRecoveryWindow} from './editorial-recovery.ts';
import type {EditorialRecoveryContext,EditorialRepairPlan} from './editorial-recovery.ts';
import {accountedPublicationFetch} from './publication-read-fetch.ts';
import {createEditorialSuccessorFiles,createEditorialSuccessorObserver,reconcileEditorialRecoverySuccessor} from './editorial-recovery-successor.ts';
import type {EditorialSuccessorPointer} from './editorial-recovery-successor.ts';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url))),BASE=join(homedir(),'.codex/private/goose-gifts-migration');
const CARE=join(BASE,'daily-catalog-care'),DAY=join(CARE,'2026-10-24'),WORKSPACE=join(BASE,'weekly-runs');
const RUN='daily-2026-10-24-628707b5',CONFIG='f56748cd3c1408cd41190464fd580c97a916cfd5cc7162c27415eeb45c3ae3f1';
const CHECKPOINT='65164fa2aeecc60a824396af4505f9a885d9b4ce36cef17917408bd9dff17d64';
const bytesHash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const now=()=>new Date().toISOString();
function fail(code:string):never{throw Error('editorial_command_'+code);}
const git=(root:string,...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
async function read<T=Record<string,unknown>>(path:string,expected?:string):Promise<{value:T;sha256:string}>{
  if(resolve(path)!==path||await fs.realpath(path)!==path)fail('private_path');
  const s=await fs.lstat(path);if(!s.isFile()||s.uid!==process.getuid?.()||s.nlink!==1||(s.mode&0o777)!==0o600||s.size>32*1024*1024)fail('private_file');
  const fd=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{
    const a=await fd.stat();if(a.ino!==s.ino||a.dev!==s.dev||a.size!==s.size||a.nlink!==1||(a.mode&0o777)!==0o600)fail('private_changed');
    const b=await fd.readFile(),hash=bytesHash(b);if(expected&&hash!==expected)fail('digest');
    return{value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b)) as T,sha256:hash};
  }finally{await fd.close();}
}
async function put(path:string,value:unknown){
  const parent=dirname(path),s=await fs.lstat(parent);if(await fs.realpath(parent)!==parent||!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o700)fail('private_directory');
  const b=Buffer.from(JSON.stringify(value)+'\n');let fd;
  try{fd=await fs.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||(await read(path)).sha256!==bytesHash(b))fail('immutable_changed');return bytesHash(b);}
  try{await fd.writeFile(b);await fd.sync();}finally{await fd.close();}
  const dir=await fs.open(parent,constants.O_RDONLY|constants.O_DIRECTORY);try{await dir.sync();}finally{await dir.close();}
  if((await read(path)).sha256!==bytesHash(b))fail('readback');return bytesHash(b);
}
interface Job {
  schemaVersion:1;adoption:ExecutionAdoption;workspace:RunWorkspaceOptions;context:EditorialRecoveryContext;
  configPath:string;effectiveConfigPath:string;effectiveConfigSha256:string;approvalPath:string;approvalFileSha256:string;
  previous:EditorialSuccessorPointer;previousPublication:{releaseId:string;receiptSha256:string};capacity:Record<string,unknown>;
}
function clean(root=ROOT,expected?:string){
  const code=git(root,'rev-parse','HEAD');if(expected&&code!==expected||git(root,'status','--porcelain','--untracked-files=all'))fail('source');return code;
}
function scrubbed(){if(process.versions.node.split('.')[0]!=='22'||Object.keys(process.env).some(k=>/^(AMAZON_|OPENAI_|POSTGRES_|VERCEL_|CATALOG_|CLOUDFLARE_API_TOKEN)/.test(k)))fail('environment');}

/** OFFLINE preparation only. No lock, credential, HTTP, owner or original-file
 * mutation. The resulting digest still needs explicit live authorization. */
async function prepare(output:string,cutoff:string){
  const code=clean(),original=(await read(join(DAY,'config.json'),CONFIG)).value as unknown as Parameters<typeof validateCloudflareWeeklyConfig>[0];
  const cfg=validateCloudflareWeeklyConfig(original);clean(cfg.publication.sourceRoot,cfg.codeSha);
  const manifest=(await read(join(WORKSPACE,'runs',RUN,'manifest.json'))).value as unknown as RunWorkspace['manifest'];
  const workspace:RunWorkspaceOptions={directory:WORKSPACE,repository:cfg.publication.sourceRoot,mode:'resume',runId:RUN,
    codeSha:cfg.codeSha,configSha256:CONFIG,scope:manifest.scope,retention:manifest.retention,budgetCaps:manifest.budgetCaps};
  const status=await readRunWorkspace(workspace),head=(await read(join(status.directory,'head.json'))).value as unknown as {sequence:number;sha256:string};
  if(status.execution||status.checkpoint?.sha256!==CHECKPOINT||status.checkpoint.checkpoint.phase!=='phases_complete')fail('original_state');
  const stored=(await read(join(status.directory,'objects',CHECKPOINT+'.json'))).value as {value:EditorialRecoveryContext['checkpoint'];sha256:string};
  if(stored.sha256!==CHECKPOINT||editorialRepairSha256(stored.value)!==CHECKPOINT||!stored.value.owner)fail('checkpoint');
  const oldContext=(await read(cfg.inputs.context.path,cfg.inputs.context.sha256)).value as unknown as ExecutionAdoption['contexts']['original'];
  const oldStored=(await read(join(status.directory,stored.value.pins.context.reference))).value as {observedAt:string;expiresAt:string;value:unknown};
  if(!same(oldStored.value,oldContext))fail('original_context');
  const replacement={...oldContext,cutoff},notAfter=oldStored.expiresAt;
  const effective={...cfg,codeSha:code,publication:{...cfg.publication,codeSha:code,sourceRoot:ROOT}};
  const out=resolve(output);if(out.startsWith(WORKSPACE+'/')||out===WORKSPACE||out.startsWith(CARE+'/')||out===CARE||out.startsWith(ROOT+'/'))fail('output');
  await fs.mkdir(out,{mode:0o700});if(await fs.realpath(out)!==out)fail('output');
  const effectivePath=join(out,'execution-config.json'),effectiveSha=await put(effectivePath,effective);
  const refSha=sha256(canonicalJson(replacement));
  const draft={schemaVersion:1 as const,kind:'catalog-execution-adoption-v1' as const,
    original:{manifestSha256:status.manifestSha256,configSha256:CONFIG,codeSha:cfg.codeSha,sourceRoot:cfg.publication.sourceRoot,
      checkpointSha256:CHECKPOINT,owner:stored.value.owner,context:stored.value.pins.context,journal:head,budgetCaps:manifest.budgetCaps},
    effective:{codeSha:code,sourceRoot:ROOT,configSha256:effectiveSha,publicationConfigSha256:sha256(canonicalJson(effective.publication))},
    contexts:{original:oldContext,replacement,ref:{sha256:refSha,reference:'objects/'+refSha+'.json'}},approvedAt:now(),observedAt:oldStored.observedAt,notAfter};
  const adoption:ExecutionAdoption={...draft,approvalSha256:executionAdoptionDigest(draft)};validateExecutionAdoption(adoption);validateExecutionAdoptionConfigs(cfg,effective,adoption);
  if(now()>=cutoff||now()>=notAfter)fail('expired');
  const approvalPath=join(out,'execution-approval.json'),approvalFileSha256=await put(approvalPath,adoption);
  const originalProposal=(await read(join(DAY,'reviewed-proposal.json'))).value as unknown as EditorialRecoveryContext['originalProposal'];
  const proposalSha=sha256(JSON.stringify(originalProposal)+'\n');if(proposalSha!=='7add492a22821a5a2f3c5d5e5c514a84fb8f15680c16a04008b9160351dccca3')fail('original_proposal');
  const snapshotPath=join(WORKSPACE,'runs/storefront-da7a1e0c1523/packages/storefront-da7a1e0c1523/catalog.snapshot.json');
  const snapshot=await read<{products:EditorialRecoveryContext['baseline']}>(snapshotPath,oldContext.snapshotSha256);
  const snapshotBytes=await fs.readFile(snapshotPath,'utf8');
  const reservation=await fs.readFile(join(WORKSPACE,'cadence/daily-2026-10-24.json'));
  const operator=(await read(join(DAY,'operator.json'))).value;
  const preparation=(await read(join(DAY,'prepare-intent.json'))).value;
  const context:EditorialRecoveryContext={schemaVersion:1,binding:{runId:RUN,configSha256:CONFIG,sourceSha:cfg.codeSha,
    manifestSha256:status.manifestSha256,checkpointSha256:CHECKPOINT,reservationSha256:bytesHash(reservation),journal:head,scope:manifest.scope,
    cutoff,notAfter,owner:stored.value.owner,baselineSnapshotSha256:snapshot.sha256,minimumBudget:status.budget},checkpoint:stored.value,
    originalProposal,originalProposalSha256:proposalSha,affectedIds:['B09HT6ZC7K','B07KGJS2F3','B01KR3SAIS','B07VLBVQBP','B00KJJOWZG','B0BGXLMHRV','B0DCNB17CD','B07B4PP1BB'],
    baseline:snapshot.value.products.filter(p=>originalProposal.changes.some(c=>c.publicId===p.publicId)),baselineSnapshotJson:snapshotBytes};
  const job:Job={schemaVersion:1,adoption,workspace:{...workspace,expectedManifestSha256:status.manifestSha256},context,configPath:join(DAY,'config.json'),effectiveConfigPath:effectivePath,effectiveConfigSha256:effectiveSha,
    approvalPath,approvalFileSha256,previous:preparation.prior as EditorialSuccessorPointer,previousPublication:oldContext.priorPublication!,capacity:operator.capacity as Record<string,unknown>};
  if(!same((await read(join(status.directory,'head.json'))).value,head))fail('head_changed');
  const jobPath=join(out,'job.json'),jobSha256=await put(jobPath,job);
  await loadJob(jobPath,jobSha256); // Exercise the exact live-path input gates without locks or providers.
  if(!same((await read(join(status.directory,'head.json'))).value,head))fail('head_changed');
  return{state:'prepared_offline',jobPath,jobSha256,approvalSha256:adoption.approvalSha256,cutoff,sourceEvidenceNotAfter:notAfter};
}
async function loadJob(path:string,hash:string){
  const {value:job}=await read<Job>(path,hash);if(job.schemaVersion!==1||job.workspace.runId!==RUN||job.workspace.configSha256!==CONFIG)fail('job');
  validateExecutionAdoption(job.adoption);clean(ROOT,job.adoption.effective.codeSha);
  if(job.configPath!==join(DAY,'config.json'))fail('original_config_path');
  const old=validateCloudflareWeeklyConfig((await read(join(DAY,'config.json'),CONFIG)).value as never);
  clean(old.publication.sourceRoot,old.codeSha);
  const manifest=(await read(join(WORKSPACE,'runs',RUN,'manifest.json'))).value as unknown as RunWorkspace['manifest'];
  const manifestSha256=sha256(canonicalJson(manifest)),scope={environment:old.environment,accountId:old.accountId,
    databaseId:old.database.id,databaseName:old.database.name,workerName:old.publication.workerName,indexName:old.vectorIndex.name};
  const caps={httpRequests:old.limits.requests,sqlStatements:old.limits.statements};
  const expectedWorkspace:RunWorkspaceOptions={directory:WORKSPACE,repository:old.publication.sourceRoot,mode:'resume',runId:RUN,
    codeSha:old.codeSha,configSha256:CONFIG,scope,retention:old.retention,budgetCaps:caps,expectedManifestSha256:manifestSha256};
  if(!same(job.workspace,expectedWorkspace)||manifest.runId!==RUN||manifest.configSha256!==CONFIG||manifest.codeSha!==old.codeSha
    ||!same(manifest.scope,scope)||!same(manifest.retention,old.retention)||!same(manifest.budgetCaps,caps))fail('original_workspace');
  const effective=validateCloudflareWeeklyConfig((await read(job.effectiveConfigPath,job.effectiveConfigSha256)).value as never);
  validateExecutionAdoptionConfigs(old,effective,job.adoption);
  const b=job.context.binding,a=job.adoption;
  const proposal=(await read(join(DAY,'reviewed-proposal.json'),'7add492a22821a5a2f3c5d5e5c514a84fb8f15680c16a04008b9160351dccca3')).value;
  const operator=(await read(join(DAY,'operator.json'))).value,preparation=(await read(join(DAY,'prepare-intent.json'))).value;
  const originalContext=(await read(old.inputs.context.path,old.inputs.context.sha256)).value;
  if(!same((await read(job.approvalPath,job.approvalFileSha256)).value,job.adoption)
    ||job.adoption.original.configSha256!==CONFIG||job.adoption.effective.configSha256!==job.effectiveConfigSha256
    ||a.original.manifestSha256!==manifestSha256||a.original.checkpointSha256!==CHECKPOINT||editorialRepairSha256(job.context.checkpoint)!==CHECKPOINT
    ||!same(a.original.budgetCaps,caps)||!same(a.contexts.original,originalContext)||!same(a.original.context,job.context.checkpoint.pins.context)
    ||!same(job.capacity,operator.capacity)||!same(job.previous,preparation.prior)||!same(job.previousPublication,a.contexts.original.priorPublication)
    ||a.effective.sourceRoot!==ROOT||job.workspace.repository!==old.publication.sourceRoot||job.workspace.codeSha!==old.codeSha
    ||b.runId!==RUN||b.configSha256!==CONFIG||b.sourceSha!==a.original.codeSha||b.manifestSha256!==a.original.manifestSha256
    ||b.checkpointSha256!==a.original.checkpointSha256||b.cutoff!==a.contexts.replacement.cutoff||b.notAfter!==a.notAfter
    ||b.baselineSnapshotSha256!==a.contexts.original.snapshotSha256||bytesHash(Buffer.from(job.context.baselineSnapshotJson))!==b.baselineSnapshotSha256
    ||!same(b.journal,a.original.journal)||!same(job.context.originalProposal,proposal)
    ||!same(scope,b.scope)||!same(b.owner,a.original.owner)||!same(job.context.checkpoint.owner,a.original.owner)
    ||bytesHash(await fs.readFile(join(WORKSPACE,'cadence/daily-2026-10-24.json')))!==b.reservationSha256)fail('job');
  return{job,old,effective,directory:dirname(path)};
}
async function database(w:RunWorkspace,job:Job){
  const token=await resolveWranglerOAuth(),b=await w.budget(),id=randomUUID();
  // The original headroom policy is reused, not raised. Metadata HTTP is also
  // charged to this exact ledger; failures retain an unknown, never a refund.
  const {headroom}=await import(pathToFileURL(join(job.workspace.repository,'scripts/catalog/daily-operator.mjs')).href);
  const send:typeof fetch=async(input,init)=>{const url=String(input);if(url!=='https://api.cloudflare.com/client/v4/graphql'||init?.method!=='POST')fail('metadata_scope');
    await w.reserveBudget({id,requestSha256:sha256(url+String(init.body)),units:{httpRequests:1,sqlStatements:0}});
    let response;try{response=await fetch(input,{...init,signal:AbortSignal.timeout(15000)});}catch{await w.settleBudget(id,{status:'unknown',usage:null});throw Error('editorial_command_headroom_unknown');}
    await w.settleBudget(id,{status:'known',usage:{rowsRead:0,rowsWritten:0}});return response;};
  await headroom(token,b,job.capacity,send);
  const s=w.manifest.scope,cfg=validateCloudflareWeeklyConfig((await read(job.configPath,CONFIG)).value as never);
  const db=await createCatalogD1Rest({accountId:s.accountId,databaseId:s.databaseId,databaseName:s.databaseName,token,limits:cfg.limits,
    accounting:{scope:{accountId:s.accountId,databaseId:s.databaseId,databaseName:s.databaseName},initial:await w.budget(),reserve:r=>w.reserveBudget(r),settle:(r,x)=>w.settleBudget(r,x)}});
  return db;
}
interface Bundle {jobSha256:string;planSha256:string;contextSha256:string;proposalSha256:string;planRef:{sha256:string;reference:string}}
async function execute(command:string,jobPath:string,jobSha:string,approval?:string){
  const {job,directory,effective}=await loadJob(jobPath,jobSha),w=await openRunWorkspace(job.workspace);
  let closed=false;
  try{
    if(command==='adopt'){
      if(approval!==job.adoption.approvalSha256)fail('explicit_adoption_approval');
      const result=await w.adoptExecution(job.adoption);return{state:'adopted',approvalSha256:result.approvalSha256};
    }
    if(!same(w.execution,job.adoption))fail('adoption_required');
    if(command==='capture'){
      if(approval!==job.adoption.approvalSha256)fail('explicit_capture_approval');assertEditorialRecoveryWindow(job.context.binding,now());
      const intent=join(directory,'capture-intent.json');await put(intent,{jobSha256:jobSha,kind:'one-bounded-capture'});
      try{await fs.lstat(join(directory,'bundle.json'));fail('capture_already_recorded');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      const db=await database(w,job),capture=await captureEditorialRepair({db,context:job.context,checkpoint:async()=>{const c=await w.readCheckpoint();if(!c)fail('checkpoint');return c;},budget:()=>w.budget(),now});
      const plan=prepareEditorialRepair(job.context,capture,now()),raw=Buffer.from(JSON.stringify(plan)+'\n');
      const planRef=await w.putBlob(raw,{kind:'phase',observedAt:job.adoption.observedAt});
      const bundle:Bundle={jobSha256:jobSha,planSha256:editorialRepairSha256(plan),contextSha256:editorialRepairSha256(job.context),proposalSha256:sha256(JSON.stringify(plan.proposal)+'\n'),planRef};
      await put(join(directory,'repair-proposal.json'),plan.proposal);const bundleSha256=await put(join(directory,'bundle.json'),bundle);
      return{state:'captured_requires_review',bundleSha256,...bundle};
    }
    if(command==='reconcile'){
      if(approval!==job.adoption.approvalSha256)fail('explicit_reconcile_approval');
      const completed=await w.readCheckpoint({controlOnly:true});if(completed?.checkpoint.phase!=='finalized'||completed.checkpoint.owner!==null)fail('not_finalized');
      const db=await database(w,job),send=accountedPublicationFetch(w,fetch,{...w.manifest.scope,identityOrigin:effective.publication.identityOrigin});
      return reconcileEditorialRecoverySuccessor({workspace:w,binding:{runId:RUN,originalConfigSha256:CONFIG,originalCodeSha:job.workspace.codeSha,
        publicationConfigSha256:job.adoption.effective.publicationConfigSha256,executionCodeSha:job.adoption.effective.codeSha,scope:w.manifest.scope,
        publicProducts:2359,heldProducts:1024,previous:job.previous,previousPublication:job.previousPublication},
        store:await createEditorialSuccessorFiles(CARE,DAY),observe:createEditorialSuccessorObserver({db,send,scope:w.manifest.scope,identityOrigin:effective.publication.identityOrigin})});
    }
    const bundle=(await read<Bundle>(join(directory,'bundle.json'))).value;if(bundle.jobSha256!==jobSha)fail('bundle');
    const plan=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await w.readBlob(bundle.planRef))) as EditorialRepairPlan;
    if(editorialRepairSha256(plan)!==bundle.planSha256||editorialRepairSha256(plan.context)!==bundle.contextSha256||!same(plan.context,job.context))fail('plan');
    if(command==='review')return{state:'offline_review',planSha256:bundle.planSha256,proposalSha256:bundle.proposalSha256,
      changes:plan.patches.map(p=>({id:p.id,slug:p.after.slug,articleSha256:sha256(String(JSON.parse(String(p.after.public_display_json)).editorialWriteup)),indexable:JSON.parse(String(p.after.public_display_json)).indexable}))};
    if(command==='repair'){
      if(approval!==bundle.planSha256)fail('explicit_repair_approval');assertEditorialRecoveryWindow(job.context.binding,now());
      const db=await database(w,job),result=await applyEditorialRepair({db,plan,planSha256:bundle.planSha256,contextSha256:bundle.contextSha256,now,
        checkpoint:{read:async()=>{const c=await w.readCheckpoint();if(!c)fail('checkpoint');return c;},write:(sha,c)=>w.writeCheckpoint(sha,c)}});
      return{state:result.state,operationId:result.operationId,planSha256:result.planSha256};
    }
    if(command==='publish'){
      if(approval!==bundle.proposalSha256)fail('explicit_proposal_approval');
      const cp=await w.readCheckpoint({controlOnly:true});if(!cp?.checkpoint.control?.publication?.permit)assertEditorialRecoveryWindow(job.context.binding,now());
      await database(w,job);await w.close();closed=true;
      const result=await runCloudflareWeekly({command:'resume',configPath:job.configPath,configSha256:CONFIG,workspace:WORKSPACE,cadenceOnly:true,
        recovery:{path:job.approvalPath,sha256:job.approvalFileSha256,configPath:job.effectiveConfigPath,configSha256:job.effectiveConfigSha256},approval:{path:join(directory,'repair-proposal.json'),sha256:bundle.proposalSha256}});
      return weeklyCommandSummary(result);
    }
    fail('command');
  }finally{if(!closed)await w.close();}
}
export async function recoveryCommand(args:string[]){
  scrubbed();if(args.length===1&&args[0]==='--help')return{usage:'prepare --output NEW_PRIVATE_DIR --cutoff ISO | <adopt|capture|review|repair|publish|reconcile> --job FILE --job-sha256 SHA [--approve DIGEST]',
    authority:'Offline prepare/help only until explicit live approval. No start/provider phase, new quota, ownership reset or evidence renewal.'};
  const command=args[0];if(command==='prepare'&&args.length===5&&args[1]==='--output'&&args[3]==='--cutoff')return prepare(args[2],args[4]);
  if(!['adopt','capture','review','repair','publish','reconcile'].includes(command)||![5,7].includes(args.length)||args[1]!=='--job'||args[3]!=='--job-sha256'||args.length===7&&args[5]!=='--approve')fail('arguments');
  return execute(command,resolve(args[2]),args[4],args[6]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)recoveryCommand(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{
  const message=e instanceof Error?e.message:'';console.error(/^[a-z0-9_]{1,150}$/.test(message)?message:'editorial_command_refused');process.exitCode=1;});
