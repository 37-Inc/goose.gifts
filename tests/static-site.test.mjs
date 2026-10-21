import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalogSnapshot } from "../lib/catalog/snapshot.ts";
import { createStaticRoutes } from "../static-site/lib/asset-routes.ts";
import { createBrowseRelease } from "../static-site/lib/browse.ts";
import { createOgRelease, ogPath } from "../static-site/lib/og.ts";
import { siteIdentity } from "../static-site/lib/site-identity.ts";
import { guides, selectGuideProducts } from "../static-site/lib/guides.ts";
import {
  directoryPages,
  directoryPath,
  directorySchema,
} from "../static-site/lib/directory.ts";
import {
  buildSnapshotIndex,
  snapshotIndexSchema,
} from "../static-site/lib/weird-index.ts";
import {
  eligiblePool,
  isIllustrative,
  nextRandomIndex,
} from "../static-site/lib/selection.ts";

const root = new URL("../static-site/", import.meta.url);
const fixture = JSON.parse(
  fs.readFileSync(new URL("fixtures/catalog.snapshot.json", root)),
);
const snapshot = validateCatalogSnapshot(
  fixture,
  new Date("2026-10-20T00:00:00.000Z"),
);
const builtSnapshotPath = new URL(
  "../build/stupid-gifts/catalog.snapshot.json",
  import.meta.url,
);
const artifactInput = fs.existsSync(builtSnapshotPath)
  ? builtSnapshotPath
  : process.env.CATALOG_SNAPSHOT_PATH;
const exportSnapshot = artifactInput
  ? validateCatalogSnapshot(JSON.parse(fs.readFileSync(artifactInput, "utf8")))
  : snapshot;
function files(directory, prefix = "") {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name), `${prefix}/${entry.name}`)
        : [`${prefix}/${entry.name}`],
    );
}
function schemas(html) {
  return [
    ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
  ].map((match) => JSON.parse(match[1]));
}

