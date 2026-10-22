import { readFile } from 'node:fs/promises';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import { mutationFenceQuery } from '../../lib/catalog/mutation-fence.ts';
import { canonicalJson, sha256 } from './migration.ts';
import { D1_RECOVERY_TABLES } from './d1-logical-tables.ts';
import { readOwnedLogicalRows } from './owned-operational-import.ts';
import type { FrozenD1RecoveryInput } from './recovery-delta.ts';

type Row=Record<string,unknown>;
type SchemaRow={name:string;type:string;tbl_name:string;sql:string|null};
export interface StoppedCaptureWriter {
  id:string;kind:'application'|'operator';codePaths:string[];reference:string;stoppedAt:string;
}
const runtimeTables=['search_diagnostics','semantic_search_budgets'];
// These exact provider/Wrangler control tables are not application recovery
// data. Their sqlite_sequence entries remain captured verbatim, not filtered.
const outsideApplicationTables=['_cf_KV','d1_migrations'];
const normalized=(sql:string)=>sql.trim().replace(/;$/,'');
function refuse(code:string):never{throw new Error(`catalog_capture_${code}`);}
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0
  &&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
function instant(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}

async function schema(db:CatalogD1):Promise<SchemaRow[]>{
  const rows:SchemaRow[]=[];let cursor:string|undefined;
  for(;;){
    const page=(await db.prepare(`WITH bounded AS (SELECT rowid _cursor,name,type,tbl_name,sql,
      length(CAST(json_object('name',name,'type',type,'tbl_name',tbl_name,'sql',sql) AS BLOB)) _bytes
      FROM sqlite_schema WHERE (name NOT GLOB 'sqlite_*' OR name='sqlite_sequence')
      AND tbl_name NOT IN ('_cf_KV','d1_migrations')
      ${cursor===undefined?'':'AND rowid>CAST(? AS INTEGER)'} ORDER BY rowid LIMIT 40), sized AS
      (SELECT *,sum(_bytes) OVER(ORDER BY _cursor) _total FROM bounded)
      SELECT CAST(_cursor AS TEXT) _cursor,name,type,tbl_name,sql FROM sized
      WHERE CASE WHEN _bytes>393216 THEN json('catalog_capture_schema_bounds') ELSE _total<=393216 END ORDER BY sized._cursor`)
      .bind(...(cursor===undefined?[]:[cursor])).all<SchemaRow&{_cursor:string}>()).results;
    if(!page.length)break;
    for(const row of page){cursor=row._cursor;const {name,type,tbl_name,sql}=row;rows.push({name,type,tbl_name,sql});}
    if(rows.length>500)refuse('schema_bounds');
  }
  return rows;
}
async function checkSchema(rows:SchemaRow[]){
  const names=new Set(rows.filter(r=>r.type==='table').map(r=>r.name));
  if(D1_RECOVERY_TABLES.some(t=>!names.has(t))||[...names].some(t=>!D1_RECOVERY_TABLES.includes(t)
    &&!/^(?:products_fts|catalog_public_products_fts)(?:_(?:data|idx|docsize|config))?$/.test(t)))refuse('schema');
  const scope=await readFile(new URL('../../migrations/d1/0009_catalog_mutation_fence.sql',import.meta.url),'utf8');
  const barrier=await readFile(new URL('../../migrations/d1/0014_runtime_capture_barrier.sql',import.meta.url),'utf8');
  const definitions=[...scope.matchAll(/CREATE (?:TABLE catalog_mutation_scopes|UNIQUE INDEX catalog_mutation_database_scope)[\s\S]*?;/g),
    ...barrier.matchAll(/CREATE TRIGGER [\s\S]*?END;/g)].map(m=>normalized(m[0]));
  if(definitions.length!==8)refuse('schema_source');
  const expectedNames=definitions.map(sql=>sql.match(/^CREATE (?:TABLE|UNIQUE INDEX|TRIGGER) (\w+)/)![1]);
  for(const [i,name]of expectedNames.entries()){
    const actual=rows.filter(r=>r.name===name);if(actual.length!==1||!actual[0].sql||normalized(actual[0].sql)!==definitions[i])refuse('barrier_schema');
  }
  if(rows.some(r=>r.type==='trigger'&&runtimeTables.includes(r.tbl_name)&&!expectedNames.includes(r.name)))refuse('barrier_schema');
}
async function observeOwner(db:CatalogD1,owner:MutationOwner){
  const gate=mutationFenceQuery(owner);
  const rows=(await db.prepare(`SELECT *,strftime('%Y-%m-%dT%H:%M:%fZ','now') observation_time
    FROM catalog_mutation_scopes WHERE ${gate.sql} AND captured_at=?`).bind(...gate.params,owner.capturedAt).all<Row>()).results;
  if(rows.length!==1||!instant(rows[0].observation_time))refuse('owner');
  const {observation_time,...row}=rows[0];return{row,observedAt:observation_time as string};
}

