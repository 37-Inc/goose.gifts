import snapshot from '../build/stupid-gifts/catalog.snapshot.json';
import manifest from '../build/stupid-gifts/asset-manifest.json';
import type { CatalogSnapshot, SiteAssetManifest } from '../lib/catalog/types.ts';
import { createSiteWorker } from './site/index.ts';
import { d1SearchAdapters } from './site/d1-search.ts';

export default createSiteWorker({
  snapshot: snapshot as CatalogSnapshot,
  manifest: manifest as SiteAssetManifest,
  searchAdapters: d1SearchAdapters,
});
