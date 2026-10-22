import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createProjectionPacket, importPublicProjection } from '../lib/catalog/d1.ts';
import { claimPublication, completePublication, enqueuePublication, publicationStatus, recordPublicationDispatch } from '../lib/catalog/publication.ts';
import { createPublicationController } from '../workers/site/publication.ts';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const HASH = 'a'.repeat(64);
const PUBLIC_ID = '00000000-0000-4000-8000-000000000001';
async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_catalog.sql', '0002_public_projections.sql', '0003_publication_outbox.sql'])
    sqlite.exec(await readFile(new URL(`../migrations/d1/${name}`, import.meta.url), 'utf8'));
  let clock = NOW;
  // Model the D1 execution clock, independently of timestamps captured before adapter I/O.
  sqlite.function('strftime', (format, instant) => {
    assert.equal(format, '%Y-%m-%dT%H:%M:%fZ'); assert.equal(instant, 'now');
    return new Date(clock).toISOString();
  });
  const snapshot = { schemaVersion: 1, dataKind: 'catalog', catalogRevision: 'r1', generatedAt: new Date(NOW).toISOString(),
    products: [{ id: 'B000000001', publicId: PUBLIC_ID, slug: 'funny-button', title: 'Funny Red Sound Button', description: 'A funny red button.',
      imageUrl: 'https://m.media-amazon.com/images/I/button.jpg', affiliateUrl: 'https://www.amazon.com/dp/B000000001?tag=test-20',
      source: 'amazon', currency: 'USD', price: 0, isActive: true, qualityScore: 0.8, eligibleUntil: new Date(NOW + 86_400_000).toISOString() }],
    heldProducts: [], slugHistory: [] };
  snapshot.products[0].editorialWriteup = 'Controlled test-only editorial.';
  const rights = Object.fromEntries(['title','description','imageUrl','affiliateUrl','editorialWriteup'].map(field => [field,
    { basis: 'licensed', reference: 'Controlled test-only permission', value: snapshot.products[0][field] }]));
  sqlite.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,
    availability_status,source_facts_hash,editorial_source_hash,catalog_revision,eligible_until,rights_json,source_record_json,updated_at,public_display_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('B000000001', PUBLIC_ID, 'funny-button', 'amazon', 'operational title', 'USD', .8, 1,
      'generated_ready', 'IN_STOCK', HASH, HASH, 'r1', snapshot.products[0].eligibleUntil, JSON.stringify(rights), '{}', snapshot.generatedAt, JSON.stringify(snapshot.products[0]));
  sqlite.prepare('UPDATE products SET availability_checked_at=?').run(snapshot.generatedAt);
  sqlite.prepare('INSERT INTO catalog_revisions VALUES(?,?,?,?)').run('r1', snapshot.generatedAt, 'b'.repeat(64), 'reconciled');
  const fixture = { sqlite, snapshot, beforeBatch: null, advance(ms) { clock += ms; }, now: () => clock, date: () => new Date(clock), close: () => sqlite.close() };
  const db = { prepare(sql) { let values = []; return { sql,
    bind(...input) { values = input; return this; },
    async all() { return { results: sqlite.prepare(sql).all(...values).map((row) => ({ ...row })) }; },
    execute() { return sqlite.prepare(sql).run(...values); },
    async run() { return this.execute(); },
  }; }, async batch(statements) {
    fixture.beforeBatch?.(statements);
    sqlite.exec('BEGIN'); try { for (const statement of statements) statement.execute(); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  const packet = await createProjectionPacket(snapshot, { [PUBLIC_ID]: HASH }, 'b'.repeat(64), fixture.date());
  await importPublicProjection(db, packet);
  const intent = { releaseId: 'r1-code-one', codeSha: 'c'.repeat(40), catalogRevision: 'r1', catalogSnapshotSha256: packet.receipt.snapshot_sha256,
    manifestSha256: 'd'.repeat(64), vectorSyncWatermark: 0, priorReleaseId: null, nextExpiry: snapshot.products[0].eligibleUntil };
  return { ...fixture, db, intent, setBeforeBatch(fn) { fixture.beforeBatch = fn; } };
}
async function dispatched(fixture, intent = fixture.intent) {
  await enqueuePublication(fixture.db, fixture.snapshot, intent, fixture.date());
  const claim = await claimPublication(fixture.db, fixture.snapshot, intent.releaseId, fixture.date(), 1000);
  await recordPublicationDispatch(fixture.db, fixture.snapshot, claim, 'synthetic-run-1', fixture.date());
  return claim;
}
test('observation publication status propagates abort and never starts the next SELECT after cancellation',async()=>{
  const f=await setup();
  try{
    const controller=new AbortController(),signals=[],queries=[];
    const db={...f.db,prepare(sql){const statement=f.db.prepare(sql);return{...statement,bind(...args){statement.bind(...args);return this;},async all(options){
      queries.push(sql);signals.push(options?.signal);const result=await statement.all();controller.abort();return result;}};}};
    await assert.rejects(publicationStatus(db,f.intent.releaseId,{signal:controller.signal}),/abort/i);
    assert.equal(queries.length,1);assert.equal(signals[0],controller.signal);
    await assert.rejects(publicationStatus(db,f.intent.releaseId,{signal:controller.signal}),/abort/i);assert.equal(queries.length,1);
  }finally{f.close();}
});

test('accepted dispatch is not publication; only matching independent readback creates existing completion receipt', async () => {
  const f = await setup(); let claim; let dispatches = 0;
  try {
    const controller = createPublicationController({ db: f.db, now: f.now,
      async dispatch(value) { claim = value; dispatches++; return { reference: 'synthetic-run' }; }, async readDeployed() { return f.intent; } });
    assert.equal((await controller.request(f.snapshot, f.intent)).state, 'dispatched');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
    assert.equal(f.sqlite.prepare('SELECT status FROM catalog_revisions').get().status, 'reconciled');
    assert.equal((await controller.request(f.snapshot, f.intent)).state, 'dispatched');
    assert.equal(dispatches, 1);
    assert.equal((await controller.complete(f.snapshot, f.intent.releaseId, claim.token)).state, 'published');
    assert.equal(f.sqlite.prepare('SELECT status FROM catalog_revisions').get().status, 'published');
    assert.equal(f.sqlite.prepare('SELECT code_sha FROM publication_receipts').get().code_sha, f.intent.codeSha);
    assert.equal((await controller.request(f.snapshot, f.intent)).state, 'published');
    assert.equal(dispatches, 1);
    assert.throws(() => f.sqlite.prepare("UPDATE publication_outbox SET intent_json='{}'").run(), /immutable/);
    await assert.rejects(enqueuePublication(f.db, f.snapshot, { ...f.intent, manifestSha256: 'e'.repeat(64) }, f.date()), /intent_conflict/);
  } finally { f.close(); }
});

test('one active revision lease suppresses overlap across different code release intents', async () => {
  const f = await setup();
  try {
    const other = { ...f.intent, releaseId: 'r1-code-two', codeSha: 'e'.repeat(40) };
    await enqueuePublication(f.db, f.snapshot, f.intent, f.date());
    await enqueuePublication(f.db, f.snapshot, other, f.date());
    const claims = await Promise.all([f.intent, other].map((intent) => claimPublication(f.db, f.snapshot, intent.releaseId, f.date(), 1000)));
    assert.equal(claims.filter(Boolean).length, 1);
    const stale = claims.find(Boolean);
    f.advance(1000);
    const next = await claimPublication(f.db, f.snapshot, other.releaseId, f.date(), 1000);
    assert.ok(next);
    await assert.rejects(recordPublicationDispatch(f.db, f.snapshot, stale, 'stale-run', f.date()), /fenced/);
    await assert.rejects(completePublication(f.db, f.snapshot, stale.intent.releaseId, stale.token, async () => stale.intent, f.date), /fenced/);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
  } finally { f.close(); }
});

test('dispatch errors/timeouts remain retryable, capped at three calls, with no raw adapter error leakage', async () => {
  const f = await setup(); let calls = 0;
  try {
    const controller = createPublicationController({ db: f.db, now: f.now, adapterTimeoutMs: 10,
      dispatch(_claim, signal) { calls++; if (calls === 1) throw new Error('FAKE_SECRET_PROVIDER_BODY');
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('PRIVATE_TIMEOUT')), { once: true })); },
      async readDeployed() { throw new Error('must_not_read'); } });
    for (let i = 0; i < 4; i++) {
      const status = await controller.request(f.snapshot, f.intent);
      assert.equal(status.state, 'failed');
      assert.equal(status.errorCode, 'dispatch_failed');
      assert.doesNotMatch(JSON.stringify(status), /FAKE_SECRET|PRIVATE_TIMEOUT/);
    }
    assert.equal(calls, 3);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
  } finally { f.close(); }
});

