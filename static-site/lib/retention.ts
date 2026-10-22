import { createHash } from "node:crypto";
import { canonicalTime, validateCatalogSnapshot } from "../../lib/catalog/snapshot";
import type { CatalogAssetRoute, CatalogSnapshot, SiteAssetManifest } from "../../lib/catalog/types";
import { projectCard, validateCardShard } from "./card-shard";
import safeCatalogPayload from "../public/safe/catalog.json";
import { catalogDeadline, persistentPublicProduct } from "../../lib/catalog/display";
import { PHOTO_PLACEHOLDER } from "./photo-shard";

export const RETENTION_OVERLAP_MS = 15 * 60 * 1000;
type SealedManifest = SiteAssetManifest & { catalogSnapshotSha256: string };
type Files = ReadonlyMap<string, Uint8Array>;
export interface RetentionInput {
  prior: {
    /** Explicit sealed release, not a directory to discover or trust implicitly. */
    releaseId: string;
    manifestSha256: string;
    manifestBytes: Uint8Array;
    snapshotBytes: Uint8Array;
    assets: Files;
  };
  current: { snapshot: CatalogSnapshot; assets: Files; routes: Record<string, CatalogAssetRoute> };
  capturedAt: string;
  limits?: { maxEntries?: number; maxBytes?: number };
}
const SHARD = /^\/catalog\/([a-f0-9]{64})\/(random|feed-[1-9][0-9]*)\.json$/;
const OWNED = /^\/_next\/static\/[a-zA-Z0-9_./[\]-]+\.(?:js|css|woff2?|ttf)$/;
const FONT = /^\/fonts\/[a-zA-Z0-9_-]+\.(?:woff2?|ttf)$/;
const SAFE_CATALOG = "/safe/catalog.json";
const SAFE_ASSET = "/safe/asset.txt";
export const assetSha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function fail(): never { throw new Error("Invalid sealed retention package"); }
function json(bytes: Uint8Array) {
  if (bytes.byteLength > 32 * 1024 * 1024) fail();
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(); }
}
function safePath(path: string) {
  return path.startsWith("/") && !path.includes("//") && !path.split("/").some((part) => part === ".." || part === ".") && !path.includes("%");
}
function limit(value: number | undefined, fallback: number, maximum: number) {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > maximum) fail();
  return n;
}
function cardContent(card: ReturnType<typeof projectCard>) {
  // A rights renewal may change only the deadline; never renew the old policy.
  const content: Partial<typeof card> = { ...card };
  delete content.eligibleUntil;
  return JSON.stringify(content);
}
export function assertOwnedCodeSafe(bytes: Uint8Array, snapshots: CatalogSnapshot[]) {
  const code = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/sourceFactsHash|sourceFacts|POSTGRES_URL|DATABASE_URL|AMAZON_SECRET|privateRights/.test(code)) fail();
  for (const snapshot of snapshots) for (const product of snapshot.products) {
    for (const field of ["title", "imageUrl", "affiliateUrl", "id", "publicId", "slug"] as const) {
      const literal = product[field];
      // Shared owned UI asset, not embedded product/supplier data. No other
      // field or local URL is exempt from the literal scan.
      if (field === "imageUrl" && literal === PHOTO_PLACEHOLDER) continue;
      if (literal.length >= 8 && (code.includes(literal) || code.includes(JSON.stringify(literal).slice(1, -1)))) fail();
    }
  }
}
/** Also used by the bounded filesystem adapter; never load arbitrary manifest paths. */
export function retentionAssetPaths(manifest: Pick<SiteAssetManifest, "checksums" | "routes">) {
  const candidates = new Set([
    ...Object.keys(manifest.checksums).filter((path) => SHARD.test(path) || OWNED.test(path) || FONT.test(path)),
    ...Object.keys(manifest.routes).filter((path) => SHARD.test(path)),
  ]);
  if (candidates.size > 8192 || [...candidates].some((path) => !safePath(path))) fail();
  return [...candidates].sort();
}

/** Pure packaging seam: caller copies returned files BEFORE final checksums/seal.
 * No old HTML/RSC, private source fields, arbitrary paths or filesystem reads.
 * A trusted prior manifest seal is mandatory; the helper never discovers one.
 */
