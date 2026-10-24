import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { encodeBuildRequest } from '../lib/catalog/build-requests.ts';
import { encodePublicationIntent } from '../lib/catalog/publication.ts';
import { catalogSuccessorBytes } from '../scripts/catalog/approved-catalog-seal.ts';
import { accountedPublicationReadFetch } from '../scripts/catalog/publication-read-fetch.ts';
import { createCatalogD1Rest } from '../scripts/catalog/d1-write-rest.ts';
import { createEditorialSuccessorFiles, createEditorialSuccessorObserver,
  reconcileEditorialRecoverySuccessor } from '../scripts/catalog/editorial-recovery-successor.ts';

const NOW = '2026-11-01T12:00:00.000Z', OLD = '2026-10-24T15:32:15.176Z', CUTOFF = '2026-10-24T17:32:15.176Z';
const h = n => String(n).repeat(64), originalCode = '1'.repeat(40), runId = 'synthetic-editorial-run';
const scope = { environment: 'production', accountId: 'a'.repeat(32), databaseId: '00000000-0000-4000-8000-000000000001',
  databaseName: 'synthetic', indexName: 'synthetic', workerName: 'synthetic' };
const live = globalThis.fetch; globalThis.fetch = async () => { throw Error('Live network forbidden'); };
test.after(() => { globalThis.fetch = live; });

