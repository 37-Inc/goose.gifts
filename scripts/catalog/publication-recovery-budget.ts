import { canonicalJson, sha256 } from './migration.ts';
import { assertOneTimeMigrationBudget, validMigrationLedger } from './one-time-migration-budget.ts';
import type { MigrationAccountUsage, OneTimeMigrationBudget } from './one-time-migration-budget.ts';
import type { D1AccountingState } from './d1-write-rest.ts';

const HASH=/^[a-f0-9]{64}$/;
const exact=(v:unknown,keys:string)=>!!v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const hash=(v:unknown)=>typeof v==='string'&&HASH.test(v);
const refuse=():never=>{throw new Error('publication_recovery_budget_refused');};
function instant(v:string){const n=Date.parse(v);if(!Number.isFinite(n)||new Date(n).toISOString()!==v)refuse();return n;}

export interface PublicationRecoveryBudgetInput {
  prior:{profile:OneTimeMigrationBudget;sha256:string};ledgerAtApproval:D1AccountingState;
  usage:MigrationAccountUsage;
  /** Trusted, explicit operator approval; never inferred from a failed run. */
  approval:{sha256:string;additionalRowsRead:number;minimumFreeRowsRead:number};
  /** Reviewed classifications retain, rather than settle/refund, old unknowns. */
  retainedUnknowns:{count:number;evidenceSha256:string;unknownD1Writes:0};
  /** Bound the exact reviewed SQL/inventory, not arbitrary user-supplied SQL.
   * A provider result exceeding this estimate is charged and stops the client. */
  batchBound:{rowsRead:number;rowsWritten:number;evidenceSha256:string;
    statements:Array<{sha256:string;rowsRead:number;rowsWritten:number}>};
}
export interface PublicationRecoveryBudget {
  schemaVersion:1;kind:'one-time-publication-recovery';createdAt:string;expiresAt:string;
  input:PublicationRecoveryBudgetInput;limits:OneTimeMigrationBudget['limits'];
}

/** A separate, approval-bound allowance on the SAME ledger. This is not a
 * Cloudflare quota reservation or proof that an SQL cost estimate is correct.
 * Use one exclusive-workspace client with the reviewed bounded SQL only. */
export function createPublicationRecoveryBudget(value:PublicationRecoveryBudgetInput,now=new Date()){
  const input=structuredClone(value),createdAt=now.toISOString(),at=instant(createdAt),day=createdAt.slice(0,10);
  const {prior,ledgerAtApproval:a,usage:u,approval:p,retainedUnknowns:k,batchBound:b}=input;
  if(!exact(input,'prior,ledgerAtApproval,usage,approval,retainedUnknowns,batchBound')
    ||!exact(prior,'profile,sha256'))refuse();
  assertOneTimeMigrationBudget(prior.profile,prior.sha256,now);
  const scope=prior.profile.input.scope,old=prior.profile.input.ledgerAtObservation;
  if(!validMigrationLedger(a)||Object.keys(old).some(key=>a[key as keyof D1AccountingState]<old[key as keyof D1AccountingState])
    ||!exact(u,'accountId,utcDay,capturedAt,coverage,resources,rowsRead,rowsWritten,evidenceSha256')
    ||u.accountId!==scope.accountId||u.utcDay!==day||u.coverage!=='account-wide'||!hash(u.evidenceSha256)
    ||!integer(u.rowsRead)||!integer(u.rowsWritten)||!Array.isArray(u.resources)||!u.resources.length||u.resources.length>100
    ||u.resources.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
    ||new Set(u.resources).size!==u.resources.length||!u.resources.includes(scope.databaseId)
    ||u.capturedAt.slice(0,10)!==day||instant(u.capturedAt)>at||at-instant(u.capturedAt)>300_000
    ||!exact(p,'sha256,additionalRowsRead,minimumFreeRowsRead')||!hash(p.sha256)
    ||!integer(p.additionalRowsRead)||p.additionalRowsRead<1||p.additionalRowsRead>600_000
    ||!integer(p.minimumFreeRowsRead)||p.minimumFreeRowsRead<300_000
    ||!exact(k,'count,evidenceSha256,unknownD1Writes')||k.count!==a.unconfirmedRequests
    ||!hash(k.evidenceSha256)||k.unknownD1Writes!==0
    ||!exact(b,'rowsRead,rowsWritten,evidenceSha256,statements')||!hash(b.evidenceSha256)
    ||!integer(b.rowsRead)||b.rowsRead<1||b.rowsRead>80_000||b.rowsRead>p.additionalRowsRead
    ||!integer(b.rowsWritten)||b.rowsWritten<1||b.rowsWritten>1_000
    ||!Array.isArray(b.statements)||!b.statements.length||b.statements.length>512
    ||new Set(b.statements.map(s=>s.sha256)).size!==b.statements.length
    ||b.statements.some(s=>!exact(s,'sha256,rowsRead,rowsWritten')||!hash(s.sha256)
      ||!integer(s.rowsRead)||s.rowsRead>b.rowsRead||!integer(s.rowsWritten)||s.rowsWritten>b.rowsWritten)
    ||a.httpRequests>=prior.profile.limits.requests||a.sqlStatements>=prior.profile.limits.statements
    ||a.knownRowsWritten>prior.profile.limits.reportedRowsWritten
    ||Math.max(u.rowsRead,a.knownRowsRead)+p.additionalRowsRead+p.minimumFreeRowsRead>5_000_000
    ||Math.max(u.rowsWritten,a.knownRowsWritten)+prior.profile.limits.reportedRowsWritten-a.knownRowsWritten+10_000>100_000)refuse();
  const profile:PublicationRecoveryBudget={schemaVersion:1,kind:'one-time-publication-recovery',createdAt,
    expiresAt:prior.profile.expiresAt,input,limits:{...prior.profile.limits,reportedRowsRead:a.knownRowsRead+p.additionalRowsRead}};
  return{profile,sha256:sha256(canonicalJson(profile))};
}
/** A resume verifies the original approval and anchor; it never issues another
 * allowance, refreshes account usage, or hides any old/new unknown charge. */
export function assertPublicationRecoveryBudget(profile:PublicationRecoveryBudget,expected:string,now=new Date()){
  if(!exact(profile,'schemaVersion,kind,createdAt,expiresAt,input,limits')||profile.schemaVersion!==1
    ||profile.kind!=='one-time-publication-recovery'||!hash(expected)||sha256(canonicalJson(profile))!==expected)refuse();
  const rebuilt=createPublicationRecoveryBudget(profile.input,new Date(profile.createdAt));
  if(rebuilt.sha256!==expected||!Number.isFinite(now.getTime())||now.getTime()<instant(profile.createdAt)
    ||now.getTime()>=instant(profile.expiresAt))refuse();
}
