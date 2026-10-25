import { isAbsolute, normalize } from 'node:path';
import { canonicalJson, canonicalTimestamp, sha256 } from './migration.ts';
import { mutationFenceQuery } from '../../lib/catalog/mutation-fence.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';
import type { ArtifactRef } from './run-workspace.ts';
import type { SnapshotReadContext } from './export-d1-snapshot.ts';

/** One reviewed continuation, not a replacement run, a rights renewal or a new
 * budget. Original source/config remain the workspace identity forever. */
export interface ExecutionAdoption {
  schemaVersion: 1; kind: 'catalog-execution-adoption-v1';
  original: {
    manifestSha256: string; configSha256: string; codeSha: string; sourceRoot: string;
    checkpointSha256: string; owner: MutationOwner; context: ArtifactRef;
    journal: { sequence: number; sha256: string }; budgetCaps: { httpRequests: number; sqlStatements: number };
  };
  effective: { codeSha: string; sourceRoot: string; configSha256: string; publicationConfigSha256: string };
  contexts: { original: SnapshotReadContext; replacement: SnapshotReadContext; ref: ArtifactRef };
  approvalSha256: string; approvedAt: string; observedAt: string; notAfter: string;
}
const HASH = /^[a-f0-9]{64}$/, CODE = /^[a-f0-9]{40}$/;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const exact = (v: unknown, keys: string[]) => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
function fail(code: string): never { throw new Error(`execution_adoption_${code}`); }
function instant(value: unknown) { try {
  if (typeof value !== 'string' || !value.endsWith('Z')) fail('time');
  return Date.parse(canonicalTimestamp(value)!);
} catch { return fail('time'); } }
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
function root(value: unknown): value is string { return typeof value === 'string' && isAbsolute(value) && normalize(value) === value; }
function ref(value: ArtifactRef) { if (!exact(value, ['sha256', 'reference']) || !HASH.test(value.sha256)
  || value.reference !== `objects/${value.sha256}.json`) fail('reference'); }
function context(value: SnapshotReadContext) {
  if (!exact(value, ['envelopeSha256', 'snapshotSha256', 'projectionSha256', 'sourceExportSha256', 'vectorSyncWatermark',
    'publicationReceiptWatermark', 'cutoff', 'priorPublication'])
    || ![value.envelopeSha256, value.snapshotSha256, value.projectionSha256, value.sourceExportSha256].every(v => HASH.test(v))
    || !integer(value.vectorSyncWatermark) || !integer(value.publicationReceiptWatermark)
    || value.priorPublication !== null && (!exact(value.priorPublication, ['releaseId', 'receiptSha256'])
      || !/^[a-zA-Z0-9._-]{1,200}$/.test(value.priorPublication.releaseId) || !HASH.test(value.priorPublication.receiptSha256))) fail('context');
  instant(value.cutoff);
}
/** The explicit review digest excludes only its own field. */
export function executionAdoptionDigest(value: Omit<ExecutionAdoption, 'approvalSha256'> | ExecutionAdoption): string {
  const { approvalSha256: unused, ...body } = value as ExecutionAdoption; void unused;
  return sha256(canonicalJson(body));
}
export function validateExecutionAdoption(value: ExecutionAdoption): ExecutionAdoption {
  if (!exact(value, ['schemaVersion', 'kind', 'original', 'effective', 'contexts', 'approvalSha256', 'approvedAt', 'observedAt', 'notAfter'])
    || value.schemaVersion !== 1 || value.kind !== 'catalog-execution-adoption-v1'
    || !exact(value.original, ['manifestSha256', 'configSha256', 'codeSha', 'sourceRoot', 'checkpointSha256', 'owner', 'context', 'journal', 'budgetCaps'])
    || !exact(value.effective, ['codeSha', 'sourceRoot', 'configSha256', 'publicationConfigSha256'])
    || !exact(value.contexts, ['original', 'replacement', 'ref'])
    || Buffer.byteLength(canonicalJson(value)) > 32 * 1024) fail('descriptor');
  const o = value.original, e = value.effective;
  if (![o.manifestSha256, o.configSha256, o.checkpointSha256, e.configSha256, e.publicationConfigSha256, value.approvalSha256].every(v => HASH.test(v))
    || !CODE.test(o.codeSha) || !CODE.test(e.codeSha) || !root(o.sourceRoot) || !root(e.sourceRoot)
    || !exact(o.journal, ['sequence', 'sha256']) || !integer(o.journal.sequence) || o.journal.sequence < 1 || !HASH.test(o.journal.sha256)
    || !exact(o.budgetCaps, ['httpRequests', 'sqlStatements']) || !Object.values(o.budgetCaps).every(integer)
    || !exact(o.owner, ['environment', 'indexName', 'token', 'generation', 'epoch', 'phase', 'ownerReference', 'operationKey', 'capturedAt'])
    || o.owner.phase !== 'writing') fail('binding');
  mutationFenceQuery(o.owner); ref(o.context); ref(value.contexts.ref);
  context(value.contexts.original); context(value.contexts.replacement);
  if (sha256(canonicalJson(value.contexts.original)) !== o.context.sha256
    || sha256(canonicalJson(value.contexts.replacement)) !== value.contexts.ref.sha256
    || !same({ ...value.contexts.original, cutoff: value.contexts.replacement.cutoff }, value.contexts.replacement)) fail('context_delta');
  const observed = instant(value.observedAt), approved = instant(value.approvedAt), notAfter = instant(value.notAfter);
  const oldCutoff = instant(value.contexts.original.cutoff), nextCutoff = instant(value.contexts.replacement.cutoff);
  if (approved < observed || approved < instant(o.owner.capturedAt) || notAfter <= observed
    || oldCutoff <= observed || nextCutoff <= oldCutoff || nextCutoff > notAfter || approved >= nextCutoff
    || nextCutoff - instant(o.owner.capturedAt) > 26 * 3600000) fail('window');
  if (executionAdoptionDigest(value) !== value.approvalSha256) fail('approval');
  return value;
}

/** Deliberately tiny allowed config delta. The driver independently verifies
 * ORIGINAL/EFFECTIVE raw file digests against the descriptor before this call.
 * Inputs,
 * credentials, limits, cadence, prior receipt and provider scope are unchanged.
 * The driver reads replacement context from the adoption ref, not a rewritten
 * inputs.context file. This helper does not validate credentials or call IO. */
export function validateExecutionAdoptionConfigs(originalConfig: unknown, effectiveConfig: unknown, value: ExecutionAdoption): void {
  validateExecutionAdoption(value);
  type Config = { codeSha: string; publication: Record<string, unknown>; limits: { requests: number; statements: number } };
  const original = originalConfig as Config, effective = effectiveConfig as Config;
  if (!original || !original.publication || original.codeSha !== value.original.codeSha
    || original.publication.codeSha !== value.original.codeSha || original.publication.sourceRoot !== value.original.sourceRoot
    || !original.limits || original.limits.requests !== value.original.budgetCaps.httpRequests
    || original.limits.statements !== value.original.budgetCaps.sqlStatements) fail('original_config');
  const expected = { ...original, codeSha: value.effective.codeSha,
    publication: { ...original.publication, codeSha: value.effective.codeSha, sourceRoot: value.effective.sourceRoot } };
  if (!same(expected, effective) || sha256(canonicalJson(effective.publication)) !== value.effective.publicationConfigSha256) fail('config_delta');
}
