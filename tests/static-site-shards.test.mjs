import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createBrowseRelease } from "../static-site/lib/browse.ts";
import {
  validateCardShard,
  fetchCardShard,
} from "../static-site/lib/card-shard.ts";

const fixture = JSON.parse(
  fs.readFileSync(
    new URL("../static-site/fixtures/catalog.snapshot.json", import.meta.url),
  ),
);
function largeFixture(count = 73) {
  return {
    ...fixture,
    catalogRevision: "owned-shard-test-73",
    products: Array.from({ length: count }, (_, index) => ({
      ...fixture.products[index % fixture.products.length],
      id: `owned-fixture-${index}`,
      publicId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      slug: `owned-fictional-object-${index}`,
      title: `Owned fictional study object ${index}`,
      punnyTitle: `An illustrative object ${index}`,
      description: "An owned design fixture, not an actual product for sale.",
      editorialWriteup: `Long owned fixture editorial ${index}. `.repeat(100),
    })),
    heldProducts: [],
    slugHistory: [],
  };
}
const expected = (release, shard) => ({
  catalogRevision: release.catalogRevision,
  version: release.version,
  kind: shard.payload.kind,
  now: Date.parse(fixture.generatedAt),
});

test("browse uses 3 hero + at most 9 initial cards, then deterministic 24-card shards", () => {
  const input = largeFixture();
  const release = createBrowseRelease(input);
  assert.equal(release.opening.length, 3);
  assert.equal(release.feed.initial.length, 9);
  const feed = release.shards.filter((shard) => shard.payload.kind === "feed");
  assert.deepEqual(
    feed.map((shard) => shard.payload.products.length),
    [24, 24, 13],
  );
  assert.equal(release.feed.next, feed[0].path);
  assert.equal(feed[0].payload.next, feed[1].path);
  assert.equal(feed.at(-1).payload.next, null);
  const all = [
    ...release.opening,
    ...release.feed.initial,
    ...feed.flatMap((shard) => shard.payload.products),
  ];
  assert.equal(new Set(all.map((p) => p.id)).size, input.products.length);
  assert.deepEqual(
    all.map((p) => p.id),
    input.products.map((p) => p.id),
  );
  assert.deepEqual(createBrowseRelease(structuredClone(input)), release);
});
test("Random initial payload is one card; its lazy pool is bounded to 48", () => {
  const release = createBrowseRelease(largeFixture());
  const random = release.shards.find(
    (shard) => shard.payload.kind === "random",
  );
  assert.equal(release.random.initial.id, release.opening[0].id);
  assert.equal(release.random.poolSize, 48);
  assert.equal(random.payload.products.length, 48);
  assert.equal(release.random.poolPath, random.path);
  assert.equal(random.payload.next, null);
  assert.equal("products" in release.random, false);
});
test("card projection is explicit, price/retailer/editorial/private fields never ship", () => {
  const input = largeFixture();
  input.products[0].sourceFacts = "private-record-must-not-ship";
  const release = createBrowseRelease(input);
  const card = release.opening[0];
  assert.deepEqual(
    Object.keys(card).sort(),
    [
      "id",
      "slug",
      "title",
      "description",
      "imageUrl",
      "eligibleUntil",
      "punnyTitle",
      "wittyDescription",
      "illustrative",
    ].sort(),
  );
  assert.equal(card.illustrative, true);
  assert.doesNotMatch(
    JSON.stringify(release),
    /affiliateUrl|editorialWriteup|sourceFacts|qualityScore|publicId|currency|humorTags|private-record-must-not-ship|Long owned fixture editorial/,
  );
  const changed = structuredClone(input);
  changed.products[0].sourceFacts = "different private field";
  assert.equal(createBrowseRelease(changed).version, release.version);
  changed.products[0].title += " changed";
  assert.notEqual(createBrowseRelease(changed).version, release.version);
});
test("held/expired records are absent and each shard expires at its own first content deadline", () => {
  const input = largeFixture();
  input.products[15].eligibleUntil = "2026-10-21T00:00:00.000Z";
  input.products.push({
    ...input.products[0],
    id: "expired-secret",
    slug: "expired-secret",
    eligibleUntil: input.generatedAt,
  });
  input.heldProducts.push({ id: "held-secret", slug: "held-secret" });
  const release = createBrowseRelease(input);
  const feed = release.shards.filter((shard) => shard.payload.kind === "feed");
  assert.equal(feed[0].eligibleUntil, "2026-10-21T00:00:00.000Z");
  assert.equal(feed[1].eligibleUntil, fixture.products[0].eligibleUntil);
  assert.doesNotMatch(JSON.stringify(release), /expired-secret|held-secret/);
});
test("client rejects fallback, mixed release, extra fields, duplicate identities and expiry", () => {
  const release = createBrowseRelease(largeFixture());
  const shard = release.shards[0];
  const options = expected(release, shard);
  assert.deepEqual(validateCardShard(shard.payload, options), shard.payload);
  for (const changed of [
    { ...shard.payload, status: "unavailable" },
    { ...shard.payload, catalogRevision: "another-release" },
    { ...shard.payload, version: "a".repeat(64) },
    { ...shard.payload, sourceFacts: "private" },
    {
      ...shard.payload,
      products: [...shard.payload.products, shard.payload.products[0]],
    },
    {
      ...shard.payload,
      products: [
        {
          ...shard.payload.products[0],
          affiliateUrl: "https://example.invalid/not-for-sale",
        },
      ],
    },
    { ...shard.payload, next: "https://untrusted.invalid/feed.json" },
  ])
    assert.throws(() => validateCardShard(changed, options), /unavailable/);
  assert.throws(
    () =>
      validateCardShard(shard.payload, {
        ...options,
        now: Date.parse(shard.eligibleUntil),
      }),
    /unavailable/,
  );
});
test("an empty/expired-all source is unavailable, not a successful empty pool", () => {
  const input = largeFixture(0);
  const release = createBrowseRelease(input);
  assert.equal(release.random.initial, undefined);
  assert.equal(release.random.poolSize, 0);
  assert.equal(release.feed.next, null);
  assert.equal(release.shards[0].payload.status, "unavailable");
});
test("fetch forwards cancellation and checks expiry after response parsing", async () => {
  const release = createBrowseRelease(largeFixture());
  const shard = release.shards[0];
  const { now: initialNow, ...options } = expected(release, shard);
  const originalFetch = globalThis.fetch,
    originalNow = Date.now;
  const controller = new AbortController();
  let clock = initialNow;
  try {
    Date.now = () => clock;
    globalThis.fetch = async (_url, init) => {
      assert.ok(init.signal instanceof AbortSignal);
      return {
        ok: true,
        json: async () => {
          clock = Date.parse(shard.eligibleUntil);
          return shard.payload;
        },
      };
    };
    await assert.rejects(
      fetchCardShard(shard.path, options, controller.signal),
      /unavailable/,
    );
    controller.abort();
    globalThis.fetch = async (_url, init) => {
      assert.ok(init.signal.aborted);
      throw new DOMException("Canceled", "AbortError");
    };
    await assert.rejects(
      fetchCardShard(shard.path, options, controller.signal),
      { name: "AbortError" },
    );
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
test("a stalled response body times out promptly and releases caller listeners", async () => {
  const release = createBrowseRelease(largeFixture());
  const shard = release.shards[0];
  const options = expected(release, shard);
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  let listeners = 0,
    linked;
  controller.signal.addEventListener = (...args) => {
    listeners++;
    return add(...args);
  };
  controller.signal.removeEventListener = (...args) => {
    listeners--;
    return remove(...args);
  };
  try {
    globalThis.fetch = async (_url, { signal }) => {
      linked = signal;
      return { ok: true, json: () => new Promise(() => {}) };
    };
    await assert.rejects(
      fetchCardShard(shard.path, options, controller.signal, 5),
      /unavailable/,
    );
    assert.equal(linked.aborted, true);
    assert.equal(listeners, 0);
    assert.equal(controller.signal.aborted, false);
    const canceled = fetchCardShard(shard.path, options, controller.signal);
    await Promise.resolve();
    controller.abort();
    await assert.rejects(canceled, { name: "AbortError" });
    assert.equal(linked.aborted, true);
    assert.equal(listeners, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test(
  "large owned-fixture export keeps initial HTML/RSC bounded and all JSON guarded",
  { skip: process.env.STATIC_SITE_BUILD_SHARD_FIXTURE !== "1" },
  () => {
    const root = path.resolve(import.meta.dirname, "..");
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "goose-gifts-shards-"),
    );
    const input = path.join(directory, "catalog.snapshot.json");
    const snapshot = largeFixture();
    fs.writeFileSync(input, JSON.stringify(snapshot));
    try {
      execFileSync(
        process.execPath,
        [
          "node_modules/next/dist/bin/next",
          "build",
          "static-site",
          "--webpack",
        ],
        {
          cwd: root,
          env: { ...process.env, CATALOG_SNAPSHOT_PATH: input },
          stdio: "pipe",
        },
      );
      const release = createBrowseRelease(snapshot);
      const out = path.join(root, "static-site/out");
      const home = fs.readFileSync(path.join(out, "index.html"), "utf8");
      const random = fs.readFileSync(
        path.join(out, "random-gift.html"),
        "utf8",
      );
      for (const product of snapshot.products.slice(12))
        assert.equal(home.includes(product.slug), false);
      for (const product of snapshot.products.slice(1))
        assert.equal(random.includes(product.slug), false);
      assert.doesNotMatch(
        home + random,
        /Long owned fixture editorial|not-for-sale|affiliateUrl/,
      );
      for (const shard of release.shards)
        assert.deepEqual(
          JSON.parse(fs.readFileSync(path.join(out, shard.path), "utf8")),
          shard.payload,
        );
      const inventory = fs
        .readdirSync(out, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map(
          (e) =>
            `/${path.relative(out, path.join(e.parentPath, e.name)).split(path.sep).join("/")}`,
        );
      // Importing the mapper does not read a catalog or provider itself.
      return import("../static-site/lib/asset-routes.ts").then(
        ({ createStaticRoutes }) => {
          const routes = createStaticRoutes(snapshot, inventory);
          for (const shard of release.shards) {
            assert.equal(routes[shard.path].eligibleUntil, shard.eligibleUntil);
            assert.equal(
              routes[shard.path].safeAssetPath,
              "/safe/catalog.json",
            );
            assert.equal(routes[shard.path].indexable, false);
          }
          for (const file of inventory.filter(
            (f) => f.startsWith("/_next/") && f.endsWith(".js"),
          ))
            assert.doesNotMatch(
              fs.readFileSync(path.join(out, file), "utf8"),
              /Owned fictional study object|owned-fictional-object|Long owned fixture editorial/,
            );
        },
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
