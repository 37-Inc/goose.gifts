#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  finishCatalogRun,
  formatEstimatedCatalogRunCost,
  getGitRevision,
  mergeUsageReports,
  redactTelemetryText,
  startCatalogRun,
} from './catalog-telemetry.mjs';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const prefetchScript = path.join(scriptDirectory, 'prefetch-catalog.mjs');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const notify = !args.has('--no-notify') && !dryRun;
const marketingTarget = process.env.GOOSE_CATALOG_SLACK_TARGET || 'C0AGRSTBP5H';
const openClawBinary = process.env.OPENCLAW_BIN
  || (fs.existsSync('/opt/homebrew/bin/openclaw') ? '/opt/homebrew/bin/openclaw' : 'openclaw');
const WEEKLY_REVALIDATION = {
  revalidateLimit: 50,
  staleDays: 30,
  deactivateAfterDays: 90,
};
const WEEKLY_DISCOVERY = {
  themeLimit: 6,
  perTheme: 10,
  maxNew: 20,
  minQualityScore: 0.65,
};

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

function phaseCounts(result, fields) {
  return Object.fromEntries(fields
    .filter((field) => result?.[field] !== undefined)
    .map((field) => [field, result[field]]));
}

function formatReport(discovery, revalidation, run = {}) {
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
    `Run: ${run.id || discovery.telemetry?.runId || 'dry-run'}${run.estimatedCostUsd !== undefined || run.usage ? ` | estimated API cost: ${formatEstimatedCatalogRunCost(run)}` : ''}`,
    '',
    `Discovery: ${discovery.discoveredCandidates} fetched, ${discovery.qualityRejected} quality-rejected, `
      + `${discovery.duplicatesFiltered} duplicates filtered, ${retained} retained`,
    writeSummary,
    ...(editorialSummary ? [editorialSummary] : []),
    `Revalidation: ${revalidation.selected} checked, ${revalidation.refreshed} refreshed, `
      + `${revalidation.confirmedMissing} confirmed missing, ${revalidation.markedUnavailable || 0} unavailable, `
      + `${revalidation.deactivated} deactivated`,
    `Themes: ${discovery.themes.join(', ')}`,
    `Owner intervention: ${Number(discovery.manualIntervention || editorial?.needsReview || 0)} item(s); inspect with npm run catalog:review-queue`,
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
  const runId = randomUUID();
  const telemetryEnabled = !dryRun && Boolean(process.env.POSTGRES_URL);
  const runTrigger = process.env.CATALOG_RUN_TRIGGER || 'scheduled';
  const backfillLimit = Number(process.env.CATALOG_ENRICH_EXISTING_LIMIT || 25);
  const managedRunArgs = telemetryEnabled
    ? ['--run-id', runId, '--run-mode', 'weekly', '--run-trigger', runTrigger, '--managed-run']
    : [];
  let revalidation;
  let discovery;
  let notificationError;
  let runStarted = false;

  try {
    if (telemetryEnabled) {
      await startCatalogRun({
        id: runId,
        mode: 'weekly',
        trigger: runTrigger,
        dryRun,
        gitSha: getGitRevision(),
        config: {
          backfillLimit,
          ...WEEKLY_REVALIDATION,
          ...WEEKLY_DISCOVERY,
        },
      });
      runStarted = true;
    }
    revalidation = runCatalog([
      '--revalidate',
      '--revalidate-limit', String(WEEKLY_REVALIDATION.revalidateLimit),
      '--stale-days', String(WEEKLY_REVALIDATION.staleDays),
      '--deactivate-after-days', String(WEEKLY_REVALIDATION.deactivateAfterDays),
      ...managedRunArgs,
      ...sharedDryRunArgs,
    ]);
    discovery = runCatalog([
      '--theme-limit', String(WEEKLY_DISCOVERY.themeLimit),
      '--per-theme', String(WEEKLY_DISCOVERY.perTheme),
      '--max-new', String(WEEKLY_DISCOVERY.maxNew),
      '--min-quality-score', String(WEEKLY_DISCOVERY.minQualityScore),
      '--backfill-limit', String(backfillLimit),
      ...managedRunArgs,
      ...sharedDryRunArgs,
    ]);
    const usage = mergeUsageReports([revalidation.telemetry?.usage, discovery.telemetry?.usage]);
    const timingsMs = {
      revalidation: revalidation.telemetry?.timingsMs?.total || 0,
      discovery: discovery.telemetry?.timingsMs?.total || 0,
      total: Number(revalidation.telemetry?.timingsMs?.total || 0)
        + Number(discovery.telemetry?.timingsMs?.total || 0),
    };
    const warnings = [
      ...(revalidation.telemetry?.warnings || []),
      ...(discovery.telemetry?.warnings || []),
    ];
    const report = formatReport(discovery, revalidation, {
      id: runId,
      estimatedCostUsd: usage.estimatedCostUsd,
      usage,
    });
    console.log(`\n${report}`);
    if (notify) {
      try {
        sendOpenClaw(report);
      } catch (error) {
        notificationError = error;
        warnings.push({ phase: 'notification', reasonCode: 'slack_notification_failed', message: redactTelemetryText(error.message) });
      }
    }
    if (runStarted) {
      await finishCatalogRun(runId, {
        status: notificationError ? 'partial' : 'completed',
        counts: {
          revalidation: phaseCounts(revalidation, [
            'selected', 'refreshed', 'confirmedMissing', 'markedUnavailable',
            'deactivated', 'throttled', 'affiliateAudit',
          ]),
          discovery: {
            ...phaseCounts(discovery, [
              'discoveredCandidates', 'rawCandidates', 'qualityRejected',
              'duplicatesFiltered', 'inserted', 'updated', 'backfilled',
              'discoveryReady', 'discoveryNeedsReview', 'manualIntervention',
              'themes',
            ]),
            backfill: discovery.backfill,
          },
        },
        timingsMs,
        usage,
        warnings,
        error: notificationError,
      });
    }
    if (notificationError) throw notificationError;
  } catch (error) {
    if (runStarted && !notificationError) {
      const usage = mergeUsageReports([revalidation?.telemetry?.usage, discovery?.telemetry?.usage]);
      try {
        await finishCatalogRun(runId, {
          status: revalidation || discovery ? 'partial' : 'failed',
          counts: {
            revalidation: revalidation ? phaseCounts(revalidation, [
              'selected', 'refreshed', 'confirmedMissing', 'markedUnavailable',
              'deactivated', 'throttled', 'affiliateAudit',
            ]) : null,
            discovery: discovery ? {
              ...phaseCounts(discovery, [
                'discoveredCandidates', 'rawCandidates', 'qualityRejected',
                'duplicatesFiltered', 'inserted', 'updated', 'backfilled',
                'discoveryReady', 'discoveryNeedsReview', 'manualIntervention',
                'themes',
              ]),
              backfill: discovery.backfill,
            } : null,
          },
          timingsMs: {
            revalidation: revalidation?.telemetry?.timingsMs?.total || 0,
            discovery: discovery?.telemetry?.timingsMs?.total || 0,
          },
          usage,
          warnings: [
            ...(revalidation?.telemetry?.warnings || []),
            ...(discovery?.telemetry?.warnings || []),
          ],
          error,
        });
      } catch (telemetryError) {
        console.error(`Catalog telemetry finalization failed: ${redactTelemetryText(telemetryError.message)}`);
      }
    }
    if (notify) {
      try {
        sendOpenClaw(`🪿 goose.gifts weekly catalog run failed\n${redactTelemetryText(error.message)}`);
      } catch (notificationError) {
        console.error(redactTelemetryText(notificationError.message));
      }
    }
    throw error;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(redactTelemetryText(error.message));
    process.exitCode = 1;
  });
}

export { formatReport, parseFinalJson };
