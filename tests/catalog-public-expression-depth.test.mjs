import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createProjectionPacket, importPublicProjection, keywordSearchRevision, getListedRevisionProductsByPublicIds,
  getRevisionProductsByPublicIds, visibleRevisionCountQuery } from '../lib/catalog/d1.ts';
import { enqueuePublication, claimPublication, recordPublicationDispatch, completePublication, completeActivatedPublication } from '../lib/catalog/publication.ts';
import { enqueueBuildRequest, claimBuildRequest, beginBuildActivation, resolveBuildActivation,
  recoverUnstartedBuildRequest, readUnstartedBuildRecovery } from '../lib/catalog/build-requests.ts';
import { claimMutationOwnership } from '../lib/catalog/mutation-fence.ts';
import { setup, scope } from './helpers/published-vector-fixture.mjs';

// Node SQLite's default1000 masks D1's actual100. Use SQLite's runtime engine
// limit, not a parenthesis/string estimate or a larger configured SQL limit.
function compileAtD1Depth(schema, queries) {
  const script = `import sys,json,sqlite3
v=json.load(sys.stdin)
c=sqlite3.connect(':memory:',cached_statements=0)
c.executescript(v['schema'])
c.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,100)
assert c.getlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH)==100
results=[]
for q in v['queries']:
  try:
    c.execute('EXPLAIN '+q['sql'],q['params']).fetchall()
    results.append({'name':q['name'],'ok':True})
  except sqlite3.Error as e:
    low,high=100,1000
    while low+1<high:
      middle=(low+high)//2
      c.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,middle)
      try:
        c.execute('EXPLAIN '+q['sql']+' ',q['params']).fetchall()
        high=middle
      except sqlite3.Error:
        low=middle
    c.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,100)
    results.append({'name':q['name'],'ok':False,'error':str(e),'minimumDepth':high})
print(json.dumps({'limit':100,'sqlite':sqlite3.sqlite_version,'results':results}))`;
  return JSON.parse(execFileSync('python3', ['-c', script], {
    input: JSON.stringify({ schema, queries }), encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
  }));
}

