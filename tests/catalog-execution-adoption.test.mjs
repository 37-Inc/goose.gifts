import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { openRunWorkspace, readRunWorkspace } from '../scripts/catalog/run-workspace.ts';
import { executionAdoptionDigest, validateExecutionAdoption, validateExecutionAdoptionConfigs } from '../scripts/catalog/execution-adoption.ts';
import { encodeBuildRequest } from '../lib/catalog/build-requests.ts';

const OLD = '2026-10-24T15:00:00.000Z', CLAIM = '2026-10-24T15:01:00.000Z', NOW = '2026-10-24T17:00:00.000Z';
const OLD_CUTOFF = '2026-10-24T16:00:00.000Z', NEXT_CUTOFF = '2026-10-24T18:00:00.000Z', HARD = '2026-10-25T15:00:00.000Z';
const hash = x => String(x).repeat(64), OLD_CODE = 'a'.repeat(40), NEW_CODE = 'b'.repeat(40);
const kinds = ['amazon-observation', 'embedding-response', 'phase', 'publication', 'checkpoint'];
const scope = { environment: 'production', accountId: 'synthetic-account', databaseId: 'synthetic-db', databaseName: 'synthetic',
  workerName: 'synthetic-worker', indexName: 'synthetic-index' };
const live = globalThis.fetch; globalThis.fetch = async () => { throw Error('Live network forbidden'); };
test.after(() => { globalThis.fetch = live; });
const seal = value => ({ ...value, approvalSha256: executionAdoptionDigest(value) });
const ref = value => { const h = sha256(canonicalJson(value)); return { sha256: h, reference: `objects/${h}.json` }; };

async function fixture(t) {
  const parent = await mkdtemp(join(await realpath(tmpdir()), 'stupid-adoption-'));
  const repository = join(parent, 'original'), successor = join(parent, 'successor');
  await mkdir(repository, { mode: 0o700 }); await mkdir(successor, { mode: 0o700 });
  let clock = OLD; const handles = [];
  t.after(async () => { for (const w of handles.reverse()) try { await w.close(); } catch { /* Explicitly corrupted local fixture. */ }
    await rm(parent, { recursive: true, force: true }); });
  const original = { schemaVersion: 1, runId: 'synthetic-run', codeSha: OLD_CODE, limits: { requests: 100, statements: 200, reportedRowsRead: 1000, reportedRowsWritten: 100 },
    credentials: { cloudflare: 'SYNTHETIC-NOT-CREDENTIAL', amazon: 'UNCHANGED' }, cadence: { day: '2026-10-24' },
    inputs: { context: { path: join(parent, 'original-context.json'), sha256: hash('1'), observedAt: OLD }, previous: 'UNCHANGED', rights: 'UNCHANGED' },
    publication: { codeSha: OLD_CODE, sourceRoot: repository, releaseId: 'synthetic-run', identityOrigin: 'https://example.invalid', prior: 'UNCHANGED' } };
  const effective = { ...structuredClone(original), codeSha: NEW_CODE, publication: { ...original.publication, codeSha: NEW_CODE, sourceRoot: successor } };
  const options = { directory: join(parent, 'workspace'), repository, mode: 'create', runId: original.runId, configSha256: sha256(JSON.stringify(original) + '\n'),
    codeSha: OLD_CODE, scope, retention: { reviewReference: 'test/only', rules: Object.fromEntries(kinds.map(kind => [kind, { maxAgeMs: 86400000, notAfter: HARD }])) },
    budgetCaps: { httpRequests: 100, sqlStatements: 200 }, now: () => clock };
  const open = async override => { const w = await openRunWorkspace({ ...options, ...override }); handles.push(w); return w; };
  const w = await open(), oldContext = { envelopeSha256: hash('1'), snapshotSha256: hash('2'), projectionSha256: hash('3'), sourceExportSha256: hash('4'),
    vectorSyncWatermark: 0, publicationReceiptWatermark: 7, cutoff: OLD_CUTOFF,
    priorPublication: { releaseId: 'previous-release', receiptSha256: hash('5') } };
  const originalContext = await w.putArtifact(oldContext, { kind: 'phase', observedAt: OLD });
  const phase = await w.putArtifact({ counts: { selected: 10 } }, { kind: 'publication', observedAt: OLD });
  const lost = { id: 'retained-unknown', requestSha256: hash('6'), units: { httpRequests: 1, sqlStatements: 2 } };
  await w.reserveBudget(lost); await w.settleBudget(lost.id, { status: 'unknown', usage: null });
  const known = { ...lost, id: 'known', units: { httpRequests: 1, sqlStatements: 3 } };
  await w.reserveBudget(known); await w.settleBudget(known.id, { status: 'known', usage: { rowsRead: 17, rowsWritten: 3 } });
  const owner = { environment: scope.environment, indexName: scope.indexName, token: 'SYNTHETIC-owner', generation: 17, epoch: 441,
    phase: 'writing', ownerReference: options.runId, operationKey: hash('7'), capturedAt: CLAIM };
  clock = CLAIM;
  const cp = await w.writeCheckpoint(null, { phase: 'phases_complete', owner, pins: { context: originalContext }, state: {}, phaseComplete: phase });
  const head = JSON.parse(await readFile(join(w.directory, 'head.json'))), replacement = { ...oldContext, cutoff: NEXT_CUTOFF };
  const observedAt = JSON.parse(await readFile(join(w.directory, originalContext.reference))).observedAt;
  const a = seal({ schemaVersion: 1, kind: 'catalog-execution-adoption-v1', original: { manifestSha256: w.manifestSha256,
    configSha256: options.configSha256, codeSha: OLD_CODE, sourceRoot: repository, checkpointSha256: cp.sha256,
    owner, context: originalContext, journal: head, budgetCaps: options.budgetCaps },
    effective: { codeSha: NEW_CODE, sourceRoot: successor, configSha256: sha256(JSON.stringify(effective) + '\n'), publicationConfigSha256: sha256(canonicalJson(effective.publication)) },
    contexts: { original: oldContext, replacement, ref: ref(replacement) }, approvedAt: NOW, observedAt, notAfter: HARD });
  clock = NOW;
  return { w, a, cp, options, original, effective, successor, parent, open, head, setNow(v) { clock = v; },
    async reanchor(value) { const cp = await w.readCheckpoint({ controlOnly: true }); const head = JSON.parse(await readFile(join(w.directory, 'head.json')));
      return seal({ ...value, original: { ...value.original, checkpointSha256: cp.sha256, journal: head } }); } };
}

