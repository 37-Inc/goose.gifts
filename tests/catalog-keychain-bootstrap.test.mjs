import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, chmod, symlink, rm, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CATALOG_KEYCHAIN_ACCOUNT, CATALOG_KEYCHAIN_SERVICES, readProtectedSource,
  loadCatalogKeychainSources, catalogKeychainBootstrap,
} from '../scripts/ops/bootstrap-catalog-keychain.mjs';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const values = ['FIXTURE_ID', 'FIXTURE_SECRET', 'sk-FIXTURE_OPENAI', 'FIXTURE_STAGING'];
const sources = () => ({ catalog: { associateTag: 'fixture-only-20', marketplace: 'www.amazon.com' }, amazonVersion: '2.1',
  entries: CATALOG_KEYCHAIN_SERVICES.map((service, index) => ({ service, value: values[index] })) });
const fixtureFiles = (overrides = {}) => ({
  '/fixture/.codex/worktrees/goose-migration-integration/goose.gifts/.env.local': "AMAZON_ASSOCIATE_TAG='fixture-only-20'\nOPENAI_API_KEY='sk-FIXTURE_OPENAI'\nAMAZON_CREATORS_CREDENTIAL_ID='[sensitive]'\n",
  '/fixture/.codex/secrets/goose.gifts/amazon-creators-api-credentials.csv': 'Credential Id,Secret,Version\r\nFIXTURE_ID,FIXTURE_SECRET,2.1\r\n',
  '/fixture/.codex/private/goose-gifts-migration/staging-secrets.json': '{"STAGING_AUTH_SECRET":"FIXTURE_STAGING"}',
  ...overrides,
});
async function load(files = fixtureFiles()) {
  return loadCatalogKeychainSources(async (path, max) => {
    assert.ok(path in files); assert.ok(!max || Buffer.byteLength(files[path]) <= max); return files[path];
  }, '/fixture');
}
const noWrites = () => { assert.fail('Read-only mode attempted a write'); };
const dependencies = (overrides = {}) => ({ platform: 'darwin', loadSources: sources,
  itemExists: async () => false, readItem: async () => { assert.fail('Missing item read'); }, addAbsentItems: noWrites, ...overrides });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => assert.fail('Provider access is forbidden');
test.after(() => { globalThis.fetch = originalFetch; });

