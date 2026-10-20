import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeVectorCopy, nativeTableSql, nativeInsertSql, nativeReadbackSql, validateNativeAudit, runNativeRecovery } from '../scripts/catalog/recovery-native.ts';
import { encodePgvectorSendBase64 } from '../scripts/catalog/pgvector-binary.ts';
import { sha256 } from '../scripts/catalog/migration.ts';

const floats = [-0, Math.fround(1.401298464324817e-45), Math.fround(-0.1), ...Array(1533).fill(1)];
const embedding = encodePgvectorSendBase64(floats);
const table = { schema: 'public', name: 'products', file: '000.ndjson', rowCount: 2, sha256: '',
  columns: [ ['id', 'text', false], ['public_id','uuid',false], ['slug','character varying(160)',false],
    ['amount','numeric(10,2)',true], ['created_at','timestamp without time zone',true],
    ['checked_at','timestamp with time zone',true], ['tags','text[]',true], ['details','jsonb',true],
    ['active','boolean',false], ['embedding','vector(1536)',true] ].map(([name,type,nullable]) => ({ name,type,nullable,default: null })),
  constraints: [{ name: 'products_pkey', definition: 'PRIMARY KEY (id)' }],
  indexes: [{ name: 'products_pkey', definition: 'CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)' }] };
table.columnEncodings = Object.fromEntries(table.columns.map((c) => [c.name,c.name === 'embedding' ? 'pgvector-send-base64-v1' : c.type === 'boolean' ? 'json-boolean' : 'postgres-text']));
const rows = [ { id: 'SYNTHETIC-TEST-1', public_id: '00000000-0000-4000-8000-000000000001', slug: 'synthetic-one', amount:'0.00',
  created_at:'2026-10-19 08:31:55.123456', checked_at:'2026-10-20 06:00:00+00', tags:'{"comma,value","quote\\\"value",NULL}',
  details:'{"a": 1, "private": "Synthetic fixture only"}', active:false, embedding },
{ id:'SYNTHETIC-TEST-2', public_id:'00000000-0000-4000-8000-000000000002', slug:'synthetic-two', amount:null,
  created_at:null, checked_at:null, tags:null, details:null, active:true, embedding:null } ];

test('native COPY binary preserves vector header/bits, ordinal int64 and NULL without decimal conversion', () => {
  const bytes = nativeVectorCopy(rows, 'embedding');
  assert.equal(bytes.subarray(0,11).toString('binary'),'PGCOPY\n\xff\r\n\0');
  assert.equal(bytes.readInt32BE(11),0); assert.equal(bytes.readInt32BE(15),0);
  assert.equal(bytes.readInt16BE(19),2); assert.equal(bytes.readInt32BE(21),8); assert.equal(bytes.readBigInt64BE(25),1n);
  const size = bytes.readInt32BE(33); assert.equal(size,6148);
  assert.deepEqual(bytes.subarray(37,37+size),Buffer.from(embedding,'base64'));
  const next = 37 + size; assert.equal(bytes.readBigInt64BE(next+6),2n); assert.equal(bytes.readInt32BE(next+14),-1);
  assert.equal(bytes.readInt16BE(bytes.length-2),-1);
  assert.throws(() => nativeVectorCopy([{embedding:'not-binary'}],'embedding'));
});

test('typed restore keeps naive/zoned timestamps distinct, exact money and sends original vector bytes back', () => {
  assert.match(nativeTableSql(table), /"amount" numeric\(10,2\)/);
  assert.match(nativeTableSql(table), /timestamp without time zone/);
  assert.match(nativeInsertSql(table,0), /::timestamp without time zone/);
  assert.equal(nativeInsertSql(table,0).includes('to_timestamp'),false);
  assert.match(nativeInsertSql(table,0), /v.embedding/);
  assert.match(nativeReadbackSql(table,0), /vector_send\(t\."embedding"\)/);
  assert.throws(() => nativeTableSql({...table,columns:[{name:'bad',type:'text; DROP SCHEMA public',nullable:true}]}), /requires review/);
  assert.throws(() => nativeTableSql({...table,schema:'bad;schema'}), /requires review/);
});

