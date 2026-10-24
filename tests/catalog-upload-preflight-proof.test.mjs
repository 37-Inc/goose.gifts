import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,realpath,writeFile,readFile,readdir,lstat,chmod,symlink,link,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {openRunWorkspace} from '../scripts/catalog/run-workspace.ts';
import {readOnlyUploadEvidence} from '../scripts/catalog/upload-preflight-proof.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';

const NOW='2026-10-24T21:00:00.000Z',HASH='a'.repeat(64);
const rawHash=b=>createHash('sha256').update(b).digest('hex');
const write=(file,value)=>writeFile(file,typeof value==='string'||Buffer.isBuffer(value)?value:canonicalJson(value)+'\n',{mode:0o600});
const scope={environment:'production',accountId:'a'.repeat(32),databaseId:'synthetic-db',databaseName:'synthetic',workerName:'synthetic-worker',indexName:'synthetic-index'};

async function fixture(t,fault){
  const parent=await mkdtemp(join(await realpath(tmpdir()),'stupid-preflight-proof-')),repository=join(parent,'source');await mkdir(repository,{mode:0o700});
  const w=await openRunWorkspace({directory:join(parent,'workspace'),repository,mode:'create',runId:'synthetic-run',configSha256:HASH,
    codeSha:'b'.repeat(40),scope,retention:{reviewReference:'synthetic/preflight-proof',rules:Object.fromEntries(
      ['amazon-observation','embedding-response','phase','publication','checkpoint'].map(kind=>[kind,{maxAgeMs:86400000,notAfter:'2026-10-25T21:00:00.000Z'}]))},
    budgetCaps:{httpRequests:100,sqlStatements:100},now:()=>NOW});
  t.after(async()=>{try{await w.close();}finally{await rm(parent,{recursive:true,force:true});}});
  const pendingValue={schemaVersion:1,releaseId:fault==='release'?'foreign-run':'synthetic-run',requestId:HASH,configSha256:HASH,
    packageSha256:HASH,uploadMarker:'synthetic-upload'};
  const pending=await w.putArtifact(pendingValue,{kind:'publication',observedAt:NOW});
  const cp=await w.writeCheckpoint(null,{phase:'publishing',owner:null,pins:{publicationUploadPending:pending},state:{},phaseComplete:null});
  const base=`https://api.cloudflare.com/client/v4/accounts/${scope.accountId}/workers`;
  const requests=[`GET${base}/services/${scope.workerName}`,`GET${base}/scripts/${scope.workerName}/secrets`];
  if(fault==='scope')requests[0]=requests[0].replace(scope.workerName,'foreign-worker');
  if(fault==='order')requests.reverse();
  if(fault==='post')requests.push(`POST${base}/scripts/${scope.workerName}/assets-upload-session{}`);
  for(let i=0;i<requests.length;i++){
    await w.reserveBudget({id:'request-'+i,requestSha256:sha256(requests[i]),units:{httpRequests:1,sqlStatements:fault==='sql'&&i===0?1:0}});
    if(fault==='unsettled'&&i===0)continue;
    await w.settleBudget('request-'+i,fault==='unknown'&&i===0?{status:'unknown',usage:null}:{status:'known',usage:{rowsRead:fault==='usage'&&i===0?1:0,rowsWritten:0}});
  }
  const review=await w.putArtifact({schemaVersion:1,code:fault==='error'?'publication_upload_unknown':'publication_upload_command_failed',
    releaseId:pendingValue.releaseId,requestId:HASH,configSha256:HASH},{kind:'publication',observedAt:NOW});
  const pins={publicationUploadPending:pending,publicationUploadReview:review};
  if(fault==='ack')pins.publicationUploadAcknowledged=await w.putArtifact({ack:'not-authority'},{kind:'publication',observedAt:NOW});
  const final=await w.writeCheckpoint(cp.sha256,{...cp.checkpoint,phase:'attention',pins});
  const anchor=JSON.parse(await readFile(join(w.directory,'head.json'),'utf8'));
  const runtime=join(w.directory,'publication-runtime',pendingValue.releaseId),logs=join(runtime,'logs');await mkdir(logs,{recursive:true,mode:0o700});
  const log=join(logs,'wrangler-2026-10-24_21-00-00_123.log'),output=join(runtime,'upload.ndjson');
  const logBytes=Buffer.from([0x53,0x79,0x6e,0x74,0x68,0x65,0x74,0x69,0x63,0xff]);await write(log,logBytes);
  const lines=[{type:'wrangler-session',command_line_args:['versions','upload','--tag',pendingValue.uploadMarker],log_file_path:log},
    {type:'command-failed',message:'fetch failed'}];
  await write(output,lines.map(canonicalJson).join('\n')+'\n');
  return{w,pending,review,anchor,final,log,logs,output,lines,logBytes,
    async saveOutput(){await write(output,lines.map(canonicalJson).join('\n')+'\n');},
    proof:through=>readOnlyUploadEvidence(w,pending,review,through)};
}