test('one adoption preserves original identity/charges/pins and atomically registers same-age context under added source lock', async t => {
  const f = await fixture(t), beforeBudget = await f.w.budget(), manifest = await readFile(join(f.w.directory, 'manifest.json'));
  assert.deepEqual(validateExecutionAdoption(f.a), f.a);
  validateExecutionAdoptionConfigs(f.original, f.effective, f.a);
  const originalBytes = await readFile(join(f.w.directory, f.a.original.context.reference));
  assert.equal(f.w.execution, null); assert.deepEqual(await f.w.adoptExecution(f.a), f.a);
  assert.deepEqual(await f.w.readCheckpoint(), f.cp);
  assert.deepEqual(await f.w.budget(), beforeBudget); assert.ok((await readFile(join(f.w.directory, 'manifest.json'))).equals(manifest));
  assert.ok((await readFile(join(f.w.directory, f.a.original.context.reference))).equals(originalBytes));
  const body = JSON.parse(await readFile(join(f.w.directory, f.a.contexts.ref.reference)));
  assert.equal(body.observedAt, f.a.observedAt); assert.equal(body.expiresAt, HARD); assert.deepEqual(body.value, f.a.contexts.replacement);
  assert.deepEqual(await f.w.readArtifact(f.a.contexts.ref), f.a.contexts.replacement);
  const after = JSON.parse(await readFile(join(f.w.directory, 'head.json'))); assert.equal(after.sequence, f.head.sequence + 1);
  const event = JSON.parse(await readFile(join(f.w.directory, 'events', `${String(after.sequence).padStart(6, '0')}.${after.sha256}.json`)));
  assert.equal(event.event.type, 'execution-adoption');
  assert.equal((await readdir(join(f.options.directory, 'locks'))).length, 4);
  const snapshot = f.w.execution; snapshot.effective.codeSha = 'f'.repeat(40); assert.equal(f.w.execution.effective.codeSha, NEW_CODE);
  assert.deepEqual(await f.w.adoptExecution(f.a), f.a); assert.deepEqual(JSON.parse(await readFile(join(f.w.directory, 'head.json'))), after);
  await f.w.close(); const resumed = await f.open({ mode: 'resume' }); assert.deepEqual(resumed.execution, f.a);
  assert.equal(resumed.repository, f.options.repository); assert.equal(resumed.manifest.codeSha, OLD_CODE);
  assert.equal((await readdir(join(f.options.directory, 'locks'))).length, 4);
});