test("synthetic snapshot is immutable and never points to a real retailer", () => {
  assert.equal(snapshot.dataKind, "synthetic_fixture");
  assert.ok(Object.isFrozen(snapshot.products[0]));
  assert.ok(snapshot.products.every(isIllustrative));
  assert.equal(snapshot.heldProducts.length, 1);
  assert.equal(
    snapshot.products.some((product) => product.price !== 0),
    false,
  );
});
test("random is bounded, deadline-filtered, and cannot repeat immediately", () => {
  assert.equal(
    eligiblePool(
      Array.from({ length: 80 }, () => snapshot.products[0]),
      Date.parse(snapshot.generatedAt),
    ).length,
    48,
  );
  assert.equal(
    eligiblePool(snapshot.products, Date.parse("2026-11-20T00:00:00.000Z"))
      .length,
    0,
  );
  for (let count = 2; count < 50; count++)
    for (let current = 0; current < count; current++)
      for (const random of [0, 0.2, 0.99, 1]) {
        const next = nextRandomIndex(count, current, () => random);
        assert.notEqual(next, current);
        assert.ok(next >= 0 && next < count);
      }
  assert.equal(nextRandomIndex(1, 0), 0);
});
test(
  "every content-bearing export is guarded, including nested RSC payloads",
  { skip: !fs.existsSync(new URL("out/index.html", root)) },
  () => {
    const inventory = files(new URL("out/", root));
    const routes = createStaticRoutes(exportSnapshot, inventory);
    for (const asset of inventory.filter(
      (file) =>
        /\.(html|txt|json)$/.test(file) &&
        !/^\/(?:_next|safe|privacy|fonts|robots|404|_not-found)(?:[/\.]|$)/.test(
          file,
        ),
    )) {
      assert.ok(routes[asset], `missing ${asset}`);
      assert.ok(
        inventory.includes(routes[asset].safeAssetPath),
        `missing safe asset ${routes[asset].safeAssetPath}`,
      );
      assert.equal(routes[asset].indexable, false);
    }
    assert.equal(routes["/howie"].indexable, false);
    assert.equal(routes["/preview/presentation"].indexable, false);
    for (const held of exportSnapshot.heldProducts) {
      assert.equal(routes[held.path].state, "held");
      assert.equal(routes[`${held.path}.txt`].state, "held");
    }
    assert.equal(
      routes["/__next.__PAGE__.txt"].eligibleUntil,
      exportSnapshot.products.map((product) => product.eligibleUntil).sort()[0],
    );
    assert.throws(
      () => createStaticRoutes(exportSnapshot, [...inventory, "/orphan.txt"]),
      /no freshness policy/,
    );
  },
);
test(
  "related product deadline protects detail HTML and RSC too",
  { skip: !fs.existsSync(new URL("out/index.html", root)) },
  () => {
    const changed = structuredClone(exportSnapshot);
    const related = changed.products[Math.min(2, changed.products.length - 1)];
    related.eligibleUntil = "2026-10-21T00:00:00.000Z";
    const oldVersion = createBrowseRelease(exportSnapshot).version;
    const version = createBrowseRelease(changed).version;
    const previousOg = createOgRelease(exportSnapshot, siteIdentity);
    const nextOg = createOgRelease(changed, siteIdentity);
    const renamedOg = new Map(previousOg.cards.map((card) => [ogPath(card), ogPath(nextOg.cards.find((next) => next.subjectId === card.subjectId && next.kind === card.kind))]));
    const routes = createStaticRoutes(
      changed,
      files(new URL("out/", root)).map((file) =>
        renamedOg.get(file) || file.replace(`/catalog/${oldVersion}/`, `/catalog/${version}/`),
      ),
    );
    assert.equal(
      routes[`/gifts/${changed.products[0].slug}`].eligibleUntil,
      related.eligibleUntil,
    );
    assert.equal(
      routes[`/gifts/${changed.products[0].slug}.txt`].eligibleUntil,
      related.eligibleUntil,
    );
  },
);
test(
  "retained hub, directory, guide and sample-report artifacts match their one build snapshot",
  { skip: !fs.existsSync(new URL("out/index.html", root)) },
  () => {
    const hub = fs.readFileSync(new URL("out/gift-guides.html", root), "utf8");
    assert.equal(schemas(hub)[0].mainEntity.numberOfItems, 43);
    for (const guide of guides) {
      assert.ok(hub.includes(`href="/gift-guides/${guide.slug}"`));
      const html = fs.readFileSync(
        new URL(`out/gift-guides/${guide.slug}.html`, root),
        "utf8",
      );
      const selected = selectGuideProducts(exportSnapshot, guide);
      const graph = schemas(html)[0]["@graph"];
      const list = graph.find((item) => item["@type"] === "ItemList");
      assert.equal(list.numberOfItems, selected.length);
      assert.deepEqual(
        list.itemListElement.map((item) => new URL(item.url).pathname),
        selected.map((p) => `/gifts/${p.slug}`),
      );
      assert.equal(
        graph.some((item) => item["@type"] === "FAQPage"),
        Boolean(guide.faqs?.length),
      );
      if (!selected.length) assert.match(html, /No matching ready products/);
      for (const product of exportSnapshot.products)
        assert.equal(
          html.includes(`href="/gifts/${product.slug}"`),
          selected.some((p) => p.id === product.id),
        );
    }
    for (const page of directoryPages(exportSnapshot)) {
      const html = fs.readFileSync(
        new URL(`out${directoryPath(page.page)}.html`, root),
        "utf8",
      );
      assert.deepEqual(schemas(html)[0], directorySchema(page));
      for (const product of exportSnapshot.products)
        assert.equal(
          html.includes(`href="/gifts/${product.slug}"`),
          page.products.some((p) => p.id === product.id),
        );
    }
    const firstAlias = fs.readFileSync(
      new URL("out/gifts/page/1.html", root),
      "utf8",
    );
    assert.ok(firstAlias.includes(`rel="canonical" href="${siteIdentity.origin}/gifts"`));
    const report = fs.readFileSync(
      new URL("out/weird-gift-index.html", root),
      "utf8",
    );
    const data = JSON.parse(
      fs.readFileSync(new URL("out/weird-gift-index/data.json", root), "utf8"),
    );
    assert.deepEqual(data, buildSnapshotIndex(exportSnapshot));
    assert.deepEqual(schemas(report)[0], snapshotIndexSchema(data));
    assert.match(
      report,
      /not the complete production catalog|not a market trend/,
    );
    assert.match(report, /No price conclusions are reported/);
    for (const product of exportSnapshot.products) {
      for (const value of [
        product.title,
        product.slug,
        product.imageUrl,
        product.affiliateUrl,
      ])
        assert.equal(JSON.stringify(data).includes(value), false);
    }
  },
);
test(
  "initial browse/Random payloads stay small and their public JSON matches the release",
  { skip: !fs.existsSync(new URL("out/index.html", root)) },
  () => {
    const release = createBrowseRelease(exportSnapshot);
    const home = fs.readFileSync(new URL("out/index.html", root), "utf8");
    const random = fs.readFileSync(
      new URL("out/random-gift.html", root),
      "utf8",
    );
    const initial = new Set(
      [...release.opening, ...release.feed.initial].map((p) => p.slug),
    );
    for (const product of exportSnapshot.products) {
      assert.equal(
        home.includes(`href="/gifts/${product.slug}"`),
        initial.has(product.slug),
      );
      assert.equal(
        random.includes(product.slug),
        product.slug === release.random.initial?.slug,
      );
      assert.equal((home + random).includes(product.affiliateUrl), false);
    }
    assert.doesNotMatch(
      home + random,
      /affiliateUrl|editorialWriteup|sourceFacts|qualityScore/,
    );
    for (const shard of release.shards)
      assert.deepEqual(
        JSON.parse(fs.readFileSync(new URL(`out${shard.path}`, root), "utf8")),
        shard.payload,
      );
  },
);
test(
  "export has crawlable ordinary links, no analytics or product data in immutable JS",
  { skip: !fs.existsSync(new URL("out/index.html", root)) },
  () => {
    const html = fs.readFileSync(new URL("out/index.html", root), "utf8");
    assert.ok(
      html.includes(`href="/gifts/${exportSnapshot.products[0].slug}"`),
    );
    assert.match(html, /noindex/);
    assert.doesNotMatch(html, /\$0\.00|https:\/\/example\.invalid|as seen on/i);
    const routes = createStaticRoutes(exportSnapshot, files(new URL("out/", root)));
    for (const product of exportSnapshot.heldProducts) {
      const route = routes[product.path];
      assert.equal(route.state, "held");
      assert.equal(route.assetPath, "/safe/product.html");
      const held = fs.readFileSync(
        new URL(`out${route.assetPath}`, root),
        "utf8",
      );
      assert.doesNotMatch(held, /sourceFacts|"@type":"(?:Offer|Product)"|data-analytics-outbound|rel="canonical"/);
      for (const ready of exportSnapshot.products)
        assert.equal(held.includes(ready.imageUrl), false);
    }
    const safe = fs.readFileSync(
      new URL("out/safe/catalog.html", root),
      "utf8",
    );
    assert.match(safe, /id="catalog-search"/);
    assert.match(safe, /name="q"/);
    assert.match(safe, /action="\/" method="get"/);
    assert.doesNotMatch(safe, /paperweight|example\.invalid|\/illustrations\//);
    const preview = fs.readFileSync(
      new URL("out/preview/presentation.html", root),
      "utf8",
    );
    assert.doesNotMatch(preview, /fixture-paperweight|example\.invalid/);
    for (const product of exportSnapshot.products) {
      for (const value of [
        product.id,
        product.slug,
        product.imageUrl,
        product.affiliateUrl,
      ]) {
        assert.equal(
          safe.includes(value),
          false,
          "product content in safe fallback",
        );
        assert.equal(
          preview.includes(value),
          false,
          "product content in pending presentation",
        );
      }
    }
    const readyProduct = exportSnapshot.products[0];
    const detail = fs.readFileSync(
      new URL(`out/gifts/${readyProduct.slug}.html`, root),
      "utf8",
    );
    const random = fs.readFileSync(
      new URL("out/random-gift.html", root),
      "utf8",
    );
    if (exportSnapshot.dataKind === "catalog") {
      assert.match(
        detail.replace(/<[^>]*>/g, ""),
        /Check price on Amazon|Check price on Etsy/,
      );
      if (readyProduct.punnyTitle)
        assert.match(detail, /Retailer listing name/);
      assert.doesNotMatch(detail, /"@type":"Offer"|\$0\.00/);
      assert.ok(
        random
          .replace(/<[^>]*>/g, "")
          .includes(
            `${Math.min(48, exportSnapshot.products.length)} gifts in this versioned pool`,
          ),
      );
      for (const guide of guides) {
        const html = fs.readFileSync(
          new URL(`out/gift-guides/${guide.slug}.html`, root),
          "utf8",
        );
        const selected = new Set(
          selectGuideProducts(exportSnapshot, guide).map((p) => p.id),
        );
        for (const product of exportSnapshot.products) {
          assert.equal(
            html.includes(`href="/gifts/${product.slug}"`),
            selected.has(product.id),
            `incorrect membership in ${guide.slug}`,
          );
        }
      }
    }
    for (const file of files(new URL("out/_next/", root)).filter((file) =>
      file.endsWith(".js"),
    )) {
      const content = fs.readFileSync(
        new URL(`out/_next${file}`, root),
        "utf8",
      );
      assert.doesNotMatch(
        content,
        /G-6RR3HPR747|AW-17626116539|googletagmanager|fixture-paperweight|illustrative-very-official-paperweight|A very official paperweight|\/illustrations\/paperweight|example\.invalid\/not-for-sale|sourceFactsHash|POSTGRES_URL/,
      );
      for (const product of exportSnapshot.products) {
        for (const value of [
          product.id,
          product.slug,
          product.title,
          product.imageUrl,
          product.affiliateUrl,
        ])
          assert.equal(
            content.includes(value),
            false,
            `product data in ${file}`,
          );
      }
    }
  },
);
