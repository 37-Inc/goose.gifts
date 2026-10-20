import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalogSnapshot } from "../lib/catalog/snapshot.ts";
import { createStaticRoutes } from "../static-site/lib/asset-routes.ts";
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
    const routes = createStaticRoutes(snapshot, inventory);
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
    assert.equal(routes["/gifts/illustrative-held-selection"].state, "held");
    assert.equal(
      routes["/gifts/illustrative-held-selection.txt"].state,
      "held",
    );
    assert.equal(
      routes["/__next.__PAGE__.txt"].eligibleUntil,
      snapshot.products[0].eligibleUntil,
    );
    assert.throws(
      () => createStaticRoutes(snapshot, [...inventory, "/orphan.txt"]),
      /no freshness policy/,
    );
  },
);
test(
  "related product deadline protects detail HTML and RSC too",
  { skip: !fs.existsSync(new URL("out/index.html", root)) },
  () => {
    const changed = structuredClone(snapshot);
    changed.products[2].eligibleUntil = "2026-10-21T00:00:00.000Z";
    const routes = createStaticRoutes(changed, files(new URL("out/", root)));
    assert.equal(
      routes["/gifts/illustrative-very-official-paperweight"].eligibleUntil,
      changed.products[2].eligibleUntil,
    );
    assert.equal(
      routes["/gifts/illustrative-very-official-paperweight.txt"].eligibleUntil,
      changed.products[2].eligibleUntil,
    );
  },
);
test(
  "export has crawlable ordinary links, no analytics or product data in immutable JS",
  { skip: !fs.existsSync(new URL("out/index.html", root)) },
  () => {
    const html = fs.readFileSync(new URL("out/index.html", root), "utf8");
    assert.match(
      html,
      /href="\/gifts\/illustrative-very-official-paperweight"/,
    );
    assert.match(html, /noindex/);
    assert.doesNotMatch(html, /\$0\.00|https:\/\/example\.invalid|as seen on/i);
    const held = fs.readFileSync(
      new URL("out/gifts/illustrative-held-selection.html", root),
      "utf8",
    );
    assert.doesNotMatch(held, /paperweight\.svg|sourceFacts|Offer/);
    const safe = fs.readFileSync(
      new URL("out/safe/catalog.html", root),
      "utf8",
    );
    assert.doesNotMatch(safe, /paperweight|example\.invalid|\/illustrations\//);
    const preview = fs.readFileSync(
      new URL("out/preview/presentation.html", root),
      "utf8",
    );
    assert.doesNotMatch(preview, /fixture-paperweight|example\.invalid/);
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
    }
  },
);
