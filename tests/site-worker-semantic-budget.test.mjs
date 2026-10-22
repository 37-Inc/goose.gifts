import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createSearchHandler } from '../workers/site/search.ts';
import { reserveSemanticSearch, semanticTokenUpperBound } from '../workers/site/semantic-budget.ts';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const SCOPE = { environment: 'staging', index: 'synthetic-shared-index' };
const product = (id = 'one') => ({ id, publicId: `public-${id}`, slug: id, title: 'Funny Fart Button', description: 'A ridiculous gift.',
  imageUrl: '/brand/button.svg', affiliateUrl: 'https://www.amazon.com/dp/B123456789?tag=test-20', source: 'amazon', currency: 'USD',
  price: 0, isActive: true, qualityScore: .8, eligibleUntil: '2027-01-01T00:00:00.000Z' });

async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../migrations/d1/0006_semantic_search_budget.sql', import.meta.url), 'utf8'));
  sqlite.exec(await readFile(new URL('../migrations/d1/0009_catalog_mutation_fence.sql',import.meta.url),'utf8'));
  let serverNow = NOW; let fail = ''; let receipt = true; let delay = 0;
  sqlite.function('date', { varargs: true }, (...args) => {
    assert.equal(args[0], 'now'); assert.ok(args.length === 1 || args[1] === '-30 days');
    return new Date(serverNow - (args.length === 2 ? 30 * 86400000 : 0)).toISOString().slice(0, 10);
  });
  const calls = { embed: [], vector: 0, keyword: 0, sql: [] };
  const makeDb = () => ({ prepare(sql) { let values = []; return {
    bind(...params) { values = params; return this; },
    async run() {
      calls.sql.push(sql);
      if (fail && sql.startsWith(fail)) throw new Error('PRIVATE_DB_ERROR');
      if (delay && sql.startsWith('INSERT')) await new Promise(resolve => setTimeout(resolve, delay));
      const result = sqlite.prepare(sql).run(...values);
      return receipt ? { success: true, meta: { changes: result.changes } } : { success: true };
    },
  }; } });
  function handler(options = {}) {
    const env = { ENVIRONMENT: 'staging', SEMANTIC_SEARCH_ENABLED: 'true', SEMANTIC_SEARCH_DAILY_REQUEST_CAP: '100',
      SEMANTIC_SEARCH_DAILY_TOKEN_CAP: '100000', VECTORIZE: { async query() { calls.vector++; return { matches: [{ id: 'public-one', score: .9 }] }; } }, ...options.env };
    const db = makeDb();
    const search = createSearchHandler({ catalogRevision: options.revision || 'r1', semanticBudgetScope: SCOPE,
      now: () => NOW, providerTimeoutMs: 20, adapters: {
        storage: () => ({ async byPublicIds() { return [product()]; }, async keyword() { calls.keyword++; return [product('keyword')]; } }),
        reserveSemantic: (scope, tokens, environment) => reserveSemanticSearch(db, scope, environment, tokens),
        async embed(query) { calls.embed.push(query); return Array(1536).fill(.1); }, ...options.adapters,
      }, ...options.config });
    return { env, request: (query = 'funny button', extra = '') => search(new Request(`https://example.test/api/search-products?q=${encodeURIComponent(query)}${extra}`,
      { headers: { 'CF-Connecting-IP': '192.0.2.77', ENVIRONMENT: 'production' } }), env) };
  }
  return { sqlite, calls, handler, setServerNow(value) { serverNow = value; }, setFailure(value) { fail = value; },
    setUnknownReceipt() { receipt = false; }, setDelay(value) { delay = value; },
    rows: () => sqlite.prepare('SELECT * FROM semantic_search_budgets ORDER BY utc_day,index_scope').all().map(row => ({ ...row })), close: () => sqlite.close() };
}
const mode = async response => (await response.json()).results[0]?.matchType;