function audit(tables) {
  return { readOnly:true,isolation:'repeatable read',policies:[],
    tables:tables.map((t) => ({schema_name:t.schema,relname:t.name,relkind:'r',can_select:true,active_rls_for_export_role:false,
      relrowsecurity:false,relforcerowsecurity:false,relispartition:false,relhassubclass:false,inherits_from_parent:false})),
    functions:['assign_product_public_identity','preserve_product_slug_history'].map((proname) => ({ schema_name:'public',proname,arguments:'',
      definition:`CREATE OR REPLACE FUNCTION public.${proname}()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n RETURN NEW;\nEND;\n$function$\n` })),
    triggers:[{schema_name:'public',relname:'products',tgname:'products_assign_public_identity',definition:'CREATE TRIGGER products_assign_public_identity BEFORE INSERT OR UPDATE OF slug ON public.products FOR EACH ROW EXECUTE FUNCTION assign_product_public_identity()'},
      {schema_name:'public',relname:'products',tgname:'products_preserve_slug_history',definition:'CREATE TRIGGER products_preserve_slug_history BEFORE UPDATE OF slug ON public.products FOR EACH ROW EXECUTE FUNCTION preserve_product_slug_history()'}],
    extensions:[{extname:'vector',extversion:'0.8.0',schema_name:'public'},{extname:'plpgsql',extversion:'1.0',schema_name:'pg_catalog'}] };
}
test('native audit rejects unreviewed visibility, inheritance, extension and function-language changes', () => {
  validateNativeAudit(audit([table]),[table]);
  for (const mutate of [(a)=>{a.tables[0].active_rls_for_export_role=true;},(a)=>{delete a.tables[0].relrowsecurity;},(a)=>{a.tables[0].inherits_from_parent=true;},
    (a)=>{a.extensions[0].extversion='0.8.1';},(a)=>{a.functions[0].definition=a.functions[0].definition.replace('LANGUAGE plpgsql','LANGUAGE c');}]) {
    const value = audit([table]); mutate(value); assert.throws(()=>validateNativeAudit(value,[table]));
  }
});

test('optional fresh network-none PG17 container restores synthetic native types and byte-exact float32', {skip:process.env.CATALOG_RECOVERY_TEST_NATIVE !== '1'}, async () => {
  const parent = await mkdtemp(join(tmpdir(),'sg-native-recovery-test-')); const directory = join(parent,'export');
  const {mkdir} = await import('node:fs/promises'); await mkdir(directory,{mode:0o700});
  const tables = [structuredClone(table), ...Array.from({length:12},(_,i)=>({schema:'public',name:`synthetic_archive_${i}`,file:`${String(i+1).padStart(3,'0')}.ndjson`,rowCount:0,sha256:sha256(''),
    columns:[{name:'id',type:'text',nullable:false,default:null}],columnEncodings:{id:'postgres-text'},
    constraints:[{name:`synthetic_archive_${i}_pkey`,definition:'PRIMARY KEY (id)'}],
    indexes:[{name:`synthetic_archive_${i}_pkey`,definition:`CREATE UNIQUE INDEX synthetic_archive_${i}_pkey ON public.synthetic_archive_${i} USING btree (id)`}]}))];
  const text = rows.map(JSON.stringify).join('\n')+'\n'; tables[0].sha256=sha256(text);
  const sequence = {schemaname:'public',sequencename:'synthetic_sequence',data_type:'bigint',increment_by:'3',min_value:'5',max_value:'101',start_value:'5',cache_size:'1',cycle:false,last_value:'11'};
  const manifest = {schemaVersion:1,mode:'https-repeatable-read-single-transaction',settings:{isolation:'repeatable read',readOnly:'on'},totalBytes:Buffer.byteLength(text),tables,
    sequences:[sequence,{...sequence,sequencename:'synthetic_unstarted_sequence',last_value:null}]};
  let passed=false;
  try {
    for (let i=0;i<tables.length;i++) await writeFile(join(directory,tables[i].file),i===0?text:'',{mode:0o600});
    const raw = JSON.stringify(manifest)+'\n'; const manifestSha=sha256(raw);
    await writeFile(join(directory,'manifest.json'),raw,{mode:0o600}); await writeFile(join(directory,'manifest.sha256'),manifestSha+'  manifest.json\n',{mode:0o600});
    const metadata=JSON.stringify(audit(tables))+'\n'; const auditPath=join(parent,'audit.json'); await writeFile(auditPath,metadata,{mode:0o600});
    const result = await runNativeRecovery({archive:directory,expectedManifestSha256:manifestSha,audit:auditPath,expectedAuditSha256:sha256(metadata),workParent:parent});
    assert.equal(result.receipt.status,'passed'); assert.equal(result.receipt.resourcesRemoved,true); assert.equal(result.receipt.vectorCount,1);
    assert.equal(result.receipt.functionsReconciled,2); assert.equal(result.receipt.triggersReconciled,2);
    assert.equal(result.receipt.observedSequencesReconciled,2);
    assert.equal(JSON.stringify(result.receipt).includes('Synthetic fixture only'),false);
    assert.equal(JSON.parse(await readFile(result.receiptPath,'utf8')).reconciledTables.length,13);
    passed=true;
  } finally { if (passed) await rm(parent,{recursive:true,force:true}); }
});
