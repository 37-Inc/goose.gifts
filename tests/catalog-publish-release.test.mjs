import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { executePublication, validatePublicationConfig } from '../scripts/catalog/publish-release.ts';
import { createProjectionPacket, importPublicProjection } from '../lib/catalog/d1.ts';
import { enqueueBuildRequest, claimBuildRequest, beginBuildActivation } from '../lib/catalog/build-requests.ts';
import { enqueuePublication, claimPublication, recordPublicationDispatch, completePublication, completeActivatedPublication } from '../lib/catalog/publication.ts';
import { claimMutationOwnership, readMutationOwner } from '../lib/catalog/mutation-fence.ts';
import { prunedVectorPlan } from '../lib/catalog/prune-existing-revision.ts';
import { canonicalJson } from '../scripts/catalog/migration.ts';
import { createReleaseIdentity } from '../scripts/staging/release-identity.mts';
import { siteIdentityBytes } from '../scripts/staging/build.mts';
import { assembleReleaseAssets, readPriorRelease } from '../scripts/staging/retention.mts';
import { createStaticFeedPlan } from '../workers/site/feed.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { readActivatedCatalogVectors } from '../scripts/catalog/owned-vector-delivery.ts';
import { createBrowseRelease } from '../static-site/lib/browse.ts';
import { createOgRelease } from '../static-site/lib/og.ts';
import { siteIdentityFor } from '../static-site/lib/site-identity.ts';
import { guides } from '../static-site/lib/guides.ts';
import { nativeHash } from '../scripts/catalog/vector-outbox.ts';
import { openRunWorkspace } from '../scripts/catalog/run-workspace.ts';
import { createCatalogD1Rest } from '../scripts/catalog/d1-write-rest.ts';
import { accountedPublicationReadFetch } from '../scripts/catalog/publication-read-fetch.ts';
import safeCatalogPayload from '../static-site/public/safe/catalog.json' with {type:'json'};

