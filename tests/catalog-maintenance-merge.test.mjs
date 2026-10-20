import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import test from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import { mergeCatalogMaintenanceUpsert } from '../scripts/ops/catalog-maintenance-merge.mjs';
import { createPostgresCatalogMaintenanceStore } from '../scripts/ops/catalog-maintenance-postgres.mjs';
import { decodePgvectorSendBase64, encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';

// Already-reviewed local ARM64 image; tests never pull, publish ports or access sources.
const IMAGE = 'pgvector/pgvector@sha256:09c8aaae717baf4412f6efd174f51172c0638720a72a86e804cd698197fc8ba2';
const NOW = '2026-10-20T07:00:00.123456Z';
const OLD = '2025-11-02 01:30:00.654321'; // Opaque historical wall time, never assigned UTC.
const FACTS = 'a'.repeat(64); const CHANGED = 'b'.repeat(64);
const env = { PATH: process.env.PATH, HOME: os.homedir(), LANG: 'C', LC_ALL: 'C', TZ: 'UTC', NODE_ENV: 'test' };
const available = spawnSync('docker', ['image','inspect',IMAGE], { env, encoding:'utf8' });
const command = (args, input) => execFileSync('docker', args, { env, input, encoding:'utf8', timeout:60_000, maxBuffer:4 * 1024 * 1024 });
const literal = value => value === null || value === undefined ? 'NULL' : typeof value === 'boolean' ? String(value)
  : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
// Test-only rendering of explicit fixture instants to PostgreSQL timestamp text.
// No conversion of historical wall times or production driver Dates occurs here.
const sqlTime = value => typeof value === 'string' && value.endsWith('Z')
  ? value.replace('T',' ').replace(/Z$/,'').replace(/\.([0-9]*?)0+$/, (_, fraction) => fraction ? `.${fraction}` : '') : value;
const fields = {
  id:['id','varchar(255) PRIMARY KEY'], title:['title','text NOT NULL'], price:['price','numeric(10,2) NOT NULL'],
  currency:['currency','varchar(3) NOT NULL'], imageUrl:['image_url','text'], affiliateUrl:['affiliate_url','text NOT NULL'],
  source:['source','varchar(20) NOT NULL'], sourceQuery:['source_query','text'], humorTags:['humor_tags','text[]'],
  punnyTitle:['punny_title','text'], wittyDescription:['witty_description','text'], qualityScore:['quality_score','numeric(5,4)'],
  rating:['rating','numeric(3,2)'], reviewCount:['review_count','integer'], isActive:['is_active','boolean NOT NULL'],
  embedding:['embedding','vector(1536)'], editorialWriteup:['editorial_writeup','text'], sourceFacts:['source_facts','jsonb'],
  sourceFactsHash:['source_facts_hash','varchar(64)'], editorialSourceHash:['editorial_source_hash','varchar(64)'],
  availabilityStatus:['availability_status','varchar(32)'], availabilityCheckedAt:['availability_checked_at','timestamp'],
  editorialStatus:['editorial_status','varchar(32) NOT NULL'], editorialQualityScore:['editorial_quality_score','numeric(5,4)'],
  editorialModel:['editorial_model','varchar(100)'], editorialPromptVersion:['editorial_prompt_version','varchar(50)'],
  editorialGeneratedAt:['editorial_generated_at','timestamp'], editorialBlockReason:['editorial_block_reason','text'],
  duplicateOfProductId:['duplicate_of_product_id','varchar(255)'], contentUpdatedAt:['content_updated_at','timestamp'],
  lastVerifiedAt:['last_verified_at','timestamp'], createdAt:['created_at',`timestamp NOT NULL DEFAULT ${literal(NOW)}::timestamp`],
  updatedAt:['updated_at','timestamp NOT NULL'],
};
const input = overrides => ({ id:'TEST-ONLY-1',title:'Synthetic crab spoon rest',price:'19.995',currency:'USD',
  imageUrl:'https://example.invalid/image',affiliateUrl:'https://example.invalid/gift',source:'amazon',sourceQuery:'synthetic',
  humorTags:['quote"tag','comma,tag','slash\\tag','Unicode🦀'],punnyTitle:'Fixture title',wittyDescription:'Fixture description',
  qualityScore:'0.87655',rating:4.5,reviewCount:21,isActive:true,sourceFacts:{fixture:true},availabilityStatus:'IN_STOCK',
  editorialStatus:'pending',editorialQualityScore:'0.95555',editorialModel:'test-model',editorialPromptVersion:'test-v1',
  editorialGeneratedAt:NOW,editorialBlockReason:'fixture-hold', ...overrides });
const stored = overrides => ({ ...input(),price:'12.34',qualityScore:'0.8000',rating:'4.50',editorialQualityScore:'0.9500',
  editorialWriteup:'Preserve this exact approved copy.',sourceFacts:{original:true},sourceFactsHash:FACTS,editorialSourceHash:FACTS,
  editorialStatus:'generated_ready',editorialModel:'reviewed-model',editorialPromptVersion:'reviewed-v0',editorialGeneratedAt:OLD,
  availabilityCheckedAt:OLD,lastVerifiedAt:OLD,createdAt:OLD,updatedAt:OLD,contentUpdatedAt:OLD,
  embedding:Array(1536).fill(Math.fround(.25)),duplicateOfProductId:null,publicId:'00000000-0000-4000-8000-000000000001',slug:'stable-fixture', ...overrides });
const vectorHash = values => createHash('sha256').update(Buffer.from(encodePgvectorSendBase64(values),'base64')).digest('hex');
function comparable(product) {
  return Object.fromEntries(Object.entries(fields).map(([key, [,type]]) => [key, key === 'embedding'
    ? product[key] === null ? null : vectorHash(product[key]) : type.startsWith('timestamp') ? sqlTime(product[key]) : product[key]]));
}

test('pure merge uses only supplied DB time, does not mutate inputs or infer historical instants', () => {
  const existing = stored({createdAt:null}); const incoming = input({remotelyVerified:false});
  const before = structuredClone([existing,incoming]);
  const result = mergeCatalogMaintenanceUpsert(existing,incoming,{sourceFactsHash:FACTS,databaseTime:NOW});
  assert.equal(result.inserted,false); assert.equal(result.product.createdAt,null); assert.equal(result.product.editorialGeneratedAt,OLD);
  assert.equal(result.product.availabilityCheckedAt,OLD); assert.equal(result.product.updatedAt,NOW);
  assert.equal(result.product.slug,existing.slug); assert.equal(result.product.publicId,existing.publicId);
  assert.deepEqual([existing,incoming],before);
  const generatedAt = new Date(NOW);
  const dates = mergeCatalogMaintenanceUpsert(stored({editorialStatus:'pending'}),input({editorialStatus:'generated_ready',editorialGeneratedAt:generatedAt}),
    {sourceFactsHash:FACTS,databaseTime:NOW});
  dates.product.editorialGeneratedAt.setUTCFullYear(2000); assert.equal(generatedAt.getUTCFullYear(),2026);
  for (const time of [undefined,'2026-10-20 07:00:00','2026-02-30T00:00:00.000Z','2026-10-20T24:00:00.000Z'])
    assert.throws(() => mergeCatalogMaintenanceUpsert(null,incoming,{sourceFactsHash:FACTS,databaseTime:time}),/UTC/);
});

test('numeric zero versus string zero defaults, precision and NULL behavior remain explicit', () => {
  for (const value of [0,'0']) {
    const result = mergeCatalogMaintenanceUpsert(null,input({price:value,rating:value,reviewCount:value,qualityScore:value,
      editorialQualityScore:value,editorialStatus:undefined,remotelyVerified:false}),{sourceFactsHash:FACTS,databaseTime:NOW}).product;
    assert.equal(result.price,'0.00'); assert.equal(result.qualityScore,'0.0000');
    assert.equal(result.rating,value === 0 ? null : '0.00'); assert.equal(result.reviewCount,value === 0 ? null : 0);
    assert.equal(result.editorialQualityScore,value === 0 ? null : '0.0000');
    assert.equal(result.availabilityCheckedAt,null); assert.equal(result.contentUpdatedAt,null); assert.equal(result.editorialStatus,'pending');
  }
  assert.equal(mergeCatalogMaintenanceUpsert(null,input({price:'-1.005'}),{sourceFactsHash:FACTS,databaseTime:NOW}).product.price,'-1.01');
  assert.throws(() => mergeCatalogMaintenanceUpsert(null,input({price:'99999999.995'}),{sourceFactsHash:FACTS,databaseTime:NOW}),/precision/);
});

test('native PG17/pgvector upsert differential truth table in a fresh network-none tmpfs-only container',
  {skip:available.status === 0 ? false : 'Pinned local PostgreSQL17/pgvector image unavailable; no pull attempted'}, async t => {
    const token = randomUUID(); const container = `goose-merge-test-${token}`; let created = false;
    const psql = sql => command(['exec','--user','postgres','-i',container,'psql','-XqAt','--no-password',
      '-h','/var/run/postgresql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`SET client_min_messages=warning;\n${sql}`).trim();
    try {
      const endpoint = JSON.parse(command(['context','inspect','--format','{{json .Endpoints.docker.Host}}']));
      assert.match(endpoint,/^unix:\/\//); assert.equal(JSON.parse(available.stdout)[0].Architecture,'arm64');
      command(['create','--pull=never','--name',container,'--label',`goose.catalog.merge-test=${token}`,
        '--network','none','--memory','1g','--cpus','2','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=256m',
        '--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','TZ=UTC',IMAGE,'postgres','-c','listen_addresses=','-c','timezone=UTC']); created = true;
      command(['start',container]);
      const actual = JSON.parse(command(['inspect',container]))[0];
      assert.equal(actual.HostConfig.NetworkMode,'none'); assert.equal(Object.keys(actual.HostConfig.PortBindings || {}).length,0);
      assert.ok(actual.HostConfig.Tmpfs['/var/lib/postgresql/data']); assert.ok(actual.Mounts.every(mount => mount.Type === 'tmpfs'));
      let ready = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        try { if (command(['exec','--user','postgres',container,'cat','/proc/1/comm']).trim() === 'postgres') { psql('SELECT 1;'); ready = true; break; } }
        catch { /* Own cluster is still initializing; no external service or retry. */ }
        await pause(100);
      }
      assert.ok(ready,'Fresh isolated PostgreSQL did not become ready'); psql('CREATE EXTENSION vector;');
      assert.deepEqual(JSON.parse(psql("SELECT json_build_object('version',current_setting('server_version_num')::integer/10000,'vector',(SELECT extversion FROM pg_extension WHERE extname='vector'),'listen',current_setting('listen_addresses'))")),
        {version:17,vector:'0.8.0',listen:''});
      const vector = Array(1536).fill(.1); vector[0] = -0; vector[1] = 1 / 3; vector[2] = Math.fround(1e-45);
      const originalVector = vector.map(Math.fround);
      const cases = [
        ['insert generated',null,input({editorialStatus:'generated_ready',editorialWriteup:'New reviewed fixture',embedding:vector}),FACTS],
        ['insert default pending',null,input({editorialStatus:undefined,source:undefined,sourceFacts:undefined}),FACTS],
        ['insert manual hash fallback',null,input({editorialStatus:'manual_locked'}),FACTS],
        ['insert zero unknown fields',null,input({price:0,rating:0,reviewCount:0,qualityScore:0,editorialQualityScore:0,isActive:false,remotelyVerified:false}),null],
        ['manual copy changed facts',stored({editorialStatus:'manual_locked'}),input({editorialWriteup:'Failed replacement'}),CHANGED],
        ['manual ready metadata precedence',stored({editorialStatus:'manual_locked'}),input({editorialStatus:'generated_ready',editorialWriteup:'New but locked out',editorialSourceHash:CHANGED}),CHANGED],
        ['manual missing prior hash',stored({editorialStatus:'manual_locked',editorialSourceHash:null}),input({editorialStatus:'manual_locked'}),CHANGED],
        ['ready failed generation same facts',stored(),input({editorialStatus:'pending',editorialWriteup:null}),FACTS],
        ['ready failed generation changed facts',stored(),input({editorialStatus:'needs_review',editorialWriteup:'Incomplete draft'}),CHANGED],
        ['ready incoming ready NULL copy',stored(),input({editorialStatus:'generated_ready',editorialWriteup:null}),CHANGED],
        ['stale pending',stored({editorialStatus:'stale'}),input({editorialStatus:'pending',editorialWriteup:'Incomplete draft'}),CHANGED],
        ['stale needs review',stored({editorialStatus:'stale'}),input({editorialStatus:'needs_review'}),CHANGED],
        ['stale blocked',stored({editorialStatus:'stale'}),input({editorialStatus:'blocked'}),CHANGED],
        ['stale complete replacement',stored({editorialStatus:'stale'}),input({editorialStatus:'generated_ready',editorialWriteup:'Complete reviewed replacement',embedding:vector}),CHANGED],
        ['pending review draft',stored({editorialStatus:'pending'}),input({editorialStatus:'needs_review',editorialWriteup:'Retain reviewable draft'}),CHANGED],
        ['pending cannot silently become manual',stored({editorialStatus:'pending'}),input({editorialStatus:'manual_locked',editorialWriteup:'Manual candidate'}),CHANGED],
        ['blocked retry and nulls',stored({editorialStatus:'blocked'}),input({editorialStatus:'pending',imageUrl:null,sourceQuery:null,sourceFacts:null,remotelyVerified:false}),FACTS],
        ['duplicate flag cannot be cleared',stored({editorialStatus:'duplicate',duplicateOfProductId:'test-winner'}),input({editorialStatus:'generated_ready',duplicateOfProductId:null}),CHANGED],
        ['NULL hash distinct semantics',stored({editorialSourceHash:null}),input({availabilityStatus:undefined,remotelyVerified:false}),null],
        ['string zeros survive defaults',stored(),input({price:'0',rating:'0',reviewCount:'0',editorialQualityScore:'0',humorTags:[],punnyTitle:'',wittyDescription:''}),FACTS],
        ['negative money half rounding',stored(),input({price:'-1.005',editorialQualityScore:'0.00005'}),FACTS],
        ['original vector negative zero and subnormal survive absent replacement',stored({embedding:originalVector}),input({embedding:[]}),FACTS],
        ['null prior metadata and incoming fields',stored({embedding:null,punnyTitle:null,wittyDescription:null,editorialSourceHash:null,
          editorialStatus:'pending',editorialQualityScore:null,editorialModel:null,editorialPromptVersion:null,editorialGeneratedAt:null}),
          input({editorialStatus:'needs_review',editorialQualityScore:null,editorialModel:null,editorialPromptVersion:null,editorialGeneratedAt:null}),null],
        ['opaque historical generated time is not interpreted',null,input({editorialGeneratedAt:OLD}),FACTS],
      ];
      for (const [label,existing,incoming,sourceFactsHash] of cases) await t.test(label,async () => {
        const expected = mergeCatalogMaintenanceUpsert(existing,incoming,{sourceFactsHash,databaseTime:NOW});
        const ddl = Object.values(fields).map(([column,type]) => `${column} ${type}`).join(',');
        psql(`DROP TABLE IF EXISTS products; CREATE TABLE products(${ddl},public_id uuid DEFAULT '00000000-0000-4000-8000-000000000001',slug text NOT NULL DEFAULT 'new-test-fixture');`);
        if (existing) {
          // jsonb_populate_record gives native arrays/numerics/timestamps their real source types.
          const seed = Object.fromEntries(Object.entries(fields).map(([key,[column]]) => [column,key === 'embedding' && existing[key] !== null
            ? `[${existing[key].map(value => Object.is(value,-0) ? '-0' : value).join(',')}]` : existing[key]]));
          psql(`INSERT INTO products SELECT (jsonb_populate_record(NULL::products,${literal(JSON.stringify({...seed,slug:existing.slug,public_id:existing.publicId}))}::jsonb)).*;`);
        }
        let sql; let params;
        await createPostgresCatalogMaintenanceStore({query:async (text,values) => { sql=text; params=values; return {rows:[]}; }}).upsertProduct(incoming,sourceFactsHash);
        const statement = sql.replaceAll('NOW()',`${literal(NOW)}::timestamp`).replace(/\$(\d+)/g,(_,index) => literal(params[Number(index)-1]));
        const projections = Object.entries(fields).flatMap(([key,[column,type]]) => [literal(key), type.startsWith('numeric') || type.startsWith('timestamp') ? `${column}::text`
          : type === 'vector(1536)' ? `replace(encode(vector_send(${column}),'base64'),chr(10),'')` : column]);
        const output = psql(`WITH mutation AS (${statement}) SELECT row_to_json(mutation)::text FROM mutation;
          SELECT json_build_object(${projections.join(',')},'publicId',public_id,'slug',slug)::text FROM products;`).split('\n').map(JSON.parse);
        assert.equal(output[0].inserted,expected.inserted); const actual = output[1];
        actual.embedding = actual.embedding === null ? null : vectorHash(decodePgvectorSendBase64(actual.embedding));
        const observed = Object.fromEntries(Object.keys(fields).map(key => [key,actual[key]]));
        assert.deepEqual(observed,comparable(expected.product));
        if (existing) { assert.equal(actual.slug,existing.slug); assert.equal(actual.publicId,existing.publicId); }
      });
    } finally {
      if (created) {
        const owned = JSON.parse(command(['inspect',container]))[0]; assert.equal(owned.Config.Labels['goose.catalog.merge-test'],token);
        command(['rm','--force','--volumes',container]);
      }
    }
  });
