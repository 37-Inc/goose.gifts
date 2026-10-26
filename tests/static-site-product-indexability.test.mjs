import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validatePublicCatalogProduct } from "../lib/catalog/snapshot.ts";
import { createSiteWorker } from "../workers/site/index.ts";

test("public allowlist validation still rejects inactive and missing-content products", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../static-site/fixtures/catalog.snapshot.json", import.meta.url)));
  const product = fixture.products[0], now = new Date(fixture.generatedAt);
  assert.throws(() => validatePublicCatalogProduct({ ...product, isActive: false }, now, true));
  assert.throws(() => validatePublicCatalogProduct({ ...product, description: "" }, now, true));
});

test("product HTML metadata and canonical route policy share the same indexing decision", () => {
  for (const file of ["../static-site/lib/asset-routes.ts", "../static-site/app/gifts/[slug]/page.product.tsx"]) {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /product\.indexable/);
    assert.match(source, /indexable: (?:catalog\.indexable|true)/);
  }
});

test("Worker exposes indexable canonical pages in sitemap but keeps auxiliary and query exclusions", async () => {
  const snapshot = { schemaVersion: 1, dataKind: "catalog", catalogRevision: "indexability-proof",
    generatedAt: "2026-10-26T00:00:00.000Z", products: [], heldProducts: [], slugHistory: [] };
  const policy = { assetPath: "/gifts/short-listing.html", safeAssetPath: "/safe/product.html",
    eligibleUntil: null, state: "ready", indexable: true };
  const manifest = { catalogRevision: snapshot.catalogRevision, routes: {
    "/gifts/short-listing": policy,
    "/gifts/held": { ...policy, state: "held", indexable: false },
    "/gifts/short-listing.html": { ...policy, indexable: false },
    "/preview/presentation": { ...policy, indexable: false },
    "/gifts/finite": { ...policy, eligibleUntil: "2026-10-26T01:00:00.000Z" },
    "/gifts/expired": { ...policy, eligibleUntil: "2026-10-25T00:00:00.000Z" },
  } };
  const worker = createSiteWorker({ manifest, snapshot, now: () => Date.parse(snapshot.generatedAt) });
  const env = { ENVIRONMENT: "production", ASSETS: { async fetch() {
    return new Response("<h1>Approved short listing</h1>", { headers: { "Content-Type": "text/html" } });
  } } };
  const read = pathname => worker.fetch(new Request("https://stupid.gifts" + pathname), env);
  const page = await read("/gifts/short-listing");
  assert.equal(page.status, 200); assert.equal(page.headers.get("X-Robots-Tag"), null);
  assert.equal((await read("/gifts/finite")).headers.get("X-Robots-Tag"), null);
  for (const pathname of ["/gifts/short-listing?q=desk", "/gifts/held", "/gifts/short-listing.html", "/preview/presentation", "/gifts/expired"])
    assert.match((await read(pathname)).headers.get("X-Robots-Tag"), /noindex/);
  const xml = await (await read("/sitemap.xml")).text();
  assert.match(xml, /<loc>https:\/\/stupid\.gifts\/gifts\/short-listing<\/loc>/);
  assert.match(xml, /<loc>https:\/\/stupid\.gifts\/gifts\/finite<\/loc>/);
  assert.doesNotMatch(xml, /held|\.html|preview|\?q=|expired/);
});
