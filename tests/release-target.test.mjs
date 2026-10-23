import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchesGlob } from 'node:path';
import test from 'node:test';

test('legacy Vercel Git deployments stay disabled for every branch', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.git.deploymentEnabled, false);
});

test('full staging gate runs durable publication proofs once, after parallel fixtures finish', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const phases = scripts['test:staging'].split(' && ');
  const durableFile = 'tests/catalog-published-vector-proof.test.mjs';
  assert.equal(phases.at(-1), 'npm run test:staging:durable');
  const parallel = phases.find(command => command.startsWith('node --import tsx --test '));
  assert.ok(parallel);
  const patterns = parallel.split(/\s+/).slice(4);
  assert.ok(patterns.length > 20);
  assert.ok(patterns.every(pattern => pattern.startsWith('tests/') && !matchesGlob(durableFile, pattern)));
  assert.equal(scripts['test:staging:durable'], `node --import tsx --test ${durableFile}`);
});