test('parallel independent handlers and catalog revisions share one atomic daily request cap', async () => {
  const f = await setup();
  try {
    const responses = await Promise.all(Array.from({ length: 24 }, (_, index) => f.handler({ revision: `r${index}`,
      env: { SEMANTIC_SEARCH_DAILY_REQUEST_CAP: '3' } }).request(`funny button ${index}`, '&environment=production&index_scope=attacker&utc_day=2099-01-01')));
    assert.equal((await Promise.all(responses.map(mode))).filter(value => value === 'semantic').length, 3);
    assert.equal(f.calls.embed.length, 3); assert.equal(f.calls.vector, 3);
    assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].requests_reserved, 3);
    assert.equal(f.rows()[0].environment, 'staging'); assert.equal(f.rows()[0].index_scope, SCOPE.index);
    assert.doesNotMatch(JSON.stringify(f.rows()), /funny button|192\.0\.2|r23|attacker|2099/);
  } finally { f.close(); }
});

test('token allocation uses exact normalized UTF-8 input plus fixed overhead and refuses before either provider', async () => {
  const f = await setup();
  try {
    const input = '  Ａ   お誕生日 🔥  '; const normalized = 'A お誕生日 🔥';
    const tokens = new TextEncoder().encode(normalized).byteLength + 16;
    assert.equal(semanticTokenUpperBound(normalized), tokens);
    const h = f.handler({ env: { SEMANTIC_SEARCH_DAILY_TOKEN_CAP: String(tokens) } });
    assert.equal(await mode(await h.request(input)), 'semantic');
    assert.deepEqual(f.calls.embed, [normalized]); assert.equal(f.rows()[0].tokens_reserved, tokens);
    assert.equal(await mode(await h.request('different gift')), 'keyword');
    assert.equal(f.calls.embed.length, 1); assert.equal(f.calls.vector, 1); assert.equal(f.rows()[0].requests_reserved, 1);
  } finally { f.close(); }
});

test('UTC day rollover uses D1 execution clock, never client/isolate clock or URL period', async () => {
  const f = await setup();
  try {
    f.setServerNow(Date.parse('2026-10-20T23:59:59.999Z'));
    const config = { env: { SEMANTIC_SEARCH_DAILY_REQUEST_CAP: '1' } };
    assert.equal(await mode(await f.handler(config).request('first gift')), 'semantic');
    assert.equal(await mode(await f.handler(config).request('second gift', '&day=2030-01-01')), 'keyword');
    f.setServerNow(Date.parse('2026-10-21T00:00:00.000Z'));
    assert.equal(await mode(await f.handler(config).request('second gift')), 'semantic');
    assert.deepEqual(f.rows().map(row => row.utc_day), ['2026-10-20', '2026-10-21']);
    assert.equal(f.calls.embed.length, 2);
  } finally { f.close(); }
});

test('missing/malformed caps, scope/adapter, wrong environment and default-off all use keyword without reservation', async () => {
  for (const options of [
    ...[undefined, '', '0', '-1', '1.1', '1e2', '01', '100001'].map(value => ({ env: { SEMANTIC_SEARCH_DAILY_REQUEST_CAP: value } })),
    ...[undefined, '', '0', '100000001'].map(value => ({ env: { SEMANTIC_SEARCH_DAILY_TOKEN_CAP: value } })),
    { env: { SEMANTIC_SEARCH_ENABLED: undefined } }, { env: { SEMANTIC_SEARCH_ENABLED: 'false' } },
    { env: { ENVIRONMENT: 'production' } }, { env: { ENVIRONMENT: 'preview' } },
    { config: { semanticBudgetScope: undefined } }, { config: { semanticBudgetScope: { ...SCOPE, index: '../unsafe' } } },
    { adapters: { reserveSemantic: undefined } }, { adapters: { embed: undefined } },
  ]) {
    const f = await setup();
    try {
      assert.equal(await mode(await f.handler(options).request()), 'keyword');
      assert.equal(f.calls.embed.length, 0); assert.equal(f.calls.vector, 0); assert.equal(f.rows().length, 0); assert.equal(f.calls.sql.length, 0);
    } finally { f.close(); }
  }
});

test('day caps are frozen; lowering or mixed/higher configuration fails closed instead of resetting counters', async () => {
  const f = await setup();
  try {
    const make = cap => f.handler({ env: { SEMANTIC_SEARCH_DAILY_REQUEST_CAP: cap } });
    assert.equal(await mode(await make('2').request('first gift')), 'semantic');
    assert.equal(await mode(await make('1').request('lowered gift')), 'keyword');
    assert.equal(await mode(await make('3').request('raised gift')), 'keyword');
    assert.equal(await mode(await make('2').request('second gift')), 'semantic');
    assert.equal(await mode(await make('2').request('third gift')), 'keyword');
    assert.equal(f.rows()[0].request_cap, 2); assert.equal(f.rows()[0].requests_reserved, 2);
  } finally { f.close(); }
});

