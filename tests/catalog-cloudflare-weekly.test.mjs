import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { runCloudflareWeekly, validateCloudflareWeeklyConfig, weeklyCommandSummary, WEEKLY_RESUME_STATES, putOrdered, readOrdered } from '../scripts/catalog/run-cloudflare-weekly.ts';
import { openRunWorkspace, readRunWorkspace, WORKSPACE_BLOB_LIMITS } from '../scripts/catalog/run-workspace.ts';
import { getOpenAIClient, runCatalogWithBackend } from '../scripts/ops/prefetch-catalog.mjs';
import amazonCreators from '../lib/amazon-creators.js';
import { createD1CatalogMaintenanceStore } from '../scripts/catalog/maintenance-d1.ts';
import { claimMutationOwnership, readMutationOwner, releaseMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { createProjectionPacket, projectionQueries } from '../lib/catalog/d1.ts';
import { enqueueBuildRequest, claimBuildRequest, beginBuildActivation, resolveBuildActivation } from '../lib/catalog/build-requests.ts';
import { enqueuePublication, claimPublication, recordPublicationDispatch, completePublication } from '../lib/catalog/publication.ts';
import { createSealedSnapshotEnvelope } from '../scripts/catalog/export-d1-snapshot.ts';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { editorialSourceHash } from '../scripts/ops/catalog-editorial-core.mjs';
import { createReleaseIdentity } from '../scripts/staging/release-identity.mts';
import { siteIdentityBytes } from '../scripts/staging/build.mts';
import { assembleReleaseAssets, readPriorRelease } from '../scripts/staging/retention.mts';
import { createStaticFeedPlan } from '../workers/site/feed.ts';
import { createBrowseRelease } from '../static-site/lib/browse.ts';
import { directoryPages, directoryPath } from '../static-site/lib/directory.ts';
import { createOgRelease } from '../static-site/lib/og.ts';
import { siteIdentityFor } from '../static-site/lib/site-identity.ts';
import { guides } from '../static-site/lib/guides.ts';
import { nativeHash } from '../scripts/catalog/vector-outbox.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { withCatalogCadence } from '../scripts/ops/catalog-daily.mjs';
import { accountedPublicationReadFetch } from '../scripts/catalog/publication-read-fetch.ts';

// Real composed stores/fence/evidence/driver/publisher/workspace over SQLite.
// Only external Amazon/OpenAI/CF and Next compilation are mocked. Real package
// verification, upload intent, activation CAS, independent identity/native proof
// and exact final telemetry remain in the call path. No network or live rights.
// Whole-driver cap refusals are not permanent-native successor acceptance. Model
// HTTP and merchant method calls are counted separately, never called CF-ledger
// coverage; this command seam also mocks the protected Wrangler asset upload.
const NOW='2026-10-20T12:00:00.123Z',OLD='2026-07-01T00:00:00.000Z';
const ID='B000000001',UUID='00000000-0000-4000-8000-000000000001';
const VERSION='00000000-0000-4000-8000-000000000002',DEPLOY='00000000-0000-4000-8000-000000000003';
const PRIOR_VERSION='00000000-0000-4000-8000-000000000004';
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
const safeCatalogPayload=await fs.readFile(new URL('../static-site/public/safe/catalog.json',import.meta.url));
let route;globalThis.fetch=(...args)=>{if(!route)throw new Error('Live network forbidden');return route(...args);};
test.after(()=>{globalThis.fetch=original.fetch;amazonCreators.getItems=original.getItems;amazonCreators.searchItems=original.searchItems;});
test.beforeEach(t=>{
  // Skip ONLY mock provider pacing; retain proof/abort/lease/accounting timers.
  const timer=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(callback,ms,...args)=>timer(callback,[1100,1200,2000].includes(ms)?0:ms,...args));
});
async function put(file,value){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,
  typeof value==='string'||value instanceof Uint8Array?value:`${JSON.stringify(value)}\n`,{mode:0o600});}
async function fullCheckpoint(options){const workspace=await openRunWorkspace(options);
  try{return await workspace.readCheckpoint();}finally{await workspace.close();}}