async function fixture(t, { adopted = true } = {}) {
  const code = adopted ? '2'.repeat(40) : originalCode;
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'stupid-editorial-successor-'));
  const care = join(directory, 'care'), daily = join(care, '2026-10-24');
  await mkdir(care, { mode: 0o700 }); await mkdir(daily, { mode: 0o700 }); t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = { control: { path: join(care, 'prior-control.json'), sha256: h('2') }, versionReference: 'prior-version', manifestSha256: h('3') };
  await writeFile(join(care, 'last-success.json'), canonicalJson(previous) + '\n', { mode: 0o600 });
  const request = { schemaVersion: 1, environment: scope.environment, sourceRevision: runId, sourceDigest: h('4'), codeSha: code,
    priorReleaseId: 'previous-release', capturedAt: OLD, cutoff: CUTOFF }, requestId = sha256(encodeBuildRequest(request));
  const intent = { releaseId: runId, codeSha: code, catalogRevision: runId, catalogSnapshotSha256: h('4'), manifestSha256: h('5'),
    vectorSyncWatermark: 0, priorReleaseId: 'previous-release', nextExpiry: null };
  const priorIntent = { ...intent, releaseId: 'previous-release', catalogRevision: 'previous-catalog', priorReleaseId: null, manifestSha256: h('3') };
  const receipt = { release_id: runId, catalog_revision: runId, code_sha: code, completed_at: OLD, manifest_json: encodePublicationIntent(intent) };
  const owner = { environment: scope.environment, indexName: scope.indexName, token: 'SYNTHETIC-owner', generation: 17, epoch: 441,
    phase: 'activating', ownerReference: runId, operationKey: h('6'), capturedAt: OLD };
  const publicationConfigSha256 = sha256(canonicalJson({ codeSha: code, sourceRoot: '/synthetic/adopted-executor', releaseId: runId }));
  assert.notEqual(publicationConfigSha256, h('7'));
  const c = { schemaVersion: 1, configSha256: publicationConfigSha256, requestId, runReference: runId, stage: 'published',
    build: { requestId, token: 'SYNTHETIC-build', runReference: runId, leaseUntil: CUTOFF, request },
    publication: { intentId: sha256(encodePublicationIntent(intent)), token: 'SYNTHETIC-publication', leaseUntil: CUTOFF, intent },
    intent, permit: { requestId, token: 'SYNTHETIC-build', runReference: runId,
      releaseId: runId, versionReference: 'synthetic-version', mutationOwner: owner },
    vectorPlan: { catalogRevision: runId, planSha256: h('8'), ids: [] }, packageSha256: h('9'), uploadMarker: 'synthetic-upload',
    versionReference: 'synthetic-version', deploymentMarker: 'synthetic-deployment', deploymentId: 'synthetic-deployment',
    receiptSha256: sha256(canonicalJson({ schemaVersion: 1, environment: scope.environment, accountId: scope.accountId,
      workerName: scope.workerName, releaseId: runId, versionReference: 'synthetic-version', requestId, intent })) };
  const cp = { sha256: h('a'), checkpoint: { phase: 'finalized', owner: null, pins: {}, state: {}, phaseComplete: null, control: { publication: c } } };
  const native = { source: { releaseId: runId, receiptSha256: sha256(canonicalJson(receipt)), deliveryId: h('b'), deliverySha256: h('c') },
    revisionSha256: h('d'), planSha256: h('e'), ids: [] };
  const id = '00000000-0000-4000-8000-000000000002';
  const seal = { schemaVersion: 1, kind: 'approved-catalog-seal', envelopeJson: JSON.stringify({ schemaVersion: 1, dataKind: 'catalog',
    catalogRevision: runId, generatedAt: OLD, products: [id], heldProducts: [], slugHistory: [] }), snapshotSha256: h('4'),
    projectionReceipt: { catalog_revision: runId, snapshot_sha256: h('4'), projection_sha256: h('1'), source_export_sha256: h('2'), product_count: 1, created_at: OLD },
    publication: { releaseId: runId, receiptSha256: sha256(canonicalJson(receipt)) }, currentNative: native,
    persistent: { generation: owner.generation, inventory: [{ publicId: id, sourceRowSha256: h('1'), productSha256: h('2'), privateStateSha256: h('3') }],
      nativeHistory: [], operationKey: h('6'), sourceRowsSha256: h('7'), globalVectorWatermark: 0,
      priorRow: { release_id: 'previous-release', catalog_revision: 'previous-catalog', code_sha: code, completed_at: OLD, manifest_json: encodePublicationIntent(priorIntent) },
      request } };
  assert.ok(catalogSuccessorBytes(seal));
  const rows = { receipt, build: { request_id: requestId, environment: scope.environment, source_revision: runId,
    request_json: encodeBuildRequest(request), state: 'resolved', lease_token: 'SYNTHETIC-build', lease_until: null,
    run_reference: runId, release_id: runId, version_reference: 'synthetic-version', error_code: null },
    scope: { environment: scope.environment, index_name: scope.indexName, generation: 18, mutation_epoch: 442, phase: 'idle',
      owner_token: null, owner_reference: null, operation_key: null, captured_at: null, external_pending: 0, activation_request_id: null, observed_at: NOW },
    publicIdentity: { release_id: runId, code_sha: code, catalog_revision: runId, catalog_snapshot_sha256: h('4'), manifest_sha256: h('5') } };
  let totals = { httpRequests: 199, sqlStatements: 348, knownRowsRead: 24112, knownRowsWritten: 225, unconfirmedRequests: 1 }, held = true;
  const reservations = new Map(), manifest = { schemaVersion: 1, runId, codeSha: originalCode, configSha256: h('7'), scope };
  const w = { manifest, async assertHeld() { if (!held) throw Error('fixture-lock-lost'); }, async readCheckpoint() { return structuredClone(cp); },
    async catalogSuccessor() { return structuredClone(seal); }, async budget() { return { ...totals }; },
    async reserveBudget(r) { assert.ok(!reservations.has(r.id)); reservations.set(r.id, r); totals.httpRequests += 1; totals.sqlStatements += r.units.sqlStatements; },
    async settleBudget(id, s) { assert.ok(reservations.has(id)); if (s.status === 'unknown') totals.unconfirmedRequests++;
      else { totals.knownRowsRead += s.usage.rowsRead; totals.knownRowsWritten += s.usage.rowsWritten; } } };
  const binding = { runId, originalConfigSha256: h('7'), originalCodeSha: originalCode, publicationConfigSha256,
    executionCodeSha: code, scope, publicProducts: 1, heldProducts: 0, previous,
    previousPublication: { releaseId: 'previous-release', receiptSha256: sha256(canonicalJson(seal.persistent.priorRow)) } };
  const files = await createEditorialSuccessorFiles(care, daily);
  const observe = async () => { totals.httpRequests += 2; totals.sqlStatements += 3; totals.knownRowsRead += 3;
    return structuredClone({ observedAt: NOW, ...rows }); };
  const options = { workspace: w, binding, store: files, observe, now: () => NOW };
  return { care, daily, previous, cp, c, seal, rows, w, binding, files, options, observe,
    totals: () => ({ ...totals }), alterBudget(fn) { totals = fn(totals); }, loseLock() { held = false; } };
}

test('finalized reconciliation installs verified exact successor after old source expiry, retains unknowns and retries without rewrites', async t => {
  const f = await fixture(t), cp = structuredClone(f.cp), first = await reconcileEditorialRecoverySuccessor(f.options);
  assert.equal(first.state, 'reconciled'); assert.deepEqual(await f.files.readPointer(), first.next);
  assert.equal(first.budget.unconfirmedRequests, 1); assert.deepEqual(f.cp, cp);
  const control = await readFile(first.next.control.path), success = await readFile(join(f.daily, 'editorial-recovery-success.json'));
  assert.equal(sha256(control.toString()), first.next.control.sha256);
  const again = await reconcileEditorialRecoverySuccessor(f.options);
  assert.deepEqual(again.next, first.next); assert.equal(again.budget.httpRequests, first.budget.httpRequests + 2);
  assert.equal(again.budget.unconfirmedRequests, 1); assert.ok((await readFile(first.next.control.path)).equals(control));
  assert.ok((await readFile(join(f.daily, 'editorial-recovery-success.json'))).equals(success));
});