/** Cooperative known-writer capture, NOT a provider snapshot/ACL or universal
 * out-of-band write barrier. Caller must actually stop the inventoried writers.
 * No files are emitted; retain supplier bodies only under their original policy.
 * Existing production import still refuses this unverified-capture kind. */
export async function captureOwnedD1(options:{db:CatalogD1;owner:MutationOwner;reference:string;
  stoppedWriters:StoppedCaptureWriter[]}){
  const {db}=options,owner=structuredClone(options.owner),writers=structuredClone(options.stoppedWriters);
  mutationFenceQuery(owner);
  if(owner.phase!=='writing'||!text(options.reference,1000)||!Array.isArray(writers)||writers.length<2||writers.length>50
    ||new Set(writers.map(w=>w.id)).size!==writers.length||!writers.some(w=>w.kind==='application')||!writers.some(w=>w.kind==='operator')
    ||writers.some(w=>!text(w.id,100)||!['application','operator'].includes(w.kind)||!text(w.reference,1000)||!instant(w.stoppedAt)
      ||!Array.isArray(w.codePaths)||w.codePaths.length>20||(w.kind==='application'&&!w.codePaths.length)
      ||w.codePaths.some(p=>!text(p,250)||! /^(?:lib|scripts|workers)\/[a-zA-Z0-9._/-]+$/.test(p)||p.split('/').includes('..'))))refuse('writer_inventory');
  const before=await observeOwner(db,owner);
  if(writers.some(w=>w.stoppedAt>before.observedAt))refuse('writer_inventory');
  const schemaBefore=await schema(db);await checkSchema(schemaBefore);
  const tables=await readOwnedLogicalRows(db,owner);
  const inventory=D1_RECOVERY_TABLES.map(table=>({table,rows:tables[table].length,sha256:sha256(canonicalJson(tables[table]))}));
  if(inventory.reduce((n,t)=>n+t.rows,0)>100_000)refuse('bounds');
  const schemaAfter=await schema(db);if(canonicalJson(schemaBefore)!==canonicalJson(schemaAfter))refuse('schema_changed');
  const after=await observeOwner(db,owner);
  if(canonicalJson(before.row)!==canonicalJson(after.row)||after.observedAt<before.observedAt)refuse('owner_changed');
  const capture:FrozenD1RecoveryInput={schemaVersion:1,scope:'application-logical-tables-through-0012',
    provenance:{kind:'unverified-capture',reference:options.reference,barrierEvidence:null},tables,inventory};
  if(Buffer.byteLength(canonicalJson(capture))>128*1024*1024)refuse('bounds');
  const captureSha256=sha256(canonicalJson(capture));
  const receipt={schemaVersion:1,kind:'cooperative-owned-d1-logical-capture',captureSha256,
    ownerBefore:owner,ownerAfter:structuredClone(owner),scopeRowSha256:sha256(canonicalJson(before.row)),
    startedAt:before.observedAt,completedAt:after.observedAt,inventory,
    schemas:schemaBefore.map(row=>({name:row.name,type:row.type,table:row.tbl_name,sha256:sha256(canonicalJson(row))})),
    schemaSha256:sha256(canonicalJson(schemaBefore)),outsideApplicationTables,stoppedWriters:writers,
    limitations:['Known-writer stops are explicit operator attestations, not provider-enforced permissions.',
      'Six database triggers guard both old in-flight runtime write paths; privileged SQL/DDL remains outside this cooperative barrier.',
      'Exact provider _cf_KV and Wrangler d1_migrations tables/DDL are outside the24 application-table scope; sqlite_sequence retains all original allocator entries.',
      'No provider bookmark/atomic-export, merchant observation, rights renewal or production import acceptance is claimed.']};
  return{capture,captureSha256,receipt,receiptSha256:sha256(canonicalJson(receipt))};
}
