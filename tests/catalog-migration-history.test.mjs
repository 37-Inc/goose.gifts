import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm, lstat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { prepareHistoryPacket, reconcileHistoryPacket, timestampPreflight, writeHistoryPacket } from '../scripts/catalog/prepare-history.ts';
import { canonicalJson, importBatch, sha256 } from '../scripts/catalog/migration.ts';

const importedAt='2026-10-20T06:30:00.000Z';
const schema=readFileSync(new URL('../migrations/d1/0001_catalog.sql',import.meta.url),'utf8');
function db() {
  const sqlite=new DatabaseSync(':memory:'); sqlite.exec(schema);
  return {sqlite,prepare(sql) {let values=[];return {bind(...args){values=args;return this;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){return sqlite.prepare(sql).run(...values);}};},
    async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
function table(name,rows,columns) {
  // Noncanonical whitespace/key ordering proves the original raw line survives.
  const raw=rows.map((r)=>`  ${JSON.stringify(Object.fromEntries(Object.entries(r).reverse()))}  `).join('\n')+(rows.length?'\n':'');
  return {definition:{schema:'public',name,file:'000.ndjson',columns,rowCount:rows.length,sha256:sha256(raw)},rows,raw};
}
function fixture(count=85) {
  const runs=Array.from({length:2},(_,i)=>({id:`synthetic-run-${i}`,status:'completed',mode:'test',dry_run:i===1,
    started_at:`2026-10-${19+i} 01:00:00.123456+00`,completed_at:i===0?null:'2026-10-20 02:00:00.654321+00',private_note:'SYNTHETIC-PRIVATE-MARKER'}));
  const items=Array.from({length:count},(_,i)=>({id:`synthetic-item-${i}`,sequence:String(i+1),run_id:runs[i%2].id,product_id:i%3?'TEST-PRODUCT':null,
    external_id:`TEST-EXTERNAL-${i}`,decision:'test_only',requires_manual_review:i%2===0,created_at:'2026-10-19 23:59:59.123456-07',details:'{"test":"synthetic"}'})).reverse();
  const aware=(name)=>({name,type:'timestamp with time zone',nullable:name==='completed_at'});
  const tables=[table('catalog_runs',runs,[aware('started_at'),aware('completed_at')]),table('catalog_run_items',items,[aware('created_at')]),
    table('product_slug_history',[],[{name:'created_at',type:'timestamp without time zone',nullable:false}]),
    table('products',[{id:'TEST-ONLY',created_at:'2025-01-01 01:00:00',updated_at:'2026-10-19 12:00:00',last_verified_at:null,availability_checked_at:null,editorial_generated_at:'2026-10-19 05:00:00'}],
      ['created_at','updated_at','last_verified_at','availability_checked_at','editorial_generated_at'].map((name)=>({name,type:'timestamp without time zone',nullable:true}))),
    table('catalog_editorial_events',[{created_at:'2026-10-19 12:00:00'}],[{name:'created_at',type:'timestamp without time zone',nullable:false}]),
    table('search_queries',[{created_at:'2026-10-19 12:00:00'}],[{name:'created_at',type:'timestamp without time zone',nullable:false}])];
  return {tables,summary:{manifestSha256:sha256('synthetic-full-export-fixture')}};
}

test('history packet is deterministic, parent-first, ≤40 rows, exact raw JSON and aware microsecond instants only',()=>{
  const a=fixture();const packet=prepareHistoryPacket(a,{importedAt});
  assert.equal(packet.batches.length,4);assert(packet.batches.every((b)=>b.rows.length<=40));
  assert.equal(packet.batches[0].table,'catalog_runs');
  assert.deepEqual(packet.batches.slice(1).map((b)=>b.rows.length),[40,40,5]);
  const items=packet.batches.slice(1).flatMap((b)=>b.rows);
  assert.deepEqual(items.map((r)=>r.sequence),Array.from({length:85},(_,i)=>i+1));
  assert.equal(items[0].created_at,'2026-10-20T06:59:59.123456Z');
  assert.equal(packet.batches[0].rows[0].completed_at,null);
  const raw=a.tables[1].raw.slice(0,-1).split('\n').find((line)=>JSON.parse(line).id===items[0].id);
  assert.equal(items[0].source_record_json,raw);assert.notEqual(items[0].source_record_json,canonicalJson(JSON.parse(raw)));
  assert.equal(packet.summary.slugHistory.disposition,'verified_empty_no_write');
  assert.equal(packet.summary.sequence.nextMinimum,86);
  assert.equal(canonicalJson(packet),canonicalJson(prepareHistoryPacket(a,{importedAt})));
  assert.equal(JSON.stringify(packet.summary).includes('SYNTHETIC-PRIVATE-MARKER'),false);
});

test('existing importBatch retries and exact full-row readback preserve FK/sequence state; corruption cannot hide behind receipts',async()=>{
  const packet=prepareHistoryPacket(fixture(),{importedAt});const target=db();
  try {
    for(const b of packet.batches)assert.equal(await importBatch(target,b),'imported');
    for(const b of packet.batches)assert.equal(await importBatch(target,b),'already_imported');
    assert.deepEqual((await reconcileHistoryPacket(target,packet.batches)).map((t)=>t.rows),[2,85]);
    assert.equal(target.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='catalog_run_items'").get().seq,85);
    assert.equal(target.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
    target.sqlite.prepare("UPDATE catalog_run_items SET source_record_json='{}' WHERE sequence=1").run();
    await assert.rejects(reconcileHistoryPacket(target,packet.batches),/full-field mismatch/);
  } finally {target.sqlite.close();}
});

test('interrupted/invalid child batches roll back atomically; changed retries refuse and unexpected target rows fail readback',async()=>{
  const p=prepareHistoryPacket(fixture(3),{importedAt});const target=db();
  try {
    await importBatch(target,p.batches[0]);
    const bad=structuredClone(p.batches[1]);bad.rows[1].run_id='missing-parent';
    await assert.rejects(importBatch(target,bad));assert.equal(target.sqlite.prepare('SELECT count(*) AS n FROM catalog_run_items').get().n,0);
    assert.equal(target.sqlite.prepare("SELECT count(*) AS n FROM migration_imports WHERE table_name='catalog_run_items'").get().n,0);
    await importBatch(target,p.batches[1]);
    bad.rows[1].run_id=p.batches[1].rows[1].run_id;bad.rows[0].decision='changed';
    await assert.rejects(importBatch(target,bad),/receipt does not match/);
    target.sqlite.prepare("INSERT INTO catalog_runs VALUES('unexpected','test','test',0,'2026-10-20T00:00:00Z',NULL,'{}')").run();
    await assert.rejects(reconcileHistoryPacket(target,p.batches),/count\/full-field mismatch/);
  } finally {target.sqlite.close();}
});

test('preflight reports precise unresolved counts but never interprets naive runtime/product/editorial/search dates',()=>{
  const a=fixture();const report=timestampPreflight(a.tables);
  assert.equal(report.find((r)=>r.table==='products'&&r.column==='created_at').unresolvedTypedValues,1);
  assert.equal(report.find((r)=>r.table==='products'&&r.column==='editorial_generated_at').typedRuntimeColumn,false);
  for(const t of ['catalog_editorial_events','search_queries'])assert.equal(report.find((r)=>r.table===t).disposition,'blocked_without_per_row_writer_timezone_evidence');
  for(const mutate of [(x)=>{x.tables[1].definition.columns[0].type='timestamp without time zone';},(x)=>{x.tables[1].rows[0].run_id='missing';x.tables[1].raw=x.tables[1].rows.map(JSON.stringify).join('\n')+'\n';x.tables[1].definition.sha256=sha256(x.tables[1].raw);},
    (x)=>{x.tables[0].raw+='tampered\n';}]) {const x=fixture();mutate(x);assert.throws(()=>prepareHistoryPacket(x,{importedAt}));}
  const naive=fixture();naive.tables[1].rows[0].created_at='2026-10-19 23:59:59';naive.tables[1].raw=naive.tables[1].rows.map(JSON.stringify).join('\n')+'\n';naive.tables[1].definition.sha256=sha256(naive.tables[1].raw);
  assert.throws(()=>prepareHistoryPacket(naive,{importedAt}),/documented UTC writer semantics/);
});

test('protected packets have checksums and private permissions, refuse overwrite and contain no retired/runtime product imports',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'sg-history-packet-test-'));const output=join(parent,'packet');
  try {
    const packet=prepareHistoryPacket(fixture(),{importedAt});const result=await writeHistoryPacket(output,packet);
    const text=await readFile(join(output,'manifest.json'),'utf8');assert.equal(sha256(text),result.manifestSha256);
    const manifest=JSON.parse(text);assert.equal(manifest.files.length,4);assert.equal((await lstat(output)).mode&511,0o700);
    for(const file of manifest.files) {
      assert.equal((await lstat(join(output,file.file))).mode&511,0o600);
      const raw=await readFile(join(output,file.file),'utf8');assert.equal(sha256(raw),file.sha256);
      const b=JSON.parse(raw);assert(['catalog_runs','catalog_run_items'].includes(b.table));assert.equal(sha256(canonicalJson(b.rows)),file.batchSha256);
    }
    await assert.rejects(writeHistoryPacket(output,packet));
  } finally {await rm(parent,{recursive:true,force:true});}
});
