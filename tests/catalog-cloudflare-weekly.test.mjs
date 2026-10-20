import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { runCloudflareWeekly, validateCloudflareWeeklyConfig, weeklyCommandSummary, WEEKLY_RESUME_STATES } from '../scripts/catalog/run-cloudflare-weekly.ts';
import { openRunWorkspace, readRunWorkspace } from '../scripts/catalog/run-workspace.ts';
import { getOpenAIClient, runCatalogWithBackend } from '../scripts/ops/prefetch-catalog.mjs';
import amazonCreators from '../lib/amazon-creators.js';
import { createD1CatalogMaintenanceStore } from '../scripts/catalog/maintenance-d1.ts';
import { claimMutationOwnership, readMutationOwner, releaseMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { createProjectionPacket, projectionQueries } from '../lib/catalog/d1.ts';
import { createSealedSnapshotEnvelope } from '../scripts/catalog/export-d1-snapshot.ts';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { createReleaseIdentity } from '../scripts/staging/release-identity.mts';
import { siteIdentityBytes } from '../scripts/staging/build.mts';
import { assembleReleaseAssets } from '../scripts/staging/retention.mts';
import { createStaticFeedPlan } from '../workers/site/feed.ts';
import { createBrowseRelease } from '../static-site/lib/browse.ts';
import { createOgRelease } from '../static-site/lib/og.ts';
import { siteIdentityFor } from '../static-site/lib/site-identity.ts';
import { guides } from '../static-site/lib/guides.ts';
import { nativeHash } from '../scripts/catalog/vector-outbox.ts';

// Real composed stores/fence/evidence/driver/publisher/workspace over SQLite.
// Only external Amazon/OpenAI/CF and Next compilation are mocked. Real package
// verification, upload intent, activation CAS, independent identity/native proof
// and exact final telemetry remain in the call path. No network or live rights.
const NOW='2026-10-20T12:00:00.123Z',OLD='2026-07-01T00:00:00.000Z';
const ID='B000000001',UUID='00000000-0000-4000-8000-000000000001';
const VERSION='00000000-0000-4000-8000-000000000002',DEPLOY='00000000-0000-4000-8000-000000000003';
const values=Array(1536).fill(.1);values[0]=-0;values[1]=1e-45;
const writeup=Array(2).fill(Array(15).fill('Synthetic brass lobster desk bell fixture editorial.').join(' ')).join('\n\n');
const p={id:ID,title:'TEST ONLY novelty brass lobster desk bell',price:19.99,currency:'USD',imageUrl:'https://example.invalid/lobster.jpg',
  affiliateUrl:`https://www.amazon.com/dp/${ID}?tag=fixture-20`,source:'amazon',sourceQuery:'test-only fixture',humorTags:['fixture','desk'],
  punnyTitle:'Test only shell service',wittyDescription:'An independently owned synthetic desk bell description.',qualityScore:.85,
  rating:4.5,reviewCount:12,isActive:true,editorialWriteup:writeup,sourceFacts:{fixture:true,material:'brass',shape:'lobster'},
  availabilityStatus:'IN_STOCK',editorialStatus:'manual_locked',editorialQualityScore:.95,remotelyVerified:true};
const rights=Object.fromEntries(Object.entries({title:p.title,description:p.wittyDescription,imageUrl:p.imageUrl,affiliateUrl:p.affiliateUrl,
  punnyTitle:p.punnyTitle,wittyDescription:p.wittyDescription,editorialWriteup:p.editorialWriteup,humorTags:JSON.stringify(p.humorTags)})
  .map(([field,value])=>[field,{basis:'owned',reference:`test-only-owned/${field}`,value}]));
const original={fetch:globalThis.fetch,getItems:amazonCreators.getItems,searchItems:amazonCreators.searchItems};
let route;globalThis.fetch=(...args)=>{if(!route)throw new Error('Live network forbidden');return route(...args);};
test.after(()=>{globalThis.fetch=original.fetch;amazonCreators.getItems=original.getItems;amazonCreators.searchItems=original.searchItems;});
async function put(file,value){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,
  typeof value==='string'||value instanceof Uint8Array?value:`${JSON.stringify(value)}\n`,{mode:0o600});}
