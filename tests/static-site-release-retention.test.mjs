import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { assembleReleaseAssets, readPriorRelease, verifyRetainedAssets } from "../scripts/staging/retention.mts";
import { validateBuildContext } from "../scripts/staging/build.mts";
import { assetSha256 } from "../static-site/lib/retention.ts";
import { createBrowseRelease } from "../static-site/lib/browse.ts";
import { createOgRelease } from "../static-site/lib/og.ts";
import { guides } from "../static-site/lib/guides.ts";
import { directoryPages, directoryPath } from "../static-site/lib/directory.ts";
import { siteIdentityFor } from "../static-site/lib/site-identity.ts";
import { createSiteWorker } from "../workers/site/index.ts";
import { createReleaseIdentity } from "../scripts/staging/release-identity.mts";
import { validateCatalogSnapshot } from "../lib/catalog/snapshot.ts";

const owned = JSON.parse(readFileSync(new URL("../static-site/fixtures/catalog.snapshot.json", import.meta.url)));
const at = "2026-10-20T10:00:00.000Z";
const encode = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
function snapshot(revision) {
  return { ...owned, catalogRevision: revision, heldProducts: [], slugHistory: [],
    products: Array.from({ length: 60 }, (_, i) => ({ ...owned.products[0],
      id: `owned-study-${i}`, publicId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      title: `Owned fictional object ${i}`, slug: `owned-fictional-object-${i}` })) };
}
function context(input, prior = null) {
  return { schemaVersion: 1, sourceMode: "preview", releaseId: `release-${input.catalogRevision}`, codeSha: "a".repeat(40),
    catalogRevision: input.catalogRevision, catalogSnapshotSha256: assetSha256(encode(input)), generatedAt: at,
    vectorSyncWatermark: 0, priorReleaseId: prior?.releaseId ?? null, retainedManifestSha256: prior?.manifestSha256 ?? null };
}
function assets(input) {
  const pages = ["/", "/random-gift", "/gift-guides", "/weird-gift-index", "/howie", "/preview/presentation", "/gifts/page/1",
    ...guides.map((g) => `/gift-guides/${g.slug}`), ...directoryPages(input).map((p) => directoryPath(p.page)),
    ...input.products.map((p) => `/gifts/${p.slug}`)];
  const files = new Map(pages.map((p) => [p === "/" ? "/index.html" : `${p}.html`, encode("owned page")]));
  for (const p of ["/safe/catalog.html", "/safe/product.html", "/safe/howie.html", "/safe/presentation.html", "/safe/index.json"])
    files.set(p, encode("owned safe variant"));
  files.set("/safe/catalog.json", new Uint8Array(readFileSync(new URL("../static-site/public/safe/catalog.json", import.meta.url))));
  files.set("/safe/asset.txt", encode("Reload to use the current release."));
  files.set("/weird-gift-index/data.json", encode({ scope: "sample" }));
  for (const shard of createBrowseRelease(input).shards) files.set(shard.path, encode(shard.payload));
  for (const ogPath of createOgRelease(input, siteIdentityFor("preview")).byPath.keys()) files.set(ogPath, encode("owned PNG proof"));
  files.set(`/_next/static/chunks/${input.catalogRevision}.js`, encode('console.log("owned UI")'));
  files.set(`/_next/static/chunks/app/[slug]/${input.catalogRevision}.js`, encode('console.log("owned dynamic UI")'));
  return files;
}
function seal(input, ctx, current, prior = null) {
  const assembled = assembleReleaseAssets(input, current, ctx, prior);
  const fields = { ...ctx }; delete fields.retainedManifestSha256;
  const manifest = { ...fields, dataKind: input.dataKind, routes: assembled.routes, retention: assembled.retention,
    checksums: Object.fromEntries([...assembled.assets].map(([name, bytes]) => [name, assetSha256(bytes)])) };
  const manifestBytes = encode(manifest);
  return { ...assembled, manifest, releaseId: ctx.releaseId, manifestBytes,
    manifestSha256: assetSha256(manifestBytes), snapshotBytes: encode(input) };
}
function twoReleases() {
  const first = snapshot("first"), second = snapshot("second");
  const prior = seal(first, context(first), assets(first));
  const ctx = context(second, prior);
  return { first, second, prior, ctx, next: seal(second, ctx, assets(second), prior) };
}