test('unadopted execution retains original build source but distinguishes whole-run and publication config digests', async t => {
  const f = await fixture(t, { adopted: false });
  assert.equal(f.binding.originalCodeSha, f.binding.executionCodeSha);
  assert.notEqual(f.binding.originalConfigSha256, f.binding.publicationConfigSha256);
  const result = await reconcileEditorialRecoverySuccessor(f.options);
  assert.equal(result.state, 'reconciled');
  const success = JSON.parse(await readFile(join(f.daily, 'editorial-recovery-success.json')));
  assert.equal(success.originalConfigSha256, f.w.manifest.configSha256);
  assert.equal(success.publicationConfigSha256, f.c.configSha256);
  assert.notEqual(success.originalConfigSha256, success.publicationConfigSha256);
});

test('bindings, malformed seals, unresolved/foreign readbacks, stale clocks and advanced owner reject without changing pointer', async t => {
  const cases = {
    run: f => { f.binding.runId = 'different'; }, config: f => { f.binding.originalConfigSha256 = h('f'); },
    source: f => { f.binding.originalCodeSha = 'f'.repeat(40); }, execution: f => { f.binding.executionCodeSha = 'f'.repeat(40); },
    publicationConfig: f => { f.binding.publicationConfigSha256 = f.binding.originalConfigSha256; },
    scope: f => { f.binding.scope = { ...scope, databaseId: 'foreign' }; },
    prior: f => { f.binding.previousPublication.receiptSha256 = h('f'); },
    checkpoint: f => { f.cp.checkpoint.phase = 'published'; }, owner: f => { f.cp.checkpoint.owner = {}; },
    control: f => { f.c.runReference = 'different'; }, version: f => { f.c.permit.versionReference = 'different'; },
    seal: f => { f.seal.untrustedBody = 'forbidden'; }, count: f => { f.binding.publicProducts = 2; },
    receipt: f => { f.rows.receipt.code_sha = 'f'.repeat(40); }, build: f => { f.rows.build.state = 'activating'; },
    publication: f => { f.c.publication = null; }, capture: f => { f.c.permit.mutationOwner.capturedAt = 'invalid'; },
    idle: f => { f.rows.scope.phase = 'writing'; }, epoch: f => { f.rows.scope.mutation_epoch++; },
    generation: f => { f.rows.scope.generation++; }, pending: f => { f.rows.scope.external_pending = 1; },
    public: f => { f.rows.publicIdentity.manifest_sha256 = h('f'); },
    stale: f => { f.options.now = () => '2026-11-01T12:01:00.000Z'; },
    future: f => { f.options.now = () => '2026-11-01T11:59:59.000Z'; }, lock: f => { f.loseLock(); },
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, async t => {
    const f = await fixture(t); mutate(f); await assert.rejects(reconcileEditorialRecoverySuccessor(f.options));
    assert.deepEqual(await f.files.readPointer(), f.previous); assert.ok(!(await readdir(f.daily)).includes('editorial-recovery-success.json'));
  });
});

test('observation failure, new uncertainty and erased accounting preserve pointer and existing ledger charges', async t => {
  for (const fault of ['throw', 'unknown', 'erase', 'write']) await t.test(fault, async t => {
    const f = await fixture(t), initial = f.totals();
    f.options.observe = async expected => {
      const result = await f.observe(expected);
      if (fault === 'throw') throw Error('SYNTHETIC lost observation');
      f.alterBudget(v => ({ ...v, ...(fault === 'unknown' ? { unconfirmedRequests: v.unconfirmedRequests + 1 }
        : fault === 'erase' ? { unconfirmedRequests: 0 } : { knownRowsWritten: v.knownRowsWritten + 1 }) }));
      return result;
    };
    await assert.rejects(reconcileEditorialRecoverySuccessor(f.options)); assert.deepEqual(await f.files.readPointer(), f.previous);
    assert.equal(f.totals().httpRequests, initial.httpRequests + 2);
    if (fault === 'unknown') assert.equal(f.totals().unconfirmedRequests, 2);
  });
});

