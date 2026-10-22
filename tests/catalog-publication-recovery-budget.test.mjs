import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';
import {createOneTimeMigrationBudget,MIGRATION_HEADROOM} from '../scripts/catalog/one-time-migration-budget.ts';
import {createPublicationRecoveryBudget,assertPublicationRecoveryBudget} from '../scripts/catalog/publication-recovery-budget.ts';
import {createCatalogD1PublicationRecoveryRest} from '../scripts/catalog/d1-write-rest.ts';

const AT='2026-10-22T15:00:00.000Z';
const scope={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001',databaseName:'publication-fixture'};
const zero={httpRequests:0,sqlStatements:0,knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:0};
const old=createOneTimeMigrationBudget({scope,observations:[{accountId:scope.accountId,utcDay:AT.slice(0,10),capturedAt:AT,
  coverage:'account-wide',resources:[scope.databaseId],rowsRead:0,rowsWritten:0,evidenceSha256:sha256('old usage')}],
  ledgerAtObservation:zero,required:{requests:4000,statements:12000,rowsRead:3000000,rowsWritten:39000,evidenceSha256:sha256('old whole-run proof')}},new Date(AT));
const anchor={httpRequests:2851,sqlStatements:6460,knownRowsRead:2954283,knownRowsWritten:21464,unconfirmedRequests:7};
function input(){return{prior:structuredClone(old),ledgerAtApproval:structuredClone(anchor),
  usage:{accountId:scope.accountId,utcDay:AT.slice(0,10),capturedAt:AT,coverage:'account-wide',resources:[scope.databaseId],
    rowsRead:4095249,rowsWritten:69870,evidenceSha256:sha256('fresh account-wide usage')},
  approval:{sha256:sha256('synthetic explicit approval ONLY'),additionalRowsRead:600000,minimumFreeRowsRead:300000},
  retainedUnknowns:{count:7,evidenceSha256:sha256('all seven unknowns classified read-only or non-D1'),unknownD1Writes:0},
  batchBound:{rowsRead:80000,rowsWritten:1000,evidenceSha256:sha256('synthetic reviewed maximum batch proof'),
    statements:[{sha256:sha256('SELECT 1 AS catalog_d1_primary'),rowsRead:1,rowsWritten:0},
      {sha256:sha256('SELECT 1'),rowsRead:80000,rowsWritten:0}]}};}
const budget=(value=input())=>createPublicationRecoveryBudget(value,new Date(AT));
const live=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Live network forbidden');};test.after(()=>{globalThis.fetch=live;});
function fixture(initial=anchor){
  const state=structuredClone(initial);let calls=0,read=1,written=0,lose=false,delay;
  const reservations=new Map(),history=[];
  const accounting={scope:{...scope},initial:structuredClone(initial),async reserve(r){
    reservations.set(r.id,r);
    state.httpRequests++;state.sqlStatements+=r.units.sqlStatements;state.unconfirmedRequests++;
  },async settle(id,r){if(r.status==='known'){state.unconfirmedRequests--;state.knownRowsRead+=r.usage.rowsRead;state.knownRowsWritten+=r.usage.rowsWritten;
    history.push({id,sqlStatements:reservations.get(id).units.sqlStatements,rowsRead:r.usage.rowsRead,rowsWritten:r.usage.rowsWritten});}}};
  const send=async(_url,init)=>{calls++;
    if(!init.body)return Response.json({success:true,result:{uuid:scope.databaseId,name:scope.databaseName,read_replication:{mode:'disabled'}}});
    if(delay)await delay;if(lose){lose=false;throw new Error('Synthetic lost result');}
    const {batch}=JSON.parse(init.body);return Response.json({success:true,result:batch.map(q=>({success:true,
      results:q.sql==='SELECT 1 AS catalog_d1_primary'?[{catalog_d1_primary:1}]:[],
      meta:{served_by_primary:true,rows_read:read,rows_written:written}}))});};
  return{state,accounting,history,send,calls:()=>calls,cost(r,w=0){read=r;written=w;},lose(){lose=true;},delay(value){delay=value;}};
}
const options=(f,b=budget())=>({...scope,token:'SYNTHETIC_ONLY',budget:b,ledger:structuredClone(f.accounting.initial),
  accounting:f.accounting,settlements:structuredClone(f.history),fetch:f.send,now:()=>new Date(AT)});

test('a separate approved allowance preserves parent caps, all old charges and the default safety margin',()=>{
  const b=budget();assertPublicationRecoveryBudget(b.profile,b.sha256,new Date(AT));
  assert.deepEqual(b.profile.limits,{requests:4000,statements:12000,reportedRowsRead:3554283,reportedRowsWritten:39000});
  assert.deepEqual(b.profile.input.ledgerAtApproval,anchor);assert.deepEqual(b.profile.input.prior,old);
  assert.deepEqual(MIGRATION_HEADROOM,{rowsRead:1000000,rowsWritten:10000});
  assert.equal(b.profile.expiresAt,old.profile.expiresAt);
});
test('missing approval, insufficient account capacity, unknown writes, stale usage and widened caps refuse',()=>{
  const changes=[d=>{d.approval.sha256='';},d=>{d.approval.additionalRowsRead=600001;},d=>{d.approval.minimumFreeRowsRead=299999;},
    d=>{d.usage.rowsRead=4100001;},d=>{d.usage.rowsWritten=72465;},d=>{d.usage.coverage='one-database';},
    d=>{d.usage.capturedAt='2026-10-22T14:54:59.999Z';},d=>{d.usage.capturedAt='2026-10-22T15:00:00.001Z';},
    d=>{d.usage.resources=[];},d=>{d.usage.resources.push(scope.databaseId);},d=>{d.usage.accountId='b'.repeat(32);},
    d=>{d.retainedUnknowns.count=6;},d=>{d.retainedUnknowns.unknownD1Writes=1;},d=>{d.retainedUnknowns.evidenceSha256='';},
    d=>{d.batchBound.rowsRead=80001;},d=>{d.batchBound.rowsWritten=1001;},d=>{d.batchBound.evidenceSha256='';},
    d=>{d.batchBound.statements=[];},d=>{d.batchBound.statements[0].rowsRead=80001;},
    d=>{d.batchBound.statements.push(d.batchBound.statements[0]);},
    d=>{d.prior.profile.limits.requests++;},d=>{d.ledgerAtApproval.httpRequests=4000;}];
  for(const change of changes){const d=input();change(d);assert.throws(()=>budget(d));}
});
test('tampering and UTC rollover cannot refresh or re-anchor an allowance',()=>{
  const b=budget(),changed=structuredClone(b.profile);changed.limits.reportedRowsRead++;
  assert.throws(()=>assertPublicationRecoveryBudget(changed,b.sha256,new Date(AT)));
  assert.throws(()=>assertPublicationRecoveryBudget(changed,sha256(canonicalJson(changed)),new Date(AT)));
  assert.throws(()=>assertPublicationRecoveryBudget(b.profile,b.sha256,new Date('2026-10-23T00:00:00.000Z')));
});
test('recovery retains old unknowns and reserves maximum next-batch cost before IO, not after overspend',async()=>{
  const f=fixture(),db=await createCatalogD1PublicationRecoveryRest(options(f));
  assert.equal(db.metrics().unconfirmedRequests,7);assert.equal(f.state.unconfirmedRequests,7);
  f.cost(80000);for(let i=0;i<6;i++)await db.prepare('SELECT 1').all();
  f.cost(40000);await db.prepare('SELECT 1').all(); // 520001 consumed; another80k cannot fit.
  const calls=f.calls(),charged=structuredClone(f.state);
  await assert.rejects(db.prepare('SELECT 1').all(),/budget/);assert.equal(f.calls(),calls);assert.deepEqual(f.state,charged);
  assert.equal(f.state.knownRowsRead,anchor.knownRowsRead+520001);assert.equal(f.state.unconfirmedRequests,7);
});
test('any new unknown is retained, stops all further IO, and prevents reopening against the same grant',async()=>{
  const f=fixture(),b=budget(),db=await createCatalogD1PublicationRecoveryRest(options(f,b));f.lose();
  await assert.rejects(db.prepare('SELECT 1').all(),/result_unknown/);const calls=f.calls();
  assert.equal(f.state.unconfirmedRequests,8);
  await assert.rejects(db.prepare('SELECT 1').all(),/budget/);assert.equal(f.calls(),calls);
  const next=fixture(f.state);await assert.rejects(createCatalogD1PublicationRecoveryRest(options(next,b)),/budget/);assert.equal(next.calls(),0);
});
test('an unexpectedly expensive response remains fully charged and stops this client',async()=>{
  const f=fixture(),b=budget(),db=await createCatalogD1PublicationRecoveryRest(options(f,b));f.cost(80001);
  await assert.rejects(db.prepare('SELECT 1').all(),/accounting_unknown/);const calls=f.calls();
  assert.equal(f.state.knownRowsRead,anchor.knownRowsRead+80002);assert.equal(f.state.unconfirmedRequests,7);
  await assert.rejects(db.prepare('SELECT 1').all(),/budget/);assert.equal(f.calls(),calls);
  const next=fixture(f.state);next.history.push(...f.history);
  await assert.rejects(createCatalogD1PublicationRecoveryRest(options(next,b)),/budget/);assert.equal(next.calls(),0);
});
test('resume reconciles every durable charge to the original anchor, not a fresh allowance',async()=>{
  const f=fixture(),b=budget(),db=await createCatalogD1PublicationRecoveryRest(options(f,b));f.cost(40000);await db.prepare('SELECT 1').all();
  const next=fixture(f.state);next.history.push(...f.history);
  const resumed=await createCatalogD1PublicationRecoveryRest(options(next,b));
  assert.equal(resumed.metrics().unconfirmedRequests,7);assert.equal(next.state.knownRowsRead,anchor.knownRowsRead+40002);
  for(const change of [o=>{o.settlements.pop();},o=>{o.settlements[0].rowsRead++;},o=>{o.settlements[1].id=o.settlements[0].id;}]){
    const g=fixture(f.state);g.history.push(...structuredClone(f.history));const o=options(g,b);change(o);
    await assert.rejects(createCatalogD1PublicationRecoveryRest(o),/budget/);assert.equal(g.calls(),0);
  }
});
test('parallel queries cannot both consume the same maximum-next-batch headroom',async()=>{
  const f=fixture(),db=await createCatalogD1PublicationRecoveryRest(options(f));let release;
  f.delay(new Promise(resolve=>{release=resolve;}));const first=db.prepare('SELECT 1').all();
  await new Promise(resolve=>setImmediate(resolve));const calls=f.calls();
  await assert.rejects(db.prepare('SELECT 1').all(),/budget/);assert.equal(f.calls(),calls);release();await first;
});
test('unreviewed SQL and batches exceeding the reviewed cost sum refuse before reservation or IO',async()=>{
  const f=fixture(),db=await createCatalogD1PublicationRecoveryRest(options(f)),before=structuredClone(f.state),calls=f.calls();
  await assert.rejects(db.prepare('SELECT * FROM arbitrary_unbounded_table').all(),/sql_unreviewed/);
  await assert.rejects(db.batch([db.prepare('SELECT 1'),db.prepare('SELECT 1')]),/batch_unreviewed/);
  assert.equal(f.calls(),calls);assert.deepEqual(f.state,before);
});
test('foreign scopes, rollback and extra caller cap overrides have zero IO',async()=>{
  for(const change of [o=>{o.databaseName='foreign';},o=>{o.ledger.knownRowsRead--;},
    o=>{o.limits={reportedRowsRead:5000000};},o=>{o.accounting.scope.databaseId='00000000-0000-4000-8000-000000000099';}]){
    const f=fixture(),o=options(f);change(o);await assert.rejects(createCatalogD1PublicationRecoveryRest(o),/budget/);assert.equal(f.calls(),0);
  }
});