test('real private journal proves exactly two settled read-only requests and raw log/output bytes without writes',async t=>{
  const f=await fixture(t),head=await readFile(join(f.w.directory,'head.json')),budget=await f.w.budget(),proof=await f.proof();
  assert.equal(proof.schemaVersion,2);assert.equal(proof.kind,'read-only-preflight-failure');assert.equal(proof.checkpointSha256,f.final.sha256);
  assert.equal(proof.logSha256,rawHash(f.logBytes));assert.equal(proof.outputSha256,rawHash(await readFile(f.output)));
  assert.deepEqual(proof.journal.through,f.anchor);assert.deepEqual(proof.requests.map(r=>r.kind),['service','secrets']);
  assert.equal(proof.assetContentRequests+proof.versionPosts,0);assert.deepEqual(await f.w.budget(),budget);
  assert.deepEqual(await readFile(join(f.w.directory,'head.json')),head);
  for(const file of [f.log,f.output,join(f.w.directory,'head.json')])assert.equal((await lstat(file)).mode&0o777,0o600);
  const records=await Promise.all((await readdir(join(f.w.directory,'events'))).sort().map(async file=>JSON.parse(await readFile(join(f.w.directory,'events',file),'utf8'))));
  assert.equal(proof.journal.sha256,sha256(canonicalJson(records.filter(r=>r.sequence>=proof.journal.from.sequence))));
});

test('explicit original through-anchor remains valid after resumed metadata, while head-inferred or foreign anchors reject',async t=>{
  const f=await fixture(t),old=await f.proof();await f.w.putArtifact({later:'same-run metadata'},{kind:'publication',observedAt:NOW});
  assert.deepEqual(await f.proof(f.anchor),old);await assert.rejects(f.proof());
  await assert.rejects(f.proof({...f.anchor,sha256:'f'.repeat(64)}));
  await assert.rejects(f.proof({...f.anchor,sequence:f.anchor.sequence+100}));
});

test('POSTs, uncertain/unsettled/nonzero SQL charges, wrong scope/order/release/error or upload ACK reject',async t=>{
  for(const fault of ['post','unknown','unsettled','sql','usage','scope','order','release','error','ack'])await t.test(fault,async t=>{
    const f=await fixture(t,fault);await assert.rejects(f.proof());
  });
});

test('journal byte/chain/head drift and foreign pins reject instead of accepting supplied JSON',async t=>{
  for(const fault of ['bytes','chain','head','pins'])await t.test(fault,async t=>{
    const f=await fixture(t),events=join(f.w.directory,'events'),files=(await readdir(events)).sort();
    if(fault==='bytes')await write(join(events,files[2]),'{}\n');
    if(fault==='chain'){
      const old=join(events,files[2]),r=JSON.parse(await readFile(old,'utf8'));r.parent='f'.repeat(64);await unlink(old);
      await write(join(events,`${String(r.sequence).padStart(6,'0')}.${sha256(canonicalJson(r))}.json`),r);
    }
    if(fault==='head'){
      const read=f.w.readArtifact;let n=0;
      const wrapped={...f.w,readArtifact:async ref=>{const value=await read(ref);if(++n===2)await write(join(f.w.directory,'head.json'),{...f.anchor,sha256:'f'.repeat(64)});return value;}};
      await assert.rejects(readOnlyUploadEvidence(wrapped,f.pending,f.review));return;
    }
    if(fault==='pins'){await assert.rejects(readOnlyUploadEvidence(f.w,f.pending,{...f.review,sha256:'f'.repeat(64)}));return;}
    await assert.rejects(f.proof());
  });
});

test('output ACK, missing failure/session/tag, unsafe or substituted log files and public permissions reject',async t=>{
  for(const fault of ['output-ack','failure','session','tag','outside','name','symlink','hardlink','mode','output-mode','oversize'])await t.test(fault,async t=>{
    const f=await fixture(t);
    if(fault==='output-ack')f.lines.push({type:'version-upload',version:'not-authority'});
    if(fault==='failure')f.lines.pop();if(fault==='session')f.lines.shift();
    if(fault==='tag')f.lines[0].command_line_args=['versions','upload','--tag','foreign'];
    if(fault==='outside')f.lines[0].log_file_path=join(f.w.directory,basename(f.log));
    if(fault==='name')f.lines[0].log_file_path=join(f.logs,'unrecognized.log');
    if(fault==='symlink'){await unlink(f.log);await symlink(f.output,f.log);}
    if(fault==='hardlink')await link(f.log,join(f.logs,'another.log'));
    if(fault==='mode')await chmod(f.log,0o644);if(fault==='output-mode')await chmod(f.output,0o644);
    if(fault==='oversize')await write(f.log,Buffer.alloc(512*1024+1));
    await f.saveOutput();await assert.rejects(f.proof());
  });
});

test('changed valid raw log bytes change evidence identity, so a prior approved evidence object cannot be substituted',async t=>{
  const f=await fixture(t),before=await f.proof();await write(f.log,Buffer.from('Different synthetic retained log'));
  const after=await f.proof();assert.notEqual(after.logSha256,before.logSha256);assert.notEqual(sha256(canonicalJson(after)),sha256(canonicalJson(before)));
});