const AT=Date.parse('2026-10-19T12:00:00.000Z');
const sha=value=>createHash('sha256').update(value).digest('hex');
const bytes=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
const id='00000000-0000-4000-8000-000000000001',version='00000000-0000-4000-8000-000000000002',deployment='00000000-0000-4000-8000-000000000003';
const priorVersion='00000000-0000-4000-8000-000000000004',priorDeployment='00000000-0000-4000-8000-000000000005';
const scope={environment:'staging',indexName:'fixture-index'};
async function put(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value,{mode:0o600});}
function fixtureRelease(snapshot,context,prior=null){
  const pages=['/','/gifts','/gifts/page/1','/random-gift','/gift-guides','/howie','/preview/presentation',...guides.map(g=>`/gift-guides/${g.slug}`),
    ...snapshot.products.map(p=>`/gifts/${p.slug}`)];
  const assets=new Map(pages.map(p=>[p==='/'?'/index.html':`${p}.html`,bytes('Owned fixture HTML')]));
  for(const name of ['/safe/catalog.html','/safe/product.html','/safe/howie.html','/safe/presentation.html','/safe/asset.txt'])assets.set(name,bytes('Owned unavailable'));
  assets.set('/safe/catalog.json',bytes(safeCatalogPayload));
  for(const suffix of ['.txt','/__next._full.txt','/__next._tree.txt','/__next.safe.product.__PAGE__.txt'])assets.set(`/safe/product${suffix}`,bytes('Owned safe RSC'));
  for(const shard of createBrowseRelease(snapshot).shards)assets.set(shard.path,bytes(shard.payload));
  for(const name of createOgRelease(snapshot,siteIdentityFor(context.sourceMode)).byPath.keys())assets.set(name,bytes('owned PNG fixture'));
  const assembled=assembleReleaseAssets(snapshot,assets,context,prior);const rest={...context};delete rest.retainedManifestSha256;
  const manifest={...rest,dataKind:'catalog',siteIdentitySha256:sha(siteIdentityBytes(context.sourceMode)),nextExpiry:snapshot.products[0]?.eligibleUntil??null,
    productCount:snapshot.products.length,slugCount:snapshot.products.length,checksums:Object.fromEntries([...assembled.assets].map(([p,b])=>[p,sha(b)])),
    routes:assembled.routes,retention:assembled.retention};
  const manifestBytes=bytes(`${JSON.stringify(manifest,null,2)}\n`);
  const outputs={'asset-manifest.json':manifestBytes,'catalog.snapshot.json':bytes(`${JSON.stringify(snapshot)}\n`),'release-context.json':bytes(`${JSON.stringify(context)}\n`),
    'release-identity.json':bytes(createReleaseIdentity(manifestBytes)),'site-identity.json':bytes(siteIdentityBytes(context.sourceMode)),
    'feed-plan.json':bytes(createStaticFeedPlan(snapshot,context.catalogSnapshotSha256))};
  const intent={releaseId:manifest.releaseId,codeSha:manifest.codeSha,catalogRevision:manifest.catalogRevision,catalogSnapshotSha256:manifest.catalogSnapshotSha256,
    manifestSha256:sha(manifestBytes),vectorSyncWatermark:manifest.vectorSyncWatermark,priorReleaseId:manifest.priorReleaseId,nextExpiry:manifest.nextExpiry};
  return{...assembled,manifest,manifestBytes,outputs,intent};
}
async function setup(t,{real=false,prior=true,identityOnlyPrior=false,environment='staging',semanticSearch,publicAnalytics,priorExpiryMs=26*3600000}={}){
  const scope={environment,indexName:'fixture-index'},sourceMode=environment==='staging'?'preview':'goose-production';
  let actualWorkspace;
  const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'goose-publish-')));t.after(async()=>{
    await actualWorkspace?.close();await fs.rm(directory,{recursive:true,force:true});});
  const sourceRoot=path.join(directory,'source');await fs.mkdir(sourceRoot);
  const git=(...args)=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
  git('init','-q');await put(path.join(sourceRoot,'.gitignore'),'build/\nstatic-site/out/\n');git('add','.gitignore');
  git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Owned fixture');const codeSha=git('rev-parse','HEAD');
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');
  for(const name of (await fs.readdir(new URL('../migrations/d1/',import.meta.url))).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort())sql.exec(await fs.readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  let clock=AT;sql.function('strftime',(format,instant)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(instant,'now');return new Date(clock).toISOString();});
  let afterBatch;const db={providerIdentity:`cloudflare:${'a'.repeat(32)}:${id}`,prepare(query){let params=[];return{query,bind(...values){params=values;return this;},
    async all(){return{results:sql.prepare(query).all(...params).map(r=>({...r}))};},async run(){const r=sql.prepare(query).run(...params);return{success:true,meta:{changes:r.changes}};},
    execute(){sql.prepare(query).all(...params);}};},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)s.execute();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}afterBatch?.(statements);}};
  const product={id:'B000000001',publicId:id,slug:'owned-clockwork-spoon',title:'Owned clockwork spoon',description:'Controlled owned fixture.',
    imageUrl:'https://example.invalid/owned.svg',affiliateUrl:'https://www.amazon.com/dp/B000000001?tag=fixture-20',source:'amazon',currency:'USD',price:0,
    editorialWriteup:'Controlled owned editorial.',isActive:true,qualityScore:.8,eligibleUntil:new Date(AT+26*3600000).toISOString()};
  const rights=Object.fromEntries(['title','description','imageUrl','affiliateUrl','editorialWriteup'].map(field=>[field,{basis:'owned',reference:'test-only-owned',value:product[field]}]));
  sql.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,availability_status,
    availability_checked_at,source_facts_hash,editorial_source_hash,catalog_revision,eligible_until,public_display_json,rights_json,source_record_json,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(product.id,id,product.slug,product.source,product.title,product.currency,.8,1,'generated_ready','IN_STOCK',
      new Date(AT).toISOString(),'f'.repeat(64),'f'.repeat(64),'fixture-revision',product.eligibleUntil,JSON.stringify(product),JSON.stringify(rights),'{}',new Date(AT).toISOString());
  const snapshot={schemaVersion:1,dataKind:'catalog',catalogRevision:'fixture-revision',generatedAt:new Date(AT).toISOString(),products:[product],heldProducts:[],slugHistory:[]};
  let priorConfig=null,priorRelease;
  if(prior){
    const priorSnapshot={...snapshot,catalogRevision:'fixture-prior',products:snapshot.products.map(p=>({...p,eligibleUntil:new Date(AT+priorExpiryMs).toISOString()}))};
    sql.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)').run(priorSnapshot.catalogRevision,snapshot.generatedAt,'c'.repeat(64),'reconciled');
    const priorPacket=await createProjectionPacket(priorSnapshot,{[id]:'f'.repeat(64)},'c'.repeat(64),new Date(AT));await importPublicProjection(db,priorPacket);
    priorRelease=fixtureRelease(priorSnapshot,{schemaVersion:1,sourceMode,releaseId:'fixture-prior-release',codeSha,catalogRevision:priorSnapshot.catalogRevision,
      catalogSnapshotSha256:priorPacket.receipt.snapshot_sha256,generatedAt:snapshot.generatedAt,vectorSyncWatermark:0,priorReleaseId:null,retainedManifestSha256:null});
    const priorDirectory=path.join(directory,'prior');
    for(const [name,b]of Object.entries(priorRelease.outputs))await put(path.join(priorDirectory,name),b);
    for(const [name,b]of priorRelease.assets)await put(path.join(priorDirectory,'assets',name.slice(1)),b);
    await enqueuePublication(db,priorSnapshot,priorRelease.intent,new Date(AT));const claim=await claimPublication(db,priorSnapshot,priorRelease.intent.releaseId,new Date(AT));
    await recordPublicationDispatch(db,priorSnapshot,claim,`version:${priorVersion}`,new Date(AT));
    await completePublication(db,priorSnapshot,priorRelease.intent.releaseId,claim.token,async()=>priorRelease.intent,()=>new Date(AT));
    priorConfig={directory:identityOnlyPrior?null:priorDirectory,manifestSha256:sha(priorRelease.manifestBytes),releaseId:priorRelease.intent.releaseId,versionReference:priorVersion};
  }
  sql.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)').run(snapshot.catalogRevision,snapshot.generatedAt,'b'.repeat(64),'reconciled');
  const packet=await createProjectionPacket(snapshot,{[id]:'f'.repeat(64)},'b'.repeat(64),new Date(AT));await importPublicProjection(db,packet);
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const owner=await claimMutationOwnership(db,scope,{phase:'freezing',ownerReference:'fixture-run',operationKey:'d'.repeat(64)});
  const current={...sql.prepare('SELECT * FROM products WHERE public_id=?').get(id)};
  const sourceRow={...current,approved_product_json:canonicalJson(current),...Object.fromEntries(['id','public_id','source','availability_checked_at','last_verified_at']
    .map(key=>[`archived_${key}`,JSON.parse(current.source_record_json)[key]??null]))};
  const revision={request:{previous:snapshot,scope},snapshot,packet,sourceRows:[sourceRow],
    sourceDigest:'b'.repeat(64),operationKey:owner.operationKey,vectorSyncWatermark:0,globalVectorWatermark:0};const plan=prunedVectorPlan(revision);
  const vector={id,values:Array(1536).fill(Math.fround(.1)),metadata:{catalogRevision:snapshot.catalogRevision,sourceFactsHash:'f'.repeat(64)}};vector.values[0]=-0;
  vector.metadata.vectorBytesSha256=nativeHash(vector.values);
  sql.prepare(`INSERT INTO catalog_vector_deliveries(delivery_id,environment,index_name,generation,prior_epoch,owner_json,request_json,product_json,
    status,disposition,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('a'.repeat(64),scope.environment,scope.indexName,owner.generation,0,JSON.stringify(owner),
      canonicalJson({kind:'prune',publicId:id,catalogRevision:snapshot.catalogRevision,projectionReceipt:packet.receipt,planSha256:sha(canonicalJson(plan)),providerIdentity:`cloudflare:${'a'.repeat(32)}:${scope.indexName}`,
        vector:{id,metadata:vector.metadata,nativeBase64:encodePgvectorSendBase64(vector.values)}}),'{}','complete','verified',snapshot.generatedAt);
  const request={schemaVersion:1,environment,sourceRevision:snapshot.catalogRevision,sourceDigest:packet.receipt.snapshot_sha256,codeSha,priorReleaseId:priorConfig?.releaseId??null,
    capturedAt:snapshot.generatedAt,cutoff:new Date(AT+25*3600000).toISOString()};let {requestId}=await enqueueBuildRequest(db,request);
  const config={schemaVersion:1,environment,accountId:'a'.repeat(32),workerName:'fixture-worker',database:{id,name:'fixture-db'},indexName:scope.indexName,codeSha,
    sourceMode,sourceRoot,releaseId:'fixture-release',identityOrigin:environment==='staging'?'https://fixture-worker.example.invalid':siteIdentityFor(sourceMode).origin,
    compatibilityDate:'2026-10-19',prior:priorConfig,...(semanticSearch===undefined?{}:{semanticSearch}),...(publicAnalytics===undefined?{}:{publicAnalytics})};
  let checkpoint={sha256:'0'.repeat(64),phase:'freezing',owner,state:{driverState:'preserved'},pins:{phase:'b'.repeat(64)},phaseComplete:null,control:{}};
  let workspace={directory:path.join(directory,'workspace'),repository:await fs.realpath(sourceRoot),manifest:{codeSha},async assertHeld(){
    if(checkpoint.control.publication?.stage==='published'&&mode.resolveDelayMs){const ms=mode.resolveDelayMs;delete mode.resolveDelayMs;await new Promise(resolve=>setTimeout(resolve,ms));}
  },assertScope(s){assert.deepEqual(s,{accountId:config.accountId,environment,databaseId:id,
    databaseName:'fixture-db',workerName:'fixture-worker',indexName:scope.indexName});},async readCheckpoint(options){const copy=structuredClone(checkpoint);if(options?.controlOnly)delete copy.state;
      const {sha256,...value}=copy;return{sha256,checkpoint:value};},
    async writeCheckpoint(expected,value){assert.equal(expected,checkpoint.sha256);checkpoint={...structuredClone(value),sha256:sha(canonicalJson(value))};},
    async writeControlCheckpoint(expected,value){assert.equal(expected,checkpoint.sha256);checkpoint={...checkpoint,...structuredClone(value)};checkpoint.sha256=sha(canonicalJson(checkpoint));},
    async putArtifact(value){return{sha256:sha(canonicalJson(value)),reference:'publication/fixture'};},
    async preparePublicationDirectories(){},async cleanPublicationBuild(){}};
  let workspaceOptions;
  const wrapActual=()=>({...actualWorkspace,async writeCheckpoint(expected,value){const result=await actualWorkspace.writeCheckpoint(expected,value);checkpoint={...result.checkpoint,sha256:result.sha256};return result;},
    async writeControlCheckpoint(expected,value){const result=await actualWorkspace.writeControlCheckpoint(expected,value);checkpoint={...checkpoint,...result.checkpoint,sha256:result.sha256};return result;}});
  if(real){
    workspaceOptions={directory:path.join(directory,'protected'),repository:sourceRoot,mode:'create',runId:'fixture-run',configSha256:'f'.repeat(64),codeSha,
      scope:{...scope,accountId:config.accountId,databaseId:id,databaseName:'fixture-db',workerName:'fixture-worker'},
      retention:{reviewReference:'test-only/retention',rules:Object.fromEntries(['amazon-observation','embedding-response','phase','publication','checkpoint']
        .map(kind=>[kind,{maxAgeMs:5*60000,notAfter:new Date(AT+48*3600000).toISOString()}]))},
      budgetCaps:{httpRequests:100,sqlStatements:200},now:()=>new Date(clock).toISOString()};
    actualWorkspace=await openRunWorkspace(workspaceOptions);
    const initial={...checkpoint};delete initial.sha256;
    const created=await actualWorkspace.writeCheckpoint(null,{...initial,pins:{}});checkpoint={...created.checkpoint,sha256:created.sha256};
    workspace=wrapActual();
  }
  let uploaded=false,active=false;let uploadCalls=0,activateCalls=0,buildCalls=0,identityCalls=0,versionReads=0,httpCalls=0;let mode={};let manifest;
  let targetVersion=version,activePriorVersion=priorVersion;const uploadedConfigs=[],commandEnvironments=[];
  const command=async command=>{
    commandEnvironments.push({args:[...command.args],env:{...command.env}});
    if(command.args.includes('scripts/staging/build.mts')){
      buildCalls++;const context=JSON.parse(await fs.readFile(command.env.CATALOG_RELEASE_CONTEXT_PATH));
      const assembled=fixtureRelease(snapshot,context,await readPriorRelease(context,command.env.CATALOG_PRIOR_RELEASE_PATH));manifest=assembled.manifest;
      for(const [name,b]of Object.entries(assembled.outputs))await put(path.join(sourceRoot,'build/stupid-gifts',name),b);
      for(const [name,b]of assembled.assets)await put(path.join(sourceRoot,'static-site/out',name.slice(1)),b);
      if(mode.sourceDrift)await put(path.join(sourceRoot,'.gitignore'),'changed');
      if(mode.buildLost){delete mode.buildLost;throw new Error('PRIVATE build interrupted after output');}
    }else if(command.args.includes('upload')){
      uploadCalls++;const cfg=JSON.parse(await fs.readFile(command.args[command.args.indexOf('--config')+1]));assert.equal(cfg.name,config.workerName);
      const runtime=path.join(workspace.directory,'publication-runtime',config.releaseId);
      assert.equal(command.args[command.args.indexOf('--outdir')+1],path.join(runtime,'bundle'));
      assert.equal(command.env.TMPDIR,path.join(runtime,'tmp'));assert.equal(command.env.WRANGLER_LOG_PATH,path.join(runtime,'logs'));
      uploadedConfigs.push(cfg);assert.equal(command.env.NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED,'false');
      assert.equal(command.env.NEXT_PUBLIC_POSTHOG_KEY,undefined);assert.equal(command.env.NEXT_PUBLIC_POSTHOG_HOST,undefined);
      assert.equal(cfg.routes,undefined);assert.equal(cfg.triggers,undefined);uploaded=true;
      if(mode.uploadLost)throw new Error('PRIVATE upload secret');
    }
  };
  const response=result=>Response.json({success:true,result});
  const fetch=async(url,init={})=>{
    httpCalls++;const u=new URL(url);if(u.origin===config.identityOrigin){identityCalls++;if(mode.identityFailure&&active)return new Response('',{status:401});
      assert.equal(init.headers.Authorization,'Basic PRIVATE');return Response.json(createReleaseIdentity(active?bytes(`${JSON.stringify(manifest,null,2)}\n`):priorRelease.manifestBytes));}
    if(u.pathname.endsWith(`/d1/database/${id}`))return response({uuid:id,name:'fixture-db',read_replication:{mode:'disabled'}});
    if(u.pathname.endsWith(`/indexes/${scope.indexName}`))return response({name:scope.indexName,config:{dimensions:1536,metric:'cosine'}});
    const c=checkpoint.control.publication;
    if(u.pathname.endsWith('/versions'))return response({items:uploaded&&!mode.versionInvisible?[{id:targetVersion}]:[]});
    if(u.pathname.endsWith(`/versions/${targetVersion}`)){if(++versionReads===3&&mode.stopBeforeActivation)throw new Error('PRIVATE preactivation read interrupted');
      return response({id:targetVersion,annotations:{'workers/tag':c.uploadMarker,'workers/message':`package:${c.packageSha256}`},
      resources:{script_runtime:{compatibility_date:'2026-10-19'},bindings:[{name:'DB',type:'d1',id:mode.wrongVersionDatabase?'wrong':id},
        {name:'VECTORIZE',type:'vectorize',index_name:scope.indexName},{name:'ASSETS',type:'assets'},
        {name:'ENVIRONMENT',type:'plain_text',text:environment},
        ...Object.entries(uploadedConfigs.at(-1)?.vars??{}).filter(([name])=>name.startsWith('SEMANTIC_SEARCH_')&&name!==mode.missingSearchBinding)
          .map(([name,text])=>({name,type:'plain_text',text:mode.searchBinding?.name===name?mode.searchBinding.text:text})),
        ...(!mode.missingGuard?[{name:'STAGING_AUTH_SECRET',type:'secret_text'}]:[])]}});}
    if(u.pathname.endsWith('/get_by_ids')){if(mode.vectorAbortCleanup){return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>setTimeout(()=>{
      mode.vectorCleaned=true;reject(new Error('PRIVATE accounted abort cleanup'));},40),{once:true}));}
      if(mode.vectorFailure)return response([]);const expected=structuredClone(vector);
      // Preserve signed-zero native bytes across the mock REST boundary.
      return new Response(`{"success":true,"result":[{"id":"${id}","values":[${expected.values.map(n=>Object.is(n,-0)?'-0':n).join(',')}],"metadata":${JSON.stringify(expected.metadata)}}]}`,{headers:{'Content-Type':'application/json'}});}
    if(u.pathname.endsWith('/deployments')){
      if(init.method==='POST'){activateCalls++;assert.equal(checkpoint.control.publication.permit.mutationOwner.phase,'activating');
        assert.equal(sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'activating');
        assert.deepEqual(JSON.parse(init.body),{strategy:'percentage',versions:[{version_id:targetVersion,percentage:100}],annotations:{'workers/message':c.deploymentMarker}});
        if(mode.activationNotSent)throw new Error('PRIVATE uncertain not submitted');active=true;
        if(mode.activationLost)throw new Error('PRIVATE activation secret');return response({id:deployment});}
      if(mode.readbackFailure&&active)throw new Error('PRIVATE readback secret');
      return response({deployments:active?[{id:deployment,versions:[{version_id:targetVersion,percentage:100}],annotations:{'workers/message':c.deploymentMarker}}]:
        prior?[{id:priorDeployment,versions:[{version_id:activePriorVersion,percentage:100}],annotations:{'workers/message':'owned fixture prior'}}]:[]});
    }throw new Error(`Unexpected fixture HTTP ${url}`);
  };
  const execute=(database=db,dependencies={})=>executePublication({db:database,owner:checkpoint.owner,revision:mode.noRevision?null:revision,requestId,runReference:'fixture-run',workspace,config,
    credentials:{cloudflareToken:'PRIVATE_TOKEN',identityAuthorization:'Basic PRIVATE'},dependencies:{fetch,command,now:()=>new Date(clock),...dependencies}});
  return{db,sql,owner,revision,fetch,get workspace(){return workspace;},config,execute,mode,uploadedConfigs,commandEnvironments,checkpoint:()=>checkpoint,advance(ms){clock+=ms;},after(fn){afterBatch=fn;},
    async nextRelease(){
      assert.equal((await readMutationOwner(db,scope)),null);
      const packageDirectory=path.join(workspace.directory,'packages',config.releaseId);
      priorRelease={manifestBytes:await fs.readFile(path.join(packageDirectory,'asset-manifest.json'))};
      config.prior={directory:packageDirectory,manifestSha256:sha(priorRelease.manifestBytes),releaseId:config.releaseId,versionReference:targetVersion};
      activePriorVersion=targetVersion;targetVersion='00000000-0000-4000-8000-000000000006';config.releaseId='fixture-next-release';
      ({requestId}=await enqueueBuildRequest(db,{...request,priorReleaseId:config.prior.releaseId}));
      const nextOwner=await claimMutationOwnership(db,scope,{phase:'freezing',ownerReference:'fixture-next-run',operationKey:'e'.repeat(64)});
      const original=sql.prepare('SELECT * FROM catalog_vector_deliveries').get();
      const delivery={...original,delivery_id:'b'.repeat(64),generation:nextOwner.generation,owner_json:JSON.stringify(nextOwner)};
      const columns=Object.keys(delivery);sql.prepare(`INSERT INTO catalog_vector_deliveries(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`)
        .run(...columns.map(name=>delivery[name]));
      checkpoint={...checkpoint,sha256:'0'.repeat(64),phase:'freezing',owner:nextOwner,state:{driverState:'preserved'},control:{}};
      if(real){
        await actualWorkspace.close();workspaceOptions={...workspaceOptions,runId:'fixture-next-run'};
        actualWorkspace=await openRunWorkspace(workspaceOptions);
        const {sha256:unused,...initial}=checkpoint;void unused;
        const saved=await actualWorkspace.writeCheckpoint(null,{...initial,pins:{}});checkpoint={...saved.checkpoint,sha256:saved.sha256};
        workspace=wrapActual();
      }
      uploaded=false;active=false;versionReads=0;
    },
    async historicalAccepted({lostPermit=false}={}){
      // A pre-guard first deployment, established through the real publication
      // and activation transactions. No new executor work is used to seed it.
      assert.equal(config.prior,null);
      const build=await claimBuildRequest(db,requestId,'fixture-run',new Date(AT));
      const release=fixtureRelease(snapshot,{schemaVersion:1,sourceMode:'preview',releaseId:config.releaseId,codeSha,catalogRevision:snapshot.catalogRevision,
        catalogSnapshotSha256:packet.receipt.snapshot_sha256,generatedAt:snapshot.generatedAt,vectorSyncWatermark:0,priorReleaseId:null,retainedManifestSha256:null});
      manifest=release.manifest;await enqueuePublication(db,snapshot,release.intent,new Date(AT));
      const publication=await claimPublication(db,snapshot,config.releaseId,new Date(AT));
      await recordPublicationDispatch(db,snapshot,publication,`version:${version}`,new Date(AT));
      const permit=await beginBuildActivation(db,build,snapshot,publication,version,async()=>({environment:'staging',settled:true,active:null}),new Date(AT),owner);
      const c={schemaVersion:1,configSha256:sha(canonicalJson(config)),requestId,runReference:'fixture-run',stage:'activating',build,publication,intent:release.intent,
        permit:lostPermit?null:permit,vectorPlan:{catalogRevision:plan.catalogRevision,planSha256:sha(canonicalJson(plan)),ids:[id]},packageSha256:'e'.repeat(64),
        uploadMarker:'historical-upload',versionReference:version,deploymentMarker:'historical-deployment',deploymentId:null};
      checkpoint={...checkpoint,owner:lostPermit?owner:permit.mutationOwner,control:{publication:c},state:{...checkpoint.state,publication:c}};
      active=true;
      await completePublication(db,snapshot,config.releaseId,publication.token,async()=>release.intent,()=>new Date(AT),permit.mutationOwner);
    },
    async reopen(){const expectedManifestSha256=actualWorkspace.manifestSha256;await actualWorkspace.close();
      actualWorkspace=await openRunWorkspace({...workspaceOptions,mode:'resume',expectedManifestSha256});workspace=wrapActual();
      const saved=await actualWorkspace.readCheckpoint();checkpoint={...saved.checkpoint,sha256:saved.sha256};},
    counts:()=>({uploadCalls,activateCalls,buildCalls,identityCalls,httpCalls}),vector};
}

test('actual build/upload/activate/identity/native-proof/receipt/idle composition with preserved driver state',async t=>{
  const f=await setup(t);const result=await f.execute();assert.equal(result.state,'published',JSON.stringify(result));
  assert.equal(result.owner,null);assert.equal(f.counts().activateCalls,1);assert.equal(f.counts().buildCalls,1);
  assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests').get().state,'resolved');assert.equal(await readMutationOwner(f.db,scope),null);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,1);
  assert.equal(f.checkpoint().state.driverState,'preserved');assert.doesNotMatch(JSON.stringify(f.checkpoint()),/PRIVATE|example.invalid|clockwork spoon/);
  assert.equal((await f.execute()).state,'published');assert.equal(f.counts().activateCalls,1);
});

test('identity-only prior permits a fresh publication after a missed day/purged prior, without old asset reuse',async t=>{
  const f=await setup(t,{priorExpiryMs:5*60000});
  const priorDirectory=f.config.prior.directory;await fs.rm(priorDirectory,{recursive:true});
  f.config.prior.directory=null;f.advance(6*60000);
  const result=await f.execute();assert.equal(result.state,'published',JSON.stringify(result));
  assert.equal(f.counts().activateCalls,1);assert.equal(f.counts().buildCalls,1);
  const context=JSON.parse(await fs.readFile(path.join(f.workspace.directory,'packages',f.config.releaseId,'release-context.json')));
  assert.equal(context.priorReleaseId,f.config.prior.releaseId);assert.equal(context.retainedManifestSha256,null);
  const manifest=JSON.parse(await fs.readFile(path.join(f.workspace.directory,'packages',f.config.releaseId,'asset-manifest.json')));
  assert.equal(manifest.retention,null);await assert.rejects(fs.lstat(priorDirectory),{code:'ENOENT'});
});

test('identity-only prior cannot bypass exact stored manifest identity or historical published receipt',async t=>{
  for(const changed of ['manifest','receipt'])await t.test(changed,async sub=>{
    const f=await setup(sub);await fs.rm(f.config.prior.directory,{recursive:true});f.config.prior.directory=null;
    if(changed==='manifest')f.config.prior.manifestSha256='e'.repeat(64);
    else f.sql.prepare('DELETE FROM publication_receipts WHERE release_id=?').run(f.config.prior.releaseId);
    const result=await f.execute();assert.equal(result.state,'pending');assert.equal(f.counts().activateCalls,0);
    if(changed==='receipt')assert.equal(result.errorCode,'publication_build_not_claimed');
    else assert.match(result.errorCode,/^publication_(prior_changed|pending)$/); // activation adapter sanitizes failed prior observations
  });
});

test('optional prior asset reuse cannot renew an expired prior merchant package',async t=>{
  const f=await setup(t,{real:true,priorExpiryMs:60000});f.advance(2*60000);
  const result=await f.execute();assert.equal(result.state,'pending');
  assert.equal(f.counts().buildCalls,0);assert.equal(f.counts().uploadCalls,0);assert.equal(f.counts().activateCalls,0);
  await assert.rejects(fs.lstat(path.join(f.workspace.directory,'packages',f.config.releaseId)),{code:'ENOENT'});
});
test('missing prior is an explicit bootstrap gate before claims, checkpoints, files or HTTP',async t=>{
  const f=await setup(t,{prior:false});const checkpoint=structuredClone(f.checkpoint());
  const build=f.sql.prepare('SELECT * FROM catalog_build_requests').get();const fence=f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get();
  assert.equal((await f.execute()).errorCode,'publication_bootstrap_required');
  assert.deepEqual(f.checkpoint(),checkpoint);assert.deepEqual(f.sql.prepare('SELECT * FROM catalog_build_requests').get(),build);
  assert.deepEqual(f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get(),fence);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_outbox').get().n,0);
  assert.deepEqual(f.counts(),{uploadCalls:0,activateCalls:0,buildCalls:0,identityCalls:0,httpCalls:0});
  await assert.rejects(fs.stat(f.workspace.directory),{code:'ENOENT'});
});
test('historical null-prior accepted activation settles without new build, upload or activation, including lost permit',async t=>{
  for(const lostPermit of [false,true]){
    const f=await setup(t,{prior:false});await f.historicalAccepted({lostPermit});f.advance(2*86400000);f.mode.noRevision=true;
    const result=await f.execute();assert.equal(result.state,'published',JSON.stringify(result));assert.equal(await readMutationOwner(f.db,scope),null);
    assert.equal(f.counts().buildCalls,0);assert.equal(f.counts().uploadCalls,0);assert.equal(f.counts().activateCalls,0);
    assert.equal((await f.execute()).state,'published');
  }
});
test('a local historical activation marker cannot bypass the no-prior gate while D1 is still building',async t=>{
  const f=await setup(t,{prior:false});await f.historicalAccepted();
  f.sql.prepare("UPDATE catalog_build_requests SET state='building',lease_until=?").run(new Date(AT+600000).toISOString());const checkpoint=structuredClone(f.checkpoint());
  assert.equal((await f.execute()).errorCode,'publication_bootstrap_required');assert.deepEqual(f.checkpoint(),checkpoint);
  assert.deepEqual(f.counts(),{uploadCalls:0,activateCalls:0,buildCalls:0,identityCalls:0,httpCalls:0});
});
test('lost upload and committed activation responses resume exact versions without another external mutation',async t=>{
  const f=await setup(t);f.mode.uploadLost=true;f.mode.activationLost=true;
  const first=await f.execute();assert.equal(first.state,'pending');assert.equal(first.owner.phase,'activating');assert.doesNotMatch(JSON.stringify(first),/PRIVATE/);
  assert.equal((await f.execute()).state,'published');assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().activateCalls,1);assert.equal(f.counts().buildCalls,1);
});
test('unconfirmed immutable upload is read-only reconciled, never rebuilt or re-uploaded',async t=>{
  const f=await setup(t);f.mode.uploadLost=true;f.mode.versionInvisible=true;
  assert.equal((await f.execute()).errorCode,'publication_upload_pending');assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().activateCalls,0);
  delete f.mode.versionInvisible;assert.equal((await f.execute()).state,'published');assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().buildCalls,1);
});
test('prior-only after unknown activation remains fenced indefinitely and is never resent',async t=>{
  const f=await setup(t);f.mode.activationNotSent=true;assert.equal((await f.execute()).state,'pending');
  f.advance(2*86400000);f.mode.noRevision=true;const second=await f.execute();assert.equal(second.state,'pending');assert.equal(second.owner.phase,'activating');
  assert.equal(f.counts().activateCalls,1);assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests').get().state,'activating');
});
test('readback/auth/native mismatch cannot publish; exact readback recovery does not re-activate',async t=>{
  for(const key of ['readbackFailure','identityFailure','vectorFailure']){
    const f=await setup(t);f.mode[key]=true;assert.equal((await f.execute()).state,'pending',key);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);assert.equal(f.counts().activateCalls,1);
    delete f.mode[key];assert.equal((await f.execute()).state,'published',key);assert.equal(f.counts().activateCalls,1);
  }
});
test('expired original build/publication leases settle an independently active fresh package exactly once without renewing or redeploying',async t=>{
  const f=await setup(t);f.mode.activationLost=true;assert.equal((await f.execute()).state,'pending');f.advance(16*60000);
  const c=f.checkpoint().control.publication;assert.ok(c.build.leaseUntil<new Date(AT+16*60000).toISOString());
  assert.ok(c.publication.leaseUntil<new Date(AT+16*60000).toISOString());
  await assert.rejects(completePublication(f.db,f.revision.snapshot,f.config.releaseId,c.publication.token,async()=>c.intent,
    ()=>new Date(AT+16*60000),c.permit.mutationOwner),/publication_fenced/); // Ordinary completion keeps its original lease rule.
  f.mode.noRevision=true;assert.equal((await f.execute()).errorCode,'publication_fresh_evidence_required');delete f.mode.noRevision;
  const result=await f.execute();assert.equal(result.state,'published',JSON.stringify(result));
  assert.equal(await readMutationOwner(f.db,scope),null);assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests').get().state,'resolved');
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,1);
  assert.equal(f.sql.prepare("SELECT attempts FROM publication_outbox WHERE release_id='fixture-release'").get().attempts,1);
  assert.equal(f.checkpoint().control.publication.publication.leaseUntil,c.publication.leaseUntil);
  assert.equal((await f.execute()).state,'published');assert.equal(f.counts().activateCalls,1);assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().buildCalls,1);
});
test('ten full source rows settle through actual bounded D1 REST plus existing executor/native/identity/idle checks under150HTTP300SQL',async t=>{
  const f=await setup(t);f.mode.activationLost=true;await f.execute();f.advance(16*60000);
  const original={...f.sql.prepare('SELECT * FROM products WHERE public_id=?').get(id)};
  // Nine unchanged held baseline rows are private CAS inputs, never promoted.
  for(let i=2;i<=10;i++){
    const row={...original,id:`B${String(i).padStart(9,'0')}`,public_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,
      slug:`held-baseline-${i}`,is_active:0,public_display_json:null,source_record_json:JSON.stringify({fixtureOnly:'x'.repeat(4000)})};
    const columns=Object.keys(row);f.sql.prepare(`INSERT INTO products(${columns.join(',')}) VALUES(${columns.map(()=>'?')})`).run(...columns.map(key=>row[key]));
    f.revision.sourceRows.push({...row,approved_product_json:canonicalJson(row),...Object.fromEntries(['id','public_id','source','availability_checked_at','last_verified_at']
      .map(key=>[`archived_${key}`,JSON.parse(row.source_record_json)[key]??null]))});
  }
  const heldBefore=f.sql.prepare('SELECT * FROM products WHERE is_active=0 ORDER BY id').all(),before=f.counts();
  let maxRequest=0,maxResponse=0,maxParameters=0,maxStatements=0;
  const base=`https://api.cloudflare.com/client/v4/accounts/${f.config.accountId}/d1/database/${f.config.database.id}`;
  const transport=async(url,init)=>{
    assert.ok(url===base||url===`${base}/query`);let result;
    if(url===base)result={uuid:f.config.database.id,name:f.config.database.name,read_replication:{mode:'disabled'}};
    else{
      maxRequest=Math.max(maxRequest,Buffer.byteLength(init.body));const {batch}=JSON.parse(init.body);maxStatements=Math.max(maxStatements,batch.length);
      assert.ok(batch.length<=50);result=[];f.sql.exec('BEGIN');
      try{for(const query of batch){maxParameters=Math.max(maxParameters,query.params.length);assert.ok(query.params.length<=100);
        const written=f.sql.prepare('SELECT total_changes() n').get().n;
        const rows=f.sql.prepare(query.sql).all(...query.params).map(row=>({...row})),changes=f.sql.prepare('SELECT total_changes() n').get().n-written;
        result.push({success:true,results:rows,meta:{served_by_primary:true,rows_read:rows.length,rows_written:changes,changes}});
      }f.sql.exec('COMMIT');}catch(error){f.sql.exec('ROLLBACK');throw error;}
    }
    const response=JSON.stringify({success:true,result});maxResponse=Math.max(maxResponse,Buffer.byteLength(response));return new Response(response);
  };
  const db=await createCatalogD1Rest({accountId:f.config.accountId,databaseId:f.config.database.id,databaseName:f.config.database.name,
    token:'FIXTURE_ONLY',fetch:transport,limits:{requests:150,statements:300}});
  const result=await f.execute(db);assert.equal(result.state,'published',JSON.stringify(result));assert.equal(await readMutationOwner(db,scope),null);
  assert.equal((await f.execute(db)).state,'published');
  const metrics=db.metrics(),http=metrics.requests+f.counts().httpCalls-before.httpCalls;
  assert.ok(http<=150);assert.ok(metrics.statements<=300);assert.equal(metrics.unconfirmedRequests,0);
  assert.ok(maxRequest<=512*1024);assert.ok(maxResponse<=512*1024);
  assert.equal(f.counts().activateCalls,before.activateCalls);assert.equal(f.counts().uploadCalls,before.uploadCalls);
  assert.deepEqual(f.sql.prepare('SELECT * FROM products WHERE is_active=0 ORDER BY id').all(),heldBefore);
  t.diagnostic(JSON.stringify({http,sql:metrics.statements,maxRequest,maxResponse,maxParameters,maxStatements,unknown:metrics.unconfirmedRequests}));
});
test('expired content and source/rights drift never grant new publication',async t=>{
  const expired=await setup(t);expired.mode.activationLost=true;await expired.execute();expired.advance(27*3600000);
  assert.equal((await expired.execute()).state,'pending');assert.equal(expired.counts().activateCalls,1);
  assert.equal(expired.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);
  const changed=await setup(t);changed.mode.sourceDrift=true;assert.equal((await changed.execute()).state,'pending');assert.equal(changed.counts().activateCalls,0);
  const held=await setup(t);held.mode.activationLost=true;await held.execute();held.sql.prepare("UPDATE products SET rights_json='{}'").run();
  assert.equal((await held.execute()).state,'pending');assert.equal(held.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);
});
test('original-permit completion refuses every owner/build/publication identity substitution before independent readback',async t=>{
  const f=await setup(t);f.mode.activationLost=true;await f.execute();f.advance(16*60000);const c=f.checkpoint().control.publication;
  let calls=0;const read=async()=>{calls++;return c.intent;},now=()=>new Date(AT+16*60000);
  for(const patch of [{requestId:'0'.repeat(64)},{token:'foreign'},{runReference:'foreign'},{releaseId:'foreign'},{versionReference:priorVersion},
    ...[{token:'foreign'},{generation:c.permit.mutationOwner.generation+1},{epoch:c.permit.mutationOwner.epoch+1},{phase:'freezing'},
      {ownerReference:'foreign'},{operationKey:'e'.repeat(64)},{environment:'production'},{indexName:'foreign'},{capturedAt:new Date(AT+1000).toISOString()}]
      .map(patch=>({mutationOwner:{...c.permit.mutationOwner,...patch}}))])
    await assert.rejects(completeActivatedPublication(f.db,f.revision,c.publication,{...c.permit,...patch},read,now));
  for(const patch of [{token:'foreign'},{intentId:'0'.repeat(64)},{leaseUntil:new Date(AT+17*60000).toISOString()},
    {intent:{...c.intent,manifestSha256:'e'.repeat(64)}}])
    await assert.rejects(completeActivatedPublication(f.db,f.revision,{...c.publication,...patch},c.permit,read,now));
  assert.equal(calls,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);
  await assert.rejects(completeActivatedPublication(f.db,f.revision,c.publication,c.permit,async()=>{throw new Error('PRIVATE');},now),/publication_readback_failed/);
  await assert.rejects(completeActivatedPublication(f.db,f.revision,c.publication,c.permit,async()=>({...c.intent,manifestSha256:'e'.repeat(64)}),now),/publication_readback_mismatch/);
});
test('late owner/build/outbox/current/projection/global-vector/server-time drift atomically refuses original-permit settlement',async t=>{
  const mutations=[
    f=>f.sql.exec("UPDATE catalog_mutation_scopes SET owner_token='foreign'"),
    f=>f.sql.exec('UPDATE catalog_mutation_scopes SET generation=generation+1'),
    f=>f.sql.exec('UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1'),
    f=>f.sql.exec('UPDATE catalog_mutation_scopes SET external_pending=0'),
    f=>f.sql.exec(`INSERT INTO catalog_build_requests(request_id,environment,source_revision,request_json)
      SELECT '${'0'.repeat(64)}',environment,source_revision,request_json FROM catalog_build_requests WHERE state='activating';
      UPDATE catalog_mutation_scopes SET activation_request_id='${'0'.repeat(64)}'`),
    f=>f.sql.exec("UPDATE catalog_build_requests SET lease_token='foreign'"),
    // Deliberately bypass the fixture CHECK to exercise the settlement CAS,
    // rather than merely testing SQLite's activating lease=NULL constraint.
    f=>f.sql.exec("PRAGMA ignore_check_constraints=ON; UPDATE catalog_build_requests SET lease_until='2026-10-19T12:01:00.000Z'"),
    f=>f.sql.exec("UPDATE catalog_build_requests SET run_reference='foreign'"),
    f=>f.sql.exec(`UPDATE catalog_build_requests SET version_reference='${priorVersion}'`),
    f=>f.sql.exec("UPDATE catalog_build_requests SET state='resolved'"),
    f=>f.sql.exec("UPDATE publication_outbox SET lease_token='foreign' WHERE release_id='fixture-release'"),
    f=>f.sql.exec("UPDATE publication_outbox SET lease_until='2026-10-19T12:01:00.000Z' WHERE release_id='fixture-release'"),
    f=>f.sql.exec("UPDATE publication_outbox SET dispatch_reference='version:foreign' WHERE release_id='fixture-release'"),
    f=>f.sql.exec("DROP TRIGGER publication_intent_immutable; UPDATE publication_outbox SET intent_json=json_set(intent_json,'$.manifestSha256','foreign') WHERE release_id='fixture-release'"),
    f=>f.sql.exec("UPDATE products SET title='unpublished typed field drift'"),
    f=>f.sql.exec("UPDATE products SET rights_json='{}'"),
    f=>f.sql.exec("DELETE FROM catalog_public_products WHERE catalog_revision='fixture-revision'"),
    f=>f.sql.exec("DROP TRIGGER catalog_public_immutable; UPDATE catalog_public_products SET title='foreign indexed title' WHERE catalog_revision='fixture-revision'"),
    f=>f.sql.exec(`DROP TRIGGER catalog_projection_receipt_immutable; UPDATE catalog_projection_receipts SET projection_sha256='${'e'.repeat(64)}' WHERE catalog_revision='fixture-revision'`),
    ...['pending','complete'].map(status=>f=>f.sql.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,status,created_at)
      VALUES(?,?,?,?,?,?)`).run(id,'fixture-prior','f'.repeat(64),'upsert',status,new Date(AT).toISOString())),
    f=>f.advance(27*3600000),
  ];
  for(const [index,mutate]of mutations.entries())await t.test(String(index),async sub=>{
    const f=await setup(sub);f.mode.activationLost=true;await f.execute();f.advance(16*60000);const c=f.checkpoint().control.publication;
    await assert.rejects(completeActivatedPublication(f.db,f.revision,c.publication,c.permit,async()=>{mutate(f);return c.intent;},()=>new Date(AT+16*60000)));
    assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);
    assert.equal(f.sql.prepare("SELECT status FROM catalog_revisions WHERE revision='fixture-revision'").get().status,'reconciled');
    assert.equal(f.counts().activateCalls,1);assert.equal(f.counts().uploadCalls,1);
  });
});
test('expired-lease completion acknowledgement loss resumes only its accepted receipt, even after original content expiry',async t=>{
  for(const point of ['publication','resolve'])await t.test(point,async sub=>{
    const f=await setup(sub);f.mode.activationLost=true;await f.execute();f.advance(16*60000);let lost=false;
    f.after(statements=>{if(!lost&&statements.some(s=>point==='publication'?s.query.startsWith('INSERT INTO publication_receipts'):s.query.includes("SET state='resolved'"))){
      lost=true;throw new Error('PRIVATE lost acknowledgement');}});
    assert.equal((await f.execute()).state,'pending');assert.equal(lost,true);
    f.advance(27*3600000);f.mode.noRevision=true;assert.equal((await f.execute()).state,'published');
    assert.equal(await readMutationOwner(f.db,scope),null);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,1);
    assert.equal(f.counts().activateCalls,1);assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().buildCalls,1);
  });
});
test('activation proof is read-only and bound to exact stored permit; no freezing/delivery phase coercion',async t=>{
  const f=await setup(t);f.mode.activationLost=true;await f.execute();const c=f.checkpoint().control.publication;
  const adapters={...scope,providerIdentity:`cloudflare:${f.config.accountId}:${scope.indexName}`,async readback(){return f.vector;}};
  for(const patch of [{token:'wrong'},{runReference:'wrong'},{versionReference:'wrong'},{requestId:'0'.repeat(64)}])
    await assert.rejects(readActivatedCatalogVectors(f.db,{...c.permit,...patch},c.vectorPlan,adapters));
  await assert.rejects(readActivatedCatalogVectors(f.db,{...c.permit,mutationOwner:f.owner},c.vectorPlan,adapters));
  for(const patch of [{ids:[]},{ids:[],planSha256:'a'.repeat(64)},{planSha256:'a'.repeat(64)}])
    await assert.rejects(readActivatedCatalogVectors(f.db,c.permit,{...c.vectorPlan,...patch},adapters));
  const before=f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get();
  await readActivatedCatalogVectors(f.db,c.permit,c.vectorPlan,adapters);assert.deepEqual(f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get(),before);
  const original=f.sql.prepare('SELECT * FROM catalog_vector_deliveries').get();const extra={...original,delivery_id:'e'.repeat(64),prior_epoch:1,
    request_json:canonicalJson({...JSON.parse(original.request_json),publicId:version,vector:null})};const columns=Object.keys(extra);
  f.sql.prepare(`INSERT INTO catalog_vector_deliveries(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(k=>extra[k]));
  await assert.rejects(readActivatedCatalogVectors(f.db,c.permit,c.vectorPlan,adapters),/vector_plan_incomplete/); // subset omits an excluded UUID journal
});
test('real protected workspace preserves state/locks and permits exact expired-content control reconciliation',async t=>{
  const f=await setup(t,{real:true});const result=await f.execute();assert.equal(result.state,'published',JSON.stringify(result));
  assert.equal(f.checkpoint().state.driverState,'preserved');assert.equal((await f.execute()).state,'published');
});
test('two complete real-workspace publications reuse one checkout without retaining source build intermediates',async t=>{
  const f=await setup(t,{real:true});assert.equal((await f.execute()).state,'published');
  const firstDirectory=f.workspace.directory;
  for(const name of ['build/stupid-gifts','static-site/out','static-site/.next'])await assert.rejects(fs.lstat(path.join(f.config.sourceRoot,name)),{code:'ENOENT'});
  await f.nextRelease();assert.notEqual(f.workspace.directory,firstDirectory);
  const result=await f.execute();assert.equal(result.state,'published',JSON.stringify(result));
  assert.equal(f.counts().buildCalls,2);assert.equal(f.counts().uploadCalls,2);assert.equal(f.counts().activateCalls,2);
  for(const name of ['build/stupid-gifts','static-site/out','static-site/.next'])await assert.rejects(fs.lstat(path.join(f.config.sourceRoot,name)),{code:'ENOENT'});
});
test('uploaded preactivation resume survives canonical control reordering after actual workspace close/reopen',async t=>{
  const f=await setup(t,{real:true});f.mode.stopBeforeActivation=true;
  assert.equal((await f.execute()).state,'pending');assert.equal(f.checkpoint().control.publication.stage,'uploaded');assert.equal(f.counts().activateCalls,0);
  await f.reopen();delete f.mode.stopBeforeActivation;
  assert.deepEqual(Object.keys(f.checkpoint().control.publication.publication.intent),Object.keys(f.checkpoint().control.publication.publication.intent).sort());
  const result=await f.execute();assert.equal(result.state,'published',JSON.stringify(result));assert.equal(f.counts().buildCalls,1);
  assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().activateCalls,1);
});
test('lost completion/resolve acknowledgements recover only historical receipt after artifact expiry',async t=>{
  for(const point of ['publication','resolve']){
    const f=await setup(t,{real:true});let lost=false;
    f.after(statements=>{if(!lost&&statements.some(s=>point==='publication'?s.query.startsWith('INSERT INTO publication_receipts'):s.query.includes("SET state='resolved'"))){
      lost=true;throw new Error('PRIVATE lost D1 acknowledgement');}});
    assert.equal((await f.execute()).state,'pending');assert.equal(lost,true);
    f.advance(6*60000);f.mode.noRevision=true;
    const purged=await f.workspace.purgeExpired();assert.ok(purged.some(p=>p.reference===`packages/${f.config.releaseId}`));
    await assert.rejects(fs.lstat(path.join(f.workspace.directory,'packages',f.config.releaseId)),{code:'ENOENT'});
    for(const name of ['build/stupid-gifts','static-site/out','static-site/.next'])
      await assert.rejects(fs.lstat(path.join(f.config.sourceRoot,name)),{code:'ENOENT'});
    const result=await f.execute();assert.equal(result.state,'published',`${point}: ${JSON.stringify(result)}`);
    assert.equal(f.counts().activateCalls,1);assert.equal(f.counts().buildCalls,1);assert.equal(await readMutationOwner(f.db,scope),null);
  }
});
test('interrupted complete build is reused before upload; changed sealed bytes and corrupt build are explicit gates',async t=>{
  const f=await setup(t);f.mode.buildLost=true;assert.equal((await f.execute()).state,'pending');
  assert.equal((await f.execute()).state,'published');assert.equal(f.counts().buildCalls,1);assert.equal(f.counts().uploadCalls,1);
  const changed=await setup(t);changed.mode.activationNotSent=true;await changed.execute();
  const p=path.join(changed.workspace.directory,'packages',changed.config.releaseId,'assets/index.html');await fs.writeFile(p,'tampered');
  // It is already activating: never load/rebuild/reactivate even when old
  // package bytes are damaged. New acceptance still requires intact package.
  assert.equal((await changed.execute()).state,'pending');assert.equal(changed.counts().activateCalls,1);
  const corrupt=await setup(t);await put(path.join(corrupt.config.sourceRoot,'build/stupid-gifts/asset-manifest.json'),'{');
  assert.equal((await corrupt.execute()).errorCode,'publication_build_requires_operator_review');assert.equal(corrupt.counts().uploadCalls,0);
});
test('configuration has no environment/production defaults or ambient backend/identity fallback',async t=>{
  const f=await setup(t);assert.deepEqual(validatePublicationConfig(f.config),f.config);
  assert.equal(validatePublicationConfig({...f.config,workerName:'a'.repeat(63)}).workerName.length,63);
  for(const workerName of ['a'.repeat(64),'-worker','worker-','worker_name'])
    assert.throws(()=>validatePublicationConfig({...f.config,workerName}),/publication_configuration_invalid/);
  for(const patch of [{environment:undefined},{accountId:''},{database:{id:'bad',name:'db'}},{sourceMode:undefined},{sourceMode:'goose-production'},
    {identityOrigin:'https://fixture-worker.example.invalid/path'},{extra:'unsafe'}])assert.throws(()=>validatePublicationConfig({...f.config,...patch}));
});
test('wrong uploaded bindings or missing inherited staging guard never activate',async t=>{
  for(const key of ['wrongVersionDatabase','missingGuard']){const f=await setup(t);f.mode[key]=true;
    assert.equal((await f.execute()).errorCode,'publication_version_scope_mismatch');assert.equal(f.counts().activateCalls,0);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);}
});
test('reviewed semantic policy rejects staging enablement, coercion, unsafe bounds and unknown fields',async t=>{
  const f=await setup(t);const policy={enabled:false,dailyRequestCap:50,dailyTokenCap:32768};
  const production={...f.config,environment:'production',sourceMode:'goose-production',identityOrigin:siteIdentityFor('goose-production').origin};
  const valid=validatePublicationConfig({...f.config,semanticSearch:policy});assert.deepEqual(valid.semanticSearch,policy);
  assert.equal(Object.isFrozen(valid.semanticSearch),true);
  const inherited=Object.assign(Object.create({semanticSearch:{...policy,enabled:true}}),f.config);
  assert.equal(Object.hasOwn(validatePublicationConfig(inherited),'semanticSearch'),false);
  assert.equal(canonicalJson(validatePublicationConfig(inherited)),canonicalJson(f.config));
  assert.throws(()=>validatePublicationConfig({...f.config,semanticSearch:{...policy,enabled:true}}),/publication_configuration_invalid/);
  assert.deepEqual(validatePublicationConfig({...production,semanticSearch:{enabled:true,dailyRequestCap:100000,dailyTokenCap:100000000}}).semanticSearch,
    {enabled:true,dailyRequestCap:100000,dailyTokenCap:100000000});
  for(const semanticSearch of [undefined,null,{},[],{...policy,extra:1},{...policy,enabled:'true'},
    ...[0,-0,-1,1.5,NaN,Infinity,'50',undefined,100001].map(dailyRequestCap=>({...policy,dailyRequestCap})),
    ...[0,-1,1.5,NaN,Infinity,'32768',undefined,100000001].map(dailyTokenCap=>({...policy,dailyTokenCap}))])
    assert.throws(()=>validatePublicationConfig({...production,semanticSearch}),/publication_configuration_invalid/);
  f.config.semanticSearch={...policy,enabled:true};const checkpoint=structuredClone(f.checkpoint());
  await assert.rejects(f.execute(),/publication_configuration_invalid/);assert.deepEqual(f.checkpoint(),checkpoint);
  assert.deepEqual(f.counts(),{uploadCalls:0,activateCalls:0,buildCalls:0,identityCalls:0,httpCalls:0});
});
test('omitted optional policies keep historical config hashes and exact off defaults across real checkpoint resume',async t=>{
  const f=await setup(t,{real:true});const before=canonicalJson(f.config);
  Object.setPrototypeOf(f.config,{semanticSearch:{enabled:true,dailyRequestCap:1000,dailyTokenCap:100000},
    publicAnalytics:{enabled:true,posthogKey:'phc_ignored_inherited_key',posthogHost:'https://ignored.example.invalid'}});
  assert.equal(Object.hasOwn(validatePublicationConfig(f.config),'semanticSearch'),false);
  assert.equal(Object.hasOwn(validatePublicationConfig(f.config),'publicAnalytics'),false);
  assert.equal(canonicalJson(validatePublicationConfig(f.config)),before);
  f.mode.stopBeforeActivation=true;assert.equal((await f.execute()).state,'pending');
  assert.equal(f.checkpoint().control.publication.configSha256,sha(before));
  await f.reopen();delete f.mode.stopBeforeActivation;
  assert.equal((await f.execute()).state,'published');assert.equal(canonicalJson(validatePublicationConfig(f.config)),before);
  assert.deepEqual(f.uploadedConfigs[0].vars,{ENVIRONMENT:'staging',SEMANTIC_SEARCH_ENABLED:'false',
    SEMANTIC_SEARCH_DAILY_REQUEST_CAP:'50',SEMANTIC_SEARCH_DAILY_TOKEN_CAP:'32768'});
  for(const command of f.commandEnvironments){assert.equal(command.env.NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED,'false');
    assert.equal(command.env.NEXT_PUBLIC_POSTHOG_KEY,undefined);assert.equal(command.env.NEXT_PUBLIC_POSTHOG_HOST,undefined);}
});
test('public analytics validates exact public inputs and rejects staging enablement, credentials and unsafe origins',async t=>{
  const f=await setup(t);const policy={enabled:true,posthogKey:'phc_existing_public_project',posthogHost:'https://us.i.posthog.com'};
  const production={...f.config,environment:'production',sourceMode:'goose-production',identityOrigin:siteIdentityFor('goose-production').origin};
  const valid=validatePublicationConfig({...production,publicAnalytics:policy});assert.deepEqual(valid.publicAnalytics,policy);
  assert.equal(Object.isFrozen(valid.publicAnalytics),true);
  assert.deepEqual(validatePublicationConfig({...production,sourceMode:'stupid-production',identityOrigin:siteIdentityFor('stupid-production').origin,
    publicAnalytics:policy}).publicAnalytics,policy);
  assert.deepEqual(validatePublicationConfig({...f.config,publicAnalytics:{...policy,enabled:false}}).publicAnalytics,{...policy,enabled:false});
  assert.throws(()=>validatePublicationConfig({...f.config,publicAnalytics:policy}),/publication_configuration_invalid/);
  for(const publicAnalytics of [undefined,null,{},[],{...policy,extra:'secret'},{...policy,enabled:'true'},
    ...[undefined,null,'','phx_private_api_key','phc_','phc_bad key','phc_'+'a'.repeat(197)].map(posthogKey=>({...policy,posthogKey})),
    ...[undefined,null,'','http://us.i.posthog.com','https://user:password@us.i.posthog.com','https://us.i.posthog.com/',
      'https://us.i.posthog.com/path','https://us.i.posthog.com?secret=value','https://us.i.posthog.com#fragment',
      'https://us.i.posthog.com:8443',' https://us.i.posthog.com','https://'+'a'.repeat(256)].map(posthogHost=>({...policy,posthogHost}))])
    assert.throws(()=>validatePublicationConfig({...production,publicAnalytics}),/publication_configuration_invalid/);
  f.config.publicAnalytics=policy;const checkpoint=structuredClone(f.checkpoint());
  await assert.rejects(f.execute(),/publication_configuration_invalid/);assert.deepEqual(f.checkpoint(),checkpoint);
  assert.deepEqual(f.counts(),{uploadCalls:0,activateCalls:0,buildCalls:0,identityCalls:0,httpCalls:0});
});
test('consecutive production publications forward only pinned public analytics to build/verify and reject in-flight changes',async t=>{
  const policy={enabled:true,posthogKey:'phc_existing_public_project',posthogHost:'https://us.i.posthog.com'};
  const f=await setup(t,{real:true,environment:'production',publicAnalytics:policy,
    semanticSearch:{enabled:false,dailyRequestCap:50,dailyTokenCap:32768}});f.mode.versionInvisible=true;
  assert.equal((await f.execute()).errorCode,'publication_upload_pending');
  assert.equal(f.checkpoint().control.publication.configSha256,sha(canonicalJson(f.config)));
  const before=f.counts();
  for(const patch of [{enabled:false},{posthogKey:'phc_other_public_project'},{posthogHost:'https://eu.i.posthog.com'}]){
    f.config.publicAnalytics={...policy,...patch};assert.equal((await f.execute()).errorCode,'publication_checkpoint_mismatch');
    assert.deepEqual(f.counts(),before);
  }
  f.config.publicAnalytics=policy;await f.reopen();delete f.mode.versionInvisible;
  assert.equal((await f.execute()).state,'published');await f.nextRelease();assert.equal((await f.execute()).state,'published');
  const buildCommands=f.commandEnvironments.filter(command=>command.args.some(arg=>/^scripts\/staging\/(build|verify-release)\.mts$/.test(arg)));
  assert.equal(buildCommands.length,4);
  for(const command of buildCommands){
    assert.deepEqual(Object.fromEntries(Object.entries(command.env).filter(([key])=>key.startsWith('NEXT_PUBLIC_'))),{
      NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:'true',NEXT_PUBLIC_POSTHOG_KEY:policy.posthogKey,NEXT_PUBLIC_POSTHOG_HOST:policy.posthogHost});
    for(const key of ['CLOUDFLARE_API_TOKEN','OPENAI_API_KEY','POSTGRES_URL','STAGING_AUTH_SECRET'])assert.equal(command.env[key],undefined);
    assert.ok(!JSON.stringify(command.env).includes('PRIVATE'));
  }
  assert.equal(f.counts().uploadCalls,2);assert.equal(f.counts().activateCalls,2);
  for(const uploaded of f.uploadedConfigs)assert.equal(Object.keys(uploaded.vars).some(key=>/ANALYTICS|POSTHOG/.test(key)),false);
});
test('omitted and disabled analytics never inherit ambient public values; staging always receives none',async t=>{
  const ambient={NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:'true',NEXT_PUBLIC_POSTHOG_KEY:'phc_ambient_project',
    NEXT_PUBLIC_POSTHOG_HOST:'https://ambient.example.invalid',NEXT_PUBLIC_ANALYTICS_TEST_SECRET:'not-forwarded'};
  const previous=Object.fromEntries(Object.keys(ambient).map(key=>[key,process.env[key]]));Object.assign(process.env,ambient);
  t.after(()=>{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const disabled={enabled:false,posthogKey:'phc_reviewed_public_project',posthogHost:'https://us.i.posthog.com'};
  for(const [environment,publicAnalytics]of [['production',undefined],['production',disabled],['staging',disabled]]){
    const f=await setup(t,{environment,publicAnalytics});assert.equal((await f.execute()).state,'published');
    for(const command of f.commandEnvironments)assert.deepEqual(
      Object.fromEntries(Object.entries(command.env).filter(([key])=>key.startsWith('NEXT_PUBLIC_'))),{NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED:'false'});
  }
});
test('consecutive production publications preserve exact reviewed search policy and refuse in-flight policy changes',async t=>{
  const policy={enabled:true,dailyRequestCap:123,dailyTokenCap:45678};
  const f=await setup(t,{environment:'production',semanticSearch:policy});f.mode.versionInvisible=true;
  assert.equal((await f.execute()).errorCode,'publication_upload_pending');
  const before=f.counts();f.config.semanticSearch={...policy,dailyRequestCap:124};
  assert.equal((await f.execute()).errorCode,'publication_checkpoint_mismatch');assert.deepEqual(f.counts(),before);
  f.config.semanticSearch=policy;delete f.mode.versionInvisible;assert.equal((await f.execute()).state,'published');
  const firstHash=f.checkpoint().control.publication.configSha256;
  await f.nextRelease();assert.equal((await f.execute()).state,'published');
  assert.notEqual(f.checkpoint().control.publication.configSha256,firstHash);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,3);
  assert.equal(f.counts().activateCalls,2);assert.equal(f.counts().uploadCalls,2);
  assert.equal(f.uploadedConfigs[1].name,f.uploadedConfigs[0].name);
  for(const uploaded of f.uploadedConfigs){
    assert.equal(uploaded.workers_dev,false);
    assert.deepEqual(uploaded.vars,{ENVIRONMENT:'production',SEMANTIC_SEARCH_ENABLED:'true',
      SEMANTIC_SEARCH_DAILY_REQUEST_CAP:'123',SEMANTIC_SEARCH_DAILY_TOKEN_CAP:'45678'});
  }
});
test('old production configs remain off; explicit disabled production/staging policies preserve lower caps',async t=>{
  const lower={enabled:false,dailyRequestCap:7,dailyTokenCap:256};
  for(const [environment,semanticSearch]of [['production',undefined],['production',lower],['staging',lower]]){
    const f=await setup(t,{environment,semanticSearch});assert.equal((await f.execute()).state,'published');
    assert.deepEqual(f.uploadedConfigs[0].vars,{ENVIRONMENT:environment,SEMANTIC_SEARCH_ENABLED:'false',
      SEMANTIC_SEARCH_DAILY_REQUEST_CAP:String(semanticSearch?.dailyRequestCap??50),SEMANTIC_SEARCH_DAILY_TOKEN_CAP:String(semanticSearch?.dailyTokenCap??32768)});
  }
});
test('independent uploaded enabled/request/token binding mismatches or missing caps cannot activate',async t=>{
  const bindings={SEMANTIC_SEARCH_ENABLED:'false',SEMANTIC_SEARCH_DAILY_REQUEST_CAP:'124',SEMANTIC_SEARCH_DAILY_TOKEN_CAP:'45679'};
  for(const [name,text]of [...Object.entries(bindings),['SEMANTIC_SEARCH_DAILY_REQUEST_CAP',null],['SEMANTIC_SEARCH_DAILY_TOKEN_CAP',null]]){
    const f=await setup(t,{environment:'production',semanticSearch:{enabled:true,dailyRequestCap:123,dailyTokenCap:45678}});
    if(text===null)f.mode.missingSearchBinding=name;else f.mode.searchBinding={name,text};
    assert.equal((await f.execute()).errorCode,'publication_version_scope_mismatch',name);
    assert.equal(f.counts().activateCalls,0);assert.equal(f.checkpoint().owner.phase,'freezing');
    assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);
    delete f.mode.missingSearchBinding;delete f.mode.searchBinding;
    assert.equal((await f.execute()).state,'published');assert.equal(f.counts().uploadCalls,1);
  }
});
test('protected resolve accepts a healthy aggregate observation over the legacy three-second deadline',async t=>{
  const f=await setup(t);f.mode.resolveDelayMs=3200;
  const start=performance.now();assert.equal((await f.execute()).state,'published');assert.ok(performance.now()-start>=3200);
  assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().activateCalls,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,1);
  const counts=f.counts();assert.equal((await f.execute()).state,'published');assert.deepEqual(f.counts(),{...counts,httpCalls:counts.httpCalls+2});
});
test('inner native timeout drains aborted read cleanup before pending, keeps permit, and exact retry settles once',async t=>{
  const f=await setup(t);f.mode.activationLost=true;assert.equal((await f.execute()).state,'pending');delete f.mode.activationLost;
  f.mode.vectorAbortCleanup=true;assert.equal((await f.execute()).state,'pending');assert.equal(f.mode.vectorCleaned,true);
  assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests').get().state,'activating');
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);
  const counts=f.counts();await new Promise(resolve=>setTimeout(resolve,75));assert.deepEqual(f.counts(),counts);
  delete f.mode.vectorAbortCleanup;assert.equal((await f.execute()).state,'published');
  assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().activateCalls,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,1);
});
test('outer resolve deadline aborts the owned chain before further reads, preserves receipt and retries exactly',async t=>{
  const f=await setup(t),timer=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timer(fn,ms===30_000?10:ms,...args));
  f.mode.resolveDelayMs=75;assert.equal((await f.execute()).state,'pending');
  assert.equal(f.checkpoint().control.publication.stage,'published');
  assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests').get().state,'activating');
  const counts=f.counts();await new Promise(resolve=>setTimeout(resolve,100));assert.deepEqual(f.counts(),counts);
  assert.equal((await f.execute()).state,'published');assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().activateCalls,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,1);
});
test('preactivation and resolve timeouts drain the selected owned sender before exact once-only retry',async t=>{
  for(const [identityOnlyPrior,phase]of [[false,'preactivation'],[true,'preactivation'],[true,'resolve']])await t.test(`${phase}/${identityOnlyPrior?'receipt':'retained'}`,async sub=>{
    const f=await setup(sub,{identityOnlyPrior}),base=`https://api.cloudflare.com/client/v4/accounts/${f.config.accountId}/d1/database/${id}`;
    const db=await createCatalogD1Rest({accountId:f.config.accountId,databaseId:id,databaseName:f.config.database.name,token:'FIXTURE_ONLY',fetch:async(url,init)=>{
      if(url===base)return Response.json({success:true,result:{uuid:id,name:f.config.database.name,read_replication:{mode:'disabled'}}});
      assert.equal(url,`${base}/query`);const result=[];f.sql.exec('BEGIN');
      try{for(const query of JSON.parse(init.body).batch){const before=f.sql.prepare('SELECT total_changes() n').get().n;
        const rows=f.sql.prepare(query.sql).all(...query.params).map(row=>({...row})),changes=f.sql.prepare('SELECT total_changes() n').get().n-before;
        result.push({success:true,results:rows,meta:{served_by_primary:true,rows_read:rows.length,rows_written:changes,changes}});
      }f.sql.exec('COMMIT');}catch(error){f.sql.exec('ROLLBACK');throw error;}return Response.json({success:true,result});
    }});
    let lateResponse,hold=true,readStarted;const events=[];let observed=0;
    const heldRead=new Promise(resolve=>{readStarted=resolve;});
    const observationFetch=accountedPublicationReadFetch({async reserveBudget(){events.push('reserve');},async settleBudget(_id,value){
      if(value.status==='unknown')await new Promise(resolve=>setTimeout(resolve,200));events.push(value.status);
    }},async(url,init)=>{
      observed++;const response=await f.fetch(url,init);
      if(hold&&(phase==='preactivation'||f.checkpoint().control.publication.stage==='published')){
        hold=false;return new Promise(resolve=>{lateResponse=()=>resolve(response);readStarted();});}return response;
    },{accountId:f.config.accountId,databaseId:id,workerName:f.config.workerName,indexName:f.config.indexName,identityOrigin:f.config.identityOrigin});
    // Trigger the fault only after its read was dispatched. Restore real timers
    // before the healthy retry: filesystem contention is not a 40 ms SLA.
    const timer=globalThis.setTimeout;sub.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>[3000,30000].includes(ms)
      ?timer(()=>{void heldRead.then(()=>fn(...args));},40):timer(fn,ms===10000?80:ms,...args));
    const result=await f.execute(db,{observationFetch});assert.equal(result.state,'pending');assert.ok(observed>0);
    sub.mock.restoreAll();
    assert.equal(events.filter(s=>s==='unknown').length,1);assert.equal(f.counts().activateCalls,phase==='preactivation'?0:1);
    assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests').get().state,phase==='preactivation'?'building':'activating');
    assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,phase==='preactivation'?'freezing':'activating');
    assert.equal(f.checkpoint().control.publication.permit===null,phase==='preactivation');
    const changes=f.sql.prepare('SELECT total_changes() n').get().n,counts=f.counts(),checkpoint=f.checkpoint().sha256,
      priorEvents=[...events],priorObserved=observed;lateResponse();
    await new Promise(resolve=>setTimeout(resolve,30));assert.deepEqual(events,priorEvents);assert.equal(observed,priorObserved);
    assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes);assert.deepEqual(f.counts(),counts);assert.equal(f.checkpoint().sha256,checkpoint);
    // The read-only sender never sees normal activation/mutation traffic.
    const retry=await f.execute(db,{observationFetch:accountedPublicationReadFetch({async reserveBudget(){},async settleBudget(){}},f.fetch,
      {accountId:f.config.accountId,databaseId:id,workerName:f.config.workerName,indexName:f.config.indexName,identityOrigin:f.config.identityOrigin})});
    assert.equal(retry.state,'published',JSON.stringify(retry));assert.equal(f.counts().uploadCalls,1);assert.equal(f.counts().activateCalls,1);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,1);
  });
});
