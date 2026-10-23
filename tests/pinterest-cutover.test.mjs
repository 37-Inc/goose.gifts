import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertStudioCommandAllowed, publicMetric, sumPublicMetric } from '../scripts/ops/pinterest-studio-policy.mjs';
import { validateDraftPackage, validatePinReadback } from '../scripts/ops/pinterest-publishing.mjs';
import { catalogUtc, normalizePinterestCatalogRow, readPinterestCatalog, verifyPinterestPublication } from '../scripts/ops/pinterest-catalog.mts';
import { reviewPinterestCohort } from '../scripts/ops/pinterest-cohort.mjs';
import { auditPinterestDestination } from '../scripts/ops/pinterest-destination-audit.mjs';
import { readPinterestSiteSignals } from '../scripts/ops/pinterest-site-signals.mjs';

const root = path.resolve(import.meta.dirname, '..');
test('measurement policy blocks every mutating CLI before credentials, including Sandbox and misleading dry-run deletes', () => {
  for (const command of ['create-pin', 'delete-pin', 'delete-board', 'generate', 'prepare']) {
    assert.throws(() => assertStudioCommandAllowed(command, { root }), /measurement-only/);
    if (command !== 'create-pin') assert.throws(() => assertStudioCommandAllowed(command, { root, dryRun: true }), /measurement-only/);
  }
  assert.doesNotThrow(() => assertStudioCommandAllowed('create-pin', { root, dryRun: true, preview: true }));
  assert.throws(() => assertStudioCommandAllowed('create-pin', { root, preview: true }), /dry-run only/);
  for (const argv of [['scripts/ops/pinterest-api.mjs', 'create-pin', '--sandbox'],
    ['scripts/ops/pinterest-api.mjs', 'delete-pin', '--dry-run'],
    ['scripts/ops/post-pinterest-v3-trial.mjs'], ['scripts/ops/prepare-pinterest-pins.mjs'], ['scripts/ops/generate-pinterest-v3-assets.mjs']]) {
    const result = spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8', env: { PATH: '/nonexistent' }, timeout: 3000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /measurement-only/);
    assert.doesNotMatch(result.stderr, /Missing Pinterest app secret/);
  }
});

test('missing public metrics remain unknown and contaminate aggregates, not measured zeros', () => {
  for (const value of [undefined, null, '', '0', -1, NaN]) assert.equal(publicMetric(value), null);
  assert.equal(publicMetric(0), 0); assert.equal(publicMetric(12), 12);
  assert.equal(sumPublicMetric([{ count: 0 }, { count: null }], 'count'), null);
  assert.equal(sumPublicMetric([{ count: 0 }, { count: 3 }], 'count'), 3);
});

test('new destinations are exact canonical Stupid product pages while published Goose packages retain readback', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/ops/pinterest-approved-pins.json'), 'utf8'));
  const old = manifest.pins.find(pin => pin.candidateId && pin.livePinUrl && /\/gifts\//.test(pin.targetPage));
  const before = JSON.stringify(old);
  assert.throws(() => validateDraftPackage(old), /canonical/);
  assert.doesNotThrow(() => validateDraftPackage(old, { root, historicalReadback: true }));
  const target = new URL(old.targetPage); target.hostname = 'stupid.gifts';
  const tracking = new URL(old.trackingUrl); tracking.hostname = 'stupid.gifts';
  const next = { ...old, targetPage: target.href, trackingUrl: tracking.href };
  assert.doesNotThrow(() => validateDraftPackage(next, { root }));
  for (const bad of ['https://www.stupid.gifts/gifts/example', 'https://stupid.gifts/', 'https://stupid.gifts/random-gift',
    'https://evil.test/gifts/example', 'https://stupid.gifts:8443/gifts/example', 'https://user@stupid.gifts/gifts/example'])
    assert.throws(() => validateDraftPackage({ ...next, targetPage: bad }), /canonical/);
  assert.throws(() => validateDraftPackage({ ...old, livePinUrl: undefined }, { historicalReadback: true }), /already published/);
  assert.doesNotThrow(() => validatePinReadback({ id: '1', board_id: '2', title: old.title, description: old.description,
    alt_text: old.altText, media: { media_type: 'image' }, link: old.trackingUrl }, old, '2'));
  assert.equal(JSON.stringify(old), before);
});

const identity = { release_id: 'live-r1', catalog_revision: 'revision-1', code_sha: 'a'.repeat(40),
  catalog_snapshot_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64) };
const receipt = { ...identity, completed_at: '2026-10-23T00:00:00Z', manifest_json: JSON.stringify({ releaseId: identity.release_id,
  catalogRevision: identity.catalog_revision, codeSha: identity.code_sha, catalogSnapshotSha256: identity.catalog_snapshot_sha256,
  manifestSha256: identity.manifest_sha256 }) };
test('catalog normalizes evidenced UTC and source fields without inventing freshness', () => {
  assert.equal(catalogUtc('2026-10-04 04:07:52.464262'), '2026-10-04T04:07:52.464Z');
  assert.equal(catalogUtc(null), null);
  const row = normalizePinterestCatalogRow({ is_active: 1, humor_tags: '{funny,desk}', source_facts: '{"features":["tiny"]}', last_verified_at: null });
  assert.equal(row.is_active, true); assert.deepEqual(row.humor_tags, ['funny', 'desk']); assert.equal(row.last_verified_at, null);
  assert.equal(verifyPinterestPublication(identity, [receipt]), receipt);
  assert.throws(() => verifyPinterestPublication({ ...identity, manifest_sha256: 'd'.repeat(64) }, [receipt]), /mismatch/);
});

