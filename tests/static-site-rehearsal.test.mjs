import assert from "node:assert/strict";
import test from "node:test";
import { selectShowPicks, SHOW_PICK_SLUGS, SHOW_PICK_COPY } from "../static-site/lib/show-rehearsal.ts";

const product = (slug, id, overrides = {}) => ({
  id, publicId: id, slug, title: `Gift ${id}`, description: "A gift.",
  imageUrl: "/owned.svg", affiliateUrl: "https://example.com/product", source: "amazon",
  currency: "USD", price: 0, isActive: true, qualityScore: 0.8, eligibleUntil: null, ...overrides,
});
const snapshot = (products) => ({
  schemaVersion: 1, dataKind: "catalog", catalogRevision: "test", generatedAt: "2026-10-26T00:00:00.000Z",
  products, heldProducts: [], slugHistory: [],
});

test("show picks are fixed, ordered, public products and have concise copy", () => {
  const products = SHOW_PICK_SLUGS.map((slug, i) => product(slug, String(i)));
  const selected = selectShowPicks(snapshot([...products].reverse()));
  assert.deepEqual(selected.map((p) => p.slug), [...SHOW_PICK_SLUGS]);
  for (const slug of SHOW_PICK_SLUGS) {
    assert.ok(SHOW_PICK_COPY[slug].title);
    assert.ok(SHOW_PICK_COPY[slug].description);
  }
});

test("an unavailable pick is omitted, not silently replaced by an unrehearsed product", () => {
  const products = SHOW_PICK_SLUGS.map((slug, i) => product(slug, String(i), i === 0 ? { isActive: false } : {}));
  products.push(product("not-rehearsed", "extra"));
  assert.deepEqual(selectShowPicks(snapshot(products)).map((p) => p.slug), SHOW_PICK_SLUGS.slice(1));
});
