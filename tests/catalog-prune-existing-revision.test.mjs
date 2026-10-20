import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createCatalogSnapshot } from '../lib/catalog/snapshot.ts';
import { createProjectionPacket, importPublicProjection, projectionQueries } from '../lib/catalog/d1.ts';
import { claimMutationOwnership, readMutationOwner } from '../lib/catalog/mutation-fence.ts';
import { pruneExistingRevision, pruneOperationKey, prunedVectorPlan, settlePrunedRevision } from '../lib/catalog/prune-existing-revision.ts';
import { createSealedSnapshotEnvelope } from '../scripts/catalog/export-d1-snapshot.ts';
import { canonicalJson, importBatch, sha256, upsertProductAndQueueVector } from '../scripts/catalog/migration.ts';
import { drainVectorOutbox } from '../scripts/catalog/vector-outbox.ts';
import { createReviewedVectorDelete, queueReviewedVectorDelete } from '../scripts/catalog/vector-delete.ts';

const AT = Date.parse('2026-10-20T12:00:00.000Z'); const FACTS = 'a'.repeat(64); const SOURCE = 'b'.repeat(64);
const at = ms => new Date(AT + ms).toISOString();
const scope = { environment: 'staging', indexName: 'stupid-gifts-staging' };
async function setup(t, { count = 3, horizon = 6 * 3600000 } = {}) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const migration of ['0001_catalog.sql','0002_public_projections.sql','0003_publication_outbox.sql','0004_vector_outbox_leases.sql',
    '0005_historical_timestamps.sql','0006_semantic_search_budget.sql','0007_catalog_build_requests.sql','0008_reviewed_vector_deletes.sql',
    '0009_catalog_mutation_fence.sql']) sql.exec(await readFile(new URL(`../migrations/d1/${migration}`, import.meta.url), 'utf8'));
  let clock = AT; let beforeStatement; let afterBatch; let loseBatchResponse = false; const calls = [];
  sql.function('strftime', (format, when) => { assert.equal(format,'%Y-%m-%dT%H:%M:%fZ'); assert.equal(when,'now'); return new Date(clock).toISOString(); });
  const db = { prepare(query) { let values = []; return { query,
    bind(...params) { assert.ok(params.length <= 100); values = params; return this; },
    async all() { calls.push(query); return { results: sql.prepare(query).all(...values).map(row => ({ ...row })) }; },
    async run() { beforeStatement?.(query); calls.push(query); const result = sql.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
  }; }, async batch(statements) { sql.exec('BEGIN'); try { for (const statement of statements) await statement.run(); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; } afterBatch?.(statements);
    if (loseBatchResponse) { loseBatchResponse = false; throw new Error('private unknown response'); }
  } };
  const values = Array.from({ length: count + 1 }, (_, i) => ({ id: `B${String(i + 1).padStart(9,'0')}`,
    publicId: `00000000-0000-4000-8000-${String(i + 1).padStart(12,'0')}`, slug: `funny-fixture-${i + 1}`,
    title: `Funny Fixture${i} Example${i}`, description: `A factual test-only object ${i}.`, imageUrl: `https://m.media-amazon.com/images/I/fixture-${i}.jpg`,
    affiliateUrl: `https://www.amazon.com/dp/B${String(i + 1).padStart(9,'0')}?tag=test-20`, source: 'amazon', currency: 'USD',
    qualityScore: .8, isActive: i < count, availabilityStatus: 'IN_STOCK', availabilityCheckedAt: at(0),
    editorialStatus: 'generated_ready', editorialQualityScore: .9, sourceFactsHash: FACTS, editorialSourceHash: FACTS,
    editorialWriteup: Array.from({ length: 2 }, () => Array(55).fill(`Specific useful test editorial ${i}`).join(' ')).join('\n\n') }));
  const rights = Object.fromEntries(values.map((p,i) => [p.id, Object.fromEntries(['title','description','imageUrl','affiliateUrl','editorialWriteup'].map(field => [field,
    field === 'imageUrl' ? { basis: 'merchant', reference: `fresh getItems/${p.id}`, value: p[field], observedAt: at(0), expiresAt: at(86400000) }
      : { basis: 'licensed', reference: `reviewed permission/${p.id}/${field}`, value: p[field], ...(i === 0 && field === 'title' ? { expiresAt: at(2 * 3600000) } : {}) }]))]));
  const previous = createCatalogSnapshot(values, rights, { catalogRevision: 'live-r1', now: new Date(AT),
    slugHistory: [{ slug: 'old-funny-fixture', canonicalSlug: values[0].slug, publicId: values[0].publicId }] });
  const insert = sql.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,
    availability_status,availability_checked_at,source_facts_hash,editorial_source_hash,catalog_revision,eligible_until,public_display_json,
    rights_json,source_record_json,created_at,updated_at,timestamp_provenance_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const p of values) {
    const display = previous.products.find(value => value.id === p.id);
    insert.run(p.id,p.publicId,p.slug,p.source,p.title,p.currency,p.qualityScore,p.isActive ? 1 : 0,p.editorialStatus,p.availabilityStatus,
      at(0),FACTS,FACTS,'live-r1',display?.eligibleUntil ?? null,display ? JSON.stringify(display) : null,JSON.stringify(rights[p.id]),'{}',null,at(0),'{}');
  }
  sql.prepare('INSERT INTO catalog_revisions VALUES(?,?,?,?)').run('live-r1',at(0),SOURCE,'published');
  const packet = await createProjectionPacket(previous,Object.fromEntries(previous.products.map(p => [p.publicId,FACTS])),SOURCE,new Date(AT));
  for (const query of projectionQueries(packet)) sql.prepare(query.sql).run(...query.params);
  const prior = { release_id: 'live-release', catalog_revision: 'live-r1', code_sha: 'c'.repeat(40), completed_at: at(0), manifest_json: '{}' };
  sql.prepare('INSERT INTO publication_receipts VALUES(?,?,?,?,?)').run(...Object.values(prior));
  const envelope = createSealedSnapshotEnvelope(previous);
  const context = { envelopeSha256: sha256(`${JSON.stringify(envelope)}\n`), snapshotSha256: packet.receipt.snapshot_sha256,
    projectionSha256: packet.receipt.projection_sha256, sourceExportSha256: SOURCE, vectorSyncWatermark: 0,
    publicationReceiptWatermark: 1, cutoff: at(horizon), priorPublication: { releaseId: prior.release_id, receiptSha256: sha256(canonicalJson(prior)) } };
  const request = { previous, context, scope, codeSha: 'd'.repeat(40) };
  sql.prepare('INSERT INTO catalog_mutation_scopes(environment,index_name) VALUES(?,?)').run(scope.environment,scope.indexName);
  const owner = await claimMutationOwnership(db,scope,{ phase: 'freezing', ownerReference: 'daily-run', operationKey: pruneOperationKey(request) });
  return { sql, db, calls, previous, packet, request, owner, values,
    advance(ms) { clock += ms; }, before(fn) { beforeStatement = fn; }, after(fn) { afterBatch = fn; }, loseResponse() { loseBatchResponse = true; },
    async prune(currentOwner = owner) { return pruneExistingRevision(db,currentOwner,request); },
    async proof(plan) { return { ...scope, settled: true, planSha256: sha256(canonicalJson(plan)), reference: 'independent-vector-readback/fixture' }; } };
}
test('daily dry-run unchanged does not invent a revision or alter the current catalog', async t => {
  const f = await setup(t,{ horizon: 3600000 }); const before = f.sql.prepare('SELECT * FROM products').all();
  assert.deepEqual(await f.prune(),{ state: 'unchanged', allHeld: false });
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_revisions').get().n,1);
  assert.deepEqual(f.sql.prepare('SELECT * FROM products').all(),before);
});
test('expiring revision prunes only, retains exact rights deadlines/order/slugs, and stays importing', async t => {
  const f = await setup(t); const before = f.sql.prepare('SELECT * FROM products').all();
  const result = await f.prune(); assert.equal(result.state,'prepared');
  assert.equal(result.revision.snapshot.products.length,2);
  assert.deepEqual(result.revision.snapshot.products,f.previous.products.slice(1));
  assert.deepEqual(result.revision.snapshot.slugHistory,f.previous.slugHistory);
  assert.equal(result.revision.snapshot.heldProducts.length,2);
  assert.equal(result.revision.snapshot.heldProducts.at(-1).reason,'expired');
  assert.equal(f.sql.prepare('SELECT status FROM catalog_revisions WHERE revision=?').get(result.revision.snapshot.catalogRevision).status,'importing');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
  assert.equal(result.owner.epoch,1); assert.equal(result.revision.globalVectorWatermark,0); assert.equal(result.revision.vectorSyncWatermark,0);
  assert.deepEqual(f.sql.prepare('SELECT * FROM products').all(),before);
  assert.deepEqual(await f.prune(result.owner),result);
});
test('all expired is an explicit all-held revision, never healthy empty catalog or invented freshness', async t => {
  const f = await setup(t,{ horizon: 25 * 3600000 }); const result = await f.prune();
  assert.equal(result.state,'all_held'); assert.equal(result.revision.snapshot.products.length,0);
  assert.equal(result.revision.snapshot.heldProducts.length,4);
  assert.equal(result.revision.snapshot.generatedAt,at(0));
  assert.deepEqual(prunedVectorPlan(result.revision).absentIds,f.previous.products.map(p => p.publicId));
});
test('held products are never promoted and current display/rights/factual changes only remove', async t => {
  const f = await setup(t);
  const formerlyHeld = f.values.at(-1); f.sql.prepare('UPDATE products SET is_active=1 WHERE id=?').run(formerlyHeld.id);
  const changed = f.previous.products[1]; f.sql.prepare('UPDATE products SET public_display_json=? WHERE id=?')
    .run(JSON.stringify({ ...changed,title:'Unreviewed replacement title' }),changed.id);
  const result = await f.prune();
  assert.deepEqual(result.revision.snapshot.products,[f.previous.products[2]]);
  assert.ok(result.revision.snapshot.heldProducts.some(p => p.id === formerlyHeld.id));
  assert.doesNotMatch(JSON.stringify(result.revision.snapshot),/Unreviewed replacement title/);
});
test('pending global vector work and wrong ownership fail before sealing a new snapshot', async t => {
  const f = await setup(t);
  await assert.rejects(f.prune({ ...f.owner,epoch: 999 }));
  f.sql.prepare("INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at) VALUES(?,'other-revision',?,'upsert',?)")
    .run(f.previous.products[0].publicId,FACTS,at(0));
  await assert.rejects(f.prune(),/unsettled/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_revisions').get().n,1);
});
test('failure/partial restart and lost commit response recover exact immutable receipts', async t => {
  const f = await setup(t,{ count: 40 }); let inserts = 0;
  f.before(query => { if (query.startsWith('INSERT INTO catalog_public_products') && ++inserts === 36) throw new Error('private injected failure'); });
  await assert.rejects(f.prune(),/prune_failed/); f.before(undefined);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_projection_receipts').get().n,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM catalog_public_products WHERE catalog_revision!='live-r1'").get().n,35);
  f.after(statements => { if (statements.some(s => s.query.startsWith('INSERT INTO catalog_projection_receipts'))) { f.after(undefined); f.loseResponse(); } });
  await assert.rejects(f.prune(),/prune_failed/);
  const owner = await readMutationOwner(f.db,scope); assert.equal(owner.epoch,1);
  const result = await f.prune(owner); assert.equal(result.revision.snapshot.products.length,39);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_projection_receipts').get().n,2);
  assert.equal(result.owner.epoch,1);
});
test('a sealed receipt never conceals missing target projection rows on replay', async t => {
  const f = await setup(t); const result = await f.prune();
  f.sql.prepare('DELETE FROM catalog_public_products WHERE catalog_revision=? AND public_id=?')
    .run(result.revision.snapshot.catalogRevision,result.revision.snapshot.products[0].publicId);
  await assert.rejects(f.prune(result.owner),/prune_projection_changed/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_public_products WHERE catalog_revision=?').get(result.revision.snapshot.catalogRevision).n,1);
});
test('intervening source change cannot seal a receipt; exact CAS rolls back', async t => {
  const f = await setup(t); let changed = false;
  f.after(statements => { if (!changed && statements.some(s => s.query.startsWith('INSERT INTO catalog_public_products'))) {
    changed = true; f.sql.prepare("UPDATE products SET rights_json='{}' WHERE id=?").run(f.previous.products[1].id);
  } });
  // This bypass simulates privileged/manual SQL, outside the application fence.
  // The change happens between the chunk commit and final receipt transaction.
  await assert.rejects(f.prune());
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_projection_receipts').get().n,1);
});
test('independent vector visibility gates the real build request; provider failure stays held/retryable', async t => {
  const f = await setup(t); const prepared = await f.prune(); const revision = prepared.revision;
  await assert.rejects(settlePrunedRevision(f.db,prepared.owner,revision,async () => { throw new Error('private provider body'); }),/vectors_unconfirmed/);
  await assert.rejects(settlePrunedRevision(f.db,prepared.owner,revision,async plan => ({ ...await f.proof(plan),environment:'production' })),/vectors_unconfirmed/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
  const queued = await settlePrunedRevision(f.db,prepared.owner,revision,f.proof);
  assert.equal(queued.state,'build_queued'); assert.equal(queued.owner.epoch,2);
  const row = f.sql.prepare('SELECT * FROM catalog_build_requests').get();
  assert.equal(row.source_revision,revision.snapshot.catalogRevision);
  assert.equal(JSON.parse(row.request_json).priorReleaseId,'live-release');
  assert.equal(JSON.parse(row.request_json).sourceDigest,revision.packet.receipt.snapshot_sha256);
  assert.equal(f.sql.prepare('SELECT status FROM catalog_revisions WHERE revision=?').get(revision.snapshot.catalogRevision).status,'reconciled');
  const replay = await settlePrunedRevision(f.db,queued.owner,revision,f.proof);
  assert.equal(replay.state,'existing'); assert.equal(replay.owner.epoch,2);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,1);
});
test('tampered retry payload/current facts/prior/deadline cannot reconcile a new revision', async t => {
  const f = await setup(t); const prepared = await f.prune();
  const modified = structuredClone(prepared.revision); modified.snapshot.products[0].title = 'Changed packet';
  await assert.rejects(settlePrunedRevision(f.db,prepared.owner,modified,f.proof),/packet_changed/);
  f.advance(7 * 3600000);
  await assert.rejects(settlePrunedRevision(f.db,prepared.owner,prepared.revision,f.proof),/window_elapsed/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
});
test('changed facts, prior receipt bytes, vector work, owner epoch or DB deadline during vector readback cannot queue a build', async t => {
  for (const change of [
    f => f.sql.prepare("UPDATE products SET rights_json='{}' WHERE id=?").run(f.previous.products[1].id),
    f => f.sql.exec("UPDATE publication_receipts SET manifest_json='[\"changed\"]'"),
    f => f.sql.prepare("INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at) VALUES(?,'other',?,'upsert',?)")
      .run(f.previous.products[1].publicId,FACTS,at(0)),
    f => f.sql.exec('UPDATE catalog_mutation_scopes SET mutation_epoch=mutation_epoch+1'),
    f => f.advance(7 * 3600000),
  ]) {
    const f = await setup(t); const prepared = await f.prune();
    await assert.rejects(settlePrunedRevision(f.db,prepared.owner,prepared.revision,async plan => { change(f); return f.proof(plan); }));
    assert.equal(f.sql.prepare('SELECT count(*) n FROM catalog_build_requests').get().n,0);
    assert.equal(f.sql.prepare('SELECT status FROM catalog_revisions WHERE revision=?').get(prepared.revision.snapshot.catalogRevision).status,'importing');
  }
});
test('enabled ownership refuses legacy import/upsert/projection/delete/drainer rather than advisory-only protection', async t => {
  const f = await setup(t);
  await assert.rejects(importBatch(f.db,{ exportSha256: SOURCE,table:'catalog_runs',batchNumber:0,rows:[],importedAt:at(0) }));
  const row = { ...f.sql.prepare('SELECT * FROM products WHERE is_active=1 LIMIT 1').get(),embedding_text_hash:FACTS };
  await assert.rejects(upsertProductAndQueueVector(f.db,row,{ publicId:row.public_id,revision:row.catalog_revision,
    embeddingTextHash:FACTS,operation:'upsert',createdAt:at(0) }));
  const other = { ...f.previous,catalogRevision:'unsupported-import' };
  await assert.rejects(importPublicProjection(f.db,await createProjectionPacket(other,Object.fromEntries(other.products.map(p => [p.publicId,FACTS])),SOURCE,new Date(AT))));
  const heldRow = f.sql.prepare('SELECT * FROM products WHERE is_active=0 LIMIT 1').get();
  await assert.rejects(queueReviewedVectorDelete(f.db,createReviewedVectorDelete(heldRow,{ reviewedAt:at(0),reviewReference:'test-only' }),new Date(AT)));
  let providerCalls = 0;
  await assert.rejects(drainVectorOutbox({ db:f.db,catalogRevision:'live-r1',adapters:{ async readback() { providerCalls++; return null; } } }),/ownership_required/);
  assert.equal(providerCalls,0); assert.equal(f.sql.prepare('SELECT count(*) n FROM migration_imports').get().n,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM vector_sync_outbox').get().n,0);
});
