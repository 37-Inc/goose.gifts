import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { assertLegacyMutationAllowed, claimMutationOwnership, legacyMutationBatch, mutationAdvance,
  mutationAssertion, readMutationOwner, releaseMutationOwnership } from '../lib/catalog/mutation-fence.ts';

const scope = { environment: 'staging', indexName: 'stupid-gifts-staging' };
const request = { phase: 'writing', ownerReference: 'run-1', operationKey: 'a'.repeat(64) };
async function setup(t, enabled = true) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const migration of ['0001_catalog.sql','0002_public_projections.sql','0003_publication_outbox.sql',
    '0007_catalog_build_requests.sql','0009_catalog_mutation_fence.sql'])
    sql.exec(await readFile(new URL(`../migrations/d1/${migration}`, import.meta.url), 'utf8'));
  if (enabled) sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment, scope.indexName);
  let loseResponse = false;
  const connection = () => ({ prepare(query) { let values = []; return {
    bind(...parameters) { assert.ok(parameters.length <= 100); values = parameters; return this; },
    async all() { return { results: sql.prepare(query).all(...values).map(row => ({ ...row })) }; },
    async run() { const result = sql.prepare(query).run(...values);
      if (loseResponse) { loseResponse = false; throw new Error('private adapter failure'); }
      return { success: true, meta: { changes: result.changes } }; },
  }; }, async batch(statements) { sql.exec('BEGIN'); try { for (const statement of statements) await statement.run(); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; } } });
  return { sql, db: connection(), other: connection(), loseNextResponse() { loseResponse = true; } };
}
test('parallel independent owners serialize by explicit environment/index scope', async t => {
  const f = await setup(t);
  const [first, second] = await Promise.all([claimMutationOwnership(f.db, scope, request),
    claimMutationOwnership(f.other, scope, { ...request, ownerReference: 'run-2', phase: 'freezing' })]);
  assert.ok(first); assert.equal(second, null);
  assert.equal(await claimMutationOwnership(f.other, { ...scope, environment: 'production' }, request), null);
  assert.equal(await claimMutationOwnership(f.other, { ...scope, indexName: 'wrong-index' }, request), null);
  assert.throws(() => f.sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run('production','another-index'),/UNIQUE/);
  assert.deepEqual(await claimMutationOwnership(f.other, scope, request), first);
  assert.equal(await claimMutationOwnership(f.other, scope, { ...request, operationKey: 'b'.repeat(64) }), null);
});
test('lost claim response recovers its exact persisted identity, without a new generation', async t => {
  const f = await setup(t); f.loseNextResponse();
  const owner = await claimMutationOwnership(f.db, scope, request);
  assert.ok(owner); assert.equal(owner.generation, 1);
  assert.deepEqual(await claimMutationOwnership(f.other, scope, request), owner);
});
test('atomic receipt advances epoch; stale owner and missing receipt roll back all writes', async t => {
  const f = await setup(t); const owner = await claimMutationOwnership(f.db, scope, request);
  const receipt = { sql: 'SELECT 1 FROM catalog_runs WHERE id=?', params: ['operation-1'] };
  const write = id => f.db.prepare("INSERT INTO catalog_runs VALUES(?,'ok','fixture',0,'2026-10-20T00:00:00.000Z',NULL,'{}')").bind(id);
  await f.db.batch([mutationAssertion(f.db, owner), write('operation-1'), mutationAdvance(f.db, owner, receipt),
    mutationAssertion(f.db, { ...owner, epoch: 1 })]);
  assert.equal((await readMutationOwner(f.db, scope)).epoch, 1);
  await assert.rejects(f.db.batch([write('must-rollback'), mutationAssertion(f.db, owner)]));
  assert.equal(f.sql.prepare("SELECT 1 FROM catalog_runs WHERE id='must-rollback'").get(), undefined);
  const current = await readMutationOwner(f.db, scope);
  await assert.rejects(f.db.batch([mutationAssertion(f.db, current), write('also-rollback'),
    mutationAdvance(f.db, current, { sql: "SELECT 1 FROM catalog_runs WHERE id='missing'", params: [] }),
    mutationAssertion(f.db, { ...current, epoch: 2 })]));
  assert.equal(f.sql.prepare("SELECT 1 FROM catalog_runs WHERE id='also-rollback'").get(), undefined);
  await assert.rejects(releaseMutationOwnership(f.db, owner));
  await releaseMutationOwnership(f.db, current);
  const next = await claimMutationOwnership(f.db, scope, { ...request, ownerReference: 'next-run' });
  assert.equal(next.generation, 2); assert.equal(next.epoch, 1);
});
test('uncertain external work cannot expire or be released by timer/takeover', async t => {
  const f = await setup(t); const owner = await claimMutationOwnership(f.db, scope, request);
  f.sql.exec('UPDATE catalog_mutation_scopes SET external_pending=1');
  await assert.rejects(releaseMutationOwnership(f.db, owner));
  assert.equal(await claimMutationOwnership(f.other, scope, { ...request, ownerReference: 'tomorrow' }), null);
  assert.deepEqual(await readMutationOwner(f.db, scope), owner);
  await assert.rejects(releaseMutationOwnership(f.db, { ...owner, phase: 'activating' }), /requires_resolution/);
});
test('compatibility-off is explicit; legacy writes fail atomically once enabled', async t => {
  const f = await setup(t, false);
  await assertLegacyMutationAllowed(f.db);
  const write = () => f.db.prepare("INSERT INTO catalog_runs VALUES('legacy','ok','fixture',0,'2026-10-20T00:00:00.000Z',NULL,'{}')");
  await legacyMutationBatch(f.db, [write()]); f.sql.exec('DELETE FROM catalog_runs');
  f.sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment, scope.indexName);
  await assert.rejects(assertLegacyMutationAllowed(f.db), /ownership_required/);
  await assert.rejects(legacyMutationBatch(f.db, [write()]));
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_runs').get().n, 0);
});