export function retainStaticAssets(input: RetentionInput) {
  const capture = Date.parse(canonicalTime(input.capturedAt));
  const maxEntries = limit(input.limits?.maxEntries, 512, 4096);
  const maxBytes = limit(input.limits?.maxBytes, 16 * 1024 * 1024, 64 * 1024 * 1024);
  if (!/^[a-f0-9]{64}$/.test(input.prior.manifestSha256)
    || assetSha256(input.prior.manifestBytes) !== input.prior.manifestSha256) fail();
  const manifest = json(input.prior.manifestBytes) as SealedManifest;
  if (manifest.schemaVersion !== 1 || manifest.releaseId !== input.prior.releaseId
    || !manifest.routes || !manifest.checksums || !/^[a-f0-9]{64}$/.test(manifest.catalogSnapshotSha256)
    || assetSha256(input.prior.snapshotBytes) !== manifest.catalogSnapshotSha256) fail();
  const previousCapture = Date.parse(canonicalTime(manifest.generatedAt));
  if (previousCapture > capture) fail();
  const rawSnapshot = json(input.prior.snapshotBytes);
  // Structural proof at the original capture does not re-authorize old content.
  const priorSnapshot = validateCatalogSnapshot(rawSnapshot, new Date(rawSnapshot.generatedAt));
  const current = validateCatalogSnapshot(input.current.snapshot, new Date(capture));
  if (manifest.catalogRevision !== priorSnapshot.catalogRevision || manifest.dataKind !== priorSnapshot.dataKind
    || Date.parse(priorSnapshot.generatedAt) > previousCapture || current.dataKind !== priorSnapshot.dataKind) fail();
  const safeCatalog = input.current.assets.get(SAFE_CATALOG);
  if (!safeCatalog || JSON.stringify(json(safeCatalog)) !== JSON.stringify(safeCatalogPayload)
    || !input.current.assets.has(SAFE_ASSET)) fail();
  const candidates = retentionAssetPaths(manifest);
  const files = new Map<string, Uint8Array>();
  const routes: Record<string, CatalogAssetRoute> = {};
  let bytes = 0, entries = 0;
  const byId = new Map(current.products.map(p => [`${p.source}:${p.id}`, persistentPublicProduct(p) ?? p]));
  for (const path of candidates) {
    const priorPolicy = manifest.routes[path];
    const previousDeadline = priorPolicy?.retainedUntil;
    const end = previousDeadline ? Date.parse(canonicalTime(previousDeadline)) : capture + RETENTION_OVERLAP_MS;
    if (previousDeadline && end > previousCapture + RETENTION_OVERLAP_MS) fail();
    if (end <= capture) continue;
    const retainedUntil = new Date(end).toISOString();
    const oldBytes = input.prior.assets.get(path);
    if (oldBytes && assetSha256(oldBytes) !== manifest.checksums[path]) fail();
    const currentBytes = input.current.assets.get(path);
    if (currentBytes || input.current.routes[path]) {
      // Content-addressed names are immutable. Stable public fonts simply use
      // the current release; current policies always win over historical ones.
      if (oldBytes && currentBytes && !FONT.test(path) && assetSha256(oldBytes) !== assetSha256(currentBytes)) fail();
      continue;
    }
    let policy: CatalogAssetRoute;
    let copy = false;
    if (SHARD.test(path)) {
      if (!priorPolicy || priorPolicy.indexable !== false
        || !["ready", "held"].includes(priorPolicy.state)
        || priorPolicy.safeAssetPath !== SAFE_CATALOG) fail();
      let deadline = priorPolicy.eligibleUntil ? Math.min(Date.parse(canonicalTime(priorPolicy.eligibleUntil)), end) : end;
      let eligible = priorPolicy.state === "ready" && deadline > capture;
      if (eligible) {
        if (!oldBytes || priorPolicy.assetPath !== path || oldBytes.byteLength > 512 * 1024) fail();
        const payload = json(oldBytes);
        const match = path.match(SHARD)!;
        const shard = validateCardShard(payload, { catalogRevision: payload.catalogRevision,
          version: match[1], kind: match[2] === "random" ? "random" : "feed",
          now: Math.min(Date.parse(priorSnapshot.generatedAt), catalogDeadline(payload.eligibleUntil) - 1) });
        deadline = Math.min(deadline, catalogDeadline(shard.eligibleUntil));
        for (const card of shard.products) {
          const product = byId.get(`${card.source}:${card.id}`);
          if (!product || cardContent(card) !== cardContent(projectCard(product))) eligible = false;
          if (product) deadline = Math.min(deadline, catalogDeadline(product.eligibleUntil));
        }
      }
      copy = eligible && deadline > capture;
      policy = { assetPath: copy ? path : SAFE_CATALOG, safeAssetPath: SAFE_CATALOG,
        eligibleUntil: new Date(deadline).toISOString(), retainedUntil, state: copy ? "ready" : "held", indexable: false };
    } else {
      if (!oldBytes || !manifest.checksums[path] || oldBytes.byteLength > 2 * 1024 * 1024) fail();
      if (/\.(?:js|css)$/.test(path)) assertOwnedCodeSafe(oldBytes, [priorSnapshot, current]);
      copy = true;
      policy = { assetPath: path, safeAssetPath: SAFE_ASSET, eligibleUntil: retainedUntil,
        retainedUntil, state: "ready", indexable: false };
    }
    if (++entries > maxEntries) fail();
    routes[path] = policy;
    if (copy) {
      bytes += oldBytes!.byteLength;
      if (bytes > maxBytes) fail();
      files.set(path, new Uint8Array(oldBytes!));
    }
  }
  return { files, routes, bytes };
}
