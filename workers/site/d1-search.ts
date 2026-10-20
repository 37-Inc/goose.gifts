import { appendSearchDiagnostic, getProductsByPublicIds, keywordSearch } from '../../lib/catalog/storage/d1.ts';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import type { SearchAdapters, SiteEnv } from './bindings.ts';

export interface CatalogSiteEnv extends SiteEnv {
  DB: CatalogD1;
}

/** Adapter only: catalog validation, indexed SQL and batch bounds live in lib/catalog. */
export const d1SearchAdapters: SearchAdapters<CatalogSiteEnv> = {
  storage: (env) => ({
    byPublicIds: (ids, now) => getProductsByPublicIds(env.DB, ids, now),
    keyword: (query, limit, now) => keywordSearch(env.DB, query, limit, now),
  }),
  diagnostic: (event, env, now) => appendSearchDiagnostic(env.DB, event, now),
};
