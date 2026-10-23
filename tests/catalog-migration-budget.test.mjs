import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';
import {createOneTimeMigrationBudget,assertOneTimeMigrationBudget,MIGRATION_HEADROOM} from '../scripts/catalog/one-time-migration-budget.ts';
import {createCatalogD1Rest,createCatalogD1MigrationRest,CATALOG_D1_REST_LIMITS} from '../scripts/catalog/d1-write-rest.ts';
import {openRunWorkspace} from '../scripts/catalog/run-workspace.ts';

const AT='2026-10-22T08:26:28.000Z';
const scope={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001',databaseName:'migration-fixture'};
const zero=()=>({httpRequests:0,sqlStatements:0,knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:0});
const config={...scope,token:'LOCAL_FIXTURE_ONLY'};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live network forbidden');};
test.after(()=>{globalThis.fetch=originalFetch;});
function input(){return{scope:{...scope},observations:[{accountId:scope.accountId,utcDay:'2026-10-22',capturedAt:AT,coverage:'account-wide',
  resources:[scope.databaseId],rowsRead:43284,rowsWritten:235,evidenceSha256:sha256('synthetic account-usage receipt')}],ledgerAtObservation:zero(),
  required:{requests:50,statements:2000,rowsRead:100000,rowsWritten:20000,evidenceSha256:sha256('synthetic WHOLE-run cost receipt')}};}
function budget(data=input()){return createOneTimeMigrationBudget(data,new Date(AT));}
function transport(){let calls=0,unknown=false;const send=async(_url,init)=>{
  calls++;assert.equal(init.redirect,'error');
  if(!init.body)return Response.json({success:true,result:{uuid:scope.databaseId,name:scope.databaseName,read_replication:{mode:'disabled'}}});
  const {batch}=JSON.parse(init.body);if(unknown){unknown=false;throw new Error('Synthetic lost response');}
  return Response.json({success:true,result:batch.map(q=>({success:true,results:q.sql==='SELECT 1 AS catalog_d1_primary'?[{catalog_d1_primary:1}]:[],
    meta:{served_by_primary:true,rows_read:1,rows_written:q.sql.startsWith('INSERT')?12001:0}}))});
};return{send,calls:()=>calls,lose(){unknown=true;}};}
function accounting(initial=zero()){
  const state=structuredClone(initial),events=[];
  return{state,events,value:{scope:{...scope},initial:structuredClone(initial),async reserve(r){events.push(['reserve',r.id]);state.httpRequests++;
    state.sqlStatements+=r.units.sqlStatements;state.unconfirmedRequests++;},async settle(id,s){events.push([s.status,id]);
    if(s.status==='known'){state.unconfirmedRequests--;state.knownRowsRead+=s.usage.rowsRead;state.knownRowsWritten+=s.usage.rowsWritten;}}}};
}

test('one-time headroom is derived from verified account-wide maximum, not a reset or recurring cap',()=>{
  const b=budget();assert.deepEqual(b.profile.limits,{requests:50,statements:2000,reportedRowsRead:100000,reportedRowsWritten:20000});
  assert.deepEqual(MIGRATION_HEADROOM,{rowsRead:1000000,rowsWritten:10000});
  assert.equal(b.profile.expiresAt,'2026-10-23T00:00:00.000Z');assertOneTimeMigrationBudget(b.profile,b.sha256,new Date(AT));
  const data=input();data.observations[0].rowsWritten=10000;
  data.observations.push({...data.observations[0],capturedAt:'2026-10-22T08:26:29.000Z',rowsWritten:9000});
  data.ledgerAtObservation={...zero(),httpRequests:5,sqlStatements:10,knownRowsWritten:5000};
  const anchored=createOneTimeMigrationBudget(data,new Date('2026-10-22T08:26:29.000Z'));
  assert.equal(anchored.profile.limits.reportedRowsWritten,25000); // 5k anchor + only the requested 20k allowance.
  assert.deepEqual(data.ledgerAtObservation,{...zero(),httpRequests:5,sqlStatements:10,knownRowsWritten:5000});
  const small=input();Object.assign(small.required,{requests:4,statements:4,rowsRead:3,rowsWritten:1});
  assert.deepEqual(budget(small).profile.limits,{requests:4,statements:4,reportedRowsRead:3,reportedRowsWritten:1});
});

test('unknown, stale, foreign, insufficient or over-hard whole-run inputs refuse',()=>{
  const changes=[
    d=>{d.observations[0].rowsWritten=null;},d=>{d.observations[0].rowsRead=-1;},d=>{d.observations[0].coverage='one-database';},
    d=>{d.observations[0].accountId='b'.repeat(32);},d=>{d.observations[0].resources=[];},d=>{d.observations[0].resources=['unknown'];},
    d=>{d.observations[0].resources.push(scope.databaseId);},d=>{d.scope.databaseName=undefined;},
    d=>{d.observations[0].utcDay='2026-10-21';},d=>{d.observations[0].capturedAt='2026-10-21T23:59:59.000Z';},
    d=>{d.observations[0].capturedAt='2026-10-22T08:21:27.999Z';},d=>{d.observations[0].capturedAt='2026-10-22T08:26:29.000Z';},
    d=>{d.observations[0].rowsWritten=70001;},d=>{d.observations[0].rowsRead=4000001;},
    d=>{d.required.requests=0;},d=>{d.required.statements=0;},
    d=>{d.required.requests=10001;},d=>{d.required.statements=25001;},d=>{d.required.rowsWritten=89766;},
    d=>{d.required.rowsWritten=0;},d=>{d.required.rowsRead=0;},d=>{d.required.rowsWritten=1.5;},
    d=>{d.required.evidenceSha256='not-pinned';},d=>{d.ledgerAtObservation={...zero(),httpRequests:1,unconfirmedRequests:1};},
  ];
  for(const change of changes){const data=input();change(data);assert.throws(()=>budget(data));}
});

test('profile tampering, wrong day and invalid clock refuse without renewal or automatic growth',()=>{
  const b=budget(),changed=structuredClone(b.profile);changed.limits.reportedRowsWritten++;
  assert.throws(()=>assertOneTimeMigrationBudget(changed,b.sha256,new Date(AT)));
  assert.throws(()=>assertOneTimeMigrationBudget(changed,sha256(canonicalJson(changed)),new Date(AT)));
  assert.throws(()=>assertOneTimeMigrationBudget(b.profile,b.sha256,new Date('2026-10-22T08:26:27.999Z')));
  assert.throws(()=>assertOneTimeMigrationBudget(b.profile,b.sha256,new Date('2026-10-23T00:00:00.000Z')));
  assert.throws(()=>assertOneTimeMigrationBudget(b.profile,b.sha256,new Date('invalid')));
  assertOneTimeMigrationBudget(b.profile,b.sha256,new Date('2026-10-22T23:59:59.999Z'));
});

test('ordinary write default stays10k; an explicit finite50k profile is allowed, never selected automatically',async()=>{
  const send=transport();
  await assert.rejects(createCatalogD1Rest({...config,fetch:send.send,limits:{reportedRowsWritten:50001}}),/configuration_invalid/);
  assert.equal(send.calls(),0);assert.equal(CATALOG_D1_REST_LIMITS.reportedRowsWritten,10000);
  const ordinary=await createCatalogD1Rest({...config,fetch:send.send});
  await assert.rejects(ordinary.prepare('INSERT INTO fixture VALUES(1)').run(),/reported_usage_exceeded/);
  assert.equal(ordinary.metrics().reportedRowsWritten,12001);const calls=send.calls();
  await assert.rejects(ordinary.prepare('SELECT 1').all(),/budget_exhausted/);assert.equal(send.calls(),calls);
  const explicit=await createCatalogD1Rest({...config,fetch:send.send,limits:{reportedRowsWritten:50000}});
  await explicit.prepare('INSERT INTO fixture VALUES(1)').run();assert.equal(explicit.metrics().reportedRowsWritten,12001);
  assert.equal(CATALOG_D1_REST_LIMITS.reportedRowsWritten,10000);
});

test('dedicated migration factory enforces its reviewed20k profile and durable accounting',async()=>{
  const send=transport(),a=accounting(),b=budget();
  const db=await createCatalogD1MigrationRest({...config,budget:b,ledger:zero(),accounting:a.value,fetch:send.send,now:()=>new Date(AT)});
  await db.prepare('INSERT INTO fixture VALUES(1)').run();assert.equal(db.metrics().reportedRowsWritten,12001);
  assert.equal(a.state.knownRowsWritten,12001);assert.equal(a.state.httpRequests,send.calls());
  assert.equal(a.events.filter(e=>e[0]==='reserve').length,send.calls());assert.equal(a.state.unconfirmedRequests,0);
  await assert.rejects(db.prepare('INSERT INTO fixture VALUES(2)').run(),/reported_usage_exceeded/);
  assert.equal(a.state.knownRowsWritten,24002);const calls=send.calls();
  await assert.rejects(db.prepare('SELECT 1').all(),/budget_exhausted/);assert.equal(send.calls(),calls);
});

test('missing/mismatched accounting, ledger rollback, unknown resources and caller cap overrides have zero IO',async()=>{
  const send=transport(),a=accounting(),b=budget(),base={...config,budget:b,ledger:zero(),accounting:a.value,fetch:send.send,now:()=>new Date(AT)};
  for(const change of [{accounting:undefined},{ledger:{...zero(),httpRequests:1}},
    {databaseId:'00000000-0000-4000-8000-000000000099'},{accountId:'b'.repeat(32)},
    {limits:{reportedRowsWritten:100000}},{budget:{...b,extra:true}}])await assert.rejects(createCatalogD1MigrationRest({...base,...change}),/migration_budget_refused/);
  const data=input();data.ledgerAtObservation={...zero(),httpRequests:2,sqlStatements:1};
  await assert.rejects(createCatalogD1MigrationRest({...base,budget:budget(data)}),/migration_budget_refused/);
  assert.equal(send.calls(),0);assert.equal(a.events.length,0);
});

test('UTC boundary and later accounting scope loss stop before any new reservation or dispatch',async()=>{
  const send=transport(),a=accounting(),b=budget();let clock=new Date(AT);
  const db=await createCatalogD1MigrationRest({...config,budget:b,ledger:zero(),accounting:a.value,fetch:send.send,now:()=>clock});
  const before=structuredClone(a.state),calls=send.calls();clock=new Date(b.profile.expiresAt);
  await assert.rejects(db.prepare('SELECT 1').all(),/migration_budget_refused/);assert.deepEqual(a.state,before);assert.equal(send.calls(),calls);
  clock=new Date(AT);a.value.scope.databaseName='foreign';
  await assert.rejects(db.prepare('SELECT 1').all(),/migration_budget_refused/);assert.deepEqual(a.state,before);assert.equal(send.calls(),calls);
});

test('a midnight crossing during durable reservation is charged once, joined and never dispatched',async()=>{
  const send=transport(),a=accounting(),b=budget();let clock=new Date(AT),cross=false;const reserve=a.value.reserve;
  a.value.reserve=async r=>{await reserve(r);if(cross)clock=new Date(b.profile.expiresAt);};
  const db=await createCatalogD1MigrationRest({...config,budget:b,ledger:zero(),accounting:a.value,fetch:send.send,now:()=>clock});
  cross=true;const calls=send.calls();
  await assert.rejects(db.prepare('SELECT 1').all(),/catalog_d1_result_unknown/);
  assert.equal(send.calls(),calls);assert.equal(a.state.httpRequests,calls+1);assert.equal(a.state.unconfirmedRequests,1);
  assert.equal(a.events.filter(e=>e[0]==='unknown').length,1);
});

test('real workspace reopen retains all charges and unknown units under the exact original profile',async t=>{
  const parent=await realpath(await mkdtemp(join(tmpdir(),'sg-migration-budget-'))),b=budget(),send=transport();
  const options={directory:join(parent,'runs'),repository:await realpath(new URL('..',import.meta.url).pathname),runId:'synthetic-one-time-migration',
    configSha256:sha256(canonicalJson(b)),codeSha:'e'.repeat(40),scope:{...scope,environment:'production',workerName:'fixture-worker',indexName:'fixture-index'},
    retention:{reviewReference:'synthetic/local-only',rules:Object.fromEntries(['amazon-observation','embedding-response','phase','publication','checkpoint']
      .map(k=>[k,{maxAgeMs:86400000,notAfter:'2026-10-23T00:00:00.000Z'}]))},
    budgetCaps:{httpRequests:b.profile.limits.requests,sqlStatements:b.profile.limits.statements},now:()=>AT};
  let ws=await openRunWorkspace({...options,mode:'create'});t.after(async()=>{await ws.close();await rm(parent,{recursive:true,force:true});});
  async function connect(){const ledger=await ws.budget();return createCatalogD1MigrationRest({...config,budget:b,ledger,fetch:send.send,now:()=>new Date(AT),
    accounting:{scope,initial:ledger,reserve:r=>ws.reserveBudget(r),settle:(id,s)=>ws.settleBudget(id,s)}});}
  const first=await connect();await first.prepare('INSERT INTO fixture VALUES(1)').run();send.lose();
  await assert.rejects(first.prepare('INSERT INTO fixture VALUES(2)').run(),/result_unknown/);
  const before=await ws.budget();assert.equal(before.unconfirmedRequests,1);assert.equal(before.knownRowsWritten,12001);
  const manifest=ws.manifestSha256;await ws.close();ws=await openRunWorkspace({...options,mode:'resume',expectedManifestSha256:manifest});
  assert.deepEqual(await ws.budget(),before);const next=await connect();assert.equal(next.metrics().unconfirmedRequests,1);
  assert.equal((await ws.budget()).httpRequests,before.httpRequests+2);assert.equal((await ws.budget()).knownRowsWritten,12001);
  assert.equal(ws.manifestSha256,manifest);assert.deepEqual(await ws.budgetCeiling(),options.budgetCaps);
});
