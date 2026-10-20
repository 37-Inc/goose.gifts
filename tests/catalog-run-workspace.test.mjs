import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, realpath, chmod, mkdir, readFile, writeFile, readdir, lstat, symlink, link, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openRunWorkspace, readRunWorkspace, WORKSPACE_BLOB_LIMITS } from '../scripts/catalog/run-workspace.ts';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { createCatalogProviderEvidence } from '../scripts/catalog/provider-evidence.ts';
import { encodePgvectorSendBase64, decodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';

// Isolated local fixtures only. No providers, credentials, real merchant content,
// automatic deletion policy, database writes or public artifacts.
const NOW='2026-10-20T12:00:00.000000Z',LATER='2026-10-20T14:00:00.000000Z';
const HASH='a'.repeat(64),CODE='b'.repeat(40),ID='B000000001';
const scope={environment:'staging',accountId:'test-account',databaseId:'test-db',databaseName:'test-db-name',workerName:'test-worker',indexName:'test-index'};
const kinds=['amazon-observation','embedding-response','phase','publication','checkpoint'];
function policy(){return{reviewReference:'test-only/reviewed-retention',rules:Object.fromEntries(kinds.map(kind=>[kind,{maxAgeMs:3_600_000,notAfter:'2026-10-21T00:00:00.000Z'}]))};}
async function fixture(t,overrides={}){
  const parent=await mkdtemp(join(await realpath(tmpdir()),'goose-workspace-test-'));await chmod(parent,0o700);
  t.after(()=>rm(parent,{recursive:true,force:true}));let clock=NOW;
  const input={directory:join(parent,'workspace'),repository:await realpath(new URL('..',import.meta.url).pathname),mode:'create',runId:'test-run',
    configSha256:HASH,codeSha:CODE,scope,retention:policy(),budgetCaps:{httpRequests:30,sqlStatements:100},now:()=>clock,...overrides};
  const handles=[];const open=async(options={})=>{const w=await openRunWorkspace({...input,...options});handles.push(w);return w;};
  t.after(async()=>{for(const w of handles.reverse())try{await w.close();}catch{/* deliberately corrupt/closed fixtures */}});
  return{parent,input,open,setNow:value=>{clock=value;}};
}
const cp=(state={private:'test-only'})=>({phase:'created',owner:null,state,pins:{},phaseComplete:null});
const observation=()=>({schemaVersion:1,kind:'amazon-observation',operation:'getItems',observedAt:NOW,
  products:[{id:ID,availabilityStatus:'IN_STOCK',sourceFactsHash:HASH,snapshot:{title:'TEST ONLY gift',imageUrl:'https://example.invalid/test.jpg',sourceFacts:{fixture:true}}}],
  returnedIds:[ID],requestedIds:[ID]});
const reservation=(id='request-1',sqlStatements=2)=>({id,requestSha256:HASH,units:{httpRequests:1,sqlStatements}});
async function tamper(path,value){await writeFile(path,`${canonicalJson(value)}\n`,{mode:0o600});}

test('durable receipt capability independently reloads exact canonical provider receipts and original deadline',async t=>{
  const f=await fixture(t),w=await f.open();const receipt=observation(),digest=sha256(canonicalJson(receipt));
  const saved=await w.saveReceipt({sha256:digest,receipt});assert.equal(saved.sha256,digest);
  assert.deepEqual(await w.readReceipt(saved),receipt);assert.deepEqual(await w.saveReceipt({sha256:digest,receipt}),saved);
  const disk=JSON.parse(await readFile(join(w.directory,saved.reference),'utf8'));
  assert.equal(disk.observedAt,NOW);assert.equal(disk.expiresAt,'2026-10-20T13:00:00.000Z');
  await w.assertScope(scope);await assert.rejects(w.assertScope({...scope,workerName:'other-worker'}),/scope_mismatch/);
  await w.close();const resumed=await f.open({mode:'resume',expectedManifestSha256:w.manifestSha256});
  assert.deepEqual(await resumed.readReceipt(saved),receipt);
  for(const path of [w.directory,join(w.directory,'objects'),join(w.directory,'events')])assert.equal((await lstat(path)).mode&0o777,0o700);
  assert.equal((await lstat(join(w.directory,saved.reference))).mode&0o777,0o600);
});

test('existing providerEvidence saveReceipt signature is concrete, private and handles raw+normalized variants',async t=>{
  const f=await fixture(t),w=await f.open();const evidence=createCatalogProviderEvidence({saveReceipt:w.saveReceipt,now:()=>NOW});
  const products=Array.from({length:10},(_,i)=>({id:`B${String(i).padStart(9,'0')}`,title:`TEST ONLY ${i}`,imageUrl:`https://example.invalid/${i}_SL300_.jpg`,
    source:'amazon',remotelyVerified:true,availabilityStatus:'IN_STOCK',sourceFacts:{fixture:true}}));
  await evidence.amazon('getItems',async()=>products,p=>({...p,imageUrl:p.imageUrl.replace('_SL300_','')}),products.map(p=>p.id));
  const files=await readdir(join(w.directory,'objects'));assert.equal(files.length,1);
  const saved=JSON.parse(await readFile(join(w.directory,'objects',files[0]),'utf8'));assert.equal(saved.value.products.length,20);
  const values=Array(1536).fill(Math.fround(.1));values[0]=-0;const nativeBase64=encodePgvectorSendBase64(values);
  const receipt={schemaVersion:1,kind:'embedding-response',observedAt:NOW,model:'text-embedding-3-small',products:Array.from({length:20},(_,i)=>({
    id:`B${String(i).padStart(9,'0')}`,sourceFactsHash:HASH,text:'TEST ONLY immutable embedding text',nativeBase64,
    vectorBytesSha256:sha256(Buffer.from(nativeBase64,'base64'))}))};
  const ref=await w.saveReceipt({sha256:sha256(canonicalJson(receipt)),receipt});assert.deepEqual(await w.readReceipt(ref),receipt);
});

test('checkpoint CAS, lost-response replay and immutable phase-complete/pins prevent history rewrites',async t=>{
  const f=await fixture(t),w=await f.open();const artifact=await w.putArtifact({fixture:'complete'},{kind:'phase',observedAt:NOW});
  const first={...cp(),phase:'phases_complete',pins:{phase:artifact},phaseComplete:artifact};
  const result=await w.writeCheckpoint(null,first);assert.deepEqual(await w.writeCheckpoint(null,first),result);
  const next={...first,phase:'draining',state:{count:3}};const second=await w.writeCheckpoint(result.sha256,next);
  assert.deepEqual((await w.readCheckpoint()).checkpoint,next);
  await assert.rejects(w.writeCheckpoint(null,first),/checkpoint_cas/);
  await assert.rejects(w.writeCheckpoint(second.sha256,{...next,pins:{}}),/pin_rewrite/);
  await assert.rejects(w.writeCheckpoint(second.sha256,{...next,phaseComplete:null}),/phase_complete_rewrite/);
  const other=await w.putArtifact({fixture:'other'},{kind:'phase',observedAt:NOW});
  await assert.rejects(w.writeCheckpoint(second.sha256,{...next,pins:{phase:other}}),/pin_rewrite/);
  assert.equal((await w.readCheckpoint({controlOnly:true})).checkpoint.state,undefined);
});

test('same artifact retry after lost checkpoint ack reuses original observation/deadline, never renews',async t=>{
  const f=await fixture(t),w=await f.open();const value={fixture:'immutable phase seal'};
  const first=await w.putArtifact(value,{kind:'publication',observedAt:NOW});const bytes=await readFile(join(w.directory,first.reference));
  f.setNow('2026-10-20T12:30:00.000Z');await w.close();const resumed=await f.open({mode:'resume'});
  assert.deepEqual(await resumed.putArtifact(value,{kind:'publication',observedAt:'2026-10-20T12:30:00.000Z'}),first);
  assert.deepEqual(await readFile(join(w.directory,first.reference)),bytes);
  await assert.rejects(resumed.putArtifact(value,{kind:'phase',observedAt:NOW}),/kind/);
  f.setNow('2026-10-20T13:00:00.000Z');
  await assert.rejects(resumed.putArtifact(value,{kind:'publication',observedAt:'2026-10-20T13:00:00.000Z'}),/expired/);
  assert.deepEqual(await readFile(join(w.directory,first.reference)),bytes);
});

test('budget reservations are charged before dispatch, exact-idempotent, capped, and unknown across reopen',async t=>{
  const f=await fixture(t,{budgetCaps:{httpRequests:3,sqlStatements:5}}),w=await f.open();
  await w.reserveBudget(reservation('identity',0));await w.settleBudget('identity',{status:'known',usage:{rowsRead:0,rowsWritten:0}});
  await w.reserveBudget(reservation());await w.reserveBudget(reservation());
  await assert.rejects(w.reserveBudget({...reservation(),requestSha256:'c'.repeat(64)}),/budget_replay/);
  await w.reserveBudget(reservation('lost',3));
  await w.settleBudget('request-1',{status:'known',usage:{rowsRead:7,rowsWritten:2}});
  await w.settleBudget('request-1',{status:'known',usage:{rowsRead:7,rowsWritten:2}});
  assert.deepEqual(await w.budget(),{httpRequests:3,sqlStatements:5,knownRowsRead:7,knownRowsWritten:2,unconfirmedRequests:1});
  await assert.rejects(w.reserveBudget(reservation('over',0)),/budget_exceeded/);await w.close();
  const resumed=await f.open({mode:'resume'});assert.equal((await resumed.budget()).unconfirmedRequests,1);
  await resumed.settleBudget('lost',{status:'unknown',usage:null});
  await assert.rejects(resumed.settleBudget('lost',{status:'known',usage:{rowsRead:0,rowsWritten:0}}),/settlement_replay/);
  assert.equal((await resumed.budget()).httpRequests,3);
});

test('serialized concurrent reservations cannot overspend a single remaining slot',async t=>{
  const f=await fixture(t,{budgetCaps:{httpRequests:1,sqlStatements:3}}),w=await f.open();
  const outcomes=await Promise.allSettled([w.reserveBudget(reservation('a')),w.reserveBudget(reservation('b'))]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal((await w.budget()).httpRequests,1);
});

test('expiry refuses body/new content without renewing on replay, but keeps control metadata and budget usable',async t=>{
  const f=await fixture(t),w=await f.open(),receipt=observation();const ref=await w.saveReceipt({sha256:sha256(canonicalJson(receipt)),receipt});
  await w.writeCheckpoint(null,cp({private:'DO NOT EXPOSE EXPIRED BODY'}));f.setNow(LATER);
  await assert.rejects(w.readReceipt(ref),/expired/);await assert.rejects(w.readCheckpoint(),/expired/);
  await assert.rejects(w.saveReceipt({sha256:ref.sha256,receipt}),/expired/);
  await assert.rejects(w.putArtifact({renew:true},{kind:'phase',observedAt:LATER}),/expired/);
  assert.equal((await w.readCheckpoint({controlOnly:true})).checkpoint.phase,'created');
  await w.reserveBudget(reservation('reconciliation',0));await w.settleBudget('reconciliation',{status:'known',usage:{rowsRead:0,rowsWritten:0}});
  const status=await readRunWorkspace({...f.input,mode:'resume'});assert.equal(status.checkpoint.checkpoint.state,undefined);
  assert.equal(status.expired.length,2);assert.ok(!JSON.stringify(status).includes('DO NOT EXPOSE'));
  await w.close();const resumed=await f.open({mode:'resume'});await assert.rejects(resumed.readReceipt(ref),/expired/);
  assert.equal((await resumed.budget()).httpRequests,1);
});

function publication(){const request={schemaVersion:1,environment:'staging',sourceRevision:'test-revision',sourceDigest:HASH,codeSha:CODE,priorReleaseId:null,capturedAt:new Date(NOW).toISOString(),cutoff:new Date(LATER).toISOString()};
  const intent={releaseId:'test-release',codeSha:CODE,catalogRevision:'test-revision',vectorSyncWatermark:0,priorReleaseId:null,nextExpiry:LATER,catalogSnapshotSha256:HASH,manifestSha256:HASH};
  return{schemaVersion:1,configSha256:HASH,requestId:'test-request',runReference:'test/run',stage:'activating',
    build:{requestId:'test-request',token:'test-token',runReference:'test/run',leaseUntil:LATER,request},
    publication:{intentId:'test-intent',token:'test-publish-token',leaseUntil:LATER,intent},intent,
    permit:{requestId:'test-request',token:'test-token',runReference:'test/run',releaseId:'test-release',versionReference:'test-version'},
    vectorPlan:{catalogRevision:'test-revision',planSha256:HASH,ids:[]},packageSha256:HASH,uploadMarker:'test-upload',versionReference:'test-version',deploymentMarker:'test-deploy',deploymentId:null};}

test('expired control-only reconciliation preserves hidden state and all claims without content renewal',async t=>{
  const f=await fixture(t),w=await f.open();const first=await w.writeCheckpoint(null,{...cp({private:'OLD SEALED STATE'}),phase:'publishing',control:{publication:publication()}});
  f.setNow(LATER);const p={...publication(),stage:'published',deploymentId:'test-deployed',receiptSha256:HASH};
  const result=await w.writeControlCheckpoint(first.sha256,{phase:'published',owner:null,control:{publication:p}});
  assert.equal(result.checkpoint.phase,'published');assert.equal(result.checkpoint.state,undefined);
  assert.deepEqual(await w.writeControlCheckpoint(first.sha256,{phase:'published',owner:null,control:{publication:p}}),result);
  await assert.rejects(w.readCheckpoint(),/expired/);
  await assert.rejects(w.writeControlCheckpoint(result.sha256,{phase:'published',owner:null,control:{publication:{...p,versionReference:'DIFFERENT'}}}),/control/);
  await assert.rejects(w.writeControlCheckpoint(result.sha256,{phase:'published',owner:null,control:{publication:{...p,stage:'built'}}}),/control_reconciliation/);
  const status=await readRunWorkspace({...f.input,mode:'resume'});assert.equal(status.checkpoint.sha256,result.sha256);assert.ok(!JSON.stringify(status).includes('OLD SEALED'));
  const objects=await readdir(join(w.directory,'objects'));assert.equal(objects.length,1); // No replacement expired body.
  const stored=JSON.parse(await readFile(join(w.directory,'objects',objects[0]),'utf8'));assert.equal(stored.value.state.private,'OLD SEALED STATE');assert.equal(stored.observedAt,NOW);
});

test('expired lost activation-CAS recovery can only pin the exact same-owner activation permit',async t=>{
  const f=await fixture(t),w=await f.open();
  const owner={environment:scope.environment,indexName:scope.indexName,token:'test-owner-token',generation:1,epoch:7,phase:'freezing',
    ownerReference:'test/run',operationKey:HASH,capturedAt:new Date(NOW).toISOString()};
  const p={...publication(),permit:null};const first=await w.writeCheckpoint(null,{...cp(),phase:'publishing',owner,control:{publication:p}});
  f.setNow(LATER);const activated={...owner,phase:'activating'},permit={...publication().permit,mutationOwner:activated};
  await assert.rejects(w.writeControlCheckpoint(first.sha256,{phase:'attention',owner:activated,control:{publication:{...p,permit:{...permit,versionReference:'wrong-version'}}}}),/control/);
  const recovered=await w.writeControlCheckpoint(first.sha256,{phase:'attention',owner:activated,control:{publication:{...p,permit}}});
  assert.equal(recovered.checkpoint.owner.phase,'activating');assert.equal(recovered.checkpoint.control.publication.permit.versionReference,p.versionReference);
  const settled=await w.writeControlCheckpoint(recovered.sha256,{phase:'published',owner:null,control:{publication:{...p,permit,stage:'published',deploymentId:'test-result'}}});
  assert.equal(settled.checkpoint.owner,null);await assert.rejects(w.readCheckpoint(),/expired/);
});

test('control-only reconciliation cannot adopt a different owner or release an unsettled activation',async t=>{
  const f=await fixture(t),w=await f.open();
  const owner={environment:scope.environment,indexName:scope.indexName,token:'test-owner',generation:2,epoch:9,phase:'activating',
    ownerReference:'test/run',operationKey:HASH,capturedAt:new Date(NOW).toISOString()};
  const p={...publication(),permit:{...publication().permit,mutationOwner:owner}};
  const first=await w.writeCheckpoint(null,{...cp(),phase:'publishing',owner,control:{publication:p}});f.setNow(LATER);
  for(const changed of [{...owner,token:'other-owner'},{...owner,generation:3},{...owner,epoch:10},null])
    await assert.rejects(w.writeControlCheckpoint(first.sha256,{phase:'attention',owner:changed,control:{publication:p}}),/control_owner/);
  const attention=await w.writeControlCheckpoint(first.sha256,{phase:'attention',owner,control:{publication:p}});
  assert.deepEqual(attention.checkpoint.owner,owner);
  const published=await w.writeControlCheckpoint(attention.sha256,{phase:'published',owner:null,control:{publication:{...p,stage:'published'}}});
  assert.equal(published.checkpoint.owner,null);
});

test('absolute reviewed deadline caps original observation age and cannot be extended by a later replay',async t=>{
  const reviewed=policy();reviewed.rules['amazon-observation'].notAfter='2026-10-20T12:10:00.000Z';
  const f=await fixture(t,{retention:reviewed}),w=await f.open(),r=observation();const ref=await w.saveReceipt({sha256:sha256(canonicalJson(r)),receipt:r});
  const sealed=JSON.parse(await readFile(join(w.directory,ref.reference),'utf8'));assert.equal(sealed.expiresAt,'2026-10-20T12:10:00.000Z');
  f.setNow('2026-10-20T12:10:00.000Z');await assert.rejects(w.readReceipt(ref),/expired/);
  const later={...r,observedAt:'2026-10-20T12:09:00.000Z'};await assert.rejects(w.saveReceipt({sha256:sha256(canonicalJson(later)),receipt:later}),/expired/);
  assert.equal((await readdir(join(w.directory,'objects'))).length,1);
});

test('shared database and Worker locks exclude different runs and do not auto-takeover',async t=>{
  const f=await fixture(t),w=await f.open();
  await assert.rejects(f.open({runId:'second-run'}),/locked/);
  await assert.rejects(f.open({runId:'second-run',scope:{...scope,databaseId:'other-db'}}),/locked/);
  await assert.rejects(f.open({runId:'second-run',scope:{...scope,workerName:'other-worker'}}),/locked/);
  assert.equal((await readdir(join(f.input.directory,'locks'))).length,3);
  await w.close();const second=await f.open({runId:'second-run'});await second.assertHeld();
  const locks=await readdir(join(f.input.directory,'locks'));const path=join(f.input.directory,'locks',locks[0]);
  await tamper(path,{schemaVersion:1,token:'not-ours'});await assert.rejects(second.assertHeld(),/lock_lost/);
  await assert.rejects(second.close(),/lock_lost/);await assert.rejects(f.open({mode:'resume',runId:'second-run'}),/locked/);
});

test('killed process leaves an explicit blocking resource lock; readonly status does not claim it',async t=>{
  const f=await fixture(t);const clean={...f.input};delete clean.now;
  const code=`import {openRunWorkspace} from ${JSON.stringify(new URL('../scripts/catalog/run-workspace.ts',import.meta.url).href)};await openRunWorkspace({...${JSON.stringify(clean)},now:()=>${JSON.stringify(NOW)}});process.stdout.write('held');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,NODE_ENV:'test'}});
  let err='';child.stderr.on('data',data=>{err+=data;});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',()=>reject(new Error(`fixture child failed: ${err}`)));});
  child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));
  await assert.rejects(f.open({mode:'resume'}),/locked/);const status=await readRunWorkspace({...f.input,mode:'resume'});assert.equal(status.manifest.runId,'test-run');
});

test('reopen rejects changed policy/config/code/scope and accepts only exact manifest hash',async t=>{
  const f=await fixture(t),w=await f.open();await w.close();
  for(const change of [{configSha256:'c'.repeat(64)},{codeSha:'d'.repeat(40)},{scope:{...scope,indexName:'different'}},
    {retention:{...policy(),reviewReference:'different-review'}},{expectedManifestSha256:'e'.repeat(64)}])await assert.rejects(f.open({mode:'resume',...change}),/manifest_mismatch/);
  await f.open({mode:'resume',expectedManifestSha256:w.manifestSha256});
});

test('traversal, Git destinations, symlink parents/intermediates and insecure modes are rejected',async t=>{
  const f=await fixture(t);await assert.rejects(f.open({directory:join(f.parent,'x','..','workspace')+'/../other'}),/path/);
  await assert.rejects(f.open({runId:'..'}),/configuration/);
  await assert.rejects(f.open({directory:join(f.input.repository,'private-workspace')}),/repository|Git|private/);
  await mkdir(join(f.parent,'real'),{mode:0o700});await symlink(join(f.parent,'real'),join(f.parent,'linked'));
  await assert.rejects(f.open({directory:join(f.parent,'linked','workspace')}),/symlink/);
  const w=await f.open();await w.close();await chmod(join(w.directory,'objects'),0o755);
  await assert.rejects(f.open({mode:'resume'}),/permissions/);await chmod(join(w.directory,'objects'),0o700);
  await rm(join(w.directory,'objects'),{recursive:true});await symlink(join(f.parent,'real'),join(w.directory,'objects'));
  await assert.rejects(f.open({mode:'resume'}),/permissions/);
});

test('hardlinks, changed file modes and mismatched hash cannot be loaded as evidence',async t=>{
  const f=await fixture(t),w=await f.open();const ref=await w.putArtifact({fixture:'owned'},{kind:'phase',observedAt:NOW}),path=join(w.directory,ref.reference);
  await link(path,join(f.parent,'hardlink'));await assert.rejects(w.readArtifact(ref),/permissions/);await unlink(join(f.parent,'hardlink'));
  await chmod(path,0o644);await assert.rejects(w.readArtifact(ref),/permissions/);await chmod(path,0o600);
  const data=JSON.parse(await readFile(path,'utf8'));data.value.fixture='tampered';await tamper(path,data);
  await assert.rejects(w.readArtifact(ref),/artifact_hash/);await w.close();await assert.rejects(f.open({mode:'resume'}),/artifact_hash/);
});

test('checkpoint hardlinks and oversized on-disk JSON are rejected before body use',async t=>{
  const f=await fixture(t),w=await f.open();const result=await w.writeCheckpoint(null,cp());
  const path=join(w.directory,'objects',`${result.sha256}.json`);await link(path,join(f.parent,'checkpoint-link'));
  await assert.rejects(w.readCheckpoint(),/permissions/);await unlink(join(f.parent,'checkpoint-link'));
  await writeFile(path,'x'.repeat(1024*1024+1),{mode:0o600});await assert.rejects(w.readCheckpoint(),/bytes/);
});

test('journal gaps/truncation and partial JSON fail closed instead of refunding a paid reservation',async t=>{
  const f=await fixture(t),w=await f.open();await w.reserveBudget(reservation());await w.close();
  const eventDir=join(w.directory,'events'),files=await readdir(eventDir);assert.equal(files.length,1);await unlink(join(eventDir,files[0]));
  await assert.rejects(f.open({mode:'resume'}),/journal_head/);
  await writeFile(join(eventDir,files[0]),'{partial',{mode:0o600});await assert.rejects(f.open({mode:'resume'}),/json/);
});

test('interrupted private temporary file is never interpreted as a committed artifact/event',async t=>{
  const f=await fixture(t),w=await f.open();await w.reserveBudget(reservation());await w.close();
  await writeFile(join(w.directory,'events','.pending-interrupted'),'{partial',{mode:0o600});
  await writeFile(join(w.directory,'objects','.pending-interrupted'),'{partial',{mode:0o600});
  const resumed=await f.open({mode:'resume'});assert.equal((await resumed.budget()).unconfirmedRequests,1);
  assert.equal((await readdir(join(w.directory,'objects'))).length,1); // Not silently swept/deleted.
});

test('unreviewed policy, malformed/unknown receipts, oversized bytes and forged references are refused',async t=>{
  const f=await fixture(t);await assert.rejects(f.open({retention:undefined}),/retention_policy/);
  const w=await f.open(),r=observation();
  await assert.rejects(w.saveReceipt({sha256:HASH,receipt:r}),/receipt_hash/);
  const headers={...r,headers:{authorization:'TEST ONLY NOT A SECRET'}};
  await assert.rejects(w.saveReceipt({sha256:sha256(canonicalJson(headers)),receipt:headers}),/receipt/);
  await assert.rejects(w.putArtifact({body:'x'.repeat(512*1024)},{kind:'phase',observedAt:NOW}),/bytes/);
  await assert.rejects(w.readArtifact({sha256:HASH,reference:'../outside.json'}),/unregistered_artifact|reference/);
  await assert.rejects(w.writeCheckpoint(null,{...cp(),control:{unknown:{rawBody:'private'}}}),/control/);
});

test('3383 native-vector blobs preserve exact ordered bytes, private chunk bounds, checkpoint/reopen and original expiry',async t=>{
  const f=await fixture(t),w=await f.open();const values=Array(1536).fill(Math.fround(.1));values[0]=-0;values[1]=Math.fround(1e-45);
  const nativeBase64=encodePgvectorSendBase64(values),vectorBytesSha256=sha256(Buffer.from(nativeBase64,'base64'));
  const rows=Object.fromEntries(Array.from({length:3383},(_,i)=>[`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,{nativeBase64,vectorBytesSha256}]));
  const bytes=Buffer.from(` {\n${JSON.stringify(rows).slice(1,-1)}\n}\n`);assert.ok(bytes.length>28_000_000&&bytes.length<WORKSPACE_BLOB_LIMITS.bytes);
  const ref=await w.putBlob(bytes,{kind:'phase',observedAt:NOW}),descriptor=await w.readArtifact(ref);
  assert.equal(descriptor.type,'run-workspace-blob');assert.equal(descriptor.sha256,sha256(bytes));assert.equal(descriptor.byteLength,bytes.length);
  assert.notEqual(ref.sha256,descriptor.sha256);assert.equal(descriptor.parts.length,Math.ceil(bytes.length/WORKSPACE_BLOB_LIMITS.chunkBytes));
  assert.deepEqual(await w.readBlob(ref),bytes);
  const original=await readFile(join(w.directory,ref.reference));
  const envelopes=await Promise.all((await readdir(join(w.directory,'objects'))).map(async name=>{
    const file=join(w.directory,'objects',name);assert.ok((await lstat(file)).size<=512*1024);assert.equal((await lstat(file)).mode&0o777,0o600);
    const v=JSON.parse(await readFile(file,'utf8'));assert.equal(v.observedAt,NOW);assert.equal(v.expiresAt,'2026-10-20T13:00:00.000Z');return v;
  }));assert.equal(envelopes.length,descriptor.parts.length+1);
  const small=await w.putArtifact({legacy:'small format unchanged'},{kind:'phase',observedAt:NOW});
  await w.reserveBudget(reservation('pending-before-close',0));
  await w.writeCheckpoint(null,{...cp({vectorCount:3383}),phase:'phases_complete',pins:{originalVectors:ref,small},phaseComplete:ref});
  await w.close();f.setNow('2026-10-20T12:30:00.000Z');const resumed=await f.open({mode:'resume'});
  assert.deepEqual((await resumed.readCheckpoint()).checkpoint.pins.originalVectors,ref);
  assert.deepEqual(await resumed.readArtifact(small),{legacy:'small format unchanged'});
  assert.equal((await resumed.budget()).unconfirmedRequests,1);
  const restored=await resumed.readBlob(ref);assert.deepEqual(restored,bytes);
  const decoded=decodePgvectorSendBase64(JSON.parse(Buffer.from(restored).toString('utf8'))[Object.keys(rows)[0]].nativeBase64);
  assert.ok(Object.is(decoded[0],-0));assert.equal(decoded[1],Math.fround(1e-45));assert.equal(encodePgvectorSendBase64(decoded),nativeBase64);
  assert.deepEqual(await resumed.putBlob(bytes,{kind:'phase',observedAt:'2026-10-20T12:30:00.000Z'}),ref);
  assert.deepEqual(await readFile(join(w.directory,ref.reference)),original);
  f.setNow('2026-10-20T13:00:00.000Z');await assert.rejects(resumed.readBlob(ref),/expired/);
  await assert.rejects(resumed.putBlob(bytes,{kind:'phase',observedAt:LATER}),/expired/);
  assert.equal((await resumed.readCheckpoint({controlOnly:true})).checkpoint.phase,'phases_complete');
  await resumed.close();const expired=await f.open({mode:'resume'});await assert.rejects(expired.readBlob(ref),/expired/);
});

