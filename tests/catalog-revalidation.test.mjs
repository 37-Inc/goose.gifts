import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { getProductsForRevalidation } from '../scripts/ops/prefetch-catalog.mjs';

test('revalidation uses one bounded query without embeddings or catalog writes', async () => {
  let calls = 0;
  for (const limit of [1, 2, 5, 25, 50, 100]) {
    await getProductsForRevalidation(limit, 30, async (text, values) => {
      calls += 1;
      assert.equal(values[0], limit);
      assert.equal(values[2], 21);
      assert.equal(values[3] + values[4], limit);
      assert.equal(values[4], limit > 1 ? Math.max(1, Math.floor(limit / 5)) : 0);
      assert.equal((text.match(/LIMIT \$1/g) || []).length, 1);
      assert.doesNotMatch(text, /embedding|\b(?:INSERT|UPDATE|DELETE)\b/i);
      return { rows: [] };
    });
  }
  assert.equal(calls, 6);
  await getProductsForRevalidation(50, 14, async (_text, values) => {
    assert.equal(values[2], 14);
    return { rows: [] };
  });
});

// Real SQL regression tests use an isolated, socket-only local PostgreSQL.
// No production credentials, network listener, provider usage or stored rows.
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const pgBin = pgConfig.status === 0 ? pgConfig.stdout.trim() : '';
const hasPostgres = process.getuid?.() !== 0
  && ['initdb', 'pg_ctl', 'psql'].every((bin) => fs.existsSync(path.join(pgBin, bin)));
