import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, writeFile, stat, chmod, mkdir, symlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCloudflareReadClient } from '../scripts/catalog/d1-rest.ts';
import { checkCloudflareRunner, validateRunnerCheckConfig, resolveReadToken, resolveWranglerOAuth, resolveCloudflareCredential, writeRunnerCheck } from '../scripts/catalog/check-cloudflare-runner.ts';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const config={schemaVersion:1,environment:'staging',accountId:'a'.repeat(32),database:{id:'00000000-0000-4000-8000-000000000001',name:'test-only-db'},
  vectorIndex:{name:'test-only-index',dimensions:1536,metric:'cosine'},catalog:{associateTag:'fixture-only-tag',marketplace:'www.amazon.com'},
  cloudflareReadToken:{service:'goose.gifts.test-only-reader',account:'test-only'}};
const token='TEST_ONLY_NOT_A_CREDENTIAL';
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Live network is forbidden in this test');};
test.after(()=>{globalThis.fetch=originalFetch;});
const hash=value=>createHash('sha256').update(value).digest('hex');
const ok=result=>new Response(JSON.stringify({success:true,result}));
const client=fetch=>createCloudflareReadClient({accountId:config.accountId,databaseId:config.database.id,indexName:config.vectorIndex.name,token,fetch});

test('Cloudflare OAuth reference is explicit/exact and cannot enter another credential shape or fallback',async()=>{
  const ref={type:'wrangler_oauth'};
  assert.deepEqual(validateRunnerCheckConfig({...config,cloudflareReadToken:ref}).cloudflareReadToken,ref);
  for(const bad of [{type:'oauth'},{type:'wrangler_oauth',service:'goose.gifts.other'},
    {type:'wrangler_oauth',profile:'other'},{type:'wrangler_oauth',command:'other'},[],'wrangler_oauth']){
    assert.throws(()=>validateRunnerCheckConfig({...config,cloudflareReadToken:bad}),/config_invalid/);
    await assert.rejects(resolveCloudflareCredential(bad,async()=>assert.fail('keychain fallback'),async()=>assert.fail('OAuth fallback')),
      /^Error: runner_check_cloudflare_reference$/);
  }
  assert.equal(await resolveCloudflareCredential(ref,async()=>assert.fail('OAuth must not read Keychain'),async()=>token),token);
  assert.equal(await resolveCloudflareCredential(config.cloudflareReadToken,async r=>{
    assert.deepEqual(r,config.cloudflareReadToken);return token;
  },async()=>assert.fail('Keychain must not fall back to OAuth')),token);
  await assert.rejects(resolveCloudflareCredential(ref,async()=>assert.fail('No fallback'),async()=>{throw new Error('rejected');}),/rejected/);
});
test('pinned OAuth subprocess is captured in an empty private cwd without ambient auth, logs, downloads or login',async()=>{
  const prior={...process.env};let directory;
  try{
    for(const key of ['CLOUDFLARE_API_TOKEN','CF_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CLOUDFLARE_API_BASE_URL',
      'WRANGLER_OUTPUT_FILE_PATH','WRANGLER_LOG_PATH','NODE_OPTIONS'])process.env[key]='PRIVATE_AMBIENT_FIXTURE';
    assert.equal(await resolveWranglerOAuth(async(command,args,options)=>{
      assert.equal(command,process.execPath);assert.equal(args.length,4);
      assert.ok(args[0].endsWith('/node_modules/wrangler/bin/wrangler.js'));assert.deepEqual(args.slice(1),['auth','token','--json']);
      directory=options.cwd;const info=await stat(directory);assert.equal(info.mode&0o777,0o700);assert.equal(info.uid,process.getuid());
      assert.deepEqual(await readdir(directory),[]);assert.ok(!directory.startsWith(root));
      assert.equal(options.timeout,10000);assert.equal(options.maxBuffer,8192);assert.equal(options.encoding,'utf8');
      assert.deepEqual(Object.keys(options.env).sort(),['BROWSER','CI','HOME','NODE_ENV','PATH','WRANGLER_LOG','WRANGLER_LOG_SANITIZE',
        'WRANGLER_SEND_ERROR_REPORTS','WRANGLER_SEND_METRICS','WRANGLER_WRITE_LOGS'].sort());
      assert.equal(options.env.CI,'true');assert.equal(options.env.BROWSER,'false');assert.equal(options.env.WRANGLER_WRITE_LOGS,'false');
      assert.equal(options.env.WRANGLER_SEND_METRICS,'false');assert.equal(options.env.WRANGLER_SEND_ERROR_REPORTS,'false');
      assert.ok(!JSON.stringify(options.env).includes('PRIVATE_AMBIENT_FIXTURE'));
      return{stdout:JSON.stringify({type:'oauth',token}),stderr:''};
    }),token);
    await assert.rejects(stat(directory),{code:'ENOENT'});
  }finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);}
});
test('absent/rejected/nonOAuth/malformed/oversized/timed-out auth never emits private diagnostics or falls back',async()=>{
  for(const result of [
    {stdout:'',stderr:''}, {stdout:'PRIVATE_INVALID_JSON',stderr:''},
    {stdout:JSON.stringify({type:'api_token',token}),stderr:''},
    {stdout:JSON.stringify({type:'api_key',key:token,email:'fixture@example.test'}),stderr:''},
    {stdout:JSON.stringify({type:'oauth',token,extra:'PRIVATE'}),stderr:''},
    {stdout:JSON.stringify({type:'oauth',token:''}),stderr:''},
    {stdout:JSON.stringify({type:'oauth',token:'x'.repeat(4097)}),stderr:''},
    {stdout:JSON.stringify({type:'oauth',token:'PRIVATE\nVALUE'}),stderr:''},
    {stdout:' '.repeat(8193),stderr:''},
    {stdout:JSON.stringify({type:'oauth',token}),stderr:'PRIVATE_STDERR'},
    Object.assign(new Error('PRIVATE_REJECTED'),{code:1}),
    Object.assign(new Error('PRIVATE_TIMEOUT'),{code:'ETIMEDOUT',killed:true}),
  ]){
    let directory,calls=0;
    await assert.rejects(resolveWranglerOAuth(async(_command,_args,options)=>{
      calls++;directory=options.cwd;if(result instanceof Error)throw result;return result;
    }),/^Error: runner_check_oauth_unavailable$/);
    assert.equal(calls,1);await assert.rejects(stat(directory),{code:'ENOENT'});
  }
});
test('OAuth readiness uses only the exact pinned account/database/index with read-only requests',async t=>{
  const f=await fixture(t);let oauthCalls=0;
  const result=await checkCloudflareRunner({...config,cloudflareReadToken:{type:'wrangler_oauth'}},{fetch:f.fetch,
    resolveToken:async()=>assert.fail('OAuth readiness must not resolve merchant/Keychain credentials'),
    resolveWranglerOAuth:async()=>{oauthCalls++;return token;}});
  assert.equal(oauthCalls,1);assert.equal(result.status,'checks_passed_execution_unavailable');assert.equal(result.executionAvailable,false);
  assert.equal(result.metrics.reportedRowsWritten,0);assert.deepEqual(result.resources,{accountId:config.accountId,databaseId:config.database.id,
    databaseName:config.database.name,indexName:config.vectorIndex.name});
  assert.ok(f.calls.every(call=>call.url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/`)));
});
async function fixture(t,{last='0012',enabled=true}={}) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  for(const file of (await readdir(join(root,'migrations/d1'))).filter(name=>/^\d{4}.*\.sql$/.test(name)&&name.slice(0,4)<=last).sort())
    db.exec(await readFile(join(root,'migrations/d1',file),'utf8'));
  if(enabled&&last>='0009')db.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(config.environment,config.vectorIndex.name);
  const calls=[];
  const fetch=async(url,init)=>{
    calls.push({url,init});assert.equal(init.headers.Authorization,`Bearer ${token}`);assert.equal(init.redirect,'error');
    const prefix=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}`;
    if(url===`${prefix}/d1/database/${config.database.id}`){assert.equal(init.method,'GET');return ok({uuid:config.database.id,name:config.database.name});}
    if(url===`${prefix}/vectorize/v2/indexes/${config.vectorIndex.name}`){assert.equal(init.method,'GET');return ok({name:config.vectorIndex.name,config:{dimensions:1536,metric:'cosine'}});}
    assert.equal(url,`${prefix}/d1/database/${config.database.id}/query`);assert.equal(init.method,'POST');
    const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['batch']);assert.ok(body.batch.length<=32);
    return ok(body.batch.map(({sql,params})=>{
      assert.match(sql,/^(SELECT|PRAGMA table_info\()/);assert.deepEqual(params,[]);
      // D1 forbids this native SQLite diagnostic; readiness does not need it.
      assert.doesNotMatch(sql,/sqlite_version\s*\(/i);
      const results=db.prepare(sql).all();return {success:true,results,meta:{rows_read:results.length,rows_written:0,changed_db:false}};
    }));
  };
  return {db,calls,fetch,options:{fetch,resolveToken:async ref=>{assert.deepEqual(ref,config.cloudflareReadToken);return token;}}};
}

test('fixed read-only queries use documented batch envelope once, preserving result order and metrics',async()=>{
  const calls=[];const api=client(async(url,init)=>{calls.push({url,init});return ok([
    {success:true,results:[{kind:'first'}],meta:{rows_read:2,rows_written:0}},
    {success:true,results:[{kind:'second'}],meta:{rows_read:3,rows_written:0}},
  ]);});
  const result=await api.read(['capabilities','schema']);assert.deepEqual(result.map(r=>r.results[0].kind),['first','second']);
  assert.equal(calls.length,1);assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)),['batch']);
  assert.deepEqual(api.metrics(),{requests:1,reportedRowsRead:5,reportedRowsWritten:0});
  for(const query of ['UPDATE products SET is_active=1','schema;DELETE FROM products','__proto__','toString'])await assert.rejects(api.read([query]),/query_refused/);
  await assert.rejects(api.read(Array(33).fill('schema')),/query_refused/);assert.equal(calls.length,1);
});
test('read-only adapter rejects malformed config, failed/malformed envelopes or write metadata without retry/logging',async()=>{
  for(const override of [{accountId:'../evil'},{databaseId:'bad'},{indexName:'../evil'},{indexName:123},{token:'bad\r\nheader'},{timeoutMs:10001}])
    assert.throws(()=>createCloudflareReadClient({...config,accountId:config.accountId,databaseId:config.database.id,indexName:config.vectorIndex.name,token,...override}),/configuration/);
  for(const response of [()=>{throw new Error('PRIVATE_TOKEN');},()=>new Response('PRIVATE_BODY',{status:403}),()=>new Response('PRIVATE_BODY'),
    ()=>ok([{success:false,results:[]}]),()=>ok([{success:true,results:[],meta:{rows_written:1}}]),()=>ok([]),()=>ok([{success:true,results:[null]}])]){
    let calls=0;await assert.rejects(client(async()=>{calls++;return response();}).read(['schema']),/^Error: cloudflare_read_(unavailable|result_invalid)$/);assert.equal(calls,1);
  }
});
test('missing API write/cost metadata remains unknown rather than a zero-write billing claim',async()=>{
  const api=client(async()=>ok([{success:true,results:[]}]));await api.read(['schema']);
  assert.equal(api.metrics().reportedRowsWritten,null);assert.equal(api.metrics().reportedRowsRead,null);
});
test('deadlines cover a stalled fetch and body; oversized streams are cancelled',async()=>{
  for(const body of [false,true]){
    let aborted=false,cancelled=false;
    const api=createCloudflareReadClient({accountId:config.accountId,databaseId:config.database.id,indexName:config.vectorIndex.name,token,timeoutMs:10,
      fetch:async(_url,init)=>{init.signal.addEventListener('abort',()=>{aborted=true;});
        return body?new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}})):new Promise(()=>{});}});
    await assert.rejects(api.read(['schema']),/unavailable/);assert.equal(aborted,true);if(body)assert.equal(cancelled,true);
  }
  let cancelled=false;const api=client(async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(256*1024));},cancel(){cancelled=true;}})));
  await assert.rejects(api.read(['schema']),/unavailable/);assert.equal(cancelled,true);
});
test('explicit config rejects plaintext credentials, missing/wrong tag, wrong types and arbitrary Keychain references',()=>{
  assert.deepEqual(validateRunnerCheckConfig(config),config);
  for(const change of [c=>{c.token='PRIVATE';},c=>{delete c.catalog.associateTag;},c=>{c.catalog.associateTag='?tag=bad';},
    c=>{c.database.name=null;},c=>{c.vectorIndex.name=123;},c=>{c.vectorIndex.dimensions=768;},
    c=>{c.vectorIndex.metric='euclidean';},c=>{c.vectorIndex.metric='dot-product';},
    c=>{c.cloudflareReadToken.service='unrelated.service';},c=>{c.cloudflareReadToken.account='-w';}]){
    const c=structuredClone(config);change(c);assert.throws(()=>validateRunnerCheckConfig(c),/config_invalid/);
  }
});
test('Keychain lookup is exact, bounded and read-only with no fallback or secret-bearing errors',async()=>{
  const calls=[];const run=async(...args)=>{calls.push(args);return{stdout:`${token}\n`};};
  assert.equal(await resolveReadToken(config.cloudflareReadToken,run),token);assert.equal(calls.length,1);
  assert.deepEqual(calls[0].slice(0,2),['/usr/bin/security',['find-generic-password','-s',config.cloudflareReadToken.service,'-a','test-only','-w']]);
  assert.equal(calls[0][2].timeout,3000);assert.equal(calls[0][2].maxBuffer,8192);
  await assert.rejects(resolveReadToken(config.cloudflareReadToken,async()=>{throw new Error('PRIVATE_KEYCHAIN_VALUE');}),/^Error: runner_check_keychain_unavailable$/);
  await assert.rejects(resolveReadToken({service:'wrong',account:'test'},run),/reference/);assert.equal(calls.length,1);
});
test('current schema + idle singleton passes read checks but never advertises execution; no DB changes',async t=>{
  const f=await fixture(t);const changes=f.db.prepare('SELECT total_changes() n').get().n;
  const result=await checkCloudflareRunner(config,f.options);
  assert.equal(result.status,'checks_passed_execution_unavailable');assert.equal(result.executionAvailable,false);assert.deepEqual(result.issues,[]);
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n,changes);assert.equal(result.metrics.reportedRowsWritten,0);
  assert.equal(f.calls.length,5);assert.ok(result.limitations.some(v=>v.includes('REST write-atomicity')));
  assert.doesNotMatch(JSON.stringify(result),new RegExp(`${token}|fixture-only-tag|owner_token`));
});
test('schema gaps, missing ownership, busy scope, wrong environment and pending work stay blocked',async t=>{
  const old=await fixture(t,{last:'0008'});const missing=await checkCloudflareRunner(config,old.options);
  assert.equal(missing.status,'blocked');assert.ok(missing.issues.includes('missing_table:catalog_mutation_scopes'));assert.equal(missing.ownership,null);
  for(const change of [f=>f.db.exec('DELETE FROM catalog_mutation_scopes'),
    f=>f.db.exec("UPDATE catalog_mutation_scopes SET environment='production'"),
    f=>f.db.exec("UPDATE catalog_mutation_scopes SET phase='writing',owner_token='PRIVATE',owner_reference='private',operation_key='private',captured_at='2026-10-20T00:00:00.000Z'"),
    f=>f.db.exec('DROP TRIGGER catalog_run_telemetry_immutable'),
    f=>f.db.exec("INSERT INTO catalog_runs(id,status,mode,dry_run,started_at,source_record_json) VALUES('running','running','weekly',0,'2026-10-20T00:00:00.000Z','{}')")]){
    const f=await fixture(t);change(f);const result=await checkCloudflareRunner(config,f.options);
    assert.equal(result.status,'blocked');assert.ok(result.issues.length);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
  }
});
test('wrong D1 name/UUID and Vectorize name/dimensions/metric refuse before catalog SQL',async t=>{
  for(const wrong of [{uuid:'bad',name:config.database.name},{uuid:config.database.id,name:'other'},
    {name:'other',config:{dimensions:1536,metric:'cosine'}},{name:config.vectorIndex.name,config:{dimensions:768,metric:'cosine'}},
    {name:config.vectorIndex.name,config:{dimensions:1536,metric:'dot-product'}}]){
    const f=await fixture(t);let sql=0;
    await assert.rejects(checkCloudflareRunner(config,{...f.options,fetch:async(url,init)=>{
      if(init.method==='POST')sql++;
      if(wrong.uuid&&url.endsWith(config.database.id)||!wrong.uuid&&url.endsWith(config.vectorIndex.name))return ok(wrong);
      return f.fetch(url,init);
    }}),/mismatch/);assert.equal(sql,0);
  }
});
test('reviewed-config hash and private output are required; receipts are0600 and cannot overwrite, failures stay redacted',async t=>{
  const f=await fixture(t);const directory=await mkdtemp(join(tmpdir(),'goose-runner-check-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await chmod(directory,0o700);const configPath=join(directory,'config.json'),body=JSON.stringify(config);
  await writeFile(configPath,body,{mode:0o600});const options={configPath,configSha256:hash(body),repository:root,output:join(directory,'check')};
  await assert.rejects(writeRunnerCheck({...options,configSha256:'0'.repeat(64)},f.options),/config_digest/);assert.equal(f.calls.length,0);
  const result=await writeRunnerCheck(options,f.options);const bytes=await readFile(join(result.output,'receipt.json'),'utf8');
  assert.equal(result.receiptSha256,hash(bytes));assert.equal((await stat(join(result.output,'receipt.json'))).mode&0o777,0o600);
  assert.equal((await stat(result.output)).mode&0o777,0o700);assert.equal(JSON.parse(bytes).reviewedConfigSha256,hash(body));
  assert.doesNotMatch(bytes,new RegExp(`${token}|fixture-only-tag|owner_token`));await assert.rejects(writeRunnerCheck(options,f.options),/EEXIST/);
  const failed=await writeRunnerCheck({...options,output:join(directory,'failed')},{resolveToken:async()=>{throw new Error('PRIVATE_AUTH_VALUE');}});
  assert.equal(failed.status,'failed');assert.doesNotMatch(await readFile(join(failed.output,'receipt.json'),'utf8'),/PRIVATE_AUTH_VALUE/);
  await chmod(configPath,0o644);await assert.rejects(writeRunnerCheck({...options,output:join(directory,'unsafe')},f.options),/protection/);
});
test('public output parents, Git destinations and symlinked config refuse before Keychain/network',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'goose-runner-boundary-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const configPath=join(directory,'config.json'),body=JSON.stringify(config);await writeFile(configPath,body,{mode:0o600});
  const options={configPath,configSha256:hash(body),repository:root,output:join(root,'forbidden-runner-check')};
  const dependencies={resolveToken:async()=>{throw new Error('Keychain must not be touched');}};
  await assert.rejects(writeRunnerCheck(options,dependencies),/inside the repository/);
  const publicParent=join(directory,'public');await mkdir(publicParent);await chmod(publicParent,0o755);
  await assert.rejects(writeRunnerCheck({...options,output:join(publicParent,'receipt')},dependencies),/parent must be private/);
  const link=join(directory,'config-link.json');await symlink(configPath,link);
  await assert.rejects(writeRunnerCheck({...options,configPath:link,output:join(directory,'symlink-check')},dependencies),/protection/);
});
test('CLI import/help/execute refusal cannot call a provider, bootstrap secrets or replace the weekly helper',()=>{
  const file=join(root,'scripts/catalog/check-cloudflare-runner.ts');
  const help=execFileSync(process.execPath,['--import','tsx',file,'--help'],{encoding:'utf8'});
  assert.match(help,/Read-only readiness only/);assert.doesNotMatch(help,/--execute/);
  assert.throws(()=>execFileSync(process.execPath,['--import','tsx',file,'--execute'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}),error=>{
    assert.equal(error.status,1);assert.equal(error.stdout,'');assert.match(error.stderr,/execution is unavailable/);return true;
  });
});
