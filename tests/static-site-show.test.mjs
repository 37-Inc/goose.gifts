import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateEpisodeManifest, assertEpisodePublishable } from "../content/show/manifest.ts";
import { createShowRelease } from "../static-site/lib/show.ts";
import { unavailableEpisode } from "../static-site/lib/episode-display.ts";
import { episodeQrSvg } from "../static-site/lib/episode-qr.ts";
import { createStaticRoutes } from "../static-site/lib/asset-routes.ts";
import { createBrowseRelease } from "../static-site/lib/browse.ts";
import { createOgRelease } from "../static-site/lib/og.ts";
import { siteIdentity } from "../static-site/lib/site-identity.ts";
import { directoryPages, directoryPath } from "../static-site/lib/directory.ts";
import { guides } from "../static-site/lib/guides.ts";
import { validateCatalogSnapshot } from "../lib/catalog/snapshot.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const owned = JSON.parse(fs.readFileSync(path.join(root, "static-site/fixtures/catalog.snapshot.json")));
// Controlled unit records only; never a source file or production publication.
const catalog = { ...owned, dataKind: "catalog" };
const missing = ["90000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000002"];
function fixtureEpisodes(snapshot) {
  return [{ schemaVersion: 1, key: "controlled-layout-fixture", status: "published",
    title: "Controlled layout fixture — not aired", episodeDate: "2026-10-19",
    ownerConfirmed: true, presentationAssetsApproved: true,
    slots: [
      { position: 1, productPublicId: snapshot.products[0].publicId,
        exactVariant: "Controlled exact variant record — not a real episode",
        caption: "A controlled layout fixture. No appearance or endorsement is claimed.", alternativePublicIds: [] },
      { position: 2, productPublicId: snapshot.heldProducts[0]?.publicId || missing[0],
        exactVariant: "Original unavailable fixture variant",
        caption: "A historical selection is not silently replaced.",
        alternativePublicIds: snapshot.products.slice(1, 3).map((p) => p.publicId) },
    ] }, { schemaVersion: 1, key: "controlled-archive-fixture", status: "published",
    title: "Controlled archive fixture — not aired", episodeDate: "2026-10-12",
    ownerConfirmed: true, presentationAssetsApproved: true,
    slots: missing.map((id, index) => ({ position: index + 1, productPublicId: id,
      exactVariant: `Immutable original fixture variant ${index + 1}`,
      caption: "Controlled archive record, not an actual appearance.", alternativePublicIds: [] })) }];
}
function inventory(snapshot, inputs = []) {
  const show = createShowRelease(snapshot, inputs);
  const pages = ["/", "/random-gift", "/gift-guides", "/weird-gift-index", "/howie", "/preview/presentation",
    ...guides.map((g) => `/gift-guides/${g.slug}`), ...directoryPages(snapshot).map((p) => directoryPath(p.page)),
    "/gifts/page/1", ...snapshot.products.map((p) => `/gifts/${p.slug}`), ...snapshot.heldProducts.map((p) => p.path),
    ...show.episodes.flatMap((e) => [`/howie/${e.key}`, `/howie/${e.key}/presentation`])];
  const safe = ["/safe/catalog", "/safe/product", "/safe/howie", "/safe/presentation",
    ...show.episodes.flatMap((e) => [`/safe/howie/${e.key}`, `/safe/howie/${e.key}/presentation`])];
  return [...new Set([
    ...pages.flatMap((p) => p === "/" ? ["/index.html", "/index.txt", "/__next.__PAGE__.txt"]
      : [`${p}.html`, `${p}.txt`, `${p}/__next.__PAGE__.txt`]),
    ...safe.flatMap((p) => [`${p}.html`, `${p}.txt`]), "/safe/catalog.json", "/safe/index.json", "/weird-gift-index/data.json",
    ...show.episodes.flatMap((e) => [`/howie/${e.key}/data.json`, `/safe/howie/${e.key}/data.json`]),
    ...createBrowseRelease(snapshot).shards.map((s) => s.path),
    ...createOgRelease(snapshot, siteIdentity).byPath.keys(),
  ])];
}
test("draft candidates can retain UUIDs but unapproved details never become display/presentation data", () => {
  const draft = { ...fixtureEpisodes(catalog)[0], status: "draft", episodeDate: null,
    ownerConfirmed: false, presentationAssetsApproved: false };
  draft.slots[0].productPublicId = missing[0];
  const validated = validateEpisodeManifest(draft, owned);
  assert.ok(Object.isFrozen(validated.slots[0]));
  assert.throws(() => assertEpisodePublishable(draft, catalog), /initial products/);
  const show = createShowRelease(owned, [draft]);
  assert.equal(show.latest, null);
  assert.equal(show.episodes.length, 0);
  assert.equal(show.preview.shareUrl, null);
  assert.equal(show.preview.eligibleUntil, null);
  assert.ok(show.preview.slots.every((s) => !s.primary && !s.originalPublicId && !s.exactVariant && !s.alternatives.length));
  assert.doesNotMatch(JSON.stringify(show), /controlled exact variant|ownerConfirmed|presentationAssetsApproved|Original unavailable/i);
  assert.equal(episodeQrSvg(show.preview), null);
});
test("published archives preserve primary identity, show only eligible labeled alternatives and omit approval/source-private fields", () => {
  const inputs = fixtureEpisodes(catalog);
  const show = createShowRelease(catalog, inputs);
  assert.equal(show.latest.key, inputs[0].key);
  assert.equal(show.latest.slots[0].primary.publicId, inputs[0].slots[0].productPublicId);
  assert.equal(show.latest.slots[1].originalPublicId, inputs[0].slots[1].productPublicId);
  assert.equal(show.latest.slots[1].primary, null);
  assert.deepEqual(show.latest.slots[1].alternatives.map((p) => p.publicId), inputs[0].slots[1].alternativePublicIds);
  assert.equal(show.episodes[1].slots[0].originalPublicId, missing[0]);
  assert.equal(show.episodes[1].slots[0].exactVariant, inputs[1].slots[0].exactVariant);
  assert.equal(show.episodes[1].eligibleUntil, null);
  assert.throws(() => assertEpisodePublishable(inputs[1], catalog), /not eligible/);
  assert.throws(() => createShowRelease(catalog, [inputs[0], inputs[0]]), /Duplicate episode key/);
  assert.doesNotMatch(JSON.stringify(show), /ownerConfirmed|presentationAssetsApproved|editorialWriteup|qualityScore|sourceFacts|alternativePublicIds|wittyDescription|"description"|"price"/);
  const safe = unavailableEpisode(show.latest);
  assert.equal(safe.slots[0].originalPublicId, show.latest.slots[0].originalPublicId);
  assert.equal(safe.slots[0].exactVariant, show.latest.slots[0].exactVariant);
  for (const product of catalog.products) {
    assert.equal(JSON.stringify(safe).includes(product.imageUrl), false);
    assert.equal(JSON.stringify(safe).includes(product.affiliateUrl), false);
    assert.equal(JSON.stringify(safe).includes(product.title), false);
  }
});
test("episode HTML/RSC/JSON and presentation inherit first displayed expiry; product-free archives remain stable", () => {
  const snapshot = structuredClone(catalog);
  snapshot.products[1].eligibleUntil = "2026-10-21T00:00:00.000Z";
  const inputs = fixtureEpisodes(snapshot);
  const routes = createStaticRoutes(snapshot, inventory(snapshot, inputs), inputs);
  for (const key of ["/howie", "/howie/controlled-layout-fixture", "/howie/controlled-layout-fixture/presentation"]) {
    for (const alias of [key, `${key}.html`, `${key}.txt`, `${key}/__next.__PAGE__.txt`]) {
      assert.equal(routes[alias].eligibleUntil, snapshot.products[1].eligibleUntil, alias);
      assert.match(routes[alias].safeAssetPath, /^\/safe\/howie/);
    }
  }
  assert.equal(routes["/howie/controlled-layout-fixture/data.json"].eligibleUntil, snapshot.products[1].eligibleUntil);
  assert.equal(routes["/howie/controlled-layout-fixture/data.json"].indexable, false);
  assert.equal(routes["/howie/controlled-archive-fixture"].eligibleUntil, null);
  assert.equal(routes["/howie/controlled-archive-fixture/presentation"].indexable, false);
  const empty = { ...snapshot, products: [] };
  const emptyRoutes = createStaticRoutes(empty, inventory(empty));
  assert.equal(emptyRoutes["/"].state, "held");
  assert.equal(emptyRoutes["/"].indexable, false);
  assert.equal(emptyRoutes["/index.txt"].safeAssetPath, "/safe/catalog.txt");
  assert.equal(emptyRoutes[createBrowseRelease(empty).random.poolPath].state, "held");
});
test("QR is deterministic local SVG for only the stable canonical page with coarse campaign fields", () => {
  const episode = createShowRelease(catalog, fixtureEpisodes(catalog)).latest;
  const url = new URL(episode.shareUrl);
  assert.equal(url.origin, siteIdentity.origin);
  assert.equal(url.pathname, `/howie/${episode.key}`);
  assert.deepEqual([...url.searchParams.keys()], ["utm_source", "utm_medium", "utm_campaign"]);
  assert.equal(url.searchParams.get("utm_campaign"), "episode_2026_10_19");
  const svg = episodeQrSvg(episode);
  assert.equal(svg, episodeQrSvg(episode));
  assert.match(svg, /^<svg/);
  assert.doesNotMatch(svg.replace('xmlns="http://www.w3.org/2000/svg"', ""), /<script|<image|href=|https?:/);
  assert.throws(() => episodeQrSvg({ ...episode, shareUrl: "https://amazon.com/dp/NOT-A-QR-TARGET" }), /QR target/);
});

