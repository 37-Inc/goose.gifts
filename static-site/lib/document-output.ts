import type { CatalogAssetRoute } from "../../lib/catalog/types";

/** Native anchors load complete HTML documents; hydration uses the Flight data
 * already embedded in those documents. Standalone navigation payloads are not
 * part of this site's public contract. Keep legal/safe text and every other
 * asset. Unknown Next output shapes fail closed instead of guessing.
 */
export function documentAssets(input: ReadonlyMap<string, Uint8Array>, routes: Record<string, CatalogAssetRoute>) {
  const assets = new Map(input);
  for (const [name, bytes] of input) {
    if (!name.endsWith(".txt") || !routes[name] || name === "/robots.txt"
      || name.startsWith("/safe/") || name.startsWith("/privacy")) continue;
    const base = name.includes("/__next.") ? name.slice(0, name.indexOf("/__next.")) : name.slice(0, -4);
    const html = base === "" ? "/index.html" : `${base}.html`;
    if (!input.has(html) || name.includes("/__next.") && !/\/__next\.[a-zA-Z0-9_$.-]+\.txt$/.test(name)
      || !/^[0-9a-f]+:/m.test(new TextDecoder().decode(bytes)))
      throw new Error(`Unrecognized standalone Flight payload: ${name}`);
    assets.delete(name);
  }
  return assets;
}
