import { mkdir, open, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertPrivateOutsideGit, validateArchiveRelations, validateRecoveryArchive } from './recovery-archive.ts';
import type { RecoveryTable } from './recovery-archive.ts';
import { canonicalJson, canonicalTimestamp, moneyToMinor, sha256 } from './migration.ts';
import { maintenanceState, maintenanceTextArray, snake } from './maintenance-state.ts';
import type { Row } from './maintenance-state.ts';
import { decodePgvectorSendBase64 } from './pgvector-binary.ts';
import { decodeD1CatalogTelemetryRow } from './telemetry-d1.ts';
import { D1_RECOVERY_TABLES } from './d1-logical-tables.ts';
import { normalizeOwnedImportSequences } from './owned-operational-import.ts';
import type { OwnedOperationalImportPlan, OwnedImportSequenceRollback } from './owned-operational-import.ts';
export { D1_RECOVERY_TABLES } from './d1-logical-tables.ts';

// Logical application tables at0012. FTS/shadow tables are derived; provider
// internals are outside this scope. Future application tables require review.
const RUNTIME = ['products','catalog_runs','catalog_run_items','product_slug_history','catalog_editorial_events'];
const PRODUCT_FIELDS = ['id','public_id','slug','title','price','currency','image_url','affiliate_url','source','source_query',
  'humor_tags','punny_title','witty_description','quality_score','rating','review_count','is_active','embedding',
  'editorial_writeup','source_facts','source_facts_hash','editorial_source_hash','availability_status','editorial_status',
  'editorial_quality_score','editorial_model','editorial_prompt_version','editorial_generated_at','editorial_block_reason',
  'duplicate_of_product_id','content_updated_at','availability_checked_at','last_verified_at','created_at','updated_at'];
type Archive = Awaited<ReturnType<typeof validateRecoveryArchive>>;
type SourceRow = Record<string,string|boolean|null>;
type Manifest = { sequences:Array<{schemaname:string;sequencename:string;increment_by:string;last_value:string|null;cycle:boolean}>;
  recoveryMetadata?:{sequences:Array<{schema:string;name:string;lastValue:string;isCalled:boolean}>} };
export interface FrozenD1RecoveryInput {
  schemaVersion:1; scope:'application-logical-tables-through-0012';
  provenance:{kind:'synthetic-fixture'|'unverified-capture';reference:string;barrierEvidence:null};
  tables:Record<string,Row[]>;
  inventory:Array<{table:string;rows:number;sha256:string}>;
}
export interface RollbackPacket {
  schemaVersion:1; kind:'offline-d1-to-pg-rollback'; baselineManifestSha256:string; inputSha256:string;
  provenance:FrozenD1RecoveryInput['provenance']; barrierVerified:false;
  changes:Array<{table:string;key:string;before:SourceRow|null;after:SourceRow}>;
  expectedTables:Array<{schema:string;table:string;rows:number;sha256:string}>;
  sequence:{schema:string;name:string;nextValue:string}|null;
  transformations:string[];
  limitations:string[];
  ownedImportSequences?:OwnedImportSequenceRollback;
}
function refuse():never { throw new Error('Rollback input incomplete, drifted or unsupported; no source access attempted'); }
function parse(value:unknown):Row {
  if(typeof value!=='string')refuse();
  const data=JSON.parse(value);if(!data||typeof data!=='object'||Array.isArray(data))refuse();return data;
}
function pgTime(value:string):string {
  return value.replace('T',' ').replace(/Z$/,'+00').replace(/\.([0-9]*?)0+(?=\+00$|$)/,(_,n:string)=>n?`.${n}`:'');
}
function scalar(column:RecoveryTable['columns'][number],value:unknown,old?:unknown):string|boolean|null {
  if(value===null){if(!column.nullable)refuse();return null;}
  if(column.type==='boolean'){if(typeof value!=='boolean')refuse();return value;}
  if(column.type==='jsonb')return canonicalJson(typeof value==='string'?JSON.parse(value):value);
  if(column.type==='text[]'){
    const array=maintenanceTextArray(value);if(!array)refuse();
    return `{${array.map(v=>v===null?'NULL':!v||/[\s{},"\\]/.test(v)||/^null$/i.test(v)?`"${v.replaceAll('\\','\\\\').replaceAll('"','\\"')}"`:v).join(',')}}`;
  }
  if(column.type.startsWith('timestamp ')){
    if(typeof value!=='string')refuse();
    if(value===old)return value; // Opaque historical wall time is not reinterpreted.
    if(!value.endsWith('Z'))refuse();
    const canonical=canonicalTimestamp(value)!;
    return pgTime(column.type==='timestamp without time zone'?canonical.slice(0,-1):canonical);
  }
  if(/^numeric\(/.test(column.type)){
    if(typeof value!=='string'||!/^\-?\d+(?:\.\d+)?$/.test(value))refuse();
    const scale=Number(column.type.match(/,(\d+)\)/)![1]);const [whole,part='']=value.split('.');
    if(part.slice(scale).replace(/0/g,''))refuse();return `${whole}${scale?`.${part.slice(0,scale).padEnd(scale,'0')}`:''}`;
  }
  if(['integer','bigint'].includes(column.type)){
    if(typeof value==='number'&&!Number.isSafeInteger(value))refuse();
    if(!/^-?\d+$/.test(String(value)))refuse();return String(value);
  }
  if(typeof value!=='string')refuse();return value;
}
/** Comparison form: JSONB/arrays are logical values, vectors stay native bytes.
 * Naive historical timestamps retain their wall time, without inventing UTC.
 */