test('wrong approval/owner/checkpoint/head/config/source/caps or mutable-context delta refuses before new artifact or event', async t => {
  const cases = {
    approval: a => { a.approvalSha256 = hash('f'); }, owner: a => { a.original.owner.epoch++; },
    checkpoint: a => { a.original.checkpointSha256 = hash('f'); }, head: a => { a.original.journal.sha256 = hash('f'); },
    manifest: a => { a.original.manifestSha256 = hash('f'); }, config: a => { a.original.configSha256 = hash('f'); },
    source: a => { a.original.codeSha = 'f'.repeat(40); }, root: a => { a.original.sourceRoot += '-foreign'; },
    caps: a => { a.original.budgetCaps.httpRequests++; }, observed: a => { a.observedAt = CLAIM; },
    expiry: a => { a.notAfter = '2026-10-25T16:00:00.000Z'; }, cutoff: a => { a.contexts.replacement.cutoff = '2026-10-25T16:00:00.000Z'; a.contexts.ref = ref(a.contexts.replacement); },
    facts: a => { a.contexts.replacement.snapshotSha256 = hash('f'); a.contexts.ref = ref(a.contexts.replacement); },
    ref: a => { a.contexts.ref.sha256 = hash('f'); },
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, async t => {
    const f = await fixture(t), a = structuredClone(f.a), before = await readdir(join(f.w.directory, 'objects'));
    mutate(a); const candidate = name === 'approval' ? a : seal(a);
    await assert.rejects(f.w.adoptExecution(candidate)); assert.equal(f.w.execution, null);
    assert.deepEqual(JSON.parse(await readFile(join(f.w.directory, 'head.json'))), f.head);
    assert.deepEqual(await readdir(join(f.w.directory, 'objects')), before);
  });
});

test('original/effective config can differ only in execution code and build source, not scope/credentials/caps/inputs/cadence/prior', async t => {
  const f = await fixture(t); validateExecutionAdoptionConfigs(f.original, f.effective, f.a);
  for (const key of ['limits', 'credentials', 'inputs', 'cadence', 'publication']) {
    const changed = structuredClone(f.effective);
    if (key === 'publication') changed.publication.prior = 'foreign'; else changed[key] = { changed: true };
    const a = seal({ ...f.a, effective: { ...f.a.effective, configSha256: sha256(JSON.stringify(changed) + '\n'), publicationConfigSha256: sha256(canonicalJson(changed.publication)) } });
    assert.throws(() => validateExecutionAdoptionConfigs(f.original, changed, a), /config_delta/);
  }
});

test('only phases_complete without publication approval or registered package can adopt, and first adoption cannot be late', async t => {
  for (const fault of ['phase', 'approval', 'prepared', 'package', 'pending', 'late', 'future']) await t.test(fault, async t => {
    const f = await fixture(t); let a = f.a;
    if (fault === 'phase') await f.w.writeCheckpoint(f.cp.sha256, { ...f.cp.checkpoint, phase: 'draining' });
    if (fault === 'approval') await f.w.writeCheckpoint(f.cp.sha256, { ...f.cp.checkpoint, pins: { ...f.cp.checkpoint.pins, approval: f.a.original.context } });
    if (fault === 'prepared') await f.w.writeCheckpoint(f.cp.sha256, { ...f.cp.checkpoint, pins: { ...f.cp.checkpoint.pins, preparedRevision: f.a.original.context } });
    if (fault === 'package') await f.w.preparePublicationDirectories(f.options.runId, NOW, null);
    if (fault === 'pending') await f.w.reserveBudget({ id: 'pending', requestSha256: hash('f'), units: { httpRequests: 1, sqlStatements: 0 } });
    if (['phase', 'approval', 'prepared', 'package', 'pending'].includes(fault)) a = await f.reanchor(a);
    if (fault === 'late') f.setNow(HARD); if (fault === 'future') f.setNow(CLAIM);
    const head = JSON.parse(await readFile(join(f.w.directory, 'head.json')));
    await assert.rejects(f.w.adoptExecution(a)); assert.deepEqual(JSON.parse(await readFile(join(f.w.directory, 'head.json'))), head);
  });
});

