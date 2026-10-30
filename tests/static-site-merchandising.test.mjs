import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createBrowseRelease, merchandisingEpoch, merchandisedBrowseProducts,
  rankedBrowseProducts, isHomepageRotationCandidate } from "../static-site/lib/browse.ts";
import homepage from "../content/homepage.json" with { type: "json" };
import { createStaticRoutes } from "../static-site/lib/asset-routes.ts";
import { createOgRelease } from "../static-site/lib/og.ts";
import { siteIdentity } from "../static-site/lib/site-identity.ts";
import { guides } from "../static-site/lib/guides.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../static-site/fixtures/catalog.snapshot.json", import.meta.url)));
const product = (id, title) => ({ ...fixture.products[0], id, title, slug: `gift-${id.toLowerCase()}`,
  qualityScore: 0.9, eligibleUntil: null });
const snapshot = () => ({ ...fixture,
  products: [...homepage.featuredIds.map((id, i) => product(id, `Funny anchor${i} figurine`)),
    ...Array.from({ length: 120 }, (_, i) => product(`rotation${i}`, `Funny oddity${i} statue`))],
  heldProducts: [], slugHistory: [],
});
const opening = (input, at) => merchandisedBrowseProducts(input, at).slice(0, 24);
const ids = (products) => products.map((item) => item.id);
const anchorIds = (products) => [0, 1, 4, 8, 13, 19].map((position) => products[position]?.id).filter(Boolean);

test("Pacific day and Monday week boundaries are explicit, including DST", () => {
  assert.equal(merchandisingEpoch("2026-11-02T07:59:59.999Z").day, "2026-11-01");
  const monday = merchandisingEpoch("2026-11-02T08:00:00.000Z");
  assert.equal(monday.day, "2026-11-02");
  assert.equal(monday.week, merchandisingEpoch("2026-11-02T07:59:59.999Z").week + 1);
  assert.deepEqual(merchandisingEpoch("2026-11-01T08:30:00.000Z"), merchandisingEpoch("2026-11-01T09:30:00.000Z"));
  assert.throws(() => merchandisingEpoch("not-a-time"), /Invalid merchandising/);
});

test("six anchors change weekly, quality-filtered exploration changes daily, repeated inputs are exact", () => {
  const input = snapshot(), before = JSON.stringify(input), base = ids(rankedBrowseProducts(input));
  const first = opening(input, "2026-10-29T16:00:00.000Z");
  assert.equal(first.length, 24);
  assert.deepEqual(ids(first), ids(opening(input, "2026-10-29T22:00:00.000Z")));
  assert.equal(anchorIds(first).length, 6);
  const nextDay = opening(input, "2026-10-30T16:00:00.000Z");
  assert.deepEqual(anchorIds(first), anchorIds(nextDay));
  assert.notDeepEqual(ids(first), ids(nextDay));
  assert.notDeepEqual(anchorIds(first), anchorIds(opening(input, "2026-11-02T16:00:00.000Z")));
  assert.deepEqual(ids(rankedBrowseProducts(input)), base);
  assert.equal(JSON.stringify(input), before);
});

test("all products remain reachable once, including non-homepage formats and family variants", () => {
  const input = snapshot();
  input.products.push(product("generic", "Funny Accountant T-Shirt"));
  input.products.push({ ...input.products[24], id: "variant", slug: "gift-variant" });
  const release = createBrowseRelease(input, "2026-10-29T16:00:00.000Z");
  const all = [...release.opening, ...release.feed.initial,
    ...release.shards.filter((shard) => shard.payload.kind === "feed").flatMap((shard) => shard.payload.products)];
  assert.deepEqual(ids(all).sort(), ids(input.products).sort());
  assert.equal(new Set(ids(all)).size, input.products.length);
  assert.equal(ids(all.slice(0, 24)).includes("generic"), false);
  assert.equal(ids(all.slice(0, 24)).includes("rotation0") && ids(all.slice(0, 24)).includes("variant"), false);
  assert.notEqual(release.version, createBrowseRelease(input, "2026-10-30T16:00:00.000Z").version);
});