test('failed or mismatched deployed readback never publishes, and can retry under the same lease', async () => {
  const f = await setup();
  try {
    const claim = await dispatched(f);
    await assert.rejects(completePublication(f.db, f.snapshot, f.intent.releaseId, claim.token, async () => { throw new Error('PRIVATE_BODY'); }, f.date), /readback_failed/);
    await assert.rejects(completePublication(f.db, f.snapshot, f.intent.releaseId, claim.token,
      async () => ({ ...f.intent, manifestSha256: 'e'.repeat(64) }), f.date), /readback_mismatch/);
    assert.equal((await publicationStatus(f.db, f.intent.releaseId)).state, 'dispatched');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
    await completePublication(f.db, f.snapshot, f.intent.releaseId, claim.token, async () => f.intent, f.date);
    assert.equal((await publicationStatus(f.db, f.intent.releaseId)).state, 'published');
  } finally { f.close(); }
});

test('a failed dispatch can be retried successfully without changing the immutable intent', async () => {
  const f = await setup(); let calls = 0; let token;
  try {
    const controller = createPublicationController({ db: f.db, now: f.now,
      async dispatch(claim) { if (++calls === 1) throw new Error('synthetic_failure'); token = claim.token; return { reference: 'recovered-run' }; },
      async readDeployed() { return f.intent; } });
    assert.equal((await controller.request(f.snapshot, f.intent)).state, 'failed');
    const retry = await controller.request(f.snapshot, f.intent);
    assert.equal(retry.state, 'dispatched'); assert.equal(retry.attempts, 2);
    assert.equal((await controller.complete(f.snapshot, f.intent.releaseId, token)).state, 'published');
  } finally { f.close(); }
});

