import { createHash } from "node:crypto";
import type { CatalogAssetRoute } from "../../lib/catalog/types";

type Files = ReadonlyMap<string, Uint8Array>;
type Routes = Record<string, CatalogAssetRoute>;

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const rscPath = (name: string) => name.endsWith(".txt") && name !== "/robots.txt"
  && !name.startsWith("/safe/") && !name.startsWith("/privacy");
const order = (left: string, right: string) => Number(left.includes("/__next.")) - Number(right.includes("/__next."))
  || (left < right ? -1 : left > right ? 1 : 0);

/** Store identical Flight bytes once, retaining every original URL's policy.
 * This does not remove RSC features, merge HTML, or change content/deadlines.
 */
export function compactRscAssets(input: Files, routes: Routes) {
  const groups = new Map<string, string[]>();
  for (const [name, bytes] of input) {
    if (!rscPath(name) || routes[name]?.assetPath !== name) continue;
    const digest = hash(bytes), group = groups.get(digest) ?? [];
    group.push(name); groups.set(digest, group);
  }
  const aliases: Record<string, string> = {};
  const assets = new Map(input);
  for (const names of groups.values()) {
    names.sort(order);
    for (const name of names.slice(1)) {
      // Exact bytes as well as the digest are compared before removing a file.
      if (!Buffer.from(input.get(name)!).equals(Buffer.from(input.get(names[0])!)))
        throw new Error("RSC asset hash collision");
      aliases[name] = names[0]; assets.delete(name);
    }
  }
  const assetAliases = Object.fromEntries(Object.entries(aliases).sort(([left], [right]) => order(left, right)));
  const rewritten = Object.fromEntries(Object.entries(routes).map(([name, route]) => [name, {
    ...route,
    assetPath: aliases[route.assetPath] ?? route.assetPath,
    safeAssetPath: aliases[route.safeAssetPath] ?? route.safeAssetPath,
  }]));
  return { assets, routes: rewritten, assetAliases };
}

/** Reconstruct logical exports before independent route/retention verification.
 * Only one-hop aliases to existing exact sealed bytes are accepted.
 */
export function expandRscAssets(assets: Files, value: unknown): Map<string, Uint8Array> {
  if (value === undefined) return new Map(assets);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid RSC asset aliases");
  const entries = Object.entries(value);
  if (entries.length > 100000) throw new Error("Invalid RSC asset aliases");
  const expanded = new Map(assets);
  for (const [alias, target] of entries) {
    if (!rscPath(alias) || typeof target !== "string" || !rscPath(target) || alias === target
      || assets.has(alias) || !assets.has(target) || Object.hasOwn(value, target)
      || /[\\%?#\0]/.test(alias) || !alias.startsWith("/") || alias.includes("//")
      || alias.split("/").some(part => part === "." || part === ".."))
      throw new Error("Invalid RSC asset aliases");
    expanded.set(alias, assets.get(target)!);
  }
  return expanded;
}