test('counter errors, unknown write receipts and reservation timeouts never authorize paid calls', async () => {
  for (const failure of ['DELETE', 'INSERT', 'unknown', 'timeout', 'missing-table']) {
    const f = await setup();
    try {
      if (failure === 'unknown') f.setUnknownReceipt();
      else if (failure === 'timeout') f.setDelay(40);
      else if (failure === 'missing-table') f.sqlite.exec('DROP TABLE semantic_search_budgets');
      else f.setFailure(failure);
      const response = await f.handler().request(); assert.equal(response.status, 200); assert.equal(await mode(response), 'keyword');
      assert.equal(f.calls.embed.length, 0); assert.equal(f.calls.vector, 0);
      if (failure === 'timeout') { await new Promise(resolve => setTimeout(resolve, 45)); assert.equal(f.calls.embed.length, 0); assert.equal(f.rows()[0].requests_reserved, 1); }
    } finally { f.close(); }
  }
});

test('provider failure consumes reservation without refund or retry; fallback remains usable', async () => {
  for (const provider of ['embedding', 'vector']) {
    const f = await setup(); let attempts = 0;
    try {
      const options = { env: { SEMANTIC_SEARCH_DAILY_REQUEST_CAP: '1' }, adapters: {
        async embed() { attempts++; if (provider === 'embedding') throw new Error('PRIVATE_PROVIDER_BODY'); return Array(1536).fill(.1); },
      } };
      if (provider === 'vector') options.env.VECTORIZE = { async query() { f.calls.vector++; throw new Error('PRIVATE_VECTOR_BODY'); } };
      assert.equal(await mode(await f.handler(options).request('first gift')), 'keyword');
      assert.equal(await mode(await f.handler(options).request('second gift')), 'keyword');
      assert.equal(attempts, 1); assert.equal(f.rows()[0].requests_reserved, 1);
      assert.doesNotMatch(JSON.stringify(f.rows()), /PRIVATE/);
    } finally { f.close(); }
  }
});

test('cache hits reserve nothing, while kill switch and malformed/changed caps cannot reuse semantic cache', async () => {
  const f = await setup();
  try {
    const h = f.handler();
    assert.equal(await mode(await h.request('Funny Button')), 'semantic');
    assert.equal(await mode(await h.request('  funny   button  ')), 'semantic');
    assert.equal(f.rows()[0].requests_reserved, 1); assert.equal(f.calls.embed.length, 1);
    h.env.SEMANTIC_SEARCH_ENABLED = 'false'; assert.equal(await mode(await h.request('funny button')), 'keyword');
    h.env.SEMANTIC_SEARCH_ENABLED = 'true'; h.env.SEMANTIC_SEARCH_DAILY_REQUEST_CAP = 'invalid';
    assert.equal(await mode(await h.request('funny button')), 'keyword');
    h.env.SEMANTIC_SEARCH_DAILY_REQUEST_CAP = '99'; assert.equal(await mode(await h.request('funny button')), 'keyword');
    assert.equal(f.rows()[0].requests_reserved, 1); assert.equal(f.calls.embed.length, 1);
  } finally { f.close(); }
});

test('aggregate retention cleanup is indexed and bounded to32 old rows per cache miss', async () => {
  const f = await setup();
  try {
    const insert = f.sqlite.prepare(`INSERT INTO semantic_search_budgets VALUES('staging',?,'2026-01-01',1,1,1,1)`);
    for (let index = 0; index < 40; index++) insert.run(`old-${index}`);
    await f.handler().request('first gift');
    assert.equal(f.rows().filter(row => row.utc_day === '2026-01-01').length, 8);
    await f.handler().request('second gift');
    assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].requests_reserved, 2);
    assert.match(f.calls.sql[0], /ORDER BY utc_day LIMIT 32/);
    assert.match(JSON.stringify(f.sqlite.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM semantic_search_budgets WHERE utc_day<date('now','-30 days') ORDER BY utc_day LIMIT 32").all()), /SEARCH.+semantic_search_budget_expiry_idx/);
  } finally { f.close(); }
});