function files(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? files(path.join(directory, e.name), `${prefix}/${e.name}`) : [`${prefix}/${e.name}`]);
}
function isolatedProject(name) {
  const project = path.join(root, `output/${name}/project`);
  fs.mkdirSync(project, { recursive: true });
  for (const item of ["static-site", "content", "lib", "components", "package.json", "tsconfig.json", "postcss.config.mjs", "tailwind.config.ts"])
    fs.cpSync(path.join(root, item), path.join(project, item), { recursive: true,
      filter: (file) => !/[\/](?:node_modules|out|\.next)(?:[\/]|$)/.test(file) });
  if (!fs.existsSync(path.join(project, "node_modules"))) fs.symlinkSync(fs.realpathSync(path.join(root, "node_modules")), path.join(project, "node_modules"), "dir");
  return project;
}
function build(project, source) {
  const snapshot = validateCatalogSnapshot(JSON.parse(fs.readFileSync(source, "utf8")));
  const context = path.join(project, "fixture-release-context.json");
  fs.writeFileSync(context, JSON.stringify({
    schemaVersion: 1, sourceMode: "preview", releaseId: `controlled-show-${randomUUID()}`,
    codeSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    catalogRevision: snapshot.catalogRevision,
    catalogSnapshotSha256: createHash("sha256").update(`${JSON.stringify(snapshot)}\n`).digest("hex"),
    generatedAt: new Date().toISOString(), vectorSyncWatermark: 0, priorReleaseId: null,
  }));
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "static-site", "--webpack"], {
      cwd: project, env: { ...process.env, CATALOG_SNAPSHOT_PATH: source,
        CATALOG_RELEASE_CONTEXT_PATH: context, NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED: "false" }, stdio: "pipe",
    });
  } catch (error) {
    throw new Error(`Isolated export failed: ${error.stdout?.toString()} ${error.stderr?.toString()}`);
  }
  return path.join(project, "static-site/out");
}
test("real empty publication exports no episode or candidate routes", { skip: !fs.existsSync(path.join(root, "static-site/out/howie.html")) }, () => {
  const published = JSON.parse(fs.readFileSync(path.join(root, "content/show/published.json")));
  if (published.length) return;
  assert.equal(files(path.join(root, "static-site/out")).some((p) => /^\/howie\/[^/]+\.html$/.test(p)), false);
  const html = fs.readFileSync(path.join(root, "static-site/out/howie.html"), "utf8");
  assert.match(html, /No episode selection has been published/);
  assert.doesNotMatch(html, /controlled-layout-fixture|Original exact variant|data-analytics-outbound/);
});