test('public SQL and actual publication/activation/receipt contexts compile at SQLite expression depth100', async t => {
  const migrations = new URL('../migrations/d1/', import.meta.url);
  const schema = (await Promise.all((await readdir(migrations)).filter(n => n.endsWith('.sql')).sort()
    .map(n => readFile(new URL(n, migrations), 'utf8')))).join('\n');
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema);
  const at = new Date('2026-10-22T12:00:00.000Z'), now = () => at;
  sqlite.function('strftime', (format, instant) => {
    assert.equal(format, '%Y-%m-%dT%H:%M:%fZ'); assert.equal(instant, 'now'); return at.toISOString();
  });
  const queries = []; let phase = 'setup';
  const db = { prepare(sql) { let params = []; return {
    bind(...values) { params = values; return this; },
    async all() { queries.push({ name: phase, sql, params }); return { results: sqlite.prepare(sql).all(...params).map(r => ({ ...r })) }; },
    async run() { queries.push({ name: phase, sql, params }); const result = sqlite.prepare(sql).run(...params);
      return { success: true, meta: { changes: result.changes } }; },
  }; }, async batch(statements) {
    sqlite.exec('BEGIN'); try { for (const s of statements) await s.run(); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  const product = { id: 'B000000001', publicId: '00000000-0000-4000-8000-000000000001', slug: 'fixture-button', source: 'amazon',
    title: 'Fixture button', description: 'Fixture identity', imageUrl: '/images/gift-placeholder.svg',
    affiliateUrl: 'https://www.amazon.com/dp/B000000001?tag=fixture-20', currency: 'USD', price: 0,
    isActive: true, qualityScore: .8, eligibleUntil: null, indexable: false, humorTags: ['dry', 'odd'] };
  const snapshot = { schemaVersion: 1, dataKind: 'catalog', catalogRevision: 'depth-fixture', generatedAt: at.toISOString(),
    products: [product], heldProducts: [], slugHistory: [] };
  const rights = Object.fromEntries(['title', 'description', 'imageUrl', 'affiliateUrl', 'humorTags'].map(field => [field,
    { basis: 'owned', value: field === 'humorTags' ? JSON.stringify(product[field]) : product[field], reference: 'Synthetic exact-value clearance only' }]));
  sqlite.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,
    catalog_revision,rights_json,source_record_json,updated_at,public_display_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(product.id, product.publicId, product.slug, product.source, product.title, product.currency, .8, 1, 'stale',
      snapshot.catalogRevision, JSON.stringify(rights), '{}', at.toISOString(), JSON.stringify(product));
  sqlite.prepare('INSERT INTO catalog_revisions(revision,created_at,source_export_sha256,status) VALUES(?,?,?,?)')
    .run(snapshot.catalogRevision, at.toISOString(), 'b'.repeat(64), 'reconciled');
  const packet = await createProjectionPacket(snapshot, { [product.publicId]: null }, 'b'.repeat(64), at);
  await importPublicProjection(db, packet);
  for (const [name, current, grants, expected] of [
    ['equal bytes', product, rights, 1],
    ['reordered keys use tree fallback', Object.fromEntries(Object.entries(product).reverse()), rights, 1],
    ['changed nested array', { ...product, humorTags: ['odd', 'dry'] }, { ...rights, humorTags: { ...rights.humorTags, value: '["odd","dry"]' } }, 0],
    ['extra unknown nested value', { ...product, extra: { identity: 'other' } }, rights, 0],
    ['different scalar', { ...product, title: 'Other identity' }, { ...rights, title: { ...rights.title, value: 'Other identity' } }, 0],
    ['missing base', null, rights, 0],
    ['missing null deadline', { ...product, eligibleUntil: undefined }, rights, 0],
    ['equal bytes do not bypass rights', product, { ...rights, title: { ...rights.title, value: 'Other identity' } }, 0],
  ]) await t.test(name, async () => {
    phase = name; sqlite.prepare('UPDATE products SET public_display_json=?,rights_json=?')
      .run(current === null ? null : JSON.stringify(current), JSON.stringify(grants));
    assert.equal((await getListedRevisionProductsByPublicIds(db, [product.publicId], at, snapshot.catalogRevision)).length, expected);
    const q = visibleRevisionCountQuery(snapshot.catalogRevision, at);
    assert.equal(sqlite.prepare(q.sql).get(...q.params)['count(*)'], expected);
    queries.push({ name, ...q });
  });
  sqlite.prepare('UPDATE products SET public_display_json=?,rights_json=?').run(JSON.stringify(product), JSON.stringify(rights));
  // Largest supported physical ID page; total catalog cardinality does not
  // change the expression AST of the count/publication gates below.
  const ids = [product.publicId, ...Array.from({ length: 79 }, (_, i) => `missing-${i}`)];
  phase = 'keywordSearchRevision'; await keywordSearchRevision(db, 'fixture', 24, at, snapshot.catalogRevision);
  phase = 'getListedRevisionProductsByPublicIds'; await getListedRevisionProductsByPublicIds(db, ids, at, snapshot.catalogRevision);
  phase = 'getRevisionProductsByPublicIds'; await getRevisionProductsByPublicIds(db, ids, at, snapshot.catalogRevision);
  for (const clock of [undefined, at]) {
    const q = visibleRevisionCountQuery(snapshot.catalogRevision, clock);
    queries.push({ name: `visibleRevisionCountQuery/${clock ? 'explicit' : 'database'}-clock`, ...q });
  }
  const intent = { releaseId: 'depth-release', codeSha: 'c'.repeat(40), catalogRevision: snapshot.catalogRevision,
    catalogSnapshotSha256: packet.receipt.snapshot_sha256, manifestSha256: 'd'.repeat(64),
    vectorSyncWatermark: 0, priorReleaseId: null, nextExpiry: null };
  const request = { schemaVersion: 1, environment: 'staging', sourceRevision: snapshot.catalogRevision,
    sourceDigest: packet.receipt.snapshot_sha256, codeSha: intent.codeSha, priorReleaseId: null,
    capturedAt: at.toISOString(), cutoff: '2026-10-22T13:00:00.000Z' };
  phase = 'build-claim'; const queued = await enqueueBuildRequest(db, request);
  const build = await claimBuildRequest(db, queued.requestId, 'fixture-run', at); assert.ok(build);
  phase = 'enqueuePublication/preflight'; await enqueuePublication(db, snapshot, intent, at);
  phase = 'claimPublication'; const publication = await claimPublication(db, snapshot, intent.releaseId, at); assert.ok(publication);
  phase = 'recordPublicationDispatch'; await recordPublicationDispatch(db, snapshot, publication, 'version:fixture', at);
  phase = 'beginBuildActivation'; const permit = await beginBuildActivation(db, build, snapshot, publication, 'fixture-version',
    async () => ({ environment: 'staging', settled: true, active: null }), at);
  phase = 'completePublication/receipt'; await completePublication(db, snapshot, intent.releaseId, publication.token, async () => intent, now);
  phase = 'resolveBuildActivation'; assert.equal(await resolveBuildActivation(db, permit, async () => ({ environment: 'staging', settled: true,
    active: { ...intent, versionReference: permit.versionReference } })), 'resolved');
  // Execute/capture the new wrapper against this same genuinely permanent
  // projection. Three real claims expire; the separate operator receipt never
  // changes attempts=3 or replaces the current/publication predicates above.
  phase = 'operator-build-claims';
  const operatorRequest = await enqueueBuildRequest(db, { ...request, priorReleaseId: intent.releaseId });
  let exhausted = await claimBuildRequest(db, operatorRequest.requestId, 'fixture-operator-depth', at);
  for (const minutes of [11, 16]) {
    at.setTime(at.getTime() + minutes * 60_000);
    exhausted = await claimBuildRequest(db, operatorRequest.requestId, 'fixture-operator-depth', at);
  }
  assert.ok(exhausted); at.setTime(at.getTime() + 16 * 60_000);
  sqlite.prepare('INSERT OR IGNORE INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment, scope.indexName);
  const operatorOwner = await claimMutationOwnership(db, scope,
    { phase: 'freezing', ownerReference: 'fixture-operator-depth', operationKey: 'e'.repeat(64) });
  assert.ok(operatorOwner);
  const approval = { schemaVersion: 1, requestId: operatorRequest.requestId, packageSha256: 'a'.repeat(64),
    previousToken: exhausted.token, checkpointSha256: 'b'.repeat(64), reviewReference: 'fixture/depth100' };
  phase = 'recoverUnstartedBuildRequest';
  const recovered = await recoverUnstartedBuildRequest(db, exhausted, operatorOwner, 'depth-operator-release', approval);
  phase = 'readUnstartedBuildRecovery';
  assert.deepEqual(await readUnstartedBuildRecovery(db, recovered, operatorOwner, 'depth-operator-release', approval), recovered);
  assert.equal(sqlite.prepare('SELECT attempts FROM catalog_build_requests WHERE request_id=?').get(operatorRequest.requestId).attempts, 3);
  const result = compileAtD1Depth(schema, queries);
  const failed = result.results.filter(q => !q.ok);
  t.diagnostic(JSON.stringify({ sqlite: result.sqlite, expressionDepth: result.limit, queries: queries.length, failed }));
  assert.deepEqual(failed, []);
  assert.ok(queries.some(q => q.name === 'completePublication/receipt' && q.sql.includes('INSERT INTO publication_receipts')));
  assert.ok(queries.some(q => q.name === 'beginBuildActivation' && q.sql.includes("SET state='activating'")));
});

test('original-permit expired-lease completion also compiles at depth100 under its full owner/source/receipt CAS', async t => {
  const f = await setup(t), queries = [];
  // Capture actual generated SQL, including batch-only assertions, without
  // changing the real SQLite fixture's execution or any completion predicates.
  const db = { ...f.db, prepare(sql) {
    const statement = f.db.prepare(sql), bind = statement.bind, q = { name: 'expired-lease-completion', sql, params: [] };
    queries.push(q); statement.bind = (...params) => { q.params = params; return bind.apply(statement, params); }; return statement;
  } };
  const queued = await enqueueBuildRequest(db, f.published.request), build = await claimBuildRequest(db, queued.requestId, 'fixture:depth-recovery', f.now());
  assert.ok(build);
  const intent = { releaseId: 'depth-recovered-code', catalogRevision: f.revision.snapshot.catalogRevision, codeSha: build.request.codeSha,
    catalogSnapshotSha256: f.revision.packet.receipt.snapshot_sha256, manifestSha256: 'a'.repeat(64),
    vectorSyncWatermark: f.revision.vectorSyncWatermark, priorReleaseId: build.request.priorReleaseId,
    nextExpiry: f.revision.snapshot.products[0].eligibleUntil };
  await enqueuePublication(db, f.revision.snapshot, intent, f.now());
  const publication = await claimPublication(db, f.revision.snapshot, intent.releaseId, f.now());
  await recordPublicationDispatch(db, f.revision.snapshot, publication, 'version:fixture:depth-version', f.now());
  const permit = await beginBuildActivation(db, build, f.revision.snapshot, publication, 'fixture:depth-version',
    async () => ({ environment: scope.environment, settled: true, active: { ...f.original.intent, versionReference: f.original.permit.versionReference } }), f.now(), f.owner);
  queries.length = 0; f.advance(16 * 60_000);
  await completeActivatedPublication(db, f.revision, publication, permit, async () => intent, f.now, f.published);
  const migrations = new URL('../migrations/d1/', import.meta.url);
  const schema = (await Promise.all((await readdir(migrations)).filter(n => n.endsWith('.sql')).sort()
    .map(n => readFile(new URL(n, migrations), 'utf8')))).join('\n');
  const result = compileAtD1Depth(schema, queries), failed = result.results.filter(q => !q.ok);
  t.diagnostic(JSON.stringify({ expressionDepth: result.limit, expiredCompletionQueries: queries.length, failed }));
  assert.deepEqual(failed, []);
  assert.ok(queries.some(q => q.sql.includes("ELSE 'publication_activation_fenced' END") && q.sql.includes('catalog_revisions c')));
});
