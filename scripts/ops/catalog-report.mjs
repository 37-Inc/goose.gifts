#!/usr/bin/env node

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import {
  formatEstimatedCatalogRunCost,
  formatManualReviewQueue,
  formatCatalogRunReport,
  loadCatalogRun,
  loadRecentCatalogRuns,
  manualInterventionItems,
  redactTelemetryText,
} from './catalog-telemetry.mjs';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

function requireOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

function parseArgs(argv) {
  const options = { json: false, latest: false, manualReview: false, limit: 10, runId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--latest') options.latest = true;
    else if (arg === '--manual-review') options.manualReview = true;
    else if (arg === '--limit') {
      options.limit = Number(requireOptionValue(argv, index, '--limit'));
      if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw new Error('--limit must be a positive integer.');
      }
      index += 1;
    } else if (arg === '--run') {
      options.runId = requireOptionValue(argv, index, '--run');
      index += 1;
    }
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
  const requestedSingleRun = Boolean(options.latest || options.manualReview);
  if (!runId && (options.latest || options.manualReview)) {
    const [latest] = await loadRecentCatalogRuns(1);
    runId = latest?.id;
  }

  if (!runId && requestedSingleRun) {
    const payload = options.manualReview
      ? { run: null, manualIntervention: [] }
      : null;
    console.log(options.json ? JSON.stringify(payload, null, 2) : 'No catalog telemetry runs found.');
    return payload;
  }

  if (runId) {
    const result = await loadCatalogRun(runId);
    if (!result) throw new Error(`Catalog run not found: ${runId}`);
    const payload = options.manualReview
      ? { run: result.run, manualIntervention: manualInterventionItems(result.run, result.items) }
      : result;
    console.log(options.json ? JSON.stringify(payload, null, 2) : (
      options.manualReview
        ? formatManualReviewQueue(result.run, result.items)
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
    formatEstimatedCatalogRunCost(run),
  ].join('\t')));
  return runs;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(redactTelemetryText(error.message));
    process.exitCode = 1;
  });
}

export { main, parseArgs };
