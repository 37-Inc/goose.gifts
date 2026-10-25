import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {readPublicationPackage,inventoryPublicationPackage} from '../scripts/catalog/publish-release.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';
import {assembleReleaseAssets} from '../scripts/staging/retention.mts';
import {createReleaseIdentity} from '../scripts/staging/release-identity.mts';
import {siteIdentityBytes} from '../scripts/staging/build.mts';
import {createStaticFeedPlan} from '../workers/site/feed.ts';
import {createBrowseRelease} from '../static-site/lib/browse.ts';
import {createPhotoRelease} from '../static-site/lib/photos.ts';
import {createOgRelease} from '../static-site/lib/og.ts';
import {siteIdentityFor} from '../static-site/lib/site-identity.ts';
import {guides} from '../static-site/lib/guides.ts';

// Synthetic sealed packages only. Historical behavior is deliberately different
// from this controller; the original immutable inventory is the trust anchor.
const OLD='2026-10-24T12:00:00.000Z',NOW=new Date('2026-10-26T12:00:00.000Z'),LATER='2026-10-27T12:00:00.000Z';
const RELEASE='synthetic-activated-release',CODE='1'.repeat(40),UUID='00000000-0000-4000-8000-000000000001';
const network=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Live network forbidden');};
test.after(()=>{globalThis.fetch=network;});

async function fixture(t,{difference='all',finite=false}={}){
  const directory=await realpath(await mkdtemp(join(tmpdir(),'stupid-immutable-package-')));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const put=async(name,value)=>{const file=join(directory,name);await mkdir(dirname(file),{recursive:true,mode:0o700});
    await writeFile(file,typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value)+'\n',{mode:0o600});};
  const product={id:'B000000001',publicId:UUID,slug:'owned-fixture-gift',title:'Owned fixture mug',description:'An independently owned synthetic fixture.',
    imageUrl:'/images/gift-placeholder.svg',affiliateUrl:'https://www.amazon.com/dp/B000000001?tag=fixture-20',
    source:'amazon',currency:'USD',price:0,isActive:true,qualityScore:.8,eligibleUntil:finite?LATER:null,indexable:false};
  const snapshot={schemaVersion:1,dataKind:'catalog',catalogRevision:'synthetic-catalog',generatedAt:OLD,products:[product],heldProducts:[],slugHistory:[]};
  const snapshotBytes=JSON.stringify(snapshot)+'\n',snapshotSha256=sha256(snapshotBytes);
  const context={schemaVersion:1,releaseId:RELEASE,codeSha:CODE,catalogRevision:snapshot.catalogRevision,catalogSnapshotSha256:snapshotSha256,
    generatedAt:OLD,vectorSyncWatermark:0,priorReleaseId:null,sourceMode:'stupid-production',retainedManifestSha256:null};
  const pages=['/','/random-gift','/gift-guides','/howie','/preview/presentation',...guides.map(g=>'/gift-guides/'+g.slug),'/gifts/'+product.slug];
  const assets=new Map(pages.map(path=>[path==='/'?'/index.html':path+'.html',Buffer.from('Owned synthetic HTML')]));
  for(const path of ['/safe/catalog.html','/safe/product.html','/safe/howie.html','/safe/presentation.html','/safe/asset.txt'])assets.set(path,Buffer.from('Owned safe fixture'));
  assets.set('/safe/catalog.json',await readFile(new URL('../static-site/public/safe/catalog.json',import.meta.url)));
  for(const shard of createBrowseRelease(snapshot).shards)assets.set(shard.path,Buffer.from(JSON.stringify(shard.payload)));
  const photos=createPhotoRelease(snapshot);
  if(photos.indexPath){assets.set(photos.indexPath,Buffer.from(JSON.stringify(photos.index)));assets.set('/safe/photos.json',Buffer.from('{"schemaVersion":1,"products":[]}'));
    for(const shard of photos.shards)assets.set(shard.path,Buffer.from(JSON.stringify(shard.payload)));}
  for(const path of createOgRelease(snapshot,siteIdentityFor(context.sourceMode)).byPath.keys())assets.set(path,Buffer.from('Owned synthetic PNG'));
  const assembled=assembleReleaseAssets(snapshot,assets,context,null),currentSite=siteIdentityBytes(context.sourceMode);
  const site=difference==='site'||difference==='all'?JSON.stringify({...JSON.parse(currentSite),historicalLabel:'Original synthetic collection label'})+'\n':currentSite;
  const feed=createStaticFeedPlan(snapshot,snapshotSha256);
  if(difference==='feed'||difference==='all')feed.entries=feed.entries.length?[]:[[0,0]]; // A former ranking decision, not changed package bytes.
  if(difference==='routes'||difference==='all'){
    assembled.assets.set('/gifts.html',Buffer.from('Original synthetic directory HTML'));
    assembled.routes['/gifts']={assetPath:'/gifts.html',safeAssetPath:'/safe/catalog.html',eligibleUntil:finite?LATER:null,state:'ready',indexable:true};
    assembled.routes['/gifts.html']={...assembled.routes['/gifts'],indexable:false};
  }
  const {retainedManifestSha256,...rest}=context;void retainedManifestSha256;
  const manifest={...rest,dataKind:'catalog',siteIdentitySha256:sha256(site),nextExpiry:finite?LATER:null,productCount:1,slugCount:1,
    checksums:Object.fromEntries([...assembled.assets].map(([path,bytes])=>[path,sha256(bytes)])),routes:assembled.routes,retention:assembled.retention};
  const manifestBytes=JSON.stringify(manifest,null,2)+'\n';
  for(const [name,value]of Object.entries({'asset-manifest.json':manifestBytes,'catalog.snapshot.json':snapshotBytes,'release-context.json':context,
    'release-identity.json':createReleaseIdentity(Buffer.from(manifestBytes)),'site-identity.json':site,'feed-plan.json':feed}))await put(name,value);
  for(const [path,bytes]of assembled.assets)await put('assets'+path,bytes);
  const packageSha256=sha256(canonicalJson(await inventoryPublicationPackage(directory)));
  const permit={requestId:'2'.repeat(64),token:'synthetic-original-build',runReference:'synthetic-original-run',releaseId:RELEASE,
    versionReference:'00000000-0000-4000-8000-000000000002',mutationOwner:{environment:'production',indexName:'synthetic',token:'synthetic-activation',
      generation:17,epoch:441,phase:'activating',ownerReference:'synthetic-original-run',operationKey:'3'.repeat(64),capturedAt:OLD}};
  const config={releaseId:RELEASE,codeSha:CODE,sourceMode:context.sourceMode,prior:null};
  const read=settlement=>readPublicationPackage(directory,config,packageSha256,NOW,settlement);
  return{directory,put,config,permit,manifest,snapshot,context,packageSha256,read,
    rehashed:()=>inventoryPublicationPackage(directory).then(value=>sha256(canonicalJson(value)))};
}

