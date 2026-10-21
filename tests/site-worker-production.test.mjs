import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function productionEntry(overrides = {}) {
  const data = {
    snapshot: { dataKind: 'catalog', products: [{}] },
    manifest: { sourceMode: 'stupid-production', dataKind: 'catalog', productCount: 1 },
    siteIdentity: { sourceMode: 'stupid-production', origin: 'https://stupid.gifts' },
    ...overrides,
  };
  const adapters = {};
  const dependencies = {
    '../build/stupid-gifts/catalog.snapshot.json': data.snapshot,
    '../build/stupid-gifts/asset-manifest.json': data.manifest,
    '../build/stupid-gifts/feed-plan.json': {},
    '../build/stupid-gifts/release-identity.json': {},
    '../build/stupid-gifts/site-identity.json': data.siteIdentity,
    './site/index.ts': { createSiteWorker: options => options },
    './site/d1-search.ts': { d1SearchAdapters: adapters },
  };
  const source = readFileSync(new URL('../workers/production-entry.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } });
  const commonJs = { exports: {} };
  vm.runInNewContext(outputText, { module: commonJs, exports: commonJs.exports,
    require(name) { if (!Object.hasOwn(dependencies, name)) throw new Error('Unexpected production dependency'); return dependencies[name]; } });
  return { worker: commonJs.exports.default, adapters };
}

test('production entry reuses D1 search with an isolated compiled production budget scope', () => {
  const { worker, adapters } = productionEntry();
  assert.equal(worker.searchAdapters, adapters);
  assert.equal(worker.canonicalOrigin, 'https://stupid.gifts');
  assert.deepEqual(JSON.parse(JSON.stringify(worker.semanticBudgetScope)), { environment: 'production', index: 'stupid-gifts-production' });
});

test('production entry refuses preview identity, fixtures, empty or inconsistent catalog builds', () => {
  for (const overrides of [
    { manifest: { sourceMode: 'preview', dataKind: 'catalog', productCount: 1 } },
    { manifest: { sourceMode: 'stupid-production', dataKind: 'synthetic_fixture', productCount: 1 } },
    { siteIdentity: { sourceMode: 'preview', origin: 'https://stupid.gifts' } },
    { siteIdentity: { sourceMode: 'stupid-production', origin: 'https://www.goose.gifts' } },
    { snapshot: { dataKind: 'synthetic_fixture', products: [{}] } },
    { snapshot: { dataKind: 'catalog', products: [] } },
    { manifest: { sourceMode: 'stupid-production', dataKind: 'catalog', productCount: 2 } },
  ]) assert.throws(() => productionEntry(overrides), /real, nonempty Stupid Gifts release/);
});

test('production configuration isolates resources and exact domains without opening staging or semantic calls', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8'));
  const staging = JSON.parse(readFileSync(new URL('../wrangler.staging.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'stupid-gifts-production'); assert.equal(config.main, 'workers/production-entry.ts');
  assert.equal(config.account_id, staging.account_id);
  assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false);
  assert.equal(config.vars.ENVIRONMENT, 'production'); assert.equal(config.vars.SEMANTIC_SEARCH_ENABLED, 'false');
  assert.deepEqual(config.routes, [{ pattern: 'stupid.gifts', custom_domain: true }, { pattern: 'www.stupid.gifts', custom_domain: true }]);
  assert.deepEqual(config.assets, staging.assets);
  assert.equal(config.d1_databases[0].database_name, 'stupid-gifts-production');
  assert.match(config.d1_databases[0].database_id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.notEqual(config.d1_databases[0].database_id, staging.d1_databases[0].database_id);
  assert.equal(config.vectorize[0].index_name, 'stupid-gifts-production');
  assert.notEqual(config.vectorize[0].index_name, staging.vectorize[0].index_name);
  assert.equal(staging.vars.ENVIRONMENT, 'staging'); assert.equal(staging.routes, undefined);
  assert.equal(staging.main, 'workers/staging-entry.ts');
});
