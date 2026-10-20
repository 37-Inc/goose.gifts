import { readFile } from 'node:fs/promises';
import { validateCatalogSnapshot } from '../../lib/catalog/snapshot.ts';

/** Build-only entry point. Never imports a provider or reads credentials. */
export async function readCatalogSnapshot(path: string, now = new Date()) {
  return validateCatalogSnapshot(JSON.parse(await readFile(path, 'utf8')), now);
}
