import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import { createStaticRoutes } from '../../static-site/lib/asset-routes.ts';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'static-site/out');
const generated = path.join(root, 'build/stupid-gifts');
const source = path.resolve(process.env.CATALOG_SNAPSHOT_PATH || path.join(root, 'static-site/fixtures/catalog.snapshot.json'));
const snapshot = validateCatalogSnapshot(JSON.parse(await fs.readFile(source, 'utf8')));
await fs.mkdir(generated, { recursive: true });
// Build and Worker consume exactly the same immutable public allowlist.
const input = path.join(generated, 'catalog.snapshot.json');
const snapshotBytes = `${JSON.stringify(snapshot)}\n`;
await fs.writeFile(input, snapshotBytes);
execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', 'static-site', '--webpack'], {
  cwd: root, env: { ...process.env, CATALOG_SNAPSHOT_PATH: input }, stdio: 'inherit',
});
const files = (await fs.readdir(output, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name)).sort();
const checksums: Record<string, string> = {};
for (const file of files) {
  const bytes = await fs.readFile(file);
  checksums[`/${path.relative(output, file).split(path.sep).join('/')}`] = createHash('sha256').update(bytes).digest('hex');
}
const routes = createStaticRoutes(snapshot, Object.keys(checksums));
const generatedAt = new Date().toISOString();
const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const manifest = {
  schemaVersion: 1, releaseId: `${snapshot.catalogRevision}-${codeSha.slice(0, 12)}`,
  codeSha, catalogRevision: snapshot.catalogRevision, generatedAt,
  catalogSnapshotSha256: createHash('sha256').update(snapshotBytes).digest('hex'),
  dataKind: snapshot.dataKind,
  nextExpiry: snapshot.products.map((product) => product.eligibleUntil).sort()[0] || null,
  productCount: snapshot.products.length,
  slugCount: snapshot.products.length + snapshot.heldProducts.length + snapshot.slugHistory.length,
  vectorSyncWatermark: 0, priorReleaseId: null,
  checksums, routes,
};
await fs.writeFile(path.join(generated, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ releaseId: manifest.releaseId, dataKind: snapshot.dataKind,
  productCount: manifest.productCount, assets: files.length, guardedRoutes: Object.keys(routes).length,
  nextExpiry: manifest.nextExpiry }));