test('catalog binds the public release to its actual receipt with SELECT-only reads and completed-run provenance', async () => {
  const calls = [];
  const mockFetch = async (url, options) => {
    calls.push({ url, ...options });
    if (url.startsWith('https://stupid.gifts/')) return Response.json(identity);
    if (options.method === 'GET') return Response.json({ success: true, result: { uuid: '77b30f85-c57c-4acb-a0df-53368806c2a6', name: 'stupid-gifts-production' } });
    const batch = JSON.parse(options.body).batch;
    assert.equal(batch.length, 4);
    for (const query of batch) { assert.match(query.sql, /^SELECT/); assert.doesNotMatch(query.sql, /\b(INSERT|UPDATE|DELETE|PRAGMA)\b/i); }
    assert.match(batch[1].sql, /status='completed' AND dry_run=0/);
    assert.deepEqual(batch[2].params, ['revision-1']);
    return Response.json({ success: true, result: [[receipt], [], [], []].map(results => ({ success: true, results,
      meta: { rows_written: 0, changed_db: false } })) });
  };
  const result = await readPinterestCatalog({ fetch: mockFetch, token: async () => 'test-token' });
  assert.equal(calls.length, 4); assert.equal(result.latestCatalogRun, null); assert.deepEqual(result.rows, []);
  assert.equal(result.bounds.reportedRowsWritten, 0);
  let identities = 0;
  await assert.rejects(readPinterestCatalog({ token: async () => 'test-token', fetch: (url, options) =>
    url.startsWith('https://stupid.gifts/') && ++identities === 2 ? Promise.resolve(Response.json({ ...identity, release_id: 'changed' })) : mockFetch(url, options) }), /release_changed/);
});

test('complete cohort review waits for the latest actual success plus 14 full days and never unlocks posting', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/ops/pinterest-creative-lab/v34-concepts/verification/full-cohort-operating-ledger.json')));
  const receipts = fs.readFileSync(path.join(root, 'docs/ops/pinterest-publication-receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const metrics = { pins: ledger.members.map(pin => ({ id: pin.pinId, impressions: 0, pinClicks: 0, saves: 0, outboundClicks: 0 })) };
  const before = reviewPinterestCohort({ ledger, receipts, metrics, now: new Date('2026-10-31T16:44:52.278Z') });
  assert.equal(before.finalReviewDue, false); assert.equal(before.postingAllowed, false);
  const due = reviewPinterestCohort({ ledger, receipts, metrics, now: new Date('2026-10-31T16:44:52.279Z') });
  assert.equal(due.finalReviewDue, true); assert.equal(due.postingAllowed, false); assert.equal(due.exposureGateMet, false);
  assert.equal(reviewPinterestCohort({ ledger: { ...ledger, finalReviewDelivered: true }, receipts, metrics,
    now: new Date('2026-11-01') }).finalReviewDue, false);
  assert.throws(() => reviewPinterestCohort({ ledger: { ...ledger, fullCohortEvaluationDeadlineUtc: '2026-10-30T00:00:00Z' }, receipts, metrics }), /deadline mismatch/);
  assert.throws(() => reviewPinterestCohort({ ledger, receipts: [], metrics }), /receipt mismatch/);
});

test('destination audit preserves exact UTMs and reports missing pages instead of homepage fallback', async () => {
  const url = 'https://www.goose.gifts/gifts/example?utm_source=pinterest&utm_content=poster_x';
  const result = await auditPinterestDestination(url, async () => new Response('<link rel="canonical" href="https://www.goose.gifts/gifts/example">', {status: 404}));
  assert.equal(result.status, 404); assert.equal(result.utmPreserved, true); assert.equal(result.samePath, true);
  let reads = 0;
  const redirect = await auditPinterestDestination(url, async () => ++reads === 1
    ? new Response(null, {status: 301, headers: {location:'https://stupid.gifts/gifts/example?utm_source=pinterest&utm_content=poster_x'}})
    : new Response('<link rel="canonical" href="https://stupid.gifts/gifts/example">', {status: 200}));
  assert.equal(redirect.utmPreserved, true); assert.equal(new URL(redirect.finalUrl).hostname, 'stupid.gifts');
  await assert.rejects(auditPinterestDestination(url, async () => new Response(null, {status: 302, headers: {location:'https://evil.test/'}})), /unexpected_origin/);
});

test('analytics targets explicit production IDs, excludes QA identities, and labels provider gaps unknown', async () => {
  const requests = [];
  const dependencies = { ga4Token: async () => 'test', posthogCredentials: async () => ({token: 'test', env_id: 999}),
    fetch: async (url, options) => {
      requests.push({url, options});
      if (url.endsWith('/550427/')) return Response.json({id:550427,name:'Test project'});
      if (url.includes('posthog')) {
        const query = JSON.parse(options.body).query.query;
        assert.match(query, /distinct_id NOT IN/); assert.match(query, /traffic_medium/); assert.match(query, /qa\|operator/);
        assert.doesNotMatch(query, /\$host|\$current_url/);
        return Response.json({columns:['event','count'],results:[]});
      }
      assert.match(url,/properties\/507421709:runReport/);
      const body=JSON.parse(options.body);
      assert.equal(body.dimensions[0].name,'hostName'); assert.equal(body.limit,100);
      return Response.json({rows:[],rowCount:0});
    } };
  const result=await readPinterestSiteSignals(new Date('2026-10-23T19:00:00Z'),dependencies);
  assert.equal(result.ga4.status,'measured'); assert.equal(result.posthog.status,'measured'); assert.equal(requests.length,5);
  const gap=await readPinterestSiteSignals(new Date('2026-10-23T19:00:00Z'),{...dependencies,fetch:async()=>new Response(null,{status:503})});
  assert.equal(gap.ga4.status,'unknown'); assert.equal(gap.posthog.status,'unknown');
  assert.equal(gap.posthog.results,undefined);
});
