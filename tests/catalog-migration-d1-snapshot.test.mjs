import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createProjectionPacket, importPublicProjection } from '../lib/catalog/d1.ts';
import { createCatalogSnapshot, publicProductRightsExpiry } from '../lib/catalog/snapshot.ts';
import { canonicalJson, sha256 } from '../scripts/catalog/migration.ts';
import { createSealedSnapshotEnvelope, reconstructD1Snapshot, SNAPSHOT_READ_LIMITS } from '../scripts/catalog/export-d1-snapshot.ts';

const AT = Date.parse('2026-10-20T12:00:00.000Z');
const SOURCE = 'b'.repeat(64); const FACTS = 'a'.repeat(64);
const time = (offset = 0) => new Date(AT + offset).toISOString();
const HASH_KEYS = ['envelopeSha256', 'snapshotSha256', 'projectionSha256', 'sourceExportSha256'];
function product(index, duplicateFamily = false) {
  return { id: `B${String(index).padStart(9, '0')}`, publicId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    slug: `funny-button-${index}`, title: duplicateFamily ? 'Funny Red Button' : `Fixture${index} Example${index}`, description: 'A test-only button, not a recommendation.',
    imageUrl: `https://m.media-amazon.com/images/I/test-${index}.jpg`, affiliateUrl: `https://www.amazon.com/dp/B${String(index).padStart(9, '0')}?tag=test-20`,
    source: 'amazon', currency: 'USD', qualityScore: .8, isActive: true, availabilityStatus: 'IN_STOCK',
    availabilityCheckedAt: time(), editorialStatus: 'generated_ready', editorialQualityScore: .9,
    sourceFactsHash: FACTS, editorialSourceHash: FACTS,
    editorialWriteup: Array.from({ length: 2 }, () => Array(55).fill('Thoughtful funny test-only editorial').join(' ')).join('\n\n') };
}
function rights(value) {
  return Object.fromEntries(['title', 'description', 'imageUrl', 'affiliateUrl', 'editorialWriteup'].map((field) => [field,
    { basis: 'merchant', value: value[field], reference: `protected fresh getItems receipt/${value.id}`, observedAt: time(), expiresAt: time(86400000) }]));
}
async function setup({ ready = 2, held = 1, prior = true, duplicateFamily = false, heldLink = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const filename of ['0001_catalog.sql', '0002_public_projections.sql', '0003_publication_outbox.sql',
    '0004_vector_outbox_leases.sql', '0005_historical_timestamps.sql', '0006_semantic_search_budget.sql', '0007_catalog_build_requests.sql']) {
    sqlite.exec('BEGIN'); sqlite.exec(await readFile(new URL(`../migrations/d1/${filename}`, import.meta.url), 'utf8')); sqlite.exec('COMMIT');
  }
  let clock = AT; let captures = 0; let afterCapture; const calls = [];
  sqlite.function('strftime', (format, when) => { assert.equal(format, '%Y-%m-%dT%H:%M:%fZ'); assert.equal(when, 'now'); return new Date(clock).toISOString(); });
  const db = { prepare(sql) { let params = []; return {
    bind(...values) { params = values; assert.ok(params.length <= 100); return this; },
    async all() {
      calls.push({ sql, params }); const result = sqlite.prepare(sql).all(...params).map((row) => ({ ...row }));
      if (sql.startsWith('WITH ids AS')) { captures++; afterCapture?.(captures); }
      return { results: result };
    },
    async run() { throw new Error('Exporter attempted a write'); },
  }; }, async batch() { throw new Error('Exporter attempted a write'); } };
  const fixtureDb = { prepare(sql) { let params = []; return { bind(...values) { params = values; return this; },
    async all() { return { results: sqlite.prepare(sql).all(...params).map((row) => ({ ...row })) }; },
    async run() { return sqlite.prepare(sql).run(...params); } }; },
  async batch(statements) { sqlite.exec('BEGIN'); try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const values = Array.from({ length: ready + held }, (_, index) => product(index + 1, duplicateFamily));
  const grants = Object.fromEntries(values.map((value) => [value.id, rights(value)]));
  values.slice(ready).forEach((value) => { value.isActive = false; });
  if (heldLink) values.slice(ready).forEach((value) => { grants[value.id].affiliateUrl = { basis: 'licensed', reference: 'reviewed owned-link permission', value: value.affiliateUrl }; });
  const original = createCatalogSnapshot(values, grants, { catalogRevision: 'sealed-r1', now: new Date(AT),
    slugHistory: values.length ? [{ slug: 'historic-button', canonicalSlug: values[0].slug, publicId: values[0].publicId }] : [] });
  // Preserve a reviewed non-default order rather than silently sorting a sealed input.
  const snapshot = { ...original, products: [...original.products].reverse() };
  const insert = sqlite.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,
    editorial_status,availability_status,availability_checked_at,source_facts_hash,editorial_source_hash,catalog_revision,
    eligible_until,public_display_json,rights_json,source_record_json,created_at,updated_at,timestamp_provenance_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const value of values) {
    const display = snapshot.products.find((item) => item.id === value.id);
    insert.run(value.id, value.publicId, value.slug, value.source, value.title, value.currency, value.qualityScore, value.isActive ? 1 : 0,
      value.editorialStatus, value.availabilityStatus, time(), FACTS, FACTS, 'operational-newer', display?.eligibleUntil || null,
      display ? JSON.stringify(display) : null, JSON.stringify(grants[value.id]), JSON.stringify({ id: value.id, public_id: value.publicId,
        source: value.source, availability_checked_at: time().replace('T', ' ').replace('Z', ''), last_verified_at: null,
        private: 'raw original unchanged' }), null, time(), '{}');
  }
  sqlite.prepare('INSERT INTO catalog_revisions VALUES(?,?,?,?)').run(snapshot.catalogRevision, time(), SOURCE, 'reconciled');
  const packet = await createProjectionPacket(snapshot, Object.fromEntries(snapshot.products.map((value) => [value.publicId, FACTS])), SOURCE, new Date(AT));
  // This proof helper accepts39 rows; larger fixtures insert all rows then seal explicitly.
  if (ready <= 39) await importPublicProjection(fixtureDb, packet);
  else {
    const { projectionQueries } = await import('../lib/catalog/d1.ts');
    for (const query of projectionQueries(packet)) sqlite.prepare(query.sql).run(...query.params);
  }
  let priorRow = null;
  if (prior) {
    priorRow = { release_id: 'prior-release', catalog_revision: snapshot.catalogRevision, code_sha: 'd'.repeat(40),
      completed_at: time(), manifest_json: JSON.stringify({ releaseId: 'prior-release', catalogRevision: snapshot.catalogRevision }) };
    sqlite.prepare('INSERT INTO publication_receipts VALUES(?,?,?,?,?)').run(...Object.values(priorRow));
  }
  const envelope = createSealedSnapshotEnvelope(snapshot);
  const context = { envelopeSha256: sha256(`${JSON.stringify(envelope)}\n`), snapshotSha256: packet.receipt.snapshot_sha256,
    projectionSha256: packet.receipt.projection_sha256, sourceExportSha256: SOURCE, vectorSyncWatermark: 0, publicationReceiptWatermark: prior ? 1 : 0,
    cutoff: time(3600000), priorPublication: priorRow ? { releaseId: priorRow.release_id, receiptSha256: sha256(canonicalJson(priorRow)) } : null };
  return { sqlite, db, snapshot, envelope, context, packet, calls, values, grants,
    setAfterCapture(fn) { afterCapture = fn; }, advance(ms) { clock += ms; },
    async read(changedEnvelope = envelope, changedContext = context) { return reconstructD1Snapshot(db, changedEnvelope, changedContext); },
    close() { sqlite.close(); } };
}

test('exact sealed reconstruction preserves order/history/held bytes without private data or writes', async () => {
  const f = await setup();
  try {
    const before = f.sqlite.prepare('SELECT total_changes() n').get().n;
    const result = await f.read(); assert.equal(result.status, 'ready'); assert.deepEqual(result.snapshot, f.snapshot);
    assert.equal(result.observedAt, time()); assert.equal(sha256(`${JSON.stringify(result.snapshot)}\n`), f.context.snapshotSha256);
    assert.equal(f.calls.length, 2); assert.equal(f.sqlite.prepare('SELECT total_changes() n').get().n, before);
    assert.doesNotMatch(JSON.stringify(result), /raw original|protected fresh|rights_json|source_facts_hash|private/);
    // Unknown historical creation stays NULL; independently bound fresh verification is sufficient.
    assert.equal(f.sqlite.prepare('SELECT created_at FROM products LIMIT 1').get().created_at, null);
  } finally { f.close(); }
});

test('missing/wrong reviewed envelope or digest never fabricates an empty clean snapshot', async () => {
  const f = await setup();
  try {
    for (const key of HASH_KEYS) assert.equal((await f.read(f.envelope, { ...f.context, [key]: '0'.repeat(64) })).status, 'held');
    for (const key of ['products', 'heldProducts', 'slugHistory']) {
      const missing = structuredClone(f.envelope); delete missing[key]; assert.equal((await f.read(missing)).status, 'held');
    }
    const changed = { ...f.envelope, products: [...f.envelope.products].reverse() };
    assert.equal((await f.read(changed, { ...f.context, envelopeSha256: sha256(`${JSON.stringify(changed)}\n`) })).status, 'held');
    assert.equal((await f.read({ ...f.envelope, dataKind: 'synthetic_fixture' })).status, 'held');
  } finally { f.close(); }
});

test('incomplete/corrupt public rows and unreconciled or changed source receipt are held', async () => {
  for (const corrupt of [
    db => db.exec('DELETE FROM catalog_public_products WHERE rowid=(SELECT min(rowid) FROM catalog_public_products)'),
    db => { db.exec('DROP TRIGGER catalog_public_immutable'); db.exec("UPDATE catalog_public_products SET title='tampered'"); },
    db => db.exec("UPDATE catalog_revisions SET status='importing'"),
    db => db.exec(`UPDATE catalog_revisions SET source_export_sha256='${'e'.repeat(64)}'`),
    db => db.exec('DELETE FROM catalog_projection_receipts'),
  ]) {
    const f = await setup(); try { corrupt(f.sqlite); assert.equal((await f.read()).status, 'held'); } finally { f.close(); }
  }
});

test('current holds, duplicate/factual drift, revoked grants and deadline tightening are not republished', async () => {
  for (const update of ['is_active=0', "duplicate_of_product_id='winner'", "availability_status='OUT_OF_STOCK'", 'quality_score=.1',
    "editorial_status='stale'", 'public_display_json=NULL', 'availability_checked_at=NULL,last_verified_at=NULL',
    `source_facts_hash='${'c'.repeat(64)}',editorial_source_hash='${'c'.repeat(64)}'`, "rights_json='{}'", `eligible_until='${time(1000)}'`]) {
    const f = await setup();
    try { f.sqlite.exec(`UPDATE products SET ${update} WHERE is_active=1`); const result = await f.read(); assert.equal(result.status, 'held', update); assert.equal('snapshot' in result, false); }
    finally { f.close(); }
  }
});

test('historical UTC evidence and exact fresh receipt evidence are distinguished from naive/mismatched claims', async () => {
  for (const update of ["availability_checked_at='2026-10-20 12:00:00.000'", "availability_checked_at='2026-02-30T12:00:00.000Z'",
    `availability_checked_at='${time(-1)}'`, "timestamp_provenance_json='{" + '"schemaVersion":1,"sourceArchive":"archive","fields":{"availability_checked_at":{"state":"unresolved","evidence":"unknown"}}}' + "'"] ) {
    const f = await setup();
    try { f.sqlite.exec(`UPDATE products SET ${update} WHERE is_active=1`); assert.equal((await f.read()).status, 'held', update); }
    finally { f.close(); }
  }
  const f = await setup();
  try {
    f.sqlite.prepare('UPDATE products SET availability_checked_at=?,timestamp_provenance_json=? WHERE is_active=1').run(time(-1000),
      JSON.stringify({ schemaVersion: 1, sourceArchive: 'reviewed archive', fields: { availability_checked_at:
        { state: 'evidenced', basis: 'documented_utc_writer', evidence: 'reviewed SQL NOW UTC run receipt' } } }));
    assert.equal((await f.read()).reason, 'verification_utc_unproven'); // Evidence alone cannot authorize a different archived instant.
    f.sqlite.prepare("UPDATE products SET source_record_json=json_set(source_record_json,'$.availability_checked_at',?) WHERE is_active=1")
      .run(time(-1000).replace('T', ' ').replace('Z', ''));
    assert.equal((await f.read()).status, 'ready');
    f.sqlite.exec("UPDATE products SET source_record_json=json_set(source_record_json,'$.public_id','wrong-source-identity') WHERE is_active=1");
    assert.equal((await f.read()).reason, 'verification_utc_unproven');
  } finally { f.close(); }
});

test('expiry/cutoff pruning explicitly needs a new revision, not a changed sealed digest', async () => {
  for (const elapsed of [86399999, 86400000]) {
    const f = await setup();
    try {
      f.advance(elapsed); const result = await f.read(f.envelope, { ...f.context, cutoff: time(86400000) });
      assert.deepEqual(result, { status: 'held', reason: 'expiry_requires_new_revision', requiresNewRevision: true });
      assert.equal(f.sqlite.prepare('SELECT snapshot_sha256 FROM catalog_projection_receipts').get().snapshot_sha256, f.context.snapshotSha256);
    } finally { f.close(); }
  }
  const f = await setup(); try {
    f.setAfterCapture(count => { if (count === 1) f.advance(86400000); });
    assert.equal((await f.read()).reason, 'expiry_requires_new_revision');
  } finally { f.close(); }
});

test('all-held and genuinely empty seals remain held, never ready empty catalogs', async () => {
  for (const held of [0, 3]) {
    const f = await setup({ ready: 0, held, prior: false });
    try { assert.deepEqual(await f.read(), { status: 'held', reason: 'all_held', requiresNewRevision: false }); }
    finally { f.close(); }
  }
});

test('vector pending/new watermark/overflow and stale or altered publication prior fail closed', async () => {
  for (const mutate of [
    f => f.sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at) VALUES(?,?,?,'upsert',?)`)
      .run(f.snapshot.products[0].publicId, f.snapshot.catalogRevision, FACTS, time()),
    f => f.sqlite.prepare(`INSERT INTO vector_sync_outbox(sequence,public_id,source_revision,embedding_text_hash,operation,status,created_at) VALUES(?,?,?,?,?,'complete',?)`)
      .run(SNAPSHOT_READ_LIMITS.outboxSequence + 1, f.snapshot.products[0].publicId, 'other-revision', FACTS, 'upsert', time()),
    f => f.sqlite.exec("UPDATE publication_receipts SET manifest_json='{}'"),
    f => f.sqlite.prepare('INSERT INTO publication_receipts VALUES(?,?,?,?,?)').run('newer-release', f.snapshot.catalogRevision, 'e'.repeat(40), time(), '{}'),
  ]) {
    const f = await setup(); try { mutate(f); assert.equal((await f.read()).status, 'held'); } finally { f.close(); }
  }
  const f = await setup(); try {
    f.sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,status,created_at) VALUES(?,?,?,'upsert','complete',?)`)
      .run(f.snapshot.products[0].publicId, f.snapshot.catalogRevision, FACTS, time());
    assert.equal((await f.read()).reason, 'vector_watermark_unreconciled');
    assert.equal((await f.read(f.envelope, { ...f.context, vectorSyncWatermark: 1 })).status, 'ready');
  } finally { f.close(); }
});