test('protected authorized sources reuse dotenv and CSV parsing, preserve one tag and select no ambient values', async () => {
  const prior = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'WRONG_AMBIENT_FIXTURE';
  try { assert.deepEqual(await load(), sources()); }
  finally { if (prior === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior; }
  const files = fixtureFiles();
  files['/fixture/.codex/worktrees/goose-migration-integration/goose.gifts/.env.local'] +=
    'AMAZON_CREATORS_CREDENTIAL_ID=FIXTURE_ID\nAMAZON_CREATORS_CREDENTIAL_SECRET=FIXTURE_SECRET\nAMAZON_CREATORS_CREDENTIAL_VERSION=2.1\n';
  delete files['/fixture/.codex/secrets/goose.gifts/amazon-creators-api-credentials.csv'];
  assert.deepEqual(await load(files), sources());
});
test('invalid tag, marketplace, source bundle, placeholders, control characters and staging shape fail before lookup', async () => {
  const envPath = '/fixture/.codex/worktrees/goose-migration-integration/goose.gifts/.env.local';
  const csvPath = '/fixture/.codex/secrets/goose.gifts/amazon-creators-api-credentials.csv';
  const stagingPath = '/fixture/.codex/private/goose-gifts-migration/staging-secrets.json';
  for (const [path, value, error] of [
    [envPath, 'OPENAI_API_KEY=fixture', /associate_tag/],
    [envPath, 'AMAZON_ASSOCIATE_TAG=bad tag\nOPENAI_API_KEY=fixture', /associate_tag/],
    [envPath, 'AMAZON_ASSOCIATE_TAG=fixture-20\nAMAZON_MARKETPLACE=www.amazon.co.uk', /marketplace/],
    [envPath, "AMAZON_ASSOCIATE_TAG='fixture-20'\nOPENAI_API_KEY='a'\\''b'", /source_encoding/],
    [envPath, 'AMAZON_ASSOCIATE_TAG=fixture-20\nOPENAI_API_KEY=[encrypted]', /source_value/],
    [envPath, 'AMAZON_ASSOCIATE_TAG=fixture-20\nOPENAI_API_KEY=fixture\nAMAZON_CREATORS_CREDENTIAL_ID=DIFFERENT', /amazon_source_conflict/],
    [csvPath, 'Credential Id,Secret,Version\nFIXTURE_ID,FIXTURE_SECRET,9.9', /amazon_version/],
    [csvPath, 'Credential Id,Secret, Secret\nFIXTURE_ID,FIXTURE_SECRET,2.1', /amazon_csv/],
    [csvPath, 'Credential Id,Secret,Version\nFIXTURE_ID,FIXTURE_SECRET,2.1\nANOTHER,ROW,2.1', /amazon_csv/],
    [stagingPath, 'not JSON PRIVATE_VALUE', /staging_source/],
    [stagingPath, '{"STAGING_AUTH_SECRET":"fixture","OTHER":"private"}', /staging_source/],
    [stagingPath, '{"STAGING_AUTH_SECRET":"line\\nprivate"}', /source_value/],
    [stagingPath, JSON.stringify({ STAGING_AUTH_SECRET: 'x'.repeat(4097) }), /source_value/],
  ]) await assert.rejects(load(fixtureFiles({ [path]: value })), error);
});
test('protected file reader refuses unsafe modes, links, oversized or missing files without leaking content', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'goose-keychain-source-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'fixture');
  await writeFile(path, 'PRIVATE_FIXTURE', { mode: 0o600 });
  assert.equal(await readProtectedSource(path), 'PRIVATE_FIXTURE');
  for (const mode of [0o644, 0o620, 0o604]) {
    await chmod(path, mode); await assert.rejects(readProtectedSource(path), /^Error: catalog_keychain_source_protection$/);
  }
  await chmod(path, 0o600); await assert.rejects(readProtectedSource(path, 2), /source_protection/);
  const linked = join(directory, 'linked'); await symlink(path, linked);
  await assert.rejects(readProtectedSource(linked), /source_protection/);
  await assert.rejects(readProtectedSource(directory), /source_protection/);
  await assert.rejects(readProtectedSource(join(directory, 'absent')), /^Error: catalog_keychain_source_unavailable$/);
});
test('default plan and verify never compile/write; missing items are distinct from a passing verification', async () => {
  for (const [mode, status] of [[undefined, 'planned_no_writes'], ['verify', 'missing_items']]) {
    const result = await catalogKeychainBootstrap(mode, dependencies());
    assert.equal(result.status, status); assert.equal(result.currentBootstrapChanged, false); assert.equal(result.providerCalls, 0);
    assert.ok(result.items.every(item => item.status === 'absent' && item.account === 'goose.gifts'));
    assert.match(result.cloudflareCredential, /choose_reviewed_keychain_or_wrangler_oauth_reference/);
    assert.match(result.operatorConfiguration, /not_created/);
    for (const secret of values) assert.ok(!JSON.stringify(result).includes(secret));
  }
});
test('complete set is checked before any seed; mismatching or unreadable items never get replaced', async () => {
  for (const readItem of [async () => 'DIFFERENT_PRIVATE_FIXTURE', async () => { throw new Error('PRIVATE_PROVIDER_ERROR'); }]) {
    await assert.rejects(catalogKeychainBootstrap('seed', dependencies({
      itemExists: async service => service === CATALOG_KEYCHAIN_SERVICES[3], readItem,
    })), /^Error: catalog_keychain_existing_(mismatch|unreadable)$/);
  }
  await assert.rejects(catalogKeychainBootstrap('seed', dependencies({ itemExists: async () => { throw new Error('catalog_keychain_lookup_unavailable'); } })), /lookup_unavailable/);
});
test('explicit seed adds only missing fixed items then independently reads all four through resolver seam', async () => {
  const stored = new Map([[CATALOG_KEYCHAIN_SERVICES[0], values[0]]]);
  let adds = 0, reads = 0;
  const result = await catalogKeychainBootstrap('seed', dependencies({
    itemExists: async service => stored.has(service),
    readItem: async ref => { reads++; assert.equal(ref.account, CATALOG_KEYCHAIN_ACCOUNT); return stored.get(ref.service); },
    addAbsentItems: async entries => {
      adds++; assert.deepEqual(entries, sources().entries.slice(1));
      for (const entry of entries) stored.set(entry.service, entry.value);
      return { status: 'created', errorCode: 'none', created: entries.map(entry => entry.service) };
    },
  }));
  assert.equal(adds, 1); assert.equal(reads, 5); assert.equal(result.status, 'local_items_verified');
  assert.ok(result.items.every(item => item.status === 'matches_source'));
  const existing = await catalogKeychainBootstrap('seed', dependencies({ itemExists: async () => true,
    readItem: async ref => stored.get(ref.service) }));
  assert.equal(existing.status, 'local_items_verified');
});
test('race/partial creation requires review without deletion, retry or a false verification receipt', async () => {
  let calls = 0;
  for (const created of [[], [CATALOG_KEYCHAIN_SERVICES[0]]]) {
    const result = await catalogKeychainBootstrap('seed', dependencies({ addAbsentItems: async () => {
      calls++; return { status: 'requires_review', errorCode: 'keychain_duplicate', created };
    } }));
    assert.equal(result.status, 'requires_review'); assert.deepEqual(result.created, created);
    assert.equal(result.errorCode, 'keychain_duplicate');
  }
  assert.equal(calls, 2);
  await assert.rejects(catalogKeychainBootstrap('seed', dependencies({
    addAbsentItems: async entries => ({ status: 'created', errorCode: 'none', created: entries.map(entry => entry.service) }),
    readItem: async () => 'WRONG_VALUE',
  })), /^Error: catalog_keychain_verification_mismatch$/);
});
test('verify is separate, compares existing values, and never repairs access', async () => {
  const report = await catalogKeychainBootstrap('verify', dependencies({ itemExists: async () => true,
    readItem: async ref => values[CATALOG_KEYCHAIN_SERVICES.indexOf(ref.service)] }));
  assert.equal(report.status, 'local_items_verified');
  await assert.rejects(catalogKeychainBootstrap('arbitrary', dependencies()), /arguments/);
  await assert.rejects(catalogKeychainBootstrap('seed', dependencies({ platform: 'linux' })), /macos_required/);
});
test('native boundary contains no overwrite/unlock/any-app ACL and passes values only through the bounded stdin pipe', async () => {
  const node = await readFile(new URL('../scripts/ops/bootstrap-catalog-keychain.mjs', import.meta.url), 'utf8');
  const swift = await readFile(new URL('../scripts/ops/catalog-keychain-add.swift', import.meta.url), 'utf8');
  for (const source of [node, swift]) assert.doesNotMatch(source, /SecItemUpdate\(|SecKeychainUnlock\(|set-generic-password-partition-list|add-generic-password/);
  assert.match(node, /spawn\(binary, \[\], \{ env: childEnv\(\)/);
  assert.match(node, /child\.stdin\.end\(body\)/);
  assert.match(node, /HOME: homedir\(\), PATH: '\/usr\/bin:\/bin'/);
  assert.match(swift, /SecAccessCreate\(service as CFString, \[trusted\] as CFArray/);
  assert.match(swift, /SecTrustedApplicationCreateFromPath\("\/usr\/bin\/security"/);
  assert.match(swift, /SecKeychainSetUserInteractionAllowed\(false\)/);
  for (const service of CATALOG_KEYCHAIN_SERVICES) assert.ok(swift.includes(`"${service}"`));
  assert.ok(!swift.includes('goose.gifts.CLOUDFLARE_API_TOKEN'));
});
test('Swift compiles; invalid schema/allowlist input exits before accessing Keychain (no valid seed is executed)', { skip: process.platform !== 'darwin' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'goose-keychain-compile-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, 'helper');
  await run('/usr/bin/xcrun', ['swiftc', new URL('scripts/ops/catalog-keychain-add.swift', root).pathname, '-o', binary], { timeout: 60000 });
  const { spawnSync } = await import('node:child_process');
  for (const payload of [
    {}, { schemaVersion: true, entries: [] }, { schemaVersion: 1, entries: [], unknown: true },
    { schemaVersion: 1, entries: [{ service: 'goose.gifts.CLOUDFLARE_API_TOKEN', value: 'fixture' }] },
    { schemaVersion: 1, entries: [{ service: CATALOG_KEYCHAIN_SERVICES[0], account: 'OTHER', value: 'fixture' }] },
    { schemaVersion: 1, entries: [{ service: CATALOG_KEYCHAIN_SERVICES[0], value: 'fixture\n' }] },
    { schemaVersion: 1, entries: [{ service: CATALOG_KEYCHAIN_SERVICES[0], value: '[encrypted]' }] },
    { schemaVersion: 1, entries: Array(2).fill({ service: CATALOG_KEYCHAIN_SERVICES[0], value: 'fixture' }) },
  ]) {
    const result = spawnSync(binary, [], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { created: [], errorCode: 'keychain_input', status: 'requires_review' });
  }
});
