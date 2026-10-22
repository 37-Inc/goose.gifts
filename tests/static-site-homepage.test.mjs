import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { giftGuides } from "../lib/gift-guide-definitions.ts";

const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const source = fs.readFileSync(new URL(`../static-site/${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } });
  const commonJs = { exports: {} };
  vm.runInNewContext(outputText, { module: commonJs, exports: commonJs.exports, AbortController,
    require: (name) => overrides[name] || require(name) });
  return commonJs.exports;
}

test("each published guide has an intentional, accessible line icon instead of a number or emoji", () => {
  const icon = load("components/Icon.tsx");
  const { GuideIcon, guideIcons } = load("components/GuideIcon.tsx", { "./Icon": icon });
  assert.deepEqual(Object.keys(guideIcons).sort(), giftGuides.map(({ slug }) => slug).sort());
  assert.ok(new Set(Object.values(guideIcons)).size >= 25);
  for (const guide of giftGuides) {
    const html = renderToStaticMarkup(GuideIcon({ slug: guide.slug }));
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.match(html, /stroke="currentColor"/);
    assert.match(html, /<path d="[^"]+"/);
    assert.doesNotMatch(html, /<text|\p{Extended_Pictographic}/u);
  }
});

test("real gift cards have no repeated collection label or Unicode arrow; fixtures stay clearly labeled", () => {
  const { ProductCard } = load("components/ProductCard.tsx", {
    "@/components/ProductImage": { ProductImage: () => null },
    "../lib/selection": { isIllustrative: () => false },
  });
  const product = { id: "owned-test", slug: "owned-test", source: "amazon", title: "Owned test gift",
    description: "Original editorial.", eligibleUntil: "2026-11-19T00:00:00.000Z", imageUrl: "/owned.svg",
    illustrative: false };
  const html = renderToStaticMarkup(ProductCard({ product }));
  assert.doesNotMatch(html, /The collection|class="eyebrow"|[↗→↓]/);
  assert.match(html, /View gift/);
  assert.match(renderToStaticMarkup(ProductCard({ product: { ...product, illustrative: true } })),
    /Illustrative fixture · not for sale/);
});

test("home is the browse destination with the approved heading and no redundant collection navigation", () => {
  const read = (name) => fs.readFileSync(new URL(`../static-site/${name}`, import.meta.url), "utf8");
  assert.match(read("app/page.tsx"), /Stupid gifts\. <span>Excellent taste\.<\/span>/);
  assert.doesNotMatch(read("app/page.tsx"), /Ridiculous gifts|well-considered collection|<span>0[123]<\/span>/);
  assert.doesNotMatch(read("app/layout.tsx"), /The collection|weird-gift-index|Search <span/);
  assert.doesNotMatch(read("components/CatalogFeed.tsx"), /More questionable|Full collection/);
  assert.match(read("components/CatalogFeed.tsx"), /Load more/);
});

test("Load more failure preserves visible gifts and the cursor for a successful retry", async () => {
  const initial = [{ id: "first", eligibleUntil: "2030-01-01T00:00:00.000Z" }];
  let state, calls = 0;
  const { CatalogFeed } = load("components/CatalogFeed.tsx", {
    react: { useEffect() {}, useRef: (value) => ({ current: value }),
      useState(value) { state = value; return [state, (update) => {
        state = typeof update === "function" ? update(state) : update;
      }]; } },
    "./ProductCard": { ProductCard: () => null },
    "../lib/analytics": { captureRenderedLists() {} },
    "../lib/card-shard": { async fetchCardShard() {
      if (++calls === 1) throw new Error("Temporary network failure");
      return { products: [{ id: "second", eligibleUntil: "2030-01-01T00:00:00.000Z" }], next: null };
    } },
  });
  const view = CatalogFeed({ initial, next: "/next.json", catalogRevision: "owned", version: "owned" });
  const button = view.props.children.find((child) => child?.type === "button");
  await button.props.onClick();
  assert.equal(state.products, initial);
  assert.equal(state.next, "/next.json");
  assert.equal(state.status, "unavailable");
  await button.props.onClick();
  assert.deepEqual(Array.from(state.products, ({ id }) => id), ["first", "second"]);
  assert.equal(state.next, null);
  assert.equal(state.status, "ready");
});