test('independent SQL captures observe concurrent source/vector/prior drift, with no returned partial snapshot', async () => {
  for (const change of [
    f => f.sqlite.exec("UPDATE products SET source_facts_hash='changed' WHERE is_active=1"),
    f => f.sqlite.exec("UPDATE products SET rights_json='{}' WHERE is_active=1"),
    f => f.sqlite.exec("UPDATE publication_receipts SET manifest_json='{}'"),
    f => f.sqlite.exec("UPDATE catalog_revisions SET status='importing'"),
    f => f.sqlite.exec('DELETE FROM catalog_public_products'),
    f => f.sqlite.prepare(`INSERT INTO vector_sync_outbox(public_id,source_revision,embedding_text_hash,operation,created_at) VALUES(?,?,?,'upsert',?)`)
      .run(f.snapshot.products[0].publicId, f.snapshot.catalogRevision, FACTS, time()),
  ]) {
    const f = await setup();
    try { f.setAfterCapture(count => { if (count === 1) change(f); }); assert.deepEqual(await f.read(),
      { status: 'held', reason: 'source_changed_during_read', requiresNewRevision: false }); }
    finally { f.close(); }
  }
});

test('near-duplicate sealed families require a new revision, never silent deduplication', async () => {
  const f = await setup({ duplicateFamily: true });
  try { assert.deepEqual(await f.read(), { status: 'held', reason: 'duplicates_require_new_revision', requiresNewRevision: true }); }
  finally { f.close(); }
});

