import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {heldCatalogCommand,validateHeldCommandConfig,HELD_CLEANUP_LIMITS,assertHeldFreeCapacity,transitionHeldOwner,releaseHeldOwner} from '../scripts/catalog/held-catalog-command.mts';
import {createOneTimeMigrationBudget} from '../scripts/catalog/one-time-migration-budget.ts';
import {claimMutationOwnership,readMutationOwner,releaseMutationOwnership} from '../lib/catalog/mutation-fence.ts';
import {approvedCohortOperationKey} from '../lib/catalog/freeze-approved-cohort.ts';
import {canonicalJson,sha256} from '../scripts/catalog/migration.ts';

const NOW='2026-10-25T06:00:00.000Z',hash=v=>sha256(canonicalJson(v)),h='a'.repeat(64),base=join(homedir(),'.codex/private/goose-gifts-migration');
function config(){const code='a'.repeat(40),runId='owner-held-synthetic',repository='/synthetic/repository';
  const previous={control:{path:base+'/old/control.json',sha256:h},versionReference:'00000000-0000-4000-8000-000000000001',manifestSha256:h};
  return{schemaVersion:1,kind:'owner-held-catalog-publication',repository,codeSha:code,runId,workspaceDirectory:base+'/weekly-runs',careDirectory:base+'/daily-catalog-care',
    outputDirectory:base+'/daily-catalog-care/synthetic-cleanup',baseline:{path:base+'/old/catalog.snapshot.json',sha256:h},previous,authorization:{path:base+'/authorization.json',sha256:h},
    createdAt:NOW,cutoff:'2026-10-25T12:00:00.000Z',notAfter:'2026-10-26T06:00:00.000Z',publication:{schemaVersion:1,environment:'production',
      accountId:'7f05a1dcb6e16f9c239564a0293bbe74',workerName:'stupid-gifts-production',database:{id:'77b30f85-c57c-4acb-a0df-53368806c2a6',name:'stupid-gifts-production'},
      indexName:'stupid-gifts-production',codeSha:code,sourceMode:'stupid-production',sourceRoot:repository,releaseId:runId,identityOrigin:'https://stupid.gifts',compatibilityDate:'2026-10-19',
      prior:{directory:null,releaseId:'accepted-previous',manifestSha256:h,versionReference:previous.versionReference},semanticSearch:{enabled:false,dailyRequestCap:50,dailyTokenCap:32768}}};
}
test('one-time command pins actual source, accepted baseline/previous and sole canonical workspace without altering routine caps',()=>{
  const c=config();assert.deepEqual(validateHeldCommandConfig(c),c);assert.deepEqual(HELD_CLEANUP_LIMITS,{requests:9000,statements:22000,rowsRead:2000000,rowsWritten:50000});
  for(const mutate of [x=>x.extra=true,x=>x.runId='daily-reset',x=>x.workspaceDirectory=base+'/another-lock',x=>x.careDirectory=base+'/other',
    x=>x.outputDirectory=base+'/not-a-direct-care-child',x=>x.publication.sourceRoot='/different',x=>x.publication.codeSha='b'.repeat(40),
    x=>x.publication.database.id='00000000-0000-4000-8000-000000000001',x=>x.publication.semanticSearch.enabled=true,
    x=>x.publication.prior.versionReference='wrong',x=>x.publication.prior.directory='/old-build',x=>x.cutoff='2026-10-25T12:00:00.001Z',x=>x.notAfter='2026-10-26T06:00:00.001Z']){
    const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateHeldCommandConfig(bad));
  }
});
test('account-wide guard keeps uncertainty/shared headroom, original charges and same-day finite profile',()=>{
  const scope={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001',databaseName:'synthetic'};
  const usage={accountId:scope.accountId,utcDay:NOW.slice(0,10),capturedAt:NOW,coverage:'account-wide',resources:[scope.databaseId],rowsRead:100000,rowsWritten:10000,evidenceSha256:h};
  const initial={httpRequests:1,sqlStatements:0,knownRowsRead:0,knownRowsWritten:0,unconfirmedRequests:0};
  const {profile}=createOneTimeMigrationBudget({scope,observations:[usage],ledgerAtObservation:initial,required:{...HELD_CLEANUP_LIMITS,evidenceSha256:h}},new Date(NOW));
  assert.doesNotThrow(()=>assertHeldFreeCapacity(profile,usage,initial));
  const spent={...initial,httpRequests:4600,sqlStatements:13200,knownRowsRead:128000,knownRowsWritten:41797};
  assert.doesNotThrow(()=>assertHeldFreeCapacity(profile,{...usage,rowsRead:228000,rowsWritten:51797},spent));
  for(const [u,s] of [[{...usage,rowsRead:1500001},initial],[{...usage,rowsWritten:35001},initial],[usage,{...spent,unconfirmedRequests:1}],
    [{...usage,utcDay:'2026-10-26'},spent]])assert.throws(()=>assertHeldFreeCapacity(profile,u,s),/free_capacity/);
  assert.equal(spent.knownRowsWritten,41797);assert.equal(profile.limits.reportedRowsWritten,50000);
});
async function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const f of(await readdir(new URL('../migrations/d1/',import.meta.url))).filter(v=>/^00\d\d_.*\.sql$/.test(v)).sort())sql.exec(await readFile(new URL('../migrations/d1/'+f,import.meta.url),'utf8'));
  const scope={environment:'staging',indexName:'fixture'},owner={...scope,phase:'writing',ownerReference:'synthetic',operationKey:h,token:'synthetic-token',generation:4,epoch:12,capturedAt:NOW};
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name,owner_token,generation,mutation_epoch,phase,owner_reference,operation_key,captured_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(scope.environment,scope.indexName,owner.token,owner.generation,owner.epoch,owner.phase,owner.ownerReference,owner.operationKey,NOW);
  let loseAck=false,batches=0;
  const db={prepare(query){return{params:[],bind(...p){this.params=p;return this;},async all(){return{results:sql.prepare(query).all(...this.params).map(r=>({...r}))};},async run(){return sql.prepare(query).run(...this.params);},query};},
    async batch(stmts){batches++;sql.exec('BEGIN');try{for(const q of stmts)sql.prepare(q.query).all(...q.params);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}
      if(loseAck){loseAck=false;throw Error('synthetic committed release ACK loss');}}};
  const approval={schemaVersion:1,runId:'owner-held-fixture',catalogRevision:'owner-held-fixture',changes:[]};
  const request={scope,codeSha:'c'.repeat(40),previous:{catalogRevision:'previous',products:[],heldProducts:[]},context:{cutoff:'2026-10-25T12:00:00.000Z'},approval,approvalSha256:hash(approval)};
  return{sql,db,owner,scope,request,batches:()=>batches,loseAck(){loseAck=true;}};
}
test('writing→freezing transition recovers only its exact release/claim and is idempotent without resetting epochs',async t=>{
  const f=await fixture(t);f.loseAck();const next=await transitionHeldOwner(f.db,f.owner,'owner-held-fixture',f.request);
  assert.equal(next.phase,'freezing');assert.equal(next.generation,f.owner.generation+1);assert.equal(next.epoch,f.owner.epoch);
  assert.equal(next.operationKey,approvedCohortOperationKey(f.request));assert.deepEqual(await transitionHeldOwner(f.db,f.owner,'owner-held-fixture',f.request),next);
  assert.equal(f.batches(),1);
});
test('lost local release checkpoint accepts exact idle only, not a later completed or foreign active owner',async t=>{
  for(const fault of ['idle-released','idle-advanced','active-foreign','freezing-foreign'])await t.test(fault,async t=>{
    const f=await fixture(t);await releaseMutationOwnership(f.db,f.owner);
    if(fault==='idle-released'){
      await releaseHeldOwner(f.db,f.owner);const next=await transitionHeldOwner(f.db,f.owner,'owner-held-fixture',f.request);assert.equal(next.epoch,12);return;
    }
    const foreign=await claimMutationOwnership(f.db,f.scope,{phase:fault==='freezing-foreign'?'freezing':'writing',ownerReference:'foreign',operationKey:'b'.repeat(64)});
    if(fault==='idle-advanced')await releaseMutationOwnership(f.db,foreign);
    const before=await readMutationOwner(f.db,f.scope);await assert.rejects(transitionHeldOwner(f.db,f.owner,'owner-held-fixture',f.request),/transition_/);
    assert.deepEqual(await readMutationOwner(f.db,f.scope),before);
  });
});
test('help and malformed publish arguments cannot reach live providers or resolve credentials',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('live provider forbidden');};
  try{assert.match((await heldCatalogCommand(['--help'])).usage,/prepare\|review\|publish/);
    await assert.rejects(heldCatalogCommand(['publish','--config','/never-read','--config-sha256',h]),/arguments|environment/);assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
