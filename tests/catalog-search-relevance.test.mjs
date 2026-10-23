import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogSearchTerms } from '../lib/catalog/search-terms.ts';
import { keywordSearchRevision } from '../lib/catalog/d1.ts';
import { rankedBrowseProducts } from '../static-site/lib/browse.ts';
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