test('retained held links require exact current non-expiring licensed/owned permission', async () => {
  const f = await setup({ heldLink: true });
  try {
    assert.equal((await f.read()).status, 'ready'); assert.ok(f.snapshot.heldProducts[0].affiliateUrl);
    f.sqlite.exec("UPDATE products SET rights_json='{}' WHERE is_active=0");
    assert.deepEqual(await f.read(), { status: 'held', reason: 'held_link_rights_incompatible', requiresNewRevision: true });
  } finally { f.close(); }
});

test('a supplied prior can be a reviewed rollback target rather than the latest historical receipt', async () => {
  const f = await setup(); try {
    f.sqlite.prepare('INSERT INTO publication_receipts VALUES(?,?,?,?,?)').run('historically-newer-release', f.snapshot.catalogRevision, 'e'.repeat(40), time(), '{}');
    assert.equal((await f.read()).reason, 'publication_prior_changed');
    assert.equal((await f.read(f.envelope, { ...f.context, publicationReceiptWatermark: 2 })).status, 'ready');
    // This means the historical prior matches context, not that D1 proved it active at the provider.
  } finally { f.close(); }
});

test('elapsed context, regressing DB clock and bad bounds cannot yield a clean snapshot', async () => {
  const f = await setup(); try {
    assert.equal((await f.read(f.envelope, { ...f.context, cutoff: time() })).reason, 'capture_window_elapsed');
    for (const patch of [{ vectorSyncWatermark: -1 }, { vectorSyncWatermark: SNAPSHOT_READ_LIMITS.outboxSequence + 1 },
      { publicationReceiptWatermark: 1.5 }, { cutoff: '2026-10-20 13:00:00' }]) assert.equal((await f.read(f.envelope, { ...f.context, ...patch })).status, 'held');
    f.setAfterCapture(() => { f.advance(-1); f.setAfterCapture(undefined); });
    assert.equal((await f.read()).reason, 'database_clock_regressed');
  } finally { f.close(); }
});

