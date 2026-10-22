import assert from "node:assert/strict";
import test from "node:test";
import {
  giftGuides,
  giftGuideFocusKeywordGroups,
} from "../lib/gift-guide-definitions.ts";
import { serializeJsonLd } from "../static-site/components/JsonLd.tsx";
import { createStaticRoutes } from "../static-site/lib/asset-routes.ts";
import { createBrowseRelease } from "../static-site/lib/browse.ts";
import { createOgRelease } from "../static-site/lib/og.ts";
import { siteIdentity } from "../static-site/lib/site-identity.ts";
import { selectGuideProducts, guideSchema } from "../static-site/lib/guides.ts";
import {
  directoryPages,
  directoryPath,
  directoryPage,
} from "../static-site/lib/directory.ts";

const generatedAt = "2026-10-20T00:00:00.000Z";
const until = "2026-10-21T00:00:00.000Z";
const product = (id, title, more = {}) => ({
  id,
  publicId: id,
  slug: `gift-${id}`,
  title,
  description: "Approved factual description.",
  imageUrl: "/owned.svg",
  affiliateUrl: "https://example.invalid/not-for-sale",
  source: "amazon",
  currency: "USD",
  price: 0,
  isActive: true,
  qualityScore: 0.8,
  eligibleUntil: until,
  ...more,
});
const snapshot = (products) => ({
  schemaVersion: 1,
  dataKind: "synthetic_fixture",
  catalogRevision: "test-r1",
  generatedAt,
  products,
  heldProducts: [
    {
      id: "held",
      slug: "held-secret-cat",
      title: "Gift currently unavailable",
    },
  ],
  slugHistory: [],
});

