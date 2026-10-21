import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openRunWorkspace, readRunWorkspace } from '../scripts/catalog/run-workspace.ts';
import { purgeCompletedWorkspaces, WORKSPACE_SWEEP_LIMITS } from '../scripts/catalog/purge-workspaces.ts';
import { canonicalJson } from '../scripts/catalog/migration.ts';

const NOW='2026-10-21T12:00:00.000Z',EXPIRED='2026-10-21T14:00:00.000Z';
const scope={environment:'staging',accountId:'fixture-account',databaseId:'fixture-db',databaseName:'fixture-db',workerName:'fixture-worker',indexName:'fixture-index'};
const retention={reviewReference:'test-only/approved-retention',rules:Object.fromEntries(['amazon-observation','embedding-response','phase','publication','checkpoint']
  .map(kind=>[kind,{maxAgeMs:3600000,notAfter:'2026-10-22T00:00:00.000Z'}]))};
async function fixture(t){
  const parent=await mkdtemp(join(await realpath(tmpdir()),'goose-sweep-test-'));await chmod(parent,0o700);
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const repository=join(parent,'source'),directory=join(parent,'workspace');await mkdir(repository,{mode:0o700});
  let clock=NOW;const handles=[];
  const input={directory,repository,now:()=>clock};
  const options=runId=>({...input,mode:'create',runId,codeSha:'a'.repeat(40),configSha256:'b'.repeat(64),scope,retention,budgetCaps:{httpRequests:20,sqlStatements:40}});
  async function run(runId='old-run',{phase='finalized',publication=false,close=true,owner=null,control}={}){
    const w=await openRunWorkspace(options(runId));handles.push(w);
    const artifact=await w.putArtifact({private:'TEST ONLY EXPIRED MERCHANT BODY'},{kind:'phase',observedAt:NOW});
    if(publication){await w.preparePublicationDirectories('fixture-release',NOW,null);
      await mkdir(join(w.directory,'packages/fixture-release'),{mode:0o700});
      await writeFile(join(w.directory,'packages/fixture-release/body.json'),'TEST ONLY PACKAGE BODY',{mode:0o600});}
    await w.reserveBudget({id:'uncertain',requestSha256:'c'.repeat(64),units:{httpRequests:1,sqlStatements:0}});
    await w.writeCheckpoint(null,{phase,owner,state:{private:'TEST ONLY CHECKPOINT BODY'},pins:{artifact},phaseComplete:null,...(control?{control}:{})});
    if(close)await w.close();return{w,artifact};
  }
  t.after(async()=>{for(const w of handles)try{await w.close();}catch{}});
  return{parent,input,options,run,setNow:value=>{clock=value;}};
}

test('completed-run sweep purges yesterday under its exact manifest and retains control/budget history idempotently',async t=>{
  const f=await fixture(t),{w,artifact}=await f.run('yesterday',{publication:true});
  const manifest=await readFile(join(w.directory,'manifest.json'));f.setNow(EXPIRED);
  const report=await purgeCompletedWorkspaces(f.input);assert.equal(report.reviewRequired,false);assert.equal(report.busy,false);
  assert.deepEqual(report.runs,[{runId:'yesterday',state:'cleaned',purged:3}]);
  assert.deepEqual(await readdir(join(w.directory,'objects')),[]);await assert.rejects(lstat(join(w.directory,'packages/fixture-release')),{code:'ENOENT'});
  assert.deepEqual(await readFile(join(w.directory,'manifest.json')),manifest);
  const status=await readRunWorkspace({...f.options('yesterday'),mode:'resume'});
  assert.equal(status.checkpoint.checkpoint.phase,'finalized');assert.equal(status.budget.unconfirmedRequests,1);
  assert.equal(status.expired.length,3);assert.ok(!JSON.stringify(report).includes('TEST ONLY'));
  const again=await purgeCompletedWorkspaces(f.input);assert.deepEqual(again.runs,[{runId:'yesterday',state:'retained',purged:0}]);
  const resumed=await openRunWorkspace({...f.options('yesterday'),mode:'resume'});
  await assert.rejects(resumed.readArtifact(artifact),/expired/);await resumed.close();
});

