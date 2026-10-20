import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import type { CatalogSnapshot, SiteAssetManifest } from '../../lib/catalog/types.ts';
import { createStaticRoutes } from '../../static-site/lib/asset-routes.ts';
import { createStaticFeedPlan } from '../../workers/site/feed.ts';

export function verifySnapshotDigest(bytes: Uint8Array, expected: string): void {
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('Catalog snapshot changed after the release was built');
}

export function verifyFeedPlan(snapshot: CatalogSnapshot, digest: string, plan: unknown): void {
  if (JSON.stringify(plan) !== JSON.stringify(createStaticFeedPlan(snapshot, digest)))
    throw new Error('Prepared feed changed after the release was built');
}

async function main() {
  const root = path.resolve(import.meta.dirname, '../..');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain')) throw new Error('Commit the reviewed source before deploying a staging release');
  const manifest: SiteAssetManifest = JSON.parse(await fs.readFile(path.join(root, 'build/stupid-gifts/asset-manifest.json'), 'utf8'));
  const snapshotBytes = await fs.readFile(path.join(root, 'build/stupid-gifts/catalog.snapshot.json'));
  const snapshot = validateCatalogSnapshot(JSON.parse(snapshotBytes.toString('utf8')));
  verifySnapshotDigest(snapshotBytes, manifest.catalogSnapshotSha256);
  const feedPlan = JSON.parse(await fs.readFile(path.join(root, 'build/stupid-gifts/feed-plan.json'), 'utf8'));
  verifyFeedPlan(snapshot, manifest.catalogSnapshotSha256, feedPlan);
  if (manifest.codeSha !== git('rev-parse', 'HEAD') || manifest.catalogRevision !== snapshot.catalogRevision)
    throw new Error('Rebuild the current committed source and snapshot before deployment');
  const output = path.join(root, 'static-site/out');
  const entries = (await fs.readdir(output, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
  const actualPaths = entries.map((file) => `/${path.relative(output, file).split(path.sep).join('/')}`).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(Object.keys(manifest.checksums).sort()))
    throw new Error('Asset inventory changed after the release was built');
  for (const file of entries) {
    const name = `/${path.relative(output, file).split(path.sep).join('/')}`;
    if (createHash('sha256').update(await fs.readFile(file)).digest('hex') !== manifest.checksums[name])
      throw new Error(`Asset checksum changed: ${name}`);
  }
  if (JSON.stringify(createStaticRoutes(snapshot, actualPaths)) !== JSON.stringify(manifest.routes))
    throw new Error('Asset expiry policy changed; rebuild the release');
  console.log(JSON.stringify({ verified: true, releaseId: manifest.releaseId, assets: entries.length, nextExpiry: manifest.nextExpiry }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
