#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const prefetchScript = path.join(scriptDirectory, 'prefetch-catalog.mjs');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const notify = !args.has('--no-notify') && !dryRun;
const marketingTarget = process.env.GOOSE_CATALOG_SLACK_TARGET || 'C0AGRSTBP5H';
const openClawBinary = process.env.OPENCLAW_BIN
  || (fs.existsSync('/opt/homebrew/bin/openclaw') ? '/opt/homebrew/bin/openclaw' : 'openclaw');

function parseFinalJson(output) {
  const start = output.lastIndexOf('\n{');
  const json = (start >= 0 ? output.slice(start + 1) : output).trim();
  return JSON.parse(json);
}

function runCatalog(argsForScript) {
  const result = spawnSync(process.execPath, [prefetchScript, ...argsForScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Catalog command failed with status ${result.status ?? 'unknown'}.`);
  }
  return parseFinalJson(result.stdout);
}

function formatReport(discovery, revalidation) {
  const status = revalidation.throttled ? 'completed with Amazon throttling' : 'completed';
  const retained = Array.isArray(discovery.candidates)
    ? discovery.candidates.length
    : discovery.candidates;
  const writeSummary = discovery.dryRun
    ? 'Catalog writes: dry run; no products changed'
    : `Catalog writes: ${discovery.inserted} inserted, ${discovery.updated} refreshed, `
      + `${discovery.backfilled} older products enriched`;
  const editorial = discovery.backfill;
  const editorialSummary = editorial
    ? `Editorial: ${editorial.selected} selected, ${editorial.ready} ready, `
      + `${editorial.needsReview} needs review, ${editorial.blocked} blocked, `
      + `${editorial.duplicates} duplicate, ${editorial.markedUnavailable} unavailable`
    : undefined;
  const reviewCandidates = (Array.isArray(discovery.reviewCandidates)
    ? discovery.reviewCandidates
    : [])
    .filter((product) => product.title && product.imageUrl && product.affiliateUrl)
    .slice(0, 5);
  const reviewLines = reviewCandidates.flatMap((product) => [
    `• ${product.title.replace(/\s+/g, ' ').trim().slice(0, 100)}`,
    `  image: ${product.imageUrl}`,
    `  product: ${product.affiliateUrl}`,
  ]);

  return [
    `🪿 goose.gifts weekly catalog run ${status}`,
    '',
    `Discovery: ${discovery.discoveredCandidates} fetched, ${discovery.qualityRejected} quality-rejected, `
      + `${discovery.duplicatesFiltered} duplicates filtered, ${retained} retained`,
    writeSummary,
    ...(editorialSummary ? [editorialSummary] : []),
    `Revalidation: ${revalidation.selected} checked, ${revalidation.refreshed} refreshed, `
      + `${revalidation.confirmedMissing} confirmed missing, ${revalidation.markedUnavailable || 0} unavailable, `
      + `${revalidation.deactivated} deactivated`,
    `Themes: ${discovery.themes.join(', ')}`,
    ...(reviewLines.length > 0
      ? ['', `Visual spot-check (${reviewCandidates.length}):`, ...reviewLines]
      : []),
  ].join('\n');
}

function sendOpenClaw(message, { dryRun: messageDryRun = false } = {}) {
  const commandArgs = [
    'message', 'send',
    '--channel', 'slack',
    '--target', marketingTarget,
    '--message', message,
    '--json',
  ];
  if (messageDryRun) commandArgs.push('--dry-run');

  const result = spawnSync(openClawBinary, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`OpenClaw notification failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout.trim();
}

async function main() {
  const sharedDryRunArgs = dryRun ? ['--dry-run'] : [];
  let revalidation;

  try {
    revalidation = runCatalog([
      '--revalidate',
      '--revalidate-limit', '50',
      '--stale-days', '30',
      '--deactivate-after-days', '90',
      ...sharedDryRunArgs,
    ]);
    const discovery = runCatalog([
      '--theme-limit', '6',
      '--per-theme', '10',
      '--max-new', '20',
      '--min-quality-score', '0.65',
      ...sharedDryRunArgs,
    ]);
    const report = formatReport(discovery, revalidation);
    console.log(`\n${report}`);
    if (notify) sendOpenClaw(report);
  } catch (error) {
    if (notify) {
      try {
        sendOpenClaw(`🪿 goose.gifts weekly catalog run failed\n${error.message}`);
      } catch (notificationError) {
        console.error(notificationError.message);
      }
    }
    throw error;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { formatReport, parseFinalJson };
