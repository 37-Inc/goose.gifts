import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalTime, validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import type { CatalogSnapshot, SiteAssetManifest } from '../../lib/catalog/types.ts';
import { createStaticRoutes } from '../../static-site/lib/asset-routes.ts';
import { createStaticFeedPlan } from '../../workers/site/feed.ts';
import { createReleaseIdentity } from './release-identity.mts';

export type ReleaseBuildContext = Pick<SiteAssetManifest, 'schemaVersion' | 'releaseId' | 'codeSha' | 'catalogRevision'
  | 'catalogSnapshotSha256' | 'generatedAt' | 'vectorSyncWatermark' | 'priorReleaseId'>;
/** Explicit reviewed context; zero/null are valid only when actually supplied.
 * Build retries must reuse the sealed package, not overwrite an existing release ID.
 */
export function validateBuildContext(value: unknown, snapshot: CatalogSnapshot, codeSha: string, snapshotDigest: string, now = new Date()): ReleaseBuildContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Explicit release build context is required');
  const input = value as ReleaseBuildContext;
  if (Object.keys(input).sort().join(',') !== 'catalogRevision,catalogSnapshotSha256,codeSha,generatedAt,priorReleaseId,releaseId,schemaVersion,vectorSyncWatermark'
    || input.schemaVersion !== 1 || typeof input.releaseId !== 'string' || !/^[a-zA-Z0-9._-]{1,200}$/.test(input.releaseId)
    || !/^[a-f0-9]{40}$/.test(input.codeSha) || input.codeSha !== codeSha || input.catalogRevision !== snapshot.catalogRevision
    || !/^[a-f0-9]{64}$/.test(input.catalogSnapshotSha256) || input.catalogSnapshotSha256 !== snapshotDigest
    || !Number.isSafeInteger(input.vectorSyncWatermark) || input.vectorSyncWatermark < 0
    || input.priorReleaseId !== null && (typeof input.priorReleaseId !== 'string' || !/^[a-zA-Z0-9._-]{1,200}$/.test(input.priorReleaseId))
    || input.priorReleaseId === input.releaseId) throw new Error('Release build context is malformed or incompatible');
  const generated = Date.parse(canonicalTime(input.generatedAt));
  if (!Number.isFinite(now.getTime()) || generated < Date.parse(snapshot.generatedAt) || generated > now.getTime()) throw new Error('Release build context has an invalid capture time');
  return { schemaVersion: 1, releaseId: input.releaseId, codeSha: input.codeSha, catalogRevision: input.catalogRevision,
    catalogSnapshotSha256: input.catalogSnapshotSha256, generatedAt: input.generatedAt,
    vectorSyncWatermark: input.vectorSyncWatermark, priorReleaseId: input.priorReleaseId };
}

async function main() {
  const root = path.resolve(import.meta.dirname, '../..');
  const output = path.join(root, 'static-site/out');
  const generated = path.join(root, 'build/stupid-gifts');
  const source = path.resolve(process.env.CATALOG_SNAPSHOT_PATH || path.join(root, 'static-site/fixtures/catalog.snapshot.json'));
  const snapshot = validateCatalogSnapshot(JSON.parse(await fs.readFile(source, 'utf8')));
  const snapshotBytes = `${JSON.stringify(snapshot)}\n`;
  const catalogSnapshotSha256 = createHash('sha256').update(snapshotBytes).digest('hex');
  const contextPath = process.env.CATALOG_RELEASE_CONTEXT_PATH;
  if (!contextPath) throw new Error('CATALOG_RELEASE_CONTEXT_PATH must identify explicit reviewed release context');
  const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const context = validateBuildContext(JSON.parse(await fs.readFile(path.resolve(contextPath), 'utf8')), snapshot, codeSha, catalogSnapshotSha256);
  try {
    const prior = JSON.parse(await fs.readFile(path.join(generated, 'asset-manifest.json'), 'utf8'));
    if (prior.releaseId === context.releaseId) throw new Error('Release ID already built; verify and reuse the sealed package instead');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  await fs.mkdir(generated, { recursive: true });
  // Build and Worker consume exactly the same immutable public allowlist.
  const input = path.join(generated, 'catalog.snapshot.json');
  await fs.writeFile(input, snapshotBytes);
  await fs.writeFile(path.join(generated, 'release-context.json'), `${JSON.stringify(context)}\n`);
  await fs.writeFile(path.join(generated, 'feed-plan.json'), `${JSON.stringify(createStaticFeedPlan(snapshot, catalogSnapshotSha256))}\n`);
  execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', 'static-site', '--webpack'], {
    cwd: root, env: { ...process.env, CATALOG_SNAPSHOT_PATH: input }, stdio: 'inherit',
  });
  const files = (await fs.readdir(output, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort();
  const checksums: Record<string, string> = {};
  for (const file of files) {
    checksums[`/${path.relative(output, file).split(path.sep).join('/')}`] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  const routes = createStaticRoutes(snapshot, Object.keys(checksums));
  const manifest = { ...context, dataKind: snapshot.dataKind,
    nextExpiry: snapshot.products.map((product) => product.eligibleUntil).sort()[0] || null,
    productCount: snapshot.products.length,
    slugCount: snapshot.products.length + snapshot.heldProducts.length + snapshot.slugHistory.length,
    checksums, routes };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(generated, 'asset-manifest.json'), manifestBytes);
  await fs.writeFile(path.join(generated, 'release-identity.json'), `${JSON.stringify(createReleaseIdentity(manifestBytes))}\n`);
  console.log(JSON.stringify({ releaseId: manifest.releaseId, dataKind: snapshot.dataKind,
    productCount: manifest.productCount, assets: files.length, guardedRoutes: Object.keys(routes).length,
    nextExpiry: manifest.nextExpiry }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