const sqlTest = { skip: hasPostgres ? false : 'Local PostgreSQL binaries unavailable' };
let directory;
let started = false;
before(() => {
  if (!hasPostgres) return;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-revalidation-test-'));
  const data = path.join(directory, 'data');
  execFileSync(path.join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-sync'], { stdio: 'ignore' });
  execFileSync(path.join(pgBin, 'pg_ctl'), [
    '-D', data, '-l', path.join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -p 54883 -c listen_addresses=''`, '-w', 'start',
  ], { stdio: 'ignore' });
  started = true;
});
after(() => {
  try {
    if (started) execFileSync(path.join(pgBin, 'pg_ctl'), ['-D', path.join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  } finally {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

const now = new Date('2026-10-03T12:00:00Z');
const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
function product(number, overrides = {}) {
  const id = `B${String(number).padStart(9, '0')}`;
  return {
    id, slug: `gift-${id}`, title: 'Verified gift', source: 'amazon', is_active: true,
    image_url: 'https://example.test/product.jpg', availability_status: 'IN_STOCK',
    availability_checked_at: daysAgo(21), last_verified_at: daysAgo(21), updated_at: daysAgo(21),
    editorial_status: 'generated_ready', editorial_quality_score: 0.9,
    source_facts_hash: 'same', editorial_source_hash: 'same',
    editorial_writeup: `${'specific product fact '.repeat(50)}\n\n${'honest gift context '.repeat(50)}`,
    ...overrides,
  };
}
async function select(products, limit = 50, staleDays = 30) {
  return getProductsForRevalidation(limit, staleDays, async (text, values) => {
    const fixture = `products AS (
      SELECT * FROM JSONB_TO_RECORDSET($fixture$${JSON.stringify(products)}$fixture$::jsonb) AS fixture(
        id text, slug text, title text, price numeric, currency text, image_url text,
        affiliate_url text, source text, source_query text, humor_tags text[], punny_title text,
        witty_description text, quality_score numeric, rating numeric, review_count integer,
        is_active boolean, last_verified_at timestamp, updated_at timestamp, editorial_writeup text,
        source_facts jsonb, source_facts_hash text, editorial_source_hash text,
        availability_status text, availability_checked_at timestamp, editorial_status text,
        editorial_quality_score numeric, editorial_model text, editorial_prompt_version text,
        editorial_generated_at timestamp, editorial_block_reason text, duplicate_of_product_id text
      ))`;
    const query = text.replace(/WITH/, `WITH ${fixture},`)
      .replace(/NOW\(\)/g, `'${now.toISOString()}'::timestamp`)
      .replace(/\$(\d+)/g, (_match, index) => String(values[Number(index) - 1]));
    const output = execFileSync(path.join(pgBin, 'psql'), [
      '-h', directory, '-p', '54883', '-U', 'postgres', '-d', 'postgres',
      '-XAt', '-v', 'ON_ERROR_STOP=1',
    ], { input: `SELECT COALESCE(JSONB_AGG(row), '[]') FROM (${query}) row;`, encoding: 'utf8' });
    return { rows: JSON.parse(output) };
  });
}

test('published pages beat thousands of older legacy rows without exceeding 50 or starving legacy', sqlTest, async () => {
  const published = Array.from({ length: 45 }, (_, index) => product(index + 1));
  const legacy = Array.from({ length: 3150 }, (_, index) => product(index + 100, {
    editorial_status: 'pending', last_verified_at: null,
  }));
  const selected = await select([...legacy, ...published]);
  assert.equal(selected.length, 50);
  assert.deepEqual(selected.slice(0, 40).map((row) => row.id), published.slice(0, 40).map((row) => row.id));
  assert.equal(selected.filter((row) => row.editorial_status === 'pending').length, 10);
  assert.equal(new Set(selected.map((row) => row.id)).size, 50);
  assert.deepEqual(await select([...published, ...legacy].reverse()), selected);
});

test('unused lane slots are reused and small limits remain exact', sqlTest, async () => {
  const published = Array.from({ length: 60 }, (_, index) => product(index + 1));
  const legacy = Array.from({ length: 60 }, (_, index) => product(index + 100, {
    editorial_status: 'pending', last_verified_at: null,
  }));
  assert.equal((await select(published)).length, 50);
  assert.equal((await select(legacy)).length, 50);
  assert.equal((await select([...published.slice(0, 2), ...legacy])).length, 50);
  for (const limit of [1, 2, 5]) assert.equal((await select([...published, ...legacy], limit)).length, limit);
  assert.deepEqual(await select([]), []);
});

test('the published 21-day boundary uses availability verification with last-verified fallback', sqlTest, async () => {
  const selected = await select([
    product(1, { availability_checked_at: daysAgo(21 - 1 / 86_400_000), last_verified_at: null }),
    product(2),
    product(3, { availability_checked_at: null }),
    product(4, { availability_checked_at: daysAgo(2), last_verified_at: daysAgo(90) }),
    product(5, { availability_checked_at: daysAgo(35), last_verified_at: daysAgo(35) }),
  ]);
  assert.deepEqual(selected.map((row) => row.id), [product(5).id, product(2).id, product(3).id]);
});

test('legacy keeps its 30-day boundary and held/inactive/duplicate products get no priority', sqlTest, async () => {
  const held = [
    { editorial_status: 'needs_review' }, { editorial_status: 'stale' },
    { editorial_status: 'blocked' }, { availability_status: 'UNKNOWN' },
    { availability_status: 'UNAVAILABLE' }, { duplicate_of_product_id: 'winner' },
    { editorial_source_hash: 'changed' }, { editorial_quality_score: 0.7 },
    { editorial_writeup: 'too short' }, { editorial_status: null },
  ].map((override, index) => product(index + 100, {
    ...override, last_verified_at: daysAgo(30),
  }));
  const published = Array.from({ length: 45 }, (_, index) => product(index + 1));
  const selected = await select([
    ...held, ...published,
    product(300, { editorial_status: 'pending', last_verified_at: daysAgo(30 - 1 / 86_400_000) }),
    product(301, { is_active: false, last_verified_at: null }),
    product(302, { source: 'etsy', last_verified_at: null }),
  ]);
  assert.deepEqual(selected.slice(0, 40).map((row) => row.id), published.slice(0, 40).map((row) => row.id));
  assert.deepEqual(selected.slice(40).map((row) => row.id), held.map((row) => row.id));
});
