import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import { mutationAssertion, readMutationOwner } from '../../lib/catalog/mutation-fence.ts';
import type { PrunedRevision } from '../../lib/catalog/prune-existing-revision.ts';
import { prunedVectorIds, prunedVectorPlan } from '../../lib/catalog/prune-existing-revision.ts';
import type { PermanentCatalogRevision } from '../../lib/catalog/freeze-permanent-catalog.ts';
import type { ActivationPermit, DeploymentIdentity, DeploymentObservation } from '../../lib/catalog/build-requests.ts';
import { beginBuildActivation, claimBuildRequest, encodeBuildRequest, resolveBuildActivation, drainDeploymentObservation } from '../../lib/catalog/build-requests.ts';
import { isAccountedPublicationFetch } from './publication-read-fetch.ts';
import { isAccountedPublicationUploadCommand, PublicationUploadCommandError } from './publication-upload-command.ts';
import { isCatalogD1Rest } from './d1-write-rest.ts';
import type { PublicationIntent } from '../../lib/catalog/publication.ts';
import { claimPublication, completeActivatedPublication, completeActivatedPermanentPublication, completePublication, enqueuePublication, encodePublicationIntent, publicationStatus, recordPublicationDispatch } from '../../lib/catalog/publication.ts';
import type { SiteAssetManifest } from '../../lib/catalog/types.ts';
import type { ReleaseBuildContext } from '../staging/build.mts';
import { assertBuildSource, validateBuildContext } from '../staging/build.mts';
import { verifyReleaseIdentity } from '../staging/release-identity.mts';
import { verifyFeedPlan, verifyReleaseContext, verifySiteIdentity } from '../staging/verify-release.mts';
import { CLOUDFLARE_FREE_ASSET_LIMIT, readPriorRelease, verifyRetainedAssets } from '../staging/retention.mts';
import { siteIdentityFor } from '../../static-site/lib/site-identity.ts';
import { canonicalTime, validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import { canonicalJson } from './migration.ts';
import { readActivatedCatalogVectors } from './owned-vector-delivery.ts';
import type { PublishedCatalogRead } from './owned-vector-delivery.ts';
import { createVectorizeRestAdapters } from './vectorize-rest.ts';
import type { RunWorkspace, PublicationControl } from './run-workspace.ts';
import { semanticBudgetConfig } from '../../workers/site/semantic-budget.ts';

/** Explicit protected local operator path, NOT a scheduler or a cross-host lock.
 * The workspace holds concrete shared account/environment/database + Worker
 * locks; the D1 activating fence has no timeout/takeover. Before cross-host CI,
 * install one environment concurrency group and exclude out-of-band deployers.
 * Routine execution requires an existing verified catalog prior. First deploy
 * is a separate protected operator operation, never a versions-upload fallback.
 * API contract: developers.cloudflare.com/api/resources/workers/subresources/scripts/
 * versions/ and deployments/. Versions are immutable uploads, NOT publication.
 */
export interface PublicationConfig {
  schemaVersion:1; environment:'staging'|'production'; accountId:string; workerName:string;
  database:{id:string;name:string}; indexName:string; codeSha:string;
  sourceMode:SiteAssetManifest['sourceMode']; sourceRoot:string; releaseId:string;
  identityOrigin:string; compatibilityDate:string;
  /** null directory verifies the prior identity only, without retaining old
   * snapshot/assets. A purged/expired prior is never needed to build anew. */
  prior:{directory:string|null;manifestSha256:string;releaseId:string;versionReference:string}|null;
  /** Omission preserves historical config hashes and off/50/32768 behavior. */
  semanticSearch?:{enabled:boolean;dailyRequestCap:number;dailyTokenCap:number};
  /** Public build inputs only; omission preserves historical hashes/default-off. */
  publicAnalytics?:{enabled:boolean;posthogKey:string;posthogHost:string};
}
const KEY=/^[a-zA-Z0-9._-]{1,200}$/;
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const RESOURCE=/^[a-zA-Z0-9_-]{1,100}$/;
const WORKERS_DEV_NAME=/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const exact=(v:object,keys:string)=>Object.keys(v).sort().join(',')===keys;
const sha256=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
export function validatePublicationConfig(input:PublicationConfig):Readonly<PublicationConfig> {
  if(!input||!exact(input,`accountId,codeSha,compatibilityDate,database,environment,identityOrigin,indexName,prior,${Object.hasOwn(input,'publicAnalytics')?'publicAnalytics,':''}releaseId,schemaVersion,${Object.hasOwn(input,'semanticSearch')?'semanticSearch,':''}sourceMode,sourceRoot,workerName`)
    ||input.schemaVersion!==1||!['staging','production'].includes(input.environment)||!/^[a-f0-9]{32}$/.test(input.accountId)
    ||!RESOURCE.test(input.workerName)||input.environment==='staging'&&!WORKERS_DEV_NAME.test(input.workerName)
    ||!RESOURCE.test(input.indexName)||!input.database||!exact(input.database,'id,name')
    ||!['preview','goose-production','stupid-production'].includes(input.sourceMode)
    ||!UUID.test(input.database.id)||!RESOURCE.test(input.database.name)||!/^[a-f0-9]{40}$/.test(input.codeSha)
    ||!KEY.test(input.releaseId)||!path.isAbsolute(input.sourceRoot)||!/^\d{4}-\d{2}-\d{2}$/.test(input.compatibilityDate)
    ||new Date(`${input.compatibilityDate}T00:00:00.000Z`).toISOString().slice(0,10)!==input.compatibilityDate)
    throw new Error('publication_configuration_invalid');
  const identity=siteIdentityFor(input.sourceMode); const origin=new URL(input.identityOrigin);
  if(origin.protocol!=='https:'||origin.origin!==input.identityOrigin||origin.username||origin.password
    ||input.environment==='staging'&&input.sourceMode!=='preview'
    ||input.environment==='production'&&(input.sourceMode==='preview'||origin.origin!==identity.origin)
    ||input.prior!==null&&(!exact(input.prior,'directory,manifestSha256,releaseId,versionReference')
      ||input.prior.directory!==null&&!path.isAbsolute(input.prior.directory)||!HASH.test(input.prior.manifestSha256)||!KEY.test(input.prior.releaseId)
      ||!UUID.test(input.prior.versionReference)||input.prior.releaseId===input.releaseId))throw new Error('publication_configuration_invalid');
  if(Object.hasOwn(input,'semanticSearch')){
    const policy=input.semanticSearch;
    if(!policy||!exact(policy,'dailyRequestCap,dailyTokenCap,enabled')||typeof policy.enabled!=='boolean'
      ||!Number.isInteger(policy.dailyRequestCap)||!Number.isInteger(policy.dailyTokenCap)
      ||input.environment==='staging'&&policy.enabled
      // Reuse the runtime's exact positive-integer bounds, even when disabled.
      ||!semanticBudgetConfig({ENVIRONMENT:input.environment,SEMANTIC_SEARCH_ENABLED:'true',
        SEMANTIC_SEARCH_DAILY_REQUEST_CAP:String(policy.dailyRequestCap),SEMANTIC_SEARCH_DAILY_TOKEN_CAP:String(policy.dailyTokenCap)},
      {environment:input.environment,index:input.indexName}))throw new Error('publication_configuration_invalid');
  }
  if(Object.hasOwn(input,'publicAnalytics')){
    const policy=input.publicAnalytics;let host:URL|undefined;
    try{if(typeof policy?.posthogHost==='string'&&policy.posthogHost.length<=255)host=new URL(policy.posthogHost);}catch{/* Invalid is not an ingest origin. */}
    if(!policy||!exact(policy,'enabled,posthogHost,posthogKey')||typeof policy.enabled!=='boolean'
      ||input.environment!=='production'&&policy.enabled||typeof policy.posthogKey!=='string'||!/^phc_[a-zA-Z0-9_-]{1,196}$/.test(policy.posthogKey)
      ||!host||host.protocol!=='https:'||host.origin!==policy.posthogHost||host.username||host.password||host.port)
      throw new Error('publication_configuration_invalid');
  }
  return Object.freeze({...input,database:Object.freeze({...input.database}),prior:input.prior&&Object.freeze({...input.prior}),
    ...(Object.hasOwn(input,'semanticSearch')?{semanticSearch:Object.freeze({...input.semanticSearch!})}:{}),
    ...(Object.hasOwn(input,'publicAnalytics')?{publicAnalytics:Object.freeze({...input.publicAnalytics!})}:{})});
}
function searchVars(config:PublicationConfig){
  const policy=Object.hasOwn(config,'semanticSearch')?config.semanticSearch!:{enabled:false,dailyRequestCap:50,dailyTokenCap:32768};
  return{SEMANTIC_SEARCH_ENABLED:String(policy.enabled),SEMANTIC_SEARCH_DAILY_REQUEST_CAP:String(policy.dailyRequestCap),
    SEMANTIC_SEARCH_DAILY_TOKEN_CAP:String(policy.dailyTokenCap)};
}
export type PublicationWorkspace=RunWorkspace;
export type { PublicationControl } from './run-workspace.ts';
export interface PublicationCommand { file:string;args:string[];cwd:string;env:NodeJS.ProcessEnv;timeoutMs:number }
// A separate READ-only sender never receives upload/activation dispatches.
type Dependencies={fetch?:typeof fetch;observationFetch?:typeof fetch;command?:(command:PublicationCommand)=>Promise<void>;now?:()=>Date};
export type PublicationResult={state:'pending';owner:MutationOwner;errorCode:string}|{
  state:'published';owner:null;releaseId:string;receiptSha256:string;receipt:Record<string,unknown>;
};
const packageFiles=['asset-manifest.json','catalog.snapshot.json','release-context.json','release-identity.json','site-identity.json','feed-plan.json'];
async function privateBytes(file:string,max=32*1024*1024){
  const before=await fs.lstat(file);
  if(!before.isFile()||before.uid!==process.getuid?.()||before.nlink!==1||(before.mode&0o777)!==0o600||before.size>max
    ||await fs.realpath(file)!==path.resolve(file))throw new Error('publication_package_invalid');
  const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const opened=await handle.stat();if(opened.ino!==before.ino||opened.dev!==before.dev)throw new Error('publication_package_changed');
    const chunks:Buffer[]=[];let length=0;
    for(;;){const chunk=Buffer.alloc(Math.min(64*1024,max+1-length));const part=await handle.read(chunk);
      if(!part.bytesRead)break;length+=part.bytesRead;if(length>max)throw new Error('publication_package_bound');chunks.push(chunk.subarray(0,part.bytesRead));}
    const bytes=Buffer.concat(chunks);const after=await fs.lstat(file);
    if(after.ino!==before.ino||after.dev!==before.dev||after.nlink!==1||after.size!==before.size||after.mtimeMs!==before.mtimeMs
      ||after.ctimeMs!==before.ctimeMs||bytes.length>max)throw new Error('publication_package_changed');return bytes;
  }finally{await handle.close();}
}
async function privateDirectories(directory:string,boundary:string){
  if(!directory.startsWith(`${boundary}${path.sep}`)&&directory!==boundary)throw new Error('publication_package_invalid');
  for(let current=directory;;current=path.dirname(current)){
    const stat=await fs.lstat(current);if(!stat.isDirectory()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o700
      ||await fs.realpath(current)!==current)throw new Error('publication_package_invalid');if(current===boundary)break;
  }
}
async function write(file:string,value:string|Uint8Array){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  if(await fs.realpath(path.dirname(file))!==path.resolve(path.dirname(file)))throw new Error('publication_package_invalid');
  let handle;
  try{handle=await fs.open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST'||!(await privateBytes(file)).equals(Buffer.from(value)))throw new Error('publication_package_changed');return;}
  try{await handle.writeFile(value);await handle.sync();}finally{await handle.close();}
  if(!(await privateBytes(file)).equals(Buffer.from(value)))throw new Error('publication_package_changed');
}
async function json(file:string,max=32*1024*1024){return JSON.parse((await privateBytes(file,max)).toString('utf8'));}
async function files(directory:string){const entries=await fs.readdir(directory,{recursive:true,withFileTypes:true});
  if(entries.some(e=>!e.isFile()&&!e.isDirectory()))throw new Error('publication_package_invalid');
  return entries.filter(e=>e.isFile()).map(e=>path.relative(directory,path.join(e.parentPath,e.name)).split(path.sep).join('/')).sort();}
async function inventory(directory:string){const names=await files(directory);let bytes=0;
  // Count actual files, including private package metadata, within the same
  // conservative Free asset bound already enforced by the static assembler.
  if(names.length>CLOUDFLARE_FREE_ASSET_LIMIT)throw new Error('publication_package_bound');const hashes:Record<string,string>={};
  for(const name of names){const file=path.join(directory,name);await privateDirectories(path.dirname(file),directory);
    const body=await privateBytes(file);bytes+=body.length;
    if(bytes>384*1024*1024)throw new Error('publication_package_bound');hashes[name]=sha256(body);}
  return hashes;}
export { inventory as inventoryPublicationPackage };
const safePath=(name:string)=>name.startsWith('/')&&!name.includes('\\')&&!name.split('/').some(part=>part==='.'||part==='..')&&!name.includes('\0');
function childEnv():NodeJS.ProcessEnv{return{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
  CI:'true',NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:'false',WRANGLER_SEND_METRICS:'false'};}
function publicAnalyticsEnv(config:PublicationConfig):Record<string,string>{
  const policy=Object.hasOwn(config,'publicAnalytics')?config.publicAnalytics:undefined;
  return config.environment==='production'&&policy?.enabled?{NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:'true',
    NEXT_PUBLIC_POSTHOG_KEY:policy.posthogKey,NEXT_PUBLIC_POSTHOG_HOST:policy.posthogHost}:{};
}
async function commandDefault(command:PublicationCommand){
  // Build/cache/package copies are private from their first byte, including
  // subprocess-created Next/Wrangler files. Positional args never enter shell source.
  try{await promisify(execFile)('/bin/sh',['-c','umask 077; exec "$@"','publication',command.file,...command.args],
    {cwd:command.cwd,env:command.env,timeout:command.timeoutMs,maxBuffer:1024*1024});}
  catch{throw new Error('publication_command_unknown');} // Never log stdout/stderr/provider errors.
}

/** No retries, redirects or uncertain-write replay in this REST client. The API
 * budget is per invocation. Wrangler separately retries asset/immutable VERSION
 * upload internally; duplicate matching versions are ambiguous, never activated.
 */
function provider(config:PublicationConfig,token:string,send:typeof fetch,identityAuthorization?:string,observationSend=send){
  if(!token||token.length>4096||/[^\x21-\x7e]/.test(token)
    ||identityAuthorization!==undefined&&(identityAuthorization.length>4096||/[\r\n]/.test(identityAuthorization)))throw new Error('publication_credentials_invalid');
  const base=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}`;let calls=0;
  async function request(url:string,body?:unknown,identity=false,allow404=false,signal?:AbortSignal):Promise<unknown>{
    signal?.throwIfAborted();
    const readSend=signal&&body===undefined?observationSend:send;
    if(++calls>100)throw new Error('publication_provider_bound');const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    let sent:Promise<Response>|undefined,pending:Promise<unknown>|undefined,cancellation:Promise<unknown>|undefined,rejectAbort:(error:Error)=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
    const abort=()=>{controller.abort();cancellation??=reader?.cancel().catch(()=>{});rejectAbort(new Error());};
    signal?.addEventListener('abort',abort,{once:true});
    try{pending=(async()=>{const response=await(sent=readSend(url,{method:body===undefined?'GET':'POST',redirect:'error',signal:controller.signal,
      headers:identity?{...(identityAuthorization?{Authorization:identityAuthorization}:{}), 'Cache-Control':'no-cache'}:
        {Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
      if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw new Error();}
      if(response.status===404&&allow404){await response.body?.cancel();return null;}
      if(!response.ok||!response.body)throw new Error();reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
        if(size>512*1024){await reader.cancel();throw new Error();}chunks.push(part.value);}}finally{reader.releaseLock();}
      const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(identity)return raw;if(!raw||raw.success!==true||!Object.hasOwn(raw,'result'))throw new Error();return raw.result;
    })();return await Promise.race([pending,aborted,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort();reject(new Error());},2500);})]);
    }catch{throw new Error(body===undefined?'publication_provider_unavailable':'publication_activation_unknown');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(controller.signal.aborted&&pending&&(body===undefined||isAccountedPublicationFetch(readSend))){
      if(isAccountedPublicationFetch(readSend)&&sent)await sent.catch(()=>{});
      await drainDeploymentObservation(Promise.allSettled([pending,cancellation]));}}
  }
  const script=`${base}/workers/scripts/${config.workerName}`;
  return{
    async check(){const database=await request(`${base}/d1/database/${config.database.id}`) as Record<string,unknown>;
      const vector=await request(`${base}/vectorize/v2/indexes/${config.indexName}`) as {name?:unknown;config?:{dimensions?:unknown;metric?:unknown}};
      if(database?.uuid!==config.database.id||database.name!==config.database.name
        ||(database.read_replication as {mode?:unknown})?.mode!=='disabled'||vector?.name!==config.indexName
        ||vector.config?.dimensions!==1536||vector.config.metric!=='cosine')throw new Error('publication_provider_identity_mismatch');},
    async version(id:string){if(!UUID.test(id))throw new Error('publication_version_invalid');return await request(`${script}/versions/${id}`) as Record<string,unknown>;},
    async findVersion(marker:string){const found:string[]=[];
      for(let page=1;page<=10;page++){const result=await request(`${script}/versions?page=${page}&per_page=10`) as {items?:{id:string}[]};
        if(!Array.isArray(result?.items)||result.items.length>10)throw new Error('publication_provider_invalid');
        for(const item of result.items){if(!UUID.test(item.id))throw new Error('publication_provider_invalid');
          const version=await this.version(item.id);if((version.annotations as Record<string,unknown>)?.['workers/tag']===marker)found.push(item.id);}
        if(result.items.length<10){if(found.length>1)throw new Error('publication_version_ambiguous');return found[0]??null;}}
      throw new Error('publication_version_lookup_bound');},
    async deployed(signal?:AbortSignal){const result=await request(`${script}/deployments`,undefined,false,true,signal) as {deployments?:unknown[]}|null;
      if(result===null)return null;if(!Array.isArray(result?.deployments))throw new Error('publication_provider_invalid');
      const value=result.deployments[0] as {id?:string;versions?:{version_id:string;percentage:number}[];annotations?:Record<string,unknown>}|undefined;
      if(!value)return null;if(!UUID.test(value.id??'')||!Array.isArray(value.versions)||value.versions.length!==1
        ||value.versions[0].percentage!==100||!UUID.test(value.versions[0].version_id))throw new Error('publication_deployment_not_settled');
      return{id:value.id!,version:value.versions[0].version_id,marker:value.annotations?.['workers/message']};},
    async identity(signal?:AbortSignal){return await request(`${config.identityOrigin}/.well-known/catalog-release.json`,undefined,true,false,signal);},
    async activate(version:string,marker:string){const result=await request(`${script}/deployments`,{strategy:'percentage',
      versions:[{version_id:version,percentage:100}],annotations:{'workers/message':marker}}) as {id?:string};
      if(!UUID.test(result?.id??''))throw new Error('publication_activation_unknown');return result.id!;},
  };
}

function identity(intent:PublicationIntent,versionReference:string):DeploymentIdentity{return{releaseId:intent.releaseId,codeSha:intent.codeSha,
  catalogRevision:intent.catalogRevision,catalogSnapshotSha256:intent.catalogSnapshotSha256,manifestSha256:intent.manifestSha256,versionReference};}
function matchesIdentity(raw:unknown,intent:PublicationIntent){return canonicalJson(raw)===canonicalJson({release_id:intent.releaseId,code_sha:intent.codeSha,
  catalog_revision:intent.catalogRevision,catalog_snapshot_sha256:intent.catalogSnapshotSha256,manifest_sha256:intent.manifestSha256});}
function verifyUploadedVersion(value:Record<string,unknown>,config:PublicationConfig,version:string,control:PublicationControl){
  const resources=value.resources as {bindings?:Record<string,unknown>[];script_runtime?:{compatibility_date?:unknown}}|undefined;
  const bindings=resources?.bindings;
  if(value.id!==version||!Array.isArray(bindings)||bindings.length>100||resources?.script_runtime?.compatibility_date!==config.compatibilityDate
    ||(value.annotations as Record<string,unknown>)?.['workers/tag']!==control.uploadMarker
    ||(value.annotations as Record<string,unknown>)?.['workers/message']!==`package:${control.packageSha256}`)throw new Error('publication_version_mismatch');
  const named=new Map(bindings.map(binding=>[binding.name,binding]));
  const expectedSearch=searchVars(config);
  if(named.size!==bindings.length||named.get('DB')?.type!=='d1'||named.get('DB')?.id!==config.database.id
    ||named.get('VECTORIZE')?.type!=='vectorize'||named.get('VECTORIZE')?.index_name!==config.indexName||named.get('ASSETS')?.type!=='assets'
    ||named.get('ENVIRONMENT')?.type!=='plain_text'||named.get('ENVIRONMENT')?.text!==config.environment
    ||Object.entries(expectedSearch).some(([name,text])=>named.get(name)?.type!=='plain_text'||named.get(name)?.text!==text)
    ||config.environment==='staging'&&named.get('STAGING_AUTH_SECRET')?.type!=='secret_text')throw new Error('publication_version_scope_mismatch');
}

async function loadPackage(directory:string,config:PublicationConfig,expectedHash:string,now:Date){
  const hashes=await inventory(directory);if(sha256(canonicalJson(hashes))!==expectedHash)throw new Error('publication_package_changed');
  const bytes=await privateBytes(path.join(directory,'asset-manifest.json'));const manifest=JSON.parse(bytes.toString()) as SiteAssetManifest;
  const snapshot=validateCatalogSnapshot(await json(path.join(directory,'catalog.snapshot.json')),now);const context=await json(path.join(directory,'release-context.json'));
  verifyReleaseIdentity(bytes,await json(path.join(directory,'release-identity.json')));
  if(manifest.releaseId!==config.releaseId||manifest.codeSha!==config.codeSha||manifest.sourceMode!==config.sourceMode||manifest.dataKind!=='catalog'
    ||sha256(await privateBytes(path.join(directory,'catalog.snapshot.json')))!==manifest.catalogSnapshotSha256
    ||manifest.nextExpiry!==null&&manifest.nextExpiry<=now.toISOString())throw new Error('publication_package_unready');
  verifyReleaseContext(context,manifest,snapshot,config.codeSha,now);verifySiteIdentity(await privateBytes(path.join(directory,'site-identity.json')),manifest);
  verifyFeedPlan(snapshot,manifest.catalogSnapshotSha256,await json(path.join(directory,'feed-plan.json')));
  const assets=new Map<string,Uint8Array>();
  for(const [name,hash] of Object.entries(manifest.checksums)){
    if(!safePath(name)||hashes[`assets${name}`]!==hash)throw new Error('publication_package_changed');assets.set(name,await privateBytes(path.join(directory,'assets',name.slice(1))));}
  if(Object.keys(hashes).filter(name=>name.startsWith('assets/')).length!==assets.size)throw new Error('publication_package_changed');
  const prior=await readPriorRelease(context,config.prior?.directory??undefined);verifyRetainedAssets(snapshot,assets,manifest,context,prior);
  return{manifest,snapshot,context,bytes};
}
function intentFrom(manifest:SiteAssetManifest,bytes:Uint8Array):PublicationIntent{return{releaseId:manifest.releaseId,codeSha:manifest.codeSha,catalogRevision:manifest.catalogRevision,
  catalogSnapshotSha256:manifest.catalogSnapshotSha256,manifestSha256:sha256(bytes),vectorSyncWatermark:manifest.vectorSyncWatermark,
  priorReleaseId:manifest.priorReleaseId,nextExpiry:manifest.nextExpiry};}

/** Actual Node composition. Test seams replace only command/HTTP/clock, never
 * publication predicates. Ambiguous external steps are reconciled, not resent.
 * Credentials never enter checkpoints, artifacts, command args or returned errors.
 */
export async function executePublication(options:{db:CatalogD1&{providerIdentity:string};owner:MutationOwner;revision:PrunedRevision|null;published?:PublishedCatalogRead;permanent?:PermanentCatalogRevision;requestId:string;runReference:string;
  workspace:PublicationWorkspace;config:PublicationConfig;credentials:{cloudflareToken:string;identityAuthorization?:string};dependencies?:Dependencies}):Promise<PublicationResult>{
  const {db,workspace,revision}=options;const config=validatePublicationConfig(options.config);const now=options.dependencies?.now??(()=>new Date());
  if(options.permanent&&(options.published||!revision||canonicalJson(options.permanent)!==canonicalJson(revision))
    ||revision?.nativePreservation&&!options.permanent)throw new Error('publication_permanent_input_invalid');
  if(db.providerIdentity!==`cloudflare:${config.accountId}:${config.database.id}`)throw new Error('publication_database_scope_mismatch');
  await workspace.assertHeld();await workspace.assertScope({accountId:config.accountId,environment:config.environment,databaseId:config.database.id,
    databaseName:config.database.name,workerName:config.workerName,indexName:config.indexName});
  if(workspace.manifest.codeSha!==config.codeSha)throw new Error('publication_workspace_mismatch');
  if(workspace.repository!==await fs.realpath(config.sourceRoot))throw new Error('publication_workspace_mismatch');
  const observationSend=options.dependencies?.observationFetch??options.dependencies?.fetch??fetch;
  const api=provider(config,options.credentials.cloudflareToken,options.dependencies?.fetch??fetch,options.credentials.identityAuthorization,observationSend);
  const command=options.dependencies?.command??commandDefault;const configSha256=sha256(canonicalJson(config));
  let checkpoint=await workspace.readCheckpoint({controlOnly:true});let control=checkpoint?.checkpoint.control?.publication;
  let owner=options.owner;const directory=path.join(workspace.directory,'packages',config.releaseId);
  const runtime=path.join(workspace.directory,'publication-runtime',config.releaseId);
  const uploadBinding=()=>({schemaVersion:1,releaseId:config.releaseId,requestId:options.requestId,configSha256,
    packageSha256:control!.packageSha256,uploadMarker:control!.uploadMarker});
  const save=async(patch:Partial<PublicationControl>,nextOwner=owner)=>{
    await workspace.assertHeld();control={...control!,...patch};owner=nextOwner;
    // Read normal state only before activation; control-only settlement must not
    // turn expired merchant artifacts back into usable content.
    const view=await workspace.readCheckpoint({controlOnly:true});if(!view)throw new Error('publication_checkpoint_missing');
    if(view.checkpoint.control?.publication?.permit||control.permit&&view.checkpoint.control?.publication?.stage==='activating'){
      await workspace.writeControlCheckpoint(view.sha256,{phase:'attention',owner,control:{publication:control}});
    }else{
      const current=await workspace.readCheckpoint();if(!current)throw new Error('publication_checkpoint_missing');
      const state=current.checkpoint.state;
      if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('publication_checkpoint_invalid');
      await workspace.writeCheckpoint(current.sha256,{...current.checkpoint,phase:'publishing',owner,
        state:JSON.parse(JSON.stringify({...state,publication:control})),control:{publication:control}});
    }
    checkpoint=await workspace.readCheckpoint({controlOnly:true});
  };
  try{
    if(!HASH.test(options.requestId)||!/^[a-zA-Z0-9._:/-]{1,200}$/.test(options.runReference))throw new Error('publication_input_invalid');
    if(control&&(control.configSha256!==configSha256||control.requestId!==options.requestId||control.runReference!==options.runReference))throw new Error('publication_checkpoint_mismatch');
    // A rejected protected upload is an operator-review gate, not an uncertain
    // ordinary CLI exit. Its body-free pin survives content expiry and prevents
    // a later uploading-stage resume from bypassing scope/accounting refusal.
    if(checkpoint?.checkpoint.pins.publicationUploadReview)throw new Error('publication_upload_review_required');
    const pendingUpload=checkpoint?.checkpoint.pins.publicationUploadPending,acknowledgedUpload=checkpoint?.checkpoint.pins.publicationUploadAcknowledged;
    // Pins are append-only. A durable exact acknowledgement logically clears
    // pending; no artifact-body read (or new content rights) is needed on expiry.
    if((pendingUpload||acknowledgedUpload)&&(!control||!pendingUpload||!acknowledgedUpload
      ||pendingUpload.sha256!==sha256(canonicalJson(uploadBinding()))
      ||acknowledgedUpload.sha256!==sha256(canonicalJson({...uploadBinding(),pending:pendingUpload}))))
      throw new Error('publication_upload_review_required');
    if(config.prior===null){
      // Old first-deploy checkpoints may still need settlement. A local marker
      // alone cannot grant that exception or permission for a new activation.
      const historical=control&&(await db.prepare('SELECT state,lease_token,run_reference,release_id,version_reference FROM catalog_build_requests WHERE request_id=?')
        .bind(control.requestId).all<Record<string,unknown>>()).results[0];
      if(!control||!historical||!['activating','resolved'].includes(String(historical.state))
        ||control.build.request.priorReleaseId!==null||historical.lease_token!==control.build.token
        ||historical.run_reference!==control.runReference||historical.release_id!==config.releaseId
        ||!control.versionReference||historical.version_reference!==control.versionReference)throw new Error('publication_bootstrap_required');
    }
    await api.check();
    if(!control){
      if(!revision||owner.phase!=='freezing'||owner.environment!==config.environment||owner.indexName!==config.indexName)throw new Error('publication_revision_required');
      await db.batch([mutationAssertion(db,owner,['freezing'])]);
      let build;
      try{build=await claimBuildRequest(db,options.requestId,options.runReference,now());}catch{/* Recover only this exact persisted run's claim. */}
      if(!build){const row=(await db.prepare('SELECT * FROM catalog_build_requests WHERE request_id=?').bind(options.requestId).all<Record<string,unknown>>()).results[0];
        if(row?.state==='building'&&row.run_reference===options.runReference&&typeof row.lease_until==='string'&&row.lease_until>now().toISOString()){
          build={requestId:options.requestId,token:String(row.lease_token),runReference:options.runReference,leaseUntil:row.lease_until,
            request:JSON.parse(String(row.request_json))};
        }
      }
      if(!build)throw new Error('publication_build_not_claimed');
      if(build.request.codeSha!==config.codeSha||build.request.sourceRevision!==revision.snapshot.catalogRevision
        ||build.request.sourceDigest!==sha256(`${JSON.stringify(revision.snapshot)}\n`)||build.request.environment!==config.environment
        ||build.request.priorReleaseId!==(config.prior?.releaseId??null))throw new Error('publication_build_mismatch');
      const plan=prunedVectorPlan(revision);const marker=`catalog-${sha256(`${options.requestId}:${config.releaseId}`).slice(0,40)}`;
      control={schemaVersion:1,configSha256,requestId:options.requestId,runReference:options.runReference,stage:'claimed',build,
        publication:null,intent:null,permit:null,vectorPlan:{catalogRevision:plan.catalogRevision,planSha256:sha256(canonicalJson(plan)),
          ids:prunedVectorIds(plan)},packageSha256:null,uploadMarker:marker,
        versionReference:null,deploymentMarker:`${marker}-activate`,deploymentId:null};
      await save({});
    }
    // A lost activation-CAS response is recoverable ONLY for the exact claim.
    const actual=await readMutationOwner(db,owner);
    const buildRow=(await db.prepare("SELECT *,strftime('%Y-%m-%dT%H:%M:%fZ','now') observed_at FROM catalog_build_requests WHERE request_id=?")
      .bind(control.requestId).all<Record<string,unknown>>()).results[0];
    if(control.stage==='claimed'){
      // No external step exists yet. Reclaim an expired BUILDING lease through
      // the ordinary bounded API, never renew its token or adopt a foreign one.
      const old=control.build,requestBytes=encodeBuildRequest(old.request);
      if(owner.phase!=='freezing'||canonicalJson(actual)!==canonicalJson(owner)||old.requestId!==control.requestId
        ||old.runReference!==control.runReference||sha256(requestBytes)!==control.requestId||!buildRow
        ||buildRow.state!=='building'||buildRow.lease_token!==old.token||buildRow.lease_until!==old.leaseUntil
        ||buildRow.run_reference!==old.runReference||buildRow.request_json!==requestBytes
        ||buildRow.environment!==config.environment||buildRow.source_revision!==old.request.sourceRevision
        ||buildRow.dispatch_reference!==null||buildRow.error_code!==null||buildRow.release_id!==null||buildRow.version_reference!==null
        ||control.publication!==null||control.intent!==null||control.permit!==null||control.packageSha256!==null
        ||control.versionReference!==null||control.deploymentId!==null||control.receiptSha256!==undefined
        ||pendingUpload||acknowledgedUpload)throw new Error('publication_build_reclaim_fenced');
      const columns=Object.keys(buildRow).filter(key=>key!=='observed_at');
      const exact=(row:Record<string,unknown>)=>db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM catalog_build_requests
        WHERE ${columns.map(key=>`${key} IS ?`).join(' AND ')}) THEN 'true' ELSE 'publication_build_reclaim_fenced' END)`)
        .bind(...columns.map(key=>row[key]));
      const undispatched=()=>db.prepare(`SELECT json(CASE WHEN NOT EXISTS(SELECT 1 FROM publication_outbox WHERE release_id=?)
        AND NOT EXISTS(SELECT 1 FROM publication_receipts WHERE release_id=?) THEN 'true' ELSE 'publication_build_reclaim_fenced' END)`)
        .bind(config.releaseId,config.releaseId);
      await db.batch([mutationAssertion(db,owner,['freezing']),exact(buildRow),undispatched(),mutationAssertion(db,owner,['freezing'])]);
      const at=canonicalTime(String(buildRow.observed_at));
      if(canonicalTime(old.leaseUntil)<=at){
        const attempts=Number(buildRow.attempts),leaseUntil=new Date(Math.min(Date.parse(at)+15*60000,Date.parse(old.request.cutoff))).toISOString();
        if(!Number.isInteger(attempts)||attempts<1||attempts>=3||leaseUntil<=at)throw new Error('publication_build_reclaim_fenced');
        let reclaimed:Awaited<ReturnType<typeof claimBuildRequest>>=null,uncertain=false;
        try{reclaimed=await claimBuildRequest(db,old.requestId,old.runReference,new Date(at),15*60000);}catch{uncertain=true;}
        if(!reclaimed&&!uncertain)throw new Error('publication_build_reclaim_fenced');
        const row=(await db.prepare("SELECT *,strftime('%Y-%m-%dT%H:%M:%fZ','now') observed_at FROM catalog_build_requests WHERE request_id=?")
          .bind(old.requestId).all<Record<string,unknown>>()).results[0];
        if(!row||row.state!=='building'||row.request_json!==requestBytes||row.environment!==buildRow.environment
          ||row.source_revision!==buildRow.source_revision||row.run_reference!==old.runReference||row.attempts!==attempts+1
          ||typeof row.lease_token!=='string'||!UUID.test(row.lease_token)||row.lease_token===old.token||row.lease_until!==leaseUntil
          ||reclaimed&&(reclaimed.token!==row.lease_token||encodeBuildRequest(reclaimed.request)!==requestBytes)
          ||leaseUntil<=canonicalTime(String(row.observed_at))||leaseUntil<=now().toISOString()
          ||row.dispatch_reference!==null||row.error_code!==null||row.release_id!==null||row.version_reference!==null)
          throw new Error('publication_build_reclaim_fenced');
        await db.batch([mutationAssertion(db,owner,['freezing']),exact(row),undispatched(),mutationAssertion(db,owner,['freezing'])]);
        if(canonicalJson(await readMutationOwner(db,owner))!==canonicalJson(owner))throw new Error('publication_build_reclaim_fenced');
        // A failed pre-write checkpoint leaves a fenced token mismatch. Never
        // infer ownership from a different token on a later invocation.
        await save({build:{...old,token:row.lease_token,leaseUntil}});
      }
    }
    const receipt=()=>({schemaVersion:1,environment:config.environment,accountId:config.accountId,workerName:config.workerName,
      releaseId:config.releaseId,versionReference:control!.versionReference,requestId:control!.requestId,intent:control!.intent});
    // A lost resolve response must not reacquire a writer or reactivate. The
    // durable receipt was saved before resolve, whose D1 transaction proves idle.
    if(buildRow?.state==='resolved'&&buildRow.lease_token===control.build.token&&buildRow.run_reference===control.runReference
      &&buildRow.release_id===config.releaseId&&buildRow.version_reference===control.versionReference&&control.receiptSha256
      &&(await publicationStatus(db,config.releaseId)).state==='published'){
      const stored=(await db.prepare('SELECT manifest_json FROM publication_receipts WHERE release_id=?').bind(config.releaseId).all<{manifest_json:string}>()).results[0];
      if(!stored||canonicalJson(JSON.parse(stored.manifest_json))!==canonicalJson(control.intent)
        ||sha256(canonicalJson(receipt()))!==control.receiptSha256)throw new Error('publication_receipt_mismatch');
      return{state:'published',owner:null,releaseId:config.releaseId,receiptSha256:control.receiptSha256,receipt:receipt()};
    }
    if(!control.permit&&actual?.phase==='activating'&&buildRow?.state==='activating'&&buildRow.lease_token===control.build.token
      &&buildRow.run_reference===control.runReference&&buildRow.release_id===config.releaseId&&buildRow.version_reference===control.versionReference
      &&canonicalJson({...actual,phase:owner.phase})===canonicalJson(owner)){
      await save({stage:'activating',permit:{requestId:control.requestId,token:control.build.token,runReference:control.runReference,
        releaseId:config.releaseId,versionReference:control.versionReference!,mutationOwner:actual}},actual);
    }
    if(control.permit){
      owner=control.permit.mutationOwner!;
      const observed=async(signal?:AbortSignal):Promise<DeploymentObservation>=>{
        signal?.throwIfAborted();await workspace.assertHeld();signal?.throwIfAborted();const deployed=await api.deployed(signal);signal?.throwIfAborted();
        if(!deployed||deployed.version!==control!.versionReference||deployed.marker!==control!.deploymentMarker
          ||control!.deploymentId!==null&&deployed.id!==control!.deploymentId)throw new Error('publication_activation_pending');
        if(!matchesIdentity(await api.identity(signal),control!.intent!))throw new Error('publication_identity_mismatch');signal?.throwIfAborted();
        await readActivatedCatalogVectors(db,control!.permit!,control!.vectorPlan,createVectorizeRestAdapters({environment:config.environment,
          indexName:config.indexName,accountId:config.accountId,token:options.credentials.cloudflareToken,fetch:observationSend}),
          {signal,published:options.published,permanent:options.permanent});signal?.throwIfAborted();
        // Re-read deployment after independent identity/vector reads. Never infer
        // not-submitted from elapsed time or an observed prior deployment.
        const after=await api.deployed(signal);signal?.throwIfAborted();if(canonicalJson(after)!==canonicalJson(deployed))throw new Error('publication_activation_pending');
        return{environment:config.environment,settled:true,active:identity(control!.intent!,control!.versionReference!)};
      };
      if((await publicationStatus(db,config.releaseId)).state!=='published'){
        if(!revision)throw new Error('publication_fresh_evidence_required');
        const sealed=await loadPackage(directory,config,control.packageSha256!,now());
        if(canonicalJson(intentFrom(sealed.manifest,sealed.bytes))!==canonicalJson(control.intent)
          ||canonicalJson(sealed.snapshot)!==canonicalJson(revision.snapshot))throw new Error('publication_package_changed');
        const readDeployed=async()=>{
          await observed();return control!.intent!;
        };
        if(control.publication!.leaseUntil<=now().toISOString())
          if(options.permanent)await completeActivatedPermanentPublication(db,revision,control.publication!,control.permit,readDeployed,now);
          else await completeActivatedPublication(db,revision,control.publication!,control.permit,readDeployed,now,options.published);
        else await completePublication(db,sealed.snapshot,config.releaseId,control.publication!.token,readDeployed,now,owner);
      }
      const proof=receipt();
      let ref={sha256:control.receiptSha256??sha256(canonicalJson(proof))};
      if(!control.receiptSha256){try{ref=await workspace.putArtifact(proof,{kind:'publication',observedAt:now().toISOString()});}
        catch(error){if(!(error instanceof Error)||error.message!=='run_workspace_expired')throw error;
          // Only an ALREADY accepted D1 publication can reach this path. Its
          // receipt is reconstructible entirely from immutable control; record
          // that digest in the protected control journal, never renew content.
        }}
      await save({stage:'published',receiptSha256:ref.sha256});
      let observation:Promise<DeploymentObservation>|undefined;
      try{if(await resolveBuildActivation(db,control.permit,signal=>(observation=observed(signal)),{observationTimeoutMs:30_000})!=='resolved')
        throw new Error('publication_activation_pending');}
      finally{if(observation){
        // Only concrete bounded read transports can own durable ledger cleanup.
        // Arbitrary injected adapters never acquire an unbounded join.
        if(isAccountedPublicationFetch(observationSend)&&isCatalogD1Rest(db))await observation.catch(()=>{});
        else await drainDeploymentObservation(observation);}}
      return{state:'published',owner:null,releaseId:config.releaseId,receiptSha256:ref.sha256,receipt:proof};
    }
    if(config.prior===null)throw new Error('publication_bootstrap_required'); // Historical reconciliation only; never a new external action.
    if(!revision||owner.phase!=='freezing')throw new Error('publication_revision_required');
    assertBuildSource(config.sourceRoot,config.codeSha);
    if(control.stage==='claimed'){
      const context:ReleaseBuildContext={schemaVersion:1,sourceMode:config.sourceMode,releaseId:config.releaseId,codeSha:config.codeSha,
        catalogRevision:revision.snapshot.catalogRevision,catalogSnapshotSha256:sha256(`${JSON.stringify(revision.snapshot)}\n`),
        generatedAt:revision.snapshot.generatedAt,vectorSyncWatermark:revision.vectorSyncWatermark,priorReleaseId:config.prior?.releaseId??null,
        retainedManifestSha256:config.prior?.directory?config.prior.manifestSha256:null};
      validateBuildContext(context,revision.snapshot,config.codeSha,context.catalogSnapshotSha256,now());
      let observedAt=revision.snapshot.generatedAt;
      const deadlines=revision.snapshot.products.map(p=>p.eligibleUntil);
      if(config.prior?.directory){
        // Repackaging a permitted historical shard must not renew its original
        // observation/expiry. Identity-only prior mode reads/copies no old body.
        const bytes=await privateBytes(path.join(config.prior.directory,'asset-manifest.json'));
        if(sha256(bytes)!==config.prior.manifestSha256)throw new Error('publication_prior_changed');
        const prior=JSON.parse(bytes.toString()) as SiteAssetManifest;
        if(prior.releaseId!==config.prior.releaseId)throw new Error('publication_prior_changed');
        const original=canonicalTime(prior.generatedAt);if(original<observedAt)observedAt=original;
        if(prior.nextExpiry!==null)deadlines.push(canonicalTime(prior.nextExpiry));
        for(const route of Object.values(prior.routes))if(route.state==='ready'&&route.eligibleUntil
          &&/^\/catalog\/[a-f0-9]{64}\/(?:random|feed-[1-9][0-9]*)\.json$/.test(route.assetPath))deadlines.push(canonicalTime(route.eligibleUntil));
      }
      await workspace.preparePublicationDirectories(config.releaseId,observedAt,deadlines.sort()[0]??null);
      await write(path.join(directory,'input.snapshot.json'),`${JSON.stringify(revision.snapshot)}\n`);
      await write(path.join(directory,'input.context.json'),`${JSON.stringify(context)}\n`);
      const env={...childEnv(),...publicAnalyticsEnv(config),TMPDIR:path.join(runtime,'tmp'),CATALOG_SITE_MODE:config.sourceMode,CATALOG_SNAPSHOT_PATH:path.join(directory,'input.snapshot.json'),
        CATALOG_RELEASE_CONTEXT_PATH:path.join(directory,'input.context.json'),...(config.prior?.directory?{CATALOG_PRIOR_RELEASE_PATH:config.prior.directory}:{})};
      let built=false;
      try{const previous=JSON.parse(await fs.readFile(path.join(config.sourceRoot,'build/stupid-gifts/asset-manifest.json'),'utf8'));built=previous.releaseId===config.releaseId;}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('publication_build_requires_operator_review');}
      for(const script of [...(built?[]:['build.mts']),'verify-release.mts'])await command({file:process.execPath,args:['--import','tsx',`scripts/staging/${script}`],
        cwd:config.sourceRoot,env,timeoutMs:300_000});
      for(const name of packageFiles)await write(path.join(directory,name),await fs.readFile(path.join(config.sourceRoot,'build/stupid-gifts',name)));
      const manifest=await json(path.join(directory,'asset-manifest.json')) as SiteAssetManifest;
      for(const name of Object.keys(manifest.checksums)){if(!safePath(name))throw new Error('publication_package_invalid');
        await write(path.join(directory,'assets',name.slice(1)),await fs.readFile(path.join(config.sourceRoot,'static-site/out',name.slice(1))));}
      const entry=path.join(directory,'entry.mts');const imports=packageFiles.filter(name=>!['release-context.json'].includes(name));
      const variables=['manifest','snapshot','releaseIdentity','siteIdentity','feedPlan'];
      const entryBytes=imports.map((name,i)=>`import ${variables[i]} from ${JSON.stringify(path.join(directory,name))};`).join('\n')+
        `\nimport {createSiteWorker} from ${JSON.stringify(path.join(config.sourceRoot,'workers/site/index.ts'))};\n`+
        `import {d1SearchAdapters} from ${JSON.stringify(path.join(config.sourceRoot,'workers/site/d1-search.ts'))};\n`+
        `export default createSiteWorker({snapshot,manifest,releaseIdentity,feedPlan,canonicalOrigin:siteIdentity.origin,searchAdapters:d1SearchAdapters,`+
        `semanticBudgetScope:${JSON.stringify({environment:config.environment,index:config.indexName})}});\n`;
      await write(entry,entryBytes);
      await write(path.join(directory,'wrangler.json'),JSON.stringify({name:config.workerName,account_id:config.accountId,main:entry,
        compatibility_date:config.compatibilityDate,workers_dev:config.environment==='staging',preview_urls:false,upload_source_maps:false,
        observability:{enabled:false},assets:{directory:path.join(directory,'assets'),binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},
        vars:{ENVIRONMENT:config.environment,...searchVars(config)},
        d1_databases:[{binding:'DB',database_name:config.database.name,database_id:config.database.id}],
        vectorize:[{binding:'VECTORIZE',index_name:config.indexName}]}));
      const packageSha256=sha256(canonicalJson(await inventory(directory)));
      await save({stage:'built',packageSha256});
    }
    const sealed=await loadPackage(directory,config,control.packageSha256!,now());
    // The independently verified private package is sufficient for upload and
    // restart. Drop owned source intermediates now so tomorrow's run can build.
    await workspace.cleanPublicationBuild(config.releaseId);
    const intent=intentFrom(sealed.manifest,sealed.bytes);
    if(control.intent&&canonicalJson(control.intent)!==canonicalJson(intent))throw new Error('publication_package_changed');
    if(control.stage==='built'){
      const protectedUpload=isAccountedPublicationUploadCommand(command);
      if(protectedUpload){
        const current=await workspace.readCheckpoint();if(!current)throw new Error('publication_checkpoint_missing');
        const pending=await workspace.putArtifact(uploadBinding(),{kind:'publication',observedAt:now().toISOString()});
        await workspace.writeCheckpoint(current.sha256,{...current.checkpoint,pins:{...current.checkpoint.pins,publicationUploadPending:pending}});
      }
      await enqueuePublication(db,sealed.snapshot,intent,now());
      const publication=await claimPublication(db,sealed.snapshot,intent.releaseId,now());if(!publication)throw new Error('publication_claim_unavailable');
      await save({intent,publication,stage:'uploading'});
      assertBuildSource(config.sourceRoot,config.codeSha);await workspace.assertHeld();
      // Intent is durable before the only upload CLI invocation (Wrangler may
      // internally retry immutable version POST). Duplicate tags stay pending.
      try{await command({file:process.execPath,args:['node_modules/wrangler/bin/wrangler.js','versions','upload','--config',path.join(directory,'wrangler.json'),
        '--outdir',path.join(runtime,'bundle'),'--tag',control.uploadMarker,'--message',`package:${control.packageSha256}`],cwd:config.sourceRoot,env:{...childEnv(),TMPDIR:path.join(runtime,'tmp'),
        CLOUDFLARE_ACCOUNT_ID:config.accountId,CLOUDFLARE_API_TOKEN:options.credentials.cloudflareToken,
        WRANGLER_LOG_PATH:path.join(runtime,'logs'),WRANGLER_OUTPUT_FILE_PATH:path.join(runtime,'upload.ndjson')},timeoutMs:300_000});}catch(error){
        if(error instanceof PublicationUploadCommandError){
          const current=await workspace.readCheckpoint();if(!current)throw new Error('publication_checkpoint_missing');
          const review=await workspace.putArtifact({schemaVersion:1,code:error.code,releaseId:config.releaseId,
            requestId:options.requestId,configSha256},{kind:'publication',observedAt:now().toISOString()});
          await workspace.writeCheckpoint(current.sha256,{...current.checkpoint,phase:'attention',owner,
            pins:{...current.checkpoint.pins,publicationUploadReview:review}});
          throw error;
        }
        if(protectedUpload)throw error;
        // An ordinary legacy CLI's unknown result retains read-only reconciliation.
      }
      if(protectedUpload){
        const current=await workspace.readCheckpoint();if(!current)throw new Error('publication_checkpoint_missing');
        if(current.checkpoint.pins.publicationUploadReview)throw new Error('publication_upload_review_required');
        const pending=current.checkpoint.pins.publicationUploadPending;
        if(!pending||pending.sha256!==sha256(canonicalJson(uploadBinding())))throw new Error('publication_upload_review_required');
        const acknowledged=await workspace.putArtifact({...uploadBinding(),pending},{kind:'publication',observedAt:now().toISOString()});
        await workspace.writeCheckpoint(current.sha256,{...current.checkpoint,pins:{...current.checkpoint.pins,publicationUploadAcknowledged:acknowledged}});
      }
    }
    if(control.stage==='uploading'){
      const version=await api.findVersion(control.uploadMarker);if(!version)throw new Error('publication_upload_pending');
      const uploaded=await api.version(version);
      verifyUploadedVersion(uploaded,config,version,control);
      await save({stage:'uploaded',versionReference:version});
    }
    // Detect changed code/package during an upload before granting activation.
    assertBuildSource(config.sourceRoot,config.codeSha);
    await loadPackage(directory,config,control.packageSha256!,now());
    verifyUploadedVersion(await api.version(control.versionReference!),config,control.versionReference!,control);
    await recordPublicationDispatch(db,sealed.snapshot,control.publication!,`version:${control.versionReference}`,now());
    // Persist exact deployment intent BEFORE the D1 CAS and actual POST. A crash
    // after this point is reconciled from the exact claim, never automatically POSTed.
    await save({stage:'activating'});
    const readPrior=async(signal:AbortSignal):Promise<DeploymentObservation>=>{
      signal.throwIfAborted();await workspace.assertHeld();signal.throwIfAborted();
      const deployed=await api.deployed(signal);signal.throwIfAborted();
      if(config.prior===null)throw new Error('publication_bootstrap_required');
      if(deployed?.version!==config.prior.versionReference)throw new Error('publication_prior_changed');
      let prior:PublicationIntent;
      if(config.prior.directory!==null){
        const priorBytes=await fs.readFile(path.join(config.prior.directory,'asset-manifest.json'),{signal});signal.throwIfAborted();
        if(sha256(priorBytes)!==config.prior.manifestSha256)throw new Error('publication_prior_changed');
        prior=intentFrom(JSON.parse(priorBytes.toString()),priorBytes);
      }else{
        // Prior receipts are non-content historical identities, not permission
        // to retain/reuse expired assets. Verify both the D1 journal and the
        // provider's exact active version/identity before granting activation.
        if((await publicationStatus(db,config.prior.releaseId,{signal})).state!=='published')throw new Error('publication_prior_changed');signal.throwIfAborted();
        const row=(await db.prepare('SELECT manifest_json FROM publication_receipts WHERE release_id=?')
          .bind(config.prior.releaseId).all<{manifest_json:string}>({signal})).results[0];signal.throwIfAborted();
        if(!row)throw new Error('publication_prior_changed');
        prior=JSON.parse(row.manifest_json);
        if(encodePublicationIntent(prior)!==row.manifest_json||prior.manifestSha256!==config.prior.manifestSha256)throw new Error('publication_prior_changed');
      }
      if(prior.releaseId!==config.prior.releaseId||!matchesIdentity(await api.identity(signal),prior))throw new Error('publication_prior_changed');signal.throwIfAborted();
      return{environment:config.environment,settled:true,active:identity(prior,config.prior.versionReference)};
    };
    let observation:Promise<DeploymentObservation>|undefined,permit:ActivationPermit;
    try{permit=await beginBuildActivation(db,control.build,sealed.snapshot,control.publication!,control.versionReference!,
      signal=>(observation=readPrior(signal)),now(),owner);}
    finally{if(observation){
      if(isAccountedPublicationFetch(observationSend)&&isCatalogD1Rest(db))await observation.catch(()=>{});
      else await drainDeploymentObservation(observation);}}
    await save({permit},permit.mutationOwner!);
    await workspace.assertHeld(); // Exact owner fence immediately precedes real activation.
    const deploymentId=await api.activate(control.versionReference!,control.deploymentMarker);
    await save({deploymentId});
    // One invocation performs the readback too; recursive entry only reuses the
    // exact durable control/package and has no second activation path.
    return executePublication({...options,owner,dependencies:options.dependencies});
  }catch(error){
    const code=error instanceof Error&&/^publication_[a-z_]+$/.test(error.message)?error.message:'publication_pending';
    return{state:'pending',owner,errorCode:code};
  }
}
