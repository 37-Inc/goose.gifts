import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyFeedPlan, verifySnapshotDigest, verifyReleaseContext } from '../scripts/staging/verify-release.mts';
import { validateBuildContext } from '../scripts/staging/build.mts';
import { createStaticFeedPlan } from '../workers/site/feed.ts';
import { createReleaseIdentity, verifyReleaseIdentity } from '../scripts/staging/release-identity.mts';
import { validateCatalogSnapshot } from '../lib/catalog/snapshot.ts';

test('release context requires explicit deterministic identity, prior release, watermark and capture time', () => {
  const snapshot = { catalogRevision: 'r1', generatedAt: '2026-10-19T12:00:00.000Z' };
  const context = { schemaVersion: 1, sourceMode: 'preview', releaseId: 'explicit-release', codeSha: 'a'.repeat(40), catalogRevision: 'r1',
    catalogSnapshotSha256: 'b'.repeat(64), generatedAt: snapshot.generatedAt, vectorSyncWatermark: 12, priorReleaseId: 'verified-prior' };
  const now = new Date('2026-10-20T12:00:00.000Z');
  assert.deepEqual(validateBuildContext(context, snapshot, context.codeSha, context.catalogSnapshotSha256, now), context);
  verifyReleaseContext(context, context, snapshot, context.codeSha);
  for (const key of ['releaseId', 'vectorSyncWatermark', 'priorReleaseId', 'sourceMode']) {
    const missing = { ...context }; delete missing[key];
    assert.throws(() => validateBuildContext(missing, snapshot, context.codeSha, context.catalogSnapshotSha256, now), /context/);
  }
  for (const changed of [{ codeSha: 'c'.repeat(40) }, { vectorSyncWatermark: -1 }, { priorReleaseId: context.releaseId },
    { catalogSnapshotSha256: 'd'.repeat(64) }, { generatedAt: '2026-10-21T12:00:00.000Z' }, { extra: 'not allowed' }])
    assert.throws(() => validateBuildContext({ ...context, ...changed }, snapshot, context.codeSha, context.catalogSnapshotSha256, now));
  assert.throws(() => verifyReleaseContext(context, { ...context, vectorSyncWatermark: 0 }, snapshot, context.codeSha), /context changed/);
  assert.equal(validateBuildContext({ ...context, vectorSyncWatermark: 0, priorReleaseId: null }, snapshot, context.codeSha, context.catalogSnapshotSha256, now).priorReleaseId, null);
});

test('builder refuses missing context before invoking Next or any provider', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/staging/build.mts'], {
    encoding: 'utf8', env: { ...process.env, CATALOG_SNAPSHOT_PATH: '', CATALOG_RELEASE_CONTEXT_PATH: '' },
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /CATALOG_RELEASE_CONTEXT_PATH/);
  assert.doesNotMatch(result.stdout, /Generating static|Creating an optimized/);
});

test('synthetic export consumes explicit context and cannot overwrite its sealed release ID',
  { skip: process.env.STAGING_BUILD_CONTEXT_FIXTURE !== '1' }, async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'staging-context-'));
    try {
      const snapshot = validateCatalogSnapshot(JSON.parse(readFileSync(new URL('../static-site/fixtures/catalog.snapshot.json', import.meta.url), 'utf8')));
      const digest = createHash('sha256').update(`${JSON.stringify(snapshot)}\n`).digest('hex');
      for (const sourceMode of ['goose-production', 'preview']) {
      const context = { schemaVersion: 1, sourceMode, releaseId: `synthetic-context-${sourceMode}-${path.basename(temporary)}`,
        codeSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        catalogRevision: snapshot.catalogRevision, catalogSnapshotSha256: digest, generatedAt: snapshot.generatedAt,
        vectorSyncWatermark: 0, priorReleaseId: null };
      const contextPath = path.join(temporary, 'release-context.json'); await writeFile(contextPath, JSON.stringify(context));
      const env = { ...process.env, CATALOG_SITE_MODE: sourceMode, NEXT_PUBLIC_STATIC_SITE_MODE: sourceMode,
        NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED: 'false', CATALOG_SNAPSHOT_PATH: '', CATALOG_RELEASE_CONTEXT_PATH: contextPath };
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/staging/build.mts'], { cwd: root, env, stdio: 'pipe' });
      const manifest = JSON.parse(readFileSync(path.join(root, 'build/stupid-gifts/asset-manifest.json'), 'utf8'));
      assert.equal(manifest.releaseId, context.releaseId); verifyReleaseContext(context, manifest, snapshot, context.codeSha);
      assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'build/stupid-gifts/release-context.json'), 'utf8')), context);
      assert.equal(manifest.sourceMode, sourceMode);
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/staging/verify-release.mts'], { cwd: root, env, stdio: 'pipe' });
      const retry = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/staging/build.mts'], { cwd: root, env, encoding: 'utf8' });
      assert.equal(retry.status, 1); assert.match(retry.stderr, /already built/);
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });

