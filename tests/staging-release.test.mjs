import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifySnapshotDigest } from '../scripts/staging/verify-release.mts';

test('release rejects snapshot changes even when catalog revision is unchanged', () => {
  const snapshot = { catalogRevision: 'same-revision', products: [{ title: 'Verified title' }] };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const digest = createHash('sha256').update(bytes).digest('hex');
  verifySnapshotDigest(bytes, digest);
  snapshot.products[0].title = 'Unreviewed replacement';
  assert.throws(() => verifySnapshotDigest(Buffer.from(JSON.stringify(snapshot)), digest), /snapshot changed/);
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
