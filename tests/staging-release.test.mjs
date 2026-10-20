import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyFeedPlan, verifySnapshotDigest } from '../scripts/staging/verify-release.mts';
import { createStaticFeedPlan } from '../workers/site/feed.ts';
import { createReleaseIdentity, verifyReleaseIdentity } from '../scripts/staging/release-identity.mts';

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
