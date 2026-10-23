import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createBrowseRelease, INITIAL_BROWSE_COUNT } from "../static-site/lib/browse.ts";
import { validateCardShard } from "../static-site/lib/card-shard.ts";
import { assetSha256, retainStaticAssets, RETENTION_OVERLAP_MS } from "../static-site/lib/retention.ts";

const owned = JSON.parse(fs.readFileSync(new URL("../static-site/fixtures/catalog.snapshot.json", import.meta.url)));
const at = "2026-10-20T10:00:00.000Z";
const iso = (minutes) => new Date(Date.parse(at) + minutes * 60000).toISOString();
const encode = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const unavailable = JSON.parse(fs.readFileSync(new URL("../static-site/public/safe/catalog.json", import.meta.url)));
const safe = () => new Map([["/safe/catalog.json", encode(unavailable)],
  ["/safe/asset.txt", encode("Reload this page.")]]);
function snapshot(revision = "one", generatedAt = iso(-5)) {
  return { ...owned, catalogRevision: revision, generatedAt, heldProducts: [], slugHistory: [],
    products: Array.from({ length: 60 }, (_, i) => ({ ...owned.products[0],
      id: `owned-study-${i}`, publicId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      title: `Owned fictional object ${i}`, slug: `owned-fictional-object-${i}`,
      eligibleUntil: iso(60) })) };
}
function release(input, generatedAt = iso(-4), carried) {
  const browse = createBrowseRelease(input);
  const assets = safe();
  const routes = {};
  for (const shard of browse.shards) {
    assets.set(shard.path, encode(shard.payload));
    routes[shard.path] = { assetPath: shard.path, safeAssetPath: "/safe/catalog.json",
      eligibleUntil: shard.eligibleUntil, state: shard.payload.status === "ready" ? "ready" : "held", indexable: false };
  }
  assets.set("/_next/static/chunks/old-a1b2.js", encode('console.log("shared UI only")'));
  assets.set("/_next/static/css/old-c3d4.css", encode(".card{color:#22231f}"));
  assets.set("/_next/static/media/font-a1b2.woff2", new Uint8Array([1, 2, 3, 4]));
  assets.set("/index.html", encode("Old page must never survive"));
  assets.set("/index.txt", encode("Old RSC must never survive"));
  if (carried) {
    for (const [key, bytes] of carried.files) assets.set(key, bytes);
    Object.assign(routes, carried.routes);
  }
  const snapshotBytes = encode(input);
  const manifest = { schemaVersion: 1, releaseId: `release-${input.catalogRevision}`, generatedAt,
    catalogRevision: input.catalogRevision, dataKind: input.dataKind,
    catalogSnapshotSha256: assetSha256(snapshotBytes), routes,
    checksums: Object.fromEntries([...assets].map(([p, b]) => [p, assetSha256(b)])) };
  const manifestBytes = encode(manifest);
  return { releaseId: manifest.releaseId, manifestBytes, manifestSha256: assetSha256(manifestBytes), snapshotBytes, assets, browse, manifest };
}
function current(input) {
  const now = release(input);
  // Different generated build chunks after deployment.
  for (const path of now.assets.keys()) if (path.startsWith("/_next/")) now.assets.delete(path);
  return { snapshot: input, assets: now.assets, routes: now.manifest.routes };
}
function run(prior, next = snapshot("two"), capturedAt = at, extra = {}) {
  return retainStaticAssets({ prior, current: current(next), capturedAt, ...extra });
}
function reseal(prior, change) {
  const manifest = structuredClone(prior.manifest);
  change(manifest);
  const manifestBytes = encode(manifest);
  return { ...prior, manifest, manifestBytes, manifestSha256: assetSha256(manifestBytes) };
}

