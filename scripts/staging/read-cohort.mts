import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { INVENTORY_SQL, assertProtectedDestination, loadNeonHttpFactory, tableExportSql } from '../catalog/export-postgres.ts';
import { hydrateLocalAmazonCreatorsEnv } from '../ops/amazon-creators-env.mjs';
import amazon from '../../lib/amazon-creators.js';

async function main() {
  const [flag, rawIds, outputFlag, output, confirmation] = process.argv.slice(2);
  if (flag !== '--ids' || outputFlag !== '--output' || confirmation !== '--execute-read-only')
    throw new Error('Use --ids ASIN,... --output /private/new-directory --execute-read-only');
  const ids = [...new Set(rawIds.split(','))];
  if (!ids.length || ids.length > 10 || ids.some((id) => !/^[A-Z0-9]{10}$/.test(id))) throw new Error('Supply 1..10 exact Amazon product IDs');
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  await assertProtectedDestination(output, root);
  const connection = process.env.POSTGRES_URL;
  if (!connection || !new URL(connection).hostname.endsWith('.neon.tech')) throw new Error('A reviewed Neon HTTPS source is required');
  if (!process.env.AMAZON_ASSOCIATE_TAG) throw new Error('Canonical affiliate configuration is required');
  const neon = await loadNeonHttpFactory();
  const sql = neon(connection);
  const inventory = JSON.parse((await sql(INVENTORY_SQL, []))[0].inventory);
  const products = inventory.find((table: { schema: string; name: string }) => table.schema === 'public' && table.name === 'products');
  if (!products) throw new Error('Source products table is unavailable');
  const statement = tableExportSql(products);
  const from = 'FROM "public"."products"';
  if (statement.split(from).length !== 2) throw new Error('Unexpected exporter query shape');
  // One bounded source statement: a coherent sample, not a complete migration backup.
  const rows = await sql(statement.replace(from, `${from} WHERE id=ANY($1::text[])`), [ids]);
  if (rows.length !== ids.length) throw new Error('Not every requested source product exists');
  if (rows.some((row) => typeof row.row !== 'string')) throw new Error('Unexpected export row shape');
  hydrateLocalAmazonCreatorsEnv();
  const observedAt = new Date().toISOString();
  const items = await amazon.getItems(ids);
  const destination = resolve(output);
  await mkdir(destination, { mode: 0o700 });
  await writeFile(join(destination, 'products.ndjson'), `${rows.map((row) => row.row).join('\n')}\n`, { mode: 0o600, flag: 'wx' });
  await writeFile(join(destination, 'fresh.json'), `${JSON.stringify({
    observedAt, reference: `Amazon Creators getItems read-only staging receipt ${observedAt}`, items,
  })}\n`, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ output: destination, sourceCount: rows.length, freshCount: items.length, observedAt, completeBackup: false }));
}

// URL parser and provider errors may contain credentials or raw response bodies.
main().catch(() => {
  console.error('Read-only cohort preparation failed. Check arguments, protected output, and provider configuration; no error details are logged.');
  process.exitCode = 1;
});
