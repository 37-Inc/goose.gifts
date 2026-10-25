import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogSearchTerms } from '../lib/catalog/search-terms.ts';
import { keywordSearchRevision } from '../lib/catalog/d1.ts';
import { createBrowseRelease, rankedBrowseProducts } from '../static-site/lib/browse.ts';
import { readySnapshotProducts } from '../static-site/lib/selection.ts';
import { createStaticFeedPlan, prepareStaticFeed } from '../workers/site/feed.ts';
import { validateCatalogSnapshot } from '../lib/catalog/snapshot.ts';
import fixture from '../static-site/fixtures/catalog.snapshot.json' with { type: 'json' };
import { snapshotKeywordSearch } from '../workers/site/snapshot-search.ts';
import { createSiteWorker } from '../workers/site/index.ts';

test('long queries discard conversational filler without losing literal short queries or Unicode', async () => {
  assert.deepEqual(catalogSearchTerms('a gift for dad who likes golf'), ['dad', 'golf']);
  assert.deepEqual(catalogSearchTerms('Mugs for my coworkers'), ['mug', 'coworker']);
  assert.deepEqual(catalogSearchTerms('dad who loves grilling'), ['dad', 'grill']);
  assert.deepEqual(catalogSearchTerms('gifts for her'), ['women']);
  assert.deepEqual(catalogSearchTerms('gifts'), ['gift']);
  assert.deepEqual(catalogSearchTerms('café'), ['café']);
  assert.deepEqual(catalogSearchTerms('constructor'), ['constructor']);
  let params;
  const db = { prepare(sql) { assert.match(sql, /bm25/); return { bind(...args) { params = args; return this; }, async all() { return {results: []}; } }; } };
  await keywordSearchRevision(db, 'a gift for dad who likes golf', 36, new Date(), 'test');
  assert.equal(params[0], '"dad"* OR "golf"*');
  await keywordSearchRevision(db, '" OR * NOT /', 36, new Date(), 'test');
  assert.doesNotMatch(params[0], /\* NOT|\/|\bOR\s+\*/);
});

test('cleared snapshot search is database-free, bounded, relevant, and never enables finite supplier data', async () => {
  const p={...fixture.products[0],eligibleUntil:null,indexable:false};
  const products=[
    {...p,id:'filler',title:'A generic gift for everyone',description:'Gifts for people who love gifts.'},
    {...p,id:'grill',title:'Funny Grilling Apron for Dad',description:'A BBQ apron.',humorTags:['barbecue']},
    {...p,id:'mug',title:'Crab Coffee Mug',description:'A ceramic mug.'},
  ];
  const search=snapshotKeywordSearch({...fixture,products}); assert.ok(search);
  assert.equal((await search('a gift for dad who loves grilling',36,new Date(),fixture.catalogRevision))[0].id,'grill');
  assert.deepEqual((await search('mugs',36,new Date(),fixture.catalogRevision)).map(p=>p.id),['mug']);
  assert.deepEqual(await search('no-such-specific-object',36,new Date(),fixture.catalogRevision),[]);
  await assert.rejects(search('mugs',241,new Date(),fixture.catalogRevision),/scope/);
  assert.equal(snapshotKeywordSearch(fixture),null);
});

test('production cleared-catalog search survives unavailable D1 without query or diagnostic writes', async () => {
  const snapshot={...fixture,products:[{...fixture.products[0],eligibleUntil:null,indexable:false,title:'Screaming Goat Desk Toy'}]};
  const forbidden=()=>{throw new Error('Database must not be read or written');};
  const worker=createSiteWorker({snapshot,manifest:{catalogRevision:snapshot.catalogRevision,routes:{},checksums:{}},
    canonicalOrigin:'https://stupid.gifts',searchAdapters:{storage:()=>({keyword:forbidden,byPublicIds:forbidden}),diagnostic:forbidden}});
  const response=await worker.fetch(new Request('https://stupid.gifts/api/search-products?q=goat'),{ENVIRONMENT:'production',SEMANTIC_SEARCH_ENABLED:'false'});
  assert.equal(response.status,200);
  const result=await response.json(); assert.equal(result.results[0].id,snapshot.products[0].id);
  assert.equal(result.searchId,null);
});

test('homepage promotes unusual physical gifts and preserves every catalog entry including weaker variants', () => {
  const p = fixture.products[0];
  const products = [
    {...p,id:'book',title:'Generic Adult Coloring Book',qualityScore:1},
    {...p,id:'goat',title:'Screaming Goat Desk Toy',qualityScore:.8},
    {...p,id:'crab',title:'Red Crab Silicone Spoon Rest',qualityScore:.8},
    {...p,id:'duplicate',title:'Red Crab Silicone Spoon Rest Blue',qualityScore:.8},
  ];
  const before = JSON.stringify(products);
  const snapshot = {...fixture,products};
  const ranked = rankedBrowseProducts(snapshot);
  assert.deepEqual(new Set(ranked.map(p => p.id)), new Set(products.map(p => p.id)));
  assert.ok(ranked.findIndex(p => p.id === 'book') > ranked.findIndex(p => p.id === 'crab'));
  assert.deepEqual(rankedBrowseProducts(structuredClone(snapshot)), ranked);
  assert.equal(JSON.stringify(products), before);
});