test('expiry during an accepted dispatch never becomes publication', async () => {
  const f = await setup();
  try {
    const controller = createPublicationController({ db: f.db, now: f.now,
      async dispatch() { f.advance(86_400_000); return { reference: 'too-late' }; }, async readDeployed() { return f.intent; } });
    assert.notEqual((await controller.request(f.snapshot, f.intent)).state, 'published');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
  } finally { f.close(); }
});

test('expiry, current holds/factual changes, incomplete revisions and pending vectors block dispatch', async () => {
  for (const mutation of [
    (f) => f.advance(86_400_000), (f) => f.sqlite.exec('UPDATE products SET public_display_json=NULL'),
    (f) => f.sqlite.exec(`UPDATE products SET source_facts_hash='${'e'.repeat(64)}',editorial_source_hash='${'e'.repeat(64)}'`),
    (f) => f.sqlite.exec("UPDATE catalog_revisions SET status='importing'"),
    (f) => f.sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at)
      VALUES(?,?,?,?,?)`).run(PUBLIC_ID, 'r1', HASH, 'upsert', f.snapshot.generatedAt),
  ]) {
    const f = await setup();
    try { mutation(f); await assert.rejects(enqueuePublication(f.db, f.snapshot, f.intent, f.date()), /preflight_failed/);
      assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_outbox').get().n, 0);
    } finally { f.close(); }
  }
});

test('a completed vector watermark is required and a later event invalidates the frozen intent', async () => {
  const f = await setup();
  try {
    const plan = f.sqlite.prepare('EXPLAIN QUERY PLAN SELECT max(sequence) FROM vector_sync_outbox WHERE source_revision=?').all('r1');
    assert.match(JSON.stringify(plan), /vector_sync_revision_watermark/);
    f.sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,status,created_at)
      VALUES(?,?,?,?,?,?)`).run(PUBLIC_ID, 'r1', HASH, 'upsert', 'complete', f.snapshot.generatedAt);
    await assert.rejects(enqueuePublication(f.db, f.snapshot, f.intent, f.date()), /preflight_failed/);
    const intent = { ...f.intent, vectorSyncWatermark: 1 };
    const claim = await dispatched(f, intent);
    f.sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,status,created_at)
      VALUES(?,?,?,?,?,?)`).run(PUBLIC_ID, 'r1', HASH, 'delete', 'complete', f.snapshot.generatedAt);
    await assert.rejects(completePublication(f.db, f.snapshot, intent.releaseId, claim.token, async () => intent, f.date), /preflight_failed/);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
  } finally { f.close(); }
});

test('unknown prior receipts and malformed immutable identities fail closed', async () => {
  const f = await setup();
  try {
    await assert.rejects(enqueuePublication(f.db, f.snapshot, { ...f.intent, priorReleaseId: 'never-verified' }, f.date()), /preflight_failed/);
    for (const intent of [{ ...f.intent, releaseId: undefined }, { ...f.intent, priorReleaseId: undefined },
      { ...f.intent, vectorSyncWatermark: -1 }, { ...f.intent, catalogSnapshotSha256: 'wrong' }]) {
      await assert.rejects(enqueuePublication(f.db, f.snapshot, intent, f.date()), /invalid_publication_intent/);
    }
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_outbox').get().n, 0);
  } finally { f.close(); }
});

test('dispatch recording cannot substitute different intent bytes under a valid lease token', async () => {
  const f = await setup();
  try {
    await enqueuePublication(f.db, f.snapshot, f.intent, f.date());
    const claim = await claimPublication(f.db, f.snapshot, f.intent.releaseId, f.date());
    await assert.rejects(recordPublicationDispatch(f.db, f.snapshot,
      { ...claim, intent: { ...claim.intent, manifestSha256: 'e'.repeat(64) } }, 'wrong-intent-run', f.date()), /fenced/);
    assert.equal((await publicationStatus(f.db, f.intent.releaseId)).state, 'claimed');
    assert.equal(f.sqlite.prepare('SELECT dispatch_reference FROM publication_outbox').get().dispatch_reference, null);
  } finally { f.close(); }
});

test('current-state and lease predicates are checked atomically at completion, after preflight/readback', async () => {
  for (const mutation of [
    (f) => f.sqlite.exec('UPDATE products SET public_display_json=NULL'),
    (f) => f.sqlite.exec("UPDATE products SET rights_json='{}'"),
    (f) => f.sqlite.exec("UPDATE products SET rights_json=json_set(rights_json,'$.title.expiresAt','2026-10-19T12:01:00.000Z')"),
    (f) => f.advance(86_400_000),
    (f) => f.sqlite.exec("UPDATE publication_outbox SET lease_token='new-owner'"),
    (f) => f.sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at)
      VALUES(?,?,?,?,?)`).run(PUBLIC_ID, 'r1', HASH, 'upsert', f.snapshot.generatedAt),
  ]) {
    const f = await setup();
    try {
      const claim = await dispatched(f);
      f.setBeforeBatch((statements) => { if (statements.some(statement => statement.sql.includes('INSERT INTO publication_receipts'))) mutation(f); });
      await assert.rejects(completePublication(f.db, f.snapshot, f.intent.releaseId, claim.token, async () => f.intent, f.date), /fenced_or_preflight_changed/);
      assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
      assert.equal(f.sqlite.prepare('SELECT status FROM catalog_revisions').get().status, 'reconciled');
    } finally { f.close(); }
  }
});

test('an ownership change during deployed readback cannot record completion', async () => {
  const f = await setup();
  try {
    const claim = await dispatched(f);
    await assert.rejects(completePublication(f.db, f.snapshot, f.intent.releaseId, claim.token, async () => {
      f.advance(1000);
      const takeover = await claimPublication(f.db, f.snapshot, f.intent.releaseId, f.date(), 1000);
      await recordPublicationDispatch(f.db, f.snapshot, takeover, 'new-run', f.date());
      return f.intent;
    }, f.date), /fenced_or_preflight_changed/);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM publication_receipts').get().n, 0);
  } finally { f.close(); }
});
