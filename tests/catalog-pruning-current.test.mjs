import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { pruningCurrentQueries, PRUNING_CURRENT_LIMITS } from '../lib/catalog/pruning-current.ts';
import { pruningCurrentQueries as legacyApi, SNAPSHOT_READ_LIMITS } from '../scripts/catalog/export-d1-snapshot.ts';

function row(index, text='') {
  const public_id=`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
  return { public_id, approved_product_json:JSON.stringify({id:`B${String(index+1).padStart(9,'0')}`,public_id,title:'🪿 café \\"\n\ud800'}),
    verification_operation_json:JSON.stringify({operation_id:'a'.repeat(64)}),approval_operation_json:JSON.stringify({operation_id:'b'.repeat(64)}),fixture_payload:text };
}
// Original Buffer-based partitioning, independent of the new TextEncoder path.
// SQL is separately pinned below to its pre-extraction golden, not regenerated.
function bufferPartitions(rows, sql) {
  const chunks=[];let bytes=0;
  for(const value of rows){const size=Buffer.byteLength(JSON.stringify(value));if(size>128*1024)throw Error('read_bounds');
    if(!chunks.length||chunks.at(-1).length>=80||bytes+size>256*1024){chunks.push([]);bytes=0;}chunks.at(-1).push(value);bytes+=size;}
  const counts=[];
  function bounded(chunk){const wire=Buffer.byteLength(JSON.stringify({batch:[{sql,params:[JSON.stringify(chunk)]}]}));
    if(wire>384*1024){if(chunk.length===1)throw Error('read_bounds');const middle=Math.floor(chunk.length/2);bounded(chunk.slice(0,middle));bounded(chunk.slice(middle));}
    else counts.push(chunk.length);}
  chunks.forEach(bounded);return counts;
}
test('extraction preserves legacy API, shared limits, exact SQL and operation/full-product/archive CAS',()=>{
  assert.equal(legacyApi,pruningCurrentQueries);assert.deepEqual(PRUNING_CURRENT_LIMITS,{rowBytes:128*1024,pageBytes:384*1024});
  assert.equal(SNAPSHOT_READ_LIMITS.rowBytes,PRUNING_CURRENT_LIMITS.rowBytes);
  const [{sql}]=pruningCurrentQueries([row(0)]);
  assert.equal(createHash('sha256').update(sql).digest('hex'),'d4edf2994f78df3be0d3f9de7a6527b1a386f85815861ca4ba98cda95674833b');
});
test('Unicode, escaping and surrogate row/wire bounds equal the original Buffer byte semantics',()=>{
  for(const text of ['🪿','café e\u0301','"\\\n\t\u2028','\ud800','\udc00'])assert.equal(new TextEncoder().encode(text).byteLength,Buffer.byteLength(text));
  const empty=row(0),overhead=Buffer.byteLength(JSON.stringify(empty));
  const edge={...empty,fixture_payload:'x'.repeat(128*1024-overhead)};assert.equal(Buffer.byteLength(JSON.stringify(edge)),128*1024);
  assert.equal(pruningCurrentQueries([edge]).length,1);assert.throws(()=>pruningCurrentQueries([{...edge,fixture_payload:edge.fixture_payload+'x'}]),/read_bounds/);
  const rows=Array.from({length:171},(_,i)=>row(i,('🪿 café \\"\n\ud800').repeat(i%3===0?1200:140)));
  const sql=pruningCurrentQueries([rows[0]])[0].sql,queries=pruningCurrentQueries(rows);
  assert.deepEqual(queries.map(query=>query.count),bufferPartitions(rows,sql));assert.ok(queries.length>3);
  assert.deepEqual(queries.flatMap(query=>JSON.parse(query.params[0])),rows);
  for(const query of queries)assert.ok(Buffer.byteLength(JSON.stringify({batch:[{sql:query.sql,params:query.params}]}))<=384*1024);
  assert.deepEqual(pruningCurrentQueries(Array.from({length:171},(_,i)=>row(i))).map(query=>query.count),[80,80,11]);
});
test('actual Worker browser bundles do not resolve Node-only operator dependencies',async()=>{
  for(const entry of ['workers/site/freshness.ts','workers/site/publication.ts'])
    await build({entryPoints:[entry],bundle:true,platform:'browser',write:false,logLevel:'silent'});
});
