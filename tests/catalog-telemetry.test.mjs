import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  catalogRunItem,
  createUsageLedger,
  finalizeUsageLedger,
  formatCatalogRunReport,
  latestRunItemStates,
  manualInterventionItems,
  mergeUsageReports,
  recordOpenAIUsage,
  redactTelemetryText,
  safeCatalogConfig,
  sanitizeTelemetryValue,
} from '../scripts/ops/catalog-telemetry.mjs';
import { splitMigrationStatements } from '../scripts/ops/apply-catalog-telemetry-migration.mjs';

test('provider usage aggregates exact tokens and dated public price estimates', () => {
  const ledger = createUsageLedger();
  recordOpenAIUsage(ledger, {
    model: 'gpt-4o-mini',
    operation: 'editorial_draft',
    usage: {
      prompt_tokens: 1_000_000,
      completion_tokens: 500_000,
      total_tokens: 1_500_000,
      prompt_tokens_details: { cached_tokens: 200_000 },
    },
  });
  recordOpenAIUsage(ledger, {
    model: 'text-embedding-3-small',
    operation: 'embedding',
    usage: { prompt_tokens: 1_000_000, total_tokens: 1_000_000 },
  });

  const report = finalizeUsageLedger(ledger);
  assert.equal(report.models['gpt-4o-mini'].inputTokens, 1_000_000);
  assert.equal(report.models['gpt-4o-mini'].cachedInputTokens, 200_000);
  assert.equal(report.models['gpt-4o-mini'].estimatedCostUsd, 0.435);
  assert.equal(report.models['text-embedding-3-small'].estimatedCostUsd, 0.02);
  assert.equal(report.estimatedCostUsd, 0.455);
  assert.equal(report.estimateComplete, true);
});

test('unknown model usage remains visible and is never assigned a fabricated cost', () => {
  const ledger = createUsageLedger();
  recordOpenAIUsage(ledger, {
    model: 'custom-editor-v9',
    operation: 'editorial_review',
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  });
  const report = mergeUsageReports([finalizeUsageLedger(ledger)]);

  assert.equal(report.models['custom-editor-v9'].totalTokens, 120);
  assert.equal(report.models['custom-editor-v9'].estimatedCostUsd, null);
  assert.equal(report.estimateComplete, false);
  assert.deepEqual(report.unpricedModels, ['custom-editor-v9']);
});

test('telemetry redacts credentials and allowlists run configuration', () => {
  const value = sanitizeTelemetryValue({
    POSTGRES_URL: 'postgres://name:password@example.com/db',
    apiKey: 'sk-secret-example-value',
    nested: { token: 'bearer-secret', note: 'authorization=top-secret' },
  });
  assert.deepEqual(value, {
    POSTGRES_URL: '[REDACTED]',
    apiKey: '[REDACTED]',
    nested: { token: '[REDACTED]', note: 'authorization=[REDACTED]' },
  });
  assert.equal(
    redactTelemetryText('failed postgres://name:password@example.com/db with sk-abcdefghijklmnop'),
    'failed postgres://[REDACTED]@example.com/db with [REDACTED_OPENAI_KEY]'
  );
  assert.deepEqual(safeCatalogConfig({
    maxNew: 20,
    minQualityScore: 0.65,
    OPENAI_API_KEY: 'must-not-appear',
  }), { maxNew: 20, minQualityScore: 0.65 });
});

test('append-only histories fold deterministically into exact manual intervention', () => {
  const product = {
    id: 'B012345678',
    slug: 'ridiculous-desk-goat',
    title: 'Ridiculous desk goat',
    imageUrl: 'https://images.example/goat.jpg',
    affiliateUrl: 'https://www.amazon.com/dp/B012345678?tag=goose-20',
  };
  const selected = {
    ...catalogRunItem(product, { phase: 'backfill', stage: 'selection', decision: 'selected' }),
    id: 'a',
    created_at: '2026-08-10T01:00:00Z',
  };
  const needsReview = {
    ...catalogRunItem(product, {
      phase: 'backfill',
      stage: 'persistence',
      decision: 'needs_review',
      reasonCode: 'unsupported_material_claim',
      requiresManualReview: true,
      nextAction: 'Check the source facts.',
    }),
    id: 'b',
    created_at: '2026-08-10T01:01:00Z',
  };
  const items = [needsReview, selected];
  const run = {
    id: '11111111-1111-1111-1111-111111111111',
    status: 'completed',
    mode: 'weekly',
    trigger: 'scheduled',
    dry_run: false,
    started_at: '2026-08-10T01:00:00Z',
    completed_at: '2026-08-10T01:02:00Z',
    counts: {},
    timings_ms: {},
    usage: {},
  };

  assert.deepEqual(latestRunItemStates(items).map((item) => item.id), ['b']);
  assert.equal(manualInterventionItems(run, items).length, 1);
  const first = formatCatalogRunReport(run, items);
  const second = formatCatalogRunReport(run, items);
  assert.equal(first, second);
  assert.match(first, /Manual intervention: 1/);
  assert.match(first, /Latest item outcomes: \{"needs_review":1\}/);
  assert.match(first, /Latest reason codes: \{"unsupported_material_claim":1\}/);
  assert.match(first, /https:\/\/www\.goose\.gifts\/gifts\/ridiculous-desk-goat/);
  assert.match(first, /unsupported_material_claim/);
});

test('partial runs surface selected-but-unfinished candidates as interrupted work', () => {
  const selected = {
    ...catalogRunItem({ id: 'B087654321', title: 'Interrupted item' }, {
      phase: 'revalidation',
      stage: 'selection',
      decision: 'selected',
    }),
    created_at: '2026-08-10T01:00:00Z',
  };
  const queue = manualInterventionItems({ status: 'partial' }, [selected]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].effectiveDecision, 'interrupted');
  assert.match(queue[0].effectiveNextAction, /resume or rerun/);
});

test('telemetry migration keeps legacy editorial history independent of product deletion', () => {
  const migration = fs.readFileSync(
    new URL('../lib/db/migrations/0007_add_catalog_run_telemetry.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /catalog_run_items/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "catalog_editorial_events_product_id_products_id_fk"/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "catalog_editorial_events_product_id_fkey"/);
  assert.doesNotMatch(migration, /catalog_run_items[\s\S]+product_id[^\n]+REFERENCES "products"/);
  assert.equal(splitMigrationStatements(migration).length, 9);
});
