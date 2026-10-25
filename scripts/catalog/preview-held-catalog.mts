/** OFFLINE capacity/visual preview only. It is not a D1 capture, application
 * plan, publication receipt, owner claim or successor. No network/credentials. */
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRecoveryArchive, assertPrivateOutsideGit } from './recovery-archive.ts';
import { canonicalJson, convertSourceRow, sha256 } from './migration.ts';
import { prepareHeldCatalogResolution, heldCatalogResolutionBatches } from './held-catalog-resolution.ts';
import { validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';
import type { MutationOwner } from '../../lib/catalog/mutation-fence.ts';

async function main(argv: string[]) {
  const args: Record<string, string> = {};
  const required = ['--archive', '--manifest-sha', '--baseline', '--output', '--now', '--reference'];
  for (let i = 0; i < argv.length; i += 2) {
    if (!required.includes(argv[i]) || args[argv[i]] || !argv[i + 1]) throw Error('Explicit offline preview inputs required');
    args[argv[i]] = argv[i + 1];
  }
  if (required.some(k => !args[k])) throw Error('Explicit offline preview inputs required');
  const output = resolve(args['--output']); await assertPrivateOutsideGit(dirname(output));
  const info = await stat(args['--baseline']);
  if (!info.isFile() || info.size > 32 * 1024 * 1024) throw Error('Offline baseline bounds');
  const raw = await readFile(args['--baseline'], 'utf8'), now = args['--now'];
  const baseline = validateCatalogSnapshot(JSON.parse(raw), new Date(now));
  const archive = await validateRecoveryArchive(args['--archive'], { expectedManifestSha256: args['--manifest-sha'] });
  const source = archive.tables.find(t => t.definition.schema === 'public' && t.definition.name === 'products');
  if (!source) throw Error('Offline source table missing');
  const byId = new Map(source.rows.map(p => [p.id, p]));
  const timestamps = Object.fromEntries(['availability_checked_at', 'last_verified_at', 'created_at', 'updated_at'].map(k =>
    ['products.' + k, { timezone: 'unresolved' as const, evidence: 'Offline preview; preserve original unproven wall times, never a fresh observation' }]));
  const rows = baseline.heldProducts.map(p => {
    const original = byId.get(p.id); if (!original) throw Error('Offline source identity missing');
    return { row: convertSourceRow('products', original, { catalogRevision: 'offline-source', archiveId: args['--manifest-sha'], timestamps }), sidecar: null };
  });
  const owner: MutationOwner = { environment: 'staging', indexName: 'offline-capacity-preview', phase: 'writing',
    token: 'offline-no-provider-authority', generation: 1, epoch: 0, ownerReference: 'offline-owner-catalog-preview', operationKey: sha256(raw), capturedAt: now };
  const plan = prepareHeldCatalogResolution({ baseline, rows, owner, reference: args['--reference'], now });
  const promoted = new Set(plan.promotions.map(p => p.id)), duplicate = new Set(plan.exclusions.filter(p => p.duplicateOfProductId).map(p => p.id));
  const snapshot = validateCatalogSnapshot({ ...baseline, catalogRevision: plan.catalogRevision, generatedAt: now,
    products: [...baseline.products, ...plan.promotions.map(p => p.display)],
    heldProducts: baseline.heldProducts.filter(p => !promoted.has(p.id)).map(p => duplicate.has(p.id) ? { ...p, reason: 'duplicate' } : p) }, new Date(now));
  const bytes = JSON.stringify(snapshot) + '\n';
  const summary = { schemaVersion: 1, state: 'offline-capacity-preview-not-D1-or-publication',
    sourceManifestSha256: archive.summary.manifestSha256, sourceProductsSha256: source.definition.sha256,
    baselineSha256: sha256(raw), snapshotSha256: sha256(bytes), identities: snapshot.products.length + snapshot.heldProducts.length,
    public: snapshot.products.length, held: snapshot.heldProducts.length, promoted: plan.promotions.length,
    duplicates: duplicate.size, clearedLegacyDuplicateFlags: plan.clearedLegacyDuplicateFlags.length,
    concreteQualityExclusions: plan.exclusions.filter(p => !p.duplicateOfProductId).length,
    images: snapshot.products.filter(p => p.imageUrl).length, shortDescriptions: snapshot.products.filter(p => p.description).length,
    originalArticles: baseline.products.filter(p => p.editorialWriteup).length, articles: snapshot.products.filter(p => p.editorialWriteup).length,
    previewBatchCount: heldCatalogResolutionBatches(plan).length, providerRequests: 0, modelRequests: 0, nativeWrites: 0 };
  await mkdir(output, { mode: 0o700 });
  await writeFile(join(output, 'catalog.snapshot.json'), bytes, { mode: 0o600, flag: 'wx' });
  await writeFile(join(output, 'summary.json'), canonicalJson(summary) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ ...summary, directory: output }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(() => {
  console.error('Offline catalog preview refused; no D1/provider operation performed.'); process.exitCode = 1;
});