test('pointer CAS checks complete tuple and cannot overwrite a concurrent or malformed successor', async t => {
  for (const field of ['manifest', 'version', 'path', 'malformed']) await t.test(field, async t => {
    const f = await fixture(t), conflict = structuredClone(f.previous);
    if (field === 'manifest') conflict.manifestSha256 = h('f');
    if (field === 'version') conflict.versionReference = 'another';
    if (field === 'path') conflict.control.path += '-different';
    await writeFile(join(f.care, 'last-success.json'), JSON.stringify(field === 'malformed' ? {} : conflict), { mode: 0o600 });
    await assert.rejects(reconcileEditorialRecoverySuccessor(f.options));
    assert.deepEqual(JSON.parse(await readFile(join(f.care, 'last-success.json'))), field === 'malformed' ? {} : conflict);
  });
  const f = await fixture(t), original = f.files.compareAndSwapPointer;
  f.options.store = { ...f.files, async compareAndSwapPointer(previous, next) {
    await writeFile(join(f.care, 'last-success.json'), JSON.stringify({ ...f.previous, versionReference: 'concurrent' }), { mode: 0o600 });
    return original(previous, next);
  } };
  await assert.rejects(reconcileEditorialRecoverySuccessor(f.options), /pointer_conflict/);
  assert.equal((await f.files.readPointer()).versionReference, 'concurrent');
});

test('checkpoint or accepted seal drift during the fresh observation cannot install a successor', async t => {
  for (const fault of ['checkpoint', 'seal']) await t.test(fault, async t => {
    const f = await fixture(t); f.options.observe = async expected => { const data = await f.observe(expected);
      if (fault === 'checkpoint') f.cp.sha256 = h('f'); else f.seal.persistent.operationKey = h('f'); return data; };
    await assert.rejects(reconcileEditorialRecoverySuccessor(f.options), /checkpoint_drift/);
    assert.deepEqual(await f.files.readPointer(), f.previous);
  });
});

test('lost control/success/pointer acknowledgments reconcile exactly; changed immutable receipt is never overwritten', async t => {
  for (const method of ['putControl', 'putSuccess', 'compareAndSwapPointer']) await t.test(method, async t => {
    const f = await fixture(t); let lost = false;
    f.options.store = { ...f.files, async [method](...args) { const result = await f.files[method](...args);
      if (!lost) { lost = true; throw Error('SYNTHETIC local ACK loss'); } return result; } };
    await assert.rejects(reconcileEditorialRecoverySuccessor(f.options), /ACK loss/);
    const result = await reconcileEditorialRecoverySuccessor(f.options); assert.deepEqual(await f.files.readPointer(), result.next);
  });
  const f = await fixture(t); await writeFile(join(f.daily, 'editorial-recovery-success.json'), '{}\n', { mode: 0o600 });
  await assert.rejects(reconcileEditorialRecoverySuccessor(f.options), /immutable_changed/);
  assert.equal(await readFile(join(f.daily, 'editorial-recovery-success.json'), 'utf8'), '{}\n');
  assert.deepEqual(await f.files.readPointer(), f.previous);
});

test('actual SQLite and accounted DB/public observer feed reconciliation; unaccounted public sender is refused', async t => {
  const f = await fixture(t), sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.function('strftime', { varargs: true }, () => NOW);
  for (const [name, row] of [['publication_receipts', f.rows.receipt], ['catalog_build_requests', f.rows.build], ['catalog_mutation_scopes', f.rows.scope]]) {
    sql.exec(`CREATE TABLE ${name} (${Object.keys(row).map(k => k).join(',')})`);
    sql.prepare(`INSERT INTO ${name} VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  }
  const ledger = { scope: { accountId: scope.accountId, databaseId: scope.databaseId, databaseName: scope.databaseName }, initial: await f.w.budget(),
    reserve: r => f.w.reserveBudget(r), settle: (id, s) => f.w.settleBudget(id, s) };
  const db = await createCatalogD1Rest({ ...ledger.scope, token: 'SYNTHETIC-NOT-A-CREDENTIAL', accounting: ledger,
    fetch: async (_url, init) => {
      if (!init.body) return Response.json({ success: true, result: { uuid: scope.databaseId, name: scope.databaseName, read_replication: { mode: 'disabled' } } });
      return Response.json({ success: true, result: JSON.parse(init.body).batch.map(q => ({ success: true,
        results: sql.prepare(q.sql).all(...q.params).map(row => ({ ...row })), meta: { served_by_primary: true, rows_read: 1, rows_written: 0 } })) });
    } });
  const send = accountedPublicationReadFetch(f.w, async () => Response.json(f.rows.publicIdentity), { ...scope, identityOrigin: 'https://example.invalid' });
  const observe = createEditorialSuccessorObserver({ db, send, scope, identityOrigin: 'https://example.invalid', now: () => NOW });
  assert.throws(() => createEditorialSuccessorObserver({ db, send: globalThis.fetch, scope, identityOrigin: 'https://example.invalid' }), /observer_configuration/);
  const result = await reconcileEditorialRecoverySuccessor({ ...f.options, observe }); assert.equal(result.state, 'reconciled');
  assert.equal(result.budget.unconfirmedRequests, 1); assert.equal(result.budget.knownRowsWritten, 225);
});