test('partial blob retry recovers original chunk retention without renewal or overwriting committed bytes',async t=>{
  const source=await fixture(t),writer=await source.open(),bytes=Buffer.alloc(WORKSPACE_BLOB_LIMITS.chunkBytes+17,0x31);
  const ref=await writer.putBlob(bytes,{kind:'publication',observedAt:NOW}),descriptor=await writer.readArtifact(ref);
  const first=await readFile(join(writer.directory,'objects',`${descriptor.parts[0]}.json`));
  const partial=await fixture(t),w=await partial.open();
  // Exact crash boundary: first durable chunk exists, its journal registration
  // and later chunks/manifest were not acknowledged. No automatic lock takeover.
  await writeFile(join(w.directory,'objects',`${descriptor.parts[0]}.json`),first,{mode:0o600,flag:'wx'});
  partial.setNow('2026-10-20T12:30:00.000Z');
  assert.deepEqual(await w.putBlob(bytes,{kind:'publication',observedAt:'2026-10-20T12:30:00.000Z'}),ref);
  assert.deepEqual(await readFile(join(w.directory,'objects',`${descriptor.parts[0]}.json`)),first);
  for(const name of await readdir(join(w.directory,'objects'))){const v=JSON.parse(await readFile(join(w.directory,'objects',name),'utf8'));
    assert.equal(v.observedAt,NOW);assert.equal(v.expiresAt,'2026-10-20T13:00:00.000Z');}
  assert.deepEqual(await w.readBlob(ref),bytes);await assert.rejects(w.putBlob(bytes,{kind:'phase',observedAt:NOW}),/kind/);
});