test('fresh finalized runs are retained; unfinished runs need review; held locks stay busy without takeover',async t=>{
  const f=await fixture(t);await f.run('fresh');await f.run('unfinished',{phase:'attention'});
  const fresh=await purgeCompletedWorkspaces(f.input);
  assert.deepEqual(fresh.runs.map(r=>[r.runId,r.state]),[['fresh','retained'],['unfinished','review']]);
  assert.equal(fresh.runs[1].reasonCode,'unfinished_run');assert.equal(fresh.reviewRequired,true);
  const held=await f.run('locked',{close:false});f.setNow(EXPIRED);
  const busy=await purgeCompletedWorkspaces(f.input);assert.equal(busy.busy,true);assert.equal(busy.reviewRequired,false);
  assert.equal(busy.runs.find(r=>r.runId==='locked').state,'busy');assert.equal(busy.runs.find(r=>r.runId==='unfinished').state,'busy');
  assert.equal((await readdir(join(held.w.directory,'objects'))).length,2);
  assert.equal((await readdir(join(f.input.directory,'locks'))).length,3);
});

test('interrupted activation purges expired bodies while preserving exact checkpoint owner/control and uncertain budget',async t=>{
  const f=await fixture(t),hash='b'.repeat(64);
  const owner={environment:scope.environment,indexName:scope.indexName,token:'fixture-owner',generation:1,epoch:7,phase:'activating',
    ownerReference:'fixture/run',operationKey:hash,capturedAt:NOW};
  const request={schemaVersion:1,environment:scope.environment,sourceRevision:'fixture-revision',sourceDigest:hash,codeSha:'a'.repeat(40),
    priorReleaseId:null,capturedAt:NOW,cutoff:EXPIRED};
  const intent={releaseId:'fixture-release',codeSha:request.codeSha,catalogRevision:request.sourceRevision,vectorSyncWatermark:0,
    priorReleaseId:null,nextExpiry:EXPIRED,catalogSnapshotSha256:hash,manifestSha256:hash};
  const publication={schemaVersion:1,configSha256:hash,requestId:'fixture-request',runReference:'fixture/run',stage:'activating',
    build:{requestId:'fixture-request',token:'fixture-build',runReference:'fixture/run',leaseUntil:EXPIRED,request},
    publication:{intentId:'fixture-intent',token:'fixture-publication',leaseUntil:EXPIRED,intent},intent,
    permit:{requestId:'fixture-request',token:'fixture-build',runReference:'fixture/run',releaseId:'fixture-release',versionReference:'fixture-version',mutationOwner:owner},
    vectorPlan:{catalogRevision:request.sourceRevision,planSha256:hash,ids:[]},packageSha256:hash,uploadMarker:'fixture-upload',
    versionReference:'fixture-version',deploymentMarker:'fixture-activation',deploymentId:null};
  const {w,artifact}=await f.run('interrupted',{phase:'attention',publication:true,owner,control:{publication}});
  const before=await readRunWorkspace({...f.options('interrupted'),mode:'resume'});f.setNow(EXPIRED);
  const report=await purgeCompletedWorkspaces(f.input);
  assert.deepEqual(report.runs,[{runId:'interrupted',state:'review',purged:3,reasonCode:'unfinished_run'}]);
  assert.equal(report.reviewRequired,true);assert.deepEqual(await readdir(join(w.directory,'objects')),[]);
  await assert.rejects(lstat(join(w.directory,'packages/fixture-release')),{code:'ENOENT'});
  const after=await readRunWorkspace({...f.options('interrupted'),mode:'resume'});
  assert.deepEqual(after.checkpoint,before.checkpoint);assert.deepEqual(after.budget,before.budget);
  assert.equal(after.checkpoint.checkpoint.owner.phase,'activating');assert.equal(after.checkpoint.checkpoint.control.publication.deploymentId,null);
  const resumed=await openRunWorkspace({...f.options('interrupted'),mode:'resume'});
  await assert.rejects(resumed.readArtifact(artifact),/expired/);assert.equal((await resumed.budget()).unconfirmedRequests,1);await resumed.close();
  assert.equal((await purgeCompletedWorkspaces(f.input)).runs[0].purged,0);
});

test('unregistered legacy output/history is reported, never adopted or deleted',async t=>{
  const f=await fixture(t),{w}=await f.run();
  const legacy=join(w.directory,'packages/legacy-release');await mkdir(legacy,{recursive:true,mode:0o700});
  await writeFile(join(legacy,'history'),'KEEP IMPORTED HISTORY',{mode:0o600});
  await writeFile(join(w.directory,'legacy-upload.ndjson'),'KEEP LEGACY OUTPUT',{mode:0o600});
  await writeFile(join(w.directory,'objects','.pending-unclassified'),'KEEP PARTIAL HISTORY',{mode:0o600});f.setNow(EXPIRED);
  const result=(await purgeCompletedWorkspaces(f.input)).runs[0];
  assert.equal(result.state,'review');assert.equal(result.reasonCode,'unregistered_outputs');assert.equal(result.purged,2);
  assert.equal(await readFile(join(legacy,'history'),'utf8'),'KEEP IMPORTED HISTORY');
  assert.equal(await readFile(join(w.directory,'legacy-upload.ndjson'),'utf8'),'KEEP LEGACY OUTPUT');
  assert.equal(await readFile(join(w.directory,'objects','.pending-unclassified'),'utf8'),'KEEP PARTIAL HISTORY');
});

