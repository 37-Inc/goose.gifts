#!/usr/bin/env node

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import {
  formatCatalogRunReport,
  loadCatalogRun,
  loadRecentCatalogRuns,
  manualInterventionItems,
} from './catalog-telemetry.mjs';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

function parseArgs(argv) {
  const options = { json: false, latest: false, manualReview: false, limit: 10, runId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--latest') options.latest = true;
    else if (arg === '--manual-review') options.manualReview = true;
    else if (arg === '--limit') options.limit = Number(argv[++index]);
    else if (arg === '--run') options.runId = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: npm run catalog:report -- [options]

Options:
  --latest             Show the most recent catalog run in detail.
  --run UUID           Show one exact run and its candidate history.
  --manual-review      Return only candidates needing owner intervention.
  --limit 10           Number of recent run summaries to list.
  --json               Emit machine-readable JSON.
`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required. Run scripts/ops/pull-env.sh first.');

  let runId = options.runId;
  if (!runId && (options.latest || options.manualReview)) {
    const [latest] = await loadRecentCatalogRuns(1);
    runId = latest?.id;
  }

  if (runId) {
    const result = await loadCatalogRun(runId);
    if (!result) throw new Error(`Catalog run not found: ${runId}`);
    const payload = options.manualReview
      ? { run: result.run, manualIntervention: manualInterventionItems(result.run, result.items) }
      : result;
    console.log(options.json ? JSON.stringify(payload, null, 2) : (
      options.manualReview
        ? formatCatalogRunReport(result.run, result.items)
        : formatCatalogRunReport(result.run, result.items)
    ));
    return payload;
  }

  const runs = await loadRecentCatalogRuns(options.limit);
  if (options.json) console.log(JSON.stringify(runs, null, 2));
  else runs.forEach((run) => console.log([
    run.id,
    run.status,
    run.mode,
    new Date(run.started_at).toISOString(),
    `$${Number(run.estimated_cost_usd || 0).toFixed(6)}`,
  ].join('\t')));
  return runs;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { main, parseArgs };