test('deployed identity binds the exact manifest bytes without a self-referential checksum', () => {
  const manifest = { releaseId: 'r1-code', codeSha: 'a'.repeat(40), catalogRevision: 'r1',
    catalogSnapshotSha256: 'b'.repeat(64), checksums: { '/index.html': 'c'.repeat(64) } };
  const bytes = Buffer.from(JSON.stringify(manifest) + '\n');
  const identity = createReleaseIdentity(bytes);
  assert.deepEqual(Object.keys(identity), ['release_id', 'code_sha', 'catalog_revision', 'catalog_snapshot_sha256', 'manifest_sha256']);
  verifyReleaseIdentity(bytes, identity);
  assert.throws(() => verifyReleaseIdentity(bytes, { ...identity, code_sha: 'd'.repeat(40) }), /exact manifest bytes/);
  assert.throws(() => verifyReleaseIdentity(bytes, { ...identity, private_field: 'not public' }), /exact manifest bytes/);
  assert.throws(() => verifyReleaseIdentity(Buffer.from(JSON.stringify(manifest)), identity), /exact manifest bytes/);
  manifest.checksums['/index.html'] = 'e'.repeat(64);
  assert.throws(() => verifyReleaseIdentity(Buffer.from(JSON.stringify(manifest) + '\n'), identity), /exact manifest bytes/);
});

test('release rejects snapshot changes even when catalog revision is unchanged', () => {
  const snapshot = { catalogRevision: 'same-revision', products: [{ title: 'Verified title' }] };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const digest = createHash('sha256').update(bytes).digest('hex');
  verifySnapshotDigest(bytes, digest);
  snapshot.products[0].title = 'Unreviewed replacement';
  assert.throws(() => verifySnapshotDigest(Buffer.from(JSON.stringify(snapshot)), digest), /snapshot changed/);
});

test('release recomputes the prepared feed and rejects altered ordering or digest', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../static-site/fixtures/catalog.snapshot.json', import.meta.url), 'utf8'));
  for (const product of snapshot.products) product.title = `Funny ${product.title}`;
  const digest = '1'.repeat(64);
  const plan = createStaticFeedPlan(snapshot, digest);
  verifyFeedPlan(snapshot, digest, plan);
  assert.ok(plan.entries.length > 1);
  assert.throws(() => verifyFeedPlan(snapshot, digest, { ...plan, entries: [...plan.entries].reverse() }), /Prepared feed changed/);
  assert.throws(() => verifyFeedPlan(snapshot, digest, { ...plan, catalogSnapshotSha256: '2'.repeat(64) }), /Prepared feed changed/);
});

test('cohort CLI does not echo credentials from malformed database URLs', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'staging-redaction-'));
  try {
    const marker = 'FAKE_ONLY_CREDENTIAL_MARKER';
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', 'scripts/staging/read-cohort.mts',
      '--ids', 'B09HT6ZC7K', '--output', path.join(temporary, 'cohort'), '--execute-read-only',
    ], { encoding: 'utf8', env: { ...process.env, POSTGRES_URL: marker } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Read-only cohort preparation failed/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(marker));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