test('archived source ownership is review-only, never transferred to the supplied current checkout',async t=>{
  const f=await fixture(t),{w}=await f.run('archived',{publication:true});
  const current=join(f.parent,'current-source');await mkdir(current,{mode:0o700});f.setNow(EXPIRED);
  const report=await purgeCompletedWorkspaces({...f.input,repository:current});
  assert.equal(report.runs[0].reasonCode,'source_checkout_review');assert.equal(report.reviewRequired,true);
  assert.equal((await readdir(join(w.directory,'objects'))).length,2);assert.ok(await lstat(join(w.directory,'packages/fixture-release/body.json')));
});

test('unsafe sibling/run links are refused before any deletion and cannot escape the canonical root',async t=>{
  const f=await fixture(t),{w}=await f.run();const outside=join(f.parent,'imported');await mkdir(outside,{mode:0o700});
  await writeFile(join(outside,'history'),'KEEP OUTSIDE',{mode:0o600});await symlink(outside,join(f.input.directory,'runs','linked-run'));f.setNow(EXPIRED);
  await assert.rejects(purgeCompletedWorkspaces(f.input),/private_path/);
  assert.equal((await readdir(join(w.directory,'objects'))).length,2);assert.equal(await readFile(join(outside,'history'),'utf8'),'KEEP OUTSIDE');
  await symlink(f.input.directory,join(f.parent,'linked-root'));
  await assert.rejects(purgeCompletedWorkspaces({...f.input,directory:join(f.parent,'linked-root')}),/private_path/);
});

test('unclassified object/event links fail closed without purging otherwise valid bodies',async t=>{
  for(const directory of ['objects','events'])await t.test(directory,async sub=>{
    const f=await fixture(sub),{w}=await f.run();const outside=join(f.parent,'history');
    await writeFile(outside,'KEEP PRIVATE HISTORY',{mode:0o600});await symlink(outside,join(w.directory,directory,'.pending-unknown'));
    f.setNow(EXPIRED);const report=await purgeCompletedWorkspaces(f.input);
    assert.equal(report.reviewRequired,true);assert.equal(report.runs[0].purged,0);
    assert.equal(await readFile(outside,'utf8'),'KEEP PRIVATE HISTORY');
    const artifacts=(await readdir(join(w.directory,'objects'))).filter(name=>name.endsWith('.json'));assert.equal(artifacts.length,2);
  });
});

test('corrupt, noncanonical, oversized or hardlinked manifests fail closed per run',async t=>{
  for(const kind of ['json','noncanonical','oversized','hardlink','schema'])await t.test(kind,async sub=>{
    const f=await fixture(sub),{w}=await f.run(),path=join(w.directory,'manifest.json');
    const bytes=await readFile(path),manifest=JSON.parse(bytes);
    if(kind==='hardlink')await link(path,join(f.parent,'manifest-alias'));
    else if(kind==='json')await writeFile(path,'{partial');
    else if(kind==='noncanonical')await writeFile(path,JSON.stringify(manifest));
    else if(kind==='oversized')await writeFile(path,'x'.repeat(WORKSPACE_SWEEP_LIMITS.manifestBytes+1));
    else await writeFile(path,`${canonicalJson({...manifest,unexpected:true})}\n`);
    f.setNow(EXPIRED);const report=await purgeCompletedWorkspaces(f.input);
    assert.equal(report.reviewRequired,true);assert.equal(report.runs[0].purged,0);assert.equal((await readdir(join(w.directory,'objects'))).length,2);
  });
});

test('run enumeration is bounded and CLI help has no filesystem/provider side effects',async t=>{
  const f=await fixture(t);await f.run();
  for(let i=0;i<WORKSPACE_SWEEP_LIMITS.runs;i++)await mkdir(join(f.input.directory,'runs',`extra-${i}`),{mode:0o700});
  await assert.rejects(purgeCompletedWorkspaces(f.input),/entries/);
  const help=spawnSync(process.execPath,['--experimental-strip-types',new URL('../scripts/catalog/purge-workspaces.ts',import.meta.url).pathname,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/--workspace .* --repository/);
});