const now = Date.parse('2026-10-24T12:00:00.000Z');
const cleared = (id, title, score = .5) => ({ ...fixture.products[0], id, slug: id,
  publicId: `00000000-0000-4000-8000-${String(id.length).padStart(12, '0')}`,
  title, description: `Existing factual description for ${title}.`,
  eligibleUntil: null, indexable: false, qualityScore: score });
const products = [cleared('cleared-goat', 'Screaming Goat Desk Toy'),
  cleared('cleared-crab-spoon', 'Red Crab Silicone Spoon Rest'),
  cleared('cleared-stamp-object', 'Very Official Rubber Stamp', 0)];
const snapshot = validateCatalogSnapshot({ ...fixture, products, heldProducts: [], slugHistory: [] }, new Date(now));

test('approved permanent listings remain in home, Load More and Random without score inflation', () => {
  const before = JSON.stringify(snapshot);
  assert.deepEqual(readySnapshotProducts(snapshot).map(p => p.id), products.map(p => p.id));
  assert.deepEqual(new Set(rankedBrowseProducts(snapshot).map(p => p.id)), new Set(products.map(p => p.id)));
  const browse = createBrowseRelease(snapshot);
  const all = [...browse.opening, ...browse.feed.initial,
    ...browse.shards.filter(s => s.payload.kind === 'feed').flatMap(s => s.payload.products)];
  assert.deepEqual(new Set(all.map(p => p.id)), new Set(products.map(p => p.id)));
  const random = browse.shards.find(s => s.payload.kind === 'random');
  assert.deepEqual(new Set(random.payload.products.map(p => p.id)), new Set(products.map(p => p.id)));
  assert.equal(JSON.stringify(snapshot), before);
  const many = { ...snapshot, products: Array.from({ length: 60 }, (_, i) => ({ ...products[0],
    id: `cleared-${i}`, slug: `cleared-${i}`, title: `Original novelty desk object ${i}`,
    publicId: `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}` })) };
  const full = createBrowseRelease(many);
  assert.ok(full.feed.next);
  assert.equal(new Set([...full.opening, ...full.feed.initial,
    ...full.shards.filter(s => s.payload.kind === 'feed').flatMap(s => s.payload.products)].map(p => p.id)).size, 60);
});

test('the compatibility feed includes permanent low-score listings but retains the finite quality gate', () => {
  const finite = { ...products[0], id: 'finite-unapproved', slug: 'finite-unapproved',
    eligibleUntil: new Date(now + 60000).toISOString() };
  const input = { ...snapshot, products: [...products, finite] };
  const digest = 'a'.repeat(64), plan = createStaticFeedPlan(input, digest, now);
  const feed = prepareStaticFeed(input, plan, digest);
  const result = feed.select('daily', 36, new Set(), now);
  assert.deepEqual(new Set(result.products.map(p => p.id)), new Set(products.map(p => p.id)));
  assert.deepEqual(readySnapshotProducts(input, now).map(p => p.id), products.map(p => p.id));
});

test('permanent low-score gifts stay searchable and detail routes retain exact product bodies', async () => {
  const forbidden = () => { throw Error('No database, merchant or model call'); };
  const routes = Object.fromEntries(products.map(p => [`/gifts/${p.slug}`, {
    assetPath: `/gifts/${p.slug}.html`, safeAssetPath: '/safe/product.html',
    eligibleUntil: null, indexable: false, state: 'ready',
  }]));
  const worker = createSiteWorker({ snapshot, manifest: { catalogRevision: snapshot.catalogRevision, routes, checksums: {} },
    canonicalOrigin: 'https://stupid.gifts', now: () => now,
    searchAdapters: { storage: () => ({ keyword: forbidden, byPublicIds: forbidden }), diagnostic: forbidden } });
  const env = { ENVIRONMENT: 'production', SEMANTIC_SEARCH_ENABLED: 'false', ASSETS: { async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const product = products.find(p => pathname === `/gifts/${p.slug}.html`);
    return new Response(product ? product.description : 'missing', { status: product ? 200 : 404 });
  } } };
  for (const product of products) {
    const query = product.title.split(' ')[0];
    const response = await worker.fetch(new Request(`https://stupid.gifts/api/search-products?q=${query}`), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.results.some(p => p.id === product.id && p.description === product.description), product.id);
    assert.equal(body.searchId, null);
    const detail = await worker.fetch(new Request(`https://stupid.gifts/gifts/${product.slug}`), env);
    assert.equal(detail.status, 200);
    assert.equal(await detail.text(), product.description);
  }
});
