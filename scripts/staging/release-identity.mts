import { createHash } from 'node:crypto';
import type { SiteAssetManifest } from '../../lib/catalog/types.ts';

/** Separate from the manifest: its checksum cannot be embedded in its own bytes. */
export function createReleaseIdentity(manifestBytes: Uint8Array) {
  const manifest: SiteAssetManifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  return {
    release_id: manifest.releaseId,
    code_sha: manifest.codeSha,
    catalog_revision: manifest.catalogRevision,
    catalog_snapshot_sha256: manifest.catalogSnapshotSha256,
    manifest_sha256: createHash('sha256').update(manifestBytes).digest('hex'),
  };
}

export function verifyReleaseIdentity(manifestBytes: Uint8Array, identity: unknown): void {
  if (JSON.stringify(identity) !== JSON.stringify(createReleaseIdentity(manifestBytes)))
    throw new Error('Deployed release identity does not match the exact manifest bytes');
}
