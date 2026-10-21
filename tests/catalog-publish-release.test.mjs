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
import { enqueuePublication, claimPublication, recordPublicationDispatch, completePublication } from '../lib/catalog/publication.ts';
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
import safeCatalogPayload from '../static-site/public/safe/catalog.json' with {type:'json'};

const AT=Date.parse('2026-10-19T12:00:00.000Z');
const sha=value=>createHash('sha256').update(value).digest('hex');
const bytes=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
const id='00000000-0000-4000-8000-000000000001',version='00000000-0000-4000-8000-000000000002',deployment='00000000-0000-4000-8000-000000000003';
const priorVersion='00000000-0000-4000-8000-000000000004',priorDeployment='00000000-0000-4000-8000-000000000005';
const scope={environment:'staging',indexName:'fixture-index'};
async function put(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value,{mode:0o600});}
function fixtureRelease(snapshot,context,prior=null){
  const pages=['/','/gifts','/gifts/page/1','/random-gift','/gift-guides','/weird-gift-index','/howie','/preview/presentation',...guides.map(g=>`/gift-guides/${g.slug}`),
    ...snapshot.products.map(p=>`/gifts/${p.slug}`)];
  const assets=new Map(pages.map(p=>[p==='/'?'/index.html':`${p}.html`,bytes('Owned fixture HTML')]));
  for(const name of ['/safe/catalog.html','/safe/product.html','/safe/howie.html','/safe/presentation.html','/safe/index.json','/safe/asset.txt'])assets.set(name,bytes('Owned unavailable'));
  assets.set('/safe/catalog.json',bytes(safeCatalogPayload));assets.set('/weird-gift-index/data.json',bytes({scope:'sample'}));
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
async function setup(t,{real=false,prior=true,environment='staging',semanticSearch,priorExpiryMs=26*3600000}={}){
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
    priorConfig={directory:priorDirectory,manifestSha256:sha(priorRelease.manifestBytes),releaseId:priorRelease.intent.releaseId,versionReference:priorVersion};
  }
  sql.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)').run(snapshot.catalogRevision,snapshot.generatedAt,'b'.repeat(64),'reconciled');
  const packet=await createProjectionPacket(snapshot,{[id]:'f'.repeat(64)},'b'.repeat(64),new Date(AT));await importPublicProjection(db,packet);
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const owner=await claimMutationOwnership(db,scope,{phase:'freezing',ownerReference:'fixture-run',operationKey:'d'.repeat(64)});
  const revision={request:{previous:snapshot,scope},snapshot,packet,sourceRows:[{public_id:id,source_facts_hash:'f'.repeat(64),embedding_text_hash:null}],
    vectorSyncWatermark:0,globalVectorWatermark:0};const plan=prunedVectorPlan(revision);
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
    compatibilityDate:'2026-10-19',prior:priorConfig,...(semanticSearch===undefined?{}:{semanticSearch})};
  let checkpoint={sha256:'0'.repeat(64),phase:'freezing',owner,state:{driverState:'preserved'},pins:{phase:'b'.repeat(64)},phaseComplete:null,control:{}};
  let workspace={directory:path.join(directory,'workspace'),repository:await fs.realpath(sourceRoot),manifest:{codeSha},async assertHeld(){},assertScope(s){assert.deepEqual(s,{accountId:config.accountId,environment,databaseId:id,
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
  let targetVersion=version,activePriorVersion=priorVersion;const uploadedConfigs=[];
  const command=async command=>{
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
    if(u.pathname.endsWith('/get_by_ids')){if(mode.vectorFailure)return response([]);const expected=structuredClone(vector);
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
  const execute=()=>executePublication({db,owner:checkpoint.owner,revision:mode.noRevision?null:revision,requestId,runReference:'fixture-run',workspace,config,
    credentials:{cloudflareToken:'PRIVATE_TOKEN',identityAuthorization:'Basic PRIVATE'},dependencies:{fetch,command,now:()=>new Date(clock)}});
  return{db,sql,owner,revision,get workspace(){return workspace;},config,execute,mode,uploadedConfigs,checkpoint:()=>checkpoint,advance(ms){clock+=ms;},after(fn){afterBatch=fn;},
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
test('expired lease/content and source/rights drift never grant new publication',async t=>{
  const expired=await setup(t);expired.mode.activationLost=true;await expired.execute();expired.advance(16*60000);
  assert.equal((await expired.execute()).errorCode,'publication_fresh_evidence_required');assert.equal(expired.counts().activateCalls,1);
  const changed=await setup(t);changed.mode.sourceDrift=true;assert.equal((await changed.execute()).state,'pending');assert.equal(changed.counts().activateCalls,0);
  const held=await setup(t);held.mode.activationLost=true;await held.execute();held.sql.prepare("UPDATE products SET rights_json='{}'").run();
  assert.equal((await held.execute()).state,'pending');assert.equal(held.sql.prepare("SELECT count(*) n FROM publication_receipts WHERE release_id='fixture-release'").get().n,0);
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
test('omitted semantic policy keeps historical config hashes and exact off caps across real checkpoint resume',async t=>{
  const f=await setup(t,{real:true});const before=canonicalJson(f.config);
  Object.setPrototypeOf(f.config,{semanticSearch:{enabled:true,dailyRequestCap:1000,dailyTokenCap:100000}});
  assert.equal(Object.hasOwn(validatePublicationConfig(f.config),'semanticSearch'),false);
  assert.equal(canonicalJson(validatePublicationConfig(f.config)),before);
  f.mode.stopBeforeActivation=true;assert.equal((await f.execute()).state,'pending');
  assert.equal(f.checkpoint().control.publication.configSha256,sha(before));
  await f.reopen();delete f.mode.stopBeforeActivation;
  assert.equal((await f.execute()).state,'published');assert.equal(canonicalJson(validatePublicationConfig(f.config)),before);
  assert.deepEqual(f.uploadedConfigs[0].vars,{ENVIRONMENT:'staging',SEMANTIC_SEARCH_ENABLED:'false',
    SEMANTIC_SEARCH_DAILY_REQUEST_CAP:'50',SEMANTIC_SEARCH_DAILY_TOKEN_CAP:'32768'});
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