test('blob manifests and chunks reject missing, duplicated, reordered, tampered, truncated and mixed evidence',async t=>{
  const cases={
    missing:async({first})=>unlink(first),
    truncated:async({first})=>writeFile(first,'{"partial":',{mode:0o600}),
    tampered:async({first,part})=>tamper(first,{...part,value:{...part.value,base64:'A'.repeat(part.value.base64.length)}}),
    hardlinked:async({first,w})=>link(first,join(w.directory,'alias')),
    kind:async({first,part})=>tamper(first,{...part,kind:'publication'}),
    observation:async({first,part})=>tamper(first,{...part,observedAt:'2026-10-20T12:01:00.000000Z',expiresAt:'2026-10-20T13:01:00.000Z'}),
    deadline:async({first,part})=>tamper(first,{...part,expiresAt:'2026-10-20T13:01:00.000Z'}),
    policy:async({first,part})=>tamper(first,{...part,policySha256:'e'.repeat(64)}),
    duplicate:async({descriptor})=>({...descriptor,parts:[descriptor.parts[0],descriptor.parts[0]]}),
    paths:async({descriptor})=>({...descriptor,parts:['../untrusted',descriptor.parts[1]]}),
    reordered:async({descriptor})=>({...descriptor,parts:[...descriptor.parts].reverse()}),
    length:async({descriptor})=>({...descriptor,byteLength:descriptor.byteLength-1}),
    excess:async({descriptor})=>({...descriptor,path:'../not-permitted'}),
    version:async({descriptor})=>({...descriptor,schemaVersion:2}),
    bound:async({descriptor})=>({...descriptor,byteLength:WORKSPACE_BLOB_LIMITS.bytes+1}),
    ordinal:async({w,descriptor,part})=>{const changed=await w.putArtifact({...part.value,index:1},{kind:'phase',observedAt:NOW});
      return{...descriptor,parts:[changed.sha256,descriptor.parts[1]]};},
    chunkExcess:async({w,descriptor,part})=>{const changed=await w.putArtifact({...part.value,path:'untrusted'},{kind:'phase',observedAt:NOW});
      return{...descriptor,parts:[changed.sha256,descriptor.parts[1]]};},
    blobIdentity:async({w,descriptor,part})=>{const changed=await w.putArtifact({...part.value,blobSha256:'f'.repeat(64)},{kind:'phase',observedAt:NOW});
      return{...descriptor,parts:[changed.sha256,descriptor.parts[1]]};},
    base64:async({w,descriptor,part})=>{const changed=await w.putArtifact({...part.value,base64:'!'.repeat(part.value.base64.length)},{kind:'phase',observedAt:NOW});
      return{...descriptor,parts:[changed.sha256,descriptor.parts[1]]};},
  };
  for(const [name,corrupt]of Object.entries(cases))await t.test(name,async sub=>{
    const f=await fixture(sub),w=await f.open(),bytes=Buffer.alloc(WORKSPACE_BLOB_LIMITS.chunkBytes+17,0x32);
    let ref=await w.putBlob(bytes,{kind:'phase',observedAt:NOW});const descriptor=await w.readArtifact(ref);
    const first=join(w.directory,'objects',`${descriptor.parts[0]}.json`),part=JSON.parse(await readFile(first,'utf8'));
    const changed=await corrupt({w,descriptor,first,part});if(changed)ref=await w.putArtifact(changed,{kind:'phase',observedAt:NOW});
    f.setNow('2026-10-20T12:30:00.000Z');
    await assert.rejects(w.readBlob(ref));await assert.rejects(w.writeCheckpoint(null,{...cp(),pins:{broken:ref}}));
    if(name==='missing')await assert.rejects(w.putBlob(bytes,{kind:'phase',observedAt:NOW}),/blob_missing/);
  });
});

test('blob inputs are copied before queued writes; zero/exact-chunk bounds and existing small codecs stay strict',async t=>{
  const f=await fixture(t),w=await f.open(),bytes=Buffer.alloc(WORKSPACE_BLOB_LIMITS.chunkBytes,0x41);
  const saved=w.putBlob(bytes,{kind:'phase',observedAt:NOW});bytes.fill(0x42);
  const ref=await saved;assert.deepEqual(await w.readBlob(ref),Buffer.alloc(bytes.length,0x41));
  assert.equal((await w.readArtifact(ref)).parts.length,1);
  const empty=await w.putBlob(Buffer.alloc(0),{kind:'phase',observedAt:NOW});assert.equal((await w.readBlob(empty)).length,0);
  await assert.rejects(w.putBlob(new Uint8Array(WORKSPACE_BLOB_LIMITS.bytes+1),{kind:'phase',observedAt:NOW}),/blob_bytes/);
  await assert.rejects(w.putBlob(Buffer.from('x'),{kind:'phase',observedAt:NOW,expiresAt:LATER}),/kind/);
  const legacy=await w.putArtifact('ordered JSON bytes',{kind:'phase',observedAt:NOW});await assert.rejects(w.readBlob(legacy),/blob_manifest/);
});
