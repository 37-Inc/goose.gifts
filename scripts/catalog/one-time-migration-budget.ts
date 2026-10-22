import { canonicalJson, sha256 } from './migration.ts';
import type { D1AccountingState } from './d1-write-rest.ts';

const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const FREE={rowsRead:5_000_000,rowsWritten:100_000};
export const MIGRATION_HEADROOM=Object.freeze({rowsRead:1_000_000,rowsWritten:10_000});
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const hash=(v:unknown)=>typeof v==='string'&&HASH.test(v);
function refuse():never{throw new Error('migration_budget_refused');}
function instant(value:string){if(typeof value!=='string'||new Date(value).toISOString()!==value)refuse();return Date.parse(value);}
export interface MigrationAccountUsage {
  accountId:string;utcDay:string;capturedAt:string;coverage:'account-wide';resources:string[];
  rowsRead:number;rowsWritten:number;evidenceSha256:string;
}
export interface MigrationBudgetInput {
  scope:{accountId:string;databaseId:string;databaseName:string};observations:MigrationAccountUsage[];
  ledgerAtObservation:D1AccountingState;
  /** Root-reviewed WHOLE-run envelope: schema, capture, import, public base,
   * projection, publication and recovery. This helper does not estimate it. */
  required:{requests:number;statements:number;rowsRead:number;rowsWritten:number;evidenceSha256:string};
}
export interface OneTimeMigrationBudget {
  schemaVersion:1;kind:'one-time-d1-migration';createdAt:string;expiresAt:string;input:MigrationBudgetInput;
  limits:{requests:number;statements:number;reportedRowsRead:number;reportedRowsWritten:number};
}
export function validMigrationLedger(value:D1AccountingState):boolean{
  return exact(value,['httpRequests','sqlStatements','knownRowsRead','knownRowsWritten','unconfirmedRequests'])
    &&Object.values(value).every(integer)&&value.unconfirmedRequests<=value.httpRequests;
}
/** Pure trusted-operator input, not proof that analytics is real-time or a
 * reservation of Cloudflare quota. Retain the source receipts and bound lag,
 * other account traffic and maximum next-batch cost inside the headroom. */
export function createOneTimeMigrationBudget(input:MigrationBudgetInput,now=new Date()){
  input=structuredClone(input);const createdAt=now.toISOString(),at=instant(createdAt),day=createdAt.slice(0,10),s=input?.scope,r=input?.required;
  if(!exact(input,['scope','observations','ledgerAtObservation','required'])||!exact(s,['accountId','databaseId','databaseName'])
    ||typeof s.accountId!=='string'||!/^[a-f0-9]{32}$/.test(s.accountId)||typeof s.databaseId!=='string'||!UUID.test(s.databaseId)
    ||typeof s.databaseName!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(s.databaseName)
    ||!Array.isArray(input.observations)||!input.observations.length||input.observations.length>32
    ||!validMigrationLedger(input.ledgerAtObservation)||input.ledgerAtObservation.unconfirmedRequests!==0
    ||!exact(r,['requests','statements','rowsRead','rowsWritten','evidenceSha256'])||!hash(r.evidenceSha256)
    ||Object.entries(r).some(([k,v])=>k!=='evidenceSha256'&&(!integer(v)||Number(v)<1))||r.requests>10_000||r.statements>25_000)refuse();
  let read=0,written=0,latest=0;
  for(const o of input.observations){
    if(!exact(o,['accountId','utcDay','capturedAt','coverage','resources','rowsRead','rowsWritten','evidenceSha256'])
      ||o.accountId!==s.accountId||o.utcDay!==day||o.coverage!=='account-wide'||!hash(o.evidenceSha256)
      ||!integer(o.rowsRead)||!integer(o.rowsWritten)||!Array.isArray(o.resources)||!o.resources.length||o.resources.length>100
      ||o.resources.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(o.resources).size!==o.resources.length
      ||!o.resources.includes(s.databaseId))refuse();
    const observed=instant(o.capturedAt);if(o.capturedAt.slice(0,10)!==day||observed>at)refuse();
    latest=Math.max(latest,observed);read=Math.max(read,o.rowsRead);written=Math.max(written,o.rowsWritten);
  }
  if(at-latest>5*60_000)refuse();
  const anchor=input.ledgerAtObservation;
  if(anchor.httpRequests>=r.requests||anchor.sqlStatements>=r.statements)refuse();
  // An observation may already include our earlier charges. Count the larger
  // floor, then only subsequent SAME-ledger progress; never add the anchor twice.
  read=Math.max(read,anchor.knownRowsRead);written=Math.max(written,anchor.knownRowsWritten);
  const remainingRead=FREE.rowsRead-read-MIGRATION_HEADROOM.rowsRead;
  const remainingWritten=FREE.rowsWritten-written-MIGRATION_HEADROOM.rowsWritten;
  if(r.rowsRead>remainingRead||r.rowsWritten>remainingWritten)refuse();
  const profile:OneTimeMigrationBudget={schemaVersion:1,kind:'one-time-d1-migration',createdAt,
    expiresAt:new Date(Date.parse(`${day}T00:00:00.000Z`)+86400_000).toISOString(),input,
    limits:{requests:r.requests,statements:r.statements,reportedRowsRead:anchor.knownRowsRead+r.rowsRead,
      reportedRowsWritten:anchor.knownRowsWritten+r.rowsWritten}};
  return{profile,sha256:sha256(canonicalJson(profile))};
}
/** Recompute exact pinned bytes on resume; never refresh the observation,
 * grow an allowance or carry a profile across midnight UTC. */
export function assertOneTimeMigrationBudget(profile:OneTimeMigrationBudget,expected:string,now=new Date()){
  if(!exact(profile,['schemaVersion','kind','createdAt','expiresAt','input','limits'])||profile.schemaVersion!==1
    ||profile.kind!=='one-time-d1-migration'||!hash(expected)||sha256(canonicalJson(profile))!==expected)refuse();
  const rebuilt=createOneTimeMigrationBudget(profile.input,new Date(profile.createdAt));
  if(rebuilt.sha256!==expected||!Number.isFinite(now.getTime())||now.getTime()<instant(profile.createdAt)||now.getTime()>=instant(profile.expiresAt))refuse();
}