test("brand-keyword stuffing and printed commodities do not qualify for rotating lead slots", () => {
  const asOf = new Date("2026-10-29T16:00:00.000Z");
  for (const title of ["Funny accountant mug", "Funny Halloween Socks", "Funny Poop Shirts", "Funny Animal Stickers",
    "Funny Dad Jokes Book", "Funny Toilet Bathroom Signs", "Funny Stress Cube Desk Toy", "Funny Cat Sleeping Mask", "Funny Poodle Plush Keychain",
    "Belly Fanny Pack Dad Bag", "Shart Survival Kit Funny Gift", "Happy Birthday Prank Toilet Paper", "Funny Duck Figurine Statue"]) {
    assert.equal(isHomepageRotationCandidate(product("test", title), asOf), false, title);
  }
  for (const title of ["Novelty Alligator Oven Mitt", "Funny Cat Butt Bottle Opener", "Funny Chicken Leg Socks", "Funny Toilet Mug"]) {
    assert.equal(isHomepageRotationCandidate(product("test", title), asOf), true, title);
  }
});

test("dated lead formats stay in the catalog while the opening avoids repetitive bodily gags", () => {
  const input = snapshot(), at = "2026-10-30T16:00:00.000Z";
  input.products[0] = product(homepage.featuredIds[0], "Belly Fanny Pack Dad Bag");
  input.products.push(product("kit", "Shart Survival Kit Funny Gift"));
  input.products.push(product("birthday", "Happy Birthday Prank Toilet Paper"));
  input.products.push(...Array.from({ length: 20 }, (_, i) => product(`poop${i}`, `Funny poop stress ball item${i}`)));
  const all = merchandisedBrowseProducts(input, at), first = all.slice(0, 24);
  assert.equal(first.some(p => [homepage.featuredIds[0], "kit", "birthday"].includes(p.id)), false);
  assert.ok(ids(all).includes(homepage.featuredIds[0]));
  assert.ok(ids(all).includes("kit"));assert.ok(ids(all).includes("birthday"));
  assert.ok(first.filter(p => /\bpoop\b/.test(p.title.toLowerCase())).length <= 1);
});

test("missing anchors and tiny or empty pools are safe and deterministic", () => {
  const input = snapshot();
  input.products = input.products.slice(0, 2);
  assert.equal(merchandisedBrowseProducts(input).length, 2);
  assert.equal(new Set(ids(merchandisedBrowseProducts(input))).size, 2);
  assert.deepEqual(merchandisedBrowseProducts({ ...input, products: [] }), []);
});

test("opening type diversity counts weekly anchors before adding rotation candidates", () => {
  const input = snapshot();
  input.products.push(...Array.from({ length: 20 }, (_, i) => product(`button${i}`, `Funny noise${i} sound button`)));
  for (const at of ["2026-10-29T16:00:00.000Z", "2026-10-30T16:00:00.000Z", "2026-11-02T16:00:00.000Z"])
    assert.ok(opening(input, at).filter((item) => /sound button/.test(item.title)).length <= 2);
});

test("HTML/JSON route policies bind the same release timestamp as the browse export", () => {
  const input = snapshot(), at = "2026-10-29T16:00:00.000Z";
  const browse = createBrowseRelease(input, at);
  const inventory = ["/index.html", "/random-gift.html", "/gift-guides.html", "/howie.html", "/preview/presentation.html",
    "/safe/catalog.html", "/safe/catalog.txt", "/safe/catalog.json", "/safe/product.html",
    "/safe/howie.html", "/safe/howie.txt", "/safe/presentation.html", "/safe/presentation.txt",
    ...guides.map((guide) => `/gift-guides/${guide.slug}.html`),
    ...input.products.map((item) => `/gifts/${item.slug}.html`),
    ...browse.shards.map((shard) => shard.path), ...createOgRelease(input, siteIdentity).byPath.keys()];
  const routes = createStaticRoutes(input, inventory, undefined, siteIdentity, at);
  assert.ok(routes[browse.random.poolPath]);
  for (const shard of browse.shards) assert.equal(routes[shard.path].eligibleUntil, shard.eligibleUntil);
  assert.throws(() => createStaticRoutes(input, inventory, undefined, siteIdentity, "2026-10-30T16:00:00.000Z"), /missing its HTML/);
});
