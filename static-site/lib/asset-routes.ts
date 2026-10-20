import type {
  CatalogAssetRoute,
  CatalogSnapshot,
} from "../../lib/catalog/types";
import { guides, selectGuideProducts } from "./guides";
import { directoryPages, directoryPath } from "./directory";
import { createBrowseRelease } from "./browse";
import { createShowRelease, episodePath } from "./show";
import { createOgRelease, ogPath } from "./og";
import type { OgIdentity } from "./og";
import { siteIdentity, siteIdentityFor } from "./site-identity";

type RoutePolicy = Omit<CatalogAssetRoute, "assetPath"> & {
  indexable: boolean;
  assetPath?: string;
};
function earliest(deadlines: string[]) {
  return deadlines.length ? [...deadlines].sort()[0] : null;
}

function heldCompanions(assetPaths: string[]) {
  const base = "/safe/product";
  const existing = new Set(assetPaths);
  const formats: Record<string, string> = {
    "/__next._full.txt": "/__next._full.txt",
    "/__next._tree.txt": "/__next._tree.txt",
    "/__next.safe.product.__PAGE__.txt": "/__next.gifts.$d$slug.__PAGE__.txt",
  };
  const discovered = assetPaths.filter((path) => path.startsWith(`${base}/`));
  if (!existing.has(`${base}.html`) || !existing.has(`${base}.txt`)
    || Object.keys(formats).some((suffix) => !existing.has(`${base}${suffix}`)))
    throw new Error("Shared safe product is missing HTML/RSC companions");
  if (discovered.some((path) => !formats[path.slice(base.length)]))
    throw new Error("Shared safe product has an unrecognized companion format");
  return [["", `${base}.html`], [".html", `${base}.html`], [".txt", `${base}.txt`],
    ...discovered.map((path) => [formats[path.slice(base.length)], path])];
}

/** Bind every exported HTML/RSC companion to the page's exact expiry policy.
 * Pass the actual output inventory: Next versions may add new RSC filenames.
 * Unrecognized content-bearing pages fail closed instead of leaking stale data.
 */
export function createStaticRoutes(
  snapshot: CatalogSnapshot,
  assetPaths: string[],
  showInputs?: unknown[],
  identity: OgIdentity = siteIdentity,
): Record<string, CatalogAssetRoute & { indexable: boolean }> {
  const nextExpiry = earliest(
    snapshot.products.map((product) => product.eligibleUntil),
  );
  const policies: Record<string, RoutePolicy> = {};
  const og = createOgRelease(snapshot, identity);
  for (const [path, card] of og.byPath) policies[path] = {
    assetPath: path, safeAssetPath: ogPath(og.brand), eligibleUntil: card.eligibleUntil,
    state: "ready", indexable: false,
  };
  const catalog: RoutePolicy = {
    safeAssetPath: "/safe/catalog.html",
    eligibleUntil: nextExpiry,
    state: "ready",
    indexable: snapshot.dataKind !== "synthetic_fixture"
      && [siteIdentityFor("goose-production").origin, siteIdentityFor("stupid-production").origin].includes(identity.origin),
  };
  for (const pathname of ["/", "/random-gift", "/weird-gift-index"])
    policies[pathname] = { ...catalog,
      state: snapshot.products.length ? "ready" : "held",
      indexable: catalog.indexable && snapshot.products.length > 0 };
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
      state: snapshot.products.length ? "ready" as const : "held" as const,
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
  const show = createShowRelease(snapshot, showInputs);
  policies["/howie"] = { ...catalog, eligibleUntil: show.latest?.eligibleUntil || null,
    safeAssetPath: "/safe/howie.html", indexable: catalog.indexable && Boolean(show.latest) };
  policies["/preview/presentation"] = { ...catalog,
    eligibleUntil: show.preview?.eligibleUntil || null, safeAssetPath: "/safe/presentation.html", indexable: false };
  for (const episode of show.episodes) {
    const pathname = episodePath(episode.key);
    const policy = { ...catalog, eligibleUntil: episode.eligibleUntil,
      safeAssetPath: `/safe${pathname}.html` };
    policies[pathname] = policy;
    policies[`${pathname}/presentation`] = { ...policy,
      safeAssetPath: `/safe${pathname}/presentation.html`, indexable: false };
    policies[`${pathname}/data.json`] = { ...policy, assetPath: `${pathname}/data.json`,
      safeAssetPath: `/safe${pathname}/data.json`, indexable: false };
  }
  for (const shard of createBrowseRelease(snapshot).shards)
    policies[shard.path] = {
      ...catalog,
      assetPath: shard.path,
      safeAssetPath: "/safe/catalog.json",
      eligibleUntil: shard.eligibleUntil,
      state: shard.payload.status === "ready" ? "ready" : "held",
      indexable: false,
    };
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
  const companions = snapshot.heldProducts.length ? heldCompanions(assetPaths) : [];
  const heldPaths = new Set(snapshot.heldProducts.map((held) => held.path));
  if (assetPaths.some((path) => heldPaths.has(path.replace(/\.(?:html|txt)$/, "").split("/__next.")[0])))
    throw new Error("Held products must use shared safe assets, not individual exports");
  for (const held of snapshot.heldProducts)
    for (const [suffix, assetPath] of companions)
      policies[`${held.path}${suffix}`] = {
        eligibleUntil: null, state: "held", indexable: false,
        assetPath, safeAssetPath: assetPath,
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
    if (policies[assetPath]) pathname = assetPath;
    else if (/^\/(?:index\.(?:html|txt)|__next\.[^/]+\.txt)$/.test(assetPath))
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
