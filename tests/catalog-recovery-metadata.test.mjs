import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRecoveryMetadata,decodeRecoveryMetadata,validateRecoveryMetadata,recoveryMetadataQueries,
  RECOVERY_METADATA_SQL,RECOVERY_SEQUENCE_INVENTORY_SQL } from '../scripts/catalog/recovery-metadata.ts';
import { collectConsistentExport,writeProtectedExport } from '../scripts/catalog/export-postgres.ts';
import { nativeSequenceSql,nativeTriggerModeSql,NATIVE_IMAGE } from '../scripts/catalog/recovery-native.ts';

const settings={database:'test-only',snapshot:'1:2:',observedAt:'2026-10-20 05:00:00+00',serverVersion:'17.11 (fixture)',serverVersionNum:'170011',isolation:'repeatable read',readOnly:'on'};
const configuration={data_type:'bigint',increment_by:'3',min_value:'5',max_value:'101',start_value:'5',cache_size:'1',cycle:false};
const sequence={schema:'public',name:'synthetic_sequence',configuration,ownedBy:[]};
const sequenceDefinition={schemaname:sequence.schema,sequencename:sequence.name,...configuration,last_value:null};
const data={source:settings,sequenceDefinitions:[sequence],triggers:[{schema:'public',table:'products',name:'fixture_trigger',enabled:'D',definition:'Synthetic fixture; never executed'}],
  aclEvidence:{database:{name:'test-only',acl:null},schemas:[],relations:[],columns:[],functions:[],defaultPrivileges:[]},
  settingsEvidence:{session:{TimeZone:'GMT'},databaseRole:[]}};
const state={schema:'public',name:'synthetic_sequence',lastValue:'11',isCalled:false};
const responses=()=>[[{metadata:JSON.stringify(data)}],[{state:JSON.stringify(state)}]];
const original={manifestSha256:'a'.repeat(64),settings};
const binding={kind:'later-observation',archiveManifestSha256:original.manifestSha256,archiveSnapshot:settings.snapshot,archiveObservedAt:settings.observedAt};

