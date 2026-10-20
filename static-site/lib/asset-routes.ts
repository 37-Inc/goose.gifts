import type {
  CatalogAssetRoute,
  CatalogSnapshot,
} from "../../lib/catalog/types";
import { guides, selectGuideProducts } from "./guides";
import { directoryPages, directoryPath } from "./directory";

type RoutePolicy = Omit<CatalogAssetRoute, "assetPath"> & {
  indexable: boolean;
  assetPath?: string;
};
function earliest(deadlines: string[]) {
  return deadlines.length ? [...deadlines].sort()[0] : null;
}

/** Bind every exported HTML/RSC companion to the page's exact expiry policy.
 * Pass the actual output inventory: Next versions may add new RSC filenames.
 * Unrecognized content-bearing pages fail closed instead of leaking stale data.
 */
export function createStaticRoutes(
  snapshot: CatalogSnapshot,
  assetPaths: string[],
): Record<string, CatalogAssetRoute & { indexable: boolean }> {
  const nextExpiry = earliest(
    snapshot.products.map((product) => product.eligibleUntil),
  );
  const policies: Record<string, RoutePolicy> = {};
  const catalog: RoutePolicy = {
    safeAssetPath: "/safe/catalog.html",
    eligibleUntil: nextExpiry,
    state: "ready",
    indexable: snapshot.dataKind !== "synthetic_fixture",
  };
  for (const pathname of ["/", "/random-gift", "/weird-gift-index"])
    policies[pathname] = { ...catalog };
  policies["/gift-guides"] = { ...catalog, eligibleUntil: null };
  for (const guide of guides) {
    const products = selectGuideProducts(snapshot, guide);
    policies[`/gift-guides/${guide.slug}`] = {
      ...catalog,
      eligibleUntil: earliest(products.map((p) => p.eligibleUntil)),
      indexable: catalog.indexable && products.length > 0,
    };
  }
  for (const page of directoryPages(snapshot)) {
    const policy = {
      ...catalog,
      // Counts and pagination describe the full snapshot, not just this page.
      eligibleUntil: nextExpiry,
      indexable: catalog.indexable && page.products.length > 0,
    };
    policies[directoryPath(page.page)] = policy;
    if (page.page === 1)
      policies["/gifts/page/1"] = { ...policy, indexable: false };
  }
  policies["/weird-gift-index/data"] = {
    ...catalog,
    assetPath: "/weird-gift-index/data.json",
    safeAssetPath: "/safe/index.json",
    indexable: false,
  };
  policies["/howie"] = { ...catalog, eligibleUntil: null, indexable: false };
  policies["/preview/presentation"] = { ...catalog, indexable: false };
  for (const product of snapshot.products) {
    const displayed = [
      product,
      ...snapshot.products.filter((item) => item.id !== product.id).slice(0, 3),
    ];
    policies[`/gifts/${product.slug}`] = {
      ...catalog,
      eligibleUntil: earliest(displayed.map((item) => item.eligibleUntil)),
      safeAssetPath: "/safe/product.html",
    };
  }
  for (const held of snapshot.heldProducts)
    policies[held.path] = {
      ...catalog,
      eligibleUntil: null,
      state: "held",
      indexable: false,
      safeAssetPath: `${held.path}.html`,
    };
  const routes: Record<string, CatalogAssetRoute & { indexable: boolean }> = {};
  const existing = new Set(assetPaths);
  for (const [pathname, policy] of Object.entries(policies)) {
    const assetPath =
      policy.assetPath ||
      (pathname === "/" ? "/index.html" : `${pathname}.html`);
    if (!existing.has(assetPath))
      throw new Error(`Static route is missing its HTML: ${pathname}`);
    routes[pathname] = { ...policy, assetPath };
  }
  for (const assetPath of assetPaths) {
    if (
      !/\.(?:html|txt|json)$/.test(assetPath) ||
      /^\/(?:_next|safe|privacy|fonts|robots|404|_not-found)(?:[/\.]|$)/.test(
        assetPath,
      )
    )
      continue;
    let pathname: string;
    if (/^\/(?:index\.(?:html|txt)|__next\.[^/]+\.txt)$/.test(assetPath))
      pathname = "/";
    else if (assetPath.includes("/__next."))
      pathname = assetPath.slice(0, assetPath.indexOf("/__next."));
    else pathname = assetPath.replace(/\.(?:html|txt|json)$/, "");
    const policy = policies[pathname];
    if (!policy)
      throw new Error(`Content artifact has no freshness policy: ${assetPath}`);
    const safeAssetPath = assetPath.endsWith(".txt")
      ? policy.safeAssetPath.replace(/\.html$/, ".txt")
      : policy.safeAssetPath;
    if (!existing.has(safeAssetPath))
      throw new Error(
        `Static route is missing its safe variant: ${safeAssetPath}`,
      );
    routes[assetPath] = {
      ...policy,
      assetPath,
      safeAssetPath,
      indexable: false,
    };
  }
  return routes;
}