test("retention requires an explicit independent prior digest, not just a prior release label", () => {
  const input = snapshot("first"), ctx = context(input);
  const now = new Date(at);
  assert.deepEqual(validateBuildContext(ctx, input, ctx.codeSha, ctx.catalogSnapshotSha256, now), ctx);
  const missing = { ...ctx }; delete missing.retainedManifestSha256;
  assert.throws(() => validateBuildContext(missing, input, ctx.codeSha, ctx.catalogSnapshotSha256, now));
  assert.throws(() => validateBuildContext({ ...ctx, retainedManifestSha256: "b".repeat(64) }, input, ctx.codeSha, ctx.catalogSnapshotSha256, now));
  assert.equal(validateBuildContext({ ...ctx, priorReleaseId: "prior-but-not-retained" }, input, ctx.codeSha, ctx.catalogSnapshotSha256, now).retainedManifestSha256, null);
});
test("sealed current inventory recomputes exact two-release files/policy and cannot relabel old shards as current", () => {
  const { second, prior, ctx, next } = twoReleases();
  verifyRetainedAssets(second, next.assets, next.manifest, ctx, prior);
  assert.equal(next.manifest.retention.priorManifestSha256, prior.manifestSha256);
  assert.deepEqual(next.manifest.retention.currentAssetPaths, [...assets(second).keys()].sort());
  const oldPath = createBrowseRelease(snapshot("first")).random.poolPath;
  assert.deepEqual(next.assets.get(oldPath), prior.assets.get(oldPath));
  for (const change of [
    (m) => { m.retention = null; },
    (m) => { m.retention.currentAssetPaths.reverse(); },
    (m) => { m.retention.currentAssetPaths.push(oldPath); m.retention.currentAssetPaths.sort(); },
    (m) => { m.routes[oldPath].retainedUntil = "2026-10-20T11:00:00.000Z"; },
    (m) => { m.routes[oldPath].indexable = true; },
  ]) {
    const altered = structuredClone(next.manifest); change(altered);
    assert.throws(() => verifyRetainedAssets(second, next.assets, altered, ctx, prior));
  }
  const tampered = new Map(next.assets); tampered.set(oldPath, encode("tampered old body"));
  assert.throws(() => verifyRetainedAssets(second, tampered, next.manifest, ctx, prior));
  const dropped = new Map(next.assets); dropped.delete(oldPath);
  assert.throws(() => verifyRetainedAssets(second, dropped, next.manifest, ctx, prior));
  const extra = new Map(next.assets); extra.set("/unknown.json", encode("unexpected"));
  assert.throws(() => verifyRetainedAssets(second, extra, next.manifest, ctx, prior));
});
test("owned current-path classification trusts clean builder provenance, not an attacker-resealed inventory", () => {
  const { second, prior, ctx, next } = twoReleases();
  const relabeled = structuredClone(next.manifest);
  const oldOwnedPath = "/_next/static/chunks/first.js";
  relabeled.retention.currentAssetPaths.push(oldOwnedPath);
  relabeled.retention.currentAssetPaths.sort();
  delete relabeled.routes[oldOwnedPath];
  // Explicit trust boundary, not an anti-tamper assertion: without rebuilding
  // source or an externally trusted post-build digest, owned regenerated and
  // merely relabeled byte-identical assets cannot be distinguished here.
  assert.doesNotThrow(() => verifyRetainedAssets(second, next.assets, relabeled, ctx, prior));
});
test("old clients can navigate shards/owned chunks, but Worker expiry/cache/noindex guards survive the overlap", async () => {
  const { first, second, prior, ctx, next } = twoReleases();
  let clock = Date.parse(at);
  const worker = createSiteWorker({ manifest: next.manifest, snapshot: second, now: () => clock });
  const env = { ENVIRONMENT: "production", ASSETS: { fetch: async (request) => {
    const bytes = next.assets.get(decodeURIComponent(new URL(request.url).pathname));
    return new Response(bytes, { status: bytes ? 200 : 404, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
  } } };
  const request = (p) => worker.fetch(new Request(`https://example.test${p}`), env);
  let cursor = createBrowseRelease(first).feed.next, count = 0;
  while (cursor) {
    const response = await request(cursor), body = await response.json();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control"), /max-age=300/);
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, follow");
    assert.equal(body.catalogRevision, first.catalogRevision);
    count += body.products.length; cursor = body.next;
  }
  assert.equal(count, 48);
  const oldPath = createBrowseRelease(first).random.poolPath;
  clock += 15 * 60000 - 1000;
  assert.match((await request(oldPath)).headers.get("Cache-Control"), /max-age=1,/);
  clock += 1000;
  const expired = await request(oldPath);
  assert.equal((await expired.json()).status, "unavailable");
  assert.equal(expired.headers.get("Cache-Control"), "no-store");
  assert.equal(expired.headers.get("X-Robots-Tag"), "noindex, follow");
  const ownedResponse = await request("/_next/static/chunks/first.js");
  assert.match(await ownedResponse.text(), /Reload/);
  assert.equal(ownedResponse.headers.get("Cache-Control"), "no-store");
  for (const p of ["/_next/static/chunks/app/[slug]/first.js", "/_next/static/chunks/app/%5Bslug%5D/first.js",
    "/_next/static/chunks/app/%5bslug%5d/first.js", "/_next/static/chunks/%66irst.js"]) {
    const response = await request(p);
    assert.match(await response.text(), /Reload/);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, follow");
  }
  assert.ok(!next.manifest.retention.currentAssetPaths.includes(oldPath));
  verifyRetainedAssets(second, next.assets, next.manifest, ctx, prior);
});
test("filesystem input is digest-pinned, bounded and cannot escape the explicit asset directory", async () => {
  const { prior, ctx } = twoReleases();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "goose-gifts-prior-"));
  try {
    const directory = path.join(temporary, "sealed");
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "asset-manifest.json"), prior.manifestBytes);
    await fs.writeFile(path.join(directory, "catalog.snapshot.json"), prior.snapshotBytes);
    for (const [name, bytes] of prior.assets) {
      const file = path.join(directory, "assets", name.slice(1));
      await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes);
    }
    const loaded = await readPriorRelease(ctx, directory);
    assert.equal(loaded.manifestSha256, ctx.retainedManifestSha256);
    assert.equal(loaded.assets.has("/index.html"), false);
    assert.ok(loaded.assets.has("/_next/static/chunks/first.js"));
    await assert.rejects(readPriorRelease({ ...ctx, retainedManifestSha256: null }, directory));
    await assert.rejects(readPriorRelease(ctx));
    await assert.rejects(readPriorRelease({ ...ctx, retainedManifestSha256: "0".repeat(64) }, directory));
    await assert.rejects(readPriorRelease({ ...ctx, priorReleaseId: "wrong-release" }, directory));
    const target = path.join(directory, "assets/_next/static/chunks/first.js");
    const outside = path.join(temporary, "outside.js"); await fs.writeFile(outside, prior.assets.get("/_next/static/chunks/first.js"));
    await fs.rm(target); await fs.symlink(outside, target);
    await assert.rejects(readPriorRelease(ctx, directory));
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
test("actual two-release builder/verifier retains guarded bytes and rejects resealed policy/input tampering", {
  skip: process.env.STATIC_SITE_BUILD_RETENTION_FIXTURE !== "1",
}, async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "goose-gifts-retention-build-"));
  const run = (script, env) => execFileSync(process.execPath, ["--import", "tsx", `scripts/staging/${script}.mts`], { cwd: root, env, stdio: "pipe" });
  const generated = path.join(root, "build/stupid-gifts");
  try {
    const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const build = async (input, prior = null) => {
      const source = path.join(temporary, "input.json"), contextPath = path.join(temporary, "context.json");
      const ctx = { ...context(input, prior), releaseId: `owned-retention-${randomUUID()}`, codeSha,
        generatedAt: new Date().toISOString(), catalogSnapshotSha256: assetSha256(encode(`${JSON.stringify(validateCatalogSnapshot(input))}\n`)) };
      await fs.writeFile(source, JSON.stringify(input)); await fs.writeFile(contextPath, JSON.stringify(ctx));
      const env = { ...process.env, CATALOG_SNAPSHOT_PATH: source, CATALOG_RELEASE_CONTEXT_PATH: contextPath,
        CATALOG_SITE_MODE: "preview", NEXT_PUBLIC_STATIC_SITE_MODE: "preview", NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED: "false",
        CATALOG_PRIOR_RELEASE_PATH: prior?.directory };
      run("build", env); run("verify-release", env);
      const manifestBytes = await fs.readFile(path.join(generated, "asset-manifest.json"));
      return { ctx, env, manifestBytes, manifest: JSON.parse(manifestBytes), releaseId: ctx.releaseId, manifestSha256: assetSha256(manifestBytes) };
    };
    const firstSnapshot = snapshot("actual-first");
    const first = await build(firstSnapshot);
    const directory = path.join(temporary, "sealed-prior"); await fs.mkdir(directory);
    for (const name of ["asset-manifest.json", "catalog.snapshot.json"]) await fs.copyFile(path.join(generated, name), path.join(directory, name));
    await fs.cp(path.join(root, "static-site/out"), path.join(directory, "assets"), { recursive: true });
    const marker = "/_next/static/stale-not-in-prior.js";
    await fs.writeFile(path.join(root, "static-site/out", marker), "stale build marker");
    const secondSnapshot = snapshot("actual-second");
    const heldCard = createBrowseRelease(firstSnapshot).shards[0].payload.products[0];
    secondSnapshot.products = secondSnapshot.products.filter((p) => p.id !== heldCard.id);
    const next = await build(secondSnapshot, { ...first, directory });
    assert.equal(next.manifest.retention.currentAssetPaths.includes(marker), false);
    await assert.rejects(fs.access(path.join(root, "static-site/out", marker)));
    const oldShards = createBrowseRelease(firstSnapshot).shards;
    const ready = oldShards.find((s) => next.manifest.routes[s.path].state === "ready");
    const held = oldShards.find((s) => next.manifest.routes[s.path].state === "held");
    assert.ok(ready); assert.ok(held);
    assert.deepEqual(await fs.readFile(path.join(root, "static-site/out", ready.path)), await fs.readFile(path.join(directory, "assets", ready.path)));
    await assert.rejects(fs.access(path.join(root, "static-site/out", held.path)));
    assert.equal(next.manifest.routes[held.path].safeAssetPath, "/safe/catalog.json");
    assert.ok(Object.keys(next.manifest.routes).some((p) => p.startsWith("/_next/static/") && next.manifest.routes[p].retainedUntil));
    const originalIdentity = await fs.readFile(path.join(generated, "release-identity.json"));
    const altered = structuredClone(next.manifest);
    altered.routes[ready.path].eligibleUntil = firstSnapshot.products[0].eligibleUntil;
    const alteredBytes = encode(`${JSON.stringify(altered, null, 2)}\n`);
    await fs.writeFile(path.join(generated, "asset-manifest.json"), alteredBytes);
    await fs.writeFile(path.join(generated, "release-identity.json"), JSON.stringify(createReleaseIdentity(alteredBytes)));
    const verify = spawnSync(process.execPath, ["--import", "tsx", "scripts/staging/verify-release.mts"], { cwd: root, env: next.env, encoding: "utf8" });
    assert.equal(verify.status, 1); assert.match(verify.stderr, /Retained release input/);
    await fs.writeFile(path.join(generated, "asset-manifest.json"), next.manifestBytes);
    await fs.writeFile(path.join(generated, "release-identity.json"), originalIdentity);
    const wrongPrior = spawnSync(process.execPath, ["--import", "tsx", "scripts/staging/verify-release.mts"], { cwd: root,
      env: { ...next.env, CATALOG_PRIOR_RELEASE_PATH: temporary }, encoding: "utf8" });
    assert.equal(wrongPrior.status, 1); assert.match(wrongPrior.stderr, /Retained release input/);
    run("verify-release", next.env);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