test('compatible operational revision/timestamp advance does not block exact old projection', async () => {
  const f = await setup(); try {
    f.sqlite.exec(`UPDATE products SET catalog_revision='r999',updated_at='${time(500)}'`);
    assert.equal((await f.read()).status, 'ready');
  } finally { f.close(); }
});

test('current public display drift holds even with unchanged facts, grants and identities', async () => {
  for (const update of [{ title: 'Manual replacement title' }, { description: 'Unreviewed replacement description.' },
    { imageUrl: 'https://m.media-amazon.com/images/I/replacement.jpg' },
    { affiliateUrl: 'https://www.amazon.com/dp/B000000002?tag=changed-20' },
    { editorialWriteup: 'Manual replacement editorial' }, { humorTags: ['changed'] }, { punnyTitle: 'New manual pun' },
    { currency: 'CAD' }, { qualityScore: .9 }]) {
    const f = await setup(); try {
      const product = f.snapshot.products[0];
      f.sqlite.prepare('UPDATE products SET public_display_json=? WHERE public_id=?').run(JSON.stringify({ ...product, ...update }), product.publicId);
      assert.deepEqual(await f.read(), { status: 'held', reason: 'current_display_incompatible', requiresNewRevision: true });
    } finally { f.close(); }
  }
});

test('normalized key order and deadline renewal alone preserve display; tightened DTO deadline does not', async () => {
  const f = await setup(); try {
    const product = f.snapshot.products[0];
    f.sqlite.prepare('UPDATE products SET public_display_json=? WHERE public_id=?')
      .run(JSON.stringify(Object.fromEntries(Object.entries({ ...product, eligibleUntil: time(2 * 86400000) }).reverse())), product.publicId);
    assert.equal((await f.read()).status, 'ready');
    f.sqlite.prepare('UPDATE products SET public_display_json=? WHERE public_id=?').run(JSON.stringify({ ...product, eligibleUntil: time(2000) }), product.publicId);
    assert.equal((await f.read()).reason, 'current_deadline_incompatible');
  } finally { f.close(); }
});