export function rollbackLogicalRow(table:RecoveryTable,row:SourceRow):Row {
  return Object.fromEntries(table.columns.map(c=>[c.name,row[c.name]===null?null:c.type==='jsonb'?JSON.parse(String(row[c.name]))
    :c.type==='text[]'?maintenanceTextArray(row[c.name]):c.type.startsWith('timestamp ')?pgTime(String(row[c.name])):row[c.name]]));
}
export function rollbackRowsHash(table:RecoveryTable,rows:SourceRow[]):string {
  return sha256(canonicalJson(rows.map(r=>rollbackLogicalRow(table,r)).sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b)))));
}
function indexed(rows:Row[],key:string):Map<string,Row> {
  const result=new Map<string,Row>();for(const row of rows){if(typeof row[key]!=='string'||result.has(row[key] as string))refuse();result.set(row[key] as string,row);}return result;
}
function exactKeys(value:object,keys:string[]):boolean{return canonicalJson(Object.keys(value).sort())===canonicalJson([...keys].sort());}
function sourceMatch(raw:Row,old:SourceRow,omitEmbedding=false):void {
  const expected={...old};if(omitEmbedding)delete expected.embedding;
  if(canonicalJson(raw)!==canonicalJson(expected))refuse();
}
function typedCheck(row:Row,raw:Row,keys:string[]):void {
  for(const key of keys){
    if(!(key in raw))refuse();const a=row[key],b=raw[key];
    if(typeof b==='boolean'?(a!==b&&a!==(b?1:0))
      :key.endsWith('_at')?(a===null||b===null?a!==b:canonicalTimestamp(a)!==canonicalTimestamp(b))
        :String(a)!==String(b)||a===null&&b!==null)refuse();
  }
}
function unchangedHistoricalTimes(row:Row,old:SourceRow,keys:string[]):void {
  const provenance=parse(row.timestamp_provenance_json);const fields=(provenance.fields||{}) as Row;
  for(const key of keys){
    const proof=fields[key] as Row|undefined;const value=row[key],original=old[key];
    if(original===null){if(value!==null||proof?.state!=='source_null')refuse();continue;}
    if(value===null){if(proof?.state!=='unresolved'||typeof proof.evidence!=='string'||!proof.evidence.trim())refuse();continue;}
    if(typeof value!=='string'||!value.endsWith('Z'))refuse();
    const explicit=/(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(String(original));
    if(!explicit&&(proof?.state!=='evidenced'||proof.basis!=='documented_utc_writer'||typeof proof.evidence!=='string'||!proof.evidence.trim()))refuse();
    if(canonicalTimestamp(value)!==canonicalTimestamp(original,explicit?undefined:{timezone:'UTC',evidence:String(proof!.evidence)}))refuse();
  }
}
function productAmounts(row:Row,value:Row):void {
  const price=value.price,currency=value.currency;
  if(typeof price!=='string'||typeof currency!=='string'||row.currency!==currency
    ||row.price_minor!==(Number(price)>0?moneyToMinor(price,currency):null))refuse();
}
export function prepareRollbackPacket(archive:Archive,manifest:Manifest,input:FrozenD1RecoveryInput,inputSha256:string,
  ownedImport?:{plan:OwnedOperationalImportPlan;sha256:string}):RollbackPacket {
  let sequenceProof:OwnedImportSequenceRollback|undefined;
  if(ownedImport){
    if(ownedImport.plan.sourceManifestSha256!==archive.summary.manifestSha256)refuse();
    const table=archive.tables.find(t=>t.definition.schema==='public'&&t.definition.name==='catalog_run_items');if(!table)refuse();
    const normalized=normalizeOwnedImportSequences(ownedImport.plan,ownedImport.sha256,input,table.rows);
    input=normalized.input;sequenceProof=normalized.proof;
  }
  if(!/^[a-f0-9]{64}$/.test(inputSha256)||input.schemaVersion!==1||input.scope!=='application-logical-tables-through-0012'
    ||!['synthetic-fixture','unverified-capture'].includes(input.provenance?.kind)||!input.provenance.reference?.trim()
    ||input.provenance.barrierEvidence!==null||!exactKeys(input.tables,D1_RECOVERY_TABLES)||!Array.isArray(input.inventory)
    ||input.inventory.length!==D1_RECOVERY_TABLES.length||new Set(input.inventory.map(x=>x.table)).size!==D1_RECOVERY_TABLES.length)refuse();
  let total=0;
  for(const name of D1_RECOVERY_TABLES){const rows=input.tables[name],entry=input.inventory.find(x=>x.table===name);
    if(!Array.isArray(rows)||rows.length>20000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r))
      ||!entry||entry.rows!==rows.length||entry.sha256!==sha256(canonicalJson(rows)))refuse();total+=rows.length;}
  if(total>100000||Buffer.byteLength(canonicalJson(input))>128*1024*1024)refuse();
  const maintenance=indexed(input.tables.catalog_maintenance_products,'product_id');
  const telemetry=indexed(input.tables.catalog_run_telemetry,'run_id');const changes:RollbackPacket['changes']=[];
  const expectedTables:RollbackPacket['expectedTables']=[];const finalTables=[];let maximumItem=0n;let addedItems=false;
  for(const table of archive.tables){
    const def=table.definition;let final=table.rows;
    if(def.schema==='public'&&RUNTIME.includes(def.name)){
      const name=def.name;const key=name==='product_slug_history'?'slug':'id';const current=indexed(input.tables[name==='search_queries'?'search_history':name]||[],key);
      // Historical search_queries is the PG name; see separate mapping below.
      const original=indexed(table.rows,key);for(const id of original.keys())if(!current.has(id))refuse();
      final=[];
      for(const [id,row] of current){const old=original.get(id) as SourceRow|undefined;const raw=parse(row.source_record_json);let after:SourceRow;
        if(name==='products'){
          if(old)sourceMatch(raw,old,true);else if(raw.kind!=='maintenance_creation'||raw.id!==id||raw.public_id!==row.public_id||raw.slug!==row.slug)refuse();
          const maintained=maintenance.get(id);
          if(!maintained){
            if(!old)refuse();typedCheck(row,old,['id','public_id','slug','source','is_active','editorial_status','availability_status','source_facts_hash','editorial_source_hash','duplicate_of_product_id']);
            unchangedHistoricalTimes(row,old,['created_at','updated_at','availability_checked_at','last_verified_at']);productAmounts(row,old);
            if((row.quality_score===null?null:Number(row.quality_score))!==(old.quality_score===null?null:Number(old.quality_score)))refuse();after={...old};
          }else{
            if(!Number.isSafeInteger(maintained.version)||Number(maintained.version)<1)refuse();
            const semantic=maintenanceState({...row,maintenance_semantic:maintained.semantic_json});
            const values=Object.fromEntries(Object.entries(semantic).map(([k,v])=>[snake(k),v]));
            productAmounts(row,values);
            if(PRODUCT_FIELDS.some(k=>!(k in values))||Object.keys(values).some(k=>!def.columns.some(c=>c.name===k)))refuse();
            if(old&&(values.public_id!==old.public_id||values.slug!==old.slug||values.source!==old.source))refuse();
            const provenance=parse(row.timestamp_provenance_json);const fields=(provenance.fields||{}) as Row;
            after=Object.fromEntries(def.columns.map(c=>{
              if(c.name==='embedding')return[c.name,null];
              let value=values[c.name];if(value===undefined){if(!['category','click_count','impression_count','last_clicked_at'].includes(c.name))refuse();value=old?.[c.name]??((c as {default?:string}).default==='0'?'0':null);}
              if(value===null&&old?.[c.name]!==null&&old?.[c.name]!==undefined&&c.type.startsWith('timestamp ')
                &&(fields[c.name] as Row)?.state==='unresolved')value=old[c.name];
              return[c.name,scalar(c,value,old?.[c.name])];
            }));
            const present=maintained.embedding_present,native=maintained.embedding_native_base64;
            if(present===1){if(typeof native!=='string')refuse();decodePgvectorSendBase64(native);after.embedding=native;}
            else if(present===0){if(native!==null)refuse();after.embedding=null;}
            else refuse(); // Unknown native bytes must not become an absent vector.
          }
        }else if(name==='catalog_runs'&&telemetry.has(id)){
          const t=telemetry.get(id)!;const start=parse(t.start_json),finish=parse(t.finish_json);
          if(old)sourceMatch(raw,old);if(start.id!==id||!['completed','partial','failed'].includes(String(finish.status)))refuse();
          const merged=decodeD1CatalogTelemetryRow({...row,start_json:t.start_json,finish_json:t.finish_json});
          typedCheck(row,{...raw,...start,...finish},['id','status','mode','dry_run','started_at','completed_at']);
          merged.created_at??=merged.started_at;merged.updated_at??=merged.completed_at;
          after=Object.fromEntries(def.columns.map(c=>[c.name,scalar(c,c.name==='estimated_cost_usd'&&typeof merged[c.name]==='number'?String(merged[c.name]):merged[c.name]??null,old?.[c.name])]));
        }else if(name==='catalog_run_items'&&!old){
          if(raw.id!==id)refuse();typedCheck(row,raw,['id','run_id','product_id','external_id','decision','requires_manual_review','created_at']);
          if(!Number.isSafeInteger(row.sequence)||Number(row.sequence)<1)refuse();
          const merged=decodeD1CatalogTelemetryRow(row);
          after=Object.fromEntries(def.columns.map(c=>[c.name,scalar(c,c.name==='sequence'?String(row.sequence):merged[c.name]??null)]));addedItems=true;
        }else if(name==='catalog_editorial_events'&&!old){
          typedCheck(row,raw,['id','run_id','product_id','event_type','status','created_at']);
          const provenance=parse(row.timestamp_provenance_json);const proof=(provenance.fields as Row)?.created_at as Row|undefined;
          const operation=(raw._maintenance as Row)?.operationId;
          const operationRow=input.tables.catalog_maintenance_operations.find(o=>o.operation_id===operation);
          if(typeof operation!=='string'||! /^[a-f0-9]{64}$/.test(operation)||proof?.state!=='evidenced'
            ||proof.basis!=='maintenance_operation'||proof.operationId!==operation
            ||!operationRow||operationRow.run_id!==raw.run_id||canonicalTimestamp(raw.created_at)!==canonicalTimestamp(operationRow.database_time)
            ||!input.tables.products.some(p=>p.id===raw.product_id)||!input.tables.catalog_runs.some(r=>r.id===raw.run_id))refuse();
          after=Object.fromEntries(def.columns.map(c=>[c.name,scalar(c,c.type==='jsonb'?canonicalJson(raw[c.name]??null):raw[c.name]??null)]));
        }else{
          if(!old)refuse();sourceMatch(raw,old);
          const keys=name==='catalog_runs'?['id','status','mode','dry_run','started_at','completed_at']
            :name==='catalog_run_items'?['id','run_id','product_id','external_id','decision','requires_manual_review','sequence','created_at']
              :name==='product_slug_history'?['slug','product_id','created_at']:['id','run_id','product_id','event_type','status'];
          typedCheck(row,old,keys);
          if(name==='catalog_editorial_events')unchangedHistoricalTimes(row,old,['created_at']);after={...old};
        }
        if(name==='catalog_run_items')maximumItem=BigInt(String(after.sequence))>maximumItem?BigInt(String(after.sequence)):maximumItem;
        if(!old||rollbackRowsHash(def,[old])!==rollbackRowsHash(def,[after]))changes.push({table:name,key:id,before:old||null,after});
        final.push(after);
      }
    }
    expectedTables.push({schema:def.schema,table:def.name,rows:final.length,sha256:rollbackRowsHash(def,final)});
    finalTables.push({...table,rows:final});
  }
  if(RUNTIME.some(name=>!archive.tables.some(t=>t.definition.schema==='public'&&t.definition.name===name))
    ||maintenance.size!==input.tables.products.filter(r=>maintenance.has(String(r.id))).length
    ||telemetry.size!==input.tables.catalog_runs.filter(r=>telemetry.has(String(r.id))).length)refuse();
  // Search history is unchanged-only in v1. Never pretend to map new hashed diagnostics to old raw queries.
  const searches=archive.tables.find(t=>t.definition.schema==='public'&&t.definition.name==='search_queries');
  if(!searches)refuse();
  const currentSearches=indexed(input.tables.search_history,'id'),originalSearches=indexed(searches.rows,'id');
  if(currentSearches.size!==originalSearches.size||[...originalSearches.keys()].some(id=>!currentSearches.has(id)))refuse();
  for(const [id,r] of currentSearches){const old=originalSearches.get(id) as SourceRow;sourceMatch(parse(r.source_record_json),old);
    if(r.legacy_bundle_id!==(old.clicked_bundle_id??null)||r.legacy_bundle_slug!==(old.clicked_bundle_slug??null))refuse();
    unchangedHistoricalTimes(r,old,['created_at']);}
  validateArchiveRelations(finalTables);
  const items=finalTables.find(t=>t.definition.schema==='public'&&t.definition.name==='catalog_run_items')!.rows;
  if(new Set(items.map(r=>r.sequence)).size!==items.length)refuse();
  let sequence:RollbackPacket['sequence']=null;
  if(addedItems){const s=manifest.sequences.find(s=>s.schemaname==='public'&&s.sequencename==='catalog_run_items_sequence_seq');
    const state=manifest.recoveryMetadata?.sequences.find(x=>x.schema===s?.schemaname&&x.name===s.sequencename);
    if(!s||s.increment_by!=='1'||s.cycle||!state)refuse();
    const next=state.isCalled?BigInt(state.lastValue)+1n:BigInt(state.lastValue);
    sequence={schema:s.schemaname,name:s.sequencename,nextValue:String(maximumItem+1n>next?maximumItem+1n:next)};
  }
  return {schemaVersion:1,kind:'offline-d1-to-pg-rollback',baselineManifestSha256:archive.summary.manifestSha256,inputSha256,
    ...(sequenceProof?{ownedImportSequences:sequenceProof}:{}),
    provenance:input.provenance,barrierVerified:false,changes,expectedTables,sequence,limitations:[
      'Frozen logical row input is checksum-bound, not independently verified complete provider/barrier evidence.',
      'No production apply path. Native execution accepts synthetic fixtures in newly owned isolated containers only.',
      'No deletions, renames, new slug/search history, unknown vectors, or unproven timestamp changes.',
      'D1-only state and original frozen rows remain in the private sidecar, not active PostgreSQL tables.',
      'Original cluster roles/settings/grants, final source delta and real post-cutover recovery remain separate gates.'],transformations:[
        'For D1-native runs, PG-only created_at maps to recorded started_at; no distinct D1 creation timestamp is claimed.',
        'New explicit UTC instants map to UTC wall times in legacy naive PG columns; original historical wall times remain unchanged.',
        'New PG-only product counters initialize to zero; existing counters/category/last-click state remain unchanged.',
        ...(sequenceProof?['Checksum/receipt-proven imported legacy item sequences return to their original PG values; colliding D1-native additions receive explicit unused PG sequences. Exact D1 sequence values remain in the original sidecar.']:[])]};
}
async function privateJson(path:string,expected:string,maxBytes=128*1024*1024):Promise<{bytes:Buffer;data:unknown}>{
  await assertPrivateOutsideGit(dirname(path));if(! /^[a-f0-9]{64}$/.test(expected))refuse();
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const info=await handle.stat();
    if(!info.isFile()||(info.mode&0o077)||!Number.isSafeInteger(info.size)||info.size>maxBytes)refuse();
    const buffer=Buffer.alloc(info.size+1);let length=0;
    while(length<buffer.length){const r=await handle.read(buffer,length,buffer.length-length,null);if(!r.bytesRead)break;length+=r.bytesRead;}
    const after=await handle.stat();
    if(length!==info.size||after.size!==info.size||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs||after.mode!==info.mode)refuse();
    const bytes=buffer.subarray(0,length);if(createHash('sha256').update(bytes).digest('hex')!==expected)refuse();
    const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);return{bytes,data:JSON.parse(text)};
  }finally{await handle.close();}
}
/** Offline preparation only. Inputs/outputs are private, pinned and outside Git.
 * A no-network reusable packet builder, deliberately without any database apply CLI.
 */
