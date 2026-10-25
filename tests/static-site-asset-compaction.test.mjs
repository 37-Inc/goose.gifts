import assert from "node:assert/strict";
import test from "node:test";
import { compactRscAssets, expandRscAssets } from "../static-site/lib/asset-compaction.ts";
import { createSiteWorker } from "../workers/site/index.ts";

const encode = value => new TextEncoder().encode(value);
const at = Date.parse("2026-10-24T10:00:00.000Z");
const expires = "2026-10-24T11:00:00.000Z";
function fixture() {
  const assets = new Map([
    ["/gifts/one.txt", encode("one full page")],
    ["/gifts/one/__next._full.txt", encode("one full page")],
    ["/gifts/two.txt", encode("two full page")],
    ["/gifts/two/__next._full.txt", encode("two full page")],
    ["/gifts/one/__next._index.txt", encode("shared layout")],
    ["/gifts/two/__next._index.txt", encode("shared layout")],
    ["/gifts/one.html", encode("one HTML")],
    ["/gifts/two.html", encode("two HTML")],
    ["/safe/product.txt", encode("safe expired page")],
    ["/privacy.txt", encode("shared layout")],
    ["/robots.txt", encode("shared layout")],
    ["/_next/static/chunks/app.js", encode("shared layout")],
  ]);
  const routes = Object.fromEntries([...assets.keys()].filter(name => name.startsWith("/gifts/")).map(name => [name, {
    assetPath: name, safeAssetPath: "/safe/product.txt", eligibleUntil: name.includes("two") ? expires : null,
    state: "ready", indexable: false,
  }]));
  return { assets, routes };
}

test("exact duplicate RSC files share bytes without dropping URLs, policies or other assets", () => {
  const { assets, routes } = fixture();
  const compacted = compactRscAssets(assets, routes);
  assert.equal(compacted.assets.size, assets.size - 3);
  assert.deepEqual(compacted.assetAliases, {
    "/gifts/one/__next._full.txt": "/gifts/one.txt",
    "/gifts/two/__next._full.txt": "/gifts/two.txt",
    "/gifts/two/__next._index.txt": "/gifts/one/__next._index.txt",
  });
  assert.deepEqual([...expandRscAssets(compacted.assets, compacted.assetAliases)].sort(), [...assets].sort());
  for (const [name, policy] of Object.entries(routes)) {
    assert.equal(compacted.routes[name].eligibleUntil, policy.eligibleUntil);
    assert.equal(compacted.routes[name].state, policy.state);
    assert.equal(compacted.routes[name].indexable, policy.indexable);
    assert.deepEqual(compacted.assets.get(compacted.routes[name].assetPath), assets.get(name));
  }
  assert.deepEqual(assets, fixture().assets);
  assert.deepEqual(compactRscAssets(new Map([...assets].reverse()), routes).assetAliases, compacted.assetAliases);
  for (const unchanged of ["/privacy.txt", "/robots.txt", "/safe/product.txt", "/gifts/one.html", "/_next/static/chunks/app.js"])
    assert.deepEqual(compacted.assets.get(unchanged), assets.get(unchanged));
});

test("aliases are single-hop RSC paths, never missing bodies, arbitrary files or traversal", () => {
  const { assets, routes } = fixture(), compacted = compactRscAssets(assets, routes);
  for (const aliases of [null, [], { "/gifts/one.html": "/gifts/two.txt" },
    { "/gifts/missing.txt": "/gifts/not-present.txt" }, { "/gifts/one.txt": "/gifts/two.txt" },
    { "/gifts/../other.txt": "/gifts/one.txt" }, { "/gifts/%2f.txt": "/gifts/one.txt" },
    { "/gifts/a.txt": "/gifts/b.txt", "/gifts/b.txt": "/gifts/one.txt" },
    { "/safe/other.txt": "/gifts/one.txt" }, { "/robots.txt": "/gifts/one.txt" }])
    assert.throws(() => expandRscAssets(compacted.assets, aliases), /RSC asset aliases/);
});

test("Worker serves every aliased URL byte-for-byte and preserves distinct expiry, headers and safe fallback", async () => {
  const { assets, routes } = fixture(), compacted = compactRscAssets(assets, routes);
  const snapshot = { schemaVersion: 1, dataKind: "synthetic_fixture", catalogRevision: "alias-test", generatedAt: new Date(at).toISOString(), products: [], heldProducts: [], slugHistory: [] };
  const manifest = { schemaVersion: 1, catalogRevision: snapshot.catalogRevision, releaseId: "alias-test", routes: compacted.routes, checksums: {} };
  let now = at;
  const worker = createSiteWorker({ manifest, snapshot, now: () => now });
  const env = { ENVIRONMENT: "production", ASSETS: { async fetch(request) {
    const name = new URL(request.url).pathname, bytes = compacted.assets.get(name);
    return new Response(bytes, { status: bytes ? 200 : 404, headers: { "Content-Type": name.endsWith(".txt") ? "text/x-component" : "text/html" } });
  } } };
  for (const [name, bytes] of assets) if (routes[name]) {
    const response = await worker.fetch(new Request(`https://example.invalid${name}`, { headers: { RSC: "1" } }), env);
    assert.equal(response.status, 200, name);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes, name);
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, follow");
    if (name.endsWith(".txt")) assert.equal(response.headers.get("Content-Type"), "text/x-component");
  }
  now = Date.parse(expires);
  const finite = await worker.fetch(new Request("https://example.invalid/gifts/two/__next._index.txt"), env);
  assert.equal(await finite.text(), "safe expired page");
  assert.equal(finite.headers.get("Cache-Control"), "no-store");
  const permanent = await worker.fetch(new Request("https://example.invalid/gifts/one/__next._index.txt"), env);
  assert.equal(await permanent.text(), "shared layout");
});

test("3383-product companion shape fits Free without catalog removal or dropping any RSC URL", () => {
  const assets = new Map(), routes = {};
  for (let i = 0; i < 3383; i++) {
    const base = `/gifts/product-${i}`, layout = "/__next._index.txt";
    for (const [suffix, body] of [[".html", `HTML${i}`], [".txt", `full${i}`], ["/__next._full.txt", `full${i}`],
      [layout, "shared layout"], ["/__next._tree.txt", `tree${i}`], ["/__next.gifts.$d$slug.__PAGE__.txt", `page${i}`]]) {
      const name = `${base}${suffix}`;
      assets.set(name, encode(body));
      routes[name] = { assetPath: name, safeAssetPath: "/safe/product.txt", eligibleUntil: null, state: "ready", indexable: false };
    }
    assets.set(`/og/product-${i}.png`, encode(`OG${i}`));
  }
  const compacted = compactRscAssets(assets, routes);
  assert.equal(assets.size, 23681);
  assert.equal(compacted.assets.size, 16916);
  assert.equal(Object.keys(compacted.routes).length, Object.keys(routes).length);
  assert.ok(compacted.assets.size < 20000);
});