test('bounds precede SQL, ID arrays avoid100 parameters, and candidate outer-loop uses unique identity indexes', async () => {
  const f = await setup({ ready: 85, held: 2 }); try {
    assert.equal((await f.read()).status, 'ready'); assert.ok(f.calls.every(call => call.params.length === 6));
    assert.ok(f.calls.every(call => call.sql.length < 100000));
    const plan = f.sqlite.prepare(`EXPLAIN QUERY PLAN ${f.calls[0].sql}`).all(...f.calls[0].params).map(row => row.detail).join('\n');
    assert.match(plan, /SEARCH p USING INDEX sqlite_autoindex_products_2 \(public_id=\?\)/);
    assert.doesNotMatch(plan, /SCAN p\b|products_active_quality_idx/);
    for (const patch of [{ products: Array(SNAPSHOT_READ_LIMITS.ready + 1).fill(f.envelope.products[0]) },
      { heldProducts: Array(SNAPSHOT_READ_LIMITS.held + 1).fill(f.envelope.heldProducts[0]) },
      { slugHistory: Array(SNAPSHOT_READ_LIMITS.slugs + 1).fill(f.envelope.slugHistory[0]) }]) {
      const count = f.calls.length; assert.equal((await f.read({ ...f.envelope, ...patch })).status, 'held'); assert.equal(f.calls.length, count);
    }
    const oversized = { prepare() { return { bind() { return this; }, async all() {
      return { results: [{ kind: 'header', identity: '', data: 'x'.repeat(SNAPSHOT_READ_LIMITS.rowBytes + 1) }] };
    } }; } };
    assert.equal((await reconstructD1Snapshot(oversized, f.envelope, f.context)).reason, 'read_bounds');
    f.sqlite.prepare('UPDATE products SET rights_json=? WHERE rowid=(SELECT min(rowid) FROM products)').run(JSON.stringify({ overLimit: 'x'.repeat(SNAPSHOT_READ_LIMITS.rowBytes) }));
    assert.equal((await f.read()).reason, 'read_bounds'); // Real SQL replaces oversized private rows before result transfer.
  } finally { f.close(); }
});

test('read errors are sanitized and shared rights validation never extends a sealed deadline', async () => {
  const f = await setup(); try {
    const result = await reconstructD1Snapshot({ prepare() { throw new Error('PRIVATE credential/source SQL'); } }, f.envelope, f.context);
    assert.deepEqual(result, { status: 'held', reason: 'snapshot_reconstruction_failed', requiresNewRevision: false });
    const display = f.snapshot.products[0]; const grants = f.grants[display.id];
    assert.equal(publicProductRightsExpiry(display, grants, new Date(AT)), AT + 86400000);
    assert.equal(publicProductRightsExpiry({ ...display, title: 'unapproved' }, grants, new Date(AT)), null);
    assert.equal(publicProductRightsExpiry(display, { ...grants, editorialWriteup: undefined }, new Date(AT)), null);
  } finally { f.close(); }
});