test("all 43 canonical guide definitions are unique, linked and remain pure", () => {
  assert.equal(giftGuides.length, 43);
  assert.equal(new Set(giftGuides.map((g) => g.slug)).size, 43);
  for (const guide of giftGuides) {
    assert.ok(giftGuideFocusKeywordGroups[guide.slug]?.length);
    for (const section of guide.editorialSections || []) {
      for (const link of section.links || [])
        assert.ok(giftGuides.some((g) => g.slug === link.slug));
    }
  }
});
test("guide membership needs every canonical title focus group, not generated tags or generic gift words", () => {
  const products = [
    product("generic", "Plain gift mug", {
      punnyTitle: "Funny cat fishing office prank",
      humorTags: ["cat", "fishing", "office-safe"],
    }),
    product("cat", "Funny Cat Bookmark Gag Gift"),
    product("office", "Office Prank Sound Button"),
    product("wrong", "Office Desk Organizer"),
    product("expired", "Cat Bookmark", { eligibleUntil: generatedAt }),
  ];
  const select = (slug) =>
    selectGuideProducts(
      snapshot(products),
      giftGuides.find((g) => g.slug === slug),
    );
  assert.deepEqual(
    select("cat-lover-gag-gifts").map((p) => p.id),
    ["cat"],
  );
  assert.deepEqual(
    select("office-prank-gifts").map((p) => p.id),
    ["office"],
  );
  assert.equal(select("funny-gifts-for-dads-who-fish").length, 0);
  assert.deepEqual(
    selectGuideProducts(
      snapshot([...products].reverse()),
      giftGuides.find((g) => g.slug === "office-prank-gifts"),
    ),
    select("office-prank-gifts"),
  );
});
test("membership uses whole words and existing conservative family deduplication", () => {
  const guide = giftGuides.find((g) => g.slug === "cat-lover-gag-gifts");
  const selected = selectGuideProducts(
    snapshot([
      product("a", "Cat Bookmark Black Novelty"),
      product("b", "Cat Bookmark Black Novelty", { qualityScore: 0.9 }),
      product("c", "Cathedral Garden Statue"),
    ]),
    guide,
  );
  assert.deepEqual(
    selected.map((p) => p.id),
    ["b"],
  );
});
test("directory covers all ready products exactly once, 24 per page, deterministic order and finite boundaries", () => {
  const input = snapshot(
    Array.from({ length: 49 }, (_, i) =>
      product(String(i).padStart(2, "0"), `Distinct object ${i}`),
    ),
  );
  const pages = directoryPages(input);
  assert.deepEqual(
    pages.map((p) => p.products.length),
    [24, 24, 1],
  );
  assert.equal(
    new Set(pages.flatMap((p) => p.products.map((p) => p.id))).size,
    49,
  );
  assert.equal(directoryPath(1), "/gifts");
  assert.equal(directoryPath(2), "/gifts/page/2");
  assert.equal(directoryPage(input, 4), undefined);
  assert.equal(directoryPage(input, 0), undefined);
  assert.deepEqual(
    directoryPages(snapshot([...input.products].reverse())),
    pages,
  );
  assert.equal(directoryPages(snapshot([])).length, 1);
});
test("guide schema lists exactly the rendered products and only explicit visible FAQs, without offers", () => {
  const guide = giftGuides.find((g) => g.slug === "cat-lover-gag-gifts");
  const selected = selectGuideProducts(
    snapshot([product("cat", "Funny Cat Bookmark")]),
    guide,
  );
  const schema = guideSchema(guide, selected);
  const list = schema["@graph"].find((s) => s["@type"] === "ItemList");
  assert.equal(list.numberOfItems, selected.length);
  assert.equal(list.itemListElement.length, selected.length);
  assert.equal(
    list.itemListElement[0].url,
    `${siteIdentity.origin}/gifts/gift-cat`,
  );
  assert.doesNotMatch(
    JSON.stringify(schema),
    /"Offer"|priceCurrency|live goose/,
  );
  assert.equal(
    schema["@graph"].some((s) => s["@type"] === "FAQPage"),
    Boolean(guide.faqs?.length),
  );
});
test("JSON-LD escapes script delimiters without changing its parsed values", () => {
  const data = { title: '</script><img src=x onerror="bad()">', text: "a < b" };
  const encoded = serializeJsonLd(data);
  assert.equal(encoded.includes("<"), false);
  assert.deepEqual(JSON.parse(encoded), data);
});
test("finite multipage routes and browse JSON inherit complete snapshot expiry", () => {
  const input = snapshot(
    Array.from({ length: 49 }, (_, i) =>
      product(
        String(i),
        `Unique ${i}`,
        i === 48 ? { eligibleUntil: "2026-10-20T12:00:00.000Z" } : {},
      ),
    ),
  );
  input.heldProducts = [];
  const paths = [
    "/index.html",
    "/random-gift.html",
    "/gift-guides.html",
    "/howie.html",
    "/preview/presentation.html",
    "/gifts.html",
    "/gifts/page/1.html",
    "/gifts/page/2.html",
    "/gifts/page/3.html",
    "/gifts/page/2.txt",
    "/gifts/page/2/__next.__PAGE__.txt",
    "/safe/catalog.html",
    "/safe/howie.html", "/safe/howie.txt", "/safe/presentation.html", "/safe/presentation.txt",
    "/safe/catalog.txt",
    "/safe/product.html",
    "/safe/catalog.json",
    ...createBrowseRelease(input).shards.map((shard) => shard.path),
    ...createOgRelease(input, siteIdentity).byPath.keys(),
    ...giftGuides.map((g) => `/gift-guides/${g.slug}.html`),
    ...input.products.map((p) => `/gifts/${p.slug}.html`),
  ];
  const routes = createStaticRoutes(input, paths);
  assert.equal(routes["/gifts/page/1"].indexable, false);
  assert.equal(
    routes["/gifts/page/2"].eligibleUntil,
    "2026-10-20T12:00:00.000Z",
  );
  assert.equal(
    routes["/gifts/page/2/__next.__PAGE__.txt"].safeAssetPath,
    "/safe/catalog.txt",
  );
  assert.equal(routes["/random-gift"].eligibleUntil,
    "2026-10-20T12:00:00.000Z");
  assert.equal(routes["/weird-gift-index"], undefined);
  assert.throws(() => createStaticRoutes(input, [...paths, "/weird-gift-index.html"]), /no freshness policy/);
  assert.equal(routes["/gifts/page/4"], undefined);
});
