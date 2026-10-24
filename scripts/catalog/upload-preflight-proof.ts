import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalJson,sha256} from './migration.ts';
import type {ArtifactRef,RunWorkspace} from './run-workspace.ts';

export interface ReadOnlyUploadEvidence {
  schemaVersion:2;kind:'read-only-preflight-failure';logSha256:string;outputSha256:string;checkpointSha256:string;
  journal:{from:{sequence:number;sha256:string};through:{sequence:number;sha256:string};sha256:string};
  requests:{kind:'service'|'secrets';requestSha256:string;settlement:'known'}[];
  assetContentRequests:0;versionPosts:0;
}
const HASH=/^[a-f0-9]{64}$/;
function fail():never{throw Error('publication_preflight_proof_invalid');}
async function bytes(file:string,max=512*1024){
  const s=await fs.lstat(file);
  if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o600||s.size>max||await fs.realpath(file)!==file)fail();
  return fs.readFile(file);
}
const json=async(file:string)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(file)));
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);

/** Reconstruct only an immutable failed-upload interval. No provider calls or
 * new permission from JSON assertions. The held workspace already authenticates
 * the journal; every selected record is independently hash/chain checked here. */
export async function readOnlyUploadEvidence(w:RunWorkspace,pending:ArtifactRef,review:ArtifactRef,
  through?:{sequence:number;sha256:string}):Promise<ReadOnlyUploadEvidence>{
  await w.assertHeld();
  const head=await json(path.join(w.directory,'head.json')),end=through??head;
  if(!Number.isSafeInteger(end.sequence)||end.sequence<1||end.sequence>head.sequence||!HASH.test(end.sha256))fail();
  const files=(await fs.readdir(path.join(w.directory,'events'))).filter(n=>/^\d{6}\.[a-f0-9]{64}\.json$/.test(n)).sort();
  let from:ReadOnlyUploadEvidence['journal']['from']|undefined,previous:string|null=null,last:Record<string,unknown>|null=null;
  const records:unknown[]=[],reserves:Array<{id:string;requestSha256:string;units:unknown}>=[],settlements=new Map<string,unknown>();
  for(const name of files){
    const sequence=Number(name.slice(0,6));if(sequence>end.sequence)break;
    const r=await json(path.join(w.directory,'events',name)),digest=sha256(canonicalJson(r));
    if(name!==`${String(sequence).padStart(6,'0')}.${digest}.json`||r.sequence!==sequence)fail();
    if(!from&&r.event.type==='artifact'&&same(r.event.ref,pending))from={sequence,sha256:digest};
    if(!from)continue;
    if(records.length&&r.parent!==previous)fail();previous=digest;records.push(r);last=r;
    if(!['artifact','checkpoint','reserve','settle'].includes(r.event.type))fail();
    if(r.event.type==='reserve')reserves.push(r.event.reservation);
    if(r.event.type==='settle'){if(settlements.has(r.event.id))fail();settlements.set(r.event.id,r.event.settlement);}
  }
  if(!from||records.length>32||!last||last.sequence!==end.sequence||previous!==end.sha256
    ||reserves.length!==2||settlements.size!==2)fail();
  const event=last.event as {type:string;ref:ArtifactRef;control:{phase:string;pins:Record<string,ArtifactRef>}};
  if(event.type!=='checkpoint'||event.control.phase!=='attention'||!same(event.control.pins.publicationUploadPending,pending)
    ||!same(event.control.pins.publicationUploadReview,review)||event.control.pins.publicationUploadAcknowledged)fail();
  const p=await w.readArtifact(pending) as Record<string,unknown>,r=await w.readArtifact(review) as Record<string,unknown>;
  if(r.code!=='publication_upload_command_failed'||r.releaseId!==p.releaseId||r.requestId!==p.requestId||r.configSha256!==p.configSha256
    ||p.releaseId!==w.manifest.runId)fail();
  const base=`https://api.cloudflare.com/client/v4/accounts/${w.manifest.scope.accountId}/workers`;
  const expected=[sha256(`GET${base}/services/${w.manifest.scope.workerName}`),sha256(`GET${base}/scripts/${w.manifest.scope.workerName}/secrets`)];
  for(let i=0;i<2;i++)if(reserves[i].requestSha256!==expected[i]||!same(reserves[i].units,{httpRequests:1,sqlStatements:0})
    ||!same(settlements.get(reserves[i].id),{status:'known',usage:{rowsRead:0,rowsWritten:0}}))fail();
  const runtime=path.join(w.directory,'publication-runtime',String(p.releaseId)),output=await bytes(path.join(runtime,'upload.ndjson'));
  const lines=output.toString('utf8').trim().split('\n').map(line=>JSON.parse(line));
  const session=lines.find(l=>l.type==='wrangler-session');
  if(lines.some(l=>l.type==='version-upload')||!lines.some(l=>l.type==='command-failed'&&l.message==='fetch failed')||!session
    ||!Array.isArray(session.command_line_args)||!session.command_line_args.includes(p.uploadMarker))fail();
  const log=String(session.log_file_path);
  if(path.dirname(log)!==path.join(runtime,'logs')||!/^wrangler-[0-9_-]+\.log$/.test(path.basename(log)))fail();
  const logBytes=await bytes(log);
  if(!same(await json(path.join(w.directory,'head.json')),head))fail();
  const rawHash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
  return{schemaVersion:2,kind:'read-only-preflight-failure',logSha256:rawHash(logBytes),outputSha256:rawHash(output),checkpointSha256:event.ref.sha256,
    journal:{from,through:end,sha256:sha256(canonicalJson(records))},
    requests:expected.map((requestSha256,i)=>({kind:i===0?'service':'secrets',requestSha256,settlement:'known'})),assetContentRequests:0,versionPosts:0};
}