export async function writeRollbackPacket(options:{archive:string;baselineSha256:string;input:string;inputSha256:string;output:string;
  ownedImport?:{plan:OwnedOperationalImportPlan;sha256:string}}){
  const archive=await validateRecoveryArchive(options.archive,{expectedManifestSha256:options.baselineSha256});
  const manifest=(await privateJson(join(archive.directory,'manifest.json'),options.baselineSha256,1_000_000)).data as Manifest;
  const input=await privateJson(options.input,options.inputSha256);
  const packet=prepareRollbackPacket(archive,manifest,input.data as FrozenD1RecoveryInput,options.inputSha256,options.ownedImport);
  await assertPrivateOutsideGit(dirname(options.output));await mkdir(options.output,{mode:0o700});
  const text=`${canonicalJson(packet)}\n`;const packetSha256=sha256(text);
  await writeFile(join(options.output,'rollback.json'),text,{mode:0o600,flag:'wx'});
  await writeFile(join(options.output,'d1-sidecar.json'),input.bytes,{mode:0o600,flag:'wx'});
  const receipt={schemaVersion:1,baselineSha256:options.baselineSha256,packetSha256,inputSha256:options.inputSha256,
    sidecarSha256:options.inputSha256,provenance:packet.provenance,barrierVerified:false,changes:packet.changes.length};
  const receiptText=`${canonicalJson(receipt)}\n`;
  await writeFile(join(options.output,'manifest.json'),receiptText,{mode:0o600,flag:'wx'});
  return{directory:options.output,packetSha256,manifestSha256:sha256(receiptText),packet};
}
/** Recompute from the pinned sidecar/baseline; a modified packet is not trusted. */
export async function readRollbackFixture(directory:string,expectedPacketSha256:string,archive:Archive,manifest:Manifest,
  ownedImport?:{plan:OwnedOperationalImportPlan;sha256:string}){
  const p=await privateJson(join(directory,'rollback.json'),expectedPacketSha256);const packet=p.data as RollbackPacket;
  const input=await privateJson(join(directory,'d1-sidecar.json'),packet.inputSha256);
  const expected=prepareRollbackPacket(archive,manifest,input.data as FrozenD1RecoveryInput,packet.inputSha256,ownedImport);
  if(packet.provenance.kind!=='synthetic-fixture'||canonicalJson(packet)!==canonicalJson(expected))refuse();return packet;
}

async function main(argv:string[]){
  if(argv.includes('--help')){console.log('Offline preparation only: --archive /private/baseline --baseline-sha SHA --input /private/frozen.json --input-sha SHA --output /private/new-packet. No provider capture, DSN or database apply option.');return;}
  const args:Record<string,string>={};
  for(let i=0;i<argv.length;i++){
    if(!['--archive','--baseline-sha','--input','--input-sha','--output'].includes(argv[i])||!argv[i+1]||args[argv[i]])refuse();args[argv[i]]=argv[++i];
  }
  if(Object.keys(args).length!==5)refuse();
  const result=await writeRollbackPacket({archive:args['--archive'],baselineSha256:args['--baseline-sha'],input:args['--input'],inputSha256:args['--input-sha'],output:args['--output']});
  console.log(JSON.stringify({status:'prepared-not-applied',directory:result.directory,packetSha256:result.packetSha256,
    manifestSha256:result.manifestSha256,provenance:result.packet.provenance.kind,barrierVerified:false,changes:result.packet.changes.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(()=>{
  console.error('Offline rollback preparation refused. No source/provider/database access attempted.');process.exitCode=1;
});