test('exact activated permanent package keeps its original feed, site identity and directory policy',async t=>{
  const f=await fixture(t),before=await inventoryPublicationPackage(f.directory),result=await f.read(f.permit);
  assert.deepEqual(result.manifest,f.manifest);assert.deepEqual(result.snapshot,f.snapshot);assert.deepEqual(result.context,f.context);
  assert.deepEqual(await inventoryPublicationPackage(f.directory),before);
  assert.deepEqual(JSON.parse(await readFile(join(f.directory,'feed-plan.json'),'utf8')).entries,[]);
  assert.ok(result.manifest.routes['/gifts']);
});

test('current permanent and finite packages still verify normally before activation',async t=>{
  for(const finite of [false,true])await t.test(finite?'finite':'permanent',async sub=>{
    const f=await fixture(sub,{difference:'none',finite});
    assert.deepEqual((await f.read()).snapshot,f.snapshot);
  });
});

test('preactivation, foreign-permit and finite-content packages retain current semantic validation',async t=>{
  for(const difference of ['feed','site','routes'])await t.test(difference,async sub=>{
    const f=await fixture(sub,{difference}),semantic=/Prepared feed changed|Site identity changed|freshness policy|Retained release/;
    await assert.rejects(f.read(),semantic);
    await assert.rejects(f.read({...f.permit,releaseId:'foreign-release'}),semantic);
    assert.equal((await f.read(f.permit)).manifest.releaseId,RELEASE);
    const finite=await fixture(sub,{difference,finite:true});await assert.rejects(finite.read(finite.permit),semantic);
  });
});

test('matching permit does not bypass original package inventory for any changed file',async t=>{
  for(const name of ['feed-plan.json','site-identity.json','asset-manifest.json','catalog.snapshot.json','release-context.json',
    'release-identity.json','assets/index.html','extra-file.json'])await t.test(name,async sub=>{
    const f=await fixture(sub);await f.put(name,'{"synthetic":"changed immutable bytes"}\n');
    await assert.rejects(f.read(f.permit),/publication_package_changed/);
  });
});

test('permanent settlement still independently checks manifest identity, snapshot digest, context, site and asset hashes',async t=>{
  for(const fault of ['identity','snapshot','context','site-hash','asset-hash'])await t.test(fault,async sub=>{
    const f=await fixture(sub);
    if(fault==='identity')await f.put('release-identity.json',{});
    if(fault==='snapshot')await f.put('catalog.snapshot.json',{...f.snapshot,products:[{...f.snapshot.products[0],title:'Changed synthetic gift'}]});
    if(fault==='context')await f.put('release-context.json',{...f.context,vectorSyncWatermark:1});
    if(fault==='site-hash')await f.put('site-identity.json','{"changed":"identity bytes"}\n');
    if(fault==='asset-hash')await f.put('assets/index.html','Changed synthetic asset bytes');
    const expected=await f.rehashed();
    await assert.rejects(readPublicationPackage(f.directory,f.config,expected,NOW,f.permit),/publication_package_changed|publication_package_unready|release identity|Release context changed/);
  });
});

test('permit never extends a finite supplier deadline or relabels release/source identity',async t=>{
  const finite=await fixture(t,{difference:'all',finite:true});
  await assert.rejects(readPublicationPackage(finite.directory,finite.config,finite.packageSha256,new Date('2026-10-28T12:00:00.000Z'),finite.permit),/expired public product/);
  const f=await fixture(t);
  for(const change of [{releaseId:'foreign-release'},{codeSha:'f'.repeat(40)},{sourceMode:'goose-production'}])
    await assert.rejects(readPublicationPackage(f.directory,{...f.config,...change},f.packageSha256,NOW,f.permit),/publication_package_unready/);
});