test("controlled isolated published export includes finite routes, safe companions and no product literals in JS", {
  skip: process.env.STATIC_SITE_BUILD_SHOW_FIXTURE !== "1",
}, () => {
  const source = process.env.CATALOG_SNAPSHOT_PATH;
  assert.ok(source, "Set an approved catalog snapshot for this isolated layout export");
  const snapshot = JSON.parse(fs.readFileSync(source, "utf8"));
  assert.equal(snapshot.dataKind, "catalog");
  assert.ok(snapshot.products.length >= 3);
  const project = isolatedProject("show-fixture");
  const inputs = fixtureEpisodes(snapshot);
  fs.writeFileSync(path.join(project, "content/show/published.json"), JSON.stringify(inputs));
  const out = build(project, source);
  const assets = files(out);
  const routes = createStaticRoutes(snapshot, assets, inputs);
  for (const episode of inputs) {
    const key = `/howie/${episode.key}`;
    for (const pathname of [key, `${key}/presentation`, `${key}/data.json`]) assert.ok(routes[pathname], pathname);
    const data = JSON.parse(fs.readFileSync(path.join(out, `${key}/data.json`)));
    assert.equal(data.key, episode.key);
    assert.doesNotMatch(JSON.stringify(data), /ownerConfirmed|presentationAssetsApproved|editorialWriteup|sourceFacts/);
  }
  for (const asset of assets.filter((p) => p.startsWith("/safe/howie/") && /\.(?:html|txt|json)$/.test(p)))
    for (const product of snapshot.products)
      for (const value of [product.title, product.imageUrl, product.affiliateUrl])
        assert.equal(fs.readFileSync(path.join(out, asset), "utf8").includes(value), false, `${asset} contains expired merchant text`);
  for (const asset of assets.filter((p) => p.startsWith("/_next/static/") && p.endsWith(".js"))) {
    const js = fs.readFileSync(path.join(out, asset), "utf8");
    for (const value of snapshot.products.flatMap((p) => [p.title, p.imageUrl, p.affiliateUrl])) assert.equal(js.includes(value), false);
    assert.doesNotMatch(js, /createSvgTag|G-6RR3HPR747|AW-17626116539/);
  }
});

test("controlled zero-ready export renders safe Home and marks feed/catalog entries unavailable/noindex", {
  skip: process.env.STATIC_SITE_BUILD_EMPTY_FIXTURE !== "1",
}, () => {
  const empty = { ...owned, dataKind: "catalog", products: [], slugHistory: [] };
  const project = isolatedProject("empty-fixture");
  fs.writeFileSync(path.join(project, "content/show/published.json"), "[]");
  const source = path.join(project, "empty.snapshot.json");
  fs.writeFileSync(source, JSON.stringify(empty));
  const out = build(project, source);
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.match(html, /The collection is being checked/);
  assert.doesNotMatch(html, /More questionable decisions|class="opening-grid"/);
  const routes = createStaticRoutes(empty, files(out));
  assert.equal(routes["/"].state, "held");
  assert.equal(routes["/"].indexable, false);
  assert.equal(routes["/__next.__PAGE__.txt"].state, "held");
  const shard = createBrowseRelease(empty).random.poolPath;
  assert.equal(routes[shard].state, "held");
  const payload = JSON.parse(fs.readFileSync(path.join(out, shard)));
  assert.equal(payload.status, "unavailable");
  assert.equal(payload.products.length, 0);
});