async function setup(t){
  const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'goose-weekly-')));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const repo=path.join(directory,'source');await fs.mkdir(repo,{mode:0o700});await put(path.join(repo,'.gitignore'),'build/\nstatic-site/out/\n');
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();git('init','-q');git('add','.gitignore');
  git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Owned fixture');const codeSha=git('rev-parse','HEAD');
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');
  for(const name of (await fs.readdir(new URL('../migrations/d1/',import.meta.url))).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort())
    sql.exec(await fs.readFile(new URL(`../migrations/d1/${name}`,import.meta.url),'utf8'));
  let clock=OLD;sql.function('strftime',(format,instant)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');return instant==='now'?clock:new Date(instant).toISOString();});
  const local={prepare(q){let params=[];return{bind(...v){params=v;return this;},async all(){return{results:sql.prepare(q).all(...params).map(r=>({...r}))};},
    async run(){return sql.prepare(q).run(...params);},execute(){return sql.prepare(q).all(...params);}};},async batch(queries){sql.exec('BEGIN');
    try{for(const q of queries)q.execute();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const scope={environment:'staging',indexName:'test-weekly-index'};
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const owner=await claimMutationOwnership(local,scope,{phase:'writing',ownerReference:'seed',operationKey:'a'.repeat(64)});
  const seed=createD1CatalogMaintenanceStore({db:local,owner,runId:'seed',catalogRevision:'prior-r',newPublicId:()=>UUID});
  await seed.upsertProduct({...p,remotelyVerified:false,embedding:null},editorialSourceHash(p));
  const row=sql.prepare('SELECT * FROM products').get();await releaseMutationOwnership(local,await readMutationOwner(local,scope));
  clock=NOW;
  const previous={schemaVersion:1,dataKind:'catalog',catalogRevision:'prior-r',generatedAt:NOW,products:[],heldProducts:[{id:ID,publicId:UUID,
    slug:row.slug,path:`/gifts/${row.slug}`,title:'Gift currently unavailable',description:'This gift is not currently available in the curated catalog. Browse other gifts instead.',reason:'editorial_hold'}],slugHistory:[]};
  const packet=await createProjectionPacket(previous,{[UUID]:row.source_facts_hash},'b'.repeat(64),new Date(NOW));
  sql.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)').run('prior-r',NOW,'b'.repeat(64),'reconciled');
  for(const q of projectionQueries(packet))sql.prepare(q.sql).run(...q.params);
  const context={envelopeSha256:sha256(`${JSON.stringify(createSealedSnapshotEnvelope(previous))}\n`),snapshotSha256:packet.receipt.snapshot_sha256,
    projectionSha256:packet.receipt.projection_sha256,sourceExportSha256:'b'.repeat(64),vectorSyncWatermark:0,publicationReceiptWatermark:0,
    priorPublication:null,cutoff:new Date(Date.parse(NOW)+3600000).toISOString()};
  const inputs={};for(const [name,value]of Object.entries({previous,context,rights:{rightsById:{[ID]:rights},reviewedDeleteReference:'test-only/delete'}})){
    const file=path.join(directory,`${name}.json`);await put(file,value);inputs[name]={path:file,sha256:sha256(await fs.readFile(file)),observedAt:NOW};}
  const ref=name=>({service:`goose.gifts.test.${name}`,account:'fixture'});
  const config={schemaVersion:1,runId:'test-weekly',catalogRevision:'weekly-r',codeSha,environment:scope.environment,accountId:'a'.repeat(32),
    database:{id:UUID,name:'test-weekly-db'},vectorIndex:{name:scope.indexName,dimensions:1536,metric:'cosine'},catalog:{associateTag:'fixture-20',marketplace:'www.amazon.com'},
    credentials:{cloudflare:ref('cloudflare'),amazonId:ref('amazon-id'),amazonSecret:ref('amazon-secret'),amazonVersion:'2.1',openai:ref('openai'),stagingAuthSecret:ref('staging')},
    limits:{requests:1000,statements:4000},backfillLimit:1,inputs,
    retention:{reviewReference:'test-only/owned-retention',rules:Object.fromEntries(['amazon-observation','embedding-response','phase','publication','checkpoint']
      .map(kind=>[kind,{maxAgeMs:86400000,notAfter:new Date(Date.parse(NOW)+86400000).toISOString()}]))},
    publication:{schemaVersion:1,environment:scope.environment,accountId:'a'.repeat(32),workerName:'test-weekly-worker',database:{id:UUID,name:'test-weekly-db'},indexName:scope.indexName,
      codeSha,sourceMode:'preview',sourceRoot:repo,releaseId:'test-release',identityOrigin:'https://test-weekly-worker.example.invalid',compatibilityDate:'2026-10-20',prior:null}};
  const configPath=path.join(directory,'config.json');await put(configPath,config);const configSha256=sha256(await fs.readFile(configPath));
  const workspace=path.join(directory,'runs');const workspaceOptions={directory:workspace,repository:repo,mode:'resume',runId:config.runId,configSha256,codeSha,
    scope:{...scope,accountId:config.accountId,databaseId:UUID,databaseName:config.database.name,workerName:config.publication.workerName},retention:config.retention,
    budgetCaps:{httpRequests:config.limits.requests,sqlStatements:config.limits.statements},now:()=>clock};
  const calls={getItems:0,search:0,chat:0,embedding:0,http:0,upsert:0,activate:0,upload:0,build:0,finish:0};const index=new Map();let mutation,upload,active=false,manifest;
  const mode={};let dropWrite=false;let queryTamper;let lostReleaseReadbacks=0,versionReads=0;
  amazonCreators.getItems=async()=>{calls.getItems++;assert.equal(process.env.AMAZON_ASSOCIATE_TAG,'fixture-20');assert.equal(process.env.POSTGRES_URL,undefined);
    assert.equal(process.env.CATALOG_DISCOVERY_THEMES,undefined);return[structuredClone(p)];};
  amazonCreators.searchItems=async()=>{calls.search++;return mode.superseded
    ?[structuredClone(calls.search>1?{...p,title:'Changed contradictory listing',sourceFacts:{material:'plastic'}}:p)]:[];};
  const response=result=>Response.json({success:true,result});
  const vectorResponse=rows=>new Response(`{"success":true,"result":[${rows.map(v=>`{"id":${JSON.stringify(v.id)},"values":[${v.values.map(n=>Object.is(n,-0)?'-0':n).join(',')}],"metadata":${JSON.stringify(v.metadata)}}`).join(',')}]}`);
  const fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url||String(input));
    if(url.origin==='https://api.openai.com'){
      const body=JSON.parse(init.body);assert.equal(init.headers.get?.('authorization')||init.headers.Authorization,'Bearer TEST_ONLY_openai');
      assert.ok(['gpt-4o-mini','text-embedding-3-small'].includes(body.model));
      if(url.pathname.endsWith('/embeddings')){calls.embedding++;return new Response(`{"model":"text-embedding-3-small","usage":{"prompt_tokens":8,"total_tokens":8},"data":[{"index":0,"embedding":[${values.map(n=>Object.is(n,-0)?'-0':n).join(',')}]}]}`,{headers:{'content-type':'application/json'}});}
      calls.chat++;return Response.json({choices:[{message:{content:JSON.stringify({products:[{id:ID,approved:true,qualityScore:.95,reasons:[],correctedEditorial:null}]})},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
    }
    calls.http++;
    if(url.origin===config.publication.identityOrigin){if(mode.identityFailure)return new Response('',{status:401});
      assert.equal(init.headers.Authorization,`Basic ${Buffer.from('staging:TEST_ONLY_staging').toString('base64')}`);return Response.json(createReleaseIdentity(Buffer.from(`${JSON.stringify(manifest,null,2)}\n`)));}
    assert.equal(url.origin,'https://api.cloudflare.com');
    if(url.pathname.endsWith(`/d1/database/${UUID}`))return response({uuid:UUID,name:config.database.name,read_replication:{mode:'disabled'}});
    if(url.pathname.endsWith('/query')){
      const queries=JSON.parse(init.body).batch;const result=[];sql.exec('BEGIN');
      try{for(const q of queries){const before=sql.prepare('SELECT total_changes() n').get().n;const rows=sql.prepare(q.sql).all(...q.params).map(r=>({...r}));
        queryTamper?.(q,rows);const writes=sql.prepare('SELECT total_changes() n').get().n-before;result.push({success:true,results:rows,meta:{served_by_primary:true,rows_read:rows.length,rows_written:writes,changes:writes}});
      }sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
      calls.finish+=queries.filter(q=>q.sql.startsWith('UPDATE catalog_run_telemetry SET finish_json=')).length;
      if(dropWrite&&queries.some(q=>q.sql.startsWith('INSERT INTO catalog_maintenance_products'))){dropWrite=false;throw new Error('TEST ONLY committed response loss');}
      if(mode.loseActivationFenceResponse&&queries.some(q=>q.sql.startsWith("UPDATE catalog_build_requests SET state='activating'"))){
        mode.loseActivationFenceResponse=false;throw new Error('TEST ONLY consumed activation-fence response');}
      if(mode.loseFinishReadback&&queries.some(q=>q.sql.includes('SELECT r.*,t.start_json,t.finish_json'))
        &&result.some(r=>r.results.some(row=>row.status==='completed'))){mode.loseFinishReadback=false;throw new Error('TEST ONLY finish readback loss');}
      if(mode.loseFinalRelease&&queries.some(q=>q.sql.startsWith("UPDATE catalog_mutation_scopes SET phase='idle'"))
        &&sql.prepare('SELECT status FROM catalog_runs').get()?.status==='completed'){
        mode.loseFinalRelease=false;lostReleaseReadbacks=1;throw new Error('TEST ONLY committed final release response loss');}
      if(lostReleaseReadbacks&&queries.some(q=>q.sql.includes('SELECT 1 FROM catalog_mutation_scopes'))){
        lostReleaseReadbacks--;throw new Error('TEST ONLY final release reconciliation unavailable');}
      return response(result);
    }
    if(url.pathname.endsWith(`/indexes/${scope.indexName}`))return response({name:scope.indexName,config:{dimensions:1536,metric:'cosine'}});
    if(url.pathname.endsWith('/upsert')){calls.upsert++;const v=JSON.parse(init.body);index.set(v.id,v);mutation=`00000000-0000-4000-8000-${String(100+calls.upsert).padStart(12,'0')}`;return response({mutationId:mutation});}
    if(url.pathname.endsWith('/info'))return response({dimensions:1536,processedUpToMutation:mutation});
    if(url.pathname.endsWith('/get_by_ids'))return vectorResponse(JSON.parse(init.body).ids.flatMap(id=>index.has(id)?[index.get(id)]:[]));
    if(url.pathname.endsWith('/versions'))return response({items:upload?[{id:VERSION}]:[]});
    if(url.pathname.endsWith(`/versions/${VERSION}`)){
      if(mode.stopAfterUpload&&++versionReads===3){mode.stopAfterUpload=false;throw new Error('TEST ONLY uploaded-stage interruption');}
      return response({id:VERSION,annotations:{'workers/tag':upload.tag,'workers/message':upload.message},
      resources:{script_runtime:{compatibility_date:config.publication.compatibilityDate},bindings:[{name:'DB',type:'d1',id:UUID},
        {name:'VECTORIZE',type:'vectorize',index_name:scope.indexName},{name:'ASSETS',type:'assets'},
        {name:'ENVIRONMENT',type:'plain_text',text:'staging'},{name:'SEMANTIC_SEARCH_ENABLED',type:'plain_text',text:'false'},
        {name:'STAGING_AUTH_SECRET',type:'secret_text'}]}});}
    if(url.pathname.endsWith('/deployments')){
      if(init.method==='POST'){calls.activate++;active=JSON.parse(init.body);if(mode.activationLost)throw new Error('TEST ONLY consumed activation response');return response({id:DEPLOY});}
      return response({deployments:active?[{id:DEPLOY,versions:active.versions,annotations:active.annotations}]:[]});
    }
    throw new Error('Unexpected test-only HTTP');
  };route=fetch;
  const command=async c=>{
    if(c.args.includes('upload')){calls.upload++;upload={tag:c.args[c.args.indexOf('--tag')+1],message:c.args[c.args.indexOf('--message')+1]};return;}
    if(!c.args.includes('scripts/staging/build.mts'))return;
    calls.build++;const context=JSON.parse(await fs.readFile(c.env.CATALOG_RELEASE_CONTEXT_PATH));const snapshot=JSON.parse(await fs.readFile(c.env.CATALOG_SNAPSHOT_PATH));
    const pages=['/','/gifts','/gifts/page/1','/random-gift','/gift-guides','/weird-gift-index','/howie','/preview/presentation',...guides.map(g=>`/gift-guides/${g.slug}`),
      ...[...snapshot.products,...snapshot.heldProducts].map(p=>`/gifts/${p.slug}`)];
    const assets=new Map(pages.map(p=>[p==='/'?'/index.html':`${p}.html`,Buffer.from('Owned fixture HTML')]));
    for(const name of ['/safe/catalog.html','/safe/product.html','/safe/howie.html','/safe/presentation.html','/safe/index.json','/safe/asset.txt'])assets.set(name,Buffer.from('Owned unavailable'));
    assets.set('/safe/catalog.json',Buffer.from('{"state":"unavailable","products":[]}'));assets.set('/weird-gift-index/data.json',Buffer.from('{"scope":"sample"}'));
    for(const shard of createBrowseRelease(snapshot).shards)assets.set(shard.path,Buffer.from(JSON.stringify(shard.payload)));
    for(const name of createOgRelease(snapshot,siteIdentityFor('preview')).byPath.keys())assets.set(name,Buffer.from('Owned PNG fixture'));
    const assembled=assembleReleaseAssets(snapshot,assets,context,null);const {retainedManifestSha256,...rest}=context;void retainedManifestSha256;
    manifest={...rest,dataKind:'catalog',siteIdentitySha256:sha256(siteIdentityBytes('preview')),nextExpiry:snapshot.products.map(p=>p.eligibleUntil).sort()[0]||null,
      productCount:snapshot.products.length,slugCount:snapshot.products.length+snapshot.heldProducts.length,checksums:Object.fromEntries([...assembled.assets].map(([p,b])=>[p,sha256(b)])),routes:assembled.routes,retention:null};
    const manifestBytes=Buffer.from(`${JSON.stringify(manifest,null,2)}\n`);
    for(const [name,value]of Object.entries({'asset-manifest.json':manifestBytes,'catalog.snapshot.json':`${JSON.stringify(snapshot)}\n`,
      'release-context.json':`${JSON.stringify(context)}\n`,'release-identity.json':JSON.stringify(createReleaseIdentity(manifestBytes)),
      'site-identity.json':siteIdentityBytes('preview'),'feed-plan.json':JSON.stringify(createStaticFeedPlan(snapshot,sha256(`${JSON.stringify(snapshot)}\n`)))}))await put(path.join(repo,'build/stupid-gifts',name),value);
    for(const [name,value]of assembled.assets)await put(path.join(repo,'static-site/out',name.slice(1)),value);
  };
  const dependencies={repository:repo,fetch,resolveToken:async ref=>`TEST_ONLY_${ref.service.split('.').at(-1)}`,now:()=>clock,publication:{fetch,command,now:()=>new Date(clock)}};
  const options={configPath,configSha256,workspace};
  return{sql,config,options,dependencies,mode,calls,index,workspaceOptions,now:()=>clock,advance(ms){clock=new Date(Date.parse(clock)+ms).toISOString();},
    loseWrite(){dropWrite=true;},tamper(fn){queryTamper=fn;},
    async run(command,approval){route=fetch;return runCloudflareWeekly({...options,command,...(approval?{approval}:{})},dependencies);},
    async approve(){
      const row={...sql.prepare('SELECT * FROM products').get()};const op=sql.prepare("SELECT * FROM catalog_maintenance_operations WHERE run_id='test-weekly' AND json_array_length(changes_json)>0 ORDER BY next_epoch DESC LIMIT 1").get();
      const approval={schemaVersion:1,runId:config.runId,catalogRevision:config.catalogRevision,changes:[{publicId:row.public_id,operationId:op.operation_id,
        inputSha256:op.input_sha256,productSha256:sha256(canonicalJson(row)),displaySha256:sha256(row.public_display_json??'null')}]};
      const file=path.join(directory,'explicit-reviewed-postphase.json');await put(file,approval);return{path:file,sha256:sha256(await fs.readFile(file))};
    }};
}

test('preflight reads exact schema/scope without workspace writes or merchant/model credentials',async t=>{
  const f=await setup(t);const refs=[];const before=f.sql.prepare('SELECT total_changes() n').get().n;
  const result=await runCloudflareWeekly({...f.options,command:'preflight'},{...f.dependencies,async resolveToken(ref){refs.push(ref.service);return f.dependencies.resolveToken(ref);}});
  assert.equal(result.executionAvailable,false);assert.equal(result.status,'checks_passed_execution_unavailable');
  assert.deepEqual(refs,[f.config.credentials.cloudflare.service]);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
  await assert.rejects(fs.stat(f.options.workspace),{code:'ENOENT'});assert.equal(f.calls.search+f.calls.embedding+f.calls.activate,0);
});
test('actual weekly phases defer for post-phase review, then compose owned delivery/build/activation/readback/exact finalization',async t=>{
  const f=await setup(t);const old=process.env.CATALOG_DISCOVERY_THEMES;process.env.CATALOG_DISCOVERY_THEMES='MUST_NOT_RUN';
  t.after(()=>{if(old===undefined)delete process.env.CATALOG_DISCOVERY_THEMES;else process.env.CATALOG_DISCOVERY_THEMES=old;});
  const start=await f.run('start');assert.equal(start.reason,'awaiting_reviewed_approval');assert.equal(f.sql.prepare('SELECT status FROM catalog_runs').get().status,'running');
  assert.equal(process.env.CATALOG_DISCOVERY_THEMES,'MUST_NOT_RUN');assert.equal(f.calls.search,6);assert.equal(f.calls.embedding,1);
  assert.ok(f.sql.prepare('SELECT public_display_json FROM products').get().public_display_json);
  const providerCounts={getItems:f.calls.getItems,search:f.calls.search,chat:f.calls.chat,embedding:f.calls.embedding};
  const result=await f.run('resume',await f.approve());assert.equal(result.state,'finalized',JSON.stringify(result));
  assert.equal(f.sql.prepare('SELECT status FROM catalog_runs').get().status,'completed');assert.equal(f.calls.activate,1);assert.equal(f.calls.build,1);
  assert.deepEqual(Object.fromEntries(Object.keys(providerCounts).map(k=>[k,f.calls[k]])),providerCounts);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
  assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests').get().state,'resolved');assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,1);
  assert.equal(nativeHash([...f.index.values()][0].values),nativeHash(values.map(Math.fround)));
  assert.equal((await f.run('resume')).state,'finalized');assert.equal(f.calls.activate,1);
});
test('lost D1 response and uncertain publication resume without paid phases, counter reset or second activation',async t=>{
  const f=await setup(t);f.loseWrite();assert.equal((await f.run('start')).reason,'awaiting_reviewed_approval');
  f.mode.identityFailure=true;f.mode.activationLost=true;const first=await f.run('resume',await f.approve());assert.equal(first.state,'pending');
  assert.equal(f.sql.prepare('SELECT status FROM catalog_runs').get().status,'running');assert.equal(f.calls.activate,1);
  const before={...f.calls};const usage=(await readRunWorkspace(f.workspaceOptions)).budget;assert.equal(usage.unconfirmedRequests,1);
  delete f.mode.identityFailure;const result=await f.run('resume');assert.equal(result.state,'finalized',JSON.stringify(result));
  assert.equal(f.calls.activate,1);assert.equal(f.calls.search,before.search);assert.equal(f.calls.embedding,before.embedding);
  assert.ok(result.budget.httpRequests>usage.httpRequests);assert.equal(result.budget.unconfirmedRequests,1);assert.ok(result.budget.knownRowsWritten>=usage.knownRowsWritten);
});
test('uploaded-stage restart preserves sealed snapshot and fixed publication intent bytes before activation',async t=>{
  const f=await setup(t);await f.run('start');f.mode.stopAfterUpload=true;
  assert.equal((await f.run('resume',await f.approve())).state,'pending');assert.equal(f.calls.activate,0);
  const before=await readRunWorkspace(f.workspaceOptions);assert.equal(before.checkpoint.checkpoint.control.publication.stage,'uploaded');
  const counts={...f.calls};assert.equal((await f.run('resume')).state,'finalized');assert.equal(f.calls.activate,1);
  for(const key of ['getItems','search','embedding','upload','build'])assert.equal(f.calls[key],counts[key]);
});
for(const boundary of ['loseFinishReadback','loseFinalRelease'])test(`finalization restart after ${boundary} reuses exact finish receipt without paid/publication replay`,async t=>{
  const f=await setup(t);await f.run('start');f.mode[boundary]=true;
  await assert.rejects(f.run('resume',await f.approve()),/catalog_d1_result_unknown/);
  assert.equal(f.sql.prepare('SELECT status FROM catalog_runs').get().status,'completed');assert.equal(f.calls.finish,1);
  const before={...f.calls};const checkpoint=(await readRunWorkspace(f.workspaceOptions)).checkpoint.checkpoint;
  assert.equal(checkpoint.phase,'published');assert.ok(checkpoint.owner);
  if(boundary==='loseFinalRelease')assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
  assert.equal((await f.run('resume')).state,'finalized');assert.equal(f.calls.finish,1);
  for(const key of ['getItems','search','embedding','upsert','activate','upload','build'])assert.equal(f.calls[key],before[key]);
});
test('ambiguous in-phase checkpoint stops without keys/network; status is read-only and candidate-free',async t=>{
  const f=await setup(t);await f.run('start');const w=await openRunWorkspace(f.workspaceOptions);const current=await w.readCheckpoint();
  await w.writeCheckpoint(current.sha256,{...current.checkpoint,phase:'phases_running'});await w.close();const before={...f.calls};
  const result=await f.run('resume');assert.equal(result.state,'attention');assert.deepEqual(f.calls,before);
  const status=await f.run('status');assert.equal(status.checkpoint.checkpoint.phase,'phases_running');assert.deepEqual(f.calls,before);
  assert.doesNotMatch(JSON.stringify(status),/lobster|example.invalid\/lobster|TEST_ONLY|editorialWriteup/);assert.ok(WEEKLY_RESUME_STATES.phases_running);
});
test('lost activation-fence response remains reconcilable after receipt expiry without any new activation',async t=>{
  const f=await setup(t);await f.run('start');f.mode.loseActivationFenceResponse=true;
  assert.equal((await f.run('resume',await f.approve())).state,'pending');assert.equal(f.calls.activate,0);
  const before=await readRunWorkspace(f.workspaceOptions);assert.equal(before.checkpoint.checkpoint.control.publication.stage,'activating');
  assert.equal(before.checkpoint.checkpoint.control.publication.permit,null);
  f.advance(2*86400000);const result=await f.run('resume');assert.equal(result.state,'pending');assert.equal(f.calls.activate,0);
  const after=await readRunWorkspace(f.workspaceOptions);assert.ok(after.expired.length);assert.ok(after.checkpoint.checkpoint.control.publication.permit);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'activating');
  assert.equal(f.sql.prepare('SELECT status FROM catalog_runs').get().status,'running');
});
test('superseded facts fail the real phase without publication; existing run refuses before owner claim',async t=>{
  const f=await setup(t);f.mode.superseded=true;const result=await f.run('start');assert.equal(result.state,'attention');assert.equal(result.phase,'phase_failed');
  assert.equal(f.calls.activate,0);assert.equal(f.sql.prepare('SELECT status FROM catalog_runs').get().status,'partial');
  const g=await setup(t);g.sql.prepare("INSERT INTO catalog_runs(id,status,mode,dry_run,started_at,source_record_json) VALUES(?,'running','weekly',0,?,'{}')").run(g.config.runId,NOW);
  await assert.rejects(g.run('start'),/weekly_run_exists/);assert.equal(g.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');assert.equal(g.calls.search,0);
});
test('finalization mismatch does not claim finalized; approved configuration has no ambient defaults',async t=>{
  const f=await setup(t);await f.run('start');f.tamper((q,rows)=>{if(q.sql.includes('SELECT r.*,t.start_json,t.finish_json')&&rows[0]?.status==='completed')rows[0].status='partial';});
  await assert.rejects(f.run('resume',await f.approve()),/weekly_finalization_mismatch/);
  assert.notEqual((await readRunWorkspace(f.workspaceOptions)).checkpoint.checkpoint.phase,'finalized');assert.equal(f.calls.activate,1);
  for(const patch of [{credentials:undefined},{backfillLimit:26},{limits:{requests:10001,statements:4000}},{extra:'ambient'}])
    assert.throws(()=>validateCloudflareWeeklyConfig({...f.config,...patch}));
});
test('explicit deferred helper alone leaves running on pending/unknown publication; absent option retains old argument/terminal behavior',async()=>{
  for(const deferred of [false,true]){
    let finished=0;let args;
    const telemetryStore={async loadCatalogRun(){return null;},async startCatalogRun(){},async insertCatalogRunItems(){},async finishCatalogRun(){},async loadRecentCatalogRuns(){}};
    const run=()=>runCatalogWithBackend({dryRun:false},{runId:'test-defer',maintenanceStore:{},telemetryStore,deferPublicationFinalization:deferred,
      execute:async()=>({updated:1}),async publish(input){args=input;return{status:'pending'};},async finalizeRun(id,input){finished++;return{run:{id,status:input.status}};}});
    if(deferred){assert.equal((await run()).deferred,true);assert.equal(finished,0);assert.ok(args.finalization);}
    else{await assert.rejects(run(),/not independently verified/);assert.equal(finished,1);assert.equal(args.finalization,undefined);}
  }
  let finishes=0;
  await assert.rejects(runCatalogWithBackend({dryRun:false},{runId:'test-unknown',maintenanceStore:{},deferPublicationFinalization:true,
    telemetryStore:{async loadCatalogRun(){return null;},async startCatalogRun(){},async insertCatalogRunItems(){},async finishCatalogRun(){},async loadRecentCatalogRuns(){}},
    execute:async()=>({updated:1}),async publish(){throw new Error('TEST ONLY unknown publication');},async finalizeRun(){finishes++;}}),/unknown publication/);
  assert.equal(finishes,0);
});
test('process-local phase guard prevents scoped environment races even before a second workspace opens',async t=>{
  const f=await setup(t);let release,entered;const ready=new Promise(r=>{entered=r;});const gate=new Promise(r=>{release=r;});
  const running=runCloudflareWeekly({...f.options,command:'start'},{...f.dependencies,async resolveToken(ref){
    if(ref.service.endsWith('.cloudflare')){entered();await gate;}return f.dependencies.resolveToken(ref);}});
  await ready;await assert.rejects(f.run('start'),/weekly_process_busy/);release();
  assert.equal((await running).reason,'awaiting_reviewed_approval');
});
test('SDK cache is key-bound; unchanged keys reuse and absent key cannot use cached credentials',()=>{
  const old=process.env.OPENAI_API_KEY;
  try{process.env.OPENAI_API_KEY='TEST_ONLY_FIRST';const a=getOpenAIClient();assert.equal(getOpenAIClient(),a);
    process.env.OPENAI_API_KEY='TEST_ONLY_SECOND';const b=getOpenAIClient();assert.notEqual(b,a);assert.equal(getOpenAIClient(),b);
    delete process.env.OPENAI_API_KEY;assert.equal(getOpenAIClient(),null);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('CLI summary exposes coarse waiting/publication identity, never private owner/control or raw errors',()=>{
  assert.deepEqual(weeklyCommandSummary({state:'pending',reason:'awaiting_reviewed_approval',errorCode:'mutation_unknown',releaseId:'test-release',
    receiptSha256:'a'.repeat(64),owner:{token:'PRIVATE'},control:{candidate:'PRIVATE'},error:'raw provider body'}),
  {state:'pending',reason:'awaiting_reviewed_approval',errorCode:'mutation_unknown',releaseId:'test-release',receiptSha256:'a'.repeat(64)});
  assert.deepEqual(weeklyCommandSummary({state:'attention',reason:'not a coarse reason: PRIVATE'}),{state:'attention'});
});
