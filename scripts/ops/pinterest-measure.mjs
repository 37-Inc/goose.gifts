#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertPinterestAccount } from './pinterest-publishing.mjs';
import { assertStudioCommandAllowed } from './pinterest-studio-policy.mjs';
import { loadPinterestCohort } from './pinterest-cohort.mjs';
import { readPinterestSiteSignals } from './pinterest-site-signals.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length !== 2) throw new Error('pinterest:measure takes no arguments and never publishes.');
assertStudioCommandAllowed('measure', { root });
const run = promisify(execFile);
const api = async command => JSON.parse((await run(process.execPath, ['scripts/ops/pinterest-api.mjs', command], {
  cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024,
})).stdout);
const [account, metrics, siteSignals] = await Promise.all([api('whoami'), api('public-pin-metrics'), readPinterestSiteSignals()]);
assertPinterestAccount(account);
const cohort = loadPinterestCohort(root, metrics, new Date());
console.log(JSON.stringify({ schemaVersion: 1, mode: 'measurement_only', writes: 0, account, metrics, cohort, siteSignals }, null, 2));