function sealedFixture(snapshot,context,prior=null){
  const pages=['/','/gifts','/gifts/page/1','/random-gift','/gift-guides','/howie','/preview/presentation',...guides.map(g=>`/gift-guides/${g.slug}`),
    ...directoryPages(snapshot).map(page=>directoryPath(page.page)),...snapshot.products.map(p=>`/gifts/${p.slug}`)];
  const assets=new Map(pages.map(p=>[p==='/'?'/index.html':`${p}.html`,Buffer.from('Owned fixture HTML')]));
  for(const name of ['/safe/catalog.html','/safe/product.html','/safe/howie.html','/safe/presentation.html','/safe/asset.txt'])assets.set(name,Buffer.from('Owned unavailable'));
  assets.set('/safe/catalog.json',safeCatalogPayload);
  for(const suffix of ['.txt','/__next._full.txt','/__next._tree.txt','/__next.safe.product.__PAGE__.txt'])assets.set(`/safe/product${suffix}`,Buffer.from('Owned safe RSC'));
  for(const shard of createBrowseRelease(snapshot).shards)assets.set(shard.path,Buffer.from(JSON.stringify(shard.payload)));
  for(const name of createOgRelease(snapshot,siteIdentityFor('preview')).byPath.keys())assets.set(name,Buffer.from('Owned PNG fixture'));
  const assembled=assembleReleaseAssets(snapshot,assets,context,prior);const {retainedManifestSha256,...rest}=context;void retainedManifestSha256;
  const manifest={...rest,dataKind:'catalog',siteIdentitySha256:sha256(siteIdentityBytes('preview')),nextExpiry:snapshot.products.map(p=>p.eligibleUntil).sort()[0]||null,
    productCount:snapshot.products.length,slugCount:snapshot.products.length+snapshot.heldProducts.length,checksums:Object.fromEntries([...assembled.assets].map(([p,b])=>[p,sha256(b)])),routes:assembled.routes,retention:assembled.retention};
  const manifestBytes=Buffer.from(`${JSON.stringify(manifest,null,2)}\n`);
  return{manifest,assets:assembled.assets,files:{'asset-manifest.json':manifestBytes,'catalog.snapshot.json':`${JSON.stringify(snapshot)}\n`,
    'release-context.json':`${JSON.stringify(context)}\n`,'release-identity.json':JSON.stringify(createReleaseIdentity(manifestBytes)),
    'site-identity.json':siteIdentityBytes('preview'),'feed-plan.json':JSON.stringify(createStaticFeedPlan(snapshot,sha256(`${JSON.stringify(snapshot)}\n`)))}};
}
async function setup(t,{noPrior=false,at=NOW,permanent=0,held=0,discovered=0,realTransport=false}={}){
  const NOW=at;
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
  const asin=n=>`B${String(n).padStart(9,'0')}`,publicId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const rawItem=product=>({asin:product.id,itemInfo:{title:{displayValue:product.title},features:{displayValues:['Novelty brass lobster desk bell','Synthetic fixture '+product.id]}},
    images:{primary:{large:{url:product.imageUrl}}},detailPageURL:product.affiliateUrl,
    offersV2:{listings:[{availability:{type:'IN_STOCK'},price:{money:{amount:product.price,currency:'USD'}}}]},
    customerReviews:{starRating:{value:product.rating},count:product.reviewCount}});
  const observedProduct=n=>{const product={...structuredClone(p),id:asin(n),title:`${String.fromCharCode(65+Math.floor(n/26))}${String.fromCharCode(65+n%26)} test-only brass fixture`,
    affiliateUrl:`https://www.amazon.com/dp/${asin(n)}?tag=fixture-20`,sourceFacts:{fixture:n,material:'brass',shape:'lobster'}};
    return realTransport?{...product,...amazonCreators.mapItem(rawItem(product))}:product;};
  const grants=product=>Object.fromEntries(Object.entries({title:product.title,description:product.wittyDescription,imageUrl:product.imageUrl,
    affiliateUrl:product.affiliateUrl,punnyTitle:product.punnyTitle,wittyDescription:product.wittyDescription,
    editorialWriteup:product.editorialWriteup,humorTags:JSON.stringify(product.humorTags)})
    .map(([field,value])=>[field,{basis:'owned',reference:'test-only exact independent clearance',value}]));
  const discoveryNames=['Amethyst zephyr','Borealis quince','Crimson tundra','Dahlia compass','Emerald quill','Fuchsia gyroscope','Garnet prism',
    'Hyacinth sundial','Indigo metronome','Jade kaleidoscope','Kestrel abacus','Lilac astrolabe','Magenta terrarium','Nectar pendulum',
    'Ochre sextant','Periwinkle barometer','Quartz telescope','Russet ocarina','Saffron harmonica','Teal periscope'];
  const discoveries=Array.from({length:discovered},(_,i)=>({...observedProduct(5000+i),title:`Novelty ${discoveryNames[i]}`,humorTags:[`fixture-${i}`]}));
  if(permanent){
    // A pre-existing private full catalog, not 2,359 fresh supplier fetches or
    // native writes. The real current driver will update only its reserved ten.
    sql.prepare('DELETE FROM catalog_maintenance_products WHERE product_id=?').run(ID);
    sql.prepare('DELETE FROM products WHERE id=?').run(ID);
    for(let n=1;n<=permanent;n++){
      const copy=observedProduct(n),base={id:copy.id,publicId:publicId(n),slug:`cleared-object-${n}`,title:`Independently cleared object ${n}`,
        description:`Independently cleared object ${n}`,imageUrl:'/images/gift-placeholder.svg',affiliateUrl:copy.affiliateUrl,
        source:'amazon',currency:'USD',price:0,isActive:true,qualityScore:.85,eligibleUntil:null,indexable:false};
      const baseRights=Object.fromEntries(['title','description','imageUrl','affiliateUrl'].map(field=>[field,{basis:'owned',reference:'test-only exact permanent clearance',value:base[field]}]));
      sql.prepare(`INSERT INTO products(id,public_id,slug,source,title,description,tags,currency,quality_score,is_active,editorial_status,
        source_facts_hash,catalog_revision,public_display_json,rights_json,source_record_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(base.id,base.publicId,base.slug,base.source,base.title,base.description,'',base.currency,.85,1,'pending',editorialSourceHash(copy),'prior-r',
          JSON.stringify(base),JSON.stringify(baseRights),JSON.stringify({...Object.fromEntries(Object.entries(copy)
            .map(([key,value])=>[key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`),value])),public_id:base.publicId,slug:base.slug}));
    }
    for(let n=3000;n<3000+held;n++)sql.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,
      catalog_revision,rights_json,source_record_json) VALUES(?,?,?,?,?,'USD',.4,0,'pending','prior-r','{}',?)`)
      .run(asin(n),publicId(n),`held-${n}`,'amazon',`Funny dormant mariner compass ${n}`,JSON.stringify({id:asin(n),public_id:publicId(n),slug:`held-${n}`,title:`Funny dormant mariner compass ${n}`,
        source:'amazon',affiliate_url:`https://www.amazon.com/dp/${asin(n)}?tag=fixture-20`,humor_tags:[]}));
  }
  await releaseMutationOwnership(local,await readMutationOwner(local,scope));
  clock=NOW;
  const baseline=sql.prepare('SELECT * FROM products ORDER BY public_id').all();
  const previous={schemaVersion:1,dataKind:'catalog',catalogRevision:'prior-r',generatedAt:NOW,
    products:baseline.filter(r=>r.public_display_json).map(r=>JSON.parse(r.public_display_json)),heldProducts:baseline.filter(r=>!r.public_display_json).map(r=>({id:r.id,publicId:r.public_id,
      slug:r.slug,path:`/gifts/${r.slug}`,title:'Gift currently unavailable',description:'This gift is not currently available in the curated catalog. Browse other gifts instead.',reason:'editorial_hold'})),slugHistory:[]};
  const packet=await createProjectionPacket(previous,Object.fromEntries(baseline.map(r=>[r.public_id,r.source_facts_hash])),'b'.repeat(64),new Date(NOW));
  sql.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)').run('prior-r',NOW,'b'.repeat(64),'reconciled');
  for(const q of projectionQueries(packet))sql.prepare(q.sql).run(...q.params);
  // Explicit owned already-deployed catalog fixture, not an automatic first
  // Worker deployment. Its bytes, D1 receipt and provider identity agree.
  const priorContext={schemaVersion:1,sourceMode:'preview',releaseId:'prior-release',codeSha,catalogRevision:previous.catalogRevision,
    catalogSnapshotSha256:packet.receipt.snapshot_sha256,generatedAt:NOW,vectorSyncWatermark:0,priorReleaseId:null,retainedManifestSha256:null};
  const priorPackage=sealedFixture(previous,priorContext);const priorDirectory=path.join(directory,'verified-prior');
  for(const [name,value]of Object.entries(priorPackage.files))await put(path.join(priorDirectory,name),value);
  for(const [name,value]of priorPackage.assets)await put(path.join(priorDirectory,'assets',name.slice(1)),value);
  const priorManifestSha256=sha256(priorPackage.files['asset-manifest.json']);
  const priorIntent={releaseId:'prior-release',codeSha,catalogRevision:previous.catalogRevision,catalogSnapshotSha256:packet.receipt.snapshot_sha256,
    manifestSha256:priorManifestSha256,vectorSyncWatermark:0,priorReleaseId:null,nextExpiry:null};
  let priorReceipt;
  if(!noPrior){
    // Separate synthetic operator bootstrap through the real publication/CAS
    // APIs; the weekly executor must never perform this initial deployment.
    const priorOwner=await claimMutationOwnership(local,scope,{phase:'freezing',ownerReference:'test-only-operator-bootstrap',operationKey:'f'.repeat(64)});
    const {requestId}=await enqueueBuildRequest(local,{schemaVersion:1,environment:scope.environment,sourceRevision:previous.catalogRevision,
      sourceDigest:packet.receipt.snapshot_sha256,codeSha,priorReleaseId:null,capturedAt:NOW,cutoff:new Date(Date.parse(NOW)+3600000).toISOString()});
    const build=await claimBuildRequest(local,requestId,'test-only-operator-bootstrap',new Date(NOW));
    await enqueuePublication(local,previous,priorIntent,new Date(NOW));const publication=await claimPublication(local,previous,priorIntent.releaseId,new Date(NOW));
    await recordPublicationDispatch(local,previous,publication,`version:${PRIOR_VERSION}`,new Date(NOW));
    const permit=await beginBuildActivation(local,build,previous,publication,PRIOR_VERSION,
      async()=>({environment:scope.environment,settled:true,active:null}),new Date(NOW),priorOwner);
    await completePublication(local,previous,priorIntent.releaseId,publication.token,async()=>priorIntent,()=>new Date(NOW),permit.mutationOwner);
    await resolveBuildActivation(local,permit,async()=>({environment:scope.environment,settled:true,active:{releaseId:priorIntent.releaseId,codeSha,
      catalogRevision:previous.catalogRevision,catalogSnapshotSha256:packet.receipt.snapshot_sha256,manifestSha256:priorManifestSha256,versionReference:PRIOR_VERSION}}));
    priorReceipt={...sql.prepare('SELECT * FROM publication_receipts WHERE release_id=?').get(priorIntent.releaseId)};
  }
  const context={envelopeSha256:sha256(`${JSON.stringify(createSealedSnapshotEnvelope(previous))}\n`),snapshotSha256:packet.receipt.snapshot_sha256,
    projectionSha256:packet.receipt.projection_sha256,sourceExportSha256:'b'.repeat(64),vectorSyncWatermark:0,publicationReceiptWatermark:noPrior?0:1,
    priorPublication:noPrior?null:{releaseId:priorReceipt.release_id,receiptSha256:sha256(canonicalJson(priorReceipt))},cutoff:new Date(Date.parse(NOW)+3600000).toISOString()};
  const inputs={};for(const [name,value]of Object.entries({previous,context,rights:{rightsById:permanent
    ?Object.fromEntries([...Array.from({length:10},(_,i)=>observedProduct(i+1)),...discoveries].map(product=>[product.id,{...grants(product),
      ...(discoveries.some(p=>p.id===product.id)?{persistent:Object.fromEntries(Object.entries({title:product.title,description:product.wittyDescription,
        imageUrl:'/images/gift-placeholder.svg',affiliateUrl:product.affiliateUrl}).map(([field,value])=>[field,{basis:'owned',reference:'test-only independently cleared discovery base',value}]))}:{})}])):{[ID]:rights},reviewedDeleteReference:'test-only/delete'}})){
    const file=path.join(directory,`${name}.json`);await put(file,value);inputs[name]={path:file,sha256:sha256(await fs.readFile(file)),observedAt:NOW};}
  const ref=name=>({service:`goose.gifts.test.${name}`,account:'fixture'});
  const config={schemaVersion:1,runId:'test-weekly',catalogRevision:'weekly-r',codeSha,environment:scope.environment,accountId:'a'.repeat(32),
    database:{id:UUID,name:'test-weekly-db'},vectorIndex:{name:scope.indexName,dimensions:1536,metric:'cosine'},catalog:{associateTag:'fixture-20',marketplace:'www.amazon.com'},
    credentials:{cloudflare:ref('cloudflare'),amazonId:ref('amazon-id'),amazonSecret:ref('amazon-secret'),amazonVersion:'2.1',openai:ref('openai'),stagingAuthSecret:ref('staging')},
    limits:{requests:1000,statements:4000},backfillLimit:1,inputs,
    retention:{reviewReference:'test-only/owned-retention',rules:Object.fromEntries(['amazon-observation','embedding-response','phase','publication','checkpoint']
      .map(kind=>[kind,{maxAgeMs:86400000,notAfter:new Date(Date.parse(NOW)+86400000).toISOString()}]))},
    publication:{schemaVersion:1,environment:scope.environment,accountId:'a'.repeat(32),workerName:'test-weekly-worker',database:{id:UUID,name:'test-weekly-db'},indexName:scope.indexName,
      codeSha,sourceMode:'preview',sourceRoot:repo,releaseId:'test-release',identityOrigin:'https://test-weekly-worker.example.invalid',compatibilityDate:'2026-10-20',
      prior:noPrior?null:{directory:priorDirectory,manifestSha256:priorManifestSha256,releaseId:'prior-release',versionReference:PRIOR_VERSION}}};
  const configPath=path.join(directory,'config.json');await put(configPath,config);const configSha256=sha256(await fs.readFile(configPath));
  const workspace=path.join(directory,'runs');const workspaceOptions={directory:workspace,repository:repo,mode:'resume',runId:config.runId,configSha256,codeSha,
    scope:{...scope,accountId:config.accountId,databaseId:UUID,databaseName:config.database.name,workerName:config.publication.workerName},retention:config.retention,
    budgetCaps:{httpRequests:config.limits.requests,sqlStatements:config.limits.statements},now:()=>clock};
  const calls={getItems:0,search:0,chat:0,embedding:0,http:0,d1:0,sql:0,modelHttp:0,merchantAuthHttp:0,merchantApiHttp:0,merchantRetries:0,
    upsert:0,activate:0,upload:0,build:0,finish:0};const index=new Map();let mutation,upload,manifest;
  let active=noPrior?false:{versions:[{version_id:PRIOR_VERSION,percentage:100}],annotations:{'workers/message':'verified-operator-prior'}};
  const mode={};let dropWrite=false;let queryTamper;let lostReleaseReadbacks=0,versionReads=0;
  amazonCreators.getItems=async(...args)=>{calls.getItems++;assert.equal(process.env.AMAZON_ASSOCIATE_TAG,'fixture-20');assert.equal(process.env.POSTGRES_URL,undefined);
    assert.equal(process.env.CATALOG_DISCOVERY_THEMES,undefined);if(realTransport)return original.getItems(...args);
    const [ids]=args;return permanent?ids.map(id=>({...observedProduct(Number(id.slice(1))),
      title:'Supplier changed title does not replace permanent clearance',availabilityStatus:'OUT_OF_STOCK'})):[structuredClone(p)];};
  const discoveryResponses=discovered?[[...discoveries.slice(0,9),{...observedProduct(3000),title:'Funny dormant mariner compass 3000'}],discoveries.slice(9,19),
    [discoveries[19],{...observedProduct(6000),title:'Funny dormant mariner compass 3000'}]]:[];
  amazonCreators.searchItems=async(...args)=>{calls.search++;if(realTransport)return original.searchItems(...args);
    if(discovered)return structuredClone(discoveryResponses[calls.search-1]||[]);return mode.superseded
    ?[structuredClone(calls.search>1?{...p,title:'Changed contradictory listing',sourceFacts:{material:'plastic'}}:p)]:[];};
  const response=result=>Response.json({success:true,result});
  const vectorResponse=rows=>new Response(`{"success":true,"result":[${rows.map(v=>`{"id":${JSON.stringify(v.id)},"values":[${v.values.map(n=>Object.is(n,-0)?'-0':n).join(',')}],"metadata":${JSON.stringify(v.metadata)}}`).join(',')}]}`);
  const fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url||String(input));
    if(url.origin==='https://creatorsapi.auth.us-east-1.amazoncognito.com'){
      assert.equal(realTransport,true);assert.equal(init.method,'POST');calls.merchantAuthHttp++;
      return Response.json({access_token:'SYNTHETIC_TOKEN_'+calls.merchantAuthHttp,expires_in:3600});
    }
    if(url.origin==='https://creatorsapi.amazon'){
      assert.equal(realTransport,true);assert.equal(init.method,'POST');calls.merchantApiHttp++;
      const body=JSON.parse(init.body);assert.equal(body.partnerTag,'fixture-20');
      if(mode.merchantUnauthorized){delete mode.merchantUnauthorized;calls.merchantRetries++;return Response.json({errors:[{code:'Unauthorized'}]},{status:401});}
      if(url.pathname.endsWith('/getItems'))return Response.json({itemsResult:{items:body.itemIds.map(id=>rawItem(observedProduct(Number(id.slice(1)))))}});
      assert.ok(url.pathname.endsWith('/searchItems'));return Response.json({searchResult:{items:(discoveryResponses[calls.search-1]||[]).map(rawItem)}});
    }
    if(url.origin==='https://api.openai.com'){
      calls.modelHttp++;
      const body=JSON.parse(init.body);assert.equal(init.headers.get?.('authorization')||init.headers.Authorization,'Bearer TEST_ONLY_openai');
      assert.ok(['gpt-4o-mini','text-embedding-3-small'].includes(body.model));
      if(url.pathname.endsWith('/embeddings')){calls.embedding++;return new Response(`{"model":"text-embedding-3-small","usage":{"prompt_tokens":8,"total_tokens":8},"data":[${body.input.map((_input,index)=>`{"index":${index},"embedding":[${values.map(n=>Object.is(n,-0)?'-0':n).join(',')}]}`).join(',')}]}`,{headers:{'content-type':'application/json'}});}
      calls.chat++;const prompt=body.messages.at(-1).content,items=JSON.parse(prompt.slice(prompt.lastIndexOf('\n[')+1));
      return Response.json({choices:[{message:{content:JSON.stringify({products:items.map(item=>{
        const product=discoveries.find(p=>p.id===item.id)||p;
        return prompt.includes('Drafts:')?{id:item.id,approved:true,qualityScore:.95,reasons:[],correctedEditorial:null}
          :{id:item.id,punnyTitle:product.punnyTitle,wittyDescription:product.wittyDescription,humorTags:product.humorTags,qualityScore:product.qualityScore,isActive:true,editorialWriteup:product.editorialWriteup};
      })})},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
    }
    calls.http++;
    if(url.origin===config.publication.identityOrigin){const isTarget=active?.versions[0].version_id===VERSION;if(mode.identityFailure&&isTarget)return new Response('',{status:401});
      assert.equal(init.headers.Authorization,`Basic ${Buffer.from('staging:TEST_ONLY_staging').toString('base64')}`);
      return Response.json(createReleaseIdentity(isTarget?Buffer.from(`${JSON.stringify(manifest,null,2)}\n`):priorPackage.files['asset-manifest.json']));}
    assert.equal(url.origin,'https://api.cloudflare.com');
    if(url.pathname.endsWith(`/d1/database/${UUID}`))return response({uuid:UUID,name:config.database.name,read_replication:{mode:'disabled'}});
    if(url.pathname.endsWith('/query')){
      const queries=JSON.parse(init.body).batch;calls.d1++;calls.sql+=queries.length;const result=[];sql.exec('BEGIN');
      try{for(const q of queries){const before=sql.prepare('SELECT total_changes() n').get().n;const rows=sql.prepare(q.sql).all(...q.params).map(r=>({...r}));
        queryTamper?.(q,rows);const writes=sql.prepare('SELECT total_changes() n').get().n-before;
        const exceeded=mode.reportedUsageExceeded&&q.sql.startsWith('SELECT r.*,t.start_json,t.finish_json');if(exceeded)mode.reportedUsageExceeded=false;
        result.push({success:true,results:rows,meta:{served_by_primary:true,rows_read:exceeded?1_000_001:rows.length,rows_written:writes,changes:writes}});
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
        {name:'SEMANTIC_SEARCH_DAILY_REQUEST_CAP',type:'plain_text',text:'50'},{name:'SEMANTIC_SEARCH_DAILY_TOKEN_CAP',type:'plain_text',text:'32768'},
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
    const sealed=sealedFixture(snapshot,context,await readPriorRelease(context,config.publication.prior?.directory));manifest=sealed.manifest;
    for(const [name,value]of Object.entries(sealed.files))await put(path.join(repo,'build/stupid-gifts',name),value);
    for(const [name,value]of sealed.assets)await put(path.join(repo,'static-site/out',name.slice(1)),value);
  };
  const dependencies={repository:repo,fetch,resolveToken:async ref=>`TEST_ONLY_${ref.service.split('.').at(-1)}`,now:()=>clock,publication:{fetch,command,now:()=>new Date(clock)}};
  const options={configPath,configSha256,workspace};
  return{sql,local,previous,packet,config,options,dependencies,mode,calls,index,workspaceOptions,now:()=>clock,advance(ms){clock=new Date(Date.parse(clock)+ms).toISOString();},
    loseWrite(){dropWrite=true;},tamper(fn){queryTamper=fn;},
    async run(command,approval){route=fetch;return runCloudflareWeekly({...options,command,...(approval?{approval}:{})},dependencies);},
    async approve(){
      const changes=sql.prepare('SELECT * FROM products WHERE catalog_revision=? ORDER BY public_id').all(config.catalogRevision).map(row=>{
        const op=sql.prepare(`SELECT * FROM catalog_maintenance_operations WHERE run_id=? AND EXISTS(
          SELECT 1 FROM json_each(changes_json) c WHERE json_extract(c.value,'$.productId')=?) ORDER BY next_epoch DESC LIMIT 1`).get(config.runId,row.id);
        assert.ok(op,'Approval requires an actual immutable operation for every complete current row');
        return{publicId:row.public_id,operationId:op.operation_id,inputSha256:op.input_sha256,
          productSha256:sha256(canonicalJson({...row})),displaySha256:sha256(row.public_display_json??'null')};});
      const approval={schemaVersion:1,runId:config.runId,catalogRevision:config.catalogRevision,changes};
      const file=path.join(directory,'explicit-reviewed-postphase.json');await put(file,approval);return{path:file,sha256:sha256(await fs.readFile(file))};
    }};
}

test('pinned daily D1 uses one existing refresh with no model credential, then waits for real publication and does not repeat',async t=>{
  const f=await setup(t);
  f.config.cadence={day:'2026-10-20',featuredIds:[ID]};f.config.backfillLimit=0;delete f.config.credentials.openai;
  await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  f.workspaceOptions.configSha256=f.options.configSha256;
  const resolves=[];const dependencies={...f.dependencies,async resolveToken(ref){resolves.push(ref.service);return f.dependencies.resolveToken(ref);}};
  const result=await runCloudflareWeekly({...f.options,command:'start',cadenceOnly:true},dependencies);
  assert.equal(result.state,'pending');assert.equal(result.phase,'phases_complete');
  assert.equal(f.calls.getItems,1);assert.equal(f.calls.search,0);assert.equal(f.calls.chat,0);assert.equal(f.calls.embedding,0);
  assert.equal(resolves.some(s=>s.endsWith('openai')),false);assert.equal(f.calls.upload,0);assert.equal(f.calls.activate,0);
  assert.equal(f.sql.prepare('SELECT status FROM catalog_runs WHERE id=?').get(f.config.runId).status,'running');
  const before={...f.calls};
  assert.equal((await runCloudflareWeekly({...f.options,command:'resume',cadenceOnly:true},dependencies)).state,'pending');
  assert.deepEqual(f.calls.getItems,before.getItems);assert.equal(f.calls.chat,0);
  f.config.runId='same-day-other-run';await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  assert.equal((await runCloudflareWeekly({...f.options,command:'start',cadenceOnly:true},dependencies)).state,'skipped');
  assert.equal(f.calls.getItems,1);
});

for(const monday of [false,true])test(`full2359 ${monday?'Monday ten plus20 discoveries':'daily ten'} current driver retains catalog but refuses ordinary whole-run budget`,async t=>{
  const f=await setup(t,{permanent:2359,held:1024,discovered:monday?20:0,realTransport:true,at:monday?'2026-10-19T18:00:00.000Z':NOW});
  f.config.cadence={day:monday?'2026-10-19':'2026-10-20',featuredIds:Array.from({length:10},(_,i)=>`B${String(i+1).padStart(9,'0')}`)};
  f.config.backfillLimit=0;f.config.limits={requests:800,statements:1200};if(!monday)delete f.config.credentials.openai;
  await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  f.workspaceOptions.configSha256=f.options.configSha256;f.workspaceOptions.budgetCaps={httpRequests:800,sqlStatements:1200};
  const before=f.previous.products.map(p=>p.publicId),beforeDisplays=new Map(f.previous.products.map(p=>[p.publicId,p])),
    heldRows=()=>f.sql.prepare('SELECT * FROM products WHERE is_active=0 ORDER BY public_id').all().map(r=>({...r})),
    heldBefore=sha256(canonicalJson(heldRows()));
  const capture=async(command,approval)=>{try{return await f.run(command,approval);}catch(error){return{state:'refused',reason:error.message};}};
  const start=await capture('start');
  if(!monday)assert.equal(start.reason,'awaiting_reviewed_approval',JSON.stringify(start));
  assert.equal(f.calls.getItems,1);assert.equal(f.calls.search,monday?6:0);
  assert.equal(f.calls.merchantAuthHttp,1);assert.equal(f.calls.merchantApiHttp,monday?7:1);assert.equal(f.calls.merchantRetries,0);
  if(!monday)assert.equal(f.calls.chat+f.calls.embedding,0);
  const current=f.sql.prepare("SELECT * FROM products WHERE catalog_revision='weekly-r' ORDER BY public_id").all();
  if(start.reason==='awaiting_reviewed_approval')assert.equal(current.length,monday?30:10,'No completed daily/Monday phase is silently truncated');
  else{assert.equal(monday,true);assert.equal(start.errorCode||start.reason,'catalog_d1_budget_exhausted');assert.ok(current.length>=10&&current.length<=30);}
  assert.equal(sha256(canonicalJson(heldRows())),heldBefore,'Discovery cannot reactivate/rewrite an inactive same-ASIN or family');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM products WHERE id=?').get('B000006000').n,0);
  for(const id of before){const row=f.sql.prepare('SELECT * FROM products WHERE public_id=?').get(id);
    assert.equal(row.is_active,1);assert.ok(row.public_display_json);const display=JSON.parse(row.public_display_json),base=display.persistent??display;
    assert.deepEqual(base,beforeDisplays.get(id),'A refreshed optional overlay must retain every exact permanent catalog field');}
  if(monday)for(const row of current.filter(row=>!before.includes(row.public_id))){
    const display=JSON.parse(row.public_display_json),base=display.eligibleUntil===null?display:display.persistent;
    assert.ok(base,'All20 strong discoveries have explicit independent permanent clearance, not merchant-derived fallback rights');
    assert.equal(base.eligibleUntil,null);assert.equal(base.imageUrl,'/images/gift-placeholder.svg');
    assert.ok(JSON.parse(row.rights_json).persistent);}
  const approval=start.reason==='awaiting_reviewed_approval'?await f.approve():undefined;
  if(approval)assert.equal(JSON.parse(await fs.readFile(approval.path)).changes.length,monday?30:10);
  const paid=Object.fromEntries(['getItems','search','chat','embedding','merchantAuthHttp','merchantApiHttp','merchantRetries'].map(k=>[k,f.calls[k]]));
  const resume=()=>capture('resume',approval),result=approval?await resume():start,report=await readRunWorkspace(f.workspaceOptions);
  assert.notEqual(result.state,'finalized');assert.ok((approval?['freezing']:['attention'])
    .includes(report.checkpoint.checkpoint.phase),JSON.stringify(result));
  assert.ok(report.budget.sqlStatements<=1200);assert.equal(report.budget.unconfirmedRequests,0);
  assert.equal(f.calls.build+f.calls.upload+f.calls.activate,0,'Budget refusal cannot deploy a partial/empty catalog');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,1);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,approval?'freezing':'writing');
  const charged=structuredClone(report.budget),http=f.calls.http,sql=f.calls.sql,
    projectionRows=f.sql.prepare("SELECT count(*) n FROM catalog_public_products WHERE catalog_revision='weekly-r'").get().n;
  assert.ok(projectionRows<2359);if(approval)assert.ok(charged.sqlStatements+Math.min(35,2359-projectionRows)+1>1200,
    'The next unchanged bounded projection chunk cannot fit the ordinary statement cap');
  assert.equal(charged.httpRequests,http,'Every mocked CF/Vectorize/identity request is in the shared ledger');
  assert.equal(charged.sqlStatements,sql,'Every dispatched SQL statement is in the shared ledger');
  await resume();const again=await readRunWorkspace(f.workspaceOptions);
  for(const key of ['httpRequests','sqlStatements','knownRowsRead','knownRowsWritten','unconfirmedRequests'])assert.ok(again.budget[key]>=charged[key],key);
  assert.deepEqual(Object.fromEntries(Object.keys(paid).map(k=>[k,f.calls[k]])),paid,'Restart cannot rerun merchant/model phases');
  assert.equal(f.calls.build+f.calls.upload+f.calls.activate,0);
  t.diagnostic(JSON.stringify({scenario:monday?'Monday10+20/full2359':'daily10/full2359',result,phase:report.checkpoint.checkpoint.phase,
    budget:charged,modelHttpOutsideWorkspace:f.calls.modelHttp,merchantMethodCalls:f.calls.getItems+f.calls.search,
    merchantTransport:{auth:f.calls.merchantAuthHttp,api:f.calls.merchantApiHttp,retries:f.calls.merchantRetries},
    allObservedHttp:charged.httpRequests+f.calls.modelHttp+f.calls.merchantAuthHttp+f.calls.merchantApiHttp,
    omittedTransport:'Mock compilation/upload command, not an authentic full publisher/canary or D1 billed-row proof',
    projectionRows,actualChangedProducts:current.length,fullyCompletedProviderPhase:Boolean(approval),
    capacityAccepted:false,prior:'reviewed snapshot/genuine generic receipt, NOT permanent successor/native-anchor acceptance',
    rowsReadMeaning:'mock returned rows, NOT index-inclusive D1 billing'}));
});

test('real merchant client counts cold authorization and its single401 refresh without repeating the reserved daily phase',async t=>{
  const f=await setup(t,{permanent:1,realTransport:true});f.config.cadence={day:'2026-10-20',featuredIds:[ID]};
  f.config.backfillLimit=0;delete f.config.credentials.openai;f.mode.merchantUnauthorized=true;
  await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  f.workspaceOptions.configSha256=f.options.configSha256;
  const result=await f.run('start');assert.equal(result.reason,'awaiting_reviewed_approval',JSON.stringify(result));
  assert.equal(f.calls.getItems,1);assert.equal(f.calls.search+f.calls.modelHttp,0);
  assert.equal(f.calls.merchantAuthHttp,2);assert.equal(f.calls.merchantApiHttp,2);assert.equal(f.calls.merchantRetries,1);
  const paid=structuredClone(f.calls);assert.equal((await f.run('resume')).reason,'awaiting_reviewed_approval');
  for(const key of ['getItems','search','modelHttp','merchantAuthHttp','merchantApiHttp','merchantRetries'])assert.equal(f.calls[key],paid[key]);
});

test('phase budget exhaustion checkpoints attention locally without a diagnostic D1 read or paid replay',async t=>{
  const f=await setup(t,{permanent:1});f.config.cadence={day:'2026-10-20',featuredIds:[ID]};
  f.config.backfillLimit=0;f.config.limits={requests:800,statements:40};delete f.config.credentials.openai;
  await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  f.workspaceOptions.configSha256=f.options.configSha256;f.workspaceOptions.budgetCaps={httpRequests:800,sqlStatements:40};
  const result=await f.run('start');assert.equal(result.state,'attention');assert.equal(result.phase,'attention');
  assert.equal(result.errorCode,'catalog_d1_budget_exhausted');
  const report=await readRunWorkspace(f.workspaceOptions);assert.equal((await fullCheckpoint(f.workspaceOptions)).checkpoint.state.errorCode,'catalog_d1_budget_exhausted');
  assert.equal(report.checkpoint.checkpoint.owner.phase,'writing');assert.equal(report.budget.httpRequests,f.calls.http);
  assert.equal(report.budget.sqlStatements,f.calls.sql);assert.equal(report.budget.unconfirmedRequests,0);
  const calls=structuredClone(f.calls),budget=structuredClone(report.budget),owner={...f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get()};
  assert.equal((await f.run('resume')).state,'attention');assert.deepEqual(f.calls,calls);
  assert.deepEqual((await readRunWorkspace(f.workspaceOptions)).budget,budget);
  assert.deepEqual({...f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get()},owner);
  assert.equal(f.calls.upload+f.calls.activate,0);
});

test('reported D1 usage excess retains the known cost and checkpoints attention without another diagnostic read',async t=>{
  const f=await setup(t);f.mode.reportedUsageExceeded=true;
  const result=await f.run('start');assert.equal(result.state,'attention');assert.equal(result.phase,'attention');
  assert.equal(result.errorCode,'catalog_d1_reported_usage_exceeded');
  const report=await readRunWorkspace(f.workspaceOptions);assert.equal((await fullCheckpoint(f.workspaceOptions)).checkpoint.state.errorCode,result.errorCode);
  assert.ok(report.budget.knownRowsRead>1_000_000);assert.equal(report.budget.unconfirmedRequests,0);
  assert.equal(report.budget.httpRequests,f.calls.http);assert.equal(report.budget.sqlStatements,f.calls.sql);
  const calls=structuredClone(f.calls),budget=structuredClone(report.budget);
  assert.equal((await f.run('resume')).state,'attention');assert.deepEqual(f.calls,calls);
  assert.deepEqual((await readRunWorkspace(f.workspaceOptions)).budget,budget);
  assert.equal(f.calls.getItems+f.calls.search+f.calls.chat+f.calls.embedding+f.calls.build+f.calls.upload+f.calls.activate,0);
});

test('small permanent daily composes actual package verification through receipt/readback with model-free cadence and shared CF accounting',async t=>{
  const f=await setup(t,{permanent:1,held:1});f.config.cadence={day:'2026-10-20',featuredIds:[ID]};
  f.config.backfillLimit=0;f.config.limits={requests:800,statements:1200};delete f.config.credentials.openai;
  await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  f.workspaceOptions.configSha256=f.options.configSha256;f.workspaceOptions.budgetCaps={httpRequests:800,sqlStatements:1200};
  const start=await f.run('start');assert.equal(start.reason,'awaiting_reviewed_approval');
  const result=await f.run('resume',await f.approve());assert.equal(result.state,'finalized',JSON.stringify(result));
  assert.equal(f.calls.getItems,1);assert.equal(f.calls.search+f.calls.chat+f.calls.embedding,0);
  assert.equal(f.calls.build,1);assert.equal(f.calls.upload,1);assert.equal(f.calls.activate,1);
  const request=f.sql.prepare('SELECT * FROM catalog_build_requests WHERE release_id=?').get(f.config.publication.releaseId);
  assert.equal(request.state,'resolved');assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,2);
  // Executor deliberately cleans its owned build tree after verified receipt.
  const projected=f.sql.prepare("SELECT public_id,public_display_json FROM catalog_public_products WHERE catalog_revision='weekly-r' ORDER BY public_id").all();
  assert.deepEqual(projected.map(p=>p.public_id),[UUID]);assert.equal(JSON.parse(projected[0].public_display_json).eligibleUntil,null);
  assert.equal(result.budget.httpRequests,f.calls.http);assert.equal(result.budget.sqlStatements,f.calls.sql);
  const calls=structuredClone(f.calls);assert.equal((await f.run('resume')).state,'finalized');assert.deepEqual(f.calls,calls);
  t.diagnostic(JSON.stringify({scenario:'small permanent daily executor',budget:result.budget,providerCalls:f.calls,
    compilation:'mock',uploadCommand:'mock (protected bridge/asset HTTP tested separately, not part of this capacity proof)',
    full2359CapacityAccepted:false,rowsReadMeaning:'mock returned rows, NOT index-inclusive D1 billing'}));
});

test('daily entry point rejects a legacy weekly config before paid calls or workspace creation',async t=>{
  const f=await setup(t);
  await assert.rejects(runCloudflareWeekly({...f.options,command:'start',cadenceOnly:true},f.dependencies),/weekly_daily_cadence_required/);
  await assert.rejects(fs.stat(f.options.workspace),{code:'ENOENT'});assert.equal(f.calls.getItems,0);assert.equal(f.calls.search,0);
});

test('Monday selected enrichment requires a pinned model credential before owner claim even after discovery is reserved',async t=>{
  const f=await setup(t,{at:'2026-10-19T12:00:00.123Z'});
  f.config.cadence={day:'2026-10-19',featuredIds:[ID]};f.config.backfillLimit=0;delete f.config.credentials.openai;
  await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  await withCatalogCadence({workspace:f.options.workspace,repository:f.dependencies.repository,now:f.dependencies.now},
    cadence=>cadence.reserve('discovery','already-discovered'));
  const before=f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get();
  await assert.rejects(runCloudflareWeekly({...f.options,command:'start',cadenceOnly:true},f.dependencies),/weekly_model_credentials_missing/);
  assert.deepEqual(f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get(),before);
  assert.equal(f.calls.getItems,0);assert.equal(f.calls.search,0);assert.equal(f.calls.chat,0);assert.equal(f.calls.embedding,0);
  await withCatalogCadence({workspace:f.options.workspace,repository:f.dependencies.repository,now:f.dependencies.now},async cadence=>{
    assert.deepEqual(await cadence.plan(),{daily:true,discovery:false});
  });
});

test('no-prior start/preflight and undispatched resume refuse before provider or workspace writes; status stays readable',async t=>{
  const f=await setup(t,{noPrior:true});const before={...f.calls};const writes=f.sql.prepare('SELECT total_changes() n').get().n;
  const dependencies={...f.dependencies,async resolveToken(){assert.fail('Bootstrap guard must precede credentials');}};
  const run=command=>runCloudflareWeekly({...f.options,command},dependencies);
  for(const command of ['start','preflight','resume'])await assert.rejects(run(command),/^Error: weekly_bootstrap_required$/);
  await assert.rejects(fs.stat(f.options.workspace),{code:'ENOENT'});
  for(const phase of ['created','phases_complete']){
    const w=await openRunWorkspace({...f.workspaceOptions,mode:phase==='created'?'create':'resume'});const current=await w.readCheckpoint();
    await w.writeCheckpoint(current?.sha256||null,{phase,owner:null,state:{},pins:{},phaseComplete:null});await w.close();
    const checkpoint=await readRunWorkspace(f.workspaceOptions);
    await assert.rejects(run('resume'),/^Error: weekly_bootstrap_required$/);
    assert.deepEqual(await readRunWorkspace(f.workspaceOptions),checkpoint);
  }
  const status=await run('status');assert.equal(weeklyCommandSummary(status).phase,'phases_complete');
  assert.deepEqual(f.calls,before);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,writes);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
});
test('null-prior historical activation remains reconcilable after expiry, including lost local permit checkpoint',async t=>{
  for(const savedPermit of [true,false]){
    const f=await setup(t,{noPrior:true});const at=new Date(f.now());const scope={environment:f.config.environment,indexName:f.config.vectorIndex.name};
    const owner=await claimMutationOwnership(f.local,scope,{phase:'freezing',ownerReference:f.config.runId,operationKey:'d'.repeat(64)});
    const request={schemaVersion:1,environment:scope.environment,sourceRevision:f.previous.catalogRevision,sourceDigest:f.packet.receipt.snapshot_sha256,
      codeSha:f.config.codeSha,priorReleaseId:null,capturedAt:f.now(),cutoff:new Date(at.getTime()+3600000).toISOString()};
    const {requestId}=await enqueueBuildRequest(f.local,request);const build=await claimBuildRequest(f.local,requestId,f.config.runId,at);
    const intent={releaseId:f.config.publication.releaseId,codeSha:f.config.codeSha,catalogRevision:f.previous.catalogRevision,
      catalogSnapshotSha256:f.packet.receipt.snapshot_sha256,manifestSha256:'c'.repeat(64),vectorSyncWatermark:0,priorReleaseId:null,nextExpiry:null};
    await enqueuePublication(f.local,f.previous,intent,at);const publication=await claimPublication(f.local,f.previous,intent.releaseId,at);
    await recordPublicationDispatch(f.local,f.previous,publication,`version:${VERSION}`,at);
    const permit=await beginBuildActivation(f.local,build,f.previous,publication,VERSION,
      async()=>({environment:scope.environment,settled:true,active:null}),at,owner);
    const control={publication:{schemaVersion:1,configSha256:sha256(canonicalJson(f.config.publication)),requestId,runReference:f.config.runId,
      stage:'activating',build,publication,intent,permit:savedPermit?permit:null,
      vectorPlan:{catalogRevision:f.previous.catalogRevision,planSha256:'e'.repeat(64),ids:[]},packageSha256:null,
      uploadMarker:'historical-upload',versionReference:VERSION,deploymentMarker:'historical-dispatch',deploymentId:null}};
    const w=await openRunWorkspace({...f.workspaceOptions,mode:'create'});let checkpoint;
    for(const phase of ['created','freezing','attention']){
      checkpoint=await w.writeCheckpoint(checkpoint?.sha256||null,{phase,owner:savedPermit?permit.mutationOwner:owner,state:{},pins:{},phaseComplete:null,control});
      if(phase!=='attention'){const calls={...f.calls};await assert.rejects(f.run('resume'),/^Error: weekly_bootstrap_required$/);assert.deepEqual(f.calls,calls);}
    }
    await w.close();
    f.advance(2*86400000);const result=await f.run('resume');assert.equal(result.state,'pending');
    assert.equal(result.errorCode,'publication_fresh_evidence_required');
    assert.equal(f.calls.getItems+f.calls.search+f.calls.chat+f.calls.embedding+f.calls.upsert+f.calls.activate+f.calls.upload+f.calls.build,0);
    assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'activating');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,0);
  }
});
test('staging requires an explicit identity-auth reference; production auth optionality is unchanged',async t=>{
  const f=await setup(t);const {stagingAuthSecret,...credentials}=f.config.credentials;assert.ok(stagingAuthSecret);
  assert.throws(()=>validateCloudflareWeeklyConfig({...f.config,credentials}),/^Error: weekly_configuration_invalid$/);
  assert.doesNotThrow(()=>validateCloudflareWeeklyConfig({...f.config,environment:'production',credentials,
    publication:{...f.config.publication,environment:'production',sourceMode:'goose-production',identityOrigin:'https://www.goose.gifts'}}));
});
test('preflight reads exact schema/scope without workspace writes or merchant/model credentials',async t=>{
  const f=await setup(t);const refs=[];const before=f.sql.prepare('SELECT total_changes() n').get().n;
  const result=await runCloudflareWeekly({...f.options,command:'preflight'},{...f.dependencies,async resolveToken(ref){refs.push(ref.service);return f.dependencies.resolveToken(ref);}});
  assert.equal(result.executionAvailable,false);assert.equal(result.status,'checks_passed_execution_unavailable');
  assert.deepEqual(refs,[f.config.credentials.cloudflare.service]);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
  await assert.rejects(fs.stat(f.options.workspace),{code:'ENOENT'});assert.equal(f.calls.search+f.calls.embedding+f.calls.activate,0);
});
test('weekly OAuth is Cloudflare-only and preflight preserves no-owner/no-workspace/no-provider-phase behavior',async t=>{
  const f=await setup(t);f.config.credentials.cloudflare={type:'wrangler_oauth'};
  assert.doesNotThrow(()=>validateCloudflareWeeklyConfig(f.config));
  for(const name of ['amazonId','amazonSecret','openai','stagingAuthSecret'])assert.throws(()=>validateCloudflareWeeklyConfig({
    ...f.config,credentials:{...f.config.credentials,[name]:{type:'wrangler_oauth'}},
  }),/weekly_configuration_invalid/);
  await fs.writeFile(f.options.configPath,JSON.stringify(f.config),{mode:0o600});
  f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  const before=f.sql.prepare('SELECT total_changes() n').get().n;let oauth=0;
  const result=await runCloudflareWeekly({...f.options,command:'preflight'},{...f.dependencies,
    resolveToken:async()=>assert.fail('No merchant/model/staging Keychain lookup during OAuth preflight'),
    resolveWranglerOAuth:async()=>{oauth++;return'TEST_TOKEN';}});
  assert.equal(oauth,1);assert.equal(result.status,'checks_passed_execution_unavailable');assert.equal(result.executionAvailable,false);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
  await assert.rejects(fs.stat(f.options.workspace),{code:'ENOENT'});assert.equal(f.calls.search+f.calls.embedding+f.calls.activate,0);
});
test('weekly OAuth start keeps merchant/model credentials on their exact Keychain refs and awaits approval before publication',async t=>{
  const f=await setup(t);f.config.credentials.cloudflare={type:'wrangler_oauth'};
  await fs.writeFile(f.options.configPath,JSON.stringify(f.config),{mode:0o600});
  f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  const refs=[];let oauth=0;
  const result=await runCloudflareWeekly({...f.options,command:'start'},{...f.dependencies,
    resolveToken:async ref=>{refs.push(ref);return f.dependencies.resolveToken(ref);},
    resolveWranglerOAuth:async()=>{oauth++;return'TEST_ONLY_cloudflare';}});
  assert.equal(oauth,1);assert.equal(result.reason,'awaiting_reviewed_approval');assert.equal(f.calls.activate,0);
  assert.deepEqual(refs,[f.config.credentials.amazonId,f.config.credentials.amazonSecret,f.config.credentials.openai]);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'writing');
});
test('driver rejects an already-accounted publication sender before opening or adopting any workspace',async t=>{
  const f=await setup(t);let reserved=0,settled=0,resolved=0;
  const owned=accountedPublicationReadFetch({async reserveBudget(){reserved++;},async settleBudget(){settled++;}},
    async()=>assert.fail('Already-accounted sender must not run'),{accountId:f.config.accountId,databaseId:f.config.database.id,
      workerName:f.config.publication.workerName,indexName:f.config.vectorIndex.name,identityOrigin:f.config.publication.identityOrigin});
  for(const key of ['observationFetch','fetch'])await assert.rejects(runCloudflareWeekly({...f.options,command:'start'},
    {...f.dependencies,publication:{...f.dependencies.publication,[key]:owned},resolveToken:async()=>{resolved++;return'FIXTURE_ONLY';}}),
    /weekly_observation_fetch_already_accounted/);
  await assert.rejects(fs.stat(f.options.workspace),{code:'ENOENT'});
  assert.equal(reserved+settled+resolved+f.calls.http,0);
  assert.equal(f.sql.prepare('SELECT phase FROM catalog_mutation_scopes').get().phase,'idle');
});
for(const credential of ['amazon-id','amazon-secret','openai'])test(`unreadable ${credential} stops before writer/cadence/merchant work and permits a safe initial resume`,async t=>{
  const monday=credential==='openai';
  const f=await setup(t,{at:monday?'2026-10-19T18:00:00.000Z':NOW});
  f.config.cadence={day:monday?'2026-10-19':'2026-10-20',featuredIds:[ID]};f.config.backfillLimit=0;
  if(!monday)delete f.config.credentials.openai;
  await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
  f.workspaceOptions.configSha256=f.options.configSha256;
  const before=f.sql.prepare('SELECT total_changes() n').get().n;
  const owner={...f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get()};
  const resolves=[];const environment={...process.env};
  await assert.rejects(runCloudflareWeekly({...f.options,command:'start',cadenceOnly:true},{...f.dependencies,
    resolveToken:async ref=>{resolves.push(ref.service);if(ref.service.endsWith(`.${credential}`))throw new Error('runner_check_keychain_unavailable');
      return f.dependencies.resolveToken(ref);}}),/runner_check_keychain_unavailable/);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
  assert.deepEqual({...f.sql.prepare('SELECT * FROM catalog_mutation_scopes').get()},owner);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_runs').get().n,0);
  assert.equal((await readRunWorkspace(f.workspaceOptions)).checkpoint.checkpoint.phase,'created');
  assert.deepEqual(await fs.readdir(path.join(f.options.workspace,'cadence')),[]);
  assert.ok(Object.keys(environment).length===Object.keys(process.env).length
    &&Object.entries(environment).every(([key,value])=>process.env[key]===value),'Credential failure changed the scoped environment');
  assert.equal(f.calls.getItems+f.calls.search+f.calls.chat+f.calls.embedding+f.calls.upsert+f.calls.upload+f.calls.activate,0);
  if(!monday)assert.equal(resolves.some(s=>s.endsWith('.openai')),false);
  const called=[];
  const result=await runCloudflareWeekly({...f.options,command:'resume',cadenceOnly:true},{...f.dependencies,
    resolveToken:async ref=>{called.push(ref.service);return f.dependencies.resolveToken(ref);}});
  assert.equal(result.reason,'awaiting_reviewed_approval');assert.equal(f.calls.getItems,1);
  for(const service of new Set(called))assert.equal(called.filter(s=>s===service).length,1);
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
  assert.equal(f.sql.prepare('SELECT state FROM catalog_build_requests WHERE release_id=?').get(f.config.publication.releaseId).state,'resolved');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM publication_receipts').get().n,2);
  assert.equal(nativeHash([...f.index.values()][0].values),nativeHash(values.map(Math.fround)));
  assert.equal((await f.run('resume')).state,'finalized');assert.equal(f.calls.activate,1);
});
test('lost D1 response and uncertain publication resume without paid phases, counter reset or second activation',async t=>{
  const f=await setup(t);f.loseWrite();assert.equal((await f.run('start')).reason,'awaiting_reviewed_approval');
  f.mode.identityFailure=true;f.mode.activationLost=true;const first=await f.run('resume',await f.approve());assert.equal(first.state,'pending');
  assert.equal(f.sql.prepare('SELECT status FROM catalog_runs').get().status,'running');assert.equal(f.calls.activate,1);
  // Both the lost D1 ACK and the consumed activation response are charged.
  // General publication REST was previously outside this workspace ledger.
  const before={...f.calls};const usage=(await readRunWorkspace(f.workspaceOptions)).budget;assert.equal(usage.unconfirmedRequests,2);
  delete f.mode.identityFailure;const result=await f.run('resume');assert.equal(result.state,'finalized',JSON.stringify(result));
  assert.equal(f.calls.activate,1);assert.equal(f.calls.search,before.search);assert.equal(f.calls.embedding,before.embedding);
  assert.ok(result.budget.httpRequests>usage.httpRequests);assert.equal(result.budget.unconfirmedRequests,2);assert.ok(result.budget.knownRowsWritten>=usage.knownRowsWritten);
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
  const summary=weeklyCommandSummary(status);assert.equal(summary.phase,'phases_running');assert.equal(summary.runId,f.config.runId);
  assert.equal(summary.checkpoint,undefined);assert.equal(summary.owner,undefined);
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

test('ordered derived freeze artifacts switch to bounded blobs without canonicalizing JSON bytes or changing small refs',async t=>{
  const f=await setup(t),w=await openRunWorkspace({...f.workspaceOptions,mode:'create'});t.after(async()=>{try{await w.close();}catch{}});
  const small={z:'first property',a:'second property'},smallRef=await putOrdered(w,small,NOW,'phase');
  assert.equal(await w.readArtifact(smallRef),JSON.stringify(small));assert.deepEqual(await readOrdered(w,smallRef),small);
  const nativeBase64=encodePgvectorSendBase64(values.map(Math.fround)),large={sourceRows:Array.from({length:80},(_,index)=>({z:index,nativeBase64,a:'last'})),label:'🎁'.repeat(70_000)};
  const ordered=Buffer.from(JSON.stringify(large)),ref=await putOrdered(w,large,NOW);
  assert.ok(ordered.length>WORKSPACE_BLOB_LIMITS.artifactBytes);assert.equal((await w.readArtifact(ref)).type,'run-workspace-blob');
  assert.deepEqual(await w.readBlob(ref),ordered);assert.deepEqual(await readOrdered(w,ref),large);
  await w.writeCheckpoint(null,{phase:'freezing',owner:null,state:{vectorOffset:0},pins:{preparedRevision:ref,legacy:smallRef},phaseComplete:smallRef});
  await w.close();const resumed=await openRunWorkspace(f.workspaceOptions);t.after(async()=>{try{await resumed.close();}catch{}});
  assert.deepEqual(await readOrdered(resumed,(await resumed.readCheckpoint()).checkpoint.pins.preparedRevision),large);
  f.advance(86400000);await assert.rejects(readOrdered(resumed,ref),/expired/);
  assert.equal((await resumed.readCheckpoint({controlOnly:true})).checkpoint.phase,'freezing');
});

test('actual driver pins reviewed oversized previous/original-vector RAW files and resumes without paid replay or D1 budget reset',async t=>{
  const f=await setup(t),nativeBase64=encodePgvectorSendBase64(values.map(Math.fround));
  const originals=Object.fromEntries(Array.from({length:80},(_,index)=>[`00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`,{nativeBase64}]));
  const bytes=Buffer.from(` {\n${JSON.stringify(originals).slice(1,-1)}\n}\n`);assert.ok(bytes.length>512*1024);
  const file=path.join(path.dirname(f.options.configPath),'reviewed-original-vectors.json');await put(file,bytes);
  const previousBytes=Buffer.concat([Buffer.from(' \n'),await fs.readFile(f.config.inputs.previous.path),Buffer.alloc(520*1024,32)]);
  await put(f.config.inputs.previous.path,previousBytes);f.config.inputs.previous.sha256=sha256(previousBytes);
  f.config.inputs.originalVectors={path:file,sha256:sha256(bytes),observedAt:NOW};await put(f.options.configPath,f.config);
  f.options.configSha256=sha256(await fs.readFile(f.options.configPath));f.workspaceOptions.configSha256=f.options.configSha256;
  assert.equal((await f.run('start')).reason,'awaiting_reviewed_approval');const paid={getItems:f.calls.getItems,chat:f.calls.chat,embedding:f.calls.embedding,search:f.calls.search};
  const w=await openRunWorkspace(f.workspaceOptions),saved=await w.readCheckpoint(),ref=saved.checkpoint.pins.originalVectors;
  assert.equal((await w.readArtifact(ref)).type,'run-workspace-blob');assert.deepEqual(await w.readBlob(ref),bytes);
  const previousRef=saved.checkpoint.pins.previous;assert.equal((await w.readArtifact(previousRef)).type,'run-workspace-blob');
  assert.deepEqual(await w.readBlob(previousRef),previousBytes);assert.deepEqual(await readOrdered(w,previousRef),f.previous);
  const before=await w.budget();await w.close();
  const oversized=path.join(path.dirname(f.options.configPath),'oversized-approval.json');await put(oversized,`{}${' '.repeat(512*1024)}`);
  await assert.rejects(f.run('resume',{path:oversized,sha256:sha256(await fs.readFile(oversized))}),/weekly_private_input/);
  assert.deepEqual({getItems:f.calls.getItems,chat:f.calls.chat,embedding:f.calls.embedding,search:f.calls.search},paid);
  const result=await f.run('resume',await f.approve());assert.equal(result.state,'finalized');assert.ok(result.budget.httpRequests>before.httpRequests);
  assert.deepEqual({getItems:f.calls.getItems,chat:f.calls.chat,embedding:f.calls.embedding,search:f.calls.search},paid);
  const reopened=await openRunWorkspace(f.workspaceOptions);try{assert.deepEqual(await reopened.readBlob(ref),bytes);
    assert.deepEqual(await reopened.readBlob(previousRef),previousBytes);
    assert.equal((await reopened.readCheckpoint()).checkpoint.phase,'finalized');assert.deepEqual(await reopened.budget(),result.budget);
    f.advance(86400000);await assert.rejects(readOrdered(reopened,previousRef),/expired/);
    assert.equal((await reopened.readCheckpoint({controlOnly:true})).checkpoint.phase,'finalized');}finally{await reopened.close();}
  assert.equal(f.calls.activate,1);assert.equal(f.calls.upload,1);
});

test('large previous ingress requires its exact raw SHA; context/rights inputs keep the old small limit',async t=>{
  for(const label of ['previous','rights','context']){
    const f=await setup(t),file=f.config.inputs[label].path;
    const bytes=Buffer.concat([await fs.readFile(file),Buffer.alloc(520*1024,32)]);await put(file,bytes);
    f.config.inputs[label].sha256=sha256(bytes);if(label==='previous')await fs.appendFile(file,' ');
    await put(f.options.configPath,f.config);f.options.configSha256=sha256(await fs.readFile(f.options.configPath));
    f.workspaceOptions.configSha256=f.options.configSha256;
    await assert.rejects(f.run('start'),label==='previous'?/weekly_input_digest/:/weekly_private_input/);
    assert.equal(f.calls.getItems+f.calls.search+f.calls.chat+f.calls.embedding+f.calls.upsert+f.calls.upload+f.calls.activate,0);
  }
});

test('oversized original input still binds reviewed RAW hash; config limit cannot be broadened by blob support',async t=>{
  const f=await setup(t),bytes=Buffer.from(`{"nativeBase64":"${'A'.repeat(520*1024)}"}\n`);
  const file=path.join(path.dirname(f.options.configPath),'unconfirmed-originals.json');await put(file,bytes);
  f.config.inputs.originalVectors={path:file,sha256:sha256(bytes),observedAt:NOW};await put(f.options.configPath,f.config);
  f.options.configSha256=sha256(await fs.readFile(f.options.configPath));f.workspaceOptions.configSha256=f.options.configSha256;
  await fs.appendFile(file,' ');await assert.rejects(f.run('start'),/weekly_input_digest/);
  assert.equal(f.calls.getItems+f.calls.search+f.calls.chat+f.calls.embedding+f.calls.upsert+f.calls.upload+f.calls.activate,0);
  const http=f.calls.http;await put(f.options.configPath,`${JSON.stringify(f.config)}${' '.repeat(32768)}`);
  f.options.configSha256=sha256(await fs.readFile(f.options.configPath));await assert.rejects(f.run('preflight'),/weekly_private_input/);
  assert.equal(f.calls.http,http);
});