test('same packet survives lost head ACK and orphan body; changed packet is never adopted twice', async t => {
  for (const fault of ['head', 'orphan']) await t.test(fault, async t => {
    const f = await fixture(t);
    if (fault === 'orphan') {
      const body = { schemaVersion: 1, kind: 'phase', observedAt: f.a.observedAt, expiresAt: HARD, policySha256: sha256(canonicalJson(f.options.retention)),
        sha256: f.a.contexts.ref.sha256, value: f.a.contexts.replacement };
      await writeFile(join(f.w.directory, f.a.contexts.ref.reference), canonicalJson(body) + '\n', { mode: 0o600 });
    }
    await f.w.adoptExecution(f.a);
    if (fault === 'head') await writeFile(join(f.w.directory, 'head.json'), canonicalJson(f.head) + '\n', { mode: 0o600 });
    await f.w.close(); const w = await f.open({ mode: 'resume' });
    assert.deepEqual(await w.adoptExecution(f.a), f.a);
    const changed = seal({ ...f.a, effective: { ...f.a.effective, codeSha: 'c'.repeat(40) } });
    await assert.rejects(w.adoptExecution(changed), /adoption_rewrite/);
    assert.equal((await w.budget()).unconfirmedRequests, 1);
  });
});

test('new source is locked across other scopes and reopens; expiry keeps body-free adoption but cannot restart content work', async t => {
  const f = await fixture(t); await f.w.adoptExecution(f.a);
  await assert.rejects(f.open({ runId: 'other-run', repository: f.successor, scope: { ...scope, databaseId: 'other-db', workerName: 'other-worker' } }), /locked/);
  assert.equal((await readdir(join(f.options.directory, 'locks'))).length, 4);
  f.setNow(HARD); assert.deepEqual(await f.w.adoptExecution(f.a), f.a);
  await assert.rejects(f.w.readArtifact(f.a.contexts.ref), /expired/);
  await f.w.purgeExpired(); await f.w.close();
  const status = await readRunWorkspace({ ...f.options, mode: 'resume', now: () => HARD });
  assert.deepEqual(status.execution, f.a); assert.equal(status.budget.unconfirmedRequests, 1);
  const w = await f.open({ mode: 'resume' }); assert.deepEqual(w.execution, f.a);
  assert.deepEqual((await w.readCheckpoint({ controlOnly: true })).checkpoint.owner, f.a.original.owner);
  await assert.rejects(w.preparePublicationDirectories(f.options.runId, HARD, null), /expired/);
});

test('adopted control and package paths use new source while preserving original source/pins, and wrong execution is rejected', async t => {
  const f = await fixture(t); await f.w.adoptExecution(f.a);
  const request = { schemaVersion: 1, environment: scope.environment, sourceRevision: f.options.runId, sourceDigest: hash('2'), codeSha: NEW_CODE,
    priorReleaseId: 'previous-release', capturedAt: NOW, cutoff: NEXT_CUTOFF }, requestId = sha256(encodeBuildRequest(request));
  const c = { schemaVersion: 1, configSha256: f.a.effective.publicationConfigSha256, requestId, runReference: f.options.runId, stage: 'claimed',
    build: { requestId, token: 'synthetic-build', runReference: f.options.runId, leaseUntil: NEXT_CUTOFF, request }, publication: null, intent: null, permit: null,
    vectorPlan: { catalogRevision: f.options.runId, planSha256: hash('3'), ids: [] }, packageSha256: null,
    uploadMarker: 'synthetic-upload', versionReference: null, deploymentMarker: 'synthetic-deployment', deploymentId: null };
  const bad = structuredClone(c); bad.configSha256 = hash('f');
  await assert.rejects(f.w.writeCheckpoint(f.cp.sha256, { ...f.cp.checkpoint, phase: 'publishing', control: { publication: bad } }), /control_scope/);
  const next = await f.w.writeCheckpoint(f.cp.sha256, { ...f.cp.checkpoint, phase: 'publishing', control: { publication: c } });
  assert.deepEqual(next.checkpoint.pins.context, f.a.original.context);
  await f.w.preparePublicationDirectories(f.options.runId, NOW, null);
  const files = await readdir(join(f.w.directory, 'events'));
  const events = await Promise.all(files.map(async file => JSON.parse(await readFile(join(f.w.directory, 'events', file)))));
  assert.equal(events.find(event => event.event.type === 'publication-directories').event.retention.sourceRoot, f.successor);
  await f.w.close(); const w = await f.open({ mode: 'resume' });
  assert.equal((await w.readCheckpoint({ controlOnly: true })).checkpoint.control.publication.build.request.codeSha, NEW_CODE);
  assert.equal(w.manifest.codeSha, OLD_CODE); assert.equal(w.repository, f.options.repository);
});
