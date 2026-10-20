import snapshot from '../build/stupid-gifts/catalog.snapshot.json';
import manifest from '../build/stupid-gifts/asset-manifest.json';
import feedPlan from '../build/stupid-gifts/feed-plan.json';
import releaseIdentity from '../build/stupid-gifts/release-identity.json';
import siteIdentity from '../build/stupid-gifts/site-identity.json';
import type { CatalogSnapshot, SiteAssetManifest } from '../lib/catalog/types.ts';
import { createSiteWorker } from './site/index.ts';
import { d1SearchAdapters } from './site/d1-search.ts';

export default createSiteWorker({
  snapshot: snapshot as CatalogSnapshot,
  manifest: manifest as SiteAssetManifest,
  feedPlan,
  releaseIdentity,
  canonicalOrigin: siteIdentity.origin,
  searchAdapters: d1SearchAdapters,
  semanticBudgetScope: { environment: 'staging', index: 'stupid-gifts-staging' },
});