test('later metadata observations remain distinct even if txid snapshots happen to equal the original',async()=>{
  const calls=[];
  const source={async query(sql){calls.push(sql);return[{sequences:JSON.stringify([{schema:'public',name:'synthetic_sequence'}])}];},
    async transaction(queries,options){calls.push(...queries);assert.deepEqual(options,{isolationLevel:'RepeatableRead',readOnly:true});return responses();}};
  const metadata=await collectRecoveryMetadata(source,original);
  assert.equal(metadata.binding.kind,'later-observation');assert.equal(metadata.binding.archiveManifestSha256,original.manifestSha256);
  assert.equal(metadata.source.snapshot,metadata.binding.archiveSnapshot);
  assert.equal(metadata.sequences[0].lastValue,'11');assert.equal(metadata.sequences[0].isCalled,false);
  assert.deepEqual(metadata.aclEvidence,data.aclEvidence);assert.deepEqual(metadata.settingsEvidence,data.settingsEvidence);
  assert.ok(calls.every(sql=>/^SELECT/.test(sql)));assert.equal(calls.join('\n').includes('pg_authid'),false);
  assert.match(calls.at(-1),/last_value::text,'isCalled',is_called/);assert.doesNotMatch(calls.join('\n'),/\b(?:nextval|setval)\s*\(/i);
});

test('metadata binding, completeness, modes, identifiers and sequence state fail closed',()=>{
  const metadata=decodeRecoveryMetadata(responses(),binding);
  validateRecoveryMetadata(metadata,original.manifestSha256,settings);
  for(const mutate of [m=>{m.binding.archiveManifestSha256='b'.repeat(64);},m=>{m.source.database='other';},m=>{m.source.readOnly='off';},
    m=>{m.binding.kind='same-transaction';},m=>{m.sequences[0].isCalled=null;},m=>{m.sequences[0].lastValue='1;SELECT 1';},
    m=>{m.sequences[0].lastValue=9007199254740992;},m=>{m.sequences[0].configuration.max_value=9223372036854776000;},
    m=>{m.triggers[0].enabled='DROP';},m=>{m.triggers[0].name='invalid;name';},m=>{delete m.aclEvidence.schemas;},
    m=>{m.sequences.push({...m.sequences[0]});},m=>{m.sequences[0].ownedBy=[{schema:'public',table:'products',column:'id',dependency:'i'}];}]){
    const changed=structuredClone(metadata);mutate(changed);assert.throws(()=>validateRecoveryMetadata(changed,original.manifestSha256,settings));
  }
  assert.throws(()=>decodeRecoveryMetadata(responses().slice(0,1),binding),/inventory changed/);
  assert.throws(()=>recoveryMetadataQueries([{schema:'public',name:'bad;sequence'}]),/requires review/);
});

test('exact false is_called and all four trigger modes render only constrained restoration SQL',()=>{
  const metadata=decodeRecoveryMetadata(responses(),binding);
  assert.match(nativeSequenceSql(sequenceDefinition,metadata.sequences[0]),/setval\('"public"\."synthetic_sequence"'::regclass,11,false\)/);
  assert.equal(nativeSequenceSql(sequenceDefinition).includes('setval'),false); // Legacy unknown remains unknown.
  assert.throws(()=>nativeSequenceSql(sequenceDefinition,{...metadata.sequences[0],lastValue:'102'}),/configuration/);
  assert.throws(()=>nativeSequenceSql(sequenceDefinition,{...metadata.sequences[0],configuration:{...configuration,cache_size:'2'}}),/configuration/);
  assert.throws(()=>nativeSequenceSql({...sequenceDefinition,last_value:9007199254740992}),/requires review/);
  assert.throws(()=>nativeSequenceSql({...sequenceDefinition,max_value:9223372036854776000}),/requires review/);
  assert.throws(()=>nativeSequenceSql(sequenceDefinition,{...metadata.sequences[0],lastValue:9007199254740992}),/configuration/);
  const large={...configuration,max_value:'9223372036854775807'};
  assert.match(nativeSequenceSql({...sequenceDefinition,...large},{...metadata.sequences[0],configuration:large,lastValue:'9007199254740993'}),/9007199254740993,false/);
  for(const [enabled,clause] of [['O','ENABLE'],['D','DISABLE'],['R','ENABLE REPLICA'],['A','ENABLE ALWAYS']])
    assert.equal(nativeTriggerModeSql({...data.triggers[0],enabled}),`ALTER TABLE "public"."products" ${clause} TRIGGER "fixture_trigger";`);
});

test('existing export optionally captures metadata in the same transaction and pins it inside the protected manifest',async()=>{
  const table={schema:'public',name:'products',kind:'r',partition:false,columns:[{name:'id',type:'text',nullable:false,default:null}],constraints:[],indexes:[]};
  let metadataRequested=false;
  const source={async query(sql){return sql===RECOVERY_SEQUENCE_INVENTORY_SQL
    ?[{sequences:JSON.stringify([{schema:'public',name:'synthetic_sequence'}])}]:[{inventory:JSON.stringify([table])}];},
  async transaction(queries){if(queries.length===1)return[[{row_count:'1',wire_bytes:'64'}]];
    metadataRequested=queries.includes(RECOVERY_METADATA_SQL);
    return[[{settings:JSON.stringify(settings)}],[{inventory:JSON.stringify([table])}],[{sequences:JSON.stringify([sequenceDefinition])}],
      [{row_count:'1',wire_bytes:'64'}],[{row:'{"id":"TEST-ONLY"}'}],...(metadataRequested?responses():[]),[{inventory:JSON.stringify([table])}]];}};
  const legacy=await collectConsistentExport(source);assert.equal(metadataRequested,false);assert.equal(legacy.recoveryMetadata,undefined);
  const exported=await collectConsistentExport(source,{captureRecoveryMetadata:true});assert.equal(metadataRequested,true);
  assert.equal(exported.recoveryMetadata.binding.kind,'same-transaction');assert.equal(exported.recoveryMetadata.binding.archiveManifestSha256,null);
  const parent=await mkdtemp(join(tmpdir(),'sg-metadata-test-'));try{
    const output=join(parent,'export');await writeProtectedExport(exported,{output,repository:process.cwd(),codeSha:'test-only'});
    assert.deepEqual(JSON.parse(await readFile(join(output,'manifest.json'),'utf8')).recoveryMetadata,exported.recoveryMetadata);
  }finally{await rm(parent,{recursive:true,force:true});}
});

test('optional isolated PG17 fixture executes capture SQL read-only, including ACL/default privileges/scoped settings',
  {skip:process.env.CATALOG_RECOVERY_TEST_NATIVE!=='1'},async()=>{
    const token=randomUUID();const container=`sg-metadata-test-${token}`;let created=false;
    const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',TZ:'UTC',NODE_ENV:'test'};
    const command=(args,input)=>execFileSync('docker',args,{env,input,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,stdio:['pipe','pipe','pipe']});
    const psql=sql=>command(['exec','--user','postgres','-i',container,'psql','-XqAt','--no-password','-h','/var/run/postgresql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],sql).trim();
    try{
      const endpoint=JSON.parse(command(['context','inspect','--format','{{json .Endpoints.docker.Host}}']));assert.match(endpoint,/^unix:\/\//);
      assert.equal(JSON.parse(command(['image','inspect',NATIVE_IMAGE]))[0].Architecture,'arm64');
      command(['create','--pull=never','--name',container,'--label',`goose.catalog.metadata-test=${token}`,'--network','none',
        '--memory','1g','--cpus','2','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=256m',
        '--env','POSTGRES_HOST_AUTH_METHOD=trust',NATIVE_IMAGE,'postgres','-c','listen_addresses=','-c','timezone=UTC']);created=true;
      command(['start',container]);let ready=false;
      for(let i=0;i<100;i++){
        try{if(command(['exec',container,'cat','/proc/1/comm']).trim()==='postgres'){psql('SELECT 1');ready=true;break;}}catch{/* Own fixture initializing. */}
        await new Promise(done=>setTimeout(done,100));
      }assert.ok(ready);
      const owned=JSON.parse(command(['inspect',container]))[0];assert.equal(owned.HostConfig.NetworkMode,'none');
      assert.deepEqual(owned.HostConfig.PortBindings,{});assert.ok(owned.Mounts.every(m=>m.Type==='tmpfs'));
      // Synthetic fixture setup only, never replaying source ACL/settings DDL.
      psql(`CREATE TABLE public.fixture(id bigint);CREATE SEQUENCE public.synthetic_sequence START 5 INCREMENT 3 MINVALUE 5 MAXVALUE 101;
        SELECT setval('public.synthetic_sequence',11,false);ALTER SEQUENCE public.synthetic_sequence OWNED BY public.fixture.id;
        CREATE SEQUENCE public.unsafe_sequence AS bigint;SELECT setval('public.unsafe_sequence',9007199254740993,false);
        CREATE FUNCTION public.fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
        CREATE TRIGGER fixture_trigger BEFORE INSERT ON public.fixture FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger();
        ALTER TABLE public.fixture ENABLE ALWAYS TRIGGER fixture_trigger;GRANT SELECT(id) ON public.fixture TO PUBLIC;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC;
        ALTER ROLE postgres IN DATABASE postgres SET application_name='TEST-ONLY';`);
      const source={async query(sql){return psql(`SELECT row_to_json(r)::text FROM (${sql}) r`).split('\n').filter(Boolean).map(JSON.parse);},
        async transaction(queries){return psql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;${queries.map(sql=>`SELECT coalesce(json_agg(r),'[]')::text FROM (${sql}) r;`).join('\n')}COMMIT;`)
          .split('\n').filter(Boolean).map(JSON.parse);}};
      const original={manifestSha256:'c'.repeat(64),settings:{database:'postgres',snapshot:'fixture-original-snapshot',observedAt:'2026-01-01T00:00:00Z'}};
      const metadata=await collectRecoveryMetadata(source,original);
      assert.equal(metadata.source.readOnly,'on');assert.equal(metadata.sequences[0].lastValue,'11');assert.equal(metadata.sequences[0].isCalled,false);
      assert.equal(metadata.sequences[1].lastValue,'9007199254740993');assert.equal(metadata.sequences[1].isCalled,false);
      assert.deepEqual(metadata.sequences[0].ownedBy,[{schema:'public',table:'fixture',column:'id',dependency:'a'}]);
      assert.equal(metadata.triggers[0].enabled,'A');assert.equal(metadata.aclEvidence.columns.length,1);assert.equal(metadata.aclEvidence.defaultPrivileges.length,1);
      assert.ok(metadata.settingsEvidence.databaseRole.some(r=>r.settings.includes('application_name=TEST-ONLY')));
      assert.equal(psql('SELECT is_called FROM public.synthetic_sequence'),'f'); // Capture never calls nextval/setval.
    }finally{
      if(created){const owned=JSON.parse(command(['inspect',container]))[0];assert.equal(owned.Config.Labels['goose.catalog.metadata-test'],token);command(['rm','--force','--volumes',container]);}
    }
  });
