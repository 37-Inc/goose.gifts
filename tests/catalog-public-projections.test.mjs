import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createProjectionPacket, getRevisionProductsByPublicIds, importPublicProjection,
  getListedRevisionProductsByPublicIds, keywordSearchRevision, projectionQueries, rollbackPreflight, visibleRevisionCountQuery } from '../lib/catalog/d1.ts';
import { publicProductRightsExpiry } from '../lib/catalog/snapshot.ts';
import { getProductsByPublicIds, keywordSearch } from '../lib/catalog/storage/d1.ts';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const HASH = 'a'.repeat(64);
const PUBLIC_ID = '00000000-0000-4000-8000-000000000001';
function snapshot(revision, witty = 'A funny red button for a desk.') {
  return { schemaVersion: 1, dataKind: 'catalog', catalogRevision: revision, generatedAt: NOW.toISOString(),
    products: [{ id: 'B000000001', publicId: PUBLIC_ID, slug: 'funny-button', title: 'Funny Red Sound Button', description: witty,
      wittyDescription: witty, imageUrl: 'https://m.media-amazon.com/images/I/button.jpg', affiliateUrl: 'https://www.amazon.com/dp/B000000001?tag=test-20',
      editorialWriteup: 'Controlled editorial fixture, not a product recommendation.',
      punnyTitle: 'Controlled button heading', humorTags: ['dry', 'quoted"tag', 'λ'],
      source: 'amazon', currency: 'USD', price: 0, isActive: true, qualityScore: 0.8, eligibleUntil: new Date(NOW.getTime() + 86400_000).toISOString() }], heldProducts: [], slugHistory: [] };
}
function rights(product) {
  return Object.fromEntries(['title', 'description', 'imageUrl', 'affiliateUrl', 'editorialWriteup', 'punnyTitle', 'wittyDescription', 'humorTags']
    .filter(field => field in product).map(field => [field, { basis: 'licensed', reference: 'Controlled test-only permission',
      value: field === 'humorTags' ? JSON.stringify(product[field]) : product[field] }]));
}
async function setup({persistentSchema=true,sourceRecord={}}={}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(await readFile(new URL('../migrations/d1/0001_catalog.sql', import.meta.url), 'utf8'));
  sqlite.exec(await readFile(new URL('../migrations/d1/0002_public_projections.sql', import.meta.url), 'utf8'));
  sqlite.exec(await readFile(new URL('../migrations/d1/0010_catalog_maintenance.sql',import.meta.url),'utf8'));
  if(persistentSchema)sqlite.exec(await readFile(new URL('../migrations/d1/0013_persistent_public_products.sql',import.meta.url),'utf8'));
  sqlite.function('strftime', (format, instant) => {
    assert.equal(format, '%Y-%m-%dT%H:%M:%fZ'); assert.equal(instant, 'now'); return NOW.toISOString();
  });
  sqlite.prepare(`INSERT INTO products(id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,
    availability_status,source_facts_hash,editorial_source_hash,catalog_revision,eligible_until,rights_json,source_record_json,updated_at,public_display_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('B000000001', PUBLIC_ID, 'funny-button', 'amazon', 'current operational title', 'USD', .8, 1,
      'generated_ready', 'IN_STOCK', HASH, HASH, 'operational-newer', new Date(NOW.getTime() + 2 * 86400_000).toISOString(),
      JSON.stringify(rights(snapshot('operational').products[0])), JSON.stringify(sourceRecord), NOW.toISOString(), JSON.stringify(snapshot('operational').products[0]));
  sqlite.prepare('UPDATE products SET availability_checked_at=?').run(NOW.toISOString());
  const db = { prepare(sql) { let values = []; return {
    bind(...parameters) { values = parameters; return this; },
    async all() { return { results: sqlite.prepare(sql).all(...values).map((row) => ({ ...row })) }; },
    async run() { return sqlite.prepare(sql).run(...values); },
  }; }, async batch(statements) { sqlite.exec('BEGIN'); try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, db, close: () => sqlite.close() };
}
const packet = (value) => createProjectionPacket(value, { [PUBLIC_ID]: HASH }, 'b'.repeat(64), NOW);

test('bounded ID and FTS lookups start from candidate indexes, not the active catalog', async () => {
  const fixture = await setup();
  try {
    const value = snapshot('r1');
    await importPublicProjection(fixture.db, await packet(value));
    const insert = fixture.sqlite.prepare(`INSERT INTO products
      (id,public_id,slug,source,title,currency,quality_score,is_active,editorial_status,catalog_revision,rights_json,source_record_json,updated_at)
      VALUES(?,?,?,'amazon','Unrelated held object','USD',0.8,1,'stale','legacy','{}','{}',?)`);
    fixture.sqlite.exec('BEGIN');
    for (let index = 0; index < 3000; index++)
      insert.run(`held-${index}`, `held-public-${index}`, `held-slug-${index}`, NOW.toISOString());
    fixture.sqlite.exec('COMMIT');
    const plans = [];
    const db = { prepare(sql) { return { bind(...values) { return { async all() {
      assert.ok(values.length <= 100);
      plans.push(fixture.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values).map(row => row.detail).join('\n'));
      return { results: fixture.sqlite.prepare(sql).all(...values) };
    }}; }}; }};
    const ids = [PUBLIC_ID, ...Array.from({ length: 79 }, (_, index) => `held-public-${index}`)];
    assert.equal((await getProductsByPublicIds(db, ids, NOW)).length, 1);
    assert.deepEqual(await getRevisionProductsByPublicIds(db, ids, NOW, 'r1'), value.products);
    assert.equal((await keywordSearch(db, 'operational', 60, NOW)).length, 1);
    assert.deepEqual(await keywordSearchRevision(db, 'button', 60, NOW, 'r1'), value.products);
    for (const plan of plans) {
      assert.doesNotMatch(plan, /products_active_quality_idx|SCAN p\b/);
      assert.match(plan, /SEARCH p USING (?:INTEGER PRIMARY KEY|INDEX)/);
    }
    assert.match(plans[0], /public_id=\?/);
    assert.match(plans[1], /catalog_revision=\? AND public_id=\?/);
    assert.match(plans[2], /products_fts VIRTUAL TABLE INDEX .*M/);
    assert.match(plans[3], /catalog_public_products_fts VIRTUAL TABLE INDEX .*M/);
    // A later hold must still win over both ID and keyword candidate sets.
    fixture.sqlite.prepare('UPDATE products SET is_active=0 WHERE public_id=?').run(PUBLIC_ID);
    assert.deepEqual(await getProductsByPublicIds(db, ids, NOW), []);
    assert.deepEqual(await getRevisionProductsByPublicIds(db, ids, NOW, 'r1'), []);
    assert.deepEqual(await keywordSearch(db, 'operational', 60, NOW), []);
    assert.deepEqual(await keywordSearchRevision(db, 'button', 60, NOW, 'r1'), []);
  } finally { fixture.close(); }
});

test('old and new immutable public revisions coexist independently of mutable operational revision', async () => {
  const fixture = await setup();
  try {
    const old = snapshot('r1'); const newer = snapshot('r2');
    await importPublicProjection(fixture.db, await packet(old));
    await importPublicProjection(fixture.db, await packet(newer));
    for (const expected of [old, newer]) {
      assert.deepEqual(await getRevisionProductsByPublicIds(fixture.db, [PUBLIC_ID], NOW, expected.catalogRevision), expected.products);
      assert.deepEqual(await keywordSearchRevision(fixture.db, 'button', 60, NOW, expected.catalogRevision), expected.products);
      assert.deepEqual(await rollbackPreflight(fixture.db, expected, NOW), { ok: true, reason: 'eligible_revision_compatible' });
    }
    assert.equal(fixture.sqlite.prepare('SELECT count(*) n FROM catalog_public_products').get().n, 2);
    const plan = fixture.sqlite.prepare('EXPLAIN QUERY PLAN SELECT public_display_json FROM catalog_public_products WHERE catalog_revision=? AND public_id=?').all('r1', PUBLIC_ID);
    assert.match(JSON.stringify(plan), /INDEX/);
  } finally { fixture.close(); }
});

test('identical replay succeeds and changed bytes/revision mutation are rejected', async () => {
  const fixture = await setup();
  try {
    const original = await packet(snapshot('r1'));
    assert.equal(await importPublicProjection(fixture.db, original), 'imported');
    assert.equal(await importPublicProjection(fixture.db, original), 'already_imported');
    await assert.rejects(importPublicProjection(fixture.db, await packet(snapshot('r1', 'Different bytes.'))), /different projection bytes/);
    assert.throws(() => fixture.sqlite.prepare('UPDATE catalog_public_products SET title=?').run('oops'), /immutable/);
    assert.throws(() => fixture.sqlite.prepare('UPDATE catalog_projection_receipts SET product_count=0').run(), /immutable/);
    fixture.sqlite.prepare('DELETE FROM catalog_public_products WHERE catalog_revision=?').run('r1');
    await assert.rejects(importPublicProjection(fixture.db, original), /incomplete or changed/);
    assert.equal((await rollbackPreflight(fixture.db, snapshot('r1'), NOW)).ok, false);
    const insert = projectionQueries(original)[0];
    assert.throws(() => fixture.sqlite.prepare(insert.sql).run(...insert.params), /sealed/);
  } finally { fixture.close(); }
});

test('a receipt cannot hide tampered projection bytes on replay or rollback', async () => {
  const fixture = await setup();
  try {
    const value = snapshot('r1'); const original = await packet(value);
    await importPublicProjection(fixture.db, original);
    fixture.sqlite.exec('DROP TRIGGER catalog_public_immutable'); // Deliberate corruption fixture.
    fixture.sqlite.prepare('UPDATE catalog_public_products SET public_display_json=?').run(JSON.stringify(snapshot('r1', 'Corrupted public copy.').products[0]));
    await assert.rejects(importPublicProjection(fixture.db, original), /incomplete or changed/);
    assert.equal((await rollbackPreflight(fixture.db, value, NOW)).ok, false);
  } finally { fixture.close(); }
});

test('operational timestamp/revision advancement alone does not invalidate compatible rollback', async () => {
  const fixture = await setup();
  try {
    const value = snapshot('r1'); await importPublicProjection(fixture.db, await packet(value));
    fixture.sqlite.prepare('UPDATE products SET catalog_revision=?,updated_at=?').run('r99', '2026-10-19T12:00:01.000Z');
    assert.equal((await rollbackPreflight(fixture.db, value, NOW)).ok, true);
  } finally { fixture.close(); }
});

test('current value rights and deadlines govern IDs, FTS, visible counts and rollback together', async () => {
  const old = snapshot('r1').products[0];
  const cases = [
    ['changed display with revoked old title grant', (p, r) => { p.title = 'Funny Blue Sound Button'; r.title.value = p.title; }],
    ['changed display without changing factual hash', p => { p.description = 'Changed approved copy.'; }],
    ['missing required grant', (_p, r) => { delete r.editorialWriteup; }],
    ['missing optional displayed grant', (_p, r) => { delete r.wittyDescription; }],
    ['missing displayed array grant', (_p, r) => { delete r.humorTags; }],
    ['shortened current grant', (_p, r) => { r.title.expiresAt = new Date(NOW.getTime() + 60_000).toISOString(); }],
    ['shortened current DTO deadline', p => { p.eligibleUntil = new Date(NOW.getTime() + 60_000).toISOString(); }],
    ['shortened operational deadline', (_p, _r, f) => { f.sqlite.prepare('UPDATE products SET eligible_until=?').run(new Date(NOW.getTime() + 60_000).toISOString()); }],
    ['expired grant', (_p, r) => { r.title.expiresAt = NOW.toISOString(); }],
    ['grant value mismatch', (_p, r) => { r.title.value = 'Another value'; }],
    ['unknown permission basis', (_p, r) => { r.title.basis = 'unreviewed'; }],
    ['empty permission reference', (_p, r) => { r.title.reference = '\t\n\u00a0'; }],
    ['invalid grant calendar', (_p, r) => { r.title.expiresAt = '2027-02-30T12:00:00.000Z'; }],
    ['merchant grant over 24h', (_p, r) => { Object.assign(r.title, { basis: 'merchant', observedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 86_400_001).toISOString() }); }],
    ['future merchant observation', (_p, r) => { Object.assign(r.title, { basis: 'merchant', observedAt: new Date(NOW.getTime() + 1).toISOString(), expiresAt: old.eligibleUntil }); }],
    ['merchant grant missing observation', (_p, r) => { Object.assign(r.title, { basis: 'merchant', expiresAt: old.eligibleUntil }); }],
    ...[
      '2027-02-29T12:00:00.000Z', '2027-04-31T12:00:00.000Z',
      '2027-02-28T24:00:00.000Z', '2027-02-28T12:60:00.000Z', '2027-02-28T12:00:60.000Z',
      '2027-02-28t12:00:00.000z', '2027-02-28 12:00:00.000Z', '2027-02-28T12:00:00.000',
      '2027-02-28T12:00:00.00Z', '2027-02-28T12:00:00.0000Z', '2027-02-28T12:00:00.000+00:00',
    ].map(value => [`noncanonical grant instant ${value}`, (_p, r) => { r.title.expiresAt = value; }]),
  ];
  for (const [label, mutate] of cases) {
    const f = await setup();
    try {
      const value = snapshot('r1'); await importPublicProjection(f.db, await packet(value));
      const current = { ...old }, grants = rights(old); mutate(current, grants, f);
      f.sqlite.prepare('UPDATE products SET public_display_json=?,rights_json=?').run(JSON.stringify(current), JSON.stringify(grants));
      assert.deepEqual(await getRevisionProductsByPublicIds(f.db, [PUBLIC_ID], NOW, 'r1'), [], label);
      assert.deepEqual(await keywordSearchRevision(f.db, 'button', 60, NOW, 'r1'), [], label);
      for (const clock of [NOW, undefined]) {
        const query = visibleRevisionCountQuery('r1', clock);
        assert.equal(Object.values(f.sqlite.prepare(query.sql).get(...query.params))[0], 0, label);
      }
      assert.equal((await rollbackPreflight(f.db, value, NOW)).ok, false, label);
      if (label.includes('grant') && !label.includes('changed display')) {
        const expiry = publicProductRightsExpiry(old, grants, NOW);
        assert.ok(expiry === null || expiry < Date.parse(old.eligibleUntil), label);
      }
    } finally { f.close(); }
  }
});

test('canonical timestamp permission checks avoid D1 long-pattern limits and accept real leap dates', async () => {
  // Actual D1 rejected the previous long GLOB pattern although native SQLite
  // accepted it. Exercise the real predicate, not a duplicate date formatter.
  const sql=visibleRevisionCountQuery('r1',NOW).sql;
  const patterns=[...sql.matchAll(/\bGLOB\s+'([^']*)'/gi)].map(match=>match[1]);
  assert.ok(patterns.length>0);assert.ok(patterns.every(pattern=>pattern==='*[^a-f0-9]*'&&pattern.length<32));
  const factualGuard=sql.match(/typeof\(p.source_facts_hash\)='text' AND length\(p.source_facts_hash\)=64 AND p.source_facts_hash NOT GLOB '\*\[\^a-f0-9\]\*'/)?.[0];
  assert.ok(factualGuard,'only the bounded hexadecimal guard may use GLOB, never timestamp matching');
  for (const expiresAt of ['2028-02-29T12:00:00.000Z', '2028-02-29T23:59:59.999Z']) {
    const f = await setup();
    try {
      for(const [facts,valid]of [[HASH,1],['0'.repeat(64),1],['A'.repeat(64),0],['g'.repeat(64),0],['a'.repeat(63),0],['a'.repeat(65),0],[null,0]])
        assert.equal(f.sqlite.prepare(`SELECT ${factualGuard} valid FROM(SELECT ? source_facts_hash) p`).get(facts).valid,valid);
      const value = snapshot('r1'); await importPublicProjection(f.db, await packet(value));
      const grants = rights(value.products[0]); grants.title.expiresAt = expiresAt;
      f.sqlite.prepare('UPDATE products SET rights_json=?').run(JSON.stringify(grants));
      assert.deepEqual(await getRevisionProductsByPublicIds(f.db, [PUBLIC_ID], NOW, 'r1'), value.products);
      assert.equal((await rollbackPreflight(f.db, value, NOW)).ok, true);
    } finally { f.close(); }
  }
});

test('semantic key ordering and valid owned/licensed/24h merchant grants preserve deadline-only renewal', async () => {
  for (const basis of ['owned', 'licensed', 'merchant']) {
    const f = await setup();
    try {
      const value = snapshot('r1'); const old = value.products[0]; await importPublicProjection(f.db, await packet(value));
      const current = Object.fromEntries(Object.entries({ ...old, eligibleUntil: new Date(NOW.getTime() + 2 * 86400_000).toISOString() }).reverse());
      const grants = Object.fromEntries(Object.entries(rights(old)).map(([field, grant]) => [field, { ...grant, basis,
        ...(basis === 'merchant' ? { observedAt: NOW.toISOString(), expiresAt: old.eligibleUntil } : {}) }]));
      assert.ok(publicProductRightsExpiry(old, grants, NOW) >= Date.parse(old.eligibleUntil));
      f.sqlite.prepare('UPDATE products SET public_display_json=?,rights_json=?').run(JSON.stringify(current, null, 2), JSON.stringify(grants));
      assert.deepEqual(await getRevisionProductsByPublicIds(f.db, [PUBLIC_ID], NOW, 'r1'), value.products, basis);
      const query = visibleRevisionCountQuery('r1');
      assert.equal(Object.values(f.sqlite.prepare(query.sql).get(...query.params))[0], 1, basis);
      assert.equal((await rollbackPreflight(f.db, value, NOW)).ok, true, basis);
    } finally { f.close(); }
  }
});

test('partial projection stays invisible and an incomplete receipt cannot activate it', async () => {
  const fixture = await setup();
  try {
    const value = await packet(snapshot('r1'));
    const [insert] = projectionQueries(value);
    fixture.sqlite.prepare(insert.sql).run(...insert.params);
    assert.deepEqual(await keywordSearchRevision(fixture.db, 'button', 60, NOW, 'r1'), []);
    assert.deepEqual(await rollbackPreflight(fixture.db, snapshot('r1'), NOW), { ok: false, reason: 'projection_receipt_missing' });
    fixture.sqlite.prepare('DELETE FROM catalog_public_products').run();
    const receipt = projectionQueries(value).at(-1);
    assert.throws(() => fixture.sqlite.prepare(receipt.sql).run(...receipt.params), /Incomplete/);
  } finally { fixture.close(); }
});

test('current operational holds, factual changes and deadline expiry override both revisions', async () => {
  for (const update of ["is_active=0", "duplicate_of_product_id='winner'", "availability_status='OUT_OF_STOCK'",
    'availability_checked_at=NULL,last_verified_at=NULL',
    "quality_score=0.1", "editorial_status='stale'", "public_display_json=NULL", `source_facts_hash='${'c'.repeat(64)}',editorial_source_hash='${'c'.repeat(64)}'`]) {
    const fixture = await setup();
    try {
      const value = snapshot('r1'); await importPublicProjection(fixture.db, await packet(value));
      fixture.sqlite.exec(`UPDATE products SET ${update}`);
      assert.deepEqual(await keywordSearchRevision(fixture.db, 'button', 60, NOW, 'r1'), []);
      assert.equal((await rollbackPreflight(fixture.db, value, NOW)).ok, false);
    } finally { fixture.close(); }
  }
  const fixture = await setup();
  try {
    const value = snapshot('r1'); await importPublicProjection(fixture.db, await packet(value));
    const expired = new Date(NOW.getTime() + 86400_000);
    assert.deepEqual(await getRevisionProductsByPublicIds(fixture.db, [PUBLIC_ID], expired, 'r1'), []);
    assert.deepEqual(await rollbackPreflight(fixture.db, value, expired), { ok: false, reason: 'release_expired' });
    const tampered = snapshot('r1', 'Edited after publication.');
    assert.equal((await rollbackPreflight(fixture.db, tampered, NOW)).reason, 'release_digest_mismatch');
  } finally { fixture.close(); }
});

function persistentProduct(){
  const old=snapshot('persistent').products[0];
  return {id:old.id,publicId:old.publicId,slug:old.slug,source:old.source,currency:old.currency,
    title:'Desk sound maker',description:'Independently cleared description of a desk sound maker.',
    imageUrl:'/brand/product.svg',affiliateUrl:old.affiliateUrl,price:0,isActive:true,qualityScore:.8,eligibleUntil:null,indexable:false};
}
async function persistentSetup({standalone=false,indexable=false}={}){
  const f=await setup(),base={...persistentProduct(),indexable},value=snapshot('persistent');
  value.products=standalone?[base]:[{...value.products[0],persistent:base}];
  const grants=standalone?rights(base):{...rights(value.products[0]),persistent:rights(base)};
  f.sqlite.prepare('UPDATE products SET public_display_json=?,rights_json=?,eligible_until=?')
    .run(JSON.stringify(value.products[0]),JSON.stringify(grants),value.products[0].eligibleUntil);
  await importPublicProjection(f.db,await packet(value));return{...f,value,base,grants};
}
test('permanent listing survives supplier expiry/unknown availability without renewing semantic eligibility',async()=>{
  for(const standalone of [false,true]){
    const f=await persistentSetup({standalone});try{
      const original=f.sqlite.prepare('SELECT * FROM catalog_public_products').get();
      f.sqlite.exec("UPDATE products SET availability_status='UNKNOWN',availability_checked_at=NULL,last_verified_at=NULL,editorial_status='pending',editorial_source_hash=NULL");
      const late=new Date(NOW.getTime()+40*86400_000);
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'persistent'),[f.base]);
      assert.deepEqual(await getListedRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'persistent'),[f.base]);
      assert.deepEqual(await getRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'persistent'),[]);
      assert.equal((await rollbackPreflight(f.db,f.value,late)).ok,true);
      const query=visibleRevisionCountQuery('persistent',late);assert.equal(Object.values(f.sqlite.prepare(query.sql).get(...query.params))[0],1);
      assert.deepEqual(f.sqlite.prepare('SELECT * FROM catalog_public_products').get(),original);
      assert.doesNotMatch(JSON.stringify(await keywordSearchRevision(f.db,'sound maker',60,late,'persistent')),/media-amazon|Sound Button|persistent/);
      // FTS indexes the cleared identity, not a supplier-only name after expiry.
      assert.deepEqual(await keywordSearchRevision(f.db,'Controlled button heading',60,late,'persistent'),[]);
    }finally{f.close();}
  }
});
test('direct permanent SQL reads use nested base grants while retaining expired merchant root evidence',async()=>{
  const f=await persistentSetup({standalone:true});try{
    const root=Object.fromEntries(Object.entries(rights(snapshot('original-supplier').products[0])).map(([field,value])=>[field,
      {...value,basis:'merchant',observedAt:new Date(NOW.getTime()-2*86400_000).toISOString(),
        expiresAt:new Date(NOW.getTime()-86400_000).toISOString()}]));
    const permission={...root,persistent:rights(f.base)};
    f.sqlite.prepare('UPDATE products SET rights_json=?').run(JSON.stringify(permission));
    const before=f.sqlite.prepare('SELECT * FROM products').get(),late=new Date(NOW.getTime()+40*86400_000);
    assert.deepEqual(await getListedRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'persistent'),[f.base]);
    assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'persistent'),[f.base]);
    assert.deepEqual(await getRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'persistent'),[]);
    const query=visibleRevisionCountQuery('persistent',late);assert.equal(Object.values(f.sqlite.prepare(query.sql).get(...query.params))[0],1);
    assert.equal((await rollbackPreflight(f.db,f.value,late)).ok,true);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM products').get(),before);
    // An explicitly present invalid lane cannot fall back to otherwise valid root grants.
    for(const persistent of [{},{...rights(f.base),title:{...rights(f.base).title,value:'Unapproved'}},'invalid',false,[]]){
      f.sqlite.prepare('UPDATE products SET rights_json=?').run(JSON.stringify({...rights(f.base),persistent}));
      assert.deepEqual(await getListedRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'persistent'),[]);
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'persistent'),[]);
      assert.equal(Object.values(f.sqlite.prepare(query.sql).get(...query.params))[0],0);
    }
  }finally{f.close();}
});
test('permanent listing requires exact current grants/base and preserves genuine operational holds',async()=>{
  for(const mutate of [
    f=>{delete f.grants.persistent;},f=>{f.grants.persistent.title.basis='merchant';},
    f=>{f.grants.persistent.imageUrl.expiresAt=new Date(NOW.getTime()+86400_000).toISOString();},
    f=>{f.grants.persistent.description.value='different';},f=>{f.grants.persistent.title.reference=' \t\n';},
    f=>{f.value.products[0].persistent={...f.base,title:'Changed approved identity'};},
    f=>f.sqlite.exec('UPDATE products SET is_active=0'),f=>f.sqlite.exec("UPDATE products SET duplicate_of_product_id='winner'"),
    f=>f.sqlite.exec('UPDATE products SET quality_score=.1'),f=>f.sqlite.exec("UPDATE products SET source_facts_hash='changed'"),
    f=>f.sqlite.exec("UPDATE products SET editorial_status='blocked'"),f=>f.sqlite.exec("UPDATE products SET editorial_status='needs_review'"),
  ]){
    const f=await persistentSetup();try{
      mutate(f);f.sqlite.prepare('UPDATE products SET public_display_json=?,rights_json=?').run(JSON.stringify(f.value.products[0]),JSON.stringify(f.grants));
      const late=new Date(NOW.getTime()+86400_000);
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'persistent'),[]);
      assert.deepEqual(await getListedRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'persistent'),[]);
      const query=visibleRevisionCountQuery('persistent',late);assert.equal(Object.values(f.sqlite.prepare(query.sql).get(...query.params))[0],0);
    }finally{f.close();}
  }
  const f=await setup();try{
    const value=snapshot('short-invalid');value.products[0]={...value.products[0],persistent:{...persistentProduct(),indexable:true}};
    await assert.rejects(packet(value),/persistent editorial/);
  }finally{f.close();}
});
test('revoked supplier grant falls back to a cleared base, never an unproven nested DTO',async()=>{
  const f=await persistentSetup();try{
    delete f.grants.title;f.sqlite.prepare('UPDATE products SET rights_json=?').run(JSON.stringify(f.grants));
    assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,NOW,'persistent'),[f.base]);
    assert.deepEqual(await getRevisionProductsByPublicIds(f.db,[PUBLIC_ID],NOW,'persistent'),[]);
  }finally{f.close();}
});
test('explicit review holds override standalone and nested identity-only permanent listings',async()=>{
  for(const standalone of [false,true])for(const status of ['blocked','needs_review']){
    const f=await persistentSetup({standalone});try{
      f.sqlite.prepare('UPDATE products SET editorial_status=?').run(status);
      const late=new Date(NOW.getTime()+40*86400_000);
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'persistent'),[]);
      assert.deepEqual(await getListedRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'persistent'),[]);
      assert.equal((await rollbackPreflight(f.db,f.value,late)).ok,false);
      const q=visibleRevisionCountQuery('persistent',late);assert.equal(Object.values(f.sqlite.prepare(q.sql).get(...q.params))[0],0);
    }finally{f.close();}
  }
});
test('indexable permanent bases require substantive cleared text and current reviewed factual agreement',async()=>{
  for(const separator of ['\n\n','\r\n \t\r\n']){
    const base={...persistentProduct(),indexable:true,humorTags:['independent','λ'],editorialWriteup:
      Array(2).fill(Array(48).fill('Specific useful independently authored details.').join(' ')).join(separator)};
    const original={id:base.id,public_id:base.publicId,slug:base.slug,source_facts_hash:HASH,editorial_source_hash:HASH,
      editorial_status:'generated_ready',editorial_quality_score:'0.9000',editorial_writeup:base.editorialWriteup};
    const f=await setup({sourceRecord:original});try{
      const value=snapshot('substantive');value.products[0]={...value.products[0],persistent:base};
      const grants={...rights(value.products[0]),persistent:rights(base)};
      f.sqlite.prepare('UPDATE products SET public_display_json=?,rights_json=?').run(JSON.stringify(value.products[0]),JSON.stringify(grants));
      await importPublicProjection(f.db,await packet(value));const late=new Date(NOW.getTime()+40*86400_000);
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'substantive'),[base]);
      const current={id:base.id,publicId:base.publicId,slug:base.slug,sourceFactsHash:HASH,editorialSourceHash:HASH,
        editorialStatus:'generated_ready',editorialQualityScore:'0.9000',editorialWriteup:base.editorialWriteup};
      f.sqlite.prepare('INSERT INTO catalog_maintenance_products VALUES(?,1,?,NULL,NULL,?)').run(base.id,JSON.stringify(current),'{}');
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'substantive'),[base]);
      for(const delta of [{editorialQualityScore:'0.7999'},{editorialQualityScore:null},{editorialQualityScore:'0.9junk'},
        {editorialWriteup:`${base.editorialWriteup} changed`},{editorialWriteup:null},{editorialSourceHash:'changed'},
        {sourceFactsHash:'changed'},{id:'another-product'},{editorialStatus:'manual_locked'}]){
        f.sqlite.prepare('UPDATE catalog_maintenance_products SET semantic_json=?').run(JSON.stringify({...current,...delta}));
        assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'substantive'),[],JSON.stringify(delta));
        assert.deepEqual(await getListedRevisionProductsByPublicIds(f.db,[PUBLIC_ID],late,'substantive'),[]);
        const q=visibleRevisionCountQuery('substantive',late);assert.equal(Object.values(f.sqlite.prepare(q.sql).get(...q.params))[0],0);
        assert.equal((await rollbackPreflight(f.db,value,late)).ok,false);
      }
      f.sqlite.prepare('UPDATE catalog_maintenance_products SET semantic_json=?').run(JSON.stringify(current));
      delete grants.persistent.humorTags;f.sqlite.prepare('UPDATE products SET rights_json=?').run(JSON.stringify(grants));
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'substantive'),[]);
      f.sqlite.prepare('UPDATE products SET rights_json=?,editorial_status=?').run(JSON.stringify({...grants,persistent:rights(base)}),'pending');
      assert.deepEqual(await keywordSearchRevision(f.db,'sound maker',60,late,'substantive'),[]);
    }finally{f.close();}
  }
});
test('0013 preserves rowids/fields/receipts/FTS/FKs and rolls back an interrupted table swap',async()=>{
  const f=await setup({persistentSchema:false});try{
    await importPublicProjection(f.db,await packet(snapshot('r1')));
    for(const [index,q]of projectionQueries(await packet(snapshot('r2'))).entries())f.sqlite.prepare(index===0
      ?q.sql.replace('(catalog_revision','(rowid,catalog_revision').replace(/VALUES\s*\(/,'VALUES(37,'):q.sql).run(...q.params);
    const state=()=>({rows:f.sqlite.prepare('SELECT rowid,* FROM catalog_public_products ORDER BY rowid').all(),
      receipts:f.sqlite.prepare('SELECT rowid,* FROM catalog_projection_receipts ORDER BY rowid').all(),
      fts:f.sqlite.prepare("SELECT rowid FROM catalog_public_products_fts WHERE catalog_public_products_fts MATCH 'button' ORDER BY rowid").all(),
      fk:f.sqlite.prepare('PRAGMA foreign_key_check').all()});
    const before=state(),migration=await readFile(new URL('../migrations/d1/0013_persistent_public_products.sql',import.meta.url),'utf8');
    f.sqlite.exec('BEGIN');assert.throws(()=>f.sqlite.exec(migration.replace('CREATE INDEX catalog_public_expiry_idx','SELECT missing_column FROM missing_table; CREATE INDEX catalog_public_expiry_idx')));
    f.sqlite.exec('ROLLBACK');assert.deepEqual(state(),before);
    assert.equal(f.sqlite.prepare("PRAGMA table_info('catalog_public_products')").all().find(c=>c.name==='eligible_until').notnull,1);
    f.sqlite.exec('BEGIN');f.sqlite.exec(migration);f.sqlite.exec('COMMIT');assert.deepEqual(state(),before);
    assert.equal(f.sqlite.prepare("PRAGMA table_info('catalog_public_products')").all().find(c=>c.name==='eligible_until').notnull,0);
    assert.throws(()=>f.sqlite.exec("UPDATE catalog_public_products SET title='changed'"),/immutable/);
    assert.throws(()=>f.sqlite.exec('UPDATE catalog_projection_receipts SET product_count=0'),/immutable/);
    const row=projectionQueries(await packet(snapshot('r1')))[0];assert.throws(()=>f.sqlite.prepare(row.sql).run(...row.params),/sealed/);
    const receipt=projectionQueries(await packet(snapshot('incomplete'))).at(-1);assert.throws(()=>f.sqlite.prepare(receipt.sql).run(...receipt.params),/Incomplete/);
    f.sqlite.prepare("INSERT INTO catalog_public_products SELECT 'nullable',public_id,product_id,slug,title,description,tags,source_facts_hash,NULL,public_display_json,display_sha256 FROM catalog_public_products WHERE catalog_revision='r1'").run();
    assert.equal(f.sqlite.prepare("SELECT eligible_until FROM catalog_public_products WHERE catalog_revision='nullable'").get().eligible_until,null);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.close();}
});