test("two releases retain exact old-client shard chains and only sealed owned build assets", () => {
  const prior = release(snapshot());
  const retained = run(prior);
  const first = prior.browse.shards[0];
  let next = first.path, count = 0;
  while (next) {
    const policy = retained.routes[next];
    assert.equal(policy.state, "ready");
    assert.equal(policy.indexable, false);
    assert.equal(policy.eligibleUntil, iso(15));
    const shard = validateCardShard(JSON.parse(new TextDecoder().decode(retained.files.get(next))), {
      catalogRevision: "one", version: prior.browse.version, kind: "feed", now: Date.parse(at) });
    count += shard.products.length;
    next = shard.next;
  }
  assert.equal(count, snapshot().products.length - INITIAL_BROWSE_COUNT);
  for (const path of ["/_next/static/chunks/old-a1b2.js", "/_next/static/css/old-c3d4.css", "/_next/static/media/font-a1b2.woff2"])
    assert.deepEqual(retained.files.get(path), prior.assets.get(path));
  assert.equal(retained.files.has("/index.html"), false);
  assert.equal(retained.files.has("/index.txt"), false);
  assert.equal(retained.routes["/index.html"], undefined);
  assert.equal(Date.parse(retained.routes[first.path].retainedUntil) - Date.parse(at), RETENTION_OVERLAP_MS);
});
test("retention deadline survives release chains and drops at the original boundary", () => {
  const first = release(snapshot());
  const secondSnapshot = snapshot("two", iso(4));
  const firstCarry = run(first, snapshot("two"));
  const second = release(secondSnapshot, iso(5), firstCarry);
  // New release uses different owned paths; old ones came exclusively from carryover.
  const third = run(second, snapshot("three", iso(9)), iso(10));
  const path = first.browse.shards[0].path;
  assert.equal(third.routes[path].retainedUntil, iso(15));
  assert.equal(third.routes[path].eligibleUntil, iso(15));
  const after = run(second, snapshot("three", iso(9)), iso(15));
  assert.equal(after.routes[path], undefined);
  assert.equal(after.files.has(path), false);
  assert.equal(after.files.has("/_next/static/chunks/old-a1b2.js"), false);
});
test("held, changed or retired products never survive in historical shard bytes", () => {
  const prior = release(snapshot());
  const target = prior.browse.shards[0].payload.products[3].id;
  const position = s => s.products.findIndex(p => p.id === target);
  for (const mutate of [
    (s) => s.products.splice(position(s), 1),
    (s) => { s.products[position(s)].title = "New approved display copy"; },
    (s) => { const p = s.products.splice(position(s), 1)[0]; s.heldProducts.push({ id: p.id, publicId: p.publicId,
      slug: p.slug, path: `/gifts/${p.slug}`, title: "Gift currently unavailable",
      description: "This gift is not currently available in the curated catalog. Browse other gifts instead.", reason: "editorial_hold" }); },
  ]) {
    const next = snapshot("two"); mutate(next);
    const retained = run(prior, next);
    const path = prior.browse.shards[0].path;
    assert.equal(retained.files.has(path), false);
    assert.equal(retained.routes[path].state, "held");
    assert.equal(retained.routes[path].assetPath, "/safe/catalog.json");
    assert.equal(retained.routes[path].indexable, false);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(current(next).assets.get(retained.routes[path].safeAssetPath))),
      unavailable);
  }
});
test("original and current rights cap overlap; expiry never copies stale merchant bytes", () => {
  const old = snapshot(), target = createBrowseRelease(old).shards[0].payload.products[3].id;
  old.products.find(p => p.id === target).eligibleUntil = iso(3);
  const prior = release(old);
  const renewed = run(prior);
  assert.equal(renewed.routes[prior.browse.shards[0].path].eligibleUntil, iso(3));
  const shortened = snapshot("two"); shortened.products.find(p => p.id === target).eligibleUntil = iso(1);
  assert.equal(run(prior, shortened).routes[prior.browse.shards[0].path].eligibleUntil, iso(1));
  const expired = run(prior, snapshot("two", iso(4)), iso(5));
  assert.equal(expired.files.has(prior.browse.shards[0].path), false);
  assert.equal(expired.routes[prior.browse.shards[0].path].state, "held");
});
test("unavailable aliases remain unavailable across releases and never regain old bytes", () => {
  const old = snapshot(); old.products = [];
  const prior = release(old);
  const first = run(prior);
  const path = prior.browse.random.poolPath;
  assert.equal(first.routes[path].state, "held");
  assert.equal(first.files.has(path), false);
  const second = release(snapshot("two", iso(4)), iso(5), first);
  const third = run(second, snapshot("three", iso(9)), iso(10));
  assert.equal(third.routes[path].state, "held");
  assert.equal(third.routes[path].retainedUntil, iso(15));
  assert.equal(third.files.has(path), false);
});
test("seal, snapshot, asset tampering, immutable collision and unsafe code fail closed", () => {
  const prior = release(snapshot());
  assert.throws(() => run({ ...prior, manifestSha256: "0".repeat(64) }), /retention/);
  assert.throws(() => run({ ...prior, snapshotBytes: encode(snapshot("tampered")) }), /retention/);
  assert.throws(() => run({ ...prior, releaseId: "wrong" }), /retention/);
  const changed = { ...prior, assets: new Map(prior.assets) };
  changed.assets.set(prior.browse.shards[0].path, encode("tampered"));
  assert.throws(() => run(changed), /retention/);
  const next = current(snapshot("two"));
  next.assets.set("/_next/static/chunks/old-a1b2.js", encode("collision"));
  assert.throws(() => retainStaticAssets({ prior, current: next, capturedAt: at }), /retention/);
  for (const code of [JSON.stringify(prior.browse.opening[0].title), "window.sourceFactsHash='private'"]) {
    const assets = new Map(prior.assets); assets.set("/_next/static/chunks/old-a1b2.js", encode(code));
    const unsafe = reseal({ ...prior, assets }, (m) => { m.checksums["/_next/static/chunks/old-a1b2.js"] = assetSha256(encode(code)); });
    assert.throws(() => run(unsafe), /retention/);
  }
});
test("path/count/byte bounds reject unsafe packaging; current policies win", () => {
  const prior = release(snapshot());
  const unsafe = reseal(prior, (m) => { m.checksums["/_next/static/../secret.js"] = "a".repeat(64); });
  assert.throws(() => run(unsafe), /retention/);
  assert.throws(() => run(prior, undefined, at, { limits: { maxEntries: 1 } }), /retention/);
  assert.throws(() => run(prior, undefined, at, { limits: { maxBytes: 1 } }), /retention/);
  const same = current(snapshot());
  const result = retainStaticAssets({ prior, current: same, capturedAt: at });
  assert.equal(result.routes[prior.browse.shards[0].path], undefined);
  assert.equal(result.files.has(prior.browse.shards[0].path), false);
});
